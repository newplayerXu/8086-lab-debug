"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const runtime = require("../src/runtime");
test("parse executable only; never interpret command flags or metacharacters", () => {
  assert.equal(
    runtime.executableFromCommand(
      '"C:\\Program Files\\DOSBox-X\\dosbox-x.exe" -nopromptfolder',
    ),
    "C:\\Program Files\\DOSBox-X\\dosbox-x.exe",
  );
  assert.equal(
    runtime.executableFromCommand("dosbox-x -nopromptfolder"),
    "dosbox-x",
  );
  assert.equal(
    runtime.executableFromCommand(
      "C:\\Program Files\\DOSBox-X\\dosbox-x.exe -flag",
    ),
    "C:\\Program Files\\DOSBox-X\\dosbox-x.exe",
  );
});
test("find executable in injected PATH; absent executable fails", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "8086-test-"));
  try {
    fs.writeFileSync(path.join(root, "dosbox-x.exe"), "fixture");
    assert.equal(
      runtime.findOnPath("dosbox-x", { PATH: root }),
      path.join(root, "dosbox-x.exe"),
    );
    assert.equal(runtime.findOnPath("missing", { PATH: root }), "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("unsupported platforms fail explicitly", () => {
  assert.doesNotThrow(() => runtime.validatePlatform("win32"));
  assert.throws(
    () => runtime.validatePlatform("linux"),
    /Windows desktop only/,
  );
});
