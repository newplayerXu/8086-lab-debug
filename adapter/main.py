"""DAP transport and lifecycle. SPDX-License-Identifier: GPL-2.0-or-later."""
import base64
import json
import pathlib
import sys
import threading
from core import Session, REGS, FLAGS

class Adapter:
    def __init__(self, writer):
        self.writer, self.sequence = writer, 0
        self.write_lock = threading.Lock()
        self.session = Session(self.event)
        self.worker = None
        self.breakpoint_requests = {}
        self.configured = self.termination_sent = False
    def send(self, message):
        with self.write_lock:
            self.sequence += 1;message['seq'] = self.sequence;self.writer(message)
    def event(self, name, body=None): self.send({'type': 'event', 'event': name, 'body': body or {}})
    def response(self, request, body=None, error=None):
        message = {'type': 'response', 'request_seq': request['seq'], 'command': request['command'], 'success': error is None, 'body': body or {}}
        if error: message['message'] = str(error)
        self.send(message)
    def require_paused(self):
        if self.session.u is None: raise ValueError('Launch a program first.')
        if self.session.running: raise ValueError('Pause execution before inspecting or modifying state.')
        if self.worker and self.worker.is_alive():
            self.worker.join(timeout=1)
            if self.worker.is_alive(): raise ValueError('Execution worker is still stopping. Retry after it pauses.')
        if self.session.ended: raise ValueError('Program has exited. Restart the debugger.')
    def stopped(self, reason='step'):
        if self.session.cancelled: return
        if self.session.ended:
            if not self.termination_sent:
                self.termination_sent = True
                self.event('exited', {'exitCode': self.session.exit_code});self.event('terminated')
        else: self.event('stopped', {'reason': reason, 'threadId': 1, 'allThreadsStopped': True})
    def apply_breakpoints(self, source, breakpoints):
        session, output = self.session, []
        matches = session.source and pathlib.Path(source).resolve() == session.source
        for index, bp in enumerate(breakpoints):
            if bp.get('condition') or bp.get('hitCondition') or bp.get('logMessage'):
                output.append({'id': index + 1, 'verified': False, 'line': bp['line'], 'message': 'Conditional, hit-count and log breakpoints are not supported.'});continue
            candidates = [(offset, line) for offset, line in session.lines.items() if line >= bp['line']] if matches else []
            item = min(candidates, key=lambda value: value[1]) if candidates else None
            if item: session.breakpoints.add((session.entry_cs << 4) + item[0])
            output.append({'id': index + 1, 'verified': bool(item), 'line': item[1] if item else bp['line']})
        return output
    def run(self, temporary=None, finish_depth=None):
        session, reason = self.session, 'pause'
        try:
            for _ in range(session.max_instructions):
                if not session.running or session.cancelled: break
                session.step()
                if session.ended: break
                if session.pc() in session.breakpoints: reason = 'breakpoint';break
                if temporary is not None and session.pc() == temporary and (finish_depth is None or len(session.call_frames) == finish_depth): reason = 'step';break
            else: self.event('output', {'category': 'console', 'output': 'Instruction limit reached; paused.\n'})
        except Exception as error:
            session.last_exception = str(error);self.event('output', {'category': 'stderr', 'output': str(error) + '\n'});reason = 'exception'
        finally:
            session.running = False;self.stopped(reason)
    def start_run(self, temporary=None, finish_depth=None):
        self.session.running = True;self.event('continued', {'threadId': 1, 'allThreadsContinued': True})
        self.worker = threading.Thread(target=self.run, args=(temporary, finish_depth), daemon=True);self.worker.start()
    def handle(self, request):
        command, args, session = request['command'], request.get('arguments') or {}, self.session
        try:
            if command == 'initialize':
                self.response(request, {'supportsConfigurationDoneRequest': True, 'supportsReadMemoryRequest': True, 'supportsWriteMemoryRequest': True, 'supportsDisassembleRequest': True, 'supportsEvaluateForHovers': True, 'supportsSetVariable': True, 'supportsExceptionInfoRequest': True, 'supportsTerminateRequest': True})
            elif command == 'launch':
                if self.worker and self.worker.is_alive(): raise ValueError('Stop the active worker before relaunching.')
                self.configured = self.termination_sent = False
                session.launch(args);self.response(request);self.event('initialized')
            elif command == 'configurationDone':
                if self.configured or session.u is None: raise ValueError('Session is not ready for configurationDone.')
                self.configured = True;self.response(request)
                if session.stop_on_entry: self.stopped('entry')
                else: self.start_run()
            elif command == 'setBreakpoints':
                if session.running: raise ValueError('Pause before changing breakpoints.')
                source = args.get('source', {}).get('path')
                if not source: raise ValueError('A source path is required.')
                self.breakpoint_requests[str(pathlib.Path(source).resolve())] = args.get('breakpoints', [])
                session.breakpoints.clear();result = []
                for path, breakpoints in self.breakpoint_requests.items():
                    applied = self.apply_breakpoints(path, breakpoints)
                    if pathlib.Path(path).resolve() == pathlib.Path(source).resolve(): result = applied
                self.response(request, {'breakpoints': result})
            elif command == 'threads': self.response(request, {'threads': [{'id': 1, 'name': 'x86 16-bit learning CPU'}]})
            elif command == 'stackTrace':
                self.require_paused()
                line = session.lines.get(session.reg('IP')) if session.reg('CS') == session.entry_cs else None
                frame = {'id': 1, 'name': f'{session.reg("CS"):04X}:{session.reg("IP"):04X}', 'line': line or 0, 'column': 1, 'instructionPointerReference': hex(session.pc())}
                if line: frame['source'] = {'name': session.source.name, 'path': str(session.source)}
                self.response(request, {'stackFrames': [frame], 'totalFrames': 1})
            elif command == 'scopes':
                self.require_paused()
                self.response(request, {'scopes': [{'name': name, 'variablesReference': reference, 'expensive': False} for name, reference in [('Registers / 寄存器', 1), ('Flags / 标志位', 2), ('Data / 数据变量', 3), ('Stack / 堆栈 SS:SP', 4)]]})
            elif command == 'variables':
                self.require_paused();reference, values = args['variablesReference'], []
                def add(name, value, address=None, kind='uint16'):
                    item = {'name': name, 'value': value, 'type': kind, 'variablesReference': 0}
                    if address is not None: item['memoryReference'] = hex(address)
                    values.append(item)
                if reference == 1:
                    for name in REGS:
                        value = session.reg(name)
                        address = (value << 4) if name in ['CS', 'DS', 'ES', 'SS'] else session.pc() if name == 'IP' else (session.reg('SS') << 4) + value if name == 'SP' else value
                        add('FLAGS' if name == 'EFLAGS' else name, f'0x{value:04X}', address)
                elif reference == 2:
                    for name, bit in FLAGS.items(): add(name, str((session.reg('EFLAGS') >> bit) & 1), kind='bool')
                elif reference == 3:
                    for name, (offset, size) in session.symbols.items():
                        address = (session.data_segment << 4) + offset;value = int.from_bytes(session.read(address, size), 'little')
                        add(name, f'0x{value:0{size*2}X} ({value})', address, f'uint{size*8}')
                elif reference == 4:
                    for index in range(8):
                        offset = (session.reg('SP') + index * 2) & 0xFFFF;address = (session.reg('SS') << 4) + offset
                        add(f'SS:{offset:04X}', f'0x{int.from_bytes(session.read(address, 2), "little"):04X}', address)
                else: raise ValueError('Unknown variables reference.')
                start, count = max(0, int(args.get('start', 0))), args.get('count')
                self.response(request, {'variables': values[start:start+int(count)] if count else values[start:]})
            elif command in ['next', 'stepIn', 'stepOut', 'continue']:
                self.require_paused()
                if command == 'continue': self.response(request, {'allThreadsContinued': True});self.start_run();return
                instruction = session.instruction()
                if command == 'stepOut':
                    if not session.call_frames: raise ValueError('No tracked CALL frame. Set a return breakpoint instead.')
                    temporary, _ = session.call_frames[-1];self.response(request);self.start_run(temporary, len(session.call_frames) - 1);return
                if command == 'next' and instruction.mnemonic in ['call', 'lcall']:
                    temporary = (session.reg('CS') << 4) + ((session.reg('IP') + instruction.size) & 0xFFFF)
                    self.response(request);self.start_run(temporary, len(session.call_frames));return
                try: session.step();self.response(request);self.stopped()
                except Exception as error:
                    session.last_exception = str(error);self.response(request, error=error);self.event('output', {'category': 'stderr', 'output': str(error) + '\n'});self.stopped('exception')
            elif command == 'pause':
                running = session.running;session.running = False;self.response(request)
                if not running: self.stopped('pause')
            elif command in ['disconnect', 'terminate']:
                session.cancelled, session.running = True, False
                if self.worker and self.worker.is_alive(): self.worker.join(timeout=2)
                session.close();self.response(request)
                if not self.termination_sent: self.termination_sent = True;self.event('terminated')
            elif command == 'evaluate':
                self.require_paused();value = session.evaluate(args['expression'])
                self.response(request, {'result': f'0x{value:04X} ({value})', 'variablesReference': 0, 'memoryReference': hex(value) if value >= 0 else '0x0'})
            elif command == 'setVariable':
                self.require_paused();reference, name = args['variablesReference'], args['name'].upper();value = session.evaluate(args['value'])
                if reference in [1, 2]: session.write_register(name, value)
                elif reference == 3 and name in session.symbols:
                    offset, size = session.symbols[name]
                    if not 0 <= value < 1 << (size * 8): raise ValueError('Value exceeds variable size.')
                    session.u.mem_write((session.data_segment << 4) + offset, value.to_bytes(size, 'little'))
                else: raise ValueError('Only registers, flags and named data variables can be edited.')
                self.response(request, {'value': f'0x{value:04X} ({value})', 'variablesReference': 0})
            elif command == 'readMemory':
                self.require_paused();address = int(args['memoryReference'], 0) + int(args.get('offset', 0));count = int(args['count'])
                if not 0 <= count <= 65536: raise ValueError('Memory reads must be 0..65536 bytes.')
                self.response(request, {'address': hex(address), 'data': base64.b64encode(session.read(address, count)).decode()})
            elif command == 'writeMemory':
                self.require_paused();address = int(args['memoryReference'], 0) + int(args.get('offset', 0));data = base64.b64decode(args['data'], validate=True)
                if len(data) > 65536: raise ValueError('Memory writes must be at most 65536 bytes.')
                session.read(address, len(data));session.u.mem_write(address, data);self.response(request, {'bytesWritten': len(data)})
            elif command == 'disassemble':
                self.require_paused();address = int(args['memoryReference'], 0) + int(args.get('offset', 0));count, skip = int(args['instructionCount']), int(args.get('instructionOffset', 0))
                if not 0 <= count <= 512 or not 0 <= skip <= 512: raise ValueError('Disassembly count/offset must be 0..512; backwards disassembly is unsupported.')
                output = []
                for index in range(count + skip):
                    instruction = session.instruction(address)
                    if index >= skip:
                        item = {'address': hex(address), 'instructionBytes': bytes(instruction.bytes).hex(' '), 'instruction': (instruction.mnemonic + ' ' + instruction.op_str).strip()}
                        relative = address - (session.entry_cs << 4)
                        if relative in session.lines: item.update({'location': {'name': session.source.name, 'path': str(session.source)}, 'line': session.lines[relative]})
                        output.append(item)
                    address += instruction.size
                self.response(request, {'instructions': output})
            elif command == 'exceptionInfo': self.response(request, {'exceptionId': '8086Lab', 'description': session.last_exception or 'No exception', 'breakMode': 'always'})
            elif command == 'setExceptionBreakpoints': self.response(request, {'breakpoints': []})
            elif command == 'loadedSources': self.response(request, {'sources': [{'name': session.source.name, 'path': str(session.source)}] if session.source else []})
            else: self.response(request, error='Unsupported DAP request: ' + command)
        except Exception as error: self.response(request, error=error);self.event('output', {'category': 'stderr', 'output': str(error) + '\n'})

def main():
    def write(message):
        payload = json.dumps(message, ensure_ascii=False).encode('utf8')
        sys.stdout.buffer.write(f'Content-Length: {len(payload)}\r\n\r\n'.encode() + payload);sys.stdout.buffer.flush()
    adapter = Adapter(write)
    try:
        while True:
            headers = {}
            while True:
                line = sys.stdin.buffer.readline()
                if not line: return
                if line in [b'\r\n', b'\n']: break
                key, value = line.decode('ascii').split(':', 1);headers[key.lower()] = value.strip()
            size = int(headers['content-length'])
            if not 0 < size <= 1024 * 1024: raise ValueError('Invalid DAP message size.')
            payload = sys.stdin.buffer.read(size)
            if len(payload) != size: return
            adapter.handle(json.loads(payload))
    finally:
        adapter.session.cancelled, adapter.session.running = True, False
        if adapter.worker and adapter.worker.is_alive(): adapter.worker.join(timeout=2)
        adapter.session.close()

if __name__ == '__main__': main()
