/**
 * Mobile shell actions were removed with the Capacitor product surface.
 * Shared desktop UI still calls this hook; it always returns null.
 */
export type MobileAppActions = {
  openFiles: (path?: string) => void;
  openChanges: (options?: { diffPath?: string; staged?: boolean }) => void;
};

export const useMobileAppActions = (): MobileAppActions | null => null;
