const DEFAULT_MAX_ITERATIONS = 16;

/**
 * @param {Array<{ name: string, description: string }>} toolDefinitions
 */
function buildSystemPrompt(toolDefinitions) {
  const toolList = toolDefinitions
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  return `You are the creative agent for the GenerativeAI Supercomputer — an agentic studio that plans and executes multi-step generative workflows (images, videos, lipsync) using hosted models.

Available tools:
${toolList}

Protocol — follow this on every brief:
1. PLAN: Break the user's brief into ordered steps. Pick the best model id per step (call list_models first if you are unsure).
2. CONFIRM: State the plan clearly (steps, models, and what each tool will do) before executing.
3. EXECUTE: Emit tool calls to run generation steps. Reuse URLs from prior tool results as inputs to later steps.
4. REVIEW: After each batch of tool results, inspect outcomes. Retry or adjust parameters on failure; continue until the brief is satisfied.

Rules:
- Always use real model ids from list_models — never invent ids.
- Prefer the smallest number of tool calls that fulfill the brief.
- When a tool returns { ok: false }, explain the error and retry with corrected args or a different model.
- Deliver a concise final summary with links to generated assets when done.`;
}

/**
 * Provider-agnostic agent orchestration loop.
 */
export class Agent {
  /**
   * @param {{ provider: import('./llmProvider.js').LLMProvider, registry: ReturnType<import('./tools.js').buildToolRegistry>, onEvent?: (event: Object) => void, maxIterations?: number, confirmPlan?: (plan: { text: string, toolCalls: import('./llmProvider.js').ToolCall[] }) => Promise<boolean> }} options
   */
  constructor({ provider, registry, onEvent, maxIterations = DEFAULT_MAX_ITERATIONS, confirmPlan }) {
    this.provider = provider;
    this.registry = registry;
    this.onEvent = onEvent || (() => {});
    this.maxIterations = maxIterations;
    this.confirmPlan = confirmPlan;
  }

  /**
   * @param {Object} event
   */
  _emit(event) {
    this.onEvent(event);
  }

  /**
   * @param {string} brief
   * @returns {Promise<{ text: string|null, messages: import('./llmProvider.js').NormalizedMessage[] }>}
   */
  async run(brief) {
    const system = buildSystemPrompt(this.registry.definitions);
    /** @type {import('./llmProvider.js').NormalizedMessage[]} */
    const messages = [{ role: 'user', content: brief }];
    let lastText = null;
    let planConfirmed = false;

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      let result;
      try {
        result = await this.provider.runWithTools({
          system,
          messages,
          tools: this.registry.definitions,
        });
      } catch (error) {
        const message = error.message || String(error);
        this._emit({ type: 'error', message });
        throw error;
      }

      const { text, toolCalls } = result;
      if (text) {
        lastText = text;
      }

      if (!toolCalls?.length) {
        if (text) {
          this._emit({ type: 'assistant', text });
        }
        this._emit({ type: 'done', text: text || lastText });
        return { text: text || lastText, messages };
      }

      if (this.confirmPlan && !planConfirmed) {
        const approved = await this.confirmPlan({ text: text || '', toolCalls });
        planConfirmed = true;
        if (!approved) {
          this._emit({ type: 'cancelled' });
          return { text: text || lastText, messages };
        }
      } else {
        this._emit({
          type: 'plan',
          text: text || '',
          toolCalls,
          iteration,
        });
      }

      if (text) {
        this._emit({ type: 'assistant', text });
      }

      messages.push({
        role: 'assistant',
        content: text || '',
        toolCalls,
      });

      for (const tc of toolCalls) {
        this._emit({
          type: 'tool_start',
          id: tc.id,
          name: tc.name,
          args: tc.args,
        });

        const handler = this.registry.handlers[tc.name];
        let toolResult;

        if (!handler) {
          toolResult = { ok: false, error: `Unknown tool: ${tc.name}` };
        } else {
          try {
            toolResult = await handler(tc.args || {});
          } catch (error) {
            toolResult = { ok: false, error: error.message || String(error) };
          }
        }

        this._emit({
          type: 'tool_result',
          id: tc.id,
          name: tc.name,
          result: toolResult,
        });

        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    const message = `Agent loop stopped after ${this.maxIterations} iterations`;
    this._emit({ type: 'error', message });
    this._emit({ type: 'done', text: lastText });
    return { text: lastText, messages };
  }
}
