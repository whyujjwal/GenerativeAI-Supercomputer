/**
 * Swappable LLM brain abstraction for the agent loop.
 *
 * @typedef {Object} NormalizedMessage
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {string} [toolCallId]
 * @property {Array<{ id: string, name: string, args: Object }>} [toolCalls]
 */

/**
 * @typedef {Object} NormalizedTool
 * @property {string} name
 * @property {string} description
 * @property {Object} parameters JSON Schema
 */

/**
 * @typedef {Object} ToolCall
 * @property {string} id
 * @property {string} name
 * @property {Object} args
 */

/**
 * @typedef {Object} LLMResult
 * @property {string} text
 * @property {ToolCall[]} toolCalls
 * @property {string} finishReason
 */

/**
 * @typedef {Object} RunWithToolsParams
 * @property {string} system
 * @property {NormalizedMessage[]} messages
 * @property {NormalizedTool[]} tools
 */

/**
 * Base provider interface. Subclasses implement runWithTools().
 * Future: OpenAIProvider, GeminiProvider.
 */
export class LLMProvider {
    /**
     * @param {RunWithToolsParams} _params
     * @returns {Promise<LLMResult>}
     */
    async runWithTools(_params) {
        throw new Error('LLMProvider.runWithTools() must be implemented by subclass');
    }
}

/**
 * Anthropic Messages API provider (browser-direct).
 */
export class ClaudeProvider extends LLMProvider {
  /**
   * @param {{ model?: string, apiKey?: string }} [options]
   */
  constructor({ model = 'claude-opus-4-8', apiKey } = {}) {
    super();
    this.model = model;
    this._apiKey = apiKey;
  }

  getApiKey() {
    if (this._apiKey) return this._apiKey;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('anthropic_key');
      if (stored) return stored;
    }
    throw new Error(
      'Anthropic API key missing. Set localStorage anthropic_key or pass apiKey to ClaudeProvider.'
    );
  }

  /**
   * @param {NormalizedTool[]} tools
   */
  _toAnthropicTools(tools) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  /**
   * @param {NormalizedMessage[]} messages
   */
  _toAnthropicMessages(messages) {
    const out = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'tool') {
        const blocks = [];
        while (i < messages.length && messages[i].role === 'tool') {
          const toolMsg = messages[i];
          blocks.push({
            type: 'tool_result',
            tool_use_id: toolMsg.toolCallId,
            content: toolMsg.content,
          });
          i += 1;
        }
        out.push({ role: 'user', content: blocks });
        continue;
      }

      if (msg.role === 'assistant') {
        if (msg.toolCalls?.length) {
          const content = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.args || {},
            });
          }
          out.push({ role: 'assistant', content });
        } else {
          out.push({ role: 'assistant', content: msg.content });
        }
      } else {
        out.push({ role: 'user', content: msg.content });
      }

      i += 1;
    }

    return out;
  }

  /**
   * @param {RunWithToolsParams} params
   * @returns {Promise<LLMResult>}
   */
  async runWithTools({ system, messages, tools }) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.getApiKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system,
        messages: this._toAnthropicMessages(messages),
        tools: this._toAnthropicTools(tools),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    let text = '';
    const toolCalls = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input || {},
        });
      }
    }

    return {
      text: text.trim(),
      toolCalls,
      finishReason: data.stop_reason || 'unknown',
    };
  }
}
