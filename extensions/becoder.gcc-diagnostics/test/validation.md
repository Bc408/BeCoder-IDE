# GCC 16 SARIF 诊断修复验证

2026-09-19，`codex/outStreamFix` 未提交工作区。

## 原因及修正

GCC 16.2.0 拒绝旧的 `-fdiagnostics-format=json`。现在使用 `sarif-stderr`，解析 SARIF 2.1.0 的结果、主位置和关联位置。

后台诊断显式包含诊断专用的轻量 `bits/debugger.h`，同时保留发行 PCH 隔离，避免合法 `debug()` 被误报。Runner、CPH 与 clangd 的职责不变。

实测真实文件的 GCC SARIF 列使用 `cpp_wcwidth` 显示宽度，不能直接当成字节列或 UTF-16 列；无源码片段时的字节回退单独处理。显示宽度使用 GCC 16 分支的 Unicode 17 数据，来源固定到提交 `0b1bd1e984db5e9f9ad94f38014e02e528116a79`。GCC 数据的许可与来源记在 NOTICE、第三方声明及内置组件清单中。

## 最终检查

命令均从仓库根执行：

- `node node_modules/typescript/bin/tsc6 -p extensions/becoder.gcc-diagnostics/tsconfig.test.json`：退出 0。
- `node --test extensions/becoder.gcc-diagnostics/out-test/test/*.test.js`：25/25 通过。
- `pwsh -NoProfile -File scripts/validate-gcc-diagnostics.ps1 -ToolchainRoot C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/data/toolchains/ucrt64`：真实 GCC 矩阵通过。
- `node extensions/becoder.gcc-diagnostics/test/realCompiler.cjs ../VSCode-win32-x64`：实际 CompilerRunner 通过；覆盖未保存内容、中文路径、中文/emoji/Tab/组合字符后的准确 UTF-16 位置、修正后的空结果、合法 debug 和真实类型错误。
- `node node_modules/typescript/bin/tsc6 -p extensions/becoder.gcc-diagnostics/tsconfig.json`：诊断扩展编译通过。
- `node extensions/becoder.gcc-diagnostics/test/runEditorDiagnostics.cjs ../VSCode-win32-x64/BeCoder.exe`：真实扩展宿主通过；确认加载开发扩展，未保存 x 产生 Error 级别的 BeCoder GCC 诊断且范围准确，修正后诊断集合清空。
- `node --test build/lib/test/oiExtensionBoundary.test.ts`：26/26 通过。

真实编辑器测试日志：`.build/runner-validation/gcc-editor-test.log`。未重建完整应用、未覆盖暂存应用扩展、未构建 Setup，也未宣称发布包或项目所有者验收通过。

## 失败历史

先前真实矩阵发现轻量 debugger 头未包含；经授权修正后通过。随后真实 CompilerRunner 发现将显示列当字节列造成中文位置偏移；经授权修正并扩大回归后通过。

编辑器测试第一次仅因 Windows 盘符大小写的断言失败，按已授权的编排错误自修复规则改为大小写不敏感比较，重跑通过。没有放宽诊断位置、严重程度或清除结果的断言。
