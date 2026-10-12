"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { Session } = require("../src/core");
const root = path.resolve(__dirname, ".."),
  resources = process.env.MASMTASM_RESOURCES;
const common = `.data\nRESULT DW ?\n.code\nSTART:\n MOV AX,@data\n MOV DS,AX\n MOV AX,8\n MOV RESULT,AX\n MOV AX,4C00H\n INT 21H\nEND START\n`;
const formats = {};
for (const model of ["small", "medium", "compact", "large", "huge"])
  formats[model] = {
    source: ".model " + model + "\n.stack 100h\n" + common,
    format: "exe",
    value: 8,
  };
formats.tiny = {
  source:
    ".model tiny\n.code\nORG 100H\nSTART:\n MOV AX,8\n MOV RESULT,AX\n INT 20H\nRESULT DW 0\nEND START\n",
  format: "com",
  value: 8,
};
formats["explicit-com"] = {
  source:
    "CODES SEGMENT\nASSUME CS:CODES,DS:CODES\nORG 100H\nSTART:\n MOV AX,8\n MOV RESULT,AX\n INT 20H\nRESULT DW 0\nCODES ENDS\nEND START\n",
  format: "com",
  value: 8,
};
formats.group = {
  source:
    "DGROUP GROUP DATAS,STACKS\nDATAS SEGMENT PARA PUBLIC 'DATA'\nRESULT DW 0\nDATAS ENDS\nSTACKS SEGMENT PARA STACK 'STACK'\nDW 128 DUP(?)\nSTACKS ENDS\nCODES SEGMENT PARA PUBLIC 'CODE'\nASSUME CS:CODES,DS:DGROUP,SS:DGROUP\nSTART:\n MOV AX,DGROUP\n MOV DS,AX\n MOV AX,8\n MOV RESULT,AX\n MOV AX,4C00H\n INT 21H\nCODES ENDS\nEND START\n",
  format: "exe",
  value: 8,
};
formats["far-call"] = {
  source:
    "C1 SEGMENT PARA PUBLIC 'CODE'\nASSUME CS:C1\nSTART:\n CALL FAR PTR SUBR\n MOV AX,4C00H\n INT 21H\nC1 ENDS\nC2 SEGMENT PARA PUBLIC 'CODE'\nASSUME CS:C2\nSUBR PROC FAR\n MOV BX,8\n RET\nSUBR ENDP\nC2 ENDS\nEND START\n",
  format: "exe",
  register: "BX",
};
formats.macro = {
  source:
    "SETAX MACRO\n MOV AX,8\nENDM\n.model small\n.stack 100h\n.code\nSTART:\n SETAX\n MOV BX,AX\n MOV AX,4C00H\n INT 21H\nEND START\n",
  format: "exe",
  register: "BX",
};
formats.include = {
  source:
    ".model small\n.stack 100h\n.code\nSTART:\n INCLUDE body.inc\n MOV BX,AX\n MOV AX,4C00H\n INT 21H\nEND START\n",
  include: " MOV AX,8\n",
  format: "exe",
  register: "BX",
};
formats["macro-parameter"] = {
  source:
    "SETAX MACRO VALUE\n MOV AX,VALUE\nENDM\n.model small\n.stack 100h\n.code\nSTART:\n SETAX 8\n MOV BX,AX\n MOV AX,4C00H\n INT 21H\nEND START\n",
  format: "exe",
  register: "BX",
};
formats["startup-exit"] = {
  source:
    ".model small\n.stack 100h\n.data\nRESULT DW 0\n.code\n.startup\n MOV AX,8\n MOV RESULT,AX\n.exit 0\nEND\n",
  format: "exe",
  value: 8,
};
formats["tiny-startup"] = {
  source: ".model tiny\n.code\n.startup\n MOV AX,8\n MOV BX,AX\n.exit 0\nEND\n",
  format: "com",
  register: "BX",
};
formats["bare-org-com"] = {
  source: "ORG 100H\n MOV AX,8\n MOV BX,AX\n INT 20H\n",
  format: "com",
  register: "BX",
};
const backends = process.argv.slice(2);
formats["tiny-data"] = {
  source:
    ".model tiny\n.data\nRESULT DW 0\n.code\nORG 100H\nSTART:\n MOV AX,8\n MOV RESULT,AX\n INT 20H\nEND START\n",
  format: "com",
  value: 8,
};
if (!backends.length) backends.push("jsdos");
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "8086-formats-"));
  try {
    for (const backend of backends)
      for (const assembler of ["TASM", "MASM-v5.00", "MASM-v6.11"])
        for (const [name, item] of Object.entries(formats)) {
          if (
            process.env.FORMAT_FILTER &&
            !process.env.FORMAT_FILTER.split(",").includes(name)
          )
            continue;
          const program = path.join(temp, name + ".asm");
          fs.writeFileSync(program, item.source);
          fs.writeFileSync(path.join(temp, "body.inc"), item.include || "");
          const s = new Session();
          try {
            await s.launch({
              program,
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
            assert.equal(s.format, item.format);
            let count = 0;
            while (!s.ended && count++ < 100) {
              assert(
                s.location(),
                name + " source location missing at " + s.pc().toString(16),
              );
              s.step();
            }
            assert(s.ended);
            assert.equal(s.exitCode, 0);
            if (item.value !== undefined)
              assert.equal(s.evaluate("RESULT"), item.value);
            if (item.register) assert.equal(s.reg(item.register), 8);
            console.log(assembler, backend, name, "PASS");
          } catch (e) {
            console.error(assembler, backend, name);
            if (s.build)
              for (const f of ["BUILD.LOG", "MAIN.MAP", "MAIN.LST"])
                if (fs.existsSync(path.join(s.build, f)))
                  console.error(
                    f,
                    fs.readFileSync(path.join(s.build, f), "utf8"),
                  );
            throw e;
          } finally {
            s.close();
          }
        }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
