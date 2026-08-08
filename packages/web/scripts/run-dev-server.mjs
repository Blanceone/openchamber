#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const parsed = Number(process.env.OPENCHAMBER_PORT || 3001);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;

// Prefer bun when available; fall back to node for the same entry.
const launcher = typeof Bun !== 'undefined' ? 'bun' : process.execPath;
const args = typeof Bun !== 'undefined'
  ? ['server/index.js', '--port', String(port)]
  : [path.join(webRoot, 'server/index.js'), '--port', String(port)];

const child = spawn(launcher, args, {
  cwd: webRoot,
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
