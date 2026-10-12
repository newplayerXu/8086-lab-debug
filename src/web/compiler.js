"use strict";
const fs = require("./memory-fs"),
  path = require("path-browserify");
const { zipSync, unzipSync } = require("fflate");
const iconv = require("iconv-lite");
const { PRESETS } = require("../presets");
let active;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function buildProgram(build, args) {
  const preset = PRESETS[args.assembler];
  if (!preset) throw Error("Unsupported browser assembler");
  if (!["jsdos", "jsdos-x"].includes(args.buildBackend))
    throw Error("Web debugging requires MASM/TASM jsdos or jsdos-x");
  const [folder, required, commands] = preset;
  const entries = {},
    tools = [];
  const raw = unzipSync(
    new Uint8Array(await (await fetch(args.assemblerBundle)).arrayBuffer()),
    {
      filter: (entry) =>
        entry.originalSize <= 4 * 1024 * 1024 &&
        new RegExp("^" + folder + "/[A-Za-z0-9_.-]+$", "i").test(entry.name),
    },
  );
  for (const [name, bytes] of Object.entries(raw)) {
    const file = name.split("/")[1];
    entries["tools/" + file] = bytes;
    tools.push(file.toUpperCase());
  }
  if (!required.every((name) => tools.includes(name)))
    throw Error("MASM/TASM browser compiler bundle is incomplete");
  for (const name of fs.readdirSync(build))
    if (/\.(ASM|INC)$/i.test(name))
      entries[name] = fs.readFileSync(path.join(build, name));
  entries["BUILD.BAT"] = new TextEncoder().encode(
    ["@echo off", ...commands, ":done", "echo DONE > DONE.TXT", ""].join(
      "\r\n",
    ),
  );
  entries[".jsdos/dosbox.conf"] = new TextEncoder().encode(
    "[cpu]\ncycles=20000\n[autoexec]\nmount c .\nc:\npath c:\\tools\nBUILD.BAT\n",
  );
  const emulators = globalThis.emulators;
  emulators.pathPrefix = globalThis.labResources.emulatorsPrefix;
  const factory =
    args.buildBackend === "jsdos-x" ? "dosboxXDirect" : "dosboxDirect";
  let ci;
  try {
    ci = await emulators[factory](zipSync(entries));
    active = ci;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (active !== ci) throw Error("Browser build cancelled");
      await sleep(300);
      const result = unzipSync(await ci.persist(), {
        filter: (e) =>
          e.originalSize <= 8 * 1024 * 1024 &&
          /^(?:DONE\.TXT|MAIN\.(?:EXE|LST|MAP)|BUILD\.LOG)$/i.test(e.name),
      });
      if (
        !Object.keys(result).some((name) => name.toUpperCase() === "DONE.TXT")
      )
        continue;
      ci.pause();
      for (const [name, bytes] of Object.entries(result))
        fs.writeFileSync(path.join(build, name.toUpperCase()), bytes);
      return {
        assembler: args.assembler,
        log: fs.existsSync(path.join(build, "BUILD.LOG"))
          ? iconv.decode(
              fs.readFileSync(path.join(build, "BUILD.LOG")),
              "cp437",
            )
          : "No build log",
      };
    }
    throw Error("Browser assembly timed out after 60 seconds");
  } finally {
    if (active === ci) active = undefined;
    if (ci) await ci.exit();
  }
}
exports.buildProgram = buildProgram;
exports.cancelBuild = async () => {
  const ci = active;
  active = undefined;
  if (ci) await ci.exit();
};
