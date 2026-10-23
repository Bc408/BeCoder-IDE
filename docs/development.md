# 开发指南

[文档目录](README.md) · [仓库规则](../AGENTS.md)

## 工程入口

BeCoder 是 Code - OSS 的 Windows 产品分支。核心 TypeScript 位于 `src/vs/`；内置扩展位于 `extensions/`；构建脚本位于 `build/` 与 `scripts/`；发行资产位于 `resources/`。产品版本以根 `package.json` 为准，扩展 API 版本以 `product.json` 为准，不将内核版本当作 BeCoder 发行版本。

开始前完整阅读 [AGENTS.md](../AGENTS.md) 与 [VISION.md](../VISION.md)。涉及 Beacon / NoteBook 时，再阅读[正式文档入口](beacon/README.md)及对应模块。负责人最新决定优先；当前代码、正式需求与运行验收分别记录。

## 准备环境

在 Windows 上使用 PowerShell，安装与 [.nvmrc](../.nvmrc) 一致的 Node.js（当前为 24.17.0）。原生模块编译需要 Python 与 Visual Studio C++ 构建工具；Electron 目标由 [.npmrc](../.npmrc) 固定，不随意切换为系统 Node ABI。

```powershell
npm ci
```

工具链归档由 Git LFS 管理，获取源码时应一并取回；保留 [resources/oi-defaults](../resources/oi-defaults/BUNDLED-COMPONENTS.json) 中的版本、来源、哈希及许可证记录。不要把本机解压工具链当作源文件提交。

## 修改与检查

优先运行归属模块的检查，使用根 `package.json` 或扩展 `package.json` 已定义的命令。例如 Beacon：

```powershell
npm --prefix extensions/becoder.beacon run vscode:prepublish
npm --prefix extensions/becoder.beacon test
npm --prefix extensions/becoder.beacon run test-render
npm --prefix extensions/becoder.beacon run lint
```

渲染测试使用生产 Webview 与模拟宿主，不调用真实模型账户。测试通过不代表真实服务或完整桌面验收通过。修改 UI 时应检查渲染截图；修改后按影响重跑对应检查。

完整 Windows 源码验证与 staged 应用构建按以下顺序进行：

```powershell
npm run typecheck-client
npm run compile-oi-extensions
npm run gulp vscode-win32-x64-min
```

类型检查与扩展编译的单次外部超时为 120 秒，staged 构建为 300 秒。构建将写入仓库同级的 `VSCode-win32-x64` 目录，先保存并关闭在该目录运行的 BeCoder。只做文档修改时，使用文档检查即可，不为此默认重建应用。

不要用 `npm run compile` 代替类型检查。失败或超时的命令必须查明并记录，修复后重跑受影响检查；旧结果不能替代新源码的验证。生成目录（如 `out/`、`.build/`）由构建维护，不直接编辑或提交。

## 本地调试与打包

Windows 开发入口为 `scripts/code.bat`。确需桌面验证时使用独立用户数据目录，避免影响日常实例；启动前确认所需编译输出已准备好。

staged 应用构建、包内容验证、Setup 构建和真实运行验收是不同步骤。仅请求构建时，成功后交付产物，不自动扩展到清理、Setup、启动应用或 Git 发布。完整发行的命令与边界见[发行维护](distribution.md)及 [AGENTS.md](../AGENTS.md)。

## 文档与贡献

默认入口为中文 [README.md](../README.md)，英文入口为 [README.en.md](../README.en.md)。使用细节写在归属指南，功能状态写在实现状态，正式需求写在对应规范；不要在多个入口复制实施日志。

修改文档后运行：

```powershell
powershell -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1
```

同时检查本地链接、已删除文档的引用及 `git diff --check`。结构检查不代替语义核对。

通过 [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues) 提交问题或建议。提交代码时保持改动聚焦，使用 Conventional Commit 风格主题；PR 说明行为变化、验证结果与限制，UI 变更附截图。许可证和原作者声明随组件保留，新增素材应记录来源与许可。
