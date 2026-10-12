# Third-party components

This VSIX contains the project's own JavaScript/Python source, documentation, requirements and sample assembly. It does not contain third-party assembler executables, DOSBox-X, a Python interpreter, Unicorn native libraries or Capstone native libraries.

| Component | Relationship | Upstream |
|---|---|---|
| xsro.masm-tasm | Required VS Code extension; its installed bundle may provide the compiler | https://github.com/dosasm/masm-tasm |
| TASM/TLINK | External user-provided or dependency-provided DOS tools; not redistributed here | Borland tools; retain original terms |
| DOSBox-X | External user-installed executable | https://github.com/joncampbell123/dosbox-x |
| Unicorn 2.1.4 | Python runtime dependency installed from PyPI; GPL engine, bindings/package metadata may differ | https://github.com/unicorn-engine/unicorn/tree/2.1.4 |
| Capstone 5.0.6 | Python runtime disassembler dependency installed from PyPI | https://github.com/capstone-engine/capstone |
| @vscode/vsce | Development-only packaging tool; excluded from VSIX | https://github.com/microsoft/vscode-vsce |

The project is licensed GPL-2.0-or-later to provide source under terms compatible with the GPL Unicorn engine dependency. An upstream extension's source-code license should not be assumed to relicense proprietary assembler binaries contained in its bundle. Users are responsible for obtaining their external tools under the applicable terms.

## Icon photograph

Source: https://commons.wikimedia.org/wiki/File:I8086.jpg
Original photograph uploaded by Poil~commonswiki; readability modification by Moyogo.
License: Creative Commons Attribution-ShareAlike 3.0 Unported, https://creativecommons.org/licenses/by-sa/3.0/ .
Changes: imagegen assisted square background extension and reframing for the extension icon. The resulting icon image is distributed under CC BY-SA 3.0; this image license is separate from the code license. No endorsement by Intel or the photographers is implied.

## Embedded compiler runtime

The js-dos engine is loaded from the installed xsro.masm-tasm extension, not redistributed. 0.3.0 was verified with MASM/TASM 2.2.1 / emulators 8.4.1-dosasm0.2. Its Node platform adapter depends on the current bundle layout and fails explicitly if upstream changes it.
