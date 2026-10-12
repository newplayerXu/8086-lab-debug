"use strict";
const path = require("node:path"),
  fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { parseMap } = require("../src/source"),
  { Session } = require("../src/core");
const root = path.resolve(__dirname, ".."),
  resources = process.env.MASMTASM_RESOURCES;
if (!resources) throw Error("Set MASMTASM_RESOURCES");
const backends = process.argv.slice(2);
if (!backends.length) backends.push("jsdos", "jsdos-x", "dosbox-x");
(async () => {
  for (const backend of backends)
    for (const assembler of ["TASM", "MASM-v5.00", "MASM-v6.11"])
      for (const sample of ["registers.asm", "segments-copy.asm"]) {
        const events = [],
          s = new Session((name, body) => events.push({ name, body }));
        try {
          await s.launch({
            program: path.join(root, "samples", sample),
            assembler,
            buildBackend: backend,
            assemblerBundle: path.join(resources, assembler + ".jsdos"),
            nodePath: process.execPath,
            jsdosRunner: path.join(root, "src/jsdos-build.cjs"),
            jsdosEngine: path.join(
              resources,
              "node_modules/emulators/build/wasm/emulators.js",
            ),
            dosboxPath: process.env.DOSBOX_PATH,
          });
          assert.equal(s.location().line, 14);
          if (sample === "registers.asm") {
            for (let i = 0; i < 5; i++) s.step();
            assert.equal(s.reg("AX"), 8);
            assert.equal(s.reg("BX"), 3);
            s.step();
            s.step();
            assert.equal(s.reg("SP"), 0xfe);
            for (let i = 0; i < 3; i++) s.step();
            assert.equal(s.reg("CX"), 8);
            assert.equal(s.evaluate("ZF"), 1);
            assert.equal(s.evaluate("RESULT"), 8);
            assert.equal(s.location().line, 30);
            for (let i = 0; i < 6; i++) s.step();
            assert.equal(s.exitCode, 0);
            assert.equal(
              events
                .filter(
                  (e) => e.name === "output" && e.body.category === "stdout",
                )
                .map((e) => e.body.output)
                .join(""),
              "Calculation finished!",
            );
          } else {
            const linked = parseMap(fs.readFileSync(path.join(s.build, "MAIN.MAP"), "utf8"), s.sources);
            assert.deepEqual([...linked.segments.keys()].sort(), ["CODES", "DATAS", "STACKS"]);
            for (let i = 0; i < 5; i++) s.step();
            assert.equal(s.reg("SI"), 0x2000);
            assert.equal(s.reg("DI"), 0x3000);
            assert.equal(s.reg("CX"), 10);
            for (let i = 0; i < 60; i++) s.step();
            assert.equal(s.reg("CX"), 0);
            assert.deepEqual(
              s.read(s.evaluate("DS:3000h"), 10),
              Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
            );
            assert.equal(s.evaluate("DAT2"), 1);
            s.step();
            s.step();
            assert.equal(s.exitCode, 10);
          }
          assert.equal(s.ended, true);
          console.log(assembler, backend, sample, "PASS");
        } finally {
          s.close();
        }
      }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
