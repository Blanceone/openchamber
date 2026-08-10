import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { useI18n, type I18nKey, type I18nParams } from '@/lib/i18n';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useConfigStore } from '@/stores/useConfigStore';
import { useFeatureFlagsStore } from '@/stores/useFeatureFlagsStore';
import { useUIStore } from '@/stores/useUIStore';
import {
  applyOpenWikiConsent,
  cancelOpenWikiJob,
  exportOpenWikiDocx,
  fetchOpenWikiProgress,
  fetchOpenWikiStatus,
  startOpenWikiGenerate,
  startOpenWikiUpdate,
} from '@/lib/openwiki/api';
import { OpenWikiApiError, type OpenWikiConsentAction, type OpenWikiJob, type OpenWikiStatus } from '@/lib/openwiki/types';
import {
  buildWikiTree,
  collectWikiDirectoryPaths,
  listWikiMarkdownPages,
  pickDefaultWikiPage,
  type WikiTreeFile,
} from '@/lib/openwiki/wiki-tree';
import { pickDesktopOutputDirectory, writeDesktopFiles } from '@/lib/desktop';
import { WikiPageTree } from '@/components/views/WikiPageTree';

const CONTROL_NAMES = new Set([
  '.openchamber-openwiki.json',
  '.openchamber-format-draft.json',
  'INSTRUCTIONS.md',
  'FORMAT.md',
  'log.md',
  '_plan.md',
  '.last-update.json',
  '.langsmith.json',
  'reference-sources',
]);

const isActiveStage = (job: OpenWikiJob | null | undefined) =>
  Boolean(job && !['completed', 'failed', 'cancelled'].includes(job.stage));

const isOpenCodeZenProvider = (providerID: string | undefined) =>
  providerID === 'opencode' || providerID === 'opencode-go';

const formatOpenWikiFailure = (
  t: (key: I18nKey, params?: I18nParams) => string,
  error: { code?: string; message?: string; providerID?: string } | null | undefined,
  fallbackProvider?: string,
) => {
  const provider = error?.providerID || fallbackProvider || '';
  if (error?.code === 'no-provider-login' || error?.code === 'provider-unsupported-for-openwiki') {
    if (isOpenCodeZenProvider(provider)) {
      return t('openwiki.error.opencodeLoginRequired');
    }
    if (error.code === 'no-provider-login') {
      return t('openwiki.error.noProviderLogin', { provider: provider || '—' });
    }
    return t('openwiki.error.providerUnsupported', { provider: provider || '—' });
  }
  if (error?.code === 'model-required') {
    return t('openwiki.error.modelRequired');
  }
  return error?.message || null;
};

