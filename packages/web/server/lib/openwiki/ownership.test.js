import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyWikiOwnership } from './ownership.js';
import { writeMarker } from './marker.js';

/** @type {string[]} */
const temps = [];

const makeTemp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-openwiki-'));
  temps.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('classifyWikiOwnership', () => {
  it('returns absent for an empty project', () => {
    const project = makeTemp();
    const result = classifyWikiOwnership(project);
    expect(result.ownership).toBe('absent');
    expect(result.consentRequired).toBe(false);
  });

  it('returns openchamber-managed when marker exists', async () => {
    const project = makeTemp();
    await writeMarker(project, { formatPresetId: 'openwiki-default' });
    fs.writeFileSync(path.join(project, '.wiki', 'index.md'), '# hi\n');
    const result = classifyWikiOwnership(project);
    expect(result.ownership).toBe('openchamber-managed');
    expect(result.consentRequired).toBe(false);
  });

  it('returns foreign when .wiki exists without marker', () => {
    const project = makeTemp();
    fs.mkdirSync(path.join(project, '.wiki'));
    fs.writeFileSync(path.join(project, '.wiki', 'index.md'), '# team doc\n');
    const result = classifyWikiOwnership(project);
    expect(result.ownership).toBe('foreign');
    expect(result.consentRequired).toBe(true);
  });
});
