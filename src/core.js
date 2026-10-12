"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  iconv = require("iconv-lite"),
  iced = require("iced-x86");
const { buildProgram } = require("./compiler"),
  { prepareSources, parseMap, parseListing } = require("./source"),
  { evaluate } = require("./expression");
const REGS = [
  "AX",
  "BX",
  "CX",
  "DX",
  "SI",
  "DI",
  "BP",
  "SP",
  "CS",
  "DS",
  "ES",
  "SS",
  "IP",
  "EFLAGS",
];
const FLAGS = {
    CF: 0,
    PF: 2,
    AF: 4,
    ZF: 6,
    SF: 7,
    TF: 8,
    IF: 9,
    DF: 10,
    OF: 11,
  },
  MEMORY_SIZE = 0x200000;
let modulePromise;
const engine = () =>
  (modulePromise ||= require("@alexaltea/unicorn-js/x86")({
    print: () => {},
    printErr: () => {},
  }));
function loadMZ(data, loadSegment) {
  if (data.length < 28 || data.readUInt16LE(0) !== 0x5a4d)
    throw Error("Expected DOS MZ EXE");
  const h = Array.from({ length: 14 }, (_, i) => data.readUInt16LE(i * 2)),
    headerSize = h[4] * 16,
    declared = (h[2] - 1) * 512 + (h[1] || 512);
  if (
    !h[2] ||
    headerSize < 28 ||
    headerSize > declared ||
    declared > data.length ||
    h[12] + h[3] * 4 > headerSize
  )
    throw Error("Invalid DOS EXE size/header fields");
  const image = Buffer.from(data.subarray(headerSize, declared));
  if (!image.length || loadSegment * 16 + image.length >= 0x100000)
    throw Error("DOS EXE exceeds conventional memory");
  for (let i = 0; i < h[3]; i++) {
    const offset = data.readUInt16LE(h[12] + i * 4),
      seg = data.readUInt16LE(h[12] + i * 4 + 2),
      position = seg * 16 + offset;
    if (position + 2 > image.length) throw Error("Invalid relocation target");
    image.writeUInt16LE(
      (image.readUInt16LE(position) + loadSegment) & 65535,
      position,
    );
  }
  if (
    h[11] * 16 + h[10] >= image.length ||
    (loadSegment + h[7]) * 16 + h[8] > 0x100000
  )
    throw Error("Invalid EXE entry/stack");
  return { image, header: h };
}
class Session {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.u = null;
    this.lines = new Map();
    this.symbols = new Map();
    this.breakpoints = new Set();
    this.running = this.ended = this.cancelled = false;
    this.exitCode = 0;
    this.loadSegment = 0x1000;
    this.base = 0x10000;
    this.callFrames = [];
    this.lastException = "";
    this.maxInstructions = 1000000;
  }
  reg(name) {
    return this.u.reg_read_i32(this.uc["X86_REG_" + name]);
  }
  setReg(name, value) {
    this.u.reg_write_i32(this.uc["X86_REG_" + name], value);
  }
  pc() {
    return this.reg("CS") * 16 + this.reg("IP");
  }
  read(address, count) {
    if (
      !Number.isInteger(address) ||
      !Number.isInteger(count) ||
      address < 0 ||
      count < 0 ||
      address + count > MEMORY_SIZE
    )
      throw Error("Memory range is outside mapped address space");
    return Buffer.from(this.u.mem_read(address, count));
  }
  write(address, data) {
    this.read(address, data.length);
    this.u.mem_write(address, Array.from(data));
  }
  writeRegister(name, value) {
    name = name.toUpperCase() === "FLAGS" ? "EFLAGS" : name.toUpperCase();
    if (Object.hasOwn(FLAGS, name)) {
      if (value !== 0 && value !== 1) throw Error("Flag must be 0 or 1");
      this.setReg(
        "EFLAGS",
        (this.reg("EFLAGS") & ~(1 << FLAGS[name])) | (value << FLAGS[name]) | 2,
      );
      return;
    }
    if (
      !REGS.includes(name) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 65535
    )
      throw Error("Expected register and unsigned 16-bit value");
    this.setReg(name, name === "EFLAGS" ? value | 2 : value);
    if (["CS", "IP", "SS", "SP"].includes(name)) this.callFrames = [];
  }
  evaluate(text) {
    return evaluate(text, (name) => {
      if (name === "FLAGS") name = "EFLAGS";
      if (REGS.includes(name)) return this.reg(name);
      if (Object.hasOwn(FLAGS, name))
        return (this.reg("EFLAGS") >> FLAGS[name]) & 1;
      const symbol = this.symbols.get(name);
      if (symbol)
        return this.read(this.base + symbol.offset, symbol.size).readUIntLE(
          0,
          symbol.size,
        );
      throw Error("Unknown register, flag or data symbol: " + name);
    });
  }
  async launch(args) {
    this.close();
    this.cancelled = this.running = this.ended = false;
    this.lastException = "";
    this.callFrames = [];
    this.exitCode = 0;
    this.breakpoints = new Set();
    this.source = path.resolve(args.program);
    if (
      path.extname(this.source).toLowerCase() !== ".asm" ||
      !fs.existsSync(this.source)
    )
      throw Error("Select an existing .asm file");
    this.maxInstructions = args.maxInstructions ?? 1000000;
    if (
      !Number.isInteger(this.maxInstructions) ||
      this.maxInstructions < 1 ||
      this.maxInstructions > 10000000
    )
      throw Error("maxInstructions must be 1..10000000");
    this.stopOnEntry = args.stopOnEntry !== false;
    const root = path.resolve(args.buildRoot || os.tmpdir());
    if (
      /[\r\n"]/.test(root) ||
      (!(args.buildBackend || "jsdos").startsWith("jsdos") &&
        !/^[\x20-\x7E]+$/.test(root))
    )
      throw Error(
        "External DOSBox builds require a writable ASCII 8086lab.buildDirectory",
      );
    fs.mkdirSync(root, { recursive: true });
    this.build = fs.mkdtempSync(path.join(root, "8086-lab-"));
    this.sources = prepareSources(
      this.source,
      args.sourceEncoding || "utf-8-sig",
      this.build,
      args.assembler,
    );
    this.emit("output", {
      category: "console",
      output: `Building ${path.basename(this.source)} with ${args.assembler || "TASM"} / ${args.buildBackend || "jsdos"} (JavaScript/WASM)\n`,
    });
    const result = await buildProgram(this.build, args);
    this.emit("output", { category: "console", output: result.log + "\n" });
    const file = path.join(this.build, "MAIN.EXE");
    if (
      !fs.existsSync(file) ||
      !fs.existsSync(path.join(this.build, "MAIN.LST"))
    )
      throw Error("Assembly/link failed. Read Debug Console.");
    const { image, header: h } = loadMZ(
        fs.readFileSync(file),
        this.loadSegment,
      ),
      map = parseMap(
        iconv.decode(
          fs.readFileSync(path.join(this.build, "MAIN.MAP")),
          "cp437",
        ),
        this.sources,
      );
    const parsed = parseListing(
      iconv.decode(fs.readFileSync(path.join(this.build, "MAIN.LST")), "cp437"),
      this.sources,
      map,
    );
    this.lines = parsed.lines;
    this.symbols = parsed.symbols;
    const whole = this.sources.map((s) => s.text).join("\n"),
      autoCom =
        map.model === "tiny" ||
        (/\bORG\s+(?:0?100H|256)\b/i.test(whole) &&
          [...map.segments.values()].filter((s) => s.length).length === 1);
    this.format =
      args.programFormat === "com" || (args.programFormat !== "exe" && autoCom)
        ? "com"
        : "exe";
    this.uc = await engine();
    this.u = new this.uc.Unicorn(this.uc.ARCH_X86, this.uc.MODE_16);
    this.u.mem_map(0, MEMORY_SIZE, this.uc.PROT_ALL);
    const psp =
      this.format === "com" ? this.loadSegment : this.loadSegment - 0x10;
    this.base = this.loadSegment * 16;
    this.write(psp * 16, Buffer.from([0xcd, 0x20]));
    this.write(psp * 16 + 0x80, Buffer.from([0, 13]));
    let values;
    if (this.format === "com") {
      if (h[3] !== 0 || h[11] !== 0 || h[10] !== 0x100 || image.length > 65536)
        throw Error(
          "COM requires one relocatable-free segment and entry at ORG 100H",
        );
      this.write(this.base + 0x100, image.subarray(0x100));
      this.write(this.base + 0xfffe, Buffer.from([0, 0]));
      values = {
        CS: psp,
        IP: 0x100,
        DS: psp,
        ES: psp,
        SS: psp,
        SP: 0xfffe,
        EFLAGS: 0x202,
      };
    } else {
      this.write(this.base, image);
      values = {
        CS: this.loadSegment + h[11],
        IP: h[10],
        SS: this.loadSegment + h[7],
        SP: h[8],
        DS: psp,
        ES: psp,
        EFLAGS: 0x202,
      };
    }
    for (const [name, value] of Object.entries(values))
      this.setReg(name, value);
    this.emit("output", {
      category: "console",
      output: `Loaded DOS ${this.format.toUpperCase()}; bundled Unicorn WASM; no Python runtime\n`,
    });
  }
  interrupt(number) {
    const ah = this.reg("AX") >> 8,
      al = this.reg("AX") & 255;
    if (number === 0x20 || (number === 0x21 && ah === 0x4c)) {
      this.ended = true;
      this.exitCode = number === 0x20 ? 0 : al;
      return;
    }
    if (number === 0x21 && ah === 9) {
      const bytes = [];
      for (let i = 0; i < 65536; i++) {
        const b = this.read(
          this.reg("DS") * 16 + ((this.reg("DX") + i) & 65535),
          1,
        )[0];
        if (b === 36) {
          this.emit("output", {
            category: "stdout",
            output: iconv.decode(Buffer.from(bytes), "cp437"),
          });
          return;
        }
        bytes.push(b);
      }
      throw Error("INT 21h/AH=09h string has no $ terminator");
    }
    if ((number === 0x21 && ah === 2) || (number === 0x10 && ah === 0xe)) {
      const b = number === 0x21 ? this.reg("DX") & 255 : al;
      this.emit("output", {
        category: "stdout",
        output: iconv.decode(Buffer.from([b]), "cp437"),
      });
      if (number === 0x21) this.setReg("AX", (this.reg("AX") & 0xff00) | b);
      return;
    }
    if (number === 0x21 && ah === 0x30) {
      this.setReg("AX", 5);
      this.setReg("BX", 0);
      this.setReg("CX", 0);
      return;
    }
    throw Error(
      `INT ${number.toString(16)}h / AH=${ah.toString(16)}h is not implemented. Use the DOS debugger for other services.`,
    );
  }
  instruction(address = this.pc()) {
    const bytes = this.read(address, Math.min(15, MEMORY_SIZE - address)),
      decoder = new iced.Decoder(16, bytes, iced.DecoderOptions.None),
      formatter = new iced.Formatter(iced.FormatterSyntax.Masm);
    decoder.ip = BigInt(address);
    const item = decoder.decode();
    try {
      if (item.isInvalid) throw Error("Cannot decode instruction");
      return {
        size: item.length,
        mnemonic: iced.Mnemonic[item.mnemonic].toLowerCase(),
        text: formatter.format(item),
        flow: item.flowControl,
        bytes: bytes.subarray(0, item.length),
      };
    } finally {
      item.free();
      decoder.free();
      formatter.free();
    }
  }
  step() {
    if (this.ended) return;
    const item = this.instruction();
    if (
      ["hlt", "in", "out", "insb", "insw", "outsb", "outsw"].includes(
        item.mnemonic,
      )
    )
      throw Error(
        item.mnemonic.toUpperCase() +
          " requires hardware semantics outside this debugger",
      );
    const cs = this.reg("CS"),
      ip = this.reg("IP"),
      sp = this.reg("SP");
    try {
      // DOS services are handled before execution: faulting source location remains stable.
      if (item.mnemonic === "int" || item.mnemonic === "int3") {
        this.interrupt(
          item.mnemonic === "int3" ? 3 : item.bytes[item.size - 1],
        );
        this.setReg("IP", (ip + item.size) & 65535);
      }
      // Bound translation to this instruction as well as limiting execution count.
      // The WASM TCI backend can overflow translating long zero-filled fallthrough blocks.
      else this.u.emu_start(this.pc(), this.pc() + item.size, 0, 1);
      if (
        [iced.FlowControl.Call, iced.FlowControl.IndirectCall].includes(
          item.flow,
        )
      )
        this.callFrames.push({
          address: cs * 16 + ((ip + item.size) & 65535),
          sp,
        });
      else if (item.flow === iced.FlowControl.Return && this.callFrames.length)
        this.callFrames.pop();
    } catch (error) {
      this.setReg("CS", cs);
      this.setReg("IP", ip);
      this.lastException = String(error.message || error);
      throw Error(this.lastException);
    }
  }
  location() {
    return this.lines.get(this.pc() - this.base);
  }
  close() {
    this.cancelled = true;
    this.running = false;
    if (this.u) {
      this.u.close();
      this.u = null;
    }
    if (this.build && path.basename(this.build).startsWith("8086-lab-"))
      fs.rmSync(this.build, { recursive: true, force: true });
    this.build = null;
  }
}
module.exports = { Session, REGS, FLAGS, MEMORY_SIZE, loadMZ, engine };
