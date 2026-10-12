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
