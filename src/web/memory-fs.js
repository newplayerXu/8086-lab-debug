"use strict";
const path = require("path-browserify");
const { Buffer } = require("buffer");
const files = new Map(),
  dirs = new Set(["/"]);
let sequence = 0;
const key = (name) => path.resolve("/", name);
function mkdirSync(name) {
  let dir = key(name);
  while (!dirs.has(dir)) {
    dirs.add(dir);
    dir = path.dirname(dir);
  }
}
function writeFileSync(name, bytes) {
  name = key(name);
  mkdirSync(path.dirname(name));
  files.set(name, Buffer.from(bytes));
}
function readFileSync(name) {
  const bytes = files.get(key(name));
  if (!bytes) throw Error("File not loaded into browser session: " + name);
  return Buffer.from(bytes);
}
function existsSync(name) {
  return files.has(key(name)) || dirs.has(key(name));
}
function readdirSync(name) {
  name = key(name);
  return [
    ...new Set(
      [...files.keys(), ...dirs]
        .filter((p) => p !== name && path.dirname(p) === name)
        .map((p) => path.basename(p)),
    ),
  ];
}
function rmSync(name) {
  name = key(name);
  for (const p of files.keys())
    if (p === name || p.startsWith(name + "/")) files.delete(p);
  for (const p of dirs)
    if (p === name || p.startsWith(name + "/")) dirs.delete(p);
}
function mkdtempSync(prefix) {
  const name = key(prefix + ++sequence);
  mkdirSync(name);
  return name;
}
module.exports = {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  mkdtempSync,
  reset() {
    files.clear();
    dirs.clear();
    dirs.add("/");
  },
  statSync(name) {
    return { isFile: () => files.has(key(name)) };
  },
};
