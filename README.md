# 8086 Lab: MASM/TASM Debugger

Debug 8086 assembly with registers, flags, data and stack in VS Code. Version 0.4 uses **VS Code's JavaScript runtime with bundled WebAssembly libraries**. No Python, pip, separate Node installation or runtime download is needed. The assembler and compilation emulator follow MASM/TASM's selection.

## First use

The local 0.5 candidate also includes a separate **web-only entry** for vscode.dev/github.dev, following the MASM/TASM assembler selection with jsdos/jsdos-x. Desktop activation keeps its existing implementation. See [web setup and boundaries](docs/WEB.zh-CN.md).

1. Install Windows x64 desktop VS Code. The required `xsro.masm-tasm` extension is installed as a dependency.
2. Open a trusted assembly workspace. The CPU and disassembler are included in the VSIX. **8086 Lab: Check Bundled Runtime** is an optional verification command.
3. Select an assembler and emulator using MASM/TASM's status bar. With **jsdos** or **jsdos-x**, no external DOSBox executable is required. With **dosbox** or **dosbox-x**, install that selected emulator and configure its command in MASM/TASM.
4. Run **8086 Lab: Open Register Tutorial**, then **8086 Lab: Debug Current ASM File**. Expand Registers, Flags, Data and Stack.

The extension assembles actual machine code with the selected compiler, then executes it using Unicorn.js x86 WebAssembly; iced-x86 provides 16-bit disassembly. Choosing jsdos-x does not change the debugging execution engine into DOSBox-X: the emulator selection controls compilation. This is instructional instruction emulation, not a complete DOS/BIOS or cycle-accurate hardware simulator.

## Selection mapping

| MASM/TASM selection | Compiler/linker used |
|---|---|
| TASM | TASM + TLINK |
| MASM | MASM 6.11 / ML + LINK, matching the dependency alias |
| MASM-v5.00 | MASM 5.00 + LINK |
| MASM-v6.11 | MASM 6.11 / ML + LINK |

All four emulator selections are dispatched separately on desktop: jsdos, jsdos-x, dosbox, dosbox-x. The web entry supports jsdos/jsdos-x. Selection settings are read for the source resource on every launch; changing them takes effect after restart. Compiler bundles and js-dos are discovered in the installed dependency. No proprietary compiler or js-dos compilation engine is redistributed; the debugging CPU and decoder WASM are bundled.

## Controls

| Key | Action |
|---|---|
| F10 | Step one instruction; step over tracked calls |
| F11 | Step into |
| Shift+F11 | Return from a tracked call |
| F9 | Toggle source breakpoint |
| F5 | Continue |
| Shift+F5 | Stop |
| Ctrl+Shift+F5 | Restart, reread selections and reassemble |

Watch expressions accept registers, flags, data symbols and integer operations, such as `AX`, `ZF`, `RESULT`, `AX + BX`, `SS:SP`, `0008h`. Registers, flags and named byte/word values can be edited while paused. Memory read/write and forward disassembly are supported.

## Launch configuration

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "8086 Lab", "type": "8086-lab", "request": "launch",
    "program": "${file}", "stopOnEntry": true
  }]
}
```

## Scope and limitations

Supports common MASM/TASM 8086 DOS formats: `.model tiny/small/medium/compact/large/huge`, `.code/.data/.stack`, explicit `SEGMENT/ENDS/ASSUME`, `GROUP/DGROUP`, multiple code segments and far calls, `ORG`, `DB/DW/DUP`, basic macros with positional parameters, and local relative INCLUDE files. `.8086` is optional when using the compiler's default mode. Higher CPU directives and USE32 are rejected. A format accepted by the debugger must still be accepted by the chosen compiler version; this does not translate NASM syntax into MASM.

Tiny and code-only `ORG 100H` sources load as DOS COM with CS=DS=ES=SS, IP=100H and SP=FFFEH. Bare `ORG 100H` COM programs receive a temporary code-segment/entry wrapper. Other sources load as relocated MZ EXE. `programFormat` can force exe/com. COM layouts must have no relocation entries and entry 0000:0100. MASM 5.00 tiny sources receive a temporary DS/ES/SS:_TEXT assumption for code-only layouts, or a DGROUP containing _TEXT/_DATA for separate data layouts; the user's file is unchanged. `.startup`/`.exit` expand in the temporary copy into DOS entry/DS/stack setup and termination instructions, supporting all three compilers.

Segment/group addresses come from the linker map. Source breakpoints and frames follow linear addresses across code segments and include files. Simple macro expansion maps to the call line. Unicode comments are accepted; source literals must fit CP437. jsdos/jsdos-x support Unicode build paths. External DOSBox builds require an ASCII `8086lab.buildDirectory` if the default temporary path contains other characters. See `samples/com.asm`, `samples/segments-copy.asm` and `samples/registers.asm`.

Separately assembled/linked multi-module projects, external libraries, advanced macro metaprogramming, custom `dosasm.jsonc` and altered MASM/TASM build actions need a project adapter and are unsupported. Conditional/log breakpoints and a reconstructed symbolic call stack are unsupported. Built-in actions generate extra listing/map information. An empty segment named STACKS alone does not allocate a DOS stack; the linker warning is preserved. Allocate a segment with STACK combine and space before using PUSH/CALL.

Implemented services: INT 21h AH=02h/09h/30h/4Ch, INT 20h exit, INT 10h AH=0Eh output. Keyboard/file services, port I/O and hardware timing are unsupported. Unsupported services pause with an error. For a complete DOS environment, use MASM/TASM's DOS debugger.

js-dos integration is verified with MASM/TASM 2.2.1 and its 8.4.1-dosasm0.2 engine. The bundled engine omits a Node platform initializer; this extension supplies it using a guarded in-memory adapter. An upstream layout change may require an update; select an external emulator if that happens. Windows desktop only; Linux/WSL/macOS and VS Code Web are unsupported.

## Settings

- `8086lab.dosboxPath`: optional override when dosbox-x is selected.
- `8086lab.tasmDirectory`: optional TASM/TLINK directory; clear it when choosing MASM.
- `8086lab.buildDirectory`: optional temporary build root; external DOSBox requires ASCII.

Run **8086 Lab: Check Environment** to inspect the effective toolchain. Source and releases: https://github.com/newplayerXu/8086-lab-debug . Development and release steps are in `docs/DEVELOPMENT.md` and `docs/PUBLISHING.zh-CN.md`.

Code: GPL-2.0-or-later. Icon photograph: CC BY-SA 3.0; see THIRD_PARTY_NOTICES. No telemetry.

## 中文速览

0.4 无需安装 Python 或 Node.js。安装本扩展及前置 MASM/TASM 后，选择汇编器与 jsdos/jsdos-x 即可调试。支持常见 DOS COM/EXE、六种内存模型、显式分段、GROUP、多代码段、简单宏和相对 INCLUDE。寄存器、标志、内存、栈、断点、单步和调用步过保持可用。独立多模块链接、复杂宏和自定义构建尚未适配。
