# 8086 Lab 0.4.0 缺陷复核与修复

## 范围

复核用户提供的审查清单。修复位于 `codex/web-support` 的共享源码，适用于桌面与保留的网页入口。本记录不表示 Marketplace 已更新；既有 0.4.0 安装和既有 VSIX 没有被覆盖。

| 编号 | 结论 | 处理 |
|---|---|---|
| 1 MAP 空 Class 吞掉下一段 | 确认 | 整行解析；列分隔只允许空格、制表符，兼容 LF/CRLF |
| 2 LST 数字列导致偏移错位 | 确认 | 根据 TASM 清单头选择布局；MASM 强制偏移在前，不再猜测数字前缀 |
| 3 负数十六进制显示 | 确认 | `-1` 显示 `-0x0001 (-1)` |
| 4 AH=09 的 AL 返回值 | 确认 | 返回终止符 AL=24h，保留 AH |
| 4 所有 INT 都应更新 CF | 不能作为通用修复规则 | 按服务定义返回标志；不对字符输出服务统一清 CF |
| 5 旧 Python 设置 | 确认迁移体验问题 | 恢复两个旧设置的定义并标记弃用；值被忽略，不调用 Python |
| 6 检查命令标题 | 当前源码未复现 | 两个命令各自存在；README 补充它们的不同用途 |
| 7 源码游标跨段和回绕 | 风险成立 | 已知段过滤；按段与文件分别推进游标，不回绕已消费行；增加 INCLUDE 返回父文件测试 |

AH=09h 的 AL=24h 来源：[Ralf Brown Interrupt List 原始 Part B](https://www.cs.cmu.edu/~ralf/interrupt-list/inter61b.zip)，INT 21/AH=09 条目。这是实际 DOS 返回行为，原清单也指出部分官方文档写“无返回值”。

## 最小复现：MAP 空 Class

```text
 00000H 00009H 0000AH DATAS
 00010H 00015H 00006H CODES
 00020H 0011FH 00100H STACKS STACK
```

预期：DATAS、CODES、STACKS 均登记；DATAS 与 CODES 的 class 为空；CODES 起始地址为 10h。原正则的 `\s+` 可以越过行尾，错误地消费下一行。

## 最小复现：MASM ADD 偏移

源码：

```asm
CODES SEGMENT
MOV AX,1
ADD AX,0002H
ADD AX,0023H
CODES ENDS
```

用于验证解析的清单行：

```text
 CODES SEGMENT
0000 B8 0001 MOV AX,1
0003 05 0002 ADD AX,0002H
0098 05 0023 ADD AX,0023H
```

预期映射偏移：0、3、98h；不得生成 2 或 23h。0098h 用于单独验证解析器；真实编译用例另有 JMP 与 ORG 0098h，执行时每一步均断言源码位置存在，结果变量必须为 26h。

## 修复前后实测对照

| 项目 | 原代码 | 修复后 |
|---|---|---|
| MAP 段名 | DATAS、STACKS | DATAS、CODES、STACKS |
| 指令偏移 | 0、2、23h | 0、3、98h |

对照使用同一最小输入，原实现来自本次修改前的 Git 提交。

## 复验命令

```powershell
npm test
npm run build:web
# 设置 MASMTASM_RESOURCES 为已安装 MASM/TASM 的 resources 目录。
# 设置 DOSBOX_PATH 为 DOSBox-X 可执行文件路径。
node test/integration-js.cjs jsdos jsdos-x dosbox-x
node test/integration-formats.cjs jsdos jsdos-x dosbox-x
# 设置 MASM_EXTENSION 为已安装 MASM/TASM 扩展根目录。
npm run test:web:runtime
```

后端用例真实调用 TASM、MASM 5.00、MASM 6.11，不使用模拟编译输出。段复制用例额外断言真实 MAP 保留全部三个段。网页测试在浏览器中编译、单步、核对寄存器和退出状态。

本次结果：27 项单元测试、153 项格式组合（17 种格式 × 3 个编译器 × 3 个后端）、18 项桌面样例组合、18 项真实浏览器组合均通过。格式矩阵发现的 INCLUDE 返回问题已修复后重跑；最终 TASM 列分隔收紧后再次完成单元测试、桌面样例和浏览器组合验证。

既有 `0.5.0-web-candidate.vsix` 生成于本次修复之前，不包含这些修改。安装包与市场版本需要后续单独构建、验证和发布。

## 保留边界

段内没有显式段声明的 INCLUDE 文件仍需继承清单上下文。对于多个 INCLUDE 文件中完全相同的指令、复杂条件汇编或重复包含，仅凭指令文本无法保证唯一来源；本次不宣称所有汇编器清单语法都已覆盖。

用户审查中已排除的 `.obsolete`、数据符号正确性，以及用户自行修复的演示程序宏错误，均未作为插件缺陷修改。
