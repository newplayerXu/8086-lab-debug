"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const local = (name) => path.join(root, "src/web", name);
const plugins = [
  {
    name: "browser-platform",
    setup(build) {
      build.onResolve({ filter: /^node:(?:fs|path|os)$/ }, (args) => ({
        path: local(
          {
            "node:fs": "memory-fs.js",
            "node:path": "path.js",
            "node:os": "os.js",
          }[args.path],
        ),
      }));
      build.onResolve({ filter: /^\.\/compiler$/ }, (args) =>
        args.importer === path.join(root, "src/core.js")
          ? { path: local("compiler.js") }
          : undefined,
      );
      build.onResolve({ filter: /^@alexaltea\/unicorn-js\/x86$/ }, () => ({
        path: local("engine.js"),
      }));
      build.onResolve({ filter: /^iced-x86$/ }, () => ({
        path: "iced-web",
        namespace: "iced-web",
      }));
      build.onLoad({ filter: /.*/, namespace: "iced-web" }, () => {
        let source = fs.readFileSync(require.resolve("iced-x86"), "utf8");
        source = source.replace(
          "const { TextDecoder, TextEncoder } = require(`util`);",
          "const { TextDecoder, TextEncoder } = globalThis;",
        );
        const marker =
          "const path = require('path').join(__dirname, 'iced_x86_bg.wasm');";
        if (!source.includes(marker))
          throw Error("Unsupported iced-x86 WASM loader layout");
        source =
          source.slice(0, source.indexOf(marker)) +
          `module.exports.initialize = async bytes => {
      const instance = await WebAssembly.instantiate(bytes, imports);
      wasm = instance.instance.exports;
      module.exports.__wasm = wasm;
    };`;
        return { contents: source, loader: "js" };
      });
    },
  },
];
async function main() {
  const common = {
    bundle: true,
    platform: "browser",
    target: "es2022",
    plugins,
    inject: [local("polyfills.js")],
    logLevel: "info",
    minify: true,
    legalComments: "eof",
  };
  await esbuild.build({
    ...common,
    entryPoints: [local("extension.js")],
    outfile: path.join(root, "dist/web/extension.js"),
    format: "cjs",
    external: ["vscode"],
  });
  await esbuild.build({
    ...common,
    entryPoints: [local("view.js")],
    outfile: path.join(root, "dist/web/view.js"),
    format: "iife",
  });
  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, "test/web-host.cjs")],
    outfile: path.join(root, "dist/web/tests.js"),
    format: "cjs",
    external: ["vscode"],
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
