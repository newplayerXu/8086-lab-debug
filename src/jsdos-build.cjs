/* js-dos compiler host. SPDX-License-Identifier: GPL-2.0-or-later. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const job=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const script=fs.readFileSync(job.engine,'utf8');
// MASM/TASM 2.2.1 ships the engine without a Node platform initializer.
// Capture its singleton in memory; fail explicitly if the upstream layout changes.
const marker='n.platform=new o';
if (!script.includes(marker)) throw new Error('Unsupported MASM/TASM js-dos engine layout; update the dependency or select DOSBox-X.');
vm.runInThisContext(script.replace(marker,'n.platform=globalThis.__labPlatform=new o'),{filename:job.engine});
__labPlatform.set({name:'node',node_require:require,httpRequest:async(url,options)=>{
 const bytes=fs.readFileSync(url);
 return options?.responseType==='arraybuffer'?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength):bytes.toString('utf8');
}});
emulators.pathPrefix=path.dirname(job.engine)+path.sep;
const timeout=setTimeout(()=>{console.error('js-dos compilation timed out');process.exit(1)},50000);
(async()=>{
 const factory=job.backend==='jsdos-x'?'dosboxXNode':'dosboxNode';
 const ci=await emulators[factory](new Uint8Array(fs.readFileSync(job.bundle)));
 let checking=false;
 const timer=setInterval(async()=>{
  if(checking)return;checking=true;
  try {
   const bytes=await ci.persist();
   // DONE.TXT is written only after the compiler batch returns.
   if(Buffer.from(bytes).includes(Buffer.from('DONE.TXT'))){
    clearInterval(timer);ci.pause();fs.writeFileSync(job.output,Buffer.from(await ci.persist()));await ci.exit();clearTimeout(timeout);process.exit(0);
   }
  }catch(error){console.error(error.stack);process.exit(1)}finally{checking=false}
 },500);
})().catch(error=>{console.error(error.stack);process.exit(1)});
