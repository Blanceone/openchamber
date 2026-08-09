export type OpenWikiOwnership = 'absent' | 'openchamber-managed' | 'foreign' | 'conflict';

export type OpenWikiJobStage =
  | 'queued'
  | 'preparing'
  | 'mapping-model'
  | 'running'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type OpenWikiConsentAction = 'adopt' | 'backup-rebuild';

export type OpenWikiFormatPresetId =
  | 'openwiki-default'
  | 'architecture-module'
  | 'api-service'
  | 'custom';

export type OpenWikiModelRef = {
  providerID: string;
  modelID: string;
};

export type OpenWikiJob = {
  id: string;
  directory: string;
  mode: 'code';
  command: 'init' | 'update';
  stage: OpenWikiJobStage;
  model: OpenWikiModelRef;
  mappedProvider?: string;
  startedAt: number;
  updatedAt: number;
  detail?: string;
  error?: { code: string; message: string; providerID?: string };
  cancelRequested?: boolean;
};

export type OpenWikiStatus = {
  enabled: boolean;
  projectDirectory: string;
  wikiRoot: string;
  wikiExists: boolean;
  ownership: OpenWikiOwnership;
  consentRequired: boolean;
  foreignPaths: string[];
  job: OpenWikiJob | null;
  model: OpenWikiModelRef | null;
  hasLogin: boolean;
};

export type OpenWikiFormatBundle = {
  presetId: OpenWikiFormatPresetId | string;
  instructions: string;
  format: string;
  wikiRoot: string;
};

export class OpenWikiApiError extends Error {
  code?: string;
  ownership?: OpenWikiOwnership;
  foreignPaths?: string[];

  constructor(message: string, extras: { code?: string; ownership?: OpenWikiOwnership; foreignPaths?: string[] } = {}) {
    super(message);
    this.name = 'OpenWikiApiError';
    this.code = extras.code;
    this.ownership = extras.ownership;
    this.foreignPaths = extras.foreignPaths;
  }
}
