# Changelog

## Unreleased — 0.4 audit fixes (shared desktop/web source)

- Parse MAP segment rows without crossing blank Class columns into the following line.
- Select MASM/TASM listing layouts explicitly so numeric instruction bytes cannot shift offsets.
- Keep source matching within known segments, with independent monotonic cursors per source file to preserve INCLUDE returns.
- Format negative evaluated values correctly; return AL=24h from DOS AH=09h.
- Recognize obsolete Python settings with deprecation messages and clarify the two environment-check commands.
- Add MAP/LST, repeated-segment and INCLUDE regression cases and a real-compiler numeric ADD mapping fixture.

## 0.5.0 — local web candidate

- Add a browser entry that activates only in the VS Code web UI; retain the desktop entry and compiler behavior.
- Follow MASM/TASM's TASM/MASM 5.00/MASM 6.11 selection and jsdos/jsdos-x browser compilation.
- Bridge the shared WASM debugger to native VS Code registers, variables, breakpoints and source stepping.
- Support virtual file-system URIs, relative INCLUDE and browser-only temporary build storage.
- Add real-browser runtime and VS Code web-host integration tests.

## 0.4.0

- Replace Python/Capstone runtime with inline JavaScript DAP, bundled Unicorn x86 WASM and iced-x86 WASM; no runtime setup/downloads.
- Support common DOS COM/EXE, tiny through huge models, explicit segments, GROUP, multiple code segments/far calls, simple positional macros and local INCLUDE files.
- Add safe expressions, responsive pause/termination and tests for migrated debugger features.
- Include corresponding GPL engine source and licenses.

## 0.3.1

- Support textbook explicit SEGMENT/ENDS/ASSUME/END entry source syntax, including ORG and DUP, with one executable segment.
- Map data symbols through each named segment's linker address for MASM 5.00, MASM 6.11 and TASM; no hardcoded _DATA/DGROUP requirement for explicit sources.
- Add a byte-copy sample and actual compiler/backend validation for both data-first and code-first layouts.

## 0.3.0

- Follow the resource-scoped MASM/TASM assembler and emulator selection on each launch.
- Support TASM, MASM (alias for 6.11), MASM 5.00 and MASM 6.11 with appropriate compiler/linker tools and listing parsers.
- Compile through the dependency's jsdos/jsdos-x runtime without an external DOSBox executable; retain DOSBox/DOSBox-X backends.
- Correct MASM data symbol addresses when the linked data segment starts within a paragraph.
- Reject custom project/action workflows rather than silently compiling with a different toolchain.
- Add the approved real 8086 photograph icon, with image attribution and license.


## 0.2.0 — Preview candidate

- Declare MASM/TASM as a required extension and discover its compiler bundle.
- Remove machine-specific paths; add runtime setup, DOSBox-X selection and environment checks.
- Separate the execution core and DAP lifecycle; isolate each compiler session.
- Validate MZ headers/relocations and restrict unsupported source formats explicitly.
- Add safe arithmetic watch expressions, register/flag/data editing, memory access and forward disassembly.
- Decode indirect CALLs for step over; track CALL return positions for step out.
- Preserve faulting source position and report unsupported DOS/BIOS/hardware operations.
- Add automated tests, a real compiler integration test, GitHub CI and manual release packaging.

## 0.1.0 — Local prototype

- Initial machine-specific TASM / Unicorn adapter with register and flag views.
