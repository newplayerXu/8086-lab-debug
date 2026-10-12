"use strict";
const fs = require("./memory-fs");
const { Adapter } = require("../adapter");
const { engine } = require("../core");
const { cancelBuild } = require("./compiler");
const iced = require("iced-x86");
const { initializeEmulators } = require("./emulators");
const bridge = acquireVsCodeApi();
let adapter,
  queue = Promise.resolve();
function status(text) {
  document.getElementById("status").textContent = text;
}
async function initialize(resources) {
  globalThis.labResources = resources;
  await iced.initialize(
    new Uint8Array(await (await fetch(resources.icedWasm)).arrayBuffer()),
  );
  await engine();
  await initializeEmulators(resources.emulatorsPrefix + "emulators.js");
  adapter = new Adapter((message) => {
    if (message.event === "output") {
      const log = document.getElementById("log");
      log.textContent = (log.textContent + message.body.output).slice(-65536);
    }
    if (message.event === "stopped")
      status("Paused — use the VS Code debug controls.");
    if (message.event === "terminated") status("Program finished.");
    bridge.postMessage({ type: "dap", message });
  });
  status("Ready.");
  bridge.postMessage({ type: "ready" });
}
window.addEventListener("message", (event) => {
  const packet = event.data;
  if (packet.type === "init") {
    queue = initialize(packet.resources).catch((error) => {
      status(error.message);
      bridge.postMessage({ type: "fatal", error: error.message });
    });
  } else if (packet.type === "dispose") {
    adapter?.dispose();
    void cancelBuild();
  } else if (packet.type === "dap") {
    queue = queue
      .then(async () => {
        if (!adapter) throw Error("Web runtime is not ready");
        if (packet.message.command === "launch") {
          fs.reset();
          for (const file of packet.files)
            fs.writeFileSync(file.path, new Uint8Array(file.bytes));
          status("Compiling with MASM/TASM…");
        }
        await adapter.handle(packet.message);
      })
      .catch((error) =>
        bridge.postMessage({ type: "fatal", error: error.message }),
      );
  }
});
bridge.postMessage({ type: "boot" });
