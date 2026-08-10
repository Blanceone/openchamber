import { useEffect, useMemo, useState } from 'react';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsCheckboxRow,
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { reportSettingsSaveState, updateDesktopSettings } from '@/lib/persistence';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useFeatureFlagsStore } from '@/stores/useFeatureFlagsStore';
import { runtimeFetch } from '@/lib/runtime-fetch';
import {
  fetchOpenWikiFormat,
  fetchOpenWikiFormatDraft,
  fetchOpenWikiProgress,
  fetchOpenWikiReferenceSources,
  mergeOpenWikiFormatDraft,
  removeOpenWikiReferenceSource,
  resetOpenWikiFormat,
  saveOpenWikiFormat,
  startOpenWikiFormatParse,
  uploadOpenWikiReferenceSources,
} from '@/lib/openwiki/api';
import { OpenWikiApiError, type OpenWikiFormatDraft, type OpenWikiReferenceSource } from '@/lib/openwiki/types';
import type { DesktopSettings } from '@/lib/desktop';
import {
  hasDesktopInvoke,
  isDesktopLocalOriginActive,
  pickDesktopReferenceFiles,
  readDesktopFileBase64,
  scanDesktopReferenceFolder,
} from '@/lib/desktop';
import { cn } from '@/lib/utils';

const FOLLOW_CURRENT = '__follow_current__';
const REFERENCE_CONFIRM_BYTES = 10 * 1024 * 1024;

