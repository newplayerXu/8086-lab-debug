"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  Zip = require("adm-zip"),
  iconv = require("iconv-lite");
const { run } = require("./runtime");
const PRESETS = {
  TASM: [
    "tasm",
    ["TASM.EXE", "TLINK.EXE"],
    [
      "tasm /zi /l MAIN.ASM > BUILD.LOG",
      "if errorlevel 1 goto done",
      "tlink /v MAIN.OBJ >> BUILD.LOG",
    ],
  ],
  "MASM-v5.00": [
    "masm",
    ["MASM.EXE", "LINK.EXE"],
    [
      "masm MAIN.ASM,MAIN.OBJ,MAIN.LST; > BUILD.LOG",
      "if errorlevel 1 goto done",
      "link MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG",
    ],
  ],
  "MASM-v6.11": [
    "masm",
    ["ML.EXE", "LINK.EXE", "DOSXNT.EXE"],
    [
      "ml /c /FlMAIN.LST MAIN.ASM > BUILD.LOG",
      "if errorlevel 1 goto done",
      "link /MAP MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG",
    ],
  ],
};
async function buildProgram(build, args) {
  const assembler =
    args.assembler === "MASM" ? "MASM-v6.11" : args.assembler || "TASM";
  if (!PRESETS[assembler]) throw Error("Unsupported assembler: " + assembler);
  const [folder, required, commands] = PRESETS[assembler],
    tools = path.join(build, "tools");
  fs.mkdirSync(tools);
  if (args.tasmDirectory) {
    if (assembler !== "TASM") throw Error("tasmDirectory only applies to TASM");
    for (const name of fs.readdirSync(args.tasmDirectory)) {
      const p = path.join(args.tasmDirectory, name);
      if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(tools, name));
    }
  } else {
    const archive = new Zip(args.assemblerBundle || args.tasmBundle);
    for (const entry of archive.getEntries()) {
      const parts = entry.entryName.split("/");
      if (parts[0].toLowerCase() !== folder || entry.isDirectory) continue;
      if (
        parts.length !== 2 ||
        !/^[A-Za-z0-9_.-]+$/.test(parts[1]) ||
        entry.header.size > 4 * 1024 * 1024
      )
        throw Error("Unsafe compiler bundle entry");
      fs.writeFileSync(path.join(tools, parts[1]), entry.getData());
    }
  }
  const names = fs.readdirSync(tools).map((n) => n.toUpperCase());
  if (!required.every((n) => names.includes(n)))
    throw Error("Compiler bundle is incomplete: " + assembler);
  const backend = args.buildBackend || "jsdos";
  if (!["jsdos", "jsdos-x", "dosbox", "dosbox-x"].includes(backend))
    throw Error("Unsupported emulator");
  fs.writeFileSync(
    path.join(build, "BUILD.BAT"),
    [
      "@echo off",
      ...commands,
      ":done",
      "echo DONE > DONE.TXT",
      ...(!backend.startsWith("jsdos") ? ["exit"] : []),
    ].join("\r\n") + "\r\n",
  );
  if (backend.startsWith("jsdos")) {
    const archive = new Zip();
    for (const name of fs.readdirSync(build)) {
      const p = path.join(build, name);
      if (fs.statSync(p).isFile() && /\.(ASM|INC)$/i.test(name))
        archive.addFile(name, fs.readFileSync(p));
    }
    archive.addFile(
      "BUILD.BAT",
      fs.readFileSync(path.join(build, "BUILD.BAT")),
    );
    for (const name of fs.readdirSync(tools))
      archive.addFile("tools/" + name, fs.readFileSync(path.join(tools, name)));
    archive.addFile(
      ".jsdos/dosbox.conf",
      Buffer.from(
        "[cpu]\ncycles=20000\n[autoexec]\nmount c .\nc:\npath c:\\tools\nBUILD.BAT\n",
      ),
    );
    archive.writeZip(path.join(build, "BUILD.jsdos"));
    const job = {
      engine: args.jsdosEngine,
      backend,
      bundle: path.join(build, "BUILD.jsdos"),
      output: path.join(build, "RESULT.zip"),
    };
    fs.writeFileSync(path.join(build, "job.json"), JSON.stringify(job));
    await run(
      args.nodePath || process.execPath,
      [args.jsdosRunner, path.join(build, "job.json")],
      { timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
    );
    const result = new Zip(job.output);
    for (const name of ["MAIN.EXE", "MAIN.LST", "MAIN.MAP", "BUILD.LOG"]) {
      const entry = result
        .getEntries()
        .find((e) => e.entryName.toUpperCase() === name);
      if (entry) fs.writeFileSync(path.join(build, name), entry.getData());
    }
  } else {
    if (!fs.existsSync(args.dosboxPath || ""))
      throw Error("Selected DOSBox executable was not found");
    fs.writeFileSync(
      path.join(build, "BUILD.CONF"),
      '[sdl]\noutput=surface\n[cpu]\ncore=normal\ncycles=fixed 20000\n[autoexec]\nmount c "' +
        build +
        '"\nc:\npath c:\\tools\nBUILD.BAT\nexit\n',
    );
    await run(
      args.dosboxPath,
      [
        "-conf",
        path.join(build, "BUILD.CONF"),
        ...(backend === "dosbox-x" ? ["-nopromptfolder", "-noconsole"] : []),
      ],
      { cwd: build, timeout: 45000 },
    );
  }
  return {
    assembler,
    log: fs.existsSync(path.join(build, "BUILD.LOG"))
      ? iconv.decode(fs.readFileSync(path.join(build, "BUILD.LOG")), "cp437")
      : "No build log.",
  };
}
module.exports = { buildProgram };
