# Changelog

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
