"""Compile the textbook explicit-segment sample; verify ORG and byte copies."""
import os,pathlib,sys,tempfile
root=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'adapter'))
from core import Session
resources=pathlib.Path(os.environ['MASMTASM_RESOURCES'])
backends=sys.argv[1:] or ['jsdos','jsdos-x','dosbox-x']
source=(root/'samples/segments-copy.asm').read_text()
# Reordering exercises a nonzero data-segment base, not just DATAS at zero.
data,rest=source.split('DATAS ENDS',1)
stack,code=rest.split('CODES SEGMENT',1)
variants={'textbook':source,'code-first':'CODES SEGMENT'+code.rsplit('END START',1)[0]+data+'DATAS ENDS\n'+stack+'END START\n'}
with tempfile.TemporaryDirectory(prefix='8086-segments-') as temp:
 for backend in backends:
  for assembler in ['TASM','MASM-v5.00','MASM-v6.11']:
   for name,text in variants.items():
    program=pathlib.Path(temp)/(name+'.asm');program.write_text(text)
    s=Session()
    try:
     s.launch(dict(program=str(program),assembler=assembler,buildBackend=backend,assemblerBundle=str(resources/(assembler+'.jsdos')),dosboxPath=os.environ.get('DOSBOX_PATH',''),nodePath=os.environ.get('NODE_PATH','node'),jsdosRunner=str(root/'src/jsdos-build.cjs'),jsdosEngine=str(resources/'node_modules/emulators/build/wasm/emulators.js')))
     assert 'MOV AX,DATAS' in text.splitlines()[s.lines[s.reg('IP')]-1]
     for _ in range(5):s.step()
     assert (s.reg('SI'),s.reg('DI'),s.reg('CX'))==(0x2000,0x3000,10)
     for _ in range(60):s.step()
     assert s.reg('CX')==0 and s.read(s.evaluate('DS:3000h'),10)==bytes(range(1,11))
     assert s.evaluate('DAT2')==1
     s.step();s.step();assert s.ended and s.exit_code==10
     print(assembler,backend,name,'PASS',flush=True)
    finally:s.close()
