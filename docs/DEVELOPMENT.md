# Development

Requirements: Node.js 22+, Python 3.10+ and Git. Runtime debugging currently supports Windows desktop. Unit tests can also run on Linux; this does not make Linux debugging supported.

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
npm test
.venv\Scripts\python -m unittest discover -s test -p "test_*.py" -v
npm run package
```

For the real compiler integration test, use a legally available installed MASM/TASM bundle and DOSBox-X:

```powershell
$env:DOSBOX_PATH = "C:\path\to\dosbox-x.exe"
$env:TASM_BUNDLE = "C:\path\to\xsro.masm-tasm\resources\TASM.jsdos"
.venv\Scripts\python test\integration.py
```

No proprietary compiler binaries are committed. CI runs hermetic CPU/DAP tests; the real TASM integration test requires the developer's external tools and runs locally.

Open this folder in VS Code and start the **Run 8086 Lab extension** launch configuration to open an Extension Development Host. Install the declared MASM/TASM dependency in that host and configure Python/DOSBox-X. Test the register tutorial, F10/F11/F9/F5, stop/restart, missing-tool errors and unsupported interrupts before releasing.

Code layout:

- `src/extension.js`: commands, configuration provider and adapter launch.
- `src/runtime.js`: executable discovery and child process invocation without a shell.
- `adapter/core.py`: source build, EXE loader, real machine-code execution and expression parsing.
- `adapter/main.py`: DAP framing, responses, variables, breakpoints and worker lifecycle.
- `test/test_adapter.py`: hermetic register/stack/loader/DAP regression tests.
- `test/integration.py`: actual TASM/DOSBox sample verification.

Temporary build directories are created by the adapter and removed only through session-owned paths. No runtime package downloads occur during extension activation or a normal debugging session. Setup is a separate user command.

## 0.3 compiler matrix

Set `MASMTASM_RESOURCES` to the installed MASM/TASM `resources` directory, `DOSBOX_PATH` to DOSBox-X, and optionally `NODE_PATH` to Node or the VS Code Electron executable. Run `python test/integration_matrix.py dosbox-x jsdos jsdos-x`. This checks actual compiler output, source/data mapping, execution, registers, stack, flags and output. `python test/integration_matrix.py dosbox` requires DOSBOX_PATH to point to an installed classic DOSBox executable.
