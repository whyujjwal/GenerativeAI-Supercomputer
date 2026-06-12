import { runWithTools } from './providers.js';

const DEFAULT_MAX_ITERATIONS = 16;

/**
 * @param {Array<{ name: string, description: string }>} toolDefinitions
 */
export function buildBaseSystemPrompt(toolDefinitions) {
  const toolList = toolDefinitions.map((t) => `- ${t.name}: ${t.description}`).join('\n');

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
 * @param {{ brief: string, system: string, registry: { definitions: Array<Object>, handlers: Record<string, Function> }, providerCfg: { provider: string, model?: string, keys: Object }, maxIterations?: number }} params
 * @returns {Promise<{ text: string|null, assets: string[], steps: Array<Object> }>}
 */
export async function runAgentLoop({
  brief,
  system,
  registry,
  providerCfg,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}) {
  const messages = [{ role: 'user', content: brief }];
  let lastText = null;
  const assets = [];
  const steps = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const result = await runWithTools({
      provider: providerCfg.provider,
      model: providerCfg.model,
      system,
      messages,
      tools: registry.definitions,
      keys: providerCfg.keys,
    });

    const { text, toolCalls } = result;
    if (text) {
      lastText = text;
    }

    if (!toolCalls?.length) {
      return { text: text || lastText, assets, steps };
    }

    messages.push({
      role: 'assistant',
      content: text || '',
      toolCalls,
    });

    for (const tc of toolCalls) {
      const handler = registry.handlers[tc.name];
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

      steps.push({
        tool: tc.name,
        model: tc.args?.model,
        args: tc.args,
        result: toolResult,
      });

      if (toolResult?.ok && toolResult.url) {
        assets.push(toolResult.url);
      }

      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return { text: lastText, assets, steps };
}
