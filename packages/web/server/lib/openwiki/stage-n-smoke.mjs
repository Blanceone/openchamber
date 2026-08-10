/**
 * Stage N smoke: reference import → reset → export docx → limits → remove.
 * Parse without a usable model must fail cleanly (no hang).
 *
 * Run from repo: bun packages/web/server/lib/openwiki/stage-n-smoke.mjs
 */
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const results = [];
const ok = (name, detail = '') => {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, error) => {
  const detail = error instanceof Error ? `${error.code ? `[${error.code}] ` : ''}${error.message}` : String(error);
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
};

const step = async (name, fn) => {
  try {
    const detail = await fn();
    ok(name, typeof detail === 'string' ? detail : '');
  } catch (error) {
    fail(name, error);
  }
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openwiki-stage-n-smoke-'));
console.log(`Smoke workspace: ${tempRoot}\n`);

try {
  const {
    addReferenceSources,
    listReferenceSources,
    removeReferenceSource,
  } = await import('./reference-sources.js');
  const {
    resetFormatBundle,
    readFormatDraft,
    writeFormatDraft,
    parseDraftMarkers,
    startFormatParseJob,
  } = await import('./format-parse.js');
  const { readFormatBundle, writeFormatBundle } = await import('./format.js');
  const { buildWikiDocxExport, markdownToDocxBuffer } = await import('./md-docx.js');
  const { writeMarker } = await import('./marker.js');
  const { getWikiRoot } = await import('./paths.js');
  const { getJob } = await import('./job-store.js');
  const { DEFAULT_FORMAT_PRESET_ID, getPresetBodies } = await import('./presets.js');

  await step('seed managed wiki with pages', async () => {
    const wikiRoot = getWikiRoot(tempRoot);
    await fsPromises.mkdir(wikiRoot, { recursive: true });
    await writeMarker(tempRoot, { formatPresetId: DEFAULT_FORMAT_PRESET_ID });
    await fsPromises.writeFile(
      path.join(wikiRoot, 'index.md'),
      '# 冒烟首页\n\n导出用页面。\n\n```mermaid\nflowchart LR\n  A --> B\n```\n',
      'utf8',
    );
    await fsPromises.writeFile(path.join(wikiRoot, 'module-a.md'), '# 模块 A\n\n- 职责\n', 'utf8');
    return 'index.md + module-a.md';
  });

  await step('import two reference markdown files', async () => {
    const imported = await addReferenceSources(tempRoot, {
      files: [
        {
          name: 'brief.md',
          contentBase64: Buffer.from('# 产品说明\n\n模块边界与 API。\n', 'utf8').toString('base64'),
        },
        {
          name: 'format-notes.md',
          contentBase64: Buffer.from('# 格式\n\n简体中文 + Mermaid。\n', 'utf8').toString('base64'),
        },
      ],
    });
    if (imported.count !== 2) throw new Error(`expected 2, got ${imported.count}`);
    return imported.files.map((f) => f.name).join(', ');
  });

  await step('list reference sources', async () => {
    const listed = await listReferenceSources(tempRoot);
    if (listed.count !== 2) throw new Error(`expected 2, got ${listed.count}`);
    return `count=${listed.count} max=${listed.maxFiles}`;
  });

  await step('reject more than 10 reference files', async () => {
    const fillers = Array.from({ length: 9 }, (_, i) => ({
      name: `extra-${i}.md`,
      contentBase64: Buffer.from(`# ${i}`, 'utf8').toString('base64'),
    }));
    try {
      await addReferenceSources(tempRoot, { files: fillers });
      throw new Error('expected reference-limit');
    } catch (error) {
      if (error?.code !== 'reference-limit') throw error;
      return error.code;
    }
  });

  await step('require confirmation for files over 10MB', async () => {
    const large = Buffer.alloc(10 * 1024 * 1024 + 8, 0x61);
    try {
      await addReferenceSources(tempRoot, {
        files: [{ name: 'large.md', contentBase64: large.toString('base64') }],
      });
      throw new Error('expected reference-size-confirm-required');
    } catch (error) {
      if (error?.code !== 'reference-size-confirm-required') throw error;
      return error.code;
    }
  });

  await step('reset format to built-in defaults', async () => {
    await writeFormatBundle(tempRoot, {
      instructions: '临时简报',
      format: '临时格式',
      presetId: 'custom',
    });
    await writeFormatDraft(tempRoot, {
      instructions: '草案',
      format: '草案格式',
      sourceFiles: ['brief.md'],
    });
    const resetBundle = await resetFormatBundle(tempRoot);
    const defaults = getPresetBodies(DEFAULT_FORMAT_PRESET_ID);
    if (!resetBundle.format.includes('Simplified Chinese')) throw new Error('missing zh-CN rule');
    if (!resetBundle.format.includes('Mermaid')) throw new Error('missing Mermaid rule');
    if (resetBundle.instructions !== defaults.instructions) throw new Error('instructions mismatch');
    if (await readFormatDraft(tempRoot)) throw new Error('draft should be cleared');
    return 'zh-CN + Mermaid; draft cleared';
  });

  await step('export each wiki page to docx (no model)', async () => {
    const exported = await buildWikiDocxExport(tempRoot);
    if (exported.files.length < 2) throw new Error(`expected >=2, got ${exported.files.length}`);
    for (const file of exported.files) {
      if (!file.relativePath.endsWith('.docx')) throw new Error(file.relativePath);
      if (Buffer.from(file.contentBase64, 'base64').length < 100) {
        throw new Error(`tiny ${file.relativePath}`);
      }
    }
    const joined = exported.files.map((f) => f.relativePath).sort().join(', ');
    if (/reference-sources|INSTRUCTIONS|FORMAT|openchamber/i.test(joined)) {
      throw new Error(`leaked control paths: ${joined}`);
    }
    return joined;
  });

  await step('markdownToDocxBuffer produces OOXML zip', async () => {
    const buf = markdownToDocxBuffer('# Hello\n\nbody');
    if (buf.length < 100) throw new Error(`size ${buf.length}`);
    return `${buf.length} bytes`;
  });

  await step('parse draft marker contract', async () => {
    const parsed = parseDraftMarkers([
      '<<<OPENCHAMBER_INSTRUCTIONS>>>',
      '解析后的简报',
      '<<<OPENCHAMBER_FORMAT>>>',
      '# 格式\n- Mermaid',
      '<<<OPENCHAMBER_END>>>',
    ].join('\n'));
    if (!parsed || parsed.instructions !== '解析后的简报') throw new Error('marker parse failed');
    return 'ok';
  });

  await step('apply merge-like write to active prompts', async () => {
    const merged = await writeFormatBundle(tempRoot, {
      instructions: '合并后的简报：模块边界 + API',
      format: '# 合并格式\n- Simplified Chinese\n- Mermaid',
      presetId: 'custom',
    });
    if (!merged.instructions.includes('模块边界')) throw new Error('merge write failed');
    return 'custom + merged bodies';
  });

  await step('parse job starts then cancels cleanly (no live LLM wait)', async () => {
    let started;
    try {
      started = await startFormatParseJob({
        directory: tempRoot,
        model: { providerID: 'opencode', modelID: 'free-smoke-nonexistent-model' },
      });
    } catch (error) {
      return `rejected up-front: ${error?.code || 'error'}: ${error instanceof Error ? error.message : error}`;
    }
    const { cancelOpenWikiJob } = await import('./runner.js');
    const cancelled = await cancelOpenWikiJob(tempRoot);
    if (cancelled?.stage !== 'cancelled' && getJob(tempRoot)?.stage !== 'cancelled') {
      throw new Error(`expected cancelled, got ${JSON.stringify(cancelled || getJob(tempRoot))}`);
    }
    return `started=${started.stage} cancelled=${cancelled?.stage || getJob(tempRoot)?.stage}`;
  });

  await step('parse job requires a model', async () => {
    try {
      await startFormatParseJob({ directory: tempRoot });
      throw new Error('expected model-required');
    } catch (error) {
      if (error?.code !== 'model-required') throw error;
      return error.code;
    }
  });

  await step('remove one reference source', async () => {
    const after = await removeReferenceSource(tempRoot, 'brief.md');
    if (after.count !== 1) throw new Error(`count=${after.count}`);
    return after.files[0]?.name || '(none)';
  });

  await step('final format bundle still readable', async () => {
    const bundle = await readFormatBundle(tempRoot);
    if (!bundle.format?.trim()) throw new Error('empty format');
    return `preset=${bundle.presetId}`;
  });
} catch (error) {
  fail('harness', error);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log('\n--- Stage N smoke summary ---');
console.log(`passed=${passed} failed=${failed} total=${results.length}`);
if (failed > 0) process.exitCode = 1;
