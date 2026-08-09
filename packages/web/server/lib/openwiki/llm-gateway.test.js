import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./llm-upstream.js', () => ({
  resolveLlmUpstreamAsync: vi.fn(async () => ({
    kind: 'openai-compatible',
    providerID: 'openai',
    modelID: 'gpt-test',
    baseURL: 'https://example.test/v1',
    headers: {
      authorization: 'Bearer real-secret',
      'content-type': 'application/json',
    },
  })),
}));

vi.mock('./llm-chat.js', async () => {
  const actual = await vi.importActual('./llm-chat.js');
  return {
    ...actual,
    forwardChatCompletions: vi.fn(async ({ res, body }) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl_test',
        choices: [{ message: { role: 'assistant', content: `echo:${body.messages?.[0]?.content || ''}` } }],
      }));
    }),
  };
});

import { forwardChatCompletions } from './llm-chat.js';
import { startOpenWikiLlmGateway, stopOpenWikiLlmGateway } from './llm-gateway.js';

afterEach(async () => {
  await stopOpenWikiLlmGateway('D:\\wiki-gateway-test');
  vi.clearAllMocks();
});

describe('startOpenWikiLlmGateway', () => {
  it('rejects bad tokens and accepts the job token', async () => {
    const gateway = await startOpenWikiLlmGateway({
      directory: 'D:\\wiki-gateway-test',
      model: { providerID: 'openai', modelID: 'gpt-test' },
    });

    const denied = await fetch(`${gateway.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(denied.status).toBe(401);

    const ok = await fetch(`${gateway.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(ok.status).toBe(200);
    const payload = await ok.json();
    expect(payload.choices[0].message.content).toBe('echo:hi');
    expect(forwardChatCompletions).toHaveBeenCalled();

    await stopOpenWikiLlmGateway('D:\\wiki-gateway-test');

    const afterClose = await fetch(`${gateway.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    }).catch((error) => error);
    expect(afterClose).toBeInstanceOf(Error);
  });
});
