"use strict";
const iconv = require("iconv-lite");
const { stripComment } = require("../source");
async function collectSources(vscode, program, encoding = "utf-8-sig") {
  if (!["utf-8-sig", "gbk", "cp437"].includes(encoding))
    throw Error("Unsupported sourceEncoding");
  const root = vscode.Uri.joinPath(program, ".."),
    files = [],
    paths = new Map();
  async function visit(uri) {
    const id = uri.toString();
    if (paths.has(id)) return;
    if (
      uri.scheme !== root.scheme ||
      uri.authority !== root.authority ||
      !uri.path.startsWith(root.path.replace(/\/$/, "") + "/")
    )
      throw Error("INCLUDE must stay within the source directory");
    if (files.length >= 64)
      throw Error("At most 64 source/include files are supported");
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.length > 1024 * 1024) throw Error("Source file exceeds 1 MiB");
    const virtual =
      "/workspace/" + uri.path.slice(root.path.replace(/\/$/, "").length + 1);
    paths.set(id, virtual);
    files.push({ uri: id, path: virtual, bytes: Array.from(bytes) });
    const text = iconv.decode(
      bytes,
      encoding === "utf-8-sig" ? "utf8" : encoding,
    );
    for (const line of text.split(/\r?\n/)) {
      const include = stripComment(line).match(/^\s*include\s+(.+?)\s*$/i);
      if (!include) continue;
      const relative = include[1]
        .replace(/^["']|["']$/g, "")
        .replace(/\\/g, "/");
      if (/^(?:\/|\w+:)/.test(relative))
        throw Error("Use relative INCLUDE paths");
      await visit(vscode.Uri.joinPath(uri, "..", relative));
    }
  }
  await visit(program);
  return { files, program: paths.get(program.toString()) };
}
module.exports = { collectSources };
