"use strict";
const vscode = require("vscode");
const { selectBuild } = require("../selection");
const { collectSources } = require("./sources");
const { equal } = require("./equal");
const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function activate(context) {
  // A web entry is also runnable in desktop test hosts. Opt in only for the web UI.
  if (vscode.env.uiKind !== vscode.UIKind.Web) return;
  const output = vscode.window.createOutputChannel("8086 Lab");
  context.subscriptions.push(output);
  function programUri(value) {
    if (!value || value === "${file}")
      return vscode.window.activeTextEditor?.document.uri;
    if (/^[a-z][\w+.-]*:/i.test(value)) return vscode.Uri.parse(value);
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return value.startsWith("/")
      ? (folder || vscode.window.activeTextEditor?.document.uri)?.with({
          path: value,
        })
      : folder && vscode.Uri.joinPath(folder, value);
  }
  async function environment(launch = {}) {
    if (!vscode.workspace.isTrusted)
      throw Error("Trust this workspace before debugging");
    const dependency = vscode.extensions.getExtension("xsro.masm-tasm");
    if (!dependency) throw Error("Install MASM/TASM: xsro.masm-tasm");
    const resource = programUri(launch.program);
    if (!resource || !/\.asm$/i.test(resource.path))
      throw Error("Open an .asm file first");
    const settings = vscode.workspace.getConfiguration("masmtasm", resource);
    const selected = selectBuild(
      settings.get("ASM.assembler"),
      settings.get("ASM.emulator"),
      "/",
    );
    if (!selected.buildBackend.startsWith("jsdos"))
      throw Error("Select jsdos or jsdos-x in MASM/TASM for web debugging");
    if (
      launch.tasmDirectory ||
      vscode.workspace
        .getConfiguration("8086lab", resource)
        .get("tasmDirectory")
    )
      throw Error("Local compiler directories cannot be used on the web");
    const defaults =
      dependency.packageJSON.contributes.configuration.properties[
        "masmtasm.ASM.actions"
      ].default;
    const action = settings.get("ASM.actions")?.[selected.assembler];
    if (action && !equal(action, defaults[selected.assembler]))
      throw Error(
        "Restore MASM/TASM built-in build actions for source debugging",
      );
    let directory = vscode.Uri.joinPath(resource, "..");
    const workspace = vscode.workspace.getWorkspaceFolder(resource)?.uri;
    while (true) {
      let exists = false;
      try {
        await vscode.workspace.fs.stat(
          vscode.Uri.joinPath(directory, "dosasm.jsonc"),
        );
        exists = true;
      } catch (error) {
        if (error.code !== "FileNotFound" && !/not.?found/i.test(error.message))
          throw error;
      }
      if (exists)
        throw Error(
          "Custom dosasm.jsonc builds are not supported by the web source debugger",
        );
      const parent = vscode.Uri.joinPath(directory, "..");
      if (
        parent.path === directory.path ||
        directory.toString() === workspace?.toString()
      )
        break;
      directory = parent;
    }
    return {
      ...launch,
      assembler: selected.assembler,
      buildBackend: selected.buildBackend,
      program: resource.toString(),
      dependencyUri: dependency.extensionUri.toString(),
    };
  }
  function command(name, task) {
    context.subscriptions.push(
      vscode.commands.registerCommand(name, async () => {
        try {
          return await task();
        } catch (error) {
          output.appendLine(error.stack || error.message);
          console.error("8086 Lab web:", error.message);
          vscode.window.showErrorMessage("8086 Lab: " + error.message);
        }
      }),
    );
  }
  command("8086lab.debugFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !/\.asm$/i.test(editor.document.uri.path))
      throw Error("Open an .asm file first");
    if (editor.document.isDirty && !(await editor.document.save())) return;
    return await vscode.debug.startDebugging(
      vscode.workspace.getWorkspaceFolder(editor.document.uri),
      {
        type: "8086-lab",
        request: "launch",
        name: "8086 Lab: web current file",
        program: editor.document.uri.toString(),
        stopOnEntry: true,
      },
    );
  });
  command("8086lab.check", async () => {
    const result = await environment();
    vscode.window.showInformationMessage(
      `8086 Lab web: ${result.assembler} / ${result.buildBackend}.`,
    );
  });
  command("8086lab.setup", async () =>
    vscode.window.showInformationMessage(
      "Web runtime is bundled. Select MASM/TASM jsdos or jsdos-x, then debug an ASM file.",
    ),
  );
  command("8086lab.chooseDosbox", async () => {
    throw Error(
      "External DOSBox executables are available in desktop VS Code only",
    );
  });
  command("8086lab.openSample", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) throw Error("Open a writable workspace folder first");
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(folder, "registers.asm"),
      filters: { Assembly: ["asm"] },
    });
    if (target) {
      await vscode.workspace.fs.writeFile(
        target,
        await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(context.extensionUri, "samples/registers.asm"),
        ),
      );
      await vscode.window.showTextDocument(target);
    }
  });
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === "8086-lab")
        void vscode.commands.executeCommand("workbench.view.debug");
    }),
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("8086-lab", {
      resolveDebugConfiguration(folder, launch) {
        return {
          type: "8086-lab",
          request: "launch",
          name: "8086 Lab: web",
          program: "${file}",
          ...launch,
        };
      },
      async resolveDebugConfigurationWithSubstitutedVariables(folder, launch) {
        try {
          await vscode.workspace.saveAll(false);
          return await environment(launch);
        } catch (error) {
          console.error("8086 Lab web configuration:", error.message);
          vscode.window.showErrorMessage("8086 Lab: " + error.message);
          return undefined;
        }
      },
    }),
  );
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("8086-lab", {
      createDebugAdapterDescriptor(session) {
        const dependencyUri = vscode.Uri.parse(
          session.configuration.dependencyUri,
        );
        const panel = vscode.window.createWebviewPanel(
          "8086-lab-runtime",
          "8086 Lab",
          { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri, dependencyUri],
          },
        );
        const emitter = new vscode.EventEmitter();
        const urls = {},
          reverse = new Map(),
          forward = new Map();
        let disposed = false,
          queue = Promise.resolve();
        const resource = (base, file) =>
          panel.webview
            .asWebviewUri(vscode.Uri.joinPath(base, file))
            .toString();
        urls.icedWasm = resource(
          context.extensionUri,
          "node_modules/iced-x86/iced_x86_bg.wasm",
        );
        urls.emulatorsPrefix = resource(
          dependencyUri,
          "resources/node_modules/emulators/build/wasm/",
        );
        let readyResolve, readyReject;
        const ready = new Promise((resolve, reject) => {
          readyResolve = resolve;
          readyReject = reject;
        });
        // Keep initialization errors handled even if the client has not sent its first request.
        ready.catch(() => {});
        const timeout = setTimeout(
          () => readyReject(Error("Web runtime initialization timed out")),
          45000,
        );
        function mapPaths(value, mapping) {
          if (Array.isArray(value))
            return value.map((item) => mapPaths(item, mapping));
          if (!value || typeof value !== "object") return value;
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              key === "path" && typeof item === "string"
                ? mapping.get(item) || item
                : mapPaths(item, mapping),
            ]),
          );
        }
        const listener = panel.webview.onDidReceiveMessage((packet) => {
          if (packet.type === "boot")
            void panel.webview.postMessage({ type: "init", resources: urls });
          else if (packet.type === "ready") {
            clearTimeout(timeout);
            readyResolve();
          } else if (packet.type === "fatal") {
            clearTimeout(timeout);
            readyReject(Error(packet.error));
            output.appendLine(packet.error);
            vscode.window.showErrorMessage("8086 Lab web: " + packet.error);
          } else if (packet.type === "dap" && !disposed)
            emitter.fire(mapPaths(packet.message, reverse));
        });
        const nonce = Array.from(
          crypto.getRandomValues(new Uint8Array(16)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        const src = panel.webview.cspSource;
        panel.webview.html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${src} ${escape(resource(dependencyUri, "").replace(/\/?$/, "/"))}; worker-src blob:; style-src 'nonce-${nonce}';"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}pre{white-space:pre-wrap}</style></head><body><p id="status">Starting…</p><pre id="log"></pre><script nonce="${nonce}" src="${escape(resource(context.extensionUri, "node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.js"))}"></script><script nonce="${nonce}" src="${escape(resource(context.extensionUri, "dist/web/view.js"))}"></script></body></html>`;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          clearTimeout(timeout);
          readyReject(Error("Web debug session closed"));
          void panel.webview.postMessage({ type: "dispose" });
          listener.dispose();
          emitter.dispose();
          panel.dispose();
        };
        panel.onDidDispose(() => {
          if (!disposed) {
            emitter.fire({ type: "event", event: "terminated", seq: 0 });
            dispose();
          }
        });
        return new vscode.DebugAdapterInlineImplementation({
          onDidSendMessage: emitter.event,
          handleMessage(message) {
            queue = queue
              .then(async () => {
                await ready;
                if (disposed) return;
                let files;
                if (message.command === "launch") {
                  const collected = await collectSources(
                    vscode,
                    vscode.Uri.parse(message.arguments.program),
                    message.arguments.sourceEncoding,
                  );
                  files = collected.files;
                  for (const file of files) {
                    reverse.set(file.path, file.uri);
                    forward.set(file.uri, file.path);
                    forward.set(vscode.Uri.parse(file.uri).path, file.path);
                  }
                  message = {
                    ...message,
                    arguments: {
                      ...message.arguments,
                      program: collected.program,
                      buildRoot: "/build",
                      assemblerBundle: resource(
                        dependencyUri,
                        "resources/" + message.arguments.assembler + ".jsdos",
                      ),
                    },
                  };
                }
                await panel.webview.postMessage({
                  type: "dap",
                  message: mapPaths(message, forward),
                  files,
                });
              })
              .catch((error) =>
                emitter.fire({
                  type: "response",
                  seq: 0,
                  request_seq: message.seq,
                  command: message.command,
                  success: false,
                  message: error.message,
                }),
              );
          },
          dispose,
        });
      },
    }),
  );
}
exports.activate = activate;
