import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** Packaged Electron ships deps here — electron-builder strips `node_modules` from extraResources. */
export const OPENWIKI_VENDOR_DIR = 'vendor_modules';

const PROBE_PACKAGE = path.join('@anthropic-ai', 'vertex-sdk', 'package.json');

const hasDependencyTree = (depsRoot) => fs.existsSync(path.join(depsRoot, PROBE_PACKAGE));

/**
 * Resolve the installed/bundled openwiki package root (directory containing package.json).
 */
export const resolveOpenWikiPackageRoot = () => {
  if (process.env.OPENWIKI_PACKAGE_ROOT) {
    const root = path.resolve(process.env.OPENWIKI_PACKAGE_ROOT);
    if (fs.existsSync(path.join(root, 'package.json'))) return root;
  }

  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'openwiki');
    if (fs.existsSync(path.join(bundled, 'package.json'))) return bundled;
  }

  try {
    const pkgJson = require.resolve('openwiki/package.json');
    return path.dirname(pkgJson);
  } catch {
    // fall through
  }

  // Monorepo fallback: walk up from this file looking for node_modules/openwiki
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'node_modules', 'openwiki');
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    dir = path.dirname(dir);
  }

  throw Object.assign(new Error('openwiki package is not installed'), {
    statusCode: 500,
    code: 'openwiki-package-missing',
  });
};

/**
 * Ensure ESM can resolve openwiki production deps via `<root>/node_modules`.
 * Packaged builds store deps in `vendor_modules` and bind them at runtime.
 *
 * @param {string} packageRoot
 * @returns {{ nodeModules: string, vendorModules: string | null }}
 */
export const ensureOpenWikiDependencyModules = (packageRoot) => {
  const nodeModules = path.join(packageRoot, 'node_modules');
  const vendorModules = path.join(packageRoot, OPENWIKI_VENDOR_DIR);

  if (hasDependencyTree(nodeModules)) {
    return { nodeModules, vendorModules: fs.existsSync(vendorModules) ? vendorModules : null };
  }

  if (!hasDependencyTree(vendorModules)) {
    throw Object.assign(
      new Error(
        'Bundled OpenWiki dependencies are missing (vendor_modules). Reinstall OpenChamber or re-run prepare:openwiki.',
      ),
      { statusCode: 500, code: 'openwiki-deps-missing' },
    );
  }

  if (fs.existsSync(nodeModules)) {
    try {
      fs.rmSync(nodeModules, { recursive: true, force: true });
    } catch (error) {
      throw Object.assign(
        new Error(`Cannot replace incomplete OpenWiki node_modules: ${error instanceof Error ? error.message : String(error)}`),
        { statusCode: 500, code: 'openwiki-deps-missing' },
      );
    }
  }

  try {
    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/c', 'mklink', '/J', nodeModules, vendorModules], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      fs.symlinkSync(vendorModules, nodeModules, 'dir');
    }
  } catch (error) {
    throw Object.assign(
      new Error(`Failed to bind OpenWiki vendor_modules: ${error instanceof Error ? error.message : String(error)}`),
      { statusCode: 500, code: 'openwiki-deps-missing' },
    );
  }

  if (!hasDependencyTree(nodeModules)) {
    throw Object.assign(new Error('OpenWiki dependency bind did not expose required packages'), {
      statusCode: 500,
      code: 'openwiki-deps-missing',
    });
  }

  return { nodeModules, vendorModules };
};

/**
 * @param {string} packageRoot
 */
export const resolveOpenWikiAgentEntry = (packageRoot) => {
  const entry = path.join(packageRoot, 'dist', 'agent', 'index.js');
  if (!fs.existsSync(entry)) {
    throw Object.assign(new Error(`openwiki agent entry missing at ${entry}`), {
      statusCode: 500,
      code: 'openwiki-package-missing',
    });
  }
  return entry;
};
