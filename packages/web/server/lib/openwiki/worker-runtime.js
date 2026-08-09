/**
 * Resolve how to launch the OpenWiki worker under Node, Bun, or Electron.
 * Packaged Electron must set ELECTRON_RUN_AS_NODE so process.execPath behaves
 * as Node instead of opening another desktop window.
 *
 * @param {string} workerPath Absolute path to worker.mjs
 * @param {{
 *   execPath?: string,
 *   versions?: { electron?: string },
 *   env?: NodeJS.ProcessEnv,
 * }} [runtime]
 */
export const resolveOpenWikiWorkerLaunch = (workerPath, runtime = {}) => {
  const execPath = runtime.execPath || process.execPath;
  const versions = runtime.versions || process.versions;
  const isElectron = Boolean(versions?.electron);

  /** @type {Record<string, string>} */
  const envExtras = {};
  if (isElectron) {
    // Without this, spawning process.execPath opens another OpenChamber window
    // instead of running worker.mjs as Node.
    envExtras.ELECTRON_RUN_AS_NODE = '1';
  }

  return {
    binary: execPath,
    args: [workerPath],
    envExtras,
    isElectron,
  };
};
