'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./runtime');
const {selectBuild}=require('./selection');
const {isDeepStrictEqual}=require('node:util');

function activate(context) {
  const output = vscode.window.createOutputChannel('8086 Lab');
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => {
    if (session.type === '8086-lab') vscode.commands.executeCommand('workbench.view.debug');
  }));
  const config = () => vscode.workspace.getConfiguration('8086lab');
  const python = () => config().get('runtimePythonPath') || runtime.runtimePython(context.globalStorageUri.fsPath);
  async function checkPython() {
    const result = await runtime.run(python(), ['-c', 'import sys,unicorn,capstone; assert sys.version_info >= (3,10); assert unicorn.__version__ == "2.1.4"; assert capstone.__version__ == "5.0.6"; print(sys.executable)'], {timeout: 10000});
    output.appendLine(`Python runtime: ${result}`);
  }
  async function setup() {
    runtime.validatePlatform();
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before setting up or debugging.');
    if (config().get('runtimePythonPath')) {await checkPython();vscode.window.showInformationMessage('8086 Lab: existing runtime is ready.');return;}
    await fs.promises.mkdir(context.globalStorageUri.fsPath, {recursive: true});
    await vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: '8086 Lab: preparing Python runtime'}, async () => {
      const base = config().get('pythonPath') || 'python';
      const args = path.basename(base).toLowerCase().replace(/\.exe$/, '') === 'py' ? ['-3'] : [];
      output.appendLine('Creating an isolated Python environment…');
      await runtime.run(base, [...args, '-m', 'venv', path.join(context.globalStorageUri.fsPath, 'python')]);
      output.appendLine('Installing pinned Unicorn and Capstone dependencies from PyPI…');
      await runtime.run(python(), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', context.asAbsolutePath('requirements.txt')], {timeout: 300000});
      await checkPython();
    });
    vscode.window.showInformationMessage('8086 Lab runtime is ready. Select an assembler/emulator in MASM/TASM, then debug an ASM file.');
  }
  async function environment(launch = {}) {
    runtime.validatePlatform();
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before debugging.');
    await checkPython();
    const dependency = vscode.extensions.getExtension('xsro.masm-tasm');
    if (!dependency) throw new Error('Install the required MASM/TASM extension: xsro.masm-tasm.');
    const resource = launch.program && !launch.program.includes('${') ? vscode.Uri.file(launch.program) : vscode.window.activeTextEditor?.document.uri;
    const masm = vscode.workspace.getConfiguration('masmtasm', resource);
    const selection = selectBuild(masm.get('ASM.assembler'), masm.get('ASM.emulator'), dependency.extensionPath);
    // Custom project scripts need their own artifact mapping; never silently use another compiler.
    if (resource?.scheme === 'file') {
      let dir=path.dirname(resource.fsPath);
      while(true){
        if(fs.existsSync(path.join(dir,'dosasm.jsonc')))throw new Error('Custom dosasm.jsonc workflows are not supported by the source debugger yet. Use a built-in single-file action or MASM/TASM Debug ASM.');
        const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
      }
    }
    const defaults=dependency.packageJSON.contributes.configuration.properties['masmtasm.ASM.actions'].default;
    const action=masm.get('ASM.actions')?.[selection.assembler];
    if(action && !isDeepStrictEqual(action,defaults[selection.assembler]))throw new Error('Custom MASM/TASM build actions need a dedicated mapping adapter. Restore the built-in action for source debugging.');
    const tasmDirectory = launch.tasmDirectory || config().get('tasmDirectory') || '';
    if(tasmDirectory && selection.assembler!=='TASM')throw new Error('Clear 8086lab.tasmDirectory to follow the selected MASM compiler.');
    if(!tasmDirectory && !fs.existsSync(selection.assemblerBundle))throw new Error('The selected assembler bundle is missing from MASM/TASM.');
    let dosboxPath='';
    if(selection.buildBackend.startsWith('jsdos')){
      if(!fs.existsSync(selection.jsdosEngine))throw new Error('The MASM/TASM js-dos runtime is missing.');
    }else{
      const setting=selection.buildBackend==='dosbox'?'command.dosbox':'command.dosboxX';
      const override=launch.dosboxPath || (selection.buildBackend==='dosbox-x'?config().get('dosboxPath'):'');
      dosboxPath=runtime.dosboxPath(override || runtime.executableFromCommand(masm.get(setting)),selection.buildBackend);
    }
    output.appendLine(`MASM/TASM selection: ${selection.selectedAssembler} → ${selection.assembler} / ${selection.buildBackend}`);
    return {...selection,dosboxPath,tasmDirectory,nodePath:process.execPath,jsdosRunner:context.asAbsolutePath('src/jsdos-build.cjs'),buildRoot:config().get('buildDirectory') || ''};
  }
  function command(name, fn) {
    context.subscriptions.push(vscode.commands.registerCommand(name, async () => {
      try {await fn();} catch (error) {output.appendLine(error.stack || error.message);output.show(true);vscode.window.showErrorMessage(`8086 Lab: ${error.message}`);}
    }));
  }
  command('8086lab.setup', setup);
  command('8086lab.chooseDosbox', async () => {
    const files = await vscode.window.showOpenDialog({canSelectMany: false, filters: {'DOSBox-X executable': ['exe']}, title: 'Select dosbox-x.exe'});
    if (files?.[0]) {await config().update('dosboxPath', files[0].fsPath, vscode.ConfigurationTarget.Global);output.appendLine(`DOSBox-X selected: ${files[0].fsPath}`);}
  });
  command('8086lab.check', async () => {await environment();output.appendLine('Environment checks passed.');output.show(true);});
  command('8086lab.debugFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file' || path.extname(editor.document.fileName).toLowerCase() !== '.asm') throw new Error('Open a local .asm file first.');
    if (!await editor.document.save()) return;
    await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(editor.document.uri), {type: '8086-lab', request: 'launch', name: '8086 Lab: current file', program: editor.document.fileName, stopOnEntry: true});
  });
  command('8086lab.openSample', async () => {
    // Open a user-owned copy, not an editable file inside the installed extension.
    const target = await vscode.window.showSaveDialog({defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || require('node:os').homedir(), 'registers.asm')), filters: {'Assembly': ['asm']}});
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, await vscode.workspace.fs.readFile(vscode.Uri.file(context.asAbsolutePath('samples/registers.asm'))));
    await vscode.window.showTextDocument(target);
  });
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('8086-lab', {
    async resolveDebugConfiguration(folder, launch) {
      try {
        if (!launch.type) launch = {type: '8086-lab', request: 'launch', name: '8086 Lab: current file', program: '${file}', stopOnEntry: true};
        if (!launch.program) throw new Error('Set program to an .asm file.');
        await vscode.workspace.saveAll(false);
        return {...launch, ...await environment(launch)};
      } catch (error) {
        output.appendLine(error.message);
        vscode.window.showErrorMessage(`8086 Lab: ${error.message} Run “8086 Lab: Set Up Python Runtime” and “Check Environment”.`);
        return undefined;
      }
    }
  }));
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('8086-lab', {
    createDebugAdapterDescriptor() {return new vscode.DebugAdapterExecutable(python(), ['-u', context.asAbsolutePath('adapter/main.py')]);}
  }));
}
exports.activate = activate;
