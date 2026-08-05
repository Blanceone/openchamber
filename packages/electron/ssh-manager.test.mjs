import { describe, expect, test } from 'bun:test';

import { ElectronSshManager } from './ssh-manager.mjs';

describe('ElectronSshManager stub', () => {
  test('returns empty instances and no-op lifecycle methods', async () => {
    const manager = new ElectronSshManager();
    expect(manager.readInstances()).toEqual({ instances: [] });
    expect(await manager.importHosts()).toEqual([]);
    expect(await manager.statusesWithDefaults()).toEqual([]);
    expect(manager.logsForInstance('ssh-1')).toEqual([]);
    await manager.setInstances({ instances: [{ id: 'ssh-1' }] });
    await manager.connect('ssh-1');
    await manager.disconnect('ssh-1');
    manager.clearLogsForInstance('ssh-1');
    await manager.shutdownAll();
  });
});
