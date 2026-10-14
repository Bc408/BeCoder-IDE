# 已打开 PDF 按需页面读取

2026-10-13；分支 `codex/BeCoder_Next`，文档交接提交 `865c504d0795d7b64dc413756916e17ee36696c5`，工作树含前序实现，不覆盖、不提交。

## 行为与复用

模型使用现有 inspectContext 列出本窗口已打开 PDF 的页数与加载版本，指定物理页码读取文字；默认不灌入整本。所有档位可读打开页面，不能沿页面路径补读文件、打开未打开文档或自动导航。PDF 选区仍加草稿、不自动发送。

复用 PDF.js 6.2.108（Apache-2.0，上游 `7d9b2e0095e602ad274f05bb02fbb4125b30d93f`）的已加载 PDFDocumentProxy、getDownloadInfo/getPage/getTextContent、Worker 和原生换行规则。getDownloadInfo 等待 DataLoaded；worker requestLoadedStream(true) 只等待完整加载，不主动补请求。已加载完成后才能接模型读取。原生用户打开/加载流程保持；不自建 PDF 下载、解析、长期文本缓存或通用 RPC 框架。

扩展维护自身打开 panel 的 opaque id、加载版本与请求；扩展 API 合并进 Beacon 现有 transport。Beacon 仍执行上下文 scope、敏感路径检查、正文脱敏、请求内快照和分页预算。按物理页缓存，关闭/重载后的旧版不返回。隐藏但已打开的阅读器保留原生 Webview 状态，选区入口仍要求当前可见页面。超时/未加载/页码错误提供反馈；扫描页空文字、图像和复杂排版不声称视觉理解。没有 OCR、本批没有图像模型输入。

只改所属扩展源码/测试与事实文档，MIT/Apache 各自保留，无新增依赖、核心 service 重构、Git 写操作、程序运行、账号/模型调用、应用或 Setup 构建。主代理自行审查。GUI 菜单、隐藏页/重载、扫描页真实体验待新构建验收。

## 验证预检与台账

命令 cwd 为仓库根，既有 Node/npm/扩展脚本/ESLint 和文档检查入口已定位；内容检查只包含实际存在普通文件。开发 RED 单独记录，正式失败停止该序列。

- PDF：`node --test extensions/mathematic.vscode-pdf/test/selection.test.cjs extensions/mathematic.vscode-pdf/test/selection-dom.test.mjs`
- Beacon：`node tmp/beacon-context-dev/run-client-tests.mjs context`；`npm --prefix extensions/becoder.beacon run typecheck`；`npm --prefix extensions/becoder.beacon test`
- 所属构建：`node tmp/notebook-experience/build-validation.mjs pdf-pages-extensions 120 run compile-oi-extensions`
- 发布输入清单：`node tmp/notebook-experience/pdf-files.mjs`
- scoped ESLint：本批 PDF extension.js/selectionBridge.js/main.mjs/selection.mjs 与两份测试；Beacon context.ts/contextTools.ts/extension.ts/provider.ts/context.test.ts。
- 文档：`.\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1`；本批 diff whitespace 检查。

## 实际结果与复核

开发 RED：PDF 两个新增行为最初因缺失 readPage/installPdfPageReading 失败（exit 1，既有四项仍通过）；provider 列表测试随后因缺失 listPages 失败。Beacon 开发测试打包因尚未导出 withPdfPages 失败，属于开发阶段缺失源码入口，不计为通过或正式类型结果。实现后两项完整测试均通过。

| 检查 | 最终结果 |
| --- | --- |
| PDF 完整上述 Node 测试命令 | exit 0，6/6，无跳过 |
| Beacon context 定向命令 | exit 0，20/20 |
| Beacon typecheck | exit 0 |
| OI 扩展编译（外部限时 120 秒） | exit 0，20.9 秒，未超时；仅已有 npm 配置警告 |
| Beacon 完整 test | exit 0，120/120、14 suites，无跳过 |
| VSCE source/runtime 文件清单 | exit 0，运行文件和许可证全在，tests 为空；未生成应用包 |
| scoped ESLint（上述 11 个实际文件） | 最终 exit 0，零诊断 |
| main.mjs/selection.mjs 各自 node --check | exit 0 |
| 文档脚本与本批 git diff --check | exit 0 |

scoped lint 精确命令：

```powershell
node node_modules/eslint/bin/eslint.js extensions/mathematic.vscode-pdf/src/extension.js extensions/mathematic.vscode-pdf/src/selectionBridge.js extensions/mathematic.vscode-pdf/assets/main.mjs extensions/mathematic.vscode-pdf/assets/selection.mjs extensions/mathematic.vscode-pdf/test/selection.test.cjs extensions/mathematic.vscode-pdf/test/selection-dom.test.mjs extensions/becoder.beacon/src/context.ts extensions/becoder.beacon/src/contextTools.ts extensions/becoder.beacon/src/extension.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/test/context.test.ts
```

diff 精确输入：`git diff --check -- extensions/becoder.beacon/src/context.ts extensions/becoder.beacon/src/contextTools.ts extensions/becoder.beacon/src/extension.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/test/context.test.ts extensions/becoder.beacon/README.md extensions/mathematic.vscode-pdf resources/oi-defaults/BUNDLED-COMPONENTS.json docs/beacon/implementation-status.md docs/beacon/pdf-pages-plan.md`。未跟踪文件仍由所属 lint/类型/测试/文档脚本覆盖。

主代理另作只读复核：模型使用现有工具/schema/入口，不获得命令执行能力；仅已激活 PDF 扩展交付自己打开的 panel；页码、来源/版本、请求标识、加载完成、跨页快照、关闭/重载、scope、读取前后敏感路径检查均保留。页元数据不注入全文；脱敏在切片之前，正文不沿 URI 重读，隐藏标签不等于已关闭文档。原生脚本/打印/下载/链接策略与选区草稿交互未改。MIT/Apache 来源和组件修改说明已同步。没有改核心 service/DTO/层级，因此未重复核心 typecheck/layers；扩展现有完整类型与构建已覆盖新链路。

这些结果验证 BeCoder 接线与模拟 host/DOM/PDF.js 接口行为，不替代真实 PDF Worker/文件/窗口的运行验收。新应用需验证文字 PDF 页码与输出、隐藏标签、文件修改重载、关闭期间读取、扫描页反馈、三档根外打开页及仍正常的选区草稿。完整 PDF 视觉/公式材料仍未由本批实现。
