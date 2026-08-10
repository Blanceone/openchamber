import type { DirectoryListResult } from '@/lib/api/types';

export type WikiTreeFile = {
  /** Path relative to the wiki root, using `/` separators. */
  name: string;
  /** Absolute/workspace path used for reading. */
  path: string;
  type: 'file';
};

export type WikiTreeNode =
  | {
      type: 'directory';
      /** Basename only. */
      name: string;
      /** Absolute/workspace path. */
      path: string;
      /** Path relative to the wiki root, using `/` separators. */
      relativePath: string;
      children: WikiTreeNode[];
    }
  | {
      type: 'file';
      /** Basename only. */
      name: string;
      /** Absolute/workspace path used for reading. */
      path: string;
      /** Path relative to the wiki root, using `/` separators. */
      relativePath: string;
    };

const DEFAULT_SKIP_DIRS = new Set(['node_modules', '.git', 'reference-sources']);

const normalizeSlashes = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '');

const joinRootPath = (root: string, relativePath: string): string => {
  if (!relativePath) return root;
  return `${root}/${relativePath}`;
};

const basename = (relativePath: string): string => {
  const parts = relativePath.split('/').filter(Boolean);
  return parts[parts.length - 1] || relativePath;
};

const compareWikiNodes = (a: WikiTreeNode, b: WikiTreeNode): number => {
  if (a.type !== b.type) {
    return a.type === 'directory' ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
};

type MutableDir = {
  kind: 'directory';
  name: string;
  path: string;
  relativePath: string;
  children: Map<string, MutableDir | WikiTreeNode>;
};

const isMutableDir = (node: MutableDir | WikiTreeNode): node is MutableDir =>
  'kind' in node && node.kind === 'directory';

const toSortedNodes = (children: Map<string, MutableDir | WikiTreeNode>): WikiTreeNode[] => {
  const nodes: WikiTreeNode[] = [];
  for (const child of children.values()) {
    if (isMutableDir(child)) {
      nodes.push({
        type: 'directory',
        name: child.name,
        path: child.path,
        relativePath: child.relativePath,
        children: toSortedNodes(child.children),
      });
      continue;
    }
    nodes.push(child);
  }
  nodes.sort(compareWikiNodes);
  return nodes;
};

/**
 * Build a nested folder/file tree from flat wiki markdown pages.
 * Directory nodes mirror the real relative paths under the wiki root.
 */
export const buildWikiTree = (pages: WikiTreeFile[], wikiRoot: string): WikiTreeNode[] => {
  const root = normalizeSlashes(wikiRoot);
  const rootChildren = new Map<string, MutableDir | WikiTreeNode>();

  for (const page of pages) {
    const relativePath = normalizeSlashes(page.name).replace(/^\/+/, '');
    if (!relativePath) continue;
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let cursor = rootChildren;
    let parentRelative = '';

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const isLeaf = index === parts.length - 1;
      const nextRelative = parentRelative ? `${parentRelative}/${part}` : part;

      if (isLeaf) {
        cursor.set(part, {
          type: 'file',
          name: part,
          path: normalizeSlashes(page.path),
          relativePath: nextRelative,
        });
        break;
      }

      const existing = cursor.get(part);
      let dir: MutableDir;
      if (existing && isMutableDir(existing)) {
        dir = existing;
      } else {
        dir = {
          kind: 'directory',
          name: part,
          path: joinRootPath(root, nextRelative),
          relativePath: nextRelative,
          children: new Map(),
        };
        cursor.set(part, dir);
      }
      cursor = dir.children;
      parentRelative = nextRelative;
    }
  }

  return toSortedNodes(rootChildren);
};

/** Collect directory relative paths for default expand state. */
export const collectWikiDirectoryPaths = (nodes: WikiTreeNode[]): string[] => {
  const paths: string[] = [];
  const walk = (list: WikiTreeNode[]) => {
    for (const node of list) {
      if (node.type !== 'directory') continue;
      paths.push(node.relativePath);
      walk(node.children);
    }
  };
  walk(nodes);
  return paths;
};

/**
 * Recursively list markdown pages under a wiki root.
 * Control files (INSTRUCTIONS/FORMAT/marker/…) and skipped directories are omitted.
 */
export const listWikiMarkdownPages = async (
  listDirectory: (path: string) => Promise<DirectoryListResult>,
  wikiRoot: string,
  options: {
    controlNames?: ReadonlySet<string>;
    skipDirectories?: ReadonlySet<string>;
  } = {},
): Promise<WikiTreeFile[]> => {
  const controlNames = options.controlNames ?? new Set<string>();
  const skipDirectories = options.skipDirectories ?? DEFAULT_SKIP_DIRS;
  const root = normalizeSlashes(wikiRoot);
  const pages: WikiTreeFile[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let listed: DirectoryListResult;
    try {
      listed = await listDirectory(current);
    } catch {
      // One failed directory must not erase pages discovered elsewhere.
      continue;
    }
    for (const entry of listed.entries || []) {
      if (!entry?.name || !entry.path) continue;
      if (controlNames.has(entry.name)) continue;
      const entryPath = normalizeSlashes(entry.path);
      if (entry.isDirectory) {
        if (skipDirectories.has(entry.name)) continue;
        stack.push(entryPath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      const relative = entryPath === root
        ? entry.name
        : entryPath.startsWith(`${root}/`)
          ? entryPath.slice(root.length + 1)
          : entry.name;
      pages.push({
        name: relative,
        path: entryPath,
        type: 'file',
      });
    }
  }

  pages.sort((a, b) => a.name.localeCompare(b.name));
  return pages;
};

export const pickDefaultWikiPage = (pages: WikiTreeFile[]): WikiTreeFile | null => {
  if (pages.length === 0) return null;
  return (
    pages.find((page) => page.name.toLowerCase() === 'index.md')
    || pages.find((page) => basename(page.name).toLowerCase() === 'index.md')
    || pages[0]
  );
};
