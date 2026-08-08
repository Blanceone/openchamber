/**
 * Local Windows desktop builds keep the in-process web server, but do not
 * expose OpenChamber remote-host surfaces: Cloudflare/ngrok tunnels, private
 * relay, pairing QR/redeem, or /connect bootstrap.
 *
 * Modules remain on disk for now (lower startup regression risk); routes and
 * lifecycle hooks are skipped so the attack surface stays closed.
 */

export const LOCAL_DESKTOP_REMOTE_DISABLED = true;

export const LOCAL_DESKTOP_REMOTE_DISABLED_MESSAGE =
  'Remote access, tunnels, relay, and pairing are disabled in this local-only desktop build.';

export const createDisabledTunnelRuntimeContext = (initialPort) => {
  let activePort = initialPort;
  const disabledError = () => {
    const error = new Error(LOCAL_DESKTOP_REMOTE_DISABLED_MESSAGE);
    error.code = 'LOCAL_DESKTOP_REMOTE_DISABLED';
    throw error;
  };

  return {
    tunnelService: {
      getPublicUrl: () => null,
      getStatus: async () => ({ active: false, disabled: true }),
      stop: async () => {},
      start: disabledError,
    },
    startTunnelWithNormalizedRequest: async () => disabledError(),
    getActivePort: () => activePort,
    setActivePort: (value) => {
      activePort = value;
    },
  };
};

export const createDisabledRelayService = () => ({
  registerRoutes: () => {},
  reconcile: async () => {},
  stop: () => {},
  getPairingCandidate: async () => null,
  ensureEnabledForPairing: async () => null,
  getServerId: async () => null,
});

export const createDisabledPairingRuntime = () => ({
  createSession: async () => {
    throw new Error(LOCAL_DESKTOP_REMOTE_DISABLED_MESSAGE);
  },
  listSessions: async () => [],
  cancelSession: async () => ({ cancelled: false }),
  redeemSession: async () => {
    throw new Error(LOCAL_DESKTOP_REMOTE_DISABLED_MESSAGE);
  },
  hasActiveRelaySession: async () => false,
});

export const createDisabledManagedTunnelConfigRuntime = () => ({
  readManagedRemoteTunnelConfigFromDisk: async () => ({ version: 1, tokens: [], presets: [] }),
  syncManagedRemoteTunnelConfigWithPresets: async () => {},
  upsertManagedRemoteTunnelToken: async () => null,
  resolveManagedRemoteTunnelToken: async () => null,
});

export const createDisabledApnsRuntime = () => ({
  addOrUpdateApnsToken: async () => ({ ok: false, disabled: true }),
  removeApnsToken: async () => ({ ok: false, disabled: true }),
  sendApnsToAllUiSessions: async () => ({ sent: 0, disabled: true }),
});

export const respondRemoteDisabled = (res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    error: LOCAL_DESKTOP_REMOTE_DISABLED_MESSAGE,
    code: 'LOCAL_DESKTOP_REMOTE_DISABLED',
  });
};

/** Mount explicit 410 handlers so disabled surfaces do not fall through to the OpenCode proxy. */
export const registerDisabledRemoteRouteStubs = (app) => {
  const deny = (_req, res) => respondRemoteDisabled(res);
  app.use('/api/openchamber/tunnel', deny);
  app.use('/api/openchamber/relay', deny);
};
