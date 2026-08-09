import { randomUUID } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10 * 60_000;

/**
 * @param {unknown} content
 */
const textFromContent = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
};

/**
 * Convert OpenAI chat messages + tools into Anthropic Messages API body.
 * @param {{
 *   modelID: string,
 *   body: Record<string, unknown>,
 * }} input
 */
export const openaiBodyToAnthropic = ({ modelID, body }) => {
  const messagesIn = Array.isArray(body.messages) ? body.messages : [];
  /** @type {unknown[]} */
  const systemParts = [];
  /** @type {object[]} */
  const messages = [];

  for (const raw of messagesIn) {
    if (!raw || typeof raw !== 'object') continue;
    const role = raw.role;
    if (role === 'system' || role === 'developer') {
      const text = textFromContent(raw.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (role === 'assistant') {
      /** @type {object[]} */
      const content = [];
      const text = textFromContent(raw.content);
      if (text) content.push({ type: 'text', text });
      if (Array.isArray(raw.tool_calls)) {
        for (const call of raw.tool_calls) {
          if (!call || typeof call !== 'object') continue;
          const id = typeof call.id === 'string' ? call.id : randomUUID();
          const name = call.function?.name || call.name;
          if (typeof name !== 'string' || !name) continue;
          let input = {};
          const args = call.function?.arguments ?? call.arguments;
          if (typeof args === 'string' && args.trim()) {
            try {
              input = JSON.parse(args);
            } catch {
              input = { raw: args };
            }
          } else if (args && typeof args === 'object') {
            input = args;
          }
          content.push({ type: 'tool_use', id, name, input });
        }
      }
      if (content.length === 0) content.push({ type: 'text', text: '' });
      messages.push({ role: 'assistant', content });
      continue;
    }

    if (role === 'tool') {
      const toolCallId = typeof raw.tool_call_id === 'string' ? raw.tool_call_id : '';
      const text = textFromContent(raw.content);
      // Anthropic expects user messages that wrap tool_result blocks.
      const last = messages[messages.length - 1];
      const toolResult = {
        type: 'tool_result',
        tool_use_id: toolCallId || 'tool',
        content: text,
      };
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(toolResult);
      } else {
        messages.push({ role: 'user', content: [toolResult] });
      }
      continue;
    }

    // user (and anything else)
    const text = textFromContent(raw.content);
    messages.push({ role: 'user', content: text || '' });
  }

  /** @type {object[]} */
  const tools = [];
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (!tool || typeof tool !== 'object') continue;
      const fn = tool.function && typeof tool.function === 'object' ? tool.function : tool;
      const name = typeof fn.name === 'string' ? fn.name : '';
      if (!name) continue;
      tools.push({
        name,
        description: typeof fn.description === 'string' ? fn.description : '',
        input_schema: fn.parameters && typeof fn.parameters === 'object'
          ? fn.parameters
          : { type: 'object', properties: {} },
      });
    }
  }

  /** @type {Record<string, unknown>} */
  const out = {
    model: modelID,
    max_tokens: Number(body.max_tokens) > 0
      ? Number(body.max_tokens)
      : (Number(body.max_completion_tokens) > 0 ? Number(body.max_completion_tokens) : 8192),
    messages,
    stream: false,
  };
  if (systemParts.length) {
    out.system = systemParts.join('\n\n');
  }
  if (tools.length) {
    out.tools = tools;
  }
  if (body.tool_choice && body.tool_choice !== 'auto') {
    if (body.tool_choice === 'none') {
      out.tool_choice = { type: 'none' };
    } else if (body.tool_choice === 'required') {
      out.tool_choice = { type: 'any' };
    } else if (typeof body.tool_choice === 'object' && body.tool_choice?.function?.name) {
      out.tool_choice = { type: 'tool', name: body.tool_choice.function.name };
    }
  }
  return out;
};

/**
 * @param {object} anthropicPayload
 * @param {string} modelID
 */
