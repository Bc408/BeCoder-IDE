# BeCoder clangd 扩展开发

先读[扩展贡献指南](../CONTRIBUTING.md)及[当前功能与设置](README.md)。本目录是修改后的随包组件，上游独立扩展的市场发布流程不作为 BeCoder 的发行方式。

在本扩展目录使用现有 scripts：

```powershell
npm run check-ts
npm run vscode:prepublish
```

`check-ts` 做 TypeScript 检查，`vscode:prepublish` 先检查再用 esbuild 生成生产 bundle；`npm run compile` 只生成带 source map 的 bundle，既不 typecheck，也不启动 watch。不要为修改此扩展自动运行 `npm install` 或重写 lock。

`npm test` 会先清理本扩展 `out`、编译测试并启动 Electron 测试宿主。只有授权运行且已明确测试宿主时才执行；`BECODER_TEST_EXECUTABLE` 可指定本地匹配的 BeCoder，否则现有测试入口会下载 VS Code 1.130.0，不能将其结果当作当前 BeCoder 的运行验收。普通源码检查不需要启动该测试。

项目整体构建、打包及验收边界见[开发指南](../../docs/development.md)。保留原始版权及上游历史 CHANGELOG；当前产品行为由 README 和源码维护。
