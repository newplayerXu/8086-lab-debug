"""16-bit instructional debugger. SPDX-License-Identifier: GPL-2.0-or-later."""
import ast
import operator
import pathlib
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile
from capstone import Cs, CS_ARCH_X86, CS_MODE_16
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_INTR
from unicorn import x86_const as xc

REGS = {name: getattr(xc, 'UC_X86_REG_' + name) for name in
        ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'CS', 'DS', 'ES', 'SS', 'IP', 'EFLAGS']}
FLAGS = {'CF': 0, 'PF': 2, 'AF': 4, 'ZF': 6, 'SF': 7, 'TF': 8, 'IF': 9, 'DF': 10, 'OF': 11}
MEMORY_SIZE = 0x200000

def strip_comment(line):
    quote = None
    for index, char in enumerate(line):
        if char in "'\"":
            if quote == char: quote = None
            elif quote is None: quote = char
        if char == ';' and quote is None: return line[:index]
    return line

def normalize(line): return re.sub(r'\s+', '', strip_comment(line)).lower()

def validate_source(text):
    clean = '\n'.join(strip_comment(line) for line in text.splitlines())
    if not re.search(r'^\s*\.8086\s*$', clean, re.M | re.I):
        raise ValueError('Add .8086 to restrict assembled instructions to the 8086 instruction set.')
    if not re.search(r'^\s*\.model\s+small\s*$', clean, re.M | re.I):
        raise ValueError('Preview 0.2 requires .model small and a single .code segment.')
    if len(re.findall(r'^\s*\.code\b', clean, re.M | re.I)) != 1:
        raise ValueError('Exactly one .code segment is supported.')
    if re.search(r'^\s*(?:\.(?:[123456]86|x64)|include\b|includelib\b|\w+\s+(?:macro|segment)\b)', clean, re.M | re.I):
        raise ValueError('Includes, macros, explicit segments and newer CPU directives are not supported in preview 0.2.')

def parse_listing(listing, source):
    lines, symbols, code, cursor = {}, {}, False, 0
    source_lines = source.splitlines()
    for row in listing.splitlines():
        if re.search(r'\s\.code\b', row, re.I): code = True;continue
        if re.search(r'\s\.(?:data|stack)\b', row, re.I) or row.strip() == 'Symbol Table': code = False
        if not code: continue
        match = re.match(r'^\s*\d+\s+([0-9A-F]{4})\s+([0-9A-F]{2,})(?:\s|[rs])', row, re.I)
        if not match: continue
        row_normal = normalize(row)
        for index in range(cursor, len(source_lines)):
            instruction = re.sub(r'^\w+:\s*', '', strip_comment(source_lines[index]).strip())
            if not instruction or instruction.startswith('.') or re.search(r'\b(?:proc|endp|equ|dw|db|end)\b', instruction, re.I): continue
            if row_normal.endswith(normalize(instruction)):
                lines[int(match[1], 16)] = index + 1;cursor = index + 1;break
    if not lines: raise ValueError('TASM listing has no supported source-to-instruction mapping.')
    for match in re.finditer(r'^([A-Z_][\w]*)\s+(Byte|Word)\s+DGROUP:([0-9A-F]{4})', listing, re.M):
        symbols[match[1]] = (int(match[3], 16), 1 if match[2] == 'Byte' else 2)
    return lines, symbols

def relocate_mz(data, load_segment):
    if len(data) < 28: raise ValueError('Truncated DOS MZ header.')
    header = struct.unpack_from('<14H', data)
    if header[0] != 0x5A4D: raise ValueError('Expected a DOS MZ EXE.')
    header_size = header[4] * 16
    declared_size = (header[2] - 1) * 512 + (header[1] or 512)
    if header[2] == 0 or not 28 <= header_size <= declared_size <= len(data): raise ValueError('Invalid DOS EXE size/header fields.')
    if header[12] + header[3] * 4 > header_size: raise ValueError('Relocation table extends past the EXE header.')
    image = bytearray(data[header_size:declared_size])
    if not image or (load_segment << 4) + len(image) >= 0x100000: raise ValueError('DOS EXE image exceeds supported conventional memory.')
    for index in range(header[3]):
        offset, segment = struct.unpack_from('<HH', data, header[12] + index * 4)
        position = segment * 16 + offset
        if position + 2 > len(image): raise ValueError('Relocation target lies outside the EXE image.')
        struct.pack_into('<H', image, position, (struct.unpack_from('<H', image, position)[0] + load_segment) & 0xFFFF)
    if header[11] * 16 + header[10] >= len(image): raise ValueError('EXE entry point lies outside the image.')
    if ((load_segment + header[7]) << 4) + header[8] > 0x100000: raise ValueError('EXE stack lies outside supported conventional memory.')
    return image, header

