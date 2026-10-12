"use strict";
async function initializeEmulators(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error("MASM/TASM browser engine was not found");
  const script = await response.text(),
    marker = "n.platform=new o";
  if (!script.includes(marker))
    throw Error(
      "Unsupported MASM/TASM js-dos engine layout; web adapter needs an update",
    );
  // The dependency distributes a browser bundle with an empty platform. Supply
  // its HTTP platform in memory, as the dependency's own web entry does.
  new Function(
    script.replace(marker, "n.platform=globalThis.__labPlatform=new o"),
  )();
  globalThis.__labPlatform.set({
    name: "browser",
    node_require: () => {
      throw Error("Node modules are unavailable on the web");
    },
    httpRequest: async (resource, options) => {
      const result = await fetch(resource);
      if (!result.ok)
        throw Error(
          "Could not load MASM/TASM runtime resource: " + result.status,
        );
      return options?.responseType === "arraybuffer"
        ? result.arrayBuffer()
        : result.text();
    },
  });
}
module.exports = { initializeEmulators };
