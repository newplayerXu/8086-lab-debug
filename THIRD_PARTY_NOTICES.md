# Third-party components

This VSIX contains JavaScript source, samples, documentation and pinned runtime dependencies, including Unicorn x86 WebAssembly and iced-x86 WebAssembly. Python, Capstone and proprietary assembler/emulator executables are not included. Runtime activation performs no package download.

| Component | Relationship | Upstream |
|---|---|---|
| xsro.masm-tasm | Required VS Code extension; its installed bundle may provide the compiler | https://github.com/dosasm/masm-tasm |
| TASM/TLINK | External user-provided or dependency-provided DOS tools; not redistributed here | Borland tools; retain original terms |
| DOSBox-X | External user-installed executable | https://github.com/joncampbell123/dosbox-x |
| @alexaltea/unicorn-js 2.1.4 | Bundled x86-only JS/WASM; GPL-2.0 | https://github.com/AlexAltea/unicorn.js |
| iced-x86 1.21.0 | Bundled 16-bit decoder/formatter; MIT | https://github.com/icedland/iced |
| adm-zip 0.6.1 | Bundled ZIP reader/writer; MIT | https://github.com/cthackers/adm-zip |
| iconv-lite 0.7.2 / safer-buffer | Bundled source/log encoding; MIT | https://github.com/ashtuchkin/iconv-lite |
| @vscode/vsce | Development-only packaging tool; excluded from VSIX | https://github.com/microsoft/vscode-vsce |

The project is licensed GPL-2.0-or-later to provide source under terms compatible with the GPL Unicorn engine dependency. An upstream extension's source-code license should not be assumed to relicense proprietary assembler binaries contained in its bundle. Users are responsible for obtaining their external tools under the applicable terms.

## Unicorn source and rebuild

The distributed npm x86 artifact is unmodified. Its corresponding wrapper source commit is `560284c59c11c8d6c94d537f4354339f069ddcdf`, with Unicorn submodule `8028ec436f2d9376525352dd38ed9ed6b9f6be10`. Complete buildable source and upstream build scripts are included as `third_party/unicorn-js-2.1.4-source.tar.gz`; `third_party/Unicorn-COPYING` carries the engine license. Extract it, install the upstream development prerequisites (Emscripten/CMake/Python), then run `python build.py x86`. Those are developer rebuild tools, not end-user runtime requirements. npm/runtime dependency licenses remain in their package directories; the project source is published at the repository URL in package.json.

## Icon photograph

Source: https://commons.wikimedia.org/wiki/File:I8086.jpg
Original photograph uploaded by Poil~commonswiki; readability modification by Moyogo.
License: Creative Commons Attribution-ShareAlike 3.0 Unported, https://creativecommons.org/licenses/by-sa/3.0/ .
Changes: imagegen assisted square background extension and reframing for the extension icon. The resulting icon image is distributed under CC BY-SA 3.0; this image license is separate from the code license. No endorsement by Intel or the photographers is implied.

## Embedded compiler runtime

The web bundles include buffer 6.0.3 (and base64-js/ieee754), path-browserify 1.0.1 and fflate 0.8.3 under MIT. Their complete notices are collected in `third_party/web-runtime-licenses.txt`. iced-x86's MIT JS wrapper is adapted at build time to initialize its unchanged WASM asynchronously; `scripts/build-web.js` records the transformation. esbuild, Playwright and VS Code test-web are development tools and are not runtime dependencies.

The js-dos engine is loaded from the installed xsro.masm-tasm extension, not redistributed. 0.3.0 was verified with MASM/TASM 2.2.1 / emulators 8.4.1-dosasm0.2. Its Node platform adapter depends on the current bundle layout and fails explicitly if upstream changes it.