const fileToBase64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export function OpenWikiPage() {
  const { t } = useI18n();
  const directory = useDirectoryStore((s) => s.currentDirectory);
  const providers = useConfigStore((s) => s.providers);
  const currentProviderId = useConfigStore((s) => s.currentProviderId);
  const currentModelId = useConfigStore((s) => s.currentModelId);

  const [enabled, setEnabled] = useState(true);
  const [autoReveal, setAutoReveal] = useState(true);
  const [modelOverride, setModelOverride] = useState('');
  const [instructions, setInstructions] = useState('');
  const [format, setFormat] = useState('');
  const [draft, setDraft] = useState<OpenWikiFormatDraft | null>(null);
  const [references, setReferences] = useState<OpenWikiReferenceSource[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [parseDetail, setParseDetail] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const modelOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      { value: FOLLOW_CURRENT, label: t('settings.openwiki.model.followCurrent') },
    ];
    for (const provider of providers || []) {
      for (const model of provider.models || []) {
        if (!model?.id) continue;
        options.push({
          value: `${provider.id}/${model.id}`,
          label: `${provider.id}/${model.name || model.id}`,
        });
      }
    }
    return options;
  }, [providers, t]);

  const resolvedModel = useMemo(() => {
    if (modelOverride.trim()) return modelOverride.trim();
    if (currentProviderId && currentModelId) return `${currentProviderId}/${currentModelId}`;
    return undefined;
  }, [modelOverride, currentProviderId, currentModelId]);

  const reloadProjectState = async (signal?: AbortSignal) => {
    if (!directory) {
      setLoadError(t('settings.openwiki.noProject'));
      setReferences([]);
      setDraft(null);
      return;
    }
    const [bundle, refs, nextDraft] = await Promise.all([
      fetchOpenWikiFormat(directory, signal),
      fetchOpenWikiReferenceSources(directory, signal),
      fetchOpenWikiFormatDraft(directory, signal),
    ]);
    if (signal?.aborted) return;
    setInstructions(bundle.instructions || '');
    setFormat(bundle.format || '');
    setReferences(refs.files || []);
    setDraft(nextDraft);
    setLoadError(null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await runtimeFetch('/api/config/settings', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || cancelled) return;
        const settings = (await response.json()) as DesktopSettings;
        const nextEnabled = settings.openWikiEnabled !== false;
        const nextAutoReveal = settings.openWikiAutoReveal !== false;
        setEnabled(nextEnabled);
        setAutoReveal(nextAutoReveal);
        setModelOverride(settings.openWikiModelOverride || '');
        useFeatureFlagsStore.getState().setOpenWikiEnabled(nextEnabled);
        useFeatureFlagsStore.getState().setOpenWikiAutoReveal(nextAutoReveal);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reloadProjectState(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => controller.abort();
    // Project reload is keyed by directory; reloadProjectState closes over latest helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, t]);

  const persistSettings = async (patch: Partial<DesktopSettings>) => {
    reportSettingsSaveState('saving');
    try {
      await updateDesktopSettings(patch);
      if (typeof patch.openWikiEnabled === 'boolean') {
        useFeatureFlagsStore.getState().setOpenWikiEnabled(patch.openWikiEnabled);
      }
      if (typeof patch.openWikiAutoReveal === 'boolean') {
        useFeatureFlagsStore.getState().setOpenWikiAutoReveal(patch.openWikiAutoReveal);
      }
      reportSettingsSaveState('saved');
    } catch {
      reportSettingsSaveState('error');
    }
  };

  const saveFormat = async (patch: { instructions?: string; format?: string }) => {
    if (!directory) return;
    reportSettingsSaveState('saving');
    try {
      const bundle = await saveOpenWikiFormat(directory, patch);
      setInstructions(bundle.instructions || '');
      setFormat(bundle.format || '');
      reportSettingsSaveState('saved');
    } catch {
      reportSettingsSaveState('error');
    }
  };

  const importPreparedFiles = async (
    files: Array<{ name: string; contentBase64: string; size: number }>,
  ) => {
    if (!directory || files.length === 0) return;
    const needsConfirm = files.some((file) => file.size > REFERENCE_CONFIRM_BYTES);
    if (needsConfirm && !window.confirm(t('settings.openwiki.references.confirmLarge'))) {
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await uploadOpenWikiReferenceSources(
        directory,
        files.map((file) => ({
          name: file.name,
          contentBase64: file.contentBase64,
          confirmLarge: file.size > REFERENCE_CONFIRM_BYTES,
        })),
        { confirmLarge: needsConfirm },
      );
      setReferences(result.files || []);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  const importBrowserFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => /\.(md|doc|docx)$/i.test(file.name));
    if (files.length === 0) {
      setActionError(t('settings.openwiki.references.typeHint'));
      return;
    }
    const prepared = await Promise.all(files.map(async (file) => ({
      name: file.name,
      size: file.size,
      contentBase64: await fileToBase64(file),
    })));
    await importPreparedFiles(prepared);
  };

  const importNativeFiles = async () => {
    if (!hasDesktopInvoke() || !isDesktopLocalOriginActive()) {
      setActionError(t('settings.openwiki.references.desktopOnly'));
      return;
    }
    const picked = await pickDesktopReferenceFiles();
    if (!picked.success) {
      if (picked.error && picked.error !== 'cancelled') setActionError(picked.error);
      return;
    }
    if ((picked.files?.length || 0) === 0) return;
    if ((picked.files?.length || 0) > 10) {
      if (!window.confirm(t('settings.openwiki.references.confirmFolderCount', { count: String(picked.files?.length || 0) }))) {
        return;
      }
    }
    const prepared = [];
    for (const file of picked.files || []) {
      const read = await readDesktopFileBase64(file.path);
      if (!read.success || !read.base64) {
        setActionError(read.error || t('settings.openwiki.references.readFailed'));
        return;
      }
      prepared.push({ name: file.name, size: read.size || file.size, contentBase64: read.base64 });
    }
    await importPreparedFiles(prepared);
  };

  const importNativeFolder = async () => {
    if (!hasDesktopInvoke() || !isDesktopLocalOriginActive()) {
      setActionError(t('settings.openwiki.references.desktopOnly'));
      return;
    }
    const scanned = await scanDesktopReferenceFolder();
    if (!scanned.success) {
      if (scanned.error && scanned.error !== 'cancelled') setActionError(scanned.error);
      return;
    }
    const files = scanned.files || [];
    if (files.length === 0) {
      setActionError(t('settings.openwiki.references.folderEmpty'));
      return;
    }
    if (!window.confirm(t('settings.openwiki.references.confirmFolderCount', { count: String(files.length) }))) {
      return;
    }
    const limited = files.slice(0, 10);
    const prepared = [];
    for (const file of limited) {
      const read = await readDesktopFileBase64(file.path);
      if (!read.success || !read.base64) {
        setActionError(read.error || t('settings.openwiki.references.readFailed'));
        return;
      }
      prepared.push({ name: file.name, size: read.size || file.size, contentBase64: read.base64 });
    }
    await importPreparedFiles(prepared);
  };

  const runParse = async () => {
    if (!directory || actionBusy) return;
    if (!resolvedModel) {
      setActionError(t('settings.openwiki.parse.modelRequired'));
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setParseDetail(t('settings.openwiki.parse.running'));
    try {
      await startOpenWikiFormatParse(directory, { model: resolvedModel });
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        const progress = await fetchOpenWikiProgress(directory);
        const job = progress.job;
        if (job?.detail) setParseDetail(job.detail);
        if (!job || ['completed', 'failed', 'cancelled'].includes(job.stage)) {
          if (job?.stage === 'failed') {
            throw new OpenWikiApiError(job.error?.message || t('settings.openwiki.parse.failed'), {
              code: job.error?.code,
            });
          }
          break;
        }
      }
      const nextDraft = await fetchOpenWikiFormatDraft(directory);
      setDraft(nextDraft);
      setParseDetail(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setParseDetail(null);
    } finally {
      setActionBusy(false);
    }
  };

  const runMerge = async () => {
    if (!directory || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await mergeOpenWikiFormatDraft(directory, { model: resolvedModel });
      setInstructions(result.bundle.instructions || '');
      setFormat(result.bundle.format || '');
      setDraft(result.draft);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  const runReset = async () => {
    if (!directory || actionBusy) return;
    if (!window.confirm(t('settings.openwiki.reset.confirm'))) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const bundle = await resetOpenWikiFormat(directory);
      setInstructions(bundle.instructions || '');
      setFormat(bundle.format || '');
      setDraft(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <SettingsPageLayout
      title={t('settings.page.openwiki.title')}
      description={t('settings.page.openwiki.description')}
      showSaveStatus
    >
      <SettingsSection title={t('settings.openwiki.section.general')} divider={false}>
        <SettingsCheckboxRow
          settingsItem="openwiki.enabled"
          label={t('settings.openwiki.enabled.label')}
          info={t('settings.openwiki.enabled.info')}
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            void persistSettings({ openWikiEnabled: checked });
          }}
        />
        <SettingsCheckboxRow
          settingsItem="openwiki.auto-reveal"
          label={t('settings.openwiki.autoReveal.label')}
          info={t('settings.openwiki.autoReveal.info')}
          checked={autoReveal}
          onChange={(checked) => {
            setAutoReveal(checked);
            void persistSettings({ openWikiAutoReveal: checked });
          }}
        />
        <SettingsFieldRow
          settingsItem="openwiki.model"
          label={t('settings.openwiki.model.label')}
          info={t('settings.openwiki.model.info')}
        >
          <Select
            value={modelOverride || FOLLOW_CURRENT}
            onValueChange={(value) => {
              const next = value === FOLLOW_CURRENT ? '' : value;
              setModelOverride(next);
              void persistSettings({ openWikiModelOverride: next || undefined });
            }}
          >
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue placeholder={t('settings.openwiki.model.followCurrent')} />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <div className={SETTINGS_HELPER_CLASS}>
          {t('settings.openwiki.model.current', {
            model: currentProviderId && currentModelId
              ? `${currentProviderId}/${currentModelId}`
              : t('settings.openwiki.model.none'),
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.openwiki.section.prompts')}>
        {loadError ? <div className="text-xs text-status-error">{loadError}</div> : null}
        <SettingsFieldRow
          settingsItem="openwiki.brief"
          label={t('settings.openwiki.brief.label')}
          info={t('settings.openwiki.brief.info')}
        >
          <Textarea
            className="min-h-28 w-full max-w-none"
            value={instructions}
            disabled={!directory || actionBusy}
            onChange={(event) => setInstructions(event.target.value)}
            onBlur={() => void saveFormat({ instructions })}
          />
        </SettingsFieldRow>
        <SettingsFieldRow
          settingsItem="openwiki.format"
          label={t('settings.openwiki.format.label')}
          info={t('settings.openwiki.format.info')}
        >
          <Textarea
            className="min-h-40 w-full max-w-none"
            value={format}
            disabled={!directory || actionBusy}
            onChange={(event) => setFormat(event.target.value)}
            onBlur={() => void saveFormat({ format })}
          />
        </SettingsFieldRow>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!directory || actionBusy} onClick={() => void runReset()}>
            {t('settings.openwiki.reset.label')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.openwiki.section.references')}>
        <div
          className={cn(
            'rounded-md border border-dashed border-border-subtle px-3 py-4 text-sm',
            dragOver ? 'border-primary bg-interactive-hover/40' : '',
          )}
          data-settings-item="openwiki.references"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void importBrowserFiles(event.dataTransfer.files);
          }}
        >
          <div className="text-text-strong">{t('settings.openwiki.references.dropTitle')}</div>
          <div className={SETTINGS_HELPER_CLASS}>{t('settings.openwiki.references.typeHint')}</div>
          <div className={cn(SETTINGS_HELPER_CLASS, 'mt-1')}>{t('settings.openwiki.references.limitHint')}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!directory || actionBusy} onClick={() => void importNativeFiles()}>
              {t('settings.openwiki.references.pickFiles')}
            </Button>
            <Button size="sm" variant="ghost" disabled={!directory || actionBusy} onClick={() => void importNativeFolder()}>
              {t('settings.openwiki.references.pickFolder')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!directory || actionBusy}
              onClick={() => {
                const input = document.getElementById('openwiki-reference-file-input');
                if (input instanceof HTMLInputElement) input.click();
              }}
            >
              {t('settings.openwiki.references.browse')}
            </Button>
            <input
              id="openwiki-reference-file-input"
              type="file"
              className="hidden"
              multiple
              accept=".md,.doc,.docx,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={!directory || actionBusy}
              onChange={(event) => {
                if (event.target.files) void importBrowserFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        </div>
        {references.length === 0 ? (
          <div className={SETTINGS_HELPER_CLASS}>{t('settings.openwiki.references.empty')}</div>
        ) : (
          <ul className="space-y-2">
            {references.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 truncate">
                  <span className="text-text-strong">{file.name}</span>
                  <span className="ml-2 text-xs text-text-muted">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={actionBusy}
                  onClick={() => {
                    if (!directory) return;
                    void removeOpenWikiReferenceSource(directory, file.id)
                      .then((result) => setReferences(result.files || []))
                      .catch((error) => setActionError(error instanceof Error ? error.message : String(error)));
                  }}
                >
                  {t('settings.openwiki.references.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.openwiki.section.parse')}>
        <div className={SETTINGS_HELPER_CLASS}>{t('settings.openwiki.parse.info')}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!directory || actionBusy || references.length === 0}
            onClick={() => void runParse()}
          >
            {t('settings.openwiki.parse.label')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!directory || actionBusy || !draft}
            onClick={() => void runMerge()}
          >
            {t('settings.openwiki.merge.label')}
          </Button>
        </div>
        {parseDetail ? <div className={cn(SETTINGS_HELPER_CLASS, 'mt-2')}>{parseDetail}</div> : null}
        {draft ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm font-medium text-text-strong">{t('settings.openwiki.draft.title')}</div>
            <SettingsFieldRow
              settingsItem="openwiki.draft-brief"
              label={t('settings.openwiki.draft.brief')}
            >
              <Textarea className="min-h-24 w-full max-w-none" value={draft.instructions} readOnly />
            </SettingsFieldRow>
            <SettingsFieldRow
              settingsItem="openwiki.draft-format"
              label={t('settings.openwiki.draft.format')}
            >
              <Textarea className="min-h-32 w-full max-w-none" value={draft.format} readOnly />
            </SettingsFieldRow>
          </div>
        ) : (
          <div className={cn(SETTINGS_HELPER_CLASS, 'mt-2')}>{t('settings.openwiki.draft.empty')}</div>
        )}
        {actionError ? <div className="mt-2 text-xs text-status-error">{actionError}</div> : null}
      </SettingsSection>
    </SettingsPageLayout>
  );
}
