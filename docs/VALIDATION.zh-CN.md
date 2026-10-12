# 0.4.0 发布验收

2026-10-12，Windows x64，开发 Node 24.16.0；VS Code 8086-Lab-QA 内实际使用自带 JavaScript 运行时。

- JavaScript/WASM CPU、DAP、表达式、重定位、内存、断点、调用与暂停回归：16 项通过。
- 16 类格式 × 3 种汇编器 × jsdos/jsdos-x/DOSBox-X：144 组实际编译调试通过。
- 寄存器教程与教材显式分段复制程序 × 同一汇编器/后端矩阵：18 组通过。
- 格式包括 tiny/small/medium/compact/large/huge、显式 COM、GROUP、多个代码段/远调用、简单宏、参数宏、INCLUDE、startup/exit、tiny startup、裸 ORG 100H、tiny 独立数据段。
- 单步核验源码定位、寄存器、栈、标志、变量、DOS 输出和退出值。
- VSIX 解压到独立目录，PATH 清空，编译与调试通过；拦截子进程确认未调用 Python/pip。包内无 Python 适配器、requirements 或解释器。
- VS Code 无 Python 配置启动 MASM 5.00 / jsdos-x，停在入口；十次 F10 后 CX=8、RESULT=8、ZF=1，源码在 NOP 行。
- 中文构建目录 + COM 示例在 jsdos/jsdos-x 通过。
- npm audit：0 漏洞。
- 微基准：本机 10000 次 JMP 自循环单步约 168 ms；不代表所有程序速度或完整 DOS 性能。

## 修复要点与限制

WASM 单步同时限制翻译终点与执行次数，避免长零填充分支译码越界。tiny 变量优先按 MAP 段地址加 LST 段内偏移，避免未链接的 DGROUP 偏移误读。MASM 5.00 tiny 的临时 ASSUME/GROUP 兼容不修改用户源文件。COM 要求入口 0000:0100、无段重定位；EXE 使用 MZ 头和重定位。

未实测普通外部 DOSBox，因为本机未安装；其选择分发已覆盖。另一台新电脑未实际验收。DOS 服务仍为教育子集，端口/时序/完整 BIOS、独立多模块链接、复杂宏元编程和自定义构建需后续适配。上游 MASM/TASM 2.2.1 引擎布局仍有版本耦合。

以下为历史版本记录，其旧限制不代表 0.4 当前行为。

---

# 0.3.0 验证记录

2026-10-12，本机 Windows x64。

- Python 18 项核心/DAP 回归通过。
- JavaScript 5 项测试通过，覆盖四种汇编器选择 × 四种模拟器选择的分发及未知选择错误。
- 实际 TASM、MASM 5.00、MASM 6.11 × jsdos、jsdos-x、DOSBox-X，共 9 组编译/调试集成测试通过。
- 每组核验源码入口行、AX/BX 加法、PUSH/POP、CX、ZF、RESULT、源码 NOP 行、DOS 输出和退出。
- MASM 6.11 采用 ML /c /Fl 与 LINK /MAP，不依赖缺失的 CVPACK。
- MASM 数据段未按段落对齐时，变量偏移修正已由真实集成覆盖。
- npm 审计 0 漏洞。
- VS Code 8086-Lab-QA 配置下实际启动 MASM 6.11 / jsdos-x，源码单步和侧栏寄存器正常；从 MASM/TASM 状态栏切换 MASM 5.00 后重启，构建日志确认自动改用 MASM 5.00 / jsdos-x，重新停在源码入口。

## 边界

- 本机没有外部 DOSBox 0.74 可执行文件，普通 dosbox 原生后端尚未实测；命令分发已覆盖，需要安装后验收。
- 新电脑首次使用、跨版本 MASM/TASM、js-dos 上游后续变更尚未验证。
- js-dos 平台适配针对已安装 MASM/TASM 2.2.1 的引擎布局，布局变更会明确失败。
- 自定义构建命令、dosasm.jsonc、多文件和完整 DOS/BIOS 仿真不在此版支持范围。
- 本记录的编译测试只使用本地已有工具，不向 CI 或发行包复制专有编译器。
# 0.3.1 补充验证

2026-10-12：截图中的显式 DATAS/STACKS/CODES、ASSUME、ORG 2000H/3000H、DB、DUP、END START 程序通过实际编译调试。

- TASM、MASM 5.00、MASM 6.11 × jsdos、jsdos-x、DOSBox-X × 数据段在前/代码段在前，两种布局共 18 组全部通过。
- 核验源码入口、SI=2000H、DI=3000H、CX=10、十轮逐条单步、目标十字节 1..10、DAT2 命名变量、退出码 10。
- 数据段在前与代码段在前验证变量地址不依赖段顺序。
- Python 回归增加显式分段、错配 ENDS、缺失入口、错误 ASSUME 和非段落对齐数据地址测试。
- 空 STACKS 段的链接器警告保留；不擅自改变源程序的栈分配或退出值。
