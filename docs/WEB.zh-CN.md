# 网页适配（0.5 本地候选）

网页适配只由 `browser` 入口加载，并检查 `vscode.env.uiKind === UIKind.Web`。桌面 `main` 入口继续使用原来的文件、编译及调试方式。此分支未替换市场 0.4。

## 使用

1. 在 vscode.dev 或 github.dev 打开可写的汇编工作区，并信任工作区。
2. 安装支持网页的 MASM/TASM 前置扩展和此候选版本。
3. 在 MASM/TASM 状态栏选择 TASM、MASM 5.00 或 MASM 6.11，并选择 jsdos 或 jsdos-x。
4. 打开 ASM，执行 `8086 Lab: Debug Current ASM File`。
5. 程序停在入口。展开 VS Code 调试侧栏的 Registers、Flags、Data、Stack；使用 F10、F11、F9、F5 控制调试。

网页端保留一个 8086 Lab 运行面板。隐藏面板不会停止调试；关闭面板会结束会话。用户无需安装本机解释器或 DOSBox。

## MASM 适配

汇编器和模拟器设置按源码资源读取，每次启动重新读取。MASM 别名仍对应 6.11。编译器从已安装 MASM/TASM 的对应 .jsdos 包读取，不分发专有汇编器。

源码通过 `workspace.fs` 读取，包含相对 INCLUDE、UTF-8/GBK/CP437 和虚拟 URI。临时文件位于浏览器内存，输出 EXE、MAP、LST 后复用桌面版 CPU、表达式和 DAP 实现。源码定位映射回原来的工作区 URI。

网页选择外部 dosbox/dosbox-x、本机汇编器目录、自定义 ASM.actions 或 dosasm.jsonc 时明确提示，不静默切换构建工具。编译超时为 60 秒。普通端口、完整 DOS/BIOS、复杂宏及独立多模块链接仍沿用 0.4 的限制。

## 开发验证

```powershell
npm ci
npm test
npm run build:web
$env:MASM_EXTENSION = '已安装的 xsro.masm-tasm 扩展目录'
npm run test:web:runtime
npm run test:web:host
```

测试用 Edge 可由 `EDGE_PATH` 指定。运行页面内没有 Node.js 或 Python；上述 Node 命令仅为开发测试工具。

浏览器运行矩阵：三种汇编器 × jsdos/jsdos-x × registers/com/segments-copy，共 18 项，核验真实编译、源码定位、单步、变量及退出值。另有虚拟文件、目录隔离、INCLUDE 边界和 GBK 回归。最终网页宿主验收结果见 VALIDATION。

js-dos 平台适配针对 MASM/TASM 2.2.1 的资源布局，布局改变会明确失败。浏览器必须允许 WebAssembly 和工作区访问。GitHub Codespaces 有远程 Node 扩展宿主，入口选择与纯 vscode.dev 不同，本候选不宣称已支持所有远程宿主。
