# 候选版验证记录

日期：2026-10-12。版本：0.2.0。系统：本机 Windows x64。

## 已通过

- 18 项 Python 核心/DAP 测试：真实指令加法、堆栈、标志位、间接 CALL、RET 参数清栈、step out、异常位置、端口操作拒绝、安全表达式、寄存器范围、内存范围、源码映射、MZ 重定位、断点归属、条件断点拒绝、继续/暂停、数据编辑、反汇编与未知请求错误。
- 3 项 JavaScript 运行环境测试：可执行文件解析、PATH 查找与不支持平台错误。
- 实际 TASM 4.1 + TLINK 7.1.30.1 + DOSBox-X 2026.10.01 集成测试：样例编译、源码行定位、AX=8/BX=3、PUSH/POP、ZF=1、RESULT=8、输出与退出。
- npm audit：已更新打包工具为 @vscode/vsce 4.0.0，扫描结果 0 个漏洞。
- 官方 vsce 打包成功；包声明 `xsro.masm-tasm` 为依赖。
- VSIX 内容检查：不包含 EXE、DLL、Python wheel、访问令牌或本机固定路径的运行源码。
- 独立 VS Code 配置文件 `8086-Lab-QA`：安装候选版，执行首次 Python runtime setup；使用新建私有运行环境启动样例，F10 后左侧寄存器随执行变化。

## 验证边界

- 独立配置文件测试仍在同一台电脑完成，不等于另一台全新 Windows 的首次使用验证。
- GitHub 工作流尚未提交到远程仓库，未在 GitHub Actions 服务上执行。
- 尚无真实 Marketplace publisher，未上传市场、未核验市场名称唯一性。
- 已验证样例与测试覆盖范围；并非对完整 8086 指令集、所有 DOS/BIOS 服务或硬件时序的认证。

正式发布前：绑定真实 publisher/仓库，完成新电脑安装验收，运行远程 CI，再提交实际市场包。
