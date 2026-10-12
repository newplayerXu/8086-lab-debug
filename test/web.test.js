"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  posix = require("node:path").posix;
const iconv = require("iconv-lite"),
  { collectSources } = require("../src/web/sources");
test("web accepts built-in action objects regardless of configuration key ordering", () => {
  const { equal } = require("../src/web/equal");
  assert.equal(
    equal(
      { command: ["masm", "link"], title: "Build" },
      { title: "Build", command: ["masm", "link"] },
    ),
    true,
  );
  assert.equal(
    equal({ command: ["masm", "link"] }, { command: ["link", "masm"] }),
    false,
  );
});
function provider(entries) {
  const parse = (value) => {
    const url = new URL(value);
    return {
      scheme: url.protocol.slice(0, -1),
      authority: url.host,
      path: decodeURIComponent(url.pathname),
      toString: () => url.toString(),
    };
  };
  return {
    Uri: {
      joinPath(uri, ...parts) {
        return parse(
          `${uri.scheme}://${uri.authority}${posix.resolve(uri.path, ...parts)}`,
        );
      },
    },
    workspace: {
      fs: {
        async readFile(uri) {
          const item = entries[uri.path];
          if (!item) throw Error("File not found");
          return typeof item === "string" ? Buffer.from(item) : item;
        },
      },
    },
    parse,
  };
}
test("web collects virtual URI includes, preserves Unicode paths and maps source identities", async () => {
  const api = provider({
    "/教材/Main.asm":
      "; 注释\ninclude 'lib\\数据.inc'\ninclude 'lib\\数据.inc'",
    "/教材/lib/数据.inc": "VALUE EQU 8",
  });
  const result = await collectSources(
    api,
    api.parse("vscode-vfs://github/教材/Main.asm"),
  );
  assert.equal(result.program, "/workspace/Main.asm");
  assert.equal(result.files.length, 2);
  assert.equal(result.files[1].path, "/workspace/lib/数据.inc");
  assert.match(result.files[1].uri, /^vscode-vfs:\/\/github/);
});
test("web rejects escaping includes, absolute paths and oversized sources before compiling", async () => {
  for (const include of ["../private.inc", "/private.inc", "C:\\private.inc"]) {
    const api = provider({ "/project/Main.asm": "include " + include });
    await assert.rejects(
      collectSources(api, api.parse("vscode-vfs://github/project/Main.asm")),
      /within|relative/,
    );
  }
  const api = provider({ "/project/Main.asm": Buffer.alloc(1024 * 1024 + 1) });
  await assert.rejects(
    collectSources(api, api.parse("vscode-vfs://github/project/Main.asm")),
    /1 MiB/,
  );
});
test("web include discovery uses configured GBK encoding and accepts cyclic includes once", async () => {
  const api = provider({
    "/project/Main.asm": iconv.encode("include 数据.inc", "gbk"),
    "/project/数据.inc": iconv.encode("include Main.asm", "gbk"),
  });
  const result = await collectSources(
    api,
    api.parse("vscode-vfs://github/project/Main.asm"),
    "gbk",
  );
  assert.equal(result.files.length, 2);
});
test("browser in-memory build directories are isolated and never write workspace source", () => {
  const fs = require("../src/web/memory-fs");
  fs.reset();
  fs.writeFileSync("/workspace/Main.asm", Buffer.from("ORG 100H"));
  const one = fs.mkdtempSync("/build/8086-lab-"),
    two = fs.mkdtempSync("/build/8086-lab-");
  fs.writeFileSync(one + "/MAIN.ASM", "one");
  fs.writeFileSync(two + "/MAIN.ASM", "two");
  fs.rmSync(one);
  assert.equal(fs.existsSync(one + "/MAIN.ASM"), false);
  assert.equal(fs.readFileSync(two + "/MAIN.ASM").toString(), "two");
  assert.equal(fs.readFileSync("/workspace/Main.asm").toString(), "ORG 100H");
});
