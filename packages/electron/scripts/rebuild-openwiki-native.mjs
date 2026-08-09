#!/usr/bin/env node
/**
 * Rebuild OpenWiki native addons (better-sqlite3) against the packaged Electron ABI.
 * Worker runs under ELECTRON_RUN_AS_NODE, so stock Node prebuilds (e.g. ABI 137) fail
 * with NODE_MODULE_VERSION mismatches (Electron 41 => 145).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { rebuild } from '@electron/rebuild';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const electronPkg = require('electron/package.json');
const electronVersion = electronPkg.version;
const targetArchitecture = resolveTargetArchitecture();

const openwikiRoot = path.join(electronDir, 'resources', 'openwiki');
const vendorModules = path.join(openwikiRoot, 'vendor_modules');
const nodeModules = path.join(openwikiRoot, 'node_modules');
const probe = path.join(vendorModules, 'better-sqlite3', 'package.json');

const getWindowsShortPath = (target) => {
  if (process.platform !== 'win32') return target;
  try {
    const escaped = target.replace(/'/g, "''");
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `$fso = New-Object -ComObject Scripting.FileSystemObject; $fso.GetFolder('${escaped}').ShortPath`],
      { encoding: 'utf8', windowsHide: true },
    ).trim() || target;
  } catch {
    return target;
  }
};

const createWindowsRebuildPath = (target) => {
  if (process.platform !== 'win32') {
    return { buildPath: target, cleanup: () => {} };
  }

  for (const letter of 'ZYXWVUTSRQPONMLKJIHGFED') {
    const drive = `${letter}:`;
    if (fs.existsSync(`${drive}\\`)) continue;
    try {
      execFileSync('subst.exe', [drive, target], { stdio: 'ignore', windowsHide: true });
      return {
        buildPath: `${drive}\\`,
        cleanup: () => {
          try {
            execFileSync('subst.exe', [drive, '/d'], { stdio: 'ignore', windowsHide: true });
          } catch {
            // best-effort
          }
        },
      };
    } catch {
      // try next letter
    }
  }

  return { buildPath: getWindowsShortPath(target), cleanup: () => {} };
};

const ensureNodeModulesLink = () => {
  if (!fs.existsSync(probe)) {
    throw new Error(`OpenWiki vendor_modules missing better-sqlite3 at ${probe}. Run prepare:openwiki first.`);
  }

  if (fs.existsSync(nodeModules)) {
    const linkedProbe = path.join(nodeModules, 'better-sqlite3', 'package.json');
    if (fs.existsSync(linkedProbe)) return;
    fs.rmSync(nodeModules, { recursive: true, force: true });
  }

  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', nodeModules, vendorModules], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    fs.symlinkSync(vendorModules, nodeModules, 'dir');
  }
};

const removeNodeModulesLink = () => {
  // Keep vendor_modules; drop the packaging-time node_modules link so
  // electron-builder does not try to special-case it (and so staged tree
  // matches what we ship: vendor_modules only).
  if (!fs.existsSync(nodeModules)) return;
  try {
    fs.rmSync(nodeModules, { recursive: true, force: true });
  } catch {
    try {
      fs.unlinkSync(nodeModules);
    } catch {
      // best-effort
    }
  }
};

if (!fs.existsSync(path.join(openwikiRoot, 'package.json'))) {
  throw new Error(`OpenWiki is not staged at ${openwikiRoot}. Run prepare:openwiki first.`);
}

console.log(`[electron] rebuilding OpenWiki native modules against Electron ${electronVersion}...`);
ensureNodeModulesLink();

const rebuildPath = createWindowsRebuildPath(openwikiRoot);
try {
  await rebuild({
    buildPath: rebuildPath.buildPath,
    electronVersion,
    force: true,
    arch: targetArchitecture.electronBuilder,
    onlyModules: ['better-sqlite3'],
  });
} finally {
  rebuildPath.cleanup();
  removeNodeModulesLink();
}

const rebuilt = path.join(vendorModules, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
if (!fs.existsSync(rebuilt)) {
  throw new Error(`OpenWiki better-sqlite3 rebuild did not produce ${rebuilt}`);
}

console.log(`[electron] OpenWiki better-sqlite3 rebuilt for Electron ${electronVersion}: ${rebuilt}`);
