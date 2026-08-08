import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const require = createRequire(path.join(electronRoot, 'package.json'));
const env = { ...process.env };
const builderArgs = process.argv.slice(2);

if (!env.CSC_LINK && !env.WINDOWS_CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('[electron] Windows code signing disabled; building unsigned installer.');
}

// Prefer the workspace-installed CLI. `bun x electron-builder` can resolve in an
// isolated context that misses app-builder-bin on this Windows/bun layout.
const electronBuilderCli = require.resolve('electron-builder/cli.js');

if (!builderArgs.includes('--win') && !builderArgs.some((argument) => argument.startsWith('--win'))) {
  builderArgs.unshift('--win');
}

const child = spawn(process.execPath, [electronBuilderCli, ...builderArgs], {
  cwd: electronRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[electron] failed to start electron-builder:', error);
  process.exit(1);
});
