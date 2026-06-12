/**
 * Node-native LLM providers — mirrors client llmProvider.js with injected keys.
 */

const DEFAULT_MODELS = {
  claude: 'claude-opus-4-8',
  openai: 'gpt-5.2',
  gemini: 'gemini-3.1-pro',
};

function resolveKey(provider, keys) {
  const map = {
    claude: keys?.anthropic,
    openai: keys?.openai,
    gemini: keys?.gemini,
  };
  const key = map[provider];
  if (!key) {
    throw new Error(`${provider} API key missing. Set the corresponding server env var for scheduled runs.`);
  }
  return key;
}

function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function toAnthropicMessages(messages) {
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

function toOpenAITools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toOpenAIMessages(messages) {
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
        out.push({
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
        });
      } else {
        out.push({ role: 'assistant', content: msg.content });
      }
      continue;
    }

    out.push({ role: msg.role, content: msg.content });
  }

  return out;
}

function toGeminiTools(tools) {
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

function toGeminiContents(messages) {
  const contents = [];
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

async function runClaude({ model, system, messages, tools, apiKey }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.claude,
      max_tokens: 4096,
      system,
      messages: toAnthropicMessages(messages),
      tools: toAnthropicTools(tools),
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

async function runOpenAI({ model, system, messages, tools, apiKey }) {
  const apiMessages = [{ role: 'system', content: system }, ...toOpenAIMessages(messages)];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.openai,
      messages: apiMessages,
      tools: toOpenAITools(tools),
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

async function runGemini({ model, system, messages, tools, apiKey }) {
  const resolvedModel = model || DEFAULT_MODELS.gemini;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      tools: toGeminiTools(tools),
      contents: toGeminiContents(messages),
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

/**
 * @param {{ provider: 'claude'|'openai'|'gemini', model?: string, system: string, messages: Array<Object>, tools: Array<Object>, keys: { anthropic?: string, openai?: string, gemini?: string } }} params
 * @returns {Promise<{ text: string, toolCalls: Array<{ id: string, name: string, args: Object }>, finishReason: string }>}
 */
export async function runWithTools({ provider, model, system, messages, tools, keys }) {
  const apiKey = resolveKey(provider, keys);

  switch (provider) {
    case 'openai':
      return runOpenAI({ model, system, messages, tools, apiKey });
    case 'gemini':
      return runGemini({ model, system, messages, tools, apiKey });
    case 'claude':
    default:
      return runClaude({ model, system, messages, tools, apiKey });
  }
}

export { DEFAULT_MODELS };
