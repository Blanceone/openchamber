import { isDesktopShell, isVSCodeRuntime } from '@/lib/desktop';

export type HostedSurface = 'desktop' | 'mobile';

declare global {
  interface Window {
    __OPENCHAMBER_SURFACE__?: HostedSurface;
  }
}

/**
 * Windows desktop product always uses the desktop hosted surface.
 * Mobile / Capacitor product surfaces were removed from this monorepo.
 */
export const detectHostedSurface = (): HostedSurface => {
  if (typeof window === 'undefined') return 'desktop';

  const explicitSurface = window.__OPENCHAMBER_SURFACE__;
  if (explicitSurface === 'desktop' || explicitSurface === 'mobile') {
    return explicitSurface === 'mobile' ? 'desktop' : explicitSurface;
  }

  if (isDesktopShell() || isVSCodeRuntime()) return 'desktop';
  return 'desktop';
};

export const resolveHostedSurface = (): HostedSurface => {
  const surface = detectHostedSurface();
  if (typeof window !== 'undefined') {
    window.__OPENCHAMBER_SURFACE__ = surface;
  }
  return surface;
};

export const isMobileSurfaceRuntime = (): boolean => false;
