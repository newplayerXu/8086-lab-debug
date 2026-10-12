"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { Session, engine, loadMZ, MEMORY_SIZE } = require("../src/core"),
  { Adapter } = require("../src/adapter"),
  { parseMap, parseListing } = require("../src/source");
test("tiny variables use linked declaration segment rather than pre-link DGROUP offsets", () => {
  const source = {
    path: __filename,
    text: ".model tiny\n.data\nRESULT DW 0\n.code\nORG 100H\nMOV AX,8",
  };
  const map = parseMap(
    " 00000H 00107H 00108H _TEXT CODE\n 00108H 00109H 00002H _DATA DATA",
    [source],
  );
  const tasm =
    "Turbo Assembler\n 2\t0000 .data\n 3\t0000 0000 RESULT DW 0\n 4\t0002 .code\n 6\t0100 B8 0008 MOV AX,8\nRESULT Word DGROUP:0000";
  assert.equal(
    parseListing(tasm, [source], map).symbols.get("RESULT").offset,
    0x108,
  );
  const masm =
    "0000 .code\n0100 B8 0008 MOV AX,8\n0108 0000 RESULT DW 0\nRESULT . . . L WORD 0108 _TEXT";
  assert.equal(
    parseListing(masm, [source], map).symbols.get("RESULT").offset,
    0x108,
  );
});
async function fixture(code) {
  const s = new Session();
  s.uc = await engine();
  s.u = new s.uc.Unicorn(s.uc.ARCH_X86, s.uc.MODE_16);
  s.u.mem_map(0, MEMORY_SIZE, s.uc.PROT_ALL);
  s.write(0x10000, Buffer.from(code, "hex"));
  for (const [n, v] of Object.entries({
    CS: 0x1000,
    IP: 0,
    SS: 0x2000,
    SP: 0x100,
    DS: 0x3000,
    EFLAGS: 0x202,
  }))
    s.setReg(n, v);
  s.source = __filename;
  s.sources = [{ path: __filename }];
  return s;
}
test("WASM arithmetic, stack and flags match original core", async () => {
  const s = await fixture("b80500bb030001d850b800005983f90890");
  try {
    for (let i = 0; i < 3; i++) s.step();
    assert.equal(s.reg("AX"), 8);
    s.step();
    assert.equal(s.reg("SP"), 0xfe);
    assert.deepEqual(s.read(0x200fe, 2), Buffer.from([8, 0]));
    for (let i = 0; i < 3; i++) s.step();
    assert.equal(s.reg("CX"), 8);
    assert.equal(s.evaluate("ZF"), 1);
  } finally {
    s.close();
  }
});
test("indirect CALL/RET and CALL RET immediate preserve tracked return frames", async () => {
  const s = await fixture("bb0700ffd39090b82a00c20400");
  try {
    s.step();
    s.step();
    assert.equal(s.reg("IP"), 7);
    assert.equal(s.callFrames[0].address, 0x10005);
    s.step();
    s.step();
    assert.equal(s.reg("AX"), 42);
    assert.equal(s.reg("IP"), 5);
    assert.equal(s.reg("SP"), 0x104);
    assert.equal(s.callFrames.length, 0);
  } finally {
    s.close();
  }
});
test("unsupported services preserve faulting IP; hardware is rejected", async () => {
  const s = await fixture("b80100cd21");
  try {
    s.step();
    assert.throws(() => s.step(), /not implemented/);
    assert.equal(s.reg("IP"), 3);
  } finally {
    s.close();
  }
  const p = await fixture("e460");
  try {
    assert.throws(() => p.step(), /hardware semantics/);
  } finally {
    p.close();
  }
});
test("watch parser, frozen symbol addresses, register/flag edits and bounds", async () => {
  const s = await fixture("90");
  try {
    s.symbols.set("RESULT", { offset: 0x20004, size: 2 });
    s.write(0x30004, Buffer.from([8, 0]));
    s.setReg("DS", 0);
    assert.equal(s.evaluate("RESULT + 0002h"), 10);
    assert.equal(s.evaluate("SS:SP"), 0x20100);
    assert.equal(s.evaluate("(5+3)*2"), 16);
    for (const e of [
      "process.exit()",
      "AX.__proto__",
      "1 << 100",
      "2 ** 1000",
      "4294967296",
    ])
      assert.throws(() => s.evaluate(e));
    s.writeRegister("ZF", 1);
    assert.equal(s.evaluate("ZF"), 1);
    assert.throws(() => s.writeRegister("AX", 65536));
    assert.throws(() => s.writeRegister("ZF", 2));
    for (const [a, c] of [
      [-1, 1],
      [MEMORY_SIZE, 1],
      [0, -1],
    ])
      assert.throws(() => s.read(a, c));
  } finally {
    s.close();
  }
});
test("MZ relocation and invalid headers", () => {
  const b = Buffer.alloc(36),
    h = [0x5a4d, 36, 1, 1, 2, 0, 0, 0, 0x100, 0, 0, 0, 28, 0];
  h.forEach((v, i) => b.writeUInt16LE(v, i * 2));
  b.writeUInt16LE(3, 32);
  assert.equal(loadMZ(b, 0x1000).image.readUInt16LE(), 0x1003);
  for (const invalid of [
    Buffer.from("MZ"),
    b.subarray(0, 20),
    b.subarray(0, 34),
  ])
    assert.throws(() => loadMZ(invalid, 0x1000));
});
test("linked addresses and source maps span explicit executable segments and GROUP", () => {
  const source = {
      path: __filename,
      text: "DGROUP GROUP DATAS\nC1 SEGMENT\na: nop\nC1 ENDS\nC2 SEGMENT\nb: retf\nC2 ENDS",
    },
    map = parseMap(
      " 00000H 00000H 00001H C1 CODE\n 00010H 00010H 00001H C2 CODE\n 00026H 00027H 00002H DATAS DATA",
      [source],
    );
  const listing =
    "0000 C1 SEGMENT\n0000 90 a: nop\n0001 C1 ENDS\n0000 C2 SEGMENT\n0000 CB b: retf\n0001 C2 ENDS\nVALUE Word DGROUP:0006";
  const p = parseListing(listing, [source], map);
  assert.equal(p.lines.get(0).line, 3);
  assert.equal(p.lines.get(0x10).line, 6);
  assert.equal(p.symbols.get("VALUE").offset, 0x26);
});
async function adapterFixture(code = "909090") {
  const messages = [],
    a = new Adapter((m) => messages.push(m));
  a.session = await fixture(code);
  a.session.emit = (n, b) => a.event(n, b);
  a.session.lines = new Map([
    [0, { path: __filename, line: 10 }],
    [1, { path: __filename, line: 11 }],
    [2, { path: __filename, line: 12 }],
  ]);
  let seq = 0;
  return {
    a,
    messages,
    request: async (command, args = {}) => {
      const id = ++seq;
      await a.handle({ seq: id, command, arguments: args });
      return messages.findLast((m) => m.request_seq === id);
    },
  };
}
test("DAP breakpoint relocation, foreign file isolation and unsupported conditions", async () => {
  const { a, request } = await adapterFixture();
  try {
    let r = await request("setBreakpoints", {
      source: { path: __filename },
      breakpoints: [{ line: 9 }],
    });
    assert.equal(r.body.breakpoints[0].line, 10);
    assert(a.session.breakpoints.has(0x10000));
    await request("setBreakpoints", {
      source: { path: __filename + "other" },
      breakpoints: [{ line: 11 }],
    });
    assert.deepEqual([...a.session.breakpoints], [0x10000]);
    r = await request("setBreakpoints", {
      source: { path: __filename },
      breakpoints: [{ line: 10, condition: "AX==1" }],
    });
    assert.equal(r.body.breakpoints[0].verified, false);
  } finally {
    a.dispose();
  }
});
test("DAP continue stops at breakpoint, read/write/disassemble/evaluate/setVariable", async () => {
  const { a, request, messages } = await adapterFixture();
  try {
    await request("setBreakpoints", {
      source: { path: __filename },
      breakpoints: [{ line: 12 }],
    });
    await request("continue");
    await a.runPromise;
    assert.equal(a.session.reg("IP"), 2);
    assert.equal(
      messages.findLast((m) => m.event === "stopped").body.reason,
      "breakpoint",
    );
    assert.equal(
      (
        await request("setVariable", {
          variablesReference: 1,
          name: "AX",
          value: "0008h",
        })
      ).success,
      true,
    );
    assert.equal(
      (await request("evaluate", { expression: "AX+2" })).body.result,
      "0x000A (10)",
    );
    await request("writeMemory", {
      memoryReference: "0x30000",
      data: "CA A=".replace(" ", ""),
    });
    assert.equal(
      (await request("readMemory", { memoryReference: "0x30000", count: 2 }))
        .body.data,
      "CAA=",
    );
    assert.equal(
      (
        await request("disassemble", {
          memoryReference: "0x10000",
          instructionCount: 2,
        })
      ).body.instructions.length,
      2,
    );
    assert.equal((await request("unknown")).success, false);
  } finally {
    a.dispose();
  }
});
test("DAP infinite loop yields so pause and terminate work", async () => {
  const { a, request, messages } = await adapterFixture("ebfe");
  try {
    await request("continue");
    await new Promise((r) => setImmediate(r));
    await request("pause");
    await a.runPromise;
    assert.equal(a.session.running, false);
    assert.equal(
      messages.findLast((m) => m.event === "stopped").body.reason,
      "pause",
    );
    await request("terminate");
    assert.equal(a.session.u, null);
    assert.equal(messages.filter((m) => m.event === "terminated").length, 1);
  } finally {
    a.dispose();
  }
});
test("DAP step over indirect call and step out", async () => {
  const { a, request } = await adapterFixture("bb0700ffd39090b82a00c20400");
  try {
    await request("stepIn");
    await request("next");
    await a.runPromise;
    assert.equal(a.session.reg("IP"), 5);
    a.session.setReg("IP", 3);
    await request("stepIn");
    assert.equal(a.session.callFrames.length, 1);
    await request("stepOut");
    await a.runPromise;
    assert.equal(a.session.reg("IP"), 5);
    assert.equal(a.session.callFrames.length, 0);
  } finally {
    a.dispose();
  }
});
