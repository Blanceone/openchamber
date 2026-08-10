import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addReferenceSources,
  extractReferenceSourceText,
  listReferenceSources,
  removeReferenceSource,
  REFERENCE_SOURCE_MAX_FILES,
} from './reference-sources.js';

describe('OpenWiki reference sources', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openwiki-ref-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('extracts markdown and docx text', () => {
    expect(extractReferenceSourceText(Buffer.from('# Hello\nworld', 'utf8'), '.md').text).toContain('Hello');

    // Minimal zip with word/document.xml — use AdmZip via addReferenceSources path indirectly.
    // Here just verify empty docx without zip returns a warning.
    const bad = extractReferenceSourceText(Buffer.from('not-a-zip'), '.docx');
    expect(bad.text).toBe('');
    expect(bad.warning).toBeTruthy();
  });

  it('imports, lists, and removes reference files with the 10-file cap', async () => {
    const first = await addReferenceSources(tempRoot, {
      files: [
        { name: 'a.md', contentBase64: Buffer.from('# A', 'utf8').toString('base64') },
        { name: 'b.md', contentBase64: Buffer.from('# B', 'utf8').toString('base64') },
      ],
    });
    expect(first.count).toBe(2);
    expect(first.maxFiles).toBe(REFERENCE_SOURCE_MAX_FILES);

    const listed = await listReferenceSources(tempRoot);
    expect(listed.files.map((file) => file.name).sort()).toEqual(['a.md', 'b.md']);

    const afterRemove = await removeReferenceSource(tempRoot, 'a.md');
    expect(afterRemove.count).toBe(1);
    expect(afterRemove.files[0]?.name).toBe('b.md');
  });

  it('rejects unsupported types', async () => {
    await expect(addReferenceSources(tempRoot, {
      files: [{ name: 'x.png', contentBase64: Buffer.from('x').toString('base64') }],
    })).rejects.toMatchObject({ code: 'reference-type-unsupported' });
  });

  it('requires confirmation for files over 10MB', async () => {
    const large = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    await expect(addReferenceSources(tempRoot, {
      files: [{ name: 'large.md', contentBase64: large.toString('base64') }],
    })).rejects.toMatchObject({ code: 'reference-size-confirm-required' });

    const accepted = await addReferenceSources(tempRoot, {
      files: [{ name: 'large.md', contentBase64: large.toString('base64'), confirmLarge: true }],
      confirmLarge: true,
    });
    expect(accepted.count).toBe(1);
  });
});
