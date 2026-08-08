import { getRuntimeExtraHeadersSync, refreshLocalRuntimeUrlAuthToken, refreshRuntimeUrlAuthToken, setRuntimeBearerToken, setRuntimeExtraHeaders } from '@openchamber/ui/lib/runtime-auth';
import { installRuntimeFetchBridge } from '@openchamber/ui/lib/runtime-fetch';
import { initializeRuntimeEndpoint } from '@openchamber/ui/lib/runtime-switch';
import { configureRuntimeUrlResolver } from '@openchamber/ui/lib/runtime-url';
import type { EmbeddedSessionRuntimeBootstrap } from '@openchamber/ui/components/layout/contextPanelEmbeddedChat';
import { opencodeClient } from '@openchamber/ui/lib/opencode/client';
import { createWebAPIs } from './api';

const sameOrigin = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
};

declare global {
  interface Window {
    __OPENCHAMBER_API_BASE_URL__?: string;
    __OPENCHAMBER_CLIENT_TOKEN__?: string;
    __OPENCHAMBER_RUNTIME_HEADERS__?: Record<string, string>;
    __OPENCHAMBER_LOCAL_ORIGIN__?: string;
  }
}

export const readRuntimeBootstrapConfig = (): EmbeddedSessionRuntimeBootstrap => {
  const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

  return {
    apiBaseUrl: readString(window.__OPENCHAMBER_API_BASE_URL__),
    clientToken: readString(window.__OPENCHAMBER_CLIENT_TOKEN__),
    localOrigin: readString(window.__OPENCHAMBER_LOCAL_ORIGIN__),
    runtimeHeaders: window.__OPENCHAMBER_RUNTIME_HEADERS__,
  };
};

// Kept for main.tsx splash gating. Private-relay host restore was removed from
// the local-desktop product; this is always immediately ready.
export const getDesktopRelayRestoreReady = (): Promise<void> => Promise.resolve();

export const createConfiguredWebAPIs = (bootstrap?: EmbeddedSessionRuntimeBootstrap | null) => {
  const { apiBaseUrl, clientToken, localOrigin, runtimeHeaders } = bootstrap ?? readRuntimeBootstrapConfig();

  const urls = configureRuntimeUrlResolver({
    apiBaseUrl: apiBaseUrl || undefined,
    realtimeBaseUrl: apiBaseUrl || undefined,
  });
  initializeRuntimeEndpoint({
    apiBaseUrl,
    runtimeKey: sameOrigin(apiBaseUrl, localOrigin) ? 'local' : null,
  });
  setRuntimeBearerToken(clientToken || null);
  setRuntimeExtraHeaders(runtimeHeaders || null);
  // createWebAPIs imports UI stores, which instantiate the SDK singleton before
  // an embedded frame's asynchronous parent bootstrap is available.
  opencodeClient.reconnectToRuntimeBaseUrl();
  void refreshRuntimeUrlAuthToken(apiBaseUrl || undefined).catch(() => {});
  if (localOrigin && !sameOrigin(apiBaseUrl, localOrigin) && Object.keys(getRuntimeExtraHeadersSync()).length > 0) {
    void refreshLocalRuntimeUrlAuthToken(localOrigin).catch(() => {});
  }
  installRuntimeFetchBridge();
  return createWebAPIs({ urls });
};
