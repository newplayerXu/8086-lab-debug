"use strict";
const path = require("node:path"),
  { Session, REGS, FLAGS } = require("./core");
const hex = (n) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const samePath = (a, b) =>
  path.caseSensitive
    ? path.resolve(a) === path.resolve(b)
    : path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
class Adapter {
  constructor(writer) {
    this.writer = writer;
    this.sequence = 0;
    this.session = new Session((name, body) => this.event(name, body));
    this.breakpointRequests = new Map();
    this.configured = this.terminationSent = false;
    this.runPromise = null;
  }
  send(message) {
    this.writer({ ...message, seq: ++this.sequence });
  }
  event(name, body = {}) {
    this.send({ type: "event", event: name, body });
  }
  response(request, body = {}, error) {
    this.send({
      type: "response",
      request_seq: request.seq,
      command: request.command,
      success: !error,
      body,
      ...(error ? { message: String(error.message || error) } : {}),
    });
  }
  requirePaused() {
    if (!this.session.u) throw Error("Launch a program first");
    if (this.session.running)
      throw Error("Pause before inspecting or modifying state");
    if (this.session.ended)
      throw Error("Program has exited; restart the debugger");
  }
  stopped(reason = "step") {
    const s = this.session;
    if (s.cancelled) return;
    if (s.ended) {
      if (!this.terminationSent) {
        this.terminationSent = true;
        this.event("exited", { exitCode: s.exitCode });
        this.event("terminated");
      }
    } else
      this.event("stopped", { reason, threadId: 1, allThreadsStopped: true });
  }
  applyBreakpoints(source, requests) {
    const s = this.session;
    return requests.map((bp, index) => {
      if (bp.condition || bp.hitCondition || bp.logMessage)
        return {
          id: index + 1,
          verified: false,
          line: bp.line,
          message: "Conditional, hit-count and log breakpoints are unsupported",
        };
      const entries = [...s.lines]
          .filter(
            ([, loc]) => samePath(loc.path, source) && loc.line >= bp.line,
          )
          .sort((a, b) => a[1].line - b[1].line),
        item = entries[0];
      if (item)
        for (const [offset, loc] of entries)
          if (loc.line === item[1].line) s.breakpoints.add(s.base + offset);
      return {
        id: index + 1,
        verified: !!item,
        line: item?.[1].line || bp.line,
      };
    });
  }
  startRun(temporary, depth) {
    const s = this.session;
    s.running = true;
    this.event("continued", { threadId: 1, allThreadsContinued: true });
    this.runPromise = (async () => {
      let reason = "pause",
        count = 0;
      try {
        while (count < s.maxInstructions && s.running && !s.cancelled) {
          for (
            let batch = 0;
            batch < 100 &&
            count < s.maxInstructions &&
            s.running &&
            !s.cancelled;
            batch++, count++
          ) {
            s.step();
            if (s.ended) {
              s.running = false;
              break;
            }
            if (s.breakpoints.has(s.pc())) {
              reason = "breakpoint";
              s.running = false;
              break;
            }
            if (
              temporary !== undefined &&
              s.pc() === temporary &&
              (depth === undefined || s.callFrames.length === depth)
            ) {
              reason = "step";
              s.running = false;
              break;
            }
          }
          if (s.running) await new Promise((resolve) => setImmediate(resolve));
        }
        if (count >= s.maxInstructions)
          this.event("output", {
            category: "console",
            output: "Instruction limit reached; paused.\n",
          });
      } catch (error) {
        s.lastException = String(error.message || error);
        this.event("output", {
          category: "stderr",
          output: s.lastException + "\n",
        });
        reason = "exception";
      } finally {
        s.running = false;
        this.stopped(reason);
      }
    })();
  }
  async handle(request) {
    const command = request.command,
      args = request.arguments || {},
      s = this.session;
    try {
      switch (command) {
        case "initialize":
          this.response(request, {
            supportsConfigurationDoneRequest: true,
            supportsReadMemoryRequest: true,
            supportsWriteMemoryRequest: true,
            supportsDisassembleRequest: true,
            supportsEvaluateForHovers: true,
            supportsSetVariable: true,
            supportsExceptionInfoRequest: true,
            supportsTerminateRequest: true,
          });
          break;
        case "launch":
          if (s.running) throw Error("Stop execution before relaunch");
          this.configured = this.terminationSent = false;
          await s.launch(args);
          this.response(request);
          this.event("initialized");
          break;
        case "configurationDone":
          if (this.configured || !s.u) throw Error("Session is not ready");
          this.configured = true;
          this.response(request);
          if (s.stopOnEntry) this.stopped("entry");
          else this.startRun();
          break;
        case "setBreakpoints": {
          if (s.running) throw Error("Pause before changing breakpoints");
          const source = args.source?.path;
          if (!source) throw Error("Source path required");
          this.breakpointRequests.set(
            path.resolve(source),
            args.breakpoints || [],
          );
          s.breakpoints.clear();
          let result = [];
          for (const [file, bps] of this.breakpointRequests) {
            const applied = this.applyBreakpoints(file, bps);
            if (samePath(file, source)) result = applied;
          }
          this.response(request, { breakpoints: result });
          break;
        }
        case "threads":
          this.response(request, {
            threads: [{ id: 1, name: "8086 JavaScript/WASM CPU" }],
          });
          break;
        case "stackTrace": {
          this.requirePaused();
          const loc = s.location(),
            frame = {
              id: 1,
              name: `${hex(s.reg("CS"))}:${hex(s.reg("IP"))}`,
              line: loc?.line || 0,
              column: 1,
              instructionPointerReference: hex(s.pc()),
            };
          if (loc)
            frame.source = { name: path.basename(loc.path), path: loc.path };
          this.response(request, { stackFrames: [frame], totalFrames: 1 });
          break;
        }
        case "scopes":
          this.requirePaused();
          this.response(request, {
            scopes: [
              "Registers / 寄存器",
              "Flags / 标志位",
              "Data / 数据变量",
              "Stack / 堆栈 SS:SP",
            ].map((name, index) => ({
              name,
              variablesReference: index + 1,
              expensive: false,
            })),
          });
          break;
        case "variables": {
          this.requirePaused();
          const values = [],
            ref = args.variablesReference,
            add = (name, value, address, type = "uint16") =>
              values.push({
                name,
                value,
                type,
                variablesReference: 0,
                ...(address !== undefined
                  ? { memoryReference: hex(address) }
                  : {}),
              });
          if (ref === 1)
            for (const name of REGS) {
              const v = s.reg(name),
                address = ["CS", "DS", "ES", "SS"].includes(name)
                  ? v * 16
                  : name === "IP"
                    ? s.pc()
                    : name === "SP"
                      ? s.reg("SS") * 16 + v
                      : v;
              add(name === "EFLAGS" ? "FLAGS" : name, hex(v), address);
            }
          else if (ref === 2)
            for (const [name, bit] of Object.entries(FLAGS))
              add(
                name,
                String((s.reg("EFLAGS") >> bit) & 1),
                undefined,
                "bool",
              );
          else if (ref === 3)
            for (const [name, item] of s.symbols) {
              const address = s.base + item.offset,
                v = s.read(address, item.size).readUIntLE(0, item.size);
              add(name, `${hex(v)} (${v})`, address, "uint" + item.size * 8);
            }
          else if (ref === 4)
            for (let i = 0; i < 8; i++) {
              const offset = (s.reg("SP") + i * 2) & 65535,
                address = s.reg("SS") * 16 + offset;
              add(
                "SS:" + offset.toString(16).toUpperCase().padStart(4, "0"),
                hex(s.read(address, 2).readUInt16LE()),
                address,
              );
            }
          else throw Error("Unknown variables reference");
          const start = Math.max(0, args.start || 0);
          this.response(request, {
            variables: values.slice(
              start,
              args.count ? start + args.count : undefined,
            ),
          });
          break;
        }
        case "continue":
          this.requirePaused();
          this.response(request, { allThreadsContinued: true });
          this.startRun();
          break;
        case "next":
        case "stepIn":
        case "stepOut": {
          this.requirePaused();
          const item = s.instruction();
          if (command === "stepOut") {
            if (!s.callFrames.length) throw Error("No tracked CALL frame");
            this.response(request);
            this.startRun(s.callFrames.at(-1).address, s.callFrames.length - 1);
          } else if (command === "next" && [5, 6].includes(item.flow)) {
            this.response(request);
            this.startRun(
              s.reg("CS") * 16 + ((s.reg("IP") + item.size) & 65535),
              s.callFrames.length,
            );
          } else {
            try {
              s.step();
              this.response(request);
              this.stopped();
            } catch (error) {
              s.lastException = String(error.message || error);
              this.response(request, {}, error);
              this.event("output", {
                category: "stderr",
                output: s.lastException + "\n",
              });
              this.stopped("exception");
            }
          }
          break;
        }
        case "pause": {
          const running = s.running;
          s.running = false;
          this.response(request);
          if (!running) this.stopped("pause");
          break;
        }
        case "disconnect":
        case "terminate":
          s.cancelled = true;
          s.running = false;
          if (this.runPromise) await this.runPromise;
          s.close();
          this.response(request);
          if (!this.terminationSent) {
            this.terminationSent = true;
            this.event("terminated");
          }
          break;
        case "evaluate":
          this.requirePaused();
          {
            const value = s.evaluate(args.expression);
            this.response(request, {
              result: `${hex(value)} (${value})`,
              variablesReference: 0,
              memoryReference: hex(Math.max(0, value)),
            });
          }
          break;
        case "setVariable": {
          this.requirePaused();
          const name = args.name.toUpperCase(),
            v = s.evaluate(args.value);
          if ([1, 2].includes(args.variablesReference))
            s.writeRegister(name, v);
          else if (args.variablesReference === 3 && s.symbols.has(name)) {
            const symbol = s.symbols.get(name);
            if (!Number.isInteger(v) || v < 0 || v >= 2 ** (symbol.size * 8))
              throw Error("Value exceeds variable size");
            const data = Buffer.alloc(symbol.size);
            data.writeUIntLE(v, 0, symbol.size);
            s.write(s.base + symbol.offset, data);
          } else
            throw Error(
              "Only registers, flags and named variables can be edited",
            );
          this.response(request, {
            value: `${hex(v)} (${v})`,
            variablesReference: 0,
          });
          break;
        }
        case "readMemory": {
          this.requirePaused();
          const address = Number(args.memoryReference) + (args.offset || 0),
            count = args.count;
          if (!Number.isInteger(count) || count < 0 || count > 65536)
            throw Error("Memory reads must be 0..65536 bytes");
          this.response(request, {
            address: hex(address),
            data: s.read(address, count).toString("base64"),
          });
          break;
        }
        case "writeMemory": {
          this.requirePaused();
          if (
            typeof args.data !== "string" ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              args.data,
            )
          )
            throw Error("Invalid base64");
          const data = Buffer.from(args.data, "base64");
          if (data.length > 65536)
            throw Error("Memory writes must be at most 65536 bytes");
          s.write(Number(args.memoryReference) + (args.offset || 0), data);
          this.response(request, { bytesWritten: data.length });
          break;
        }
        case "disassemble": {
          this.requirePaused();
          let address = Number(args.memoryReference) + (args.offset || 0);
          const count = args.instructionCount,
            skip = args.instructionOffset || 0;
          if (
            !Number.isInteger(count) ||
            !Number.isInteger(skip) ||
            count < 0 ||
            count > 512 ||
            skip < 0 ||
            skip > 512
          )
            throw Error("Disassembly count/offset must be 0..512");
          const output = [];
          for (let i = 0; i < count + skip; i++) {
            const item = s.instruction(address);
            if (i >= skip) {
              const loc = s.lines.get(address - s.base);
              output.push({
                address: hex(address),
                instructionBytes: [...item.bytes]
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join(" "),
                instruction: item.text,
                ...(loc
                  ? {
                      location: {
                        name: path.basename(loc.path),
                        path: loc.path,
                      },
                      line: loc.line,
                    }
                  : {}),
              });
            }
            address += item.size;
          }
          this.response(request, { instructions: output });
          break;
        }
        case "exceptionInfo":
          this.response(request, {
            exceptionId: "8086Lab",
            description: s.lastException || "No exception",
            breakMode: "always",
          });
          break;
        case "setExceptionBreakpoints":
          this.response(request, { breakpoints: [] });
          break;
        case "loadedSources":
          this.response(request, {
            sources: (s.sources || []).map((file) => ({
              name: path.basename(file.path),
              path: file.path,
            })),
          });
          break;
        default:
          this.response(
            request,
            {},
            Error("Unsupported DAP request: " + command),
          );
      }
    } catch (error) {
      this.response(request, {}, error);
      this.event("output", {
        category: "stderr",
        output: String(error.message || error) + "\n",
      });
    }
  }
  dispose() {
    this.session.close();
  }
}
module.exports = { Adapter };
