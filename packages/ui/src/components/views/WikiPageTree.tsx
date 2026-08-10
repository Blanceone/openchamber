import type { WikiTreeNode } from '@/lib/openwiki/wiki-tree';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type WikiPageTreeProps = {
  nodes: WikiTreeNode[];
  selectedPath: string | null;
  expandedDirs: ReadonlySet<string>;
  onToggleDirectory: (relativePath: string) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
};

export function WikiPageTree({
  nodes,
  selectedPath,
  expandedDirs,
  onToggleDirectory,
  onSelectFile,
  depth = 0,
}: WikiPageTreeProps) {
  const { t } = useI18n();

  if (nodes.length === 0) return null;

  return (
    <ul className={cn(depth === 0 ? 'space-y-0.5' : 'mt-0.5 space-y-0.5')}>
      {nodes.map((node) => {
        const paddingLeft = 8 + depth * 12;
        if (node.type === 'directory') {
          const expanded = expandedDirs.has(node.relativePath);
          return (
            <li key={`dir:${node.path}`}>
              <button
                type="button"
                title={node.relativePath}
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? t('sessions.sidebar.folderItem.collapseAria', { folderName: node.name })
                    : t('sessions.sidebar.folderItem.expandAria', { folderName: node.name })
                }
                className={cn(
                  'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-text-muted hover:bg-interactive-hover',
                )}
                style={{ paddingLeft }}
                onClick={() => onToggleDirectory(node.relativePath)}
              >
                <Icon
                  name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <Icon
                  name={expanded ? 'folder-open' : 'folder-3'}
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
              {expanded ? (
                <WikiPageTree
                  nodes={node.children}
                  selectedPath={selectedPath}
                  expandedDirs={expandedDirs}
                  onToggleDirectory={onToggleDirectory}
                  onSelectFile={onSelectFile}
                  depth={depth + 1}
                />
              ) : null}
            </li>
          );
        }

        const selected = selectedPath === node.path;
        return (
          <li key={`file:${node.path}`}>
            <button
              type="button"
              title={node.relativePath}
              className={cn(
                'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs',
                selected
                  ? 'bg-interactive-selection text-text-strong'
                  : 'text-text-muted hover:bg-interactive-hover',
              )}
              style={{ paddingLeft }}
              onClick={() => onSelectFile(node.path)}
            >
              <span className="inline-flex h-3 w-3 shrink-0" aria-hidden="true" />
              <FileTypeIcon filePath={node.path} extension="md" className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
