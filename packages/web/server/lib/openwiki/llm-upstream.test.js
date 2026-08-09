import { beforeEach, describe, expect, it, vi } from 'vitest';

const readAuthFile = vi.fn(() => ({}));
const readConfig = vi.fn(() => ({}));
const resolveProviderLogin = vi.fn(() => null);

vi.mock('../opencode/auth.js', () => ({
  readAuthFile: (...args) => readAuthFile(...args),
}));
vi.mock('../opencode/shared.js', () => ({
  readConfig: (...args) => readConfig(...args),
}));
vi.mock('../small-model/call.js', () => ({
  resolveProviderLogin: (...args) => resolveProviderLogin(...args),
  ensureFreshOpenaiOauth: async (entry) => entry,
  extractChatgptAccountIdFromToken: () => null,
  getCopilotEndpoint: async () => 'chat',
  CODEX_RESPONSES_ENDPOINT: 'https://chatgpt.com/backend-api/codex/responses',
  OPENCHAMBER_LLM_USER_AGENT: 'opencode/1.0 openchamber',
}));
vi.mock('../small-model/catalog.js', () => ({
  getCatalogProvider: (_catalog, providerID) => {
    if (providerID === 'openrouter') return { api: 'https://openrouter.ai/api/v1' };
    return null;
  },
  getModelCatalog: async () => ({}),
}));

import {
  canUseOpenWikiGatewayModel,
  isLikelyFreeOpenCodeModel,
  resolveLlmUpstream,
} from './llm-upstream.js';

describe('isLikelyFreeOpenCodeModel', () => {
  it('detects free-tier ids', () => {
    expect(isLikelyFreeOpenCodeModel('big-pickle')).toBe(true);
    expect(isLikelyFreeOpenCodeModel('minimax-m2.5-free')).toBe(true);
    expect(isLikelyFreeOpenCodeModel('claude-sonnet-4')).toBe(false);
  });
});

describe('resolveLlmUpstream', () => {
  beforeEach(() => {
    readAuthFile.mockReset().mockReturnValue({});
    readConfig.mockReset().mockReturnValue({});
    resolveProviderLogin.mockReset().mockReturnValue(null);
  });

  it('allows anonymous zen for free models', () => {
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'opencode', modelID: 'big-pickle' },
    });
    expect(upstream.anonymous).toBe(true);
    expect(upstream.baseURL).toContain('opencode.ai/zen');
    expect(upstream.headers.authorization).toBeUndefined();
  });

  it('uses zen API key when present', () => {
    resolveProviderLogin.mockReturnValue({ type: 'api', key: 'zen-key' });
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'opencode', modelID: 'claude-sonnet-4' },
    });
    expect(upstream.anonymous).toBeFalsy();
    expect(upstream.headers.authorization).toBe('Bearer zen-key');
  });

  it('maps anthropic to anthropic kind', () => {
    resolveProviderLogin.mockReturnValue({ type: 'api', key: 'anth-key' });
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'anthropic', modelID: 'claude-opus-4' },
    });
    expect(upstream.kind).toBe('anthropic');
    expect(upstream.headers['x-api-key']).toBe('anth-key');
  });

  it('canUse mirrors resolve success', () => {
    expect(canUseOpenWikiGatewayModel({
      directory: 'D:\\repo',
      model: { providerID: 'opencode', modelID: 'big-pickle' },
    })).toBe(true);
    expect(canUseOpenWikiGatewayModel({
      directory: 'D:\\repo',
      model: { providerID: 'anthropic', modelID: 'claude-opus-4' },
    })).toBe(false);
  });

  it('maps google API keys to google kind', () => {
    resolveProviderLogin.mockReturnValue({ type: 'api', key: 'google-key' });
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'google', modelID: 'gemini-2.5-flash' },
    });
    expect(upstream.kind).toBe('google');
    expect(upstream.headers['x-goog-api-key']).toBe('google-key');
  });

  it('maps github-copilot tokens to openai-compatible by default', () => {
    resolveProviderLogin.mockReturnValue({ type: 'oauth', access: 'copilot-token', refresh: 'copilot-token' });
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'github-copilot', modelID: 'gpt-4.1' },
    });
    expect(upstream.kind).toBe('openai-compatible');
    expect(upstream.baseURL).toContain('githubcopilot.com');
    expect(upstream.headers.authorization).toBe('Bearer copilot-token');
  });

  it('maps ChatGPT OAuth to openai-responses', () => {
    resolveProviderLogin.mockReturnValue({
      type: 'oauth',
      access: 'chatgpt-access',
      refresh: 'chatgpt-refresh',
      expires: Date.now() + 60_000,
    });
    const upstream = resolveLlmUpstream({
      directory: 'D:\\repo',
      model: { providerID: 'openai', modelID: 'gpt-5' },
    });
    expect(upstream.kind).toBe('openai-responses');
    expect(upstream.oauth).toBe(true);
    expect(upstream.headers.authorization).toBe('Bearer chatgpt-access');
  });
});
