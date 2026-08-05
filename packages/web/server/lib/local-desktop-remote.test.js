import { describe, expect, test } from 'bun:test';
import {
  LOCAL_DESKTOP_REMOTE_DISABLED,
  createDisabledManagedTunnelConfigRuntime,
  createDisabledPairingRuntime,
  createDisabledRelayService,
  createDisabledTunnelRuntimeContext,
  registerDisabledRemoteRouteStubs,
  respondRemoteDisabled,
} from './local-desktop-remote.js';

describe('local-desktop-remote', () => {
  test('keeps remote surfaces disabled by default', () => {
    expect(LOCAL_DESKTOP_REMOTE_DISABLED).toBe(true);
  });

  test('disabled tunnel context never reports a public URL', async () => {
    const ctx = createDisabledTunnelRuntimeContext(57123);
    expect(ctx.getActivePort()).toBe(57123);
    expect(ctx.tunnelService.getPublicUrl()).toBeNull();
    const status = await ctx.tunnelService.getStatus();
    expect(status.active).toBe(false);
    expect(status.disabled).toBe(true);
    ctx.setActivePort(58000);
    expect(ctx.getActivePort()).toBe(58000);
    await expect(ctx.startTunnelWithNormalizedRequest({})).rejects.toMatchObject({
      code: 'LOCAL_DESKTOP_REMOTE_DISABLED',
    });
  });

  test('disabled relay service is a no-op lifecycle stub', async () => {
    const relay = createDisabledRelayService();
    expect(await relay.getPairingCandidate()).toBeNull();
    expect(await relay.getServerId()).toBeNull();
    await relay.reconcile();
    relay.registerRoutes({});
    relay.stop();
  });

  test('disabled pairing runtime refuses remote sessions', async () => {
    const pairing = createDisabledPairingRuntime();
    expect(await pairing.listSessions()).toEqual([]);
    expect(await pairing.hasActiveRelaySession()).toBe(false);
    await expect(pairing.createSession()).rejects.toThrow(/disabled/i);
  });

  test('disabled managed tunnel config is empty', async () => {
    const managed = createDisabledManagedTunnelConfigRuntime();
    expect(await managed.readManagedRemoteTunnelConfigFromDisk()).toEqual({
      version: 1,
      tokens: [],
      presets: [],
    });
    await managed.syncManagedRemoteTunnelConfigWithPresets([]);
    expect(await managed.resolveManagedRemoteTunnelToken('x')).toBeNull();
  });

  test('respondRemoteDisabled returns 410', () => {
    const headers = {};
    let statusCode = 0;
    let body = null;
    const res = {
      setHeader(name, value) {
        headers[name] = value;
      },
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      },
    };
    respondRemoteDisabled(res);
    expect(statusCode).toBe(410);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(body.code).toBe('LOCAL_DESKTOP_REMOTE_DISABLED');
  });

  test('registerDisabledRemoteRouteStubs mounts tunnel and relay denials', () => {
    const mounts = [];
    const app = {
      use(path) {
        mounts.push(path);
      },
    };
    registerDisabledRemoteRouteStubs(app);
    expect(mounts).toEqual([
      '/api/openchamber/tunnel',
      '/api/openchamber/relay',
    ]);
  });
});
