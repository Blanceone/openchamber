import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@openchamber/ui/lib/runtime-auth', () => ({
  getRuntimeBearerTokenSync: vi.fn(() => ''),
  getRuntimeExtraHeadersSync: vi.fn(() => ({})),
  refreshLocalRuntimeUrlAuthToken: vi.fn(() => Promise.resolve()),
  refreshRuntimeUrlAuthToken: vi.fn(() => Promise.resolve()),
  setRuntimeBearerToken: vi.fn(),
  setRuntimeExtraHeaders: vi.fn(),
}));
vi.mock('@openchamber/ui/lib/runtime-fetch', () => ({ installRuntimeFetchBridge: vi.fn() }));
vi.mock('@openchamber/ui/lib/runtime-switch', () => ({
  getRuntimeApiBaseUrl: vi.fn(() => ''),
  getRuntimeKey: vi.fn(() => 'local'),
  initializeRuntimeEndpoint: vi.fn(),
  switchRuntimeEndpoint: vi.fn(),
}));
vi.mock('@openchamber/ui/lib/runtime-url', () => ({ configureRuntimeUrlResolver: vi.fn(() => ({})) }));
vi.mock('@openchamber/ui/lib/opencode/client', () => ({ opencodeClient: { reconnectToRuntimeBaseUrl: vi.fn() } }));
vi.mock('./api', () => ({ createWebAPIs: vi.fn() }));

import { setRuntimeBearerToken, setRuntimeExtraHeaders } from '@openchamber/ui/lib/runtime-auth';
import { initializeRuntimeEndpoint } from '@openchamber/ui/lib/runtime-switch';
import { opencodeClient } from '@openchamber/ui/lib/opencode/client';
import { createConfiguredWebAPIs, readRuntimeBootstrapConfig } from './runtimeConfig';

const originalWindow = globalThis.window;

const installWindow = (value: Record<string, unknown>) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value,
  });
};

const makeWindow = (search = ''): Record<string, unknown> => {
  const value: Record<string, unknown> = {
    location: { origin: 'openchamber-ui://app', search },
    setTimeout: vi.fn(() => 1),
  };
  value.parent = value;
  return value;
};

beforeEach(() => {
  vi.clearAllMocks();
  installWindow(makeWindow());
});

afterAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('readRuntimeBootstrapConfig', () => {
  test('reads the runtime injected into the current window', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = ' https://remote.example.com ';
    current.__OPENCHAMBER_CLIENT_TOKEN__ = ' remote-token ';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = ' http://127.0.0.1:3000 ';
    current.__OPENCHAMBER_RUNTIME_HEADERS__ = { 'x-openchamber-relay': 'relay-value' };
    installWindow(current);

    expect(readRuntimeBootstrapConfig()).toEqual({
      apiBaseUrl: 'https://remote.example.com',
      clientToken: 'remote-token',
      localOrigin: 'http://127.0.0.1:3000',
      runtimeHeaders: { 'x-openchamber-relay': 'relay-value' },
    });
  });

  test('does not read runtime credentials directly from a parent window', () => {
    const parent = makeWindow();
    parent.__OPENCHAMBER_API_BASE_URL__ = 'https://remote.example.com';
    parent.__OPENCHAMBER_CLIENT_TOKEN__ = 'remote-token';
    const child = makeWindow('?ocPanel=session-chat&sessionId=ses_child');
    child.parent = parent;
    installWindow(child);

    expect(readRuntimeBootstrapConfig()).toEqual({
      apiBaseUrl: '',
      clientToken: '',
      localOrigin: '',
      runtimeHeaders: undefined,
    });
  });
});

describe('createConfiguredWebAPIs', () => {
  test('applies an embedded handshake without relay restore', () => {
    const bootstrap = {
      apiBaseUrl: 'https://remote.example.com',
      clientToken: 'client-token',
      localOrigin: 'openchamber-ui://app',
      runtimeHeaders: { 'x-runtime': 'value' },
    };

    createConfiguredWebAPIs(bootstrap);

    expect(initializeRuntimeEndpoint).toHaveBeenCalledWith({
      apiBaseUrl: bootstrap.apiBaseUrl,
      runtimeKey: null,
    });
    expect(setRuntimeBearerToken).toHaveBeenCalledWith(bootstrap.clientToken);
    expect(setRuntimeExtraHeaders).toHaveBeenCalledWith(bootstrap.runtimeHeaders);
    expect(opencodeClient.reconnectToRuntimeBaseUrl).toHaveBeenCalled();
  });
});
