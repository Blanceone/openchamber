import { useEffect, useMemo, useState } from 'react';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsCheckboxRow,
  SettingsFieldRow,
  SettingsSection,
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
import { fetchOpenWikiFormat, saveOpenWikiFormat } from '@/lib/openwiki/api';
import type { OpenWikiFormatPresetId } from '@/lib/openwiki/types';
import type { DesktopSettings } from '@/lib/desktop';

const PRESETS: OpenWikiFormatPresetId[] = [
  'openwiki-default',
  'architecture-module',
  'api-service',
  'custom',
];

const FOLLOW_CURRENT = '__follow_current__';

export function OpenWikiPage() {
  const { t } = useI18n();
  const directory = useDirectoryStore((s) => s.currentDirectory);
  const providers = useConfigStore((s) => s.providers);
  const currentProviderId = useConfigStore((s) => s.currentProviderId);
  const currentModelId = useConfigStore((s) => s.currentModelId);

  const [enabled, setEnabled] = useState(true);
  const [autoReveal, setAutoReveal] = useState(true);
  const [language, setLanguage] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [presetId, setPresetId] = useState<OpenWikiFormatPresetId>('openwiki-default');
  const [instructions, setInstructions] = useState('');
  const [format, setFormat] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

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
        setLanguage(settings.openWikiLanguage || '');
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
    if (!directory) {
      setLoadError(t('settings.openwiki.noProject'));
      return;
    }
    let cancelled = false;
    void fetchOpenWikiFormat(directory)
      .then((bundle) => {
        if (cancelled) return;
        setPresetId((bundle.presetId as OpenWikiFormatPresetId) || 'openwiki-default');
        setInstructions(bundle.instructions || '');
        setFormat(bundle.format || '');
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
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

  const saveFormat = async (patch: {
    presetId?: string;
    instructions?: string;
    format?: string;
    applyPreset?: boolean;
  }) => {
    if (!directory) return;
    reportSettingsSaveState('saving');
    try {
      const bundle = await saveOpenWikiFormat(directory, patch);
      setPresetId((bundle.presetId as OpenWikiFormatPresetId) || 'openwiki-default');
      setInstructions(bundle.instructions || '');
      setFormat(bundle.format || '');
      reportSettingsSaveState('saved');
    } catch {
      reportSettingsSaveState('error');
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
          settingsItem="openwiki.language"
          label={t('settings.openwiki.language.label')}
          info={t('settings.openwiki.language.info')}
        >
          <input
            className="h-9 w-48 rounded-md border border-border-subtle bg-transparent px-2 text-sm"
            value={language}
            placeholder="zh-CN"
            onChange={(event) => setLanguage(event.target.value)}
            onBlur={() => void persistSettings({ openWikiLanguage: language.trim() || undefined })}
          />
        </SettingsFieldRow>
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
        <div className="text-xs text-text-muted">
          {t('settings.openwiki.model.current', {
            model: currentProviderId && currentModelId
              ? `${currentProviderId}/${currentModelId}`
              : t('settings.openwiki.model.none'),
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.openwiki.section.format')}>
        {loadError ? <div className="text-xs text-status-error">{loadError}</div> : null}
        <SettingsFieldRow
          settingsItem="openwiki.format-preset"
          label={t('settings.openwiki.preset.label')}
          info={t('settings.openwiki.preset.info')}
        >
          <div className="flex items-center gap-2">
            <Select
              value={presetId}
              onValueChange={(value) => setPresetId(value as OpenWikiFormatPresetId)}
            >
              <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`settings.openwiki.preset.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              disabled={!directory}
              onClick={() => void saveFormat({ presetId, applyPreset: true })}
            >
              {t('settings.openwiki.preset.apply')}
            </Button>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow
          settingsItem="openwiki.brief"
          label={t('settings.openwiki.brief.label')}
          info={t('settings.openwiki.brief.info')}
        >
          <Textarea
            className="min-h-28 w-full max-w-xl"
            value={instructions}
            disabled={!directory}
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
            className="min-h-40 w-full max-w-xl"
            value={format}
            disabled={!directory}
            onChange={(event) => setFormat(event.target.value)}
            onBlur={() => void saveFormat({ format })}
          />
        </SettingsFieldRow>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
