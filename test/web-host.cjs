"use strict";
const vscode = require("vscode");
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
async function until(check, description) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + description);
}
exports.run = async () => {
  assert(
    vscode.env.uiKind === vscode.UIKind.Web,
    "Test must run in the actual web UI",
  );
  assert(vscode.workspace.isTrusted, "Test workspace must be trusted");
  const extension = vscode.extensions.getExtension(
    "newplayerxu.8086-lab-debug",
  );
  await extension.activate();
  const messages = new Map();
  const tracker = vscode.debug.registerDebugAdapterTrackerFactory("8086-lab", {
    createDebugAdapterTracker(session) {
      const list = [];
      messages.set(session.id, list);
      return { onDidSendMessage: (message) => list.push(message) };
    },
  });
  try {
    for (const [assembler, backend, sample] of [
      ["MASM-v5.00", "jsdos", "com.asm"],
      ["MASM-v6.11", "jsdos-x", "registers.asm"],
    ]) {
      const root = vscode.workspace.workspaceFolders[0],
        uri = vscode.Uri.joinPath(root.uri, sample);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      const settings = vscode.workspace.getConfiguration("masmtasm", uri);
      await settings.update(
        "ASM.assembler",
        assembler,
        vscode.ConfigurationTarget.Global,
      );
      await settings.update(
        "ASM.emulator",
        backend,
        vscode.ConfigurationTarget.Global,
      );
      const started = await vscode.commands.executeCommand("8086lab.debugFile");
      assert(
        started === true,
        "Web Debug Current ASM command starts a session; result=" + started,
      );
      const session = await until(
        () =>
          vscode.debug.activeDebugSession?.type === "8086-lab" &&
          vscode.debug.activeDebugSession,
        "debug session start",
      );
      const list = messages.get(session.id);
      await until(() => list.some((m) => m.event === "stopped"), "entry stop");
      const trace = await session.customRequest("stackTrace", { threadId: 1 });
      assert(
        trace.stackFrames[0].source.path.includes(sample),
        "Source URI maps to workspace file",
      );
      const count = sample === "com.asm" ? 6 : 10;
      for (let i = 0; i < count; i++) {
        const stops = list.filter(m => m.event === "stopped").length;
        await vscode.commands.executeCommand("workbench.action.debug.stepOver");
        await until(() => list.filter(m => m.event === "stopped").length > stops, "native F10 stop");
      }
      const cx = await session.customRequest("evaluate", { expression: "CX" });
      assert(cx.result.includes("0008"), "CX=8");
      const result = await session.customRequest("evaluate", {
        expression: "RESULT",
      });
      assert(result.result.includes("0008"), "RESULT=8");
      const scopes = await session.customRequest("scopes", { frameId: 1 });
      const registers = await session.customRequest("variables", {
        variablesReference: scopes.scopes[0].variablesReference,
      });
      assert(
        registers.variables.some(
          (v) => v.name === "CX" && v.value.includes("0008"),
        ),
        "Native register scope shows CX=8",
      );
      console.log("WEB-HOST PAUSED", assembler, backend, sample);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await session.customRequest("continue", { threadId: 1 });
      await until(
        () => list.some((m) => m.event === "exited" && m.body.exitCode === 0),
        "normal DOS exit",
      );
      await until(
        () => !vscode.debug.activeDebugSession,
        "debug session disposed",
      );
      console.log(
        "WEB-HOST PASS",
        assembler,
        backend,
        sample,
        "native DAP/source/registers/RESULT/exit",
      );
    }
  } finally {
    tracker.dispose();
    await vscode.debug.stopDebugging();
  }
};
