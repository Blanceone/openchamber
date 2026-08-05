#!/usr/bin/env node
/**
 * OpenChamber local development helper.
 *
 * This script owns the interactive `bun run oc-dev` menu and the equivalent
 * non-interactive commands for Windows desktop workflows: web server/UI
 * deploys used by Electron, Electron itself, and maintainer release tasks.
 *
 * Personal or machine-specific options are intentionally kept out of git.
 * The only supported user config is:
 *
 *   ~/.config/openchamber/oc-dev.json
 *
 * See `scripts/oc-dev.config.example.json` for the shape. The config can
 * define `remoteDeployments`. Remote deploy menu entries are shown only when
 * configured. Maintainer-only actions such as release creation are hidden
 * unless `features.releaseTools` is true.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancel, intro, isCancel, log, outro, select, text } from '@clack/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(os.homedir(), '.config', 'openchamber', 'oc-dev.json');

const GLOBAL_PORT = '2606';
const TESTING_PORT = '1202';
const TESTING_DIR = 'testing-dev';
const REMOTE_RUNTIME_ENV = 'PATH=$HOME/.opencode/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH; if [ -z "${OPENCODE_BINARY:-}" ]; then OPENCODE_CANDIDATE=$(command -v opencode 2>/dev/null || true); if [ -n "$OPENCODE_CANDIDATE" ]; then export OPENCODE_BINARY="$OPENCODE_CANDIDATE"; fi; fi';

const isTty = Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);

function printHelp() {
  console.log(`Usage:
  bun run oc-dev [action] [options]
  node scripts/oc-dev.mjs [action] [options]

Actions:
  build-deploy-web                 Build web package and deploy
  remote-deploy-web                Deploy to configured remote target
  start-web-dev                    Start web development loop
  start-electron-app               Start Electron app in dev mode
  prepare-opencode-cli             Download/cache bundled OpenCode CLI for Electron
  build-electron-app               Build Windows Electron installer
  create-release                   Validate and bump release version

Options:
  -a, --action <action>
  --deployment-mode <global|testing>
  --remote-id <id>                 Remote deployment id from ${configPath}
  --target <test-api|test-ui>      Compatibility alias for remote deployment selection
  --web-mode <hmr|hmr-react-scan|hmr-lan|full>
  --version <semver>
  -h, --help
`);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-a':
      case '--action':
        options.action = readValue();
        break;
      case '--deployment-mode':
        options.deploymentMode = readValue();
        break;
      case '--remote-id':
        options.remoteId = readValue();
        break;
      case '--target':
        options.target = readValue();
        break;
      case '--web-mode':
        options.webMode = readValue();
        break;
      case '--version':
        options.version = readValue();
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        if (options.action) throw new Error(`Unexpected argument: ${arg}`);
        options.action = arg;
        break;
    }
  }
  return options;
}

function loadConfig() {
  if (!existsSync(configPath)) return { remoteDeployments: [] };
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return {
      ...parsed,
      remoteDeployments: Array.isArray(parsed.remoteDeployments) ? parsed.remoteDeployments : [],
    };
  } catch (error) {
    throw new Error(`Failed to read ${configPath}: ${error.message}`);
  }
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: options.shell || false,
  });
  if (result.status !== 0 && !options.allowFail) {
    throw new Error(`${options.label || [command, ...args].join(' ')} failed`);
  }
  return result.stdout?.trim() || '';
}

function step(label, fn) {
  log.step(label);
  const result = fn();
  log.success(`${label} completed`);
  return result;
}

function printReleaseNextSteps(version) {
  log.success(`Release v${version} prepared locally`);
  log.info('Next steps:');
  console.log(`  git add -A`);
  console.log(`  git commit -m "release v${version}"`);
  console.log(`  git tag v${version}`);
  console.log(`  git push origin main --tags`);
  console.log('');
  console.log('This will trigger the GitHub Actions release workflow.');
  console.log(`Make sure CHANGELOG.md contains a section like "## [${version}] - YYYY-MM-DD" before pushing.`);
}

function normalizeAction(action = '') {
  const normalized = action.toLowerCase();
  const aliases = {
    'deploy-web': 'build-deploy-web',
    'build/deploy-web': 'build-deploy-web',
    'web-dev': 'start-web-dev',
    'remote-deploy-web': 'remote-deploy-web',
    'electron-dev': 'start-electron-app',
    'opencode-cli': 'prepare-opencode-cli',
    'electron-opencode-cli': 'prepare-opencode-cli',
    'electron-build': 'build-electron-app',
    release: 'create-release',
  };
  return aliases[normalized] || normalized;
}

function ensurePromptable() {
  if (!isTty) throw new Error('Missing required option and no TTY is available for prompting.');
}

async function chooseValue(current, choices, message) {
  if (current) return current;
  ensurePromptable();
  const value = await select({ message, options: choices });
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(130);
  }
  return value;
}

async function chooseText(current, message, placeholder) {
  if (current) return current;
  ensurePromptable();
  const value = await text({ message, placeholder });
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(130);
  }
  return value;
}

function validateAdbAddress(address) {
  const normalized = String(address || '').trim();
  if (!/^[^\s:]+:\d{1,5}$/.test(normalized)) {
    throw new Error('Invalid wireless ADB address. Use host:port, e.g. 192.168.1.139:38181');
  }
  const port = Number(normalized.split(':').at(-1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid wireless ADB port. Use a port between 1 and 65535.');
  }
  return normalized;
}

function detectLanIp() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '';
}

function removeFilesByPrefixSuffix(directory, prefix, suffix) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(suffix)) continue;
    unlinkSync(path.join(directory, entry));
  }
}

function latestFileByExtensions(directory, extensions) {
  if (!existsSync(directory)) return '';
  return readdirSync(directory)
    .filter((entry) => extensions.some((extension) => entry.endsWith(extension)))
    .map((entry) => {
      const filePath = path.join(directory, entry);
      return { filePath, mtimeMs: statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || '';
}

function resetDirectory(directory) {
  mkdirSync(directory, { recursive: true });
  for (const entry of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'bun.lockb']) {
    rmSync(path.join(directory, entry), { force: true });
  }
  rmSync(path.join(directory, 'node_modules'), { recursive: true, force: true });
}

function installedWebCli(directory) {
  const cliPath = path.join(directory, 'node_modules', '@openchamber', 'web', 'bin', 'cli.js');
  return existsSync(cliPath) ? cliPath : '';
}

function installedGlobalWebCli() {
  const bunInstall = process.env.BUN_INSTALL || path.join(os.homedir(), '.bun');
  return installedWebCli(path.join(bunInstall, 'install', 'global'));
}

function stopInstalledInstance(directory, port) {
  const cliPath = installedWebCli(directory);
  if (!cliPath) return;
  run('node', [cliPath, 'stop', '--port', port], { cwd: directory, allowFail: true, label: `stop instance on ${port}` });
}

function startInstalledInstance(directory, port) {
  const cliPath = installedWebCli(directory);
  if (!cliPath) throw new Error(`OpenChamber CLI was not installed in ${directory}`);
  run('node', [cliPath, '--port', port], {
    cwd: directory,
    env: {
      OPENCHAMBER_UI_PASSWORD: process.env.OPENCHAMBER_PASSWORD || '',
      OPENCHAMBER_HOST: '0.0.0.0',
    },
    label: `start instance on ${port}`,
  });
}

function packageWeb() {
  step('Building web bundle', () => run('bun', ['run', '--cwd', 'packages/web', 'build']));
  const packOutput = step('Creating web package archive', () => run('npm', ['pack', '--pack-destination', repoRoot], { cwd: path.join(repoRoot, 'packages/web'), capture: true }));
  const packageName = packOutput.split('\n').find((line) => line.trim().endsWith('.tgz'))?.trim();
  if (!packageName) throw new Error('Archive creation failed: npm pack did not print a .tgz file.');
  return path.join(repoRoot, packageName);
}

async function selectRemoteDeployment(config, options) {
  if (options.remoteId) {
    const remote = config.remoteDeployments.find((entry) => entry.id === options.remoteId);
    if (!remote) throw new Error(`No remote deployment with id "${options.remoteId}" in ${configPath}`);
    return remote;
  }

  if (options.target) {
    const normalizedTarget = options.target.toLowerCase();
    const apiOnly = ['test', 'testing', 'test-api', 'api', 'api-only'].includes(normalizedTarget);
    const withUi = ['test-ui', 'ui', 'with-ui'].includes(normalizedTarget);
    if (!apiOnly && !withUi) throw new Error('Invalid --target. Use test-api or test-ui.');
    const remote = config.remoteDeployments.find((entry) => Boolean(entry.apiOnly) === apiOnly || (!entry.apiOnly && withUi));
    if (remote) return remote;
  }

  if (config.remoteDeployments.length === 0) {
    throw new Error(`No remoteDeployments configured in ${configPath}`);
  }

  return chooseValue(
    '',
    config.remoteDeployments.map((remote) => ({ value: remote.id, label: remote.label || remote.id, hint: `${remote.host}:${remote.port}` })),
    'Select remote deployment',
  ).then((id) => config.remoteDeployments.find((entry) => entry.id === id));
}

async function deployWeb(options, config) {
  const deploymentMode = (await chooseValue(options.deploymentMode, [
    { value: 'global', label: 'Global' },
    { value: 'testing', label: 'Testing' },
  ], 'Select installation mode')).toLowerCase();

  if (!['global', 'testing'].includes(deploymentMode)) {
    throw new Error('Invalid deployment mode. Use global or testing. Use remote-deploy-web for configured remote deployments.');
  }

  const packageFile = packageWeb();

  if (deploymentMode === 'testing') {
    const testingDir = path.join(os.homedir(), TESTING_DIR);
    step(`Stopping testing instance on ${TESTING_PORT}`, () => stopInstalledInstance(testingDir, TESTING_PORT));
    step('Preparing testing install directory', () => {
      resetDirectory(testingDir);
      run('bun', ['init', '-y'], { cwd: testingDir });
    });
    step('Installing testing package', () => run('bun', ['add', packageFile], { cwd: testingDir }));
    step(`Starting testing instance on ${TESTING_PORT}`, () => startInstalledInstance(testingDir, TESTING_PORT));
    return;
  }

  step(`Stopping global instance on ${GLOBAL_PORT}`, () => run('openchamber', ['stop', '--port', GLOBAL_PORT], { allowFail: true, label: `stop global instance on ${GLOBAL_PORT}` }));
  step('Removing old global package', () => {
    run('bun', ['remove', '-g', '@openchamber/web'], { allowFail: true, label: 'remove @openchamber/web' });
    run('bun', ['remove', '-g', 'openchamber'], { allowFail: true, label: 'remove openchamber' });
  });
  step('Installing package globally', () => run('bun', ['add', '-g', packageFile]));
  step(`Starting global instance on ${GLOBAL_PORT}`, () => {
    const cliPath = installedGlobalWebCli();
    if (!cliPath) throw new Error('Global OpenChamber CLI was not installed by bun add -g');
    run('node', [cliPath, '--port', GLOBAL_PORT], { env: { OPENCHAMBER_UI_PASSWORD: process.env.OPENCHAMBER_PASSWORD || '', OPENCHAMBER_HOST: '0.0.0.0' } });
  });
}

async function deployRemoteWeb(options, config) {
  const remote = await selectRemoteDeployment(config, options);
  const packageFile = packageWeb();
  const host = remote.host;
  const dir = remote.dir;
  const port = String(remote.port);
  const apiOnly = remote.apiOnly ? 'true' : 'false';
  const packageBase = path.basename(packageFile);

  if (!host || !dir || !port) throw new Error(`Remote deployment ${remote.id} must define host, dir, and port.`);

  step('Preparing remote directories', () => run('ssh', [host, `mkdir -p ~/${dir}/releases`]));
  step(`Stopping remote instance on ${host}:${port}`, () => run('ssh', [host, `set -e; ${REMOTE_RUNTIME_ENV}; cd ~/${dir} 2>/dev/null || exit 0; PORT=${quote(port)}; TMPDIR=$(node -p "require('os').tmpdir()" 2>/dev/null || echo /tmp); PIDFILE="$TMPDIR/openchamber-${port}.pid"; INSTANCEFILE="$TMPDIR/openchamber-${port}.json"; if [ -f ./node_modules/@openchamber/web/bin/cli.js ]; then bun ./node_modules/@openchamber/web/bin/cli.js stop --port "$PORT" >/dev/null 2>&1 || node ./node_modules/@openchamber/web/bin/cli.js stop --port "$PORT" >/dev/null 2>&1 || true; fi; if command -v lsof >/dev/null 2>&1; then lsof -ti :"$PORT" | xargs -r kill >/dev/null 2>&1 || true; sleep 0.5; lsof -ti :"$PORT" | xargs -r kill -9 >/dev/null 2>&1 || true; fi; rm -f "$PIDFILE" "$INSTANCEFILE"`], { label: 'stop remote instance' }));
  step('Copying package to remote', () => {
    run('ssh', [host, `mkdir -p ~/${dir}/releases && rm -f ~/${dir}/releases/*.tgz`]);
    run('scp', ['-q', packageFile, `${host}:~/${dir}/releases/${packageBase}`]);
  });
  step('Resetting remote install state', () => run('ssh', [host, `cd ~/${dir} && rm -f package.json package-lock.json pnpm-lock.yaml bun.lockb && rm -rf node_modules`]));
  step('Preparing remote package manifest', () => run('ssh', [host, `cd ~/${dir} && ${REMOTE_RUNTIME_ENV}; npm init -y >/dev/null 2>&1`]));
  step('Installing remote package', () => run('ssh', [host, `cd ~/${dir} && ${REMOTE_RUNTIME_ENV}; npm install ./releases/${packageBase}`]));
  step(`Starting remote instance on ${host}:${port}`, () => run('ssh', [host, `set -e; cd ~/${dir}; ${REMOTE_RUNTIME_ENV}; PASSWORD_VALUE=$(grep '^export OPENCHAMBER_UI_PASSWORD=' ~/.bashrc 2>/dev/null | sed -E 's/.*=["鈥淽?([^"鈥漖+)["鈥漖?/\\1/' || true); if [ -n "$PASSWORD_VALUE" ]; then export OPENCHAMBER_UI_PASSWORD="$PASSWORD_VALUE"; fi; if [ ${quote(apiOnly)} = 'true' ]; then export OPENCHAMBER_API_ONLY=true; fi; OPENCHAMBER_HOST=0.0.0.0 node ./node_modules/@openchamber/web/bin/cli.js --port ${quote(port)} >/dev/null 2>&1; sleep 0.5; if command -v lsof >/dev/null 2>&1; then lsof -ti :${quote(port)} >/dev/null 2>&1 || exit 1; fi`]));
  log.success(`Remote deployment ready: ${host}:${port}`);
}

async function startWebDev(options) {
  const mode = await chooseValue(options.webMode, [
    { value: 'hmr', label: 'Web HMR' },
    { value: 'hmr-react-scan', label: 'Web HMR + React Scan' },
    { value: 'hmr-lan', label: 'Web HMR LAN/mobile' },
    { value: 'full', label: 'Web prod-like' },
  ], 'Select web dev mode');

  if (mode === 'hmr-react-scan') {
    run('bun', ['run', 'dev:web:hmr'], { env: { VITE_ENABLE_REACT_SCAN: '1' } });
  } else if (mode === 'hmr-lan') {
    log.info('Starting web HMR LAN/mobile loop. Open the LAN URL printed after startup.');
    run('bun', ['run', 'dev:web:hmr'], { env: { OPENCHAMBER_HMR_HOST: '0.0.0.0' } });
  } else if (mode === 'full') {
    run('bun', ['run', 'dev:web:full']);
  } else {
    run('bun', ['run', 'dev:web:hmr']);
  }
}

function startElectronApp() {
  prepareOpenCodeCli();
  run('bun', ['run', 'electron:dev']);
}

function prepareOpenCodeCli() {
  step('Preparing bundled OpenCode CLI', () => run('bun', ['--filter', '@openchamber/electron', 'prepare:opencode-cli']));
}

function buildElectronApp() {
  prepareOpenCodeCli();
  run('bun', ['run', 'electron:build'], { env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  const distDir = path.join(repoRoot, 'packages/electron/dist');
  if (!existsSync(distDir)) return;
  const artifact = latestFileByExtensions(distDir, ['.exe']);
  if (artifact) log.info(`Windows installer: ${artifact}`);
}

async function createRelease(options) {
  if (!options.config?.features?.releaseTools) {
    throw new Error(`Release tools are disabled. Set features.releaseTools=true in ${configPath} to enable this maintainer task.`);
  }

  let version = options.version;
  if (!version) {
    ensurePromptable();
    version = await text({ message: 'Enter release version', placeholder: '1.4.7' });
    if (isCancel(version)) {
      cancel('Operation cancelled.');
      process.exit(130);
    }
  }
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) throw new Error('Invalid version format. Use semver, e.g. 1.4.7 or 1.4.7-beta.1');
  step('Validating codebase', () => run('bun', ['run', 'release:prepare']));
  step(`Bumping version to ${version}`, () => run('node', ['scripts/bump-version.mjs', version]));
  printReleaseNextSteps(version);
}

async function chooseAction(config) {
  const options = [
    { value: 'build-deploy-web', label: 'Build/Deploy web' },
    { value: 'start-web-dev', label: 'Start web dev' },
    { value: 'start-electron-app', label: 'Start Electron app' },
    { value: 'prepare-opencode-cli', label: 'Prepare bundled OpenCode CLI' },
    { value: 'build-electron-app', label: 'Build Electron app' },
  ];

  if (config.features?.releaseTools) {
    options.push({ value: 'create-release', label: 'Create Release' });
  }
  if (config.remoteDeployments.length > 0) {
    options.splice(1, 0, { value: 'remote-deploy-web', label: 'Deploy configured remote web' });
  }
  const action = await chooseValue('', options, 'Select OpenChamber dev action');
  return action;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const interactive = !options.action;
  if (interactive) intro('OpenChamber dev');
  let action = normalizeAction(options.action || await chooseAction(config));

  switch (action) {
    case 'build-deploy-web':
      await deployWeb(options, config);
      break;
    case 'remote-deploy-web':
      await deployRemoteWeb(options, config);
      break;
    case 'start-web-dev':
      await startWebDev(options);
      break;
    case 'start-electron-app':
      startElectronApp();
      break;
    case 'prepare-opencode-cli':
      prepareOpenCodeCli();
      break;
    case 'build-electron-app':
      buildElectronApp();
      break;
    case 'create-release':
      options.config = config;
      await createRelease(options);
      break;
    case 'start-mobile-dev':
    case 'mobile-tools':
    case 'start-vscode-extension':
    case 'install-vscode-extension-local':
      throw new Error(`${action} was removed; this monorepo ships Windows Electron desktop only.`);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  if (interactive) outro('Done');
}

main().catch((error) => {
  log.error(error.message);
  process.exit(1);
});
