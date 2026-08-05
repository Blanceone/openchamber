/** Local-only desktop stub: SSH host management removed from Electron. */
export class ElectronSshManager {
  constructor(_options = {}) {}

  async shutdownAll() {}

  readInstances() {
    return { instances: [] };
  }

  async setInstances(_config) {}

  async importHosts() {
    return [];
  }

  async connect(_id) {}

  async disconnect(_id) {}

  async statusesWithDefaults(_id) {
    return [];
  }

  logsForInstance(_id, _limit = 200) {
    return [];
  }

  clearLogsForInstance(_id) {}
}
