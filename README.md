# 8086 Lab: MASM/TASM Debugger

Debug single-file 8086 assembly with registers, flags, data and stack in VS Code. Version 0.3 follows the **assembler and emulator selected in MASM/TASM** on every debug launch.

## First use

1. Install Windows x64 desktop VS Code and Python 3.10+ x64. The required `xsro.masm-tasm` extension is installed as a dependency.
2. Run **8086 Lab: Set Up Python Runtime**. This creates a private Python environment with pinned Unicorn and Capstone dependencies from PyPI.
3. Select an assembler and emulator using MASM/TASM's status bar. With **jsdos** or **jsdos-x**, no external DOSBox executable is required. With **dosbox** or **dosbox-x**, install that selected emulator and configure its command in MASM/TASM.
4. Run **8086 Lab: Open Register Tutorial**, then **8086 Lab: Debug Current ASM File**. Expand Registers, Flags, Data and Stack.

The extension assembles actual machine code with the selected compiler, then executes it using Unicorn. Choosing jsdos-x does not change the debugging execution engine into DOSBox-X: the emulator selection controls compilation. This is instructional instruction emulation, not a complete DOS/BIOS or cycle-accurate hardware simulator.

## Selection mapping

| MASM/TASM selection | Compiler/linker used |
|---|---|
| TASM | TASM + TLINK |
| MASM | MASM 6.11 / ML + LINK, matching the dependency alias |
| MASM-v5.00 | MASM 5.00 + LINK |
| MASM-v6.11 | MASM 6.11 / ML + LINK |

All four emulator selections are dispatched separately: jsdos, jsdos-x, dosbox, dosbox-x. Selection settings are read for the source resource on every launch; changing them takes effect after restart. The Output channel reports the effective selection. Compiler bundles and js-dos are discovered in the installed dependency. No compiler, emulator binary or WebAssembly engine is redistributed.

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

Requires `.8086`, `.model small`, exactly one `.code`, and a single source file. Unicode comments are accepted; compiler source literals must fit CP437. The build path must be ASCII; use `8086lab.buildDirectory` if the temporary directory contains other characters.

Includes, macros, explicit segments, multi-file builds, custom `dosasm.jsonc` and altered MASM/TASM build actions are not mapped by this preview. They fail clearly instead of silently using another assembler. Conditional/log breakpoints and a reconstructed symbolic call stack are unsupported. Built-in actions are used with extra listing/map generation required by source debugging.

Implemented services: INT 21h AH=02h/09h/30h/4Ch, INT 20h exit, INT 10h AH=0Eh output. Keyboard/file services, port I/O and hardware timing are unsupported. Unsupported services pause with an error. For a complete DOS environment, use MASM/TASM's DOS debugger.

js-dos integration is verified with MASM/TASM 2.2.1 and its 8.4.1-dosasm0.2 engine. The bundled engine omits a Node platform initializer; this extension supplies it using a guarded in-memory adapter. An upstream layout change may require an update; select an external emulator if that happens. Windows desktop only; Linux/WSL/macOS and VS Code Web are unsupported.

## Settings

- `8086lab.pythonPath`: Python used for setup. `py` adds `-3`.
- `8086lab.runtimePythonPath`: optional existing runtime with pinned requirements.
- `8086lab.dosboxPath`: optional override when dosbox-x is selected.
- `8086lab.tasmDirectory`: optional TASM/TLINK directory; clear it when choosing MASM.
- `8086lab.buildDirectory`: ASCII temporary build root.

Run **8086 Lab: Check Environment** to inspect the effective toolchain. Source and releases: https://github.com/newplayerXu/8086-lab-debug . Development and release steps are in `docs/DEVELOPMENT.md` and `docs/PUBLISHING.zh-CN.md`.

Code: GPL-2.0-or-later. Icon photograph: CC BY-SA 3.0; see THIRD_PARTY_NOTICES. No telemetry.

## 中文速览

在 MASM/TASM 状态栏选择汇编器与模拟器，再启动本扩展调试。TASM、MASM 5.00、MASM 6.11 分别使用所选自带工具；MASM 对应 6.11。选 jsdos/jsdos-x 时，无需另装 DOSBox-X。切换后重启调试即可生效，侧栏寄存器与单步界面保持一致。当前支持内置单文件流程，自定义脚本和多文件工程仍需另行适配。
