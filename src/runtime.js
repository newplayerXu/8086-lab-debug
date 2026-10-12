'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...options}, (error, stdout, stderr) => {
      if (error) reject(new Error(`${file}: ${stderr || stdout || error.message}`));
      else resolve(stdout.trim());
    });
  });
}
function executableFromCommand(command) {
  const text = String(command || '').trim();
  const quoted = text.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  // Accept an unquoted full .exe path containing spaces, but never execute arguments as a shell command.
  const exe = text.match(/^(.+?\.exe)(?:\s|$)/i);
  return exe ? exe[1] : text.split(/\s+/)[0];
}
function findOnPath(name, env = process.env) {
  if (!name) return '';
  if (path.isAbsolute(name)) return fs.existsSync(name) ? name : '';
  const extensions = path.extname(name) ? [''] : ['.exe', ''];
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(dir.replace(/^"|"$/g, ''), name + extension);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return '';
}
function runtimePython(storage) {return path.join(storage, 'python', 'Scripts', 'python.exe');}
function validatePlatform(platform = process.platform) {
  if (platform !== 'win32') throw new Error('8086 Lab 0.2 supports Windows desktop only. WSL, Linux, macOS and VS Code Web are not supported.');
}
function dosboxPath(configured, dependencyCommand = '') {
  const name = configured || executableFromCommand(dependencyCommand) || 'dosbox-x';
  const found = findOnPath(name);
  if (!found) throw new Error('DOSBox-X was not found. Run “8086 Lab: Select DOSBox-X Executable”.');
  return found;
}
module.exports = {run, executableFromCommand, findOnPath, runtimePython, validatePlatform, dosboxPath};