export function OpenWikiView({ directory }: { directory: string }) {
  const { t } = useI18n();
  const files = useRuntimeAPIs().files;
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen);
  const setSettingsPage = useUIStore((s) => s.setSettingsPage);
  const openContextSurface = useUIStore((s) => s.openContextSurface);
  const openWikiAutoReveal = useFeatureFlagsStore((s) => s.openWikiAutoReveal);
  const currentProviderId = useConfigStore((s) => s.currentProviderId);
  const currentModelId = useConfigStore((s) => s.currentModelId);

  const [status, setStatus] = useState<OpenWikiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [job, setJob] = useState<OpenWikiJob | null>(null);
  const [tree, setTree] = useState<WikiTreeFile[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [busyDetail, setBusyDetail] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [exportDetail, setExportDetail] = useState<string | null>(null);

  const composerModel = useMemo(() => {
    if (!currentProviderId || !currentModelId) return undefined;
    return { providerID: currentProviderId, modelID: currentModelId };
  }, [currentProviderId, currentModelId]);

  // Prefer the composer selection; fall back to the server-resolved model
  // (Settings override) so consent/generate still work without a session model.
  const resolvedModel = composerModel ?? status?.model ?? undefined;

  const reloadStatus = async (signal?: AbortSignal) => {
    try {
      const next = await fetchOpenWikiStatus(directory, {
        model: composerModel ? `${composerModel.providerID}/${composerModel.modelID}` : undefined,
        signal,
      });
      setStatus(next);
      setJob(next.job);
      if (next.job?.stage === 'failed' && next.job.error) {
        setStatusError(
          formatOpenWikiFailure(t, next.job.error, next.job.model?.providerID)
            || next.job.error.message
            || t('openwiki.stage.failed'),
        );
      } else {
        setStatusError(null);
      }
      return next;
    } catch (error) {
      if (signal?.aborted) return null;
      setStatusError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const reloadTree = async () => {
    if (!status?.wikiRoot || !status.wikiExists) {
      setTree([]);
      return;
    }
    try {
      if (!files.readFile) {
        setTreeError(t('openwiki.error.readUnsupported'));
        setTree([]);
        return;
      }
      const entries = await listWikiMarkdownPages(
        (path) => files.listDirectory(path),
        status.wikiRoot,
        { controlNames: CONTROL_NAMES },
      );
      setTree(entries);
      setExpandedDirs(new Set(collectWikiDirectoryPaths(buildWikiTree(entries, status.wikiRoot))));
      setTreeError(null);
      if (!selectedPath && entries.length > 0) {
        const index = pickDefaultWikiPage(entries);
        if (index) setSelectedPath(index.path);
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
      setTree([]);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void reloadStatus(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, composerModel?.providerID, composerModel?.modelID]);

  useEffect(() => {
    void reloadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.wikiRoot, status?.wikiExists, status?.ownership]);

  useEffect(() => {
    if (!selectedPath) {
      setContent('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!files.readFile) {
          if (!cancelled) setContent(t('openwiki.error.readUnsupported'));
          return;
        }
        const file = await files.readFile(selectedPath);
        if (!cancelled) setContent(typeof file?.content === 'string' ? file.content : '');
      } catch (error) {
        if (!cancelled) setContent(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPath, files, t]);

  useEffect(() => {
    if (!isActiveStage(job) && !busy) return;
    const poll = () => {
      void fetchOpenWikiProgress(directory)
        .then((progress) => {
          setJob(progress.job);
          if (progress.job?.stage === 'failed') {
            const detail = formatOpenWikiFailure(
              t,
              progress.job.error,
              progress.job.model?.providerID,
            ) || progress.job.error?.message;
            if (detail) setStatusError(detail);
          }
          if (progress.job && ['completed', 'failed', 'cancelled'].includes(progress.job.stage)) {
            void reloadStatus();
            void reloadTree();
            if (progress.job.stage === 'completed' && openWikiAutoReveal) {
              openContextSurface(directory, 'wiki');
            }
          }
        })
        .catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 800);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, job?.stage, job?.id, openWikiAutoReveal, busy]);

  const loginBlocker = useMemo(() => {
    if (!status || !resolvedModel || status.hasLogin !== false) return null;
    return formatOpenWikiFailure(
      t,
      { code: 'no-provider-login', providerID: resolvedModel.providerID },
      resolvedModel.providerID,
    );
  }, [resolvedModel, status, t]);

  const jobFailureDetail = useMemo(() => {
    if (job?.stage !== 'failed' || !job.error) return null;
    return formatOpenWikiFailure(t, job.error, job.model?.providerID) || job.error.message;
  }, [job, t]);

  const runJob = async (command: 'init' | 'update') => {
    if (busy) return;
    if (!resolvedModel) {
      setStatusError(t('openwiki.error.modelRequired'));
      return;
    }
    if (status?.hasLogin === false) {
      setStatusError(formatOpenWikiFailure(
        t,
        { code: 'no-provider-login', providerID: resolvedModel.providerID },
        resolvedModel.providerID,
      ));
      return;
    }
    setBusy(true);
    setBusyDetail(t('openwiki.stage.preparing'));
    setStatusError(null);
    try {
      const started = command === 'init'
        ? await startOpenWikiGenerate(directory, { model: resolvedModel })
        : await startOpenWikiUpdate(directory, { model: resolvedModel });
      setJob(started);
      setConfirmRegenerate(false);
      setBusyDetail(started.stage ? t(`openwiki.stage.${started.stage}`) : null);
      await reloadStatus();
    } catch (error) {
      if (error instanceof OpenWikiApiError && error.code === 'wiki-consent-required') {
        setStatusError(t('openwiki.consent.required'));
        await reloadStatus();
      } else if (error instanceof OpenWikiApiError) {
        setStatusError(
          formatOpenWikiFailure(t, { code: error.code, message: error.message }, resolvedModel.providerID)
            || error.message,
        );
      } else {
        setStatusError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
      setBusyDetail(null);
    }
  };

  const runConsent = async (consentAction: OpenWikiConsentAction) => {
    if (busy) return;
    setBusy(true);
    setBusyDetail(t('openwiki.stage.preparing'));
    setStatusError(null);
    try {
      // Consent is a separate, fast write so the UI can leave the conflict state
      // even when generation later fails (missing model / unsupported provider).
      await applyOpenWikiConsent(directory, consentAction);
      const next = await reloadStatus();
      if (!resolvedModel && !next?.model) {
        setStatusError(t('openwiki.error.modelRequired'));
        return;
      }
      const model = resolvedModel ?? next?.model;
      if (!model) {
        setStatusError(t('openwiki.error.modelRequired'));
        return;
      }
      if (next?.hasLogin === false) {
        setStatusError(formatOpenWikiFailure(
          t,
          { code: 'no-provider-login', providerID: model.providerID },
          model.providerID,
        ));
        return;
      }
      setBusyDetail(t('openwiki.stage.preparing'));
      const started = await startOpenWikiGenerate(directory, { model });
      setJob(started);
      setBusyDetail(started.stage ? t(`openwiki.stage.${started.stage}`) : null);
      await reloadStatus();
    } catch (error) {
      if (error instanceof OpenWikiApiError) {
        setStatusError(
          formatOpenWikiFailure(t, { code: error.code, message: error.message }, resolvedModel?.providerID)
            || error.message,
        );
        await reloadStatus();
      } else {
        setStatusError(error instanceof Error ? error.message : String(error));
        await reloadStatus();
      }
    } finally {
      setBusy(false);
      setBusyDetail(null);
    }
  };

  const openSettings = () => {
    setSettingsPage('openwiki');
    setSettingsDialogOpen(true);
  };

  const runExportDocx = async () => {
    if (busy || !status?.wikiExists) return;
    setBusy(true);
    setExportDetail(t('openwiki.export.preparing'));
    setStatusError(null);
    try {
      const picked = await pickDesktopOutputDirectory();
      if (!picked.success || !picked.path) {
        if (picked.error && picked.error !== 'cancelled') {
          setStatusError(picked.error);
        }
        return;
      }
      const payload = await exportOpenWikiDocx(directory);
      setExportDetail(t('openwiki.export.writing', { count: String(payload.files.length) }));
      const written = await writeDesktopFiles(
        picked.path,
        payload.files.map((file) => ({
          relativePath: file.relativePath,
          contentBase64: file.contentBase64,
        })),
      );
      if (!written.success) {
        throw new Error(written.error || t('openwiki.export.failed'));
      }
      setExportDetail(t('openwiki.export.done', { count: String(written.written?.length || payload.files.length) }));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : String(error));
      setExportDetail(null);
    } finally {
      setBusy(false);
      window.setTimeout(() => setExportDetail(null), 2500);
    }
  };

  const active = isActiveStage(job);
  const generating = busy || active;

  const wikiTree = useMemo(() => {
    if (!status?.wikiRoot || tree.length === 0) return [];
    return buildWikiTree(tree, status.wikiRoot);
  }, [status?.wikiRoot, tree]);

  const toggleDirectory = (relativePath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-text-strong">{t('openwiki.panel.title')}</div>
            {generating ? (
              <Icon
                name="loader-4"
                className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted"
                aria-label={t('openwiki.status.generating')}
              />
            ) : null}
          </div>
          <div className="truncate text-xs text-text-muted">
            {status?.wikiRoot || directory}
            {status?.ownership ? ` · ${t(`openwiki.ownership.${status.ownership}`)}` : ''}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={openSettings}>
          {t('openwiki.action.settings')}
        </Button>
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void cancelOpenWikiJob(directory).then((next) => setJob(next));
            }}
          >
            {t('openwiki.action.cancel')}
          </Button>
        ) : null}
        {status?.consentRequired ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void runConsent('adopt')}
            >
              {busy ? t('openwiki.stage.preparing') : t('openwiki.consent.adopt')}
            </Button>
            <Button
              size="sm"
              onClick={() => void runConsent('backup-rebuild')}
            >
              {busy ? t('openwiki.stage.preparing') : t('openwiki.consent.backupRebuild')}
            </Button>
          </>
        ) : null}
        {!status?.consentRequired && status?.ownership === 'absent' ? (
          <Button size="sm" onClick={() => void runJob('init')}>
            {busy ? t('openwiki.stage.preparing') : t('openwiki.action.generate')}
          </Button>
        ) : null}
        {!status?.consentRequired && status?.ownership === 'openchamber-managed' ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => void runJob('update')}>
              {busy ? t('openwiki.stage.preparing') : t('openwiki.action.update')}
            </Button>
            {confirmRegenerate ? (
              <Button size="sm" onClick={() => void runJob('init')}>
                {busy ? t('openwiki.stage.preparing') : t('openwiki.action.confirmRegenerate')}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRegenerate(true)}>
                {t('openwiki.action.regenerate')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={!status.wikiExists || busy}
              onClick={() => void runExportDocx()}
            >
              {t('openwiki.action.exportDocx')}
            </Button>
          </>
        ) : null}
      </div>

      {statusError || loginBlocker || jobFailureDetail || (status?.consentRequired && !resolvedModel) ? (
        <div className="border-b border-border-subtle px-3 py-2 text-xs text-status-error">
          {statusError || loginBlocker || jobFailureDetail || t('openwiki.error.modelRequired')}
        </div>
      ) : null}
      {generating || busyDetail || exportDetail ? (
        <div
          className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 text-xs text-text-muted"
          role="status"
          aria-live="polite"
        >
          {generating || busyDetail ? (
            <Icon name="loader-4" className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : null}
          <span className="min-w-0 truncate">
            {exportDetail
              || busyDetail
              || (job?.stage ? t(`openwiki.stage.${job.stage}`) : t('openwiki.status.generating'))}
            {!exportDetail && job?.detail ? ` — ${job.detail}` : null}
          </span>
        </div>
      ) : null}
      {status?.consentRequired ? (
        <div className="border-b border-border-subtle px-3 py-2 text-xs text-text-muted">
          {t('openwiki.consent.explanation')}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 overflow-auto border-r border-border-subtle p-2">
          {treeError ? (
            <div className="text-xs text-status-error">{treeError}</div>
          ) : wikiTree.length === 0 ? (
            <div className="text-xs text-text-muted">{t('openwiki.empty.tree')}</div>
          ) : (
            <WikiPageTree
              nodes={wikiTree}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onToggleDirectory={toggleDirectory}
              onSelectFile={setSelectedPath}
            />
          )}
        </div>
        <div className="relative min-w-0 flex-1 overflow-auto p-3">
          {generating ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <div className="flex flex-col items-center gap-2 text-text-muted">
                <Icon name="loader-4" className="h-8 w-8 animate-spin" aria-hidden="true" />
                <div className="text-xs">
                  {busyDetail || (job?.stage ? t(`openwiki.stage.${job.stage}`) : t('openwiki.status.generating'))}
                </div>
              </div>
            </div>
          ) : null}
          {content ? (
            <SimpleMarkdownRenderer
              content={content}
              className="typography-markdown-body"
              stripFrontmatter
              enableFileReferences={false}
            />
          ) : (
            <div className="text-sm text-text-muted">{t('openwiki.empty.page')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