class Session:
    def __init__(self, emit=lambda *args: None):
        self.emit = emit
        self.u = self.source = self.build = None
        self.lines, self.symbols, self.breakpoints = {}, {}, set()
        self.running = self.ended = self.cancelled = False
        self.exit_code, self.entry_cs, self.data_segment = 0, 0, 0
        self.load_segment, self.max_instructions = 0x1000, 1000000
        self.stop_on_entry, self.last_exception = True, None
        self.call_frames = []
        self.decoder = Cs(CS_ARCH_X86, CS_MODE_16)

    def reg(self, name): return self.u.reg_read(REGS[name])
    def pc(self): return (self.reg('CS') << 4) + self.reg('IP')
    def read(self, address, count):
        if address < 0 or count < 0 or address + count > MEMORY_SIZE: raise ValueError('Memory range is outside the mapped address space.')
        return bytes(self.u.mem_read(address, count))
    def write_register(self, name, value):
        name = 'EFLAGS' if name.upper() == 'FLAGS' else name.upper()
        if name in FLAGS:
            if value not in (0, 1): raise ValueError('Flag values must be 0 or 1.')
            self.u.reg_write(REGS['EFLAGS'], (self.reg('EFLAGS') & ~(1 << FLAGS[name])) | (value << FLAGS[name]) | 2);return
        if name not in REGS or not 0 <= value <= 0xFFFF: raise ValueError('Expected a supported register and a 16-bit unsigned value.')
        self.u.reg_write(REGS[name], value | 2 if name == 'EFLAGS' else value)
        if name in ['CS', 'IP', 'SS', 'SP']: self.call_frames.clear()

    def evaluate(self, expression):
        text = expression.strip().upper()
        if len(text) > 256: raise ValueError('Expression is too long.')
        text = re.sub(r'\b([0-9][0-9A-F]*)H\b', lambda match: '0x' + match[1], text)
        if ':' in text:
            segment, offset = text.split(':', 1);return (self.evaluate(segment) << 4) + self.evaluate(offset)
        operations = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.BitAnd: operator.and_, ast.BitOr: operator.or_, ast.BitXor: operator.xor, ast.LShift: operator.lshift, ast.RShift: operator.rshift}
        def visit(node):
            if isinstance(node, ast.Expression): return visit(node.body)
            if isinstance(node, ast.Constant) and type(node.value) is int:
                if abs(node.value) > 0xFFFFFFFF: raise ValueError('Literal exceeds 32 bits.')
                return node.value
            if isinstance(node, ast.Name):
                name = 'EFLAGS' if node.id.upper() == 'FLAGS' else node.id.upper()
                if name in REGS: return self.reg(name)
                if name in FLAGS: return (self.reg('EFLAGS') >> FLAGS[name]) & 1
                if name in self.symbols:
                    offset, size = self.symbols[name];return int.from_bytes(self.read((self.data_segment << 4) + offset, size), 'little')
                raise ValueError('Unknown register, flag or data symbol: ' + name)
            if isinstance(node, ast.BinOp) and type(node.op) in operations:
                left, right = visit(node.left), visit(node.right)
                if isinstance(node.op, (ast.LShift, ast.RShift)) and not 0 <= right <= 31: raise ValueError('Shift count must be between 0 and 31.')
                result = operations[type(node.op)](left, right)
                if abs(result) > 0xFFFFFFFF: raise ValueError('Expression exceeds 32 bits.')
                return result
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd, ast.Invert)):
                value = visit(node.operand);return -value if isinstance(node.op, ast.USub) else ~value if isinstance(node.op, ast.Invert) else value
            raise ValueError('Only integer register/symbol arithmetic is supported; functions and attribute access are disabled.')
        return visit(ast.parse(text, mode='eval'))

    def launch(self, args):
        self.close();self.__init__(self.emit)
        self.source = pathlib.Path(args['program']).resolve()
        if self.source.suffix.lower() != '.asm' or not self.source.is_file(): raise ValueError('Select an existing local .asm source file.')
        self.max_instructions = int(args.get('maxInstructions', 1000000))
        if not 1 <= self.max_instructions <= 10000000: raise ValueError('maxInstructions must be between 1 and 10000000.')
        self.stop_on_entry = bool(args.get('stopOnEntry', True))
        encoding = args.get('sourceEncoding', 'utf-8-sig')
        if encoding not in ['utf-8-sig', 'gbk', 'cp437']: raise ValueError('Unsupported sourceEncoding.')
        text = self.source.read_text(encoding=encoding);validate_source(text)
        root = pathlib.Path(args.get('buildRoot') or tempfile.gettempdir()).resolve()
        if not str(root).isascii() or any(char in str(root) for char in '\r\n"'): raise ValueError('Set 8086lab.buildDirectory to a writable ASCII path, e.g. C:/8086-build.')
        root.mkdir(parents=True, exist_ok=True)
        self.build = pathlib.Path(tempfile.mkdtemp(prefix='8086-lab-', dir=str(root)))
        clean = '\n'.join(strip_comment(line) for line in text.splitlines())
        try: encoded = clean.encode('cp437')
        except UnicodeEncodeError as error: raise ValueError('Non-ASCII string literals are outside this preview. Use numeric bytes for non-ASCII data.') from error
        (self.build / 'MAIN.ASM').write_bytes(encoded)
        configured = args.get('tasmDirectory')
        tools = pathlib.Path(configured).resolve() if configured else self.build / 'tools'
        if not configured:
            bundle = pathlib.Path(args.get('tasmBundle', ''))
            if not bundle.is_file(): raise ValueError('TASM bundle is missing. Configure 8086lab.tasmDirectory.')
            tools.mkdir()
            with zipfile.ZipFile(bundle) as archive:
                for info in archive.infolist():
                    name = pathlib.PurePosixPath(info.filename)
                    if name.parts and name.parts[0].lower() == 'tasm' and not info.is_dir():
                        if len(name.parts) != 2 or name.name in ('.', '..') or not re.fullmatch(r'[A-Za-z0-9_.-]+', name.name): raise ValueError('Unsafe TASM bundle entry.')
                        if info.file_size > 4 * 1024 * 1024: raise ValueError('TASM bundle entry exceeds supported size.')
                        with archive.open(info) as source: (tools / name.name).write_bytes(source.read())
        if not (tools / 'TASM.EXE').is_file() or not (tools / 'TLINK.EXE').is_file(): raise ValueError('TASM.EXE and TLINK.EXE were not found.')
        if configured:
            destination = self.build / 'tools';destination.mkdir()
            for item in tools.iterdir():
                if item.is_file(): shutil.copy2(item, destination / item.name)
        commands = [f'mount c "{self.build}"', 'c:', 'path c:\\tools', 'tasm /zi /l MAIN.ASM > BUILD.LOG', 'if errorlevel 1 goto done', 'tlink /v MAIN.OBJ >> BUILD.LOG', ':done', 'exit']
        conf = self.build / 'BUILD.CONF'
        conf.write_text('[sdl]\noutput=surface\n[cpu]\ncore=normal\ncycles=fixed 20000\n[autoexec]\n' + '\n'.join(commands) + '\n', encoding='ascii')
        executable = pathlib.Path(args.get('dosboxPath', '')).resolve()
        if not executable.is_file(): raise ValueError('DOSBox-X executable was not found.')
        self.emit('output', {'category': 'console', 'output': f'Building {self.source.name}\nBuild directory: {self.build}\n'})
        subprocess.run([str(executable), '-conf', str(conf), '-nopromptfolder', '-noconsole'], cwd=str(self.build), timeout=45, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        log = self.build / 'BUILD.LOG'
        self.emit('output', {'category': 'console', 'output': (log.read_text(encoding='cp437', errors='replace') if log.exists() else 'No build log.') + '\n'})
        binary, listing = self.build / 'MAIN.EXE', self.build / 'MAIN.LST'
        if not binary.is_file() or not listing.is_file(): raise ValueError('Assembly/link failed. Read the build log in Debug Console.')
        image, header = relocate_mz(binary.read_bytes(), self.load_segment)
        self.u = Uc(UC_ARCH_X86, UC_MODE_16);self.u.mem_map(0, MEMORY_SIZE);self.u.mem_write(self.load_segment << 4, bytes(image))
        psp = self.load_segment - 0x10
        self.u.mem_write(psp << 4, b'\xcd\x20');self.u.mem_write((psp << 4) + 0x80, b'\x00\x0d')
        values = {'CS': self.load_segment + header[11], 'IP': header[10], 'SS': self.load_segment + header[7], 'SP': header[8], 'DS': psp, 'ES': psp, 'EFLAGS': 0x202}
        for name, value in values.items(): self.u.reg_write(REGS[name], value)
        self.entry_cs = values['CS']
        map_text = (self.build / 'MAIN.MAP').read_text(encoding='cp437', errors='replace')
        match = re.search(r'^\s*([0-9A-F]+)H\s+\w+H\s+\w+H\s+_DATA\s+DATA', map_text, re.M | re.I)
        self.data_segment = self.load_segment + int(match[1], 16) // 16 if match else self.load_segment
        self.lines, self.symbols = parse_listing(listing.read_text(encoding='cp437', errors='replace'), clean)
        if self.symbols and not match: raise ValueError('Named data requires the expected _DATA segment in this preview.')
        self.u.hook_add(UC_HOOK_INTR, self.interrupt)

    def interrupt(self, emulator, number, unused):
        ah, al = self.reg('AX') >> 8, self.reg('AX') & 0xFF
        if number == 0x20 or (number == 0x21 and ah == 0x4C):
            self.ended, self.exit_code = True, al if number == 0x21 else 0;emulator.emu_stop();return
        if number == 0x21 and ah == 9:
            output = bytearray()
            for index in range(65536):
                byte = self.read((self.reg('DS') << 4) + ((self.reg('DX') + index) & 0xFFFF), 1)
                if byte == b'$': break
                output.extend(byte)
            else: raise ValueError('INT 21h/AH=09h string has no $ terminator in its 64 KiB segment.')
            self.emit('output', {'category': 'stdout', 'output': output.decode('cp437')});return
        if (number == 0x21 and ah == 2) or (number == 0x10 and ah == 0x0E):
            char = self.reg('DX') & 0xFF if number == 0x21 else al
            self.emit('output', {'category': 'stdout', 'output': bytes([char]).decode('cp437')})
            if number == 0x21: emulator.reg_write(REGS['AX'], (self.reg('AX') & 0xFF00) | char)
            return
        if number == 0x21 and ah == 0x30:
            for name, value in [('AX', 5), ('BX', 0), ('CX', 0)]: emulator.reg_write(REGS[name], value)
            return
        raise ValueError(f'INT {number:02X}h / AH={ah:02X}h is not implemented. Use MASM/TASM + Turbo Debugger for DOS/BIOS services.')

    def instruction(self, address=None):
        address = self.pc() if address is None else address
        instructions = list(self.decoder.disasm(self.read(address, min(15, MEMORY_SIZE - address)), address, count=1))
        if not instructions: raise ValueError(f'Cannot decode instruction at {address:#x}.')
        return instructions[0]

    def step(self):
        if self.ended: return
        instruction = self.instruction()
        if instruction.mnemonic in ['hlt', 'in', 'out', 'insb', 'insw', 'outsb', 'outsw']: raise ValueError(f'{instruction.mnemonic.upper()} requires hardware semantics outside this preview. Use DOSBox-X.')
        cs, ip, sp = self.reg('CS'), self.reg('IP'), self.reg('SP')
        try:
            self.u.emu_start(self.pc(), MEMORY_SIZE, count=1)
            if instruction.mnemonic in ['call', 'lcall']:
                self.call_frames.append(((cs << 4) + ((ip + instruction.size) & 0xFFFF), sp))
            elif instruction.mnemonic in ['ret', 'retf'] and self.call_frames:
                self.call_frames.pop()
        except Exception as error:
            self.u.reg_write(REGS['CS'], cs);self.u.reg_write(REGS['IP'], ip);self.last_exception = str(error);raise

    def close(self):
        self.cancelled, self.running = True, False
        if self.build and self.build.name.startswith('8086-lab-'): shutil.rmtree(self.build, ignore_errors=True)
        self.build = None