export const anthropicResponseToOpenai = (anthropicPayload, modelID) => {
  const contentBlocks = Array.isArray(anthropicPayload?.content) ? anthropicPayload.content : [];
  const text = contentBlocks
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  const toolUses = contentBlocks.filter((part) => part?.type === 'tool_use');
  /** @type {object} */
  const message = {
    role: 'assistant',
    content: text || null,
  };
  if (toolUses.length) {
    message.tool_calls = toolUses.map((part) => ({
      id: typeof part.id === 'string' ? part.id : randomUUID(),
      type: 'function',
      function: {
        name: part.name,
        arguments: JSON.stringify(part.input ?? {}),
      },
    }));
  }
  let finishReason = 'stop';
  if (anthropicPayload?.stop_reason === 'tool_use') finishReason = 'tool_calls';
  else if (anthropicPayload?.stop_reason === 'max_tokens') finishReason = 'length';

  return {
    id: typeof anthropicPayload?.id === 'string' ? anthropicPayload.id : `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelID,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
  };
};

/**
 * Emit a non-stream OpenAI completion as SSE chunks (for clients that requested stream).
 * @param {import('node:http').ServerResponse} res
 * @param {object} completion
 */
export const writeOpenaiCompletionAsSse = (res, completion) => {
  const choice = completion?.choices?.[0];
  const message = choice?.message || {};
  const id = completion.id || `chatcmpl_${randomUUID()}`;
  const model = completion.model || 'unknown';
  const created = completion.created || Math.floor(Date.now() / 1000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const write = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  if (typeof message.content === 'string' && message.content) {
    write({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant', content: message.content }, finish_reason: null }],
    });
  } else {
    write({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    });
  }

  if (Array.isArray(message.tool_calls)) {
    for (let index = 0; index < message.tool_calls.length; index += 1) {
      const call = message.tool_calls[index];
      write({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index,
              id: call.id,
              type: 'function',
              function: {
                name: call.function?.name,
                arguments: call.function?.arguments || '',
              },
            }],
          },
          finish_reason: null,
        }],
      });
    }
  }

  write({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: choice?.finish_reason || 'stop' }],
  });
  res.write('data: [DONE]\n\n');
  res.end();
};

/**
 * Forward an OpenAI-format chat completion through the resolved upstream.
 *
 * @param {{
 *   upstream: {
 *     kind: 'openai-compatible' | 'anthropic',
 *     modelID: string,
 *     baseURL: string,
 *     headers: Record<string, string>,
 *     anonymous?: boolean,
 *   },
 *   body: Record<string, unknown>,
 *   res: import('node:http').ServerResponse,
 *   signal?: AbortSignal,
 * }} input
 */
export const forwardChatCompletions = async ({ upstream, body, res, signal }) => {
  const wantStream = body.stream === true;
  // Force the job model — never trust the child-supplied model id for billing/auth scope.
  const modelID = upstream.modelID;

  if (upstream.kind === 'anthropic') {
    const anthropicBody = openaiBodyToAnthropic({ modelID, body });
    const response = await fetch(`${upstream.baseURL.replace(/\/+$/, '')}/messages`, {
      method: 'POST',
      headers: upstream.headers,
      body: JSON.stringify(anthropicBody),
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(text || JSON.stringify({ error: { message: 'Anthropic upstream failed' } }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Anthropic returned invalid JSON' } }));
      return;
    }
    const completion = anthropicResponseToOpenai(payload, modelID);
    if (wantStream) {
      writeOpenaiCompletionAsSse(res, completion);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(completion));
    return;
  }

  // openai-compatible: inject auth + forced model; stream by piping when possible.
  const trimmedBase = upstream.baseURL.replace(/\/+$/, '');
  const forwardBody = {
    ...body,
    model: modelID,
  };

  const response = await fetch(`${trimmedBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Accept: wantStream ? 'text/event-stream' : 'application/json',
      ...upstream.headers,
    },
    body: JSON.stringify(forwardBody),
    signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    if (
      upstream.anonymous
      && (response.status === 401 || response.status === 403)
    ) {
      res.end(JSON.stringify({
        error: {
          message: 'OpenCode Zen rejected this free-model request without an API key. Connect OpenCode Zen or pick a logged-in API provider.',
          code: 'no-provider-login',
        },
      }));
      return;
    }
    res.end(errText || JSON.stringify({ error: { message: 'Upstream chat completion failed' } }));
    return;
  }

  if (wantStream && response.body) {
    res.writeHead(200, {
      'Content-Type': response.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
    return;
  }

  const payloadText = await response.text();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(payloadText);
};
