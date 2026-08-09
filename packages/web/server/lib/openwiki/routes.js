import {
  cancelOpenWikiJob,
  getOpenWikiStatus,
  getJob,
  readFormatBundle,
  writeFormatBundle,
  startOpenWikiJob,
  applyConsentIfNeeded,
  FORMAT_PRESET_IDS,
  DEFAULT_FORMAT_PRESET_ID,
  getPresetBodies,
  parseModelRef,
  assertOpenWikiModelGatewayReady,
  classifyWikiOwnership,
} from './index.js';

const sendError = (res, error, fallbackStatus = 500) => {
  const status = Number(error?.statusCode) > 0 ? Number(error.statusCode) : fallbackStatus;
  res.status(status).json({
    error: error instanceof Error ? error.message : String(error),
    code: typeof error?.code === 'string' ? error.code : undefined,
    ownership: error?.ownership,
    foreignPaths: error?.foreignPaths,
    providerID: error?.providerID,
  });
};

/**
 * `resolveProjectDirectory` is async and takes the Express `req`, returning
 * `{ directory, error }`. Prefer an explicit directory from query/body by
 * projecting it onto `req.query.directory` so the shared validator runs.
 *
 * @param {(req: unknown) => Promise<{ directory: string | null, error?: string | null }>} resolveProjectDirectory
 * @param {import('express').Request} req
 * @param {unknown} [explicit]
 */
const resolveDirectory = async (resolveProjectDirectory, req, explicit) => {
  const hint = typeof explicit === 'string' && explicit.trim()
    ? explicit.trim()
    : (typeof req.query?.directory === 'string' ? req.query.directory.trim() : '');

  const resolved = await resolveProjectDirectory({
    get: typeof req.get === 'function' ? (name) => req.get(name) : () => undefined,
    query: {
      ...(req.query && typeof req.query === 'object' ? req.query : {}),
      ...(hint ? { directory: hint } : {}),
    },
  });

  if (!resolved?.directory || typeof resolved.directory !== 'string') {
    throw Object.assign(new Error(resolved?.error || 'Directory is required'), {
      statusCode: 400,
      code: 'directory-required',
    });
  }

  return resolved.directory;
};

/**
 * @param {import('express').Express} app
 * @param {{
 *   resolveProjectDirectory: (req: unknown) => Promise<{ directory: string | null, error?: string | null }>,
 *   readOpenChamberSettings?: () => Promise<Record<string, unknown>>,
 * }} deps
 */
export function registerOpenWikiRoutes(app, deps) {
  const { resolveProjectDirectory, readOpenChamberSettings } = deps;

  app.get('/api/openwiki/status', async (req, res) => {
    try {
      const directory = await resolveDirectory(resolveProjectDirectory, req, req.query.directory);
      const settings = readOpenChamberSettings ? await readOpenChamberSettings() : {};
      const status = await getOpenWikiStatus({
        directory,
        model: req.query.model,
        openWikiModelOverride: typeof settings.openWikiModelOverride === 'string'
          ? settings.openWikiModelOverride
          : null,
        openWikiEnabled: settings.openWikiEnabled !== false,
      });
      res.json(status);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/openwiki/preflight', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const settings = readOpenChamberSettings ? await readOpenChamberSettings() : {};
      const model = parseModelRef(settings.openWikiModelOverride)
        || parseModelRef(body.model)
        || parseModelRef(body.preferredModel);
      if (!model) {
        throw Object.assign(new Error('Model is required'), { statusCode: 400, code: 'model-required' });
      }
      const ownership = classifyWikiOwnership(directory);
      const bridged = await assertOpenWikiModelGatewayReady({ directory, model });
      res.json({
        ok: true,
        wikiRoot: ownership.wikiRoot,
        projectDirectory: directory,
        command: body.command === 'init' ? 'init' : 'update',
        model,
        mappedProvider: bridged.mappedProvider,
        hasLogin: true,
        anonymous: bridged.anonymous === true,
        wikiExists: ownership.wikiExists,
        ownership: ownership.ownership,
        consentRequired: ownership.consentRequired,
      });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get('/api/openwiki/format/presets', (_req, res) => {
    res.json({
      defaultPresetId: DEFAULT_FORMAT_PRESET_ID,
      presets: FORMAT_PRESET_IDS.map((id) => ({
        id,
        // Titles are localized in the UI; server returns id + english seed hint only.
        seed: getPresetBodies(id),
      })),
    });
  });

  app.get('/api/openwiki/format', async (req, res) => {
    try {
      const directory = await resolveDirectory(resolveProjectDirectory, req, req.query.directory);
      const bundle = await readFormatBundle(directory);
      res.json(bundle);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/openwiki/format', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const bundle = await writeFormatBundle(directory, {
        presetId: body.presetId,
        instructions: body.instructions,
        format: body.format,
        applyPreset: body.applyPreset === true,
      });
      res.json(bundle);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/openwiki/consent', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const consentAction = body.consentAction === 'backup-rebuild' ? 'backup-rebuild' : 'adopt';
      const ownership = await applyConsentIfNeeded(directory, {
        consent: true,
        consentAction,
      });
      res.json({
        ok: true,
        projectDirectory: directory,
        wikiRoot: ownership.wikiRoot,
        ownership: ownership.ownership,
        consentRequired: ownership.consentRequired,
        foreignPaths: ownership.foreignPaths,
        wikiExists: ownership.wikiExists,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/openwiki/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const settings = readOpenChamberSettings ? await readOpenChamberSettings() : {};
      const job = await startOpenWikiJob({
        directory,
        command: 'init',
        model: body.model,
        language: body.language ?? settings.openWikiLanguage ?? null,
        consent: body.consent === true,
        consentAction: body.consentAction,
        openWikiModelOverride: typeof settings.openWikiModelOverride === 'string'
          ? settings.openWikiModelOverride
          : null,
      });
      res.status(202).json({ job });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/openwiki/update', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const settings = readOpenChamberSettings ? await readOpenChamberSettings() : {};
      const job = await startOpenWikiJob({
        directory,
        command: 'update',
        model: body.model,
        language: body.language ?? settings.openWikiLanguage ?? null,
        consent: body.consent === true,
        consentAction: body.consentAction,
        openWikiModelOverride: typeof settings.openWikiModelOverride === 'string'
          ? settings.openWikiModelOverride
          : null,
      });
      res.status(202).json({ job });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/openwiki/job', async (req, res) => {
    try {
      const directory = await resolveDirectory(resolveProjectDirectory, req, req.query.directory);
      res.json({ job: getJob(directory) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/openwiki/progress', async (req, res) => {
    try {
      const directory = await resolveDirectory(resolveProjectDirectory, req, req.query.directory);
      const job = getJob(directory);
      res.json({
        stage: job?.stage ?? null,
        detail: job?.detail ?? null,
        job,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/openwiki/cancel', async (req, res) => {
    try {
      const body = req.body || {};
      const directory = await resolveDirectory(resolveProjectDirectory, req, body.directory);
      const job = await cancelOpenWikiJob(directory);
      res.json({ job });
    } catch (error) {
      sendError(res, error);
    }
  });
}
