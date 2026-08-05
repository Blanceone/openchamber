import React from 'react';
import { isDesktopShell, restartDesktopApp } from '@/lib/desktop';
import { DesktopConnectionRecovery, type RecoveryVariant } from './DesktopConnectionRecovery';
import { resolveRecoveryNextStep } from './desktopRecoveryRouting';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';
import { runtimeFetch } from '@/lib/runtime-fetch';

type RecoveryScreenProps = {
  variant: RecoveryVariant;
  hostUrl?: string;
  hostLabel?: string;
  onRetry?: () => void;
  onEnterLocalSetup?: () => void;
  isRetrying?: boolean;
  localAvailable?: boolean;
};

export function RecoveryScreen({
  variant,
  hostUrl,
  hostLabel,
  onRetry,
  onEnterLocalSetup,
  isRetrying = false,
  localAvailable = true,
}: RecoveryScreenProps) {
  const persistLocalChoice = React.useCallback(async () => {
    if (!isDesktopShell()) return;

    const config = await desktopHostsGet();
    await desktopHostsSet({
      ...config,
      defaultHostId: 'local',
      initialHostChoiceCompleted: true,
    });
  }, []);

  const handleRecoveryRetry = React.useCallback(async () => {
    if (isDesktopShell()) {
      await restartDesktopApp();
      return;
    }

    await runtimeFetch('/api/config/reload', { method: 'POST' });
    onRetry?.();
  }, [onRetry]);

  const handleRecoveryUseLocal = React.useCallback(async () => {
    const step = resolveRecoveryNextStep(variant, 'use-local');
    if (step.kind === 'local-setup') {
      onEnterLocalSetup?.();
      return;
    }

    await persistLocalChoice();

    if (isDesktopShell()) {
      await restartDesktopApp();
      return;
    }

    window.location.reload();
  }, [variant, persistLocalChoice, onEnterLocalSetup]);

  return (
    <DesktopConnectionRecovery
      variant={variant}
      hostLabel={hostLabel}
      hostUrl={hostUrl}
      onRetry={handleRecoveryRetry}
      onUseLocal={localAvailable ? handleRecoveryUseLocal : undefined}
      isRetrying={isRetrying}
    />
  );
}
