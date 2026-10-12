/* Follow the MASM/TASM built-in choices. SPDX-License-Identifier: GPL-2.0-or-later. */
'use strict';
const path=require('node:path');
function selectBuild(assembler='TASM',emulator='jsdos-x',dependencyPath){
 const selectedAssembler=assembler;
 if(assembler==='MASM')assembler='MASM-v6.11';
 if(!['TASM','MASM-v5.00','MASM-v6.11'].includes(assembler))throw new Error(`Unsupported MASM/TASM assembler: ${assembler}`);
 if(!['jsdos','jsdos-x','dosbox','dosbox-x'].includes(emulator))throw new Error(`Unsupported MASM/TASM emulator: ${emulator}`);
 return {assembler,selectedAssembler,buildBackend:emulator,assemblerBundle:path.join(dependencyPath,'resources',assembler+'.jsdos'),jsdosEngine:path.join(dependencyPath,'resources','node_modules','emulators','build','wasm','emulators.js')};
}
module.exports={selectBuild};
