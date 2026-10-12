"""Real TASM/DOSBox integration; paths are explicitly provided, never bundled."""
import json
import os
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'adapter'))
from core import Session
root=pathlib.Path(__file__).resolve().parents[1]
events=[]
s=Session(lambda name,body:events.append((name,body)))
try:
    s.launch({'program':str(root/'samples/registers.asm'),'dosboxPath':os.environ['DOSBOX_PATH'],'tasmBundle':os.environ['TASM_BUNDLE']})
    entry=s.lines[s.reg('IP')]
    for _ in range(5):s.step()
    assert (s.reg('AX'),s.reg('BX'))==(8,3)
    s.step();s.step()
    assert s.reg('SP')==0xFE and s.read((s.reg('SS')<<4)+0xFE,2)==b'\x08\x00'
    for _ in range(3):s.step()
    assert (s.reg('AX'),s.reg('CX'),s.evaluate('ZF'),s.evaluate('RESULT'))==(0,8,1,8)
    nop=s.lines[s.reg('IP')]
    for _ in range(6):s.step()
    assert s.ended and s.exit_code==0
    assert ''.join(body.get('output','') for name,body in events if name=='output' and body.get('category')=='stdout')=='Calculation finished!'
    print(json.dumps({'result':'PASS','sourceEntryLine':entry,'sourceNopLine':nop,'registersFlagsStackDataOutputExit':True}))
finally:s.close()
