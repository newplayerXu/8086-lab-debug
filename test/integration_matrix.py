"""Real compiler/backend validation. Local tools required; no redistribution."""
import pathlib,sys,os,json
root=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'adapter'))
from core import Session
resources=pathlib.Path(os.environ['MASMTASM_RESOURCES'])
backends=sys.argv[1:] or ['dosbox-x','jsdos','jsdos-x']
for backend in backends:
 for assembler in ['TASM','MASM-v5.00','MASM-v6.11']:
  events=[];s=Session(lambda n,b:events.append((n,b)))
  try:
   s.launch({'program':str(root/'samples/registers.asm'),'assembler':assembler,'buildBackend':backend,'assemblerBundle':str(resources/(assembler+'.jsdos')),'dosboxPath':os.environ.get('DOSBOX_PATH',''),'nodePath':os.environ.get('NODE_PATH','node'),'jsdosEngine':str(resources/'node_modules/emulators/build/wasm/emulators.js'),'jsdosRunner':str(root/'src/jsdos-build.cjs')})
   assert s.lines[s.reg('IP')]==14
   for _ in range(5):s.step()
   assert (s.reg('AX'),s.reg('BX'))==(8,3)
   s.step();s.step();assert s.reg('SP')==0xfe and s.read((s.reg('SS')<<4)+0xfe,2)==b'\x08\x00'
   for _ in range(3):s.step()
   assert (s.reg('AX'),s.reg('CX'),s.evaluate('ZF'),s.evaluate('RESULT'))==(0,8,1,8)
   assert s.lines[s.reg('IP')]==30
   for _ in range(6):s.step()
   assert s.ended and s.exit_code==0
   assert ''.join(b.get('output','') for n,b in events if n=='output' and b.get('category')=='stdout')=='Calculation finished!'
   print(json.dumps({'assembler':assembler,'backend':backend,'result':'PASS'}),flush=True)
  finally:s.close()
