import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureOpenWikiDependencyModules } from './resolve-package.js';

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ensureOpenWikiDependencyModules', () => {
  it('binds vendor_modules to node_modules when packaged deps are renamed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwiki-vendor-'));
    tempRoots.push(root);
    const vendor = path.join(root, 'vendor_modules', '@anthropic-ai', 'vertex-sdk');
    fs.mkdirSync(vendor, { recursive: true });
    fs.writeFileSync(path.join(vendor, 'package.json'), '{"name":"@anthropic-ai/vertex-sdk"}\n');

    const resolved = ensureOpenWikiDependencyModules(root);
    expect(resolved.nodeModules).toBe(path.join(root, 'node_modules'));
    expect(fs.existsSync(path.join(root, 'node_modules', '@anthropic-ai', 'vertex-sdk', 'package.json'))).toBe(true);
  });

  it('throws when neither tree has required packages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwiki-empty-'));
    tempRoots.push(root);
    expect(() => ensureOpenWikiDependencyModules(root)).toThrow(/vendor_modules/);
  });
});
