"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, ".."),
  dependency = process.env.MASM_EXTENSION;
if (!dependency)
  throw Error(
    "Set MASM_EXTENSION to the installed xsro.masm-tasm extension folder",
  );
let browser;
const errors = [];
const server = http.createServer((req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html><meta charset="UTF-8"><p id="status"></p><pre id="log"></pre><script>
        window.messages=[];window.acquireVsCodeApi=()=>({postMessage:message=>window.messages.push(message)});
        </script><script src="/lab/node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.js"></script>
        <script src="/masm/resources/node_modules/emulators/build/wasm/emulators.js"></script><script src="/lab/dist/web/view.js"></script>`);
      return;
    }
    const url = new URL(req.url, "http://localhost"),
      base = url.pathname.startsWith("/lab/") ? root : dependency;
    const file = path.resolve(
      base,
      decodeURIComponent(url.pathname.replace(/^\/(lab|masm)\//, "")),
    );
    if (!file.startsWith(path.resolve(base) + path.sep))
      throw Error("Invalid resource");
    res.setHeader(
      "Content-Type",
      file.endsWith(".wasm")
        ? "application/wasm"
        : file.endsWith(".js")
          ? "application/javascript; charset=utf-8"
          : "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch (error) {
    res.statusCode = 404;
    res.end(error.message);
  }
});
async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.EDGE_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const samples = ["registers.asm", "com.asm", "segments-copy.asm"];
  for (const assembler of ["TASM", "MASM-v5.00", "MASM-v6.11"])
    for (const backend of ["jsdos", "jsdos-x"])
      for (const sample of samples) {
        const page = await browser.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() =>
          window.messages.some((m) => m.type === "boot"),
        );
        await page.evaluate(
          (resources) => postMessage({ type: "init", resources }, "*"),
          {
            unicornWasm:
              base +
              "/lab/node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.wasm",
            icedWasm: base + "/lab/node_modules/iced-x86/iced_x86_bg.wasm",
            emulatorsPrefix:
              base + "/masm/resources/node_modules/emulators/build/wasm/",
          },
        );
        await page.waitForFunction(
          () =>
            window.messages.some(
              (m) => m.type === "ready" || m.type === "fatal",
            ),
          { timeout: 45000 },
        );
        let seq = 0;
        async function request(command, args = {}, files) {
          const request_seq = ++seq;
          await page.evaluate((packet) => postMessage(packet, "*"), {
            type: "dap",
            message: { type: "request", seq, command, arguments: args },
            files,
          });
          await page.waitForFunction(
            (id) =>
              window.messages.some(
                (m) =>
                  m.type === "fatal" ||
                  (m.type === "dap" &&
                    m.message.type === "response" &&
                    m.message.request_seq === id),
              ),
            request_seq,
            { timeout: 90000 },
          );
          const result = await page.evaluate(
            (id) =>
              window.messages.find((m) => m.type === "fatal") ||
              window.messages.find(
                (m) =>
                  m.type === "dap" &&
                  m.message.type === "response" &&
                  m.message.request_seq === id,
              ),
            request_seq,
          );
          assert.notEqual(result.type, "fatal", result.error);
          assert.equal(result.message.success, true, result.message.message);
          return result.message.body;
        }
        await request("initialize");
        await request(
          "launch",
          {
            program: "/workspace/" + sample,
            assembler,
            buildBackend: backend,
            assemblerBundle: base + "/masm/resources/" + assembler + ".jsdos",
            stopOnEntry: true,
          },
          [
            {
              path: "/workspace/" + sample,
              bytes: Array.from(
                fs.readFileSync(path.join(root, "samples", sample)),
              ),
            },
          ],
        );
        await request("configurationDone");
        const trace = await request("stackTrace");
        assert.equal(trace.stackFrames[0].source.path, "/workspace/" + sample);
        await request("next");
        if (sample !== "segments-copy.asm") {
          const target = sample === "com.asm" ? 6 : 10;
          for (let i = 1; i < target; i++) await request("next");
          const value = await request("evaluate", { expression: "RESULT" });
          assert.match(value.result, /(?:0008|\b8\b)/);
          const cx = await request("evaluate", { expression: "CX" });
          assert.match(cx.result, /0008/);
        }
        await request("continue");
        await page.waitForFunction(
          () =>
            window.messages.some(
              (m) => m.type === "dap" && m.message.event === "terminated",
            ),
          null,
          { timeout: 20000 },
        );
        const exit = await page.evaluate(
          () =>
            window.messages.find(
              (m) => m.type === "dap" && m.message.event === "exited",
            ).message.body.exitCode,
        );
        assert.equal(exit, sample === "segments-copy.asm" ? 10 : 0);
        console.log(
          "PASS",
          assembler,
          backend,
          sample,
          "source/step/state/exit",
        );
        await page.close();
      }
  assert.deepEqual(errors, []);
  console.log(
    "18 real-browser runtime integrations passed; no Node.js/Python in page runtime",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
