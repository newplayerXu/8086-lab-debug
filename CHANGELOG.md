# Changelog

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
