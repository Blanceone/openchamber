import { describe, expect, it, vi } from 'vitest';
import {
  buildWikiTree,
  collectWikiDirectoryPaths,
  listWikiMarkdownPages,
  pickDefaultWikiPage,
} from './wiki-tree';

describe('listWikiMarkdownPages', () => {
  it('recurses into subdirectories and skips control files', async () => {
    const listDirectory = vi.fn(async (path: string) => {
      if (path.endsWith('.wiki')) {
        return {
          directory: path,
          entries: [
            { name: 'INSTRUCTIONS.md', path: `${path}/INSTRUCTIONS.md`, isDirectory: false },
            { name: 'configuration.md', path: `${path}/configuration.md`, isDirectory: false },
            { name: 'architecture', path: `${path}/architecture`, isDirectory: true },
            { name: 'reference-sources', path: `${path}/reference-sources`, isDirectory: true },
          ],
        };
      }
      if (path.endsWith('/architecture')) {
        return {
          directory: path,
          entries: [
            { name: 'overview.md', path: `${path}/overview.md`, isDirectory: false },
          ],
        };
      }
      if (path.endsWith('/reference-sources')) {
        return {
          directory: path,
          entries: [{ name: 'notes.md', path: `${path}/notes.md`, isDirectory: false }],
        };
      }
      return { directory: path, entries: [] };
    });

    const pages = await listWikiMarkdownPages(listDirectory, '/project/.wiki', {
      controlNames: new Set(['INSTRUCTIONS.md', 'FORMAT.md']),
    });

    expect(pages.map((page) => page.name)).toEqual([
      'architecture/overview.md',
      'configuration.md',
    ]);
    expect(listDirectory).toHaveBeenCalledWith('/project/.wiki');
    expect(listDirectory).toHaveBeenCalledWith('/project/.wiki/architecture');
    expect(listDirectory).not.toHaveBeenCalledWith('/project/.wiki/reference-sources');
  });

  it('keeps pages from successful directories when one listing fails', async () => {
    const listDirectory = vi.fn(async (path: string) => {
      if (path.endsWith('.wiki')) {
        return {
          directory: path,
          entries: [
            { name: 'ok.md', path: `${path}/ok.md`, isDirectory: false },
            { name: 'broken', path: `${path}/broken`, isDirectory: true },
          ],
        };
      }
      throw new Error('permission denied');
    });

    const pages = await listWikiMarkdownPages(listDirectory, '/project/.wiki');
    expect(pages).toEqual([{ name: 'ok.md', path: '/project/.wiki/ok.md', type: 'file' }]);
  });
});

describe('buildWikiTree', () => {
  it('nests pages under real folder structure with dirs first', () => {
    const pages = [
      { name: 'zulu.md', path: '/project/.wiki/zulu.md', type: 'file' as const },
      { name: 'architecture/deep/overview.md', path: '/project/.wiki/architecture/deep/overview.md', type: 'file' as const },
      { name: 'architecture/api.md', path: '/project/.wiki/architecture/api.md', type: 'file' as const },
      { name: 'configuration.md', path: '/project/.wiki/configuration.md', type: 'file' as const },
    ];

    const tree = buildWikiTree(pages, '/project/.wiki');
    expect(tree.map((node) => `${node.type}:${node.name}`)).toEqual([
      'directory:architecture',
      'file:configuration.md',
      'file:zulu.md',
    ]);

    const architecture = tree[0];
    expect(architecture.type).toBe('directory');
    if (architecture.type !== 'directory') return;
    expect(architecture.relativePath).toBe('architecture');
    expect(architecture.path).toBe('/project/.wiki/architecture');
    expect(architecture.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      'directory:deep',
      'file:api.md',
    ]);

    const deep = architecture.children[0];
    expect(deep.type).toBe('directory');
    if (deep.type !== 'directory') return;
    expect(deep.children).toEqual([
      {
        type: 'file',
        name: 'overview.md',
        path: '/project/.wiki/architecture/deep/overview.md',
        relativePath: 'architecture/deep/overview.md',
      },
    ]);
  });

  it('collects every directory relative path for expand state', () => {
    const tree = buildWikiTree(
      [
        { name: 'a/b/c.md', path: '/w/a/b/c.md', type: 'file' },
        { name: 'root.md', path: '/w/root.md', type: 'file' },
      ],
      '/w',
    );
    expect(collectWikiDirectoryPaths(tree).sort()).toEqual(['a', 'a/b']);
  });
});

describe('pickDefaultWikiPage', () => {
  it('prefers index.md when present', () => {
    const pages = [
      { name: 'a.md', path: '/a.md', type: 'file' as const },
      { name: 'index.md', path: '/index.md', type: 'file' as const },
    ];
    expect(pickDefaultWikiPage(pages)?.name).toBe('index.md');
  });

  it('prefers nested index.md by basename', () => {
    const pages = [
      { name: 'guides/start.md', path: '/guides/start.md', type: 'file' as const },
      { name: 'guides/index.md', path: '/guides/index.md', type: 'file' as const },
    ];
    expect(pickDefaultWikiPage(pages)?.name).toBe('guides/index.md');
  });
});
