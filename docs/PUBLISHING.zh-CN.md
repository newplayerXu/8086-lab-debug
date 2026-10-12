# GitHub 托管与 Microsoft Marketplace 发布

记录日期：2026-10-12。版本 0.2.0 已于本日提交 Marketplace。真实发布者为 `newplayerxu`，源码仓库为 https://github.com/newplayerXu/8086-lab-debug 。提交后最后确认状态为 Verifying，公开可安装状态待核验。

## 一份源码，两种分发

```text
GitHub 源码仓库
  ├─ push / PR → 检查、单元测试、生成测试 VSIX
  └─ 手动 Release workflow → 写入真实 publisher、生成 VSIX、创建 GitHub 预发布
                                               └─ 下载同一 VSIX → 上传 Microsoft Marketplace
```

GitHub 管理源码、Issues、版本历史和 Release 下载。Marketplace 管理 VS Code 安装、市场版本和更新。向 GitHub 推送代码不会自动改变已上架的 Marketplace 版本。

工作流没有保存或使用 Marketplace PAT。首次发布建议在市场管理网页上传 VSIX；后续可以继续上传同一构建产物，或另行配置身份认证的自动发布。

## 1. 注册 Microsoft 发布者

1. 准备 Microsoft 账号。GitHub 源码账号与 Marketplace 发布者是两个身份。
2. 打开 [Visual Studio Marketplace 发布者管理页](https://marketplace.visualstudio.com/manage/publishers/)，使用 Microsoft 账号登录。
3. 点击 **Create publisher**。
4. 填写 **ID** 与 **Name**。ID 是扩展标识和网址的一部分，创建后不能更改；Name 是显示名称。
5. 点击 **Create**，保存真实 publisher ID。

普通发布者与“Verified Publisher”域名验证徽章是不同流程；徽章不是首次发布的必要条件。注册及 VSIX 上传依据 [Microsoft 官方发布指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。

## 2. 建立 GitHub 仓库

推荐仓库名：`8086-lab-debug`。公开分发时采用公开仓库，方便获取 GPL 源码与版本记录。

在 GitHub 创建空仓库，不额外生成 README 或 LICENSE。随后在本工程目录执行：

```powershell
git init -b main
git add .
git commit -m "Prepare 8086 Lab debugger preview"
git remote add origin https://github.com/YOUR_ACCOUNT/8086-lab-debug.git
git push -u origin main
```

将 `YOUR_ACCOUNT` 换为 GitHub 用户名。工程已初始化 Git 时跳过 `git init`。认证通过 Git 的登录窗口或 GitHub CLI 完成，不将令牌放进源码或聊天。

仓库中不应出现 `node_modules`、Python 虚拟环境、TASM/TLINK、DOSBox-X、访问令牌或用户项目。提交前执行 `git status --short` 检查。

## 3. 绑定真实发布者和仓库

```powershell
node scripts/prepare-release.js --publisher YOUR_PUBLISHER_ID --repository YOUR_ACCOUNT/8086-lab-debug
npm install --package-lock-only
```

脚本更新 `package.json` 的 publisher、仓库、主页与 Issues 链接；不注册账号、不推送、不发布。

`publisher + name` 组成扩展 ID，例如 `yourpublisher.8086-lab-debug`。后续保持这两个值不变。市场要求名称与显示名称满足唯一性；首次提交若提示重名，应调整后重新打包。

```powershell
git add package.json package-lock.json
git commit -m "Configure Marketplace publisher and GitHub repository"
git push
```

## 4. 本地验收与打包

0.4 起只需要 Node.js 22+，不需要 Python：

```powershell
npm ci
npm test
npm audit --audit-level=high
npx vsce package --target win32-x64 --out 8086-lab-debug.vsix
```

另按 [开发说明](DEVELOPMENT.md) 使用本地 TASM/DOSBox-X 运行真实编译集成测试。GitHub CI 不包含专有编译器，不能替代这项验证。

在干净 VS Code 配置文件安装 VSIX，走 README 的首次使用流程。检查源码单步、断点、变量编辑、异常暂停、停止与重启。当前仍需另一台新电脑首次使用验收。

## 5. GitHub 自动检查

`.github/workflows/ci.yml` 在 push、pull request 或手动启动时执行 Windows/Ubuntu 单元测试、npm 审计、Windows x64 VSIX 打包，并上传 Actions artifact。

Ubuntu 单元测试通过不表示支持 Linux 调试；产品目前只声明 Windows 桌面支持。

## 6. 创建 GitHub Release

1. 仓库 **Settings → Secrets and variables → Actions → Variables** 新建 `MARKETPLACE_PUBLISHER`，值为真实 publisher ID。这不是密码。
2. 确认 `package.json` 版本未发布过。
3. **Actions → Create GitHub release VSIX → Run workflow**，选择发布分支并运行。
4. 工作流测试、打包，创建 `v版本号` GitHub prerelease 并附 VSIX。
5. 下载 Release 中的 `8086-lab-debug.vsix`。

工作流用当前任务的 `GITHUB_TOKEN` 创建 Release，不含 Marketplace 凭据。重复标签会失败。手动触发会公开 GitHub 预发布。publisher 从仓库变量写入构建工作区，不自动提交 package.json；核对本地包与市场包的身份一致。

## 7. 首次上架 Microsoft Marketplace

1. 登录 [发布者管理页](https://marketplace.visualstudio.com/manage/publishers/)，选择发布者。
2. 选择新增扩展的 **Visual Studio Code** 入口，上传已验证的 VSIX。
3. 核对 publisher、名称、版本、README 与依赖。
4. 提交并查看验证状态。上传成功不等于已公开可安装。
5. 市场可用后，在另一份 VS Code 配置文件按真实扩展 ID 安装验收。

网页上传 VSIX 是官方支持的方式。`preview: true` 是预览标记，与市场独立的 pre-release 安装渠道不同。工作流生成带预览标记的普通 VSIX；GitHub Release 则标为 prerelease。

## 8. 后续更新

1. 修改代码，提交 GitHub PR。
2. CI、本地真实编译与 VS Code 验收通过。
3. 更新 CHANGELOG。
4. 执行 `npm version patch --no-git-tag-version`；较大变更可使用 `minor`。提交版本与 lockfile。
5. 合并发布分支，手动运行 Release workflow。
6. 下载新 VSIX，在 Marketplace 管理页更新同一个扩展。
7. 市场发布可用后，用户可通过 VS Code 扩展更新获取新版；时间取决于客户端设置和市场状态。

## 9. 以后需要自动发布时

官方目前推荐 Microsoft Entra ID 自动化认证，并说明 Azure DevOps 全局 PAT 于 **2026-12-01** 退役。不把长期流程建立在即将退役的全局 PAT 上。

现阶段使用“GitHub 生成包 → 市场网页上传”。需要无人值守时按 [官方自动发布说明](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#automated-publishing) 配置 Azure DevOps / Entra 工作负载身份；GitHub 继续托管代码。认证确认后再增加市场发布任务。

## 10. 尚未完成的外部步骤

- 注册并提供真实 publisher ID。
- 创建并提供 GitHub 仓库地址。
- 新电脑首次使用验收。
- 实际市场名称唯一性验证。
- 选择公开发布时间。

这些步骤未完成前，候选包可以本地安装，但 `local8086` 占位包不是已注册的市场扩展。
