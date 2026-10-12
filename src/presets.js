"use strict";
const PRESETS = {
  TASM: [
    "tasm",
    ["TASM.EXE", "TLINK.EXE"],
    [
      "tasm /zi /l MAIN.ASM > BUILD.LOG",
      "if errorlevel 1 goto done",
      "tlink /v MAIN.OBJ >> BUILD.LOG",
    ],
  ],
  "MASM-v5.00": [
    "masm",
    ["MASM.EXE", "LINK.EXE"],
    [
      "masm MAIN.ASM,MAIN.OBJ,MAIN.LST; > BUILD.LOG",
      "if errorlevel 1 goto done",
      "link MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG",
    ],
  ],
  "MASM-v6.11": [
    "masm",
    ["ML.EXE", "LINK.EXE", "DOSXNT.EXE"],
    [
      "ml /c /FlMAIN.LST MAIN.ASM > BUILD.LOG",
      "if errorlevel 1 goto done",
      "link /MAP MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG",
    ],
  ],
};
module.exports = { PRESETS };
