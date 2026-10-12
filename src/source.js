"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  iconv = require("iconv-lite");
function stripComment(line) {
  let quote;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" || c === '"') {
      if (quote === c) quote = undefined;
      else if (!quote) quote = c;
    }
    if (c === ";" && !quote) return line.slice(0, i);
  }
  return line;
}
const normalize = (line) =>
  stripComment(line).replace(/\s+/g, "").toLowerCase();
function startupInstructions(text) {
  if (/^\s*\.model\s+tiny\b/im.test(text))
    return ["ORG 100H", "PUSH CS", "POP DS"];
  const setup = ["MOV DX,@data", "MOV DS,DX"];
  return /\bFARSTACK\b/i.test(text)
    ? setup
    : [
        ...setup,
        "MOV BX,SS",
        "SUB BX,DX",
        "SHL BX,1",
        "SHL BX,1",
        "SHL BX,1",
        "SHL BX,1",
        "CLI",
        "MOV SS,DX",
        "ADD SP,BX",
        "STI",
      ];
}
function prepareSources(program, encoding, build, assembler) {
  if (!["utf-8-sig", "gbk", "cp437"].includes(encoding))
    throw Error("Unsupported sourceEncoding");
  const files = [],
    seen = new Map(),
    root = path.dirname(program);
  function visit(file) {
    file = path.resolve(file);
    if (seen.has(file)) return seen.get(file);
    if (files.length >= 64)
      throw Error("At most 64 source/include files are supported");
    const bytes = fs.readFileSync(file);
    if (bytes.length > 1024 * 1024) throw Error("Source file exceeds 1 MiB");
    const text = iconv
      .decode(bytes, encoding === "utf-8-sig" ? "utf8" : encoding)
      .replace(/^\uFEFF/, "");
    const model = text.match(/^\s*\.model\s+(\w+)/im)?.[1].toLowerCase();
    if (
      model &&
      !["tiny", "small", "medium", "compact", "large", "huge"].includes(model)
    )
      throw Error(
        "Use an 8086 DOS memory model; FLAT/32-bit programs are unsupported",
      );
    if (
      /^\s*(?:\.(?:[123456]86\w*|x64|mmx|xmm|k3d)|includelib\b).*$/im.test(
        text,
      ) ||
      /\bUSE32\b/i.test(text)
    )
      throw Error(
        "Only 8086 16-bit programs are supported; external libraries require a project linker configuration",
      );
    const name = files.length === 0 ? "MAIN.ASM" : `INC${files.length}.INC`,
      record = { path: file, text, name };
    files.push(record);
    seen.set(file, name);
    const output = text
      .split(/\r?\n/)
      .map((line) => {
        let clean = stripComment(line);
        const inc = clean.match(/^\s*include\s+(.+?)\s*$/i);
        if (inc) {
          let target = inc[1].replace(/^["']|["']$/g, "");
          if (path.isAbsolute(target))
            throw Error("Use relative INCLUDE paths");
          const resolved = path.resolve(path.dirname(file), target);
          if (path.relative(root, resolved).startsWith(".." + path.sep))
            throw Error("INCLUDE must stay within the source directory");
          clean = "INCLUDE " + visit(resolved);
        }
        const startup = clean.match(/^\s*\.startup\s*$/i),
          exit = clean.match(/^\s*\.exit(?:\s+(.+))?\s*$/i);
        if (startup) {
          record.startup = true;
          const setup = startupInstructions(files[0].text);
          clean =
            setup[0] === "ORG 100H"
              ? "ORG 100H\r\nLAB_ENTRY:\r\n" + setup.slice(1).join("\r\n")
              : "LAB_ENTRY:\r\n" + setup.join("\r\n");
        }
        if (exit)
          clean =
            (exit[1]
              ? " MOV AL," + exit[1] + "\r\n MOV AH,4CH"
              : " MOV AH,4CH") + "\r\n INT 21H";
        if (files.some((s) => s.startup) && /^\s*END\s*$/i.test(clean))
          clean = "END LAB_ENTRY";
        return clean;
      })
      .join("\r\n");
    // MASM 5.00 does not put _TEXT in DGROUP for tiny sources. In a code-only COM,
    // DOS sets DS/ES/SS to CS; make that assumption explicit to avoid phase errors.
    let compatible =
      assembler === "MASM-v5.00" &&
      /^\s*\.model\s+tiny\b/im.test(text) &&
      !/^\s*\.data\b/im.test(text)
        ? output.replace(
            /^(\s*\.code[^\r\n]*)/im,
            "$1\r\nASSUME DS:_TEXT,ES:_TEXT,SS:_TEXT",
          )
        : output;
    if (
      assembler === "MASM-v5.00" &&
      /^\s*\.model\s+tiny\b/im.test(text) &&
      /^\s*\.data\b/im.test(text)
    ) {
      compatible = output.replace(
        /^(\s*\.model\s+tiny[^\r\n]*)/im,
        "$1\r\nDGROUP GROUP _TEXT,_DATA",
      );
    }
    if (
      name === "MAIN.ASM" &&
      !/^\s*(?:\.model\b|\w+\s+segment\b)/im.test(text) &&
      /^\s*ORG\s+(?:0?100H|256)\b/im.test(text)
    ) {
      const ending = compatible.match(/^\s*END(?:\s+(\w+))?\s*$/im),
        entry = ending?.[1] || "LAB_ENTRY";
      compatible = compatible.replace(/^\s*END(?:\s+\w+)?\s*$/im, "");
      if (!ending?.[1])
        compatible = compatible.replace(
          /^(\s*ORG\s+[^\r\n]+)/im,
          "$1\r\nLAB_ENTRY:",
        );
      compatible =
        "CODES SEGMENT\r\nASSUME CS:CODES,DS:CODES,ES:CODES,SS:CODES\r\n" +
        compatible +
        "\r\nCODES ENDS\r\nEND " +
        entry +
        "\r\n";
    }
    const encoded = iconv.encode(compatible, "cp437");
    if (iconv.decode(encoded, "cp437") !== compatible)
      throw Error(
        "Source literals must fit CP437; Unicode comments are accepted",
      );
    fs.writeFileSync(path.join(build, name), encoded);
    return name;
  }
  visit(program);
  return files;
}
function parseMap(text, sources) {
  const segments = new Map();
  for (const m of text.matchAll(
    /^\s*([0-9A-F]+)H\s+[0-9A-F]+H\s+([0-9A-F]+)H\s+(\w+)(?:\s+(\w+))?/gim,
  ))
    segments.set(m[3].toUpperCase(), {
      start: parseInt(m[1], 16),
      length: parseInt(m[2], 16),
      class: m[4] || "",
    });
  if (!segments.size) throw Error("Linker MAP has no segment addresses");
  const groups = new Map(),
    whole = sources.map((s) => s.text).join("\n");
  for (const m of whole.matchAll(/^\s*(\w+)\s+group\s+([^\r\n;]+)/gim)) {
    const starts = m[2]
      .split(",")
      .map((s) => segments.get(s.trim().toUpperCase())?.start)
      .filter((v) => v !== undefined);
    if (starts.length)
      groups.set(m[1].toUpperCase(), Math.floor(Math.min(...starts) / 16) * 16);
  }
  const model = whole.match(/^\s*\.model\s+(\w+)/im)?.[1].toLowerCase();
  if (model) {
    const starts = [...segments]
      .filter(
        ([name]) =>
          model === "tiny" ||
          ["_DATA", "CONST", "_BSS", "STACK", "FAR_BSS"].includes(name),
      )
      .map(([, s]) => s.start);
    if (starts.length)
      groups.set("DGROUP", Math.floor(Math.min(...starts) / 16) * 16);
  }
  return { segments, groups, model };
}
function parseListing(text, sources, map) {
  const lines = new Map(),
    symbols = new Map(),
    declarations = new Map();
  let segment,
    section = "";
  const cursors = new Map();
  const rawEntries = sources.flatMap((s) =>
    s.text.split(/\r?\n/).map((line, index) => ({
      path: s.path,
      line: index + 1,
      text: stripComment(line).trim(),
    })),
  );
  const macros = new Map(),
    definitions = new Set();
  let current;
  for (const e of rawEntries) {
    const m = e.text.match(/^(\w+)\s+macro(?:\s+(.*))?$/i);
    if (m) {
      definitions.add(e);
      current = {
        params: (m[2] || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        body: [],
      };
      macros.set(m[1].toUpperCase(), current);
    } else if (/^ENDM\b/i.test(e.text)) {
      definitions.add(e);
      current = undefined;
    } else if (current) {
      definitions.add(e);
      current.body.push(e.text);
    }
  }
  const entries = rawEntries.flatMap((e) => {
    if (definitions.has(e)) return [];
    const start = e.text.match(/^\.startup$/i),
      exit = e.text.match(/^\.exit(?:\s+(.+))?$/i);
    if (start)
      return startupInstructions(sources[0].text).map((text) => ({
        ...e,
        text,
      }));
    if (exit)
      return [
        ...(exit[1] ? ["MOV AL," + exit[1]] : []),
        "MOV AH,4CH",
        "INT 21H",
      ].map((text) => ({ ...e, text }));
    const call = e.text.replace(/^\w+:\s*/, "").match(/^(\w+)(?:\s+(.*))?$/),
      macro = call && macros.get(call[1].toUpperCase());
    if (!macro) return [e];
    const args = (call[2] || "").split(",").map((v) => v.trim());
    return macro.body.map((text) => {
      macro.params.forEach((param, i) => {
        text = text.replace(
          new RegExp(
            "\\b" + param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
            "gi",
          ),
          args[i] || param,
        );
      });
      return { ...e, text };
    });
  });
  const simplifiedNames = {
    code: "_TEXT",
    data: "_DATA",
    "data?": "_BSS",
    const: "CONST",
    stack: "STACK",
    fardata: "FAR_DATA",
    "fardata?": "FAR_BSS",
  };
  for (const row of text.split(/\r?\n/)) {
    const start = row.match(/\b(\w+)\s+SEGMENT\b/i);
    if (start) {
      segment = start[1].toUpperCase();
      section = "";
      continue;
    }
    if (/\b\w+\s+ENDS\b/i.test(row)) {
      segment = undefined;
      continue;
    }
    const simple = row.match(
      /\s\.(code|data\??|const|stack|fardata\??)(?=\s|$)(?:\s+(\w+))?/i,
    );
    if (simple) {
      section = simple[1].toLowerCase();
      segment =
        section === "code"
          ? simple[2] && map.segments.has(simple[2].toUpperCase())
            ? simple[2].toUpperCase()
            : map.segments.has("_TEXT")
              ? "_TEXT"
              : [...map.segments].find(
                  ([, s]) => s.class.toUpperCase() === "CODE",
                )?.[0]
          : simplifiedNames[section];
      continue;
    }
    const declaration = /Turbo Assembler/i.test(text)
      ? row.match(
          /^\s*(?:\d+ +)?\d+\s+([0-9A-F]{4})\s+.*?\b([A-Za-z_]\w*)\s+(DB|DW)\b/i,
        )
      : row.match(/^\s*([0-9A-F]{4})\s+.*?\b([A-Za-z_]\w*)\s+(DB|DW)\b/i);
    if (declaration && segment && map.segments.has(segment))
      declarations.set(declaration[2].toUpperCase(), {
        offset: map.segments.get(segment).start + parseInt(declaration[1], 16),
        size: declaration[3].toUpperCase() === "DB" ? 1 : 2,
      });
    const m =
      row.match(
        /^\s*\d+\s+\d+\s+([0-9A-F]{4})\s+([0-9A-F]{2,})(?=\s|[rs*])/i,
      ) ||
      row.match(/^\s*(?:\d+\s+)?([0-9A-F]{4})\s+([0-9A-F]{2,})(?=\s|[rs*])/i);
    if (!m || !segment || !map.segments.has(segment)) continue;
    const offset = parseInt(m[1], 16),
      address = map.segments.get(segment).start + offset,
      normal = normalize(row),
      cursor = cursors.get(segment) || 0;
    const candidates = [...entries.slice(cursor), ...entries.slice(0, cursor)];
    const match = candidates.find((e) => {
      const instruction = e.text.replace(/^\w+:\s*/, "");
      return (
        instruction &&
        !instruction.startsWith(".") &&
        !/\b(proc|endp|equ|db|dw|dd|dq|dt|end|segment|ends|assume|org|group|macro|endm|include|label)\b/i.test(
          instruction,
        ) &&
        normal.endsWith(normalize(instruction))
      );
    });
    if (match) {
      lines.set(address, { path: match.path, line: match.line });
      cursors.set(segment, entries.indexOf(match) + 1);
    }
  }
  for (const row of text.split(/\r?\n/)) {
    let m = row.match(/^(\w+)\s+(Byte|Word)\s+(\w+):([0-9A-F]{4})\b/i),
      name,
      type,
      owner,
      offset;
    if (m) [, name, type, owner, offset] = m;
    else {
      m = row.match(
        /^(\w+)\s+(?:\.\s*)+(?:L\s+)?(Byte|Word)\s+([0-9A-F]{4})\s+(\w+)\b/i,
      );
      if (!m) continue;
      [, name, type, offset, owner] = m;
    }
    owner = owner.toUpperCase();
    const base = map.groups.get(owner) ?? map.segments.get(owner)?.start;
    if (base === undefined)
      throw Error("Missing linked segment/group address: " + owner);
    symbols.set(name.toUpperCase(), {
      offset: base + parseInt(offset, 16),
      size: type.toLowerCase() === "byte" ? 1 : 2,
    });
  }
  for (const [name, symbol] of declarations) symbols.set(name, symbol);
  if (!lines.size)
    throw Error("Listing has no supported source-to-instruction mapping");
  return { lines, symbols };
}
module.exports = {
  stripComment,
  normalize,
  prepareSources,
  parseMap,
  parseListing,
};
