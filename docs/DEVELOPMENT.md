# Development

Node.js 22+ and Git are sufficient. Runtime uses the JavaScript host supplied by desktop VS Code. No Python is needed for development tests or normal packaging.

```powershell
npm ci
npm test
npm audit --audit-level=high
npm run package
```

Real compiler validation uses legally available installed MASM/TASM resources:

```powershell
$env:MASMTASM_RESOURCES = "C:\path\to\xsro.masm-tasm\resources"
$env:DOSBOX_PATH = "C:\path\to\dosbox-x.exe"
node test/integration-js.cjs jsdos jsdos-x dosbox-x
node test/integration-formats.cjs jsdos jsdos-x dosbox-x
```

CI checks JavaScript/WASM CPU, DAP, loader, expression, memory and selection behavior on Windows and Linux. Compiler integration is local because proprietary tool bundles are not redistributed. Windows desktop remains the supported end-user platform.

- src/extension.js: VS Code integration and inline DAP adapter.
- src/adapter.js: DAP lifecycle and cooperative execution batches.
- src/core.js: WASM CPU, MZ/COM loading, interrupts and stepping.
- src/source.js: source/include preparation, listing and linker map parsing.
- src/compiler.js: selected compiler and emulator dispatch.
- src/expression.js: integer parser without eval.
- test/core-js.test.js: engine/DAP regression.
- adapter/ and Python tests: historical baseline only; excluded from VSIX.

Use the Extension Development Host to verify real UI behavior. Include runtime smoke tests from an extracted VSIX with Python-related settings and PATH absent. No runtime downloads or installation commands are needed.

Bundled GPL engine source/rebuild instructions are in THIRD_PARTY_NOTICES.md and third_party/.
