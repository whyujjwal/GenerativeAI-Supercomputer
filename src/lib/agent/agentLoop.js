import { findSkillInBrief, listSkillsForPrompt } from './skills.js';

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
   * @param {{ provider: import('./llmProvider.js').LLMProvider, registry: ReturnType<import('./tools.js').buildToolRegistry>, onEvent?: (event: Object) => void, maxIterations?: number, confirmPlan?: (plan: { text: string, toolCalls: import('./llmProvider.js').ToolCall[] }) => Promise<boolean>, memory?: import('./memory.js').MemoryStore, skills?: Array<Object> }} options
   */
  constructor({ provider, registry, onEvent, maxIterations = DEFAULT_MAX_ITERATIONS, confirmPlan, memory, skills }) {
    this.provider = provider;
    this.registry = registry;
    this.onEvent = onEvent || (() => {});
    this.maxIterations = maxIterations;
    this.confirmPlan = confirmPlan;
    this.memory = memory || null;
    this.skills = skills || null;
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
    let effectiveBrief = brief;
    let system = buildSystemPrompt(this.registry.definitions);

    if (this.skills) {
      const skillLines = listSkillsForPrompt();
      if (skillLines) {
        system += `\n\nAvailable skills (user may invoke with /trigger prefix):\n${skillLines}`;
      }
      const match = findSkillInBrief(brief);
      if (match) {
        system = `${match.skill.guidance}\n\n${system}`;
        effectiveBrief = match.rest || brief;
      }
    }

    if (this.memory) {
      system += this.memory.buildMemoryContext();
      const existing = this.memory.getWorking();
      this.memory.setWorking({
        brief: effectiveBrief,
        lastPlan: existing?.lastPlan,
        generatedAssets: [],
        brain: existing?.brain,
      });
    }

    /** @type {import('./llmProvider.js').NormalizedMessage[]} */
    const messages = [{ role: 'user', content: effectiveBrief }];
    let lastText = null;
    let planConfirmed = false;
    let cancelled = false;
    /** @type {Array<{ tool: string, model?: string, args?: Object }>} */
    const episodeSteps = [];
    /** @type {string[]} */
    const episodeAssets = [];

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
        if (this.memory && !cancelled) {
          const working = this.memory.getWorking();
          this.memory.addEpisode({
            brief: effectiveBrief,
            brain: working?.brain,
            steps: episodeSteps,
            assets: episodeAssets,
          });
          this.memory.clearWorking();
        }
        return { text: text || lastText, messages };
      }

      if (this.confirmPlan && !planConfirmed) {
        const approved = await this.confirmPlan({ text: text || '', toolCalls });
        planConfirmed = true;
        if (!approved) {
          cancelled = true;
          this._emit({ type: 'cancelled' });
          if (this.memory) {
            this.memory.clearWorking();
          }
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
        if (this.memory) {
          const working = this.memory.getWorking() || {};
          this.memory.setWorking({ ...working, brief: effectiveBrief, lastPlan: text });
        }
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

        episodeSteps.push({
          tool: tc.name,
          model: tc.args?.model,
          args: tc.args,
        });
        if (toolResult?.ok && toolResult.url) {
          episodeAssets.push(toolResult.url);
          if (this.memory) {
            const working = this.memory.getWorking() || {};
            const generatedAssets = [...(working.generatedAssets || [])];
            generatedAssets.push({
              kind: tc.name,
              url: toolResult.url,
            });
            this.memory.setWorking({ ...working, brief: effectiveBrief, generatedAssets });
          }
        }

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
    if (this.memory && !cancelled) {
      const working = this.memory.getWorking();
      this.memory.addEpisode({
        brief: effectiveBrief,
        brain: working?.brain,
        steps: episodeSteps,
        assets: episodeAssets,
      });
      this.memory.clearWorking();
    }
    return { text: lastText, messages };
  }
}
