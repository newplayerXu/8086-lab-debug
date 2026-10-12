'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!manifest.extensionDependencies.includes('xsro.masm-tasm')) throw new Error('Missing MASM/TASM dependency');
for (const file of ['src/extension.js', 'src/adapter.js', 'src/core.js', 'src/compiler.js', 'README.md', 'LICENSE']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (/[CG]:[\\/]Users[\\/]Lenovo|8086-Lab[\\/]tools[\\/]python/.test(text)) throw new Error('Machine-specific path in ' + file);
}
console.log('Manifest/dependency/portable-path checks passed.');
