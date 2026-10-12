"use strict";
// Small integer parser: never eval user expressions or invoke JavaScript properties.
function evaluate(text, lookup) {
  text = String(text).trim().toUpperCase();
  if (text.length > 256) throw Error("Expression is too long");
  if (text.includes(":")) {
    const parts = text.split(":");
    if (parts.length !== 2) throw Error("Invalid segment:offset");
    return evaluate(parts[0], lookup) * 16 + evaluate(parts[1], lookup);
  }
  text = text.replace(/\b([0-9][0-9A-F]*)H\b/g, (_, n) => "0X" + n);
  const tokens =
    text.match(/0X[0-9A-F]+|\d+|[A-Z_][A-Z_0-9]*|<<|>>|[()+\-*~&|^]/g) || [];
  if (tokens.join("") !== text.replace(/\s/g, ""))
    throw Error("Only integer register/symbol arithmetic is supported");
  const precedence = {
    "|": 1,
    "^": 2,
    "&": 3,
    "<<": 4,
    ">>": 4,
    "+": 5,
    "-": 5,
    "*": 6,
  };
  let pos = 0;
  const bounded = (v) => {
    if (!Number.isSafeInteger(v) || Math.abs(v) > 0xffffffff)
      throw Error("Expression exceeds 32 bits");
    return v;
  };
  function atom() {
    const t = tokens[pos++];
    if (["+", "-", "~"].includes(t)) {
      const v = atom();
      return bounded(t === "-" ? -v : t === "~" ? ~v : v);
    }
    if (t === "(") {
      const v = expr(0);
      if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis");
      return v;
    }
    if (!t) throw Error("Missing operand");
    if (/^(0X|\d)/.test(t)) return bounded(Number(t));
    if (/^[A-Z_]\w*$/.test(t)) return lookup(t);
    throw Error("Invalid operand");
  }
  function expr(min) {
    let left = atom();
    while (precedence[tokens[pos]] >= min) {
      const op = tokens[pos++],
        right = expr(precedence[op] + 1);
      if (["<<", ">>"].includes(op) && !(right >= 0 && right <= 31))
        throw Error("Shift count must be 0..31");
      left = bounded(
        op === "+"
          ? left + right
          : op === "-"
            ? left - right
            : op === "*"
              ? left * right
              : op === "&"
                ? left & right
                : op === "|"
                  ? left | right
                  : op === "^"
                    ? left ^ right
                    : op === "<<"
                      ? left * 2 ** right
                      : Math.floor(left / 2 ** right),
      );
    }
    return left;
  }
  const result = expr(0);
  if (pos !== tokens.length) throw Error("Unexpected expression token");
  return result;
}
module.exports = { evaluate };
