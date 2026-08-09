import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');

const REQUIRED = [
  '@anthropic-ai/vertex-sdk',
  'deepagents',
  '@langchain/core',
  'better-sqlite3',
];

const assertTree = (root, label) => {
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    throw new Error(`${label}: missing package.json at ${root}`);
  }
  if (!fs.existsSync(path.join(root, 'dist', 'agent', 'index.js'))) {
    throw new Error(`${label}: missing dist/agent/index.js`);
  }
  const vendor = path.join(root, 'vendor_modules');
  const nodeModules = path.join(root, 'node_modules');
  const depsRoot = fs.existsSync(vendor) ? vendor : nodeModules;
  if (!fs.existsSync(depsRoot)) {
    throw new Error(`${label}: missing vendor_modules/node_modules under ${root}`);
  }
  for (const name of REQUIRED) {
    const pkg = path.join(depsRoot, ...name.split('/'), 'package.json');
    if (!fs.existsSync(pkg)) {
      throw new Error(`${label}: missing dependency ${name} under ${depsRoot}`);
    }
  }
  const native = path.join(depsRoot, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(native)) {
    throw new Error(`${label}: missing native addon ${native} (run rebuild:openwiki-native)`);
  }
  console.log(`[verify-openwiki] ok: ${label} (${depsRoot.includes('vendor_modules') ? 'vendor_modules' : 'node_modules'})`);
};

const mode = process.argv.includes('--packaged') ? 'packaged' : 'staged';

if (mode === 'staged') {
  assertTree(path.join(electronRoot, 'resources', 'openwiki'), 'staged');
} else {
  const packaged = path.join(electronRoot, 'dist', 'win-unpacked', 'resources', 'openwiki');
  assertTree(packaged, 'packaged');
}
