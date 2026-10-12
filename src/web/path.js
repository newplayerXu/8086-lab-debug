"use strict";
const posix = require("path-browserify");
module.exports = {
  ...posix,
  caseSensitive: true,
  resolve: (...parts) =>
    posix.resolve("/", ...parts.map((p) => p.replace(/\\/g, "/"))),
  isAbsolute: (p) => /^(?:\/|\\|[A-Za-z]:)/.test(p),
};
