import { isDesktopShell, isVSCodeRuntime } from '@/lib/desktop';

/** Capacitor mobile shell was removed; always false in this Windows-desktop product. */
export const isCapacitorApp = (): boolean => false;

// TEMPORARY WORKAROUND — Windows ARM64: native opencode.exe fails with a Bun
// FFI/TinyCC dlopen error (https://github.com/anomalyco/opencode/issues/19130).
// Suppress OpenCode update UI on ARM64 so it can't self-upgrade to the broken
// ARM64 build. Remove this helper and its call sites when resolved upstream.
export const isWindowsArm64 = (): boolean => {
  if (typeof window === 'undefined') return false;

  const electronArch = window.__OPENCHAMBER_ELECTRON__?.arch?.toLowerCase?.();
  if (electronArch === 'arm64' || electronArch === 'aarch64') {
    const platform = (navigator.platform || '').toLowerCase();
    return platform.includes('win');
  }

  const nav = (navigator as Navigator & { userAgentData?: { architecture?: string; platform?: string } }).userAgentData;
  if (nav?.architecture?.toLowerCase?.() === 'arm64' || nav?.architecture?.toLowerCase?.() === 'aarch64') {
    const platform = (nav.platform || navigator.platform || '').toLowerCase();
    return platform.includes('win');
  }

  const ua = navigator.userAgent.toLowerCase();
  if ((ua.includes('aarch64') || ua.includes('arm64') || ua.includes('armv')) && ua.includes('windows')) {
    return true;
  }

  return false;
};

/** Capacitor iPad shell was removed. */
export const isIPadApp = (): boolean => false;

export type ClientPlatform = 'ios' | 'android' | 'vscode' | 'desktop' | 'web';

/**
 * The runtime surface this client is. Used by the push presence model: only 'ios'/'android'
 * count as mobile (push recipients); everything else is an interactive surface that suppresses
 * mobile push while visible.
 */
export const getClientPlatform = (): ClientPlatform => {
  if (isVSCodeRuntime()) return 'vscode';
  if (isDesktopShell()) return 'desktop';
  return 'web';
};
