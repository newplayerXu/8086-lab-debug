import base64
import pathlib
import struct
import sys
import threading
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'adapter'))
from core import Session, REGS, FLAGS, MEMORY_SIZE, relocate_mz, parse_listing, validate_source, explicit_symbols
from main import Adapter
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16

def session(code):
    result = Session()
    result.u = Uc(UC_ARCH_X86, UC_MODE_16)
    result.u.mem_map(0, MEMORY_SIZE)
    result.u.mem_write(0x10000, code)
    for name, value in [('CS', 0x1000), ('IP', 0), ('SS', 0x2000), ('SP', 0x100), ('DS', 0x3000), ('EFLAGS', 0x202)]:
        result.u.reg_write(REGS[name], value)
    result.source = pathlib.Path(__file__).resolve()
    result.entry_cs = 0x1000
    result.data_segment = 0x3000
    result.cancelled = False
    return result

class CoreTests(unittest.TestCase):
    def test_arithmetic_stack_and_flags(self):
        s = session(bytes.fromhex('b80500 bb0300 01d8 50 b80000 59 83f908 90'))
        for _ in range(3): s.step()
        self.assertEqual(s.reg('AX'), 8)
        s.step();self.assertEqual(s.reg('SP'), 0xFE)
        self.assertEqual(s.read(0x200FE, 2), b'\x08\x00')
        for _ in range(3): s.step()
        self.assertEqual((s.reg('AX'), s.reg('CX'), s.reg('SP')), (0, 8, 0x100))
        self.assertEqual(s.evaluate('ZF'), 1)
    def test_indirect_call_tracks_return(self):
        # mov bx,7; call bx; nop; nop; mov ax,42; ret
        s = session(bytes.fromhex('bb0700 ffd3 90 90 b82a00 c3'))
        s.step();s.step()
        self.assertEqual(s.reg('IP'), 7)
        self.assertEqual(s.call_frames, [(0x10005, 0x100)])
        s.step();s.step()
        self.assertEqual(s.reg('AX'), 42)
        self.assertEqual(s.reg('IP'), 5)
        self.assertEqual(s.call_frames, [])
    def test_unsupported_interrupt_preserves_fault_line(self):
        s = session(bytes.fromhex('b80100 cd21'))
        from unicorn import UC_HOOK_INTR
        s.u.hook_add(UC_HOOK_INTR, s.interrupt)
        s.step()
        with self.assertRaisesRegex(ValueError, 'not implemented'): s.step()
        self.assertEqual(s.reg('IP'), 3)
    def test_port_io_is_not_silently_emulated(self):
        with self.assertRaisesRegex(ValueError, 'hardware semantics'): session(bytes.fromhex('e460')).step()
    def test_expressions_and_symbol_address_are_safe(self):
        s = session(b'\x90');s.symbols={'RESULT': (4, 2)};s.u.mem_write(0x30004, b'\x08\x00')
        self.assertEqual(s.evaluate('RESULT + 0002h'), 10)
        self.assertEqual(s.evaluate('SS:SP'), 0x20100)
        s.u.reg_write(REGS['DS'], 0)
        self.assertEqual(s.evaluate('RESULT'), 8)
        for expression in ['__import__("os")', 'AX.__class__', '1 << 100', '2 ** 1000']:
            with self.assertRaises((ValueError, SyntaxError)): s.evaluate(expression)
    def test_register_width_and_flag_edit(self):
        s = session(b'\x90');s.write_register('ZF', 1)
        self.assertEqual(s.evaluate('ZF'), 1)
        with self.assertRaises(ValueError):s.write_register('AX', 0x10000)
        with self.assertRaises(ValueError):s.write_register('ZF', 2)
    def test_memory_bounds(self):
        s = session(b'\x90')
        for address,count in [(-1,1),(MEMORY_SIZE,1),(0,-1)]:
            with self.assertRaises(ValueError):s.read(address,count)
    def test_source_validation(self):
        valid='.8086\n.model small\n.data\na dw 1\n.code\nmov ax, 5'
        validate_source(valid)
        for bad in [valid.replace('.8086','.386'), valid+'\ninclude other.asm',valid+'\n.code']:
            with self.assertRaises(ValueError):validate_source(bad)
    def test_listing_zero_operand_labels_and_duplicate_instructions(self):
        source='.code\nstart: nop\n mov ax, 5\n nop\n ret'
        listing='1 0000 .code\n2 0000 90     start: nop\n3 0001 B8 0005    mov ax, 5\n4 0004 90    nop\n5 0005 C3    ret\nSymbol Table\nRESULT Word DGROUP:0004'
        lines,symbols=parse_listing(listing,source)
        self.assertEqual(lines,{0:2,1:3,4:4,5:5})
        self.assertEqual(symbols['RESULT'],(4,2))
    def test_explicit_segments_listing_and_segment_relative_data(self):
        source='DATAS SEGMENT\nDAT1 DB 1\nDATAS ENDS\nCODES SEGMENT\nASSUME CS:CODES,DS:DATAS\nSTART: MOV AX,DATAS\nNOP\nCODES ENDS\nEND START'
        validate_source(source)
        listing='0000 DATAS SEGMENT\n2000 01 DAT1 DB 1\n2001 DATAS ENDS\n0000 CODES SEGMENT\n0000 B8 ---- R START: MOV AX,DATAS\n0003 90 NOP\n0004 CODES ENDS\nDAT1 . . . . L BYTE 2000 DATAS'
        self.assertEqual(parse_listing(listing,source)[0],{0:6,3:7})
        mapping=' 00026H 02026H 02001H DATAS\n 02030H 02033H 00004H CODES'
        self.assertEqual(explicit_symbols(listing,mapping),{'DAT1':(0x2026,1)})
        self.assertEqual(explicit_symbols('DAT1 Byte DATAS:2000',mapping),{'DAT1':(0x2026,1)})
        for bad in [source.replace('DATAS ENDS','WRONG ENDS'),source.replace('END START','END MISSING'),source.replace('CS:CODES','CS:DATAS')]:
            with self.assertRaises(ValueError):validate_source(bad)
    def test_mz_relocation_and_malformed_headers(self):
        header=struct.pack('<14H',0x5a4d,36,1,1,2,0,0,0,0x100,0,0,0,28,0)
        binary=header+struct.pack('<HH',0,0)+b'\x03\x00\x90\x90'
        image,_=relocate_mz(binary,0x1000)
        self.assertEqual(image[:2],b'\x03\x10')
        for bad in [b'MZ',binary[:20],binary[:28]+struct.pack('<HH',65535,0)+binary[32:]]:
            with self.assertRaises(ValueError):relocate_mz(bad,0x1000)

