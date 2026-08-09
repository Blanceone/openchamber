import { describe, expect, it } from 'vitest';
import { resolveOpenWikiWorkerLaunch } from './worker-runtime.js';

describe('resolveOpenWikiWorkerLaunch', () => {
  it('sets ELECTRON_RUN_AS_NODE under Electron', () => {
    const launch = resolveOpenWikiWorkerLaunch('D:\\app\\worker.mjs', {
      execPath: 'D:\\app\\OpenChamber.exe',
      versions: { electron: '41.2.1' },
    });
    expect(launch.binary).toBe('D:\\app\\OpenChamber.exe');
    expect(launch.args).toEqual(['D:\\app\\worker.mjs']);
    expect(launch.envExtras.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(launch.isElectron).toBe(true);
  });

  it('does not force ELECTRON_RUN_AS_NODE for plain Node', () => {
    const launch = resolveOpenWikiWorkerLaunch('/usr/bin/worker.mjs', {
      execPath: '/usr/bin/node',
      versions: {},
    });
    expect(launch.envExtras.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(launch.isElectron).toBe(false);
  });
});
