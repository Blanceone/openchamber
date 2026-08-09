import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(electronRoot, '../..');
const outputDir = path.join(electronRoot, 'resources', 'openwiki');
const dependsRoot = path.resolve(workspaceRoot, '../depends');
const tarballPath = path.join(dependsRoot, 'npm-packs', 'openwiki-0.3.1.tgz');
const cacheRoot = process.env.OPENCHAMBER_OPENWIKI_CACHE
  || (fs.existsSync(dependsRoot)
    ? path.join(dependsRoot, 'openwiki-bundle', '0.3.1')
    : path.join(electronRoot, '.cache', 'openwiki-bundle', '0.3.1'));
const npmCache = process.env.npm_config_cache
  || (fs.existsSync(dependsRoot) ? path.join(dependsRoot, 'npm-cache') : undefined);

/** electron-builder strips directories named node_modules from extraResources. */
const VENDOR_DIR_NAME = 'vendor_modules';

const REQUIRED_PACKAGES = [
  '@anthropic-ai/vertex-sdk',
  'deepagents',
  '@langchain/core',
  '@langchain/openai',
];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    windowsHide: true,
    env: options.env || process.env,
    cwd: options.cwd,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    const err = result.error ? `\n${result.error.message}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${err}${stderr}${stdout}`);
  }
  return result;
};

const rmrf = (target) => {
  fs.rmSync(target, { recursive: true, force: true });
};

const copyDir = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
};

const ensureAgentEntry = (packageRoot) => {
  const entry = path.join(packageRoot, 'dist', 'agent', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`Staged openwiki is missing agent entry: ${entry}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'openwiki') {
    throw new Error(`Expected openwiki package.json at ${packageRoot}`);
  }
  return pkg.version;
};

const assertRequiredPackages = (vendorRoot) => {
  const missing = REQUIRED_PACKAGES.filter((name) => {
    const pkgJson = path.join(vendorRoot, ...name.split('/'), 'package.json');
    return !fs.existsSync(pkgJson);
  });
  if (missing.length > 0) {
    throw new Error(`Staged openwiki ${VENDOR_DIR_NAME} is missing required packages: ${missing.join(', ')}`);
  }
};

const installIntoCache = () => {
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Missing openwiki tarball at ${tarballPath}`);
  }

  const marker = path.join(cacheRoot, '.openchamber-ready');
  const stagedPkg = path.join(cacheRoot, 'node_modules', 'openwiki', 'package.json');
  const vertexProbe = path.join(cacheRoot, 'node_modules', '@anthropic-ai', 'vertex-sdk', 'package.json');
  if (fs.existsSync(marker) && fs.existsSync(stagedPkg) && fs.existsSync(vertexProbe)) {
    const cached = JSON.parse(fs.readFileSync(stagedPkg, 'utf8'));
    if (cached.version === '0.3.1') {
      console.log(`[prepare-openwiki] Using cached bundle at ${cacheRoot}`);
      return;
    }
  }

  rmrf(cacheRoot);
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.writeFileSync(
    path.join(cacheRoot, 'package.json'),
    JSON.stringify({ name: 'openchamber-openwiki-bundle', private: true, type: 'module' }, null, 2),
    'utf8',
  );

  const env = { ...process.env };
  if (npmCache) {
    env.npm_config_cache = npmCache;
    fs.mkdirSync(npmCache, { recursive: true });
  }

  console.log(`[prepare-openwiki] Installing openwiki@0.3.1 into ${cacheRoot}`);
  run(npmCommand, ['install', '--omit=dev', '--no-fund', '--no-audit', tarballPath], {
    cwd: cacheRoot,
    env,
    stdio: 'inherit',
  });
  fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
};

const stageToResources = () => {
  const installedRoot = path.join(cacheRoot, 'node_modules', 'openwiki');
  if (!fs.existsSync(installedRoot)) {
    throw new Error(`openwiki did not install into ${installedRoot}`);
  }

  rmrf(outputDir);
  copyDir(installedRoot, outputDir);

  // Hoist production deps as vendor_modules (not node_modules) so electron-builder
  // does not strip them from extraResources.
  const depsSource = path.join(cacheRoot, 'node_modules');
  const depsTarget = path.join(outputDir, VENDOR_DIR_NAME);
  fs.mkdirSync(depsTarget, { recursive: true });
  for (const entry of fs.readdirSync(depsSource)) {
    if (entry === 'openwiki' || entry === '.bin') continue;
    copyDir(path.join(depsSource, entry), path.join(depsTarget, entry));
  }

  assertRequiredPackages(depsTarget);
  const version = ensureAgentEntry(outputDir);
  fs.writeFileSync(
    path.join(outputDir, '.openchamber-vendor.json'),
    JSON.stringify({ version, vendorDir: VENDOR_DIR_NAME, required: REQUIRED_PACKAGES }, null, 2),
    'utf8',
  );
  console.log(`[prepare-openwiki] Staged openwiki@${version} → ${outputDir} (${VENDOR_DIR_NAME})`);
};

installIntoCache();
stageToResources();