class DapTests(unittest.TestCase):
    def setUp(self):
        self.messages=[];self.adapter=Adapter(self.messages.append);self.adapter.session=session(bytes.fromhex('90 90 90'))
        self.adapter.session.lines={0:10,1:11,2:12};self.seq=0
    def request(self,command,args=None):
        self.seq+=1;self.adapter.handle({'seq':self.seq,'command':command,'arguments':args or {}})
        return next(m for m in reversed(self.messages) if m.get('request_seq')==self.seq)
    def test_breakpoint_moves_to_instruction_and_does_not_leak_from_other_file(self):
        source=str(self.adapter.session.source)
        result=self.request('setBreakpoints',{'source':{'path':source},'breakpoints':[{'line':9}]})
        self.assertEqual(result['body']['breakpoints'][0]['line'],10)
        self.assertIn(0x10000,self.adapter.session.breakpoints)
        other=self.request('setBreakpoints',{'source':{'path':source+'.other'},'breakpoints':[{'line':11}]})
        self.assertFalse(other['body']['breakpoints'][0]['verified'])
        self.assertNotIn(0x10001,self.adapter.session.breakpoints)
    def test_conditional_breakpoints_are_not_falsely_verified(self):
        result=self.request('setBreakpoints',{'source':{'path':str(self.adapter.session.source)},'breakpoints':[{'line':10,'condition':'AX==1'}]})
        self.assertFalse(result['body']['breakpoints'][0]['verified'])
    def test_continue_stops_at_breakpoint(self):
        self.adapter.session.breakpoints={0x10002}
        self.request('continue');self.adapter.worker.join(timeout=2)
        self.assertFalse(self.adapter.worker.is_alive())
        self.assertEqual(self.adapter.session.reg('IP'),2)
        self.assertEqual([m for m in self.messages if m.get('event')=='stopped'][-1]['body']['reason'],'breakpoint')
    def test_pause_infinite_loop(self):
        self.adapter.session=session(bytes.fromhex('ebfe'));self.adapter.session.max_instructions=10000000
        self.request('continue');self.request('pause');self.adapter.worker.join(timeout=2)
        self.assertFalse(self.adapter.worker.is_alive())
        self.assertEqual([m for m in self.messages if m.get('event')=='stopped'][-1]['body']['reason'],'pause')
    def test_data_edit_memory_and_disassembly(self):
        self.adapter.session.symbols={'RESULT':(4,2)}
        self.assertTrue(self.request('setVariable',{'variablesReference':3,'name':'RESULT','value':'8'})['success'])
        data=self.request('readMemory',{'memoryReference':'0x30004','count':2})['body']['data']
        self.assertEqual(base64.b64decode(data),b'\x08\x00')
        instructions=self.request('disassemble',{'memoryReference':'0x10000','instructionCount':2})['body']['instructions']
        self.assertEqual(instructions[0]['instruction'],'nop')
        self.assertEqual(instructions[1]['line'],11)
    def test_indirect_call_next_and_step_out(self):
        self.adapter.session=session(bytes.fromhex('bb0700 ffd3 90 90 b82a00 c3'))
        self.request('stepIn');self.request('next');self.adapter.worker.join(timeout=2)
        self.assertEqual(self.adapter.session.reg('IP'),5)
        self.assertEqual(self.adapter.session.reg('AX'),42)
        self.adapter.session=session(bytes.fromhex('bb0700 ffd3 90 90 b82a00 c3'))
        self.request('stepIn');self.request('stepIn');self.request('stepOut');self.adapter.worker.join(timeout=2)
        self.assertEqual(self.adapter.session.reg('IP'),5)
    def test_unsupported_dap_request_is_error(self):
        self.assertFalse(self.request('unknownRequest')['success'])
    def test_call_with_ret_immediate_returns_without_hitting_limit(self):
        # push ax; call subroutine at offset 6; nop; ret 2
        self.adapter.session=session(bytes.fromhex('50 e80200 90 90 c20200'))
        self.request('stepIn');self.request('next');self.adapter.worker.join(timeout=2)
        self.assertEqual(self.adapter.session.reg('IP'),4)
        self.assertEqual(self.adapter.session.reg('SP'),0x100)
        self.assertEqual([m for m in self.messages if m.get('event')=='stopped'][-1]['body']['reason'],'step')

if __name__=='__main__':unittest.main()
