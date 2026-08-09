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
}));
vi.mock('../small-model/catalog.js', () => ({
  getCatalogProvider: () => null,
  getModelCatalog: async () => ({}),
}));

import {
  buildOpenWikiGatewayChildEnv,
  buildOpenWikiModelEnv,
  parseModelRef,
} from './model-bridge.js';

describe('parseModelRef', () => {
  it('parses provider/model strings', () => {
    expect(parseModelRef('anthropic/claude-opus-4')).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-opus-4',
    });
  });

  it('keeps slashes inside model ids', () => {
    expect(parseModelRef('openrouter/vendor/model')).toEqual({
      providerID: 'openrouter',
      modelID: 'vendor/model',
    });
  });

  it('accepts object forms', () => {
    expect(parseModelRef({ providerId: 'openai', modelId: 'gpt-5' })).toEqual({
      providerID: 'openai',
      modelID: 'gpt-5',
    });
  });

  it('rejects invalid values', () => {
    expect(parseModelRef('')).toBeNull();
    expect(parseModelRef('noslash')).toBeNull();
    expect(parseModelRef(null)).toBeNull();
  });
});

describe('buildOpenWikiModelEnv (gateway readiness)', () => {
  beforeEach(() => {
    readAuthFile.mockReset().mockReturnValue({});
    readConfig.mockReset().mockReturnValue({});
    resolveProviderLogin.mockReset().mockReturnValue(null);
  });

  it('allows free opencode models without a stored login', () => {
    const bridged = buildOpenWikiModelEnv({
      directory: 'D:\\repo',
      model: { providerID: 'opencode', modelID: 'big-pickle' },
    });
    expect(bridged.mappedProvider).toBe('openai-compatible');
    expect(bridged.anonymous).toBe(true);
    expect(bridged.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(bridged.env.OPENAI_COMPATIBLE_API_KEY).toBeUndefined();
  });

  it('refuses paid opencode models without a login', () => {
    expect(() => buildOpenWikiModelEnv({
      directory: 'D:\\repo',
      model: { providerID: 'opencode', modelID: 'claude-sonnet-4' },
    })).toThrow(/OpenCode\/Zen/);
  });

  it('accepts anthropic API keys for gateway readiness', () => {
    resolveProviderLogin.mockReturnValue({ type: 'api', key: 'anth-key' });
    const bridged = buildOpenWikiModelEnv({
      directory: 'D:\\repo',
      model: { providerID: 'anthropic', modelID: 'claude-opus-4' },
    });
    expect(bridged.mappedProvider).toBe('openai-compatible');
    expect(bridged.upstreamKind).toBe('anthropic');
    expect(bridged.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe('buildOpenWikiGatewayChildEnv', () => {
  it('points the child at the loopback gateway without real provider keys', () => {
    const bridged = buildOpenWikiGatewayChildEnv({
      gatewayBaseUrl: 'http://127.0.0.1:9/v1',
      jobToken: 'job-token',
      model: { providerID: 'opencode', modelID: 'big-pickle' },
    });
    expect(bridged.env).toEqual({
      OPENWIKI_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      OPENWIKI_PROVIDER: 'openai-compatible',
      OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:9/v1',
      OPENAI_COMPATIBLE_API_KEY: 'job-token',
      OPENWIKI_MODEL_ID: 'big-pickle',
    });
  });
});
