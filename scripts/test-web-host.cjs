"use strict";
const path = require("node:path"),
  { chromium } = require("@playwright/test");
const { open } = require("@vscode/test-web");
const root = path.resolve(__dirname, ".."),
  dependency = process.env.MASM_EXTENSION;
if (!dependency)
  throw Error("Set MASM_EXTENSION to the installed xsro.masm-tasm folder");
let server, browser;
async function main() {
  server = await open({
    browserType: "none",
    quality: "stable",
    commit: process.env.VSCODE_WEB_COMMIT,
    host: "localhost",
    port: 3037,
    extensionDevelopmentPath: root,
    extensionPaths: [dependency],
    extensionTestsPath: path.join(root, "dist/web/tests.js"),
    folderPath: path.join(root, "samples"),
  });
  browser = await chromium.launch({
    executablePath:
      process.env.EDGE_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const page = await browser.newPage();
  let resolve, reject;
  const done = new Promise((s, e) => {
    resolve = s;
    reject = e;
  });
  const timer = setTimeout(
    () => reject(Error("VS Code web host tests timed out")),
    240000,
  );
  const captures = [];
  await page.exposeFunction("codeAutomationLog", async (type, args) => {
    if (type === "error" || args.some((a) => String(a).includes("WEB-HOST")))
      console.log(type, ...args);
    if (args.some((a) => String(a).includes("WEB-HOST PAUSED"))) {
      const capture = (async () => {
        await page.getByText("Registers / 寄存器", { exact: true }).waitFor({ timeout: 3000 });
        await page.screenshot({ path: path.join(root, ".vscode-test-web/host-paused.png"), fullPage: true });
      })();
      captures.push(capture); capture.catch(reject); await capture;
    }
  });
  await page.exposeFunction("codeAutomationExit", (code) =>
    code === 0 ? resolve() : reject(Error("VS Code web test exit " + code)),
  );
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
  page.on("requestfailed", (request) =>
    console.error(
      "WEB failed resource:",
      request.url(),
      request.failure()?.errorText,
    ),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("WEB console:", message.text());
  });
  await page.goto("http://localhost:3037");
  try {
    await done;
    await Promise.all(captures);
    console.log("2 actual VS Code web-host debugger integrations passed");
  } finally {
    clearTimeout(timer);
    await page.screenshot({
      path: path.join(root, ".vscode-test-web/host-result.png"),
      fullPage: true,
    });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server?.dispose();
  });
