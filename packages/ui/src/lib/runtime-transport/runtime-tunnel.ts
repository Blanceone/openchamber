/**
 * Private-relay tunnel singleton — permanently disabled for local-desktop builds.
 * Call sites still query these helpers; they always report inactive.
 */

export interface RelayRuntimeDescriptor {
  relayUrl: string;
  serverId: string;
  hostEncPubJwk: JsonWebKey;
  grant?: string;
}

/** Former tunnel client surface; always null when relay is disabled. */
export type RelayTunnelClient = never;

export const getActiveRelayTunnel = (): null => null;
export const getActiveRelayDescriptor = (): null => null;
export const isRelayModeActive = (): boolean => false;

export const activateRelayTunnel = (_descriptor: RelayRuntimeDescriptor): never => {
  throw new Error('Private relay is disabled in this local-only desktop build.');
};

export const adoptRelayTunnel = (_descriptor: RelayRuntimeDescriptor, _client: unknown): void => {
  // no-op
};

export const deactivateRelayTunnel = (): void => {
  // no-op
};
