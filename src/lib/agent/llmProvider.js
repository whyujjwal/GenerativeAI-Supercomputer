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

/**
 * OpenAI Chat Completions API provider (browser-direct).
 */
export class OpenAIProvider extends LLMProvider {
  /**
   * @param {{ model?: string, apiKey?: string }} [options]
   */
  constructor({ model = 'gpt-5.2', apiKey } = {}) {
    super();
    this.model = model;
    this._apiKey = apiKey;
  }

  getApiKey() {
    if (this._apiKey) return this._apiKey;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('openai_key');
      if (stored) return stored;
    }
    throw new Error(
      'OpenAI API key missing. Set localStorage openai_key or pass apiKey to OpenAIProvider.'
    );
  }

  /**
   * @param {NormalizedTool[]} tools
   */
  _toOpenAITools(tools) {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * @param {NormalizedMessage[]} messages
   */
  _toOpenAIMessages(messages) {
    const out = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        out.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
        continue;
      }

      if (msg.role === 'assistant') {
        if (msg.toolCalls?.length) {
          const entry = {
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args || {}),
              },
            })),
          };
          out.push(entry);
        } else {
          out.push({ role: 'assistant', content: msg.content });
        }
        continue;
      }

      out.push({ role: msg.role, content: msg.content });
    }

    return out;
  }

  /**
   * @param {RunWithToolsParams} params
   * @returns {Promise<LLMResult>}
   */
  async runWithTools({ system, messages, tools }) {
    const apiMessages = [{ role: 'system', content: system }, ...this._toOpenAIMessages(messages)];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: apiMessages,
        tools: this._toOpenAITools(tools),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message || {};
    const text = message.content || '';
    const toolCalls = [];

    for (const tc of message.tool_calls || []) {
      if (tc.type !== 'function') continue;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        args = {};
      }
      toolCalls.push({
        id: tc.id,
        name: tc.function?.name || '',
        args,
      });
    }

    return {
      text: text.trim(),
      toolCalls,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }
}

/**
 * Google Gemini generateContent API provider (browser-direct).
 */
export class GeminiProvider extends LLMProvider {
  /**
   * @param {{ model?: string, apiKey?: string }} [options]
   */
  constructor({ model = 'gemini-3.1-pro', apiKey } = {}) {
    super();
    this.model = model;
    this._apiKey = apiKey;
  }

  getApiKey() {
    if (this._apiKey) return this._apiKey;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('gemini_key');
      if (stored) return stored;
    }
    throw new Error(
      'Gemini API key missing. Set localStorage gemini_key or pass apiKey to GeminiProvider.'
    );
  }

  /**
   * @param {NormalizedTool[]} tools
   */
  _toGeminiTools(tools) {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  /**
   * @param {NormalizedMessage[]} messages
   */
  _toGeminiContents(messages) {
    const contents = [];
    /** @type {Map<string, string>} */
    const toolNamesById = new Map();

    for (const msg of messages) {
      if (msg.role === 'tool') {
        const name = (msg.toolCallId && toolNamesById.get(msg.toolCallId)) || 'tool';
        let result = msg.content;
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed && typeof parsed === 'object') {
            result = parsed;
          }
        } catch {
          // keep raw string
        }
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name, response: { result } } }],
        });
        continue;
      }

      if (msg.role === 'assistant') {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.toolCalls || []) {
          if (tc.id) toolNamesById.set(tc.id, tc.name);
          parts.push({ functionCall: { name: tc.name, args: tc.args || {} } });
        }
        if (parts.length) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }

      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    }

    return contents;
  }

  /**
   * @param {RunWithToolsParams} params
   * @returns {Promise<LLMResult>}
   */
  async runWithTools({ system, messages, tools }) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.getApiKey())}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        tools: this._toGeminiTools(tools),
        contents: this._toGeminiContents(messages),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let text = '';
    const toolCalls = [];
    let toolIndex = 0;

    for (const part of parts) {
      if (part.text) {
        text += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: `gemini-${toolIndex}`,
          name: part.functionCall.name || '',
          args: part.functionCall.args || {},
        });
        toolIndex += 1;
      }
    }

    return {
      text: text.trim(),
      toolCalls,
      finishReason: candidate?.finishReason || 'unknown',
    };
  }
}

/** @type {Array<{ id: string, label: string, keyStorageKey: string, defaultModel: string }>} */
export const PROVIDERS = [
  {
    id: 'claude',
    label: 'Claude',
    keyStorageKey: 'anthropic_key',
    defaultModel: 'claude-opus-4-8',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyStorageKey: 'openai_key',
    defaultModel: 'gpt-5.2',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    keyStorageKey: 'gemini_key',
    defaultModel: 'gemini-3.1-pro',
  },
];

/**
 * @param {'claude'|'openai'|'gemini'} [name]
 * @param {{ model?: string, apiKey?: string }} [options]
 * @returns {LLMProvider}
 */
export function createProvider(name = 'claude', options = {}) {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(options);
    case 'gemini':
      return new GeminiProvider(options);
    case 'claude':
    default:
      return new ClaudeProvider(options);
  }
}
