# 8086 Lab: MASM/TASM Debugger

Step through a single-file 16-bit assembly program in VS Code. Watch registers, flags, named data variables and stack values change after each instruction.

8086 Lab uses **TASM to assemble actual machine code**, Unicorn to execute x86 16-bit instructions, and the VS Code Debug Adapter Protocol for the interface. It requires [MASM/TASM by xsro](https://marketplace.visualstudio.com/items?itemName=xsro.masm-tasm) and Windows desktop. This is a preview for instruction learning, not a cycle-accurate 8086 hardware emulator or a complete DOS implementation.

## First use

1. Install Python 3.10+ x64 and [DOSBox-X](https://dosbox-x.com/). MASM/TASM is declared as an extension dependency.
2. Run **8086 Lab: Set Up Python Runtime** from the Command Palette. This creates a private virtual environment and downloads pinned Unicorn/Capstone packages from PyPI. To use an existing environment, set `8086lab.runtimePythonPath` instead.
3. Run **8086 Lab: Select DOSBox-X Executable**, then **8086 Lab: Check Environment**.
4. Run **8086 Lab: Open Register Tutorial** to save a sample in your project.
5. Open the saved `.asm` file and choose **8086 Lab: Debug Current ASM File** from the editor context menu or Command Palette.

The extension does not redistribute TASM, TLINK or DOSBox-X. The default compiler bundle is discovered inside the installed MASM/TASM dependency. You may configure your own legally available tools with `8086lab.tasmDirectory`.

## Controls

| Action | Result |
|---|---|
| F10 | Step one instruction; step over a CALL until its return or a breakpoint |
| F11 | Step into a CALL |
| Shift+F11 | Return from a tracked CALL frame |
| F9 | Toggle a source breakpoint |
| F5 | Continue to a breakpoint, exit, exception or instruction limit |
| Shift+F5 | Stop |
| Ctrl+Shift+F5 | Restart and reassemble |

Expand **Registers**, **Flags**, **Data** and **Stack** in the Variables panel. Data symbols refer to the linked data segment, even if the program changes DS. Memory operands in actual instructions still use the CPU's segment registers.

Watch expressions support register/flag/symbol names, integer arithmetic, bitwise operations and segmented addresses, for example `AX`, `ZF`, `RESULT`, `AX + BX`, `SS:SP` and `0008h`. Function calls and arbitrary Python execution are not supported. Registers, flags and named byte/word variables can be edited while paused. The adapter also provides DAP memory read/write and forward disassembly.

## F5 configuration

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "8086 Lab: current file",
    "type": "8086-lab",
    "request": "launch",
    "program": "${file}",
    "stopOnEntry": true,
    "maxInstructions": 1000000
  }]
}
```

The active file must be `.asm` when using `${file}`. For a fixed target use `${workspaceFolder}/registers.asm`.

## Supported source and services

- `.8086`, `.model small`, exactly one `.code` segment and one source file.
- TASM-compatible ASCII/CP437 data literals. Unicode comments and source filenames are accepted; the DOS build directory must have an ASCII path.
- Basic DOS output/version/exit: INT 21h with AH=02h, 09h, 30h, 4Ch; INT 20h exit; INT 10h/AH=0Eh character output.
- Source breakpoints, register/flag/data inspection, stack words, tracked CALL step over/out, forward disassembly and memory access.

Includes, macros, explicit segments, multiple code segments, conditional/log breakpoints and a reconstructed symbolic call stack are outside this preview. Keyboard input, file services, port I/O, HLT timing and other DOS/BIOS interrupts are not implemented. Unsupported services pause with an error; they do not pretend to succeed. Use MASM/TASM's independent Turbo Debugger workflow for a full DOS environment.

The engine runs x86 16-bit mode; `.8086` constrains the assembler. It does not model 8086 bus cycles, prefetch timing or peripherals. Do not use it to validate hardware timing.

## Settings and troubleshooting

| Setting | Use |
|---|---|
| `8086lab.pythonPath` | Base Python executable, default `python`; `py` uses `-3` |
| `8086lab.runtimePythonPath` | Existing Python with the pinned requirements; bypass private runtime |
| `8086lab.dosboxPath` | DOSBox-X executable; otherwise search PATH or MASM/TASM's command setting |
| `8086lab.tasmDirectory` | Directory containing TASM.EXE and TLINK.EXE; otherwise use dependency bundle |
| `8086lab.buildDirectory` | Writable ASCII directory for isolated session build directories |

If your Windows temporary folder contains non-ASCII characters, set `8086lab.buildDirectory` to an ASCII path such as `C:/8086-build`. Source files may remain elsewhere. Each session receives its own subdirectory and mounted DOS drive. Successful sessions clean up their temporary files when stopped. Build errors appear in Debug Console; inspect the emitted build-directory path before stopping if you need the compiler files.

A missing runtime is fixed by **Set Up Python Runtime**. A missing adapter after install is fixed by **Developer: Reload Window**. Choose **Check Environment** to see tool paths in the **8086 Lab** Output channel. Remote Linux/WSL/macOS hosts and VS Code Web are unsupported.

## Development and release

See the included `docs/DEVELOPMENT.md` and `docs/PUBLISHING.zh-CN.md` files for development and GitHub / Microsoft Marketplace publishing. The current `local8086` publisher ID is a local placeholder, not a registered Marketplace publisher.

Project license: GPL-2.0-or-later. External tools retain their own licenses. No telemetry is collected by this extension. Setup uses PyPI to install dependencies only when explicitly invoked.

## 中文速览

完整 MASM 源码由 TASM 编译，再执行生成的 16 位机器码。左侧显示寄存器、标志位、变量与堆栈。先运行“Set Up Python Runtime”，选择 DOSBox-X，再对 ASM 文件执行“Debug Current ASM File”。F10 单步，F9 断点，F5 继续。

本版限 Windows 与单文件 `.8086 / .model small / .code` 程序。完整 DOS 输入、文件操作和外设功能请使用独立 Turbo Debugger。上架与 GitHub 托管步骤见发布指南。
