"""Compiler/backend dispatch. SPDX-License-Identifier: GPL-2.0-or-later."""
import json, os, pathlib, re, shutil, subprocess, zipfile
PRESETS = {
 'TASM': ('tasm', ['TASM.EXE','TLINK.EXE'], ['tasm /zi /l MAIN.ASM > BUILD.LOG','if errorlevel 1 goto done','tlink /v MAIN.OBJ >> BUILD.LOG']),
 'MASM-v5.00': ('masm', ['MASM.EXE','LINK.EXE'], ['masm MAIN.ASM,MAIN.OBJ,MAIN.LST; > BUILD.LOG','if errorlevel 1 goto done','link MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG']),
 'MASM-v6.11': ('masm', ['ML.EXE','LINK.EXE','DOSXNT.EXE'], ['ml /c /FlMAIN.LST MAIN.ASM > BUILD.LOG','if errorlevel 1 goto done','link /MAP MAIN.OBJ,MAIN.EXE,MAIN.MAP; >> BUILD.LOG'])
}
def build_program(build, args):
 assembler=args.get('assembler','TASM')
 if assembler=='MASM':assembler='MASM-v6.11'
 if assembler not in PRESETS:raise ValueError('Unsupported assembler: '+assembler)
 folder,required,commands=PRESETS[assembler]
 tools=build/'tools';tools.mkdir()
 configured=args.get('tasmDirectory')
 if configured:
  if assembler!='TASM':raise ValueError('tasmDirectory only applies when TASM is selected.')
  for p in pathlib.Path(configured).iterdir():
   if p.is_file():shutil.copy2(p,tools/p.name)
 else:
  bundle=pathlib.Path(args.get('assemblerBundle') or args.get('tasmBundle',''))
  if not bundle.is_file():raise ValueError('Selected assembler bundle is missing: '+assembler)
  with zipfile.ZipFile(bundle) as archive:
   for info in archive.infolist():
    name=pathlib.PurePosixPath(info.filename)
    if name.parts and name.parts[0].lower()==folder and not info.is_dir():
     if len(name.parts)!=2 or not re.fullmatch(r'[A-Za-z0-9_.-]+',name.name) or info.file_size>4*1024*1024:raise ValueError('Unsafe compiler bundle entry.')
     (tools/name.name).write_bytes(archive.read(info))
 existing={p.name.upper() for p in tools.iterdir()}
 if not set(required)<=existing:raise ValueError('Selected bundle is missing compiler/linker files: '+assembler)
 backend=args.get('buildBackend','dosbox-x')
 if backend not in ['dosbox','dosbox-x','jsdos','jsdos-x']:raise ValueError('Unsupported emulator: '+backend)
 batch=['@echo off',*commands,':done','echo DONE > DONE.TXT'] + (['exit'] if backend in ['dosbox','dosbox-x'] else [])
 (build/'BUILD.BAT').write_text('\r\n'.join(batch)+'\r\n',encoding='ascii')
 if backend in ['jsdos','jsdos-x']:
  job=build/'BUILD.jsdos'
  conf='[cpu]\ncycles=20000\n[autoexec]\nmount c .\nc:\npath c:\\tools\nBUILD.BAT\n'
  with zipfile.ZipFile(job,'w',zipfile.ZIP_DEFLATED) as archive:
   for p in [build/'MAIN.ASM',build/'BUILD.BAT',*tools.iterdir()]:archive.write(p,p.relative_to(build).as_posix())
   archive.writestr('.jsdos/dosbox.conf',conf)
  metadata={'engine':args['jsdosEngine'],'backend':backend,'bundle':str(job),'output':str(build/'RESULT.zip')}
  config=build/'job.json';config.write_text(json.dumps(metadata),encoding='utf-8')
  env=os.environ.copy();env['ELECTRON_RUN_AS_NODE']='1'
  run=subprocess.run([args['nodePath'],args['jsdosRunner'],str(config)],env=env,timeout=60,capture_output=True,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  if run.returncode:raise ValueError('js-dos build failed: '+run.stderr[-3000:])
  with zipfile.ZipFile(build/'RESULT.zip') as archive:
   for name in ['MAIN.EXE','MAIN.LST','MAIN.MAP','BUILD.LOG']:
    found=next((n for n in archive.namelist() if n.upper()==name),None)
    if found:(build/name).write_bytes(archive.read(found))
 else:
  executable=pathlib.Path(args.get('dosboxPath',''))
  if not executable.is_file():raise ValueError('Selected DOSBox executable was not found.')
  conf=build/'BUILD.CONF'
  conf.write_text('[sdl]\noutput=surface\n[cpu]\ncore=normal\ncycles=fixed 20000\n[autoexec]\nmount c "'+str(build)+'"\nc:\npath c:\\tools\nBUILD.BAT\nexit\n',encoding='ascii')
  switches=['-nopromptfolder','-noconsole'] if backend=='dosbox-x' else []
  subprocess.run([str(executable),'-conf',str(conf),*switches],cwd=str(build),timeout=45,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 return assembler
