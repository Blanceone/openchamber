import React from 'react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { isDesktopShell } from '@/lib/desktop';
import { setDesktopWindowTitle } from '@/lib/desktopNative';

const APP_TITLE = 'OpenChamber';

const formatProjectLabel = (label: string): string => {
  return label.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const getProjectNameFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
};

const buildWindowTitle = (projectLabel: string | null): string => {
  const parts = [projectLabel, APP_TITLE].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return parts.join(' | ');
};

export const useWindowTitle = () => {
  const activeProject = useProjectsStore((state) => {
    if (!state.activeProjectId) {
      return null;
    }
    return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
  });

  const projectLabel = React.useMemo(() => {
    if (!activeProject) {
      return null;
    }

    const label = activeProject.label?.trim();
    if (label) {
      return formatProjectLabel(label);
    }

    const pathName = getProjectNameFromPath(activeProject.path);
    if (pathName) {
      return formatProjectLabel(pathName);
    }

    return null;
  }, [activeProject]);

  const title = React.useMemo(() => buildWindowTitle(projectLabel), [projectLabel]);

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = title;
    }

    if (!isDesktopShell()) {
      return;
    }

    const applyTitle = async () => {
      try {
        const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent || '');
        if (isMac) {
          return;
        }

        await setDesktopWindowTitle(title);
      } catch {
        return;
      }
    };

    void applyTitle();
  }, [title]);
};
