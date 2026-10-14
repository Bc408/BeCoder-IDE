# PDF 选区求助实施台账

负责人要求继续推进未实现功能。本批完成正式 PRD/Notebook 设计中的 PDF 文字选区→询问 Beacon→可查看、可移除草稿，不自动发送。整页/PDF 图像与公式模型输入仍是独立缺口，不用文字选区代替。

## 方案与边界

PDF.js 已有唯一 VS Code host API，由现有定制 link service 提供窄消息方法，不再次 acquire。PDF 阅读器维护各打开 panel 的加载版本与选区请求，右键时冻结 textLayer 范围内的选择；通过请求标识和版本返回。关闭/重载清理待请求，读取只使用页面 DOM，不读 backing file、不 OCR、不打开邻接文件。Beacon 通过受保护 PDF 扩展 API 捕获选区，复用自己的草稿、脱敏、预算、当前会话及上下文失效检查。模型工具没有此命令执行入口。

原有只读 PDF、搜索/缩放/链接及 Notebook/代码求助保持；菜单文字中英同步。PDF 扩展与 PDF.js 沿用 Apache-2.0，Beacon 沿用 MIT，不新增依赖。主代理执行、自审，不进行 Git 写操作、不构建应用/Setup、不调用真实付费模型或账号。

## 执行与验证

- [x] PDF 页面冻结选择、host 请求版本/关闭/超时反馈与原生菜单接线。
- [x] Beacon 可信 PDF API→统一草稿，三档、失效、预览和不自动发送。
- [x] 所属构建、host/DOM/Beacon 测试、lint、manifest/本地化、文件清单、文档与 diff 预检和检查；真实 GUI 验收待负责人执行。

命令取所属 package.json、既有 esbuild/Node/jsdom 和主仓 ESLint。所有输入检查存在，测试编译先于测试；开发 RED 单独记录。新测试只模拟 host 通道/DOM，不能冒充真实 Webview 菜单验收。精确命令/退出码在实际运行后补充。

## 当前源码与验证

命令 cwd 为仓库根。源码依据包括 PDF provider/定制 PDF.js link service、Webview preload 的 contextmenu/data-vscode-context 处理，以及 Beacon 现有选区/草稿/预览链路。右键冻结先在 document 上执行，再由 window 上的原生上下文菜单读取 context；不自己绘制菜单或覆盖复制操作。用户主动发送之前不请求模型。

| 精确命令 | 结果 |
| --- | --- |
| `node --test extensions/mathematic.vscode-pdf/test/selection.test.cjs` | 开发 RED exit 1：缺失 host 选区桥；实现后通过 |
| `node --test extensions/mathematic.vscode-pdf/test/selection-dom.test.mjs` | 开发 RED exit 1：缺失 DOM 选区 owner；实现后通过 |
| `node tmp/beacon-context-dev/run-client-tests.mjs attachments` | 开发 RED exit 1：尚无 PDF 草稿命令；实现后旧测试误把 UI 摘要当正文，修正为通过预览验证实际正文后 16/16 |
| `npm --prefix extensions/becoder.beacon run typecheck` | 最终 exit 0 |
| `node tmp/notebook-experience/build-validation.mjs pdf-selection-extensions 120 run compile-oi-extensions` | exit 0，26.759 秒；包含 Beacon/Notebook/PDF 所属检查与生产扩展产物 |
| `npm --prefix extensions/becoder.beacon test` | 最终 exit 0，119/119，14 suites，无跳过 |
| `node --test extensions/mathematic.vscode-pdf/test/selection.test.cjs extensions/mathematic.vscode-pdf/test/selection-dom.test.mjs` | 最终 exit 0，4/4，无跳过；真实 provider 源码在注入 VS Code host 中执行，DOM 用既有 jsdom |
| `node tmp/notebook-experience/pdf-files.mjs` | exit 0；复用 build/lib/extensions.ts 的 VSCE listFiles(None)，runtime source/assets/license 均入清单，测试夹具排除；没有生成应用包 |
| `.\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1` | exit 0；语义另作只读复核 |
| `git diff --check -- .eslint-allowed-javascript-files eslint.config.js extensions/becoder.beacon/package.json extensions/becoder.beacon/l10n/bundle.l10n.zh-cn.json extensions/becoder.beacon/src/extension.ts extensions/becoder.beacon/test/attachments.test.ts extensions/becoder.beacon/test/vscodeMock.ts extensions/becoder.beacon/README.md extensions/becoder.notebook/README.md extensions/mathematic.vscode-pdf resources/oi-defaults/BUNDLED-COMPONENTS.json docs/beacon/implementation-status.md docs/beacon/pdf-selection-plan.md` | exit 0；仅既有 CRLF 提示，无 whitespace 错误；未跟踪文件由所属 lint/语法/文档检查覆盖 |

第一次正式 scoped ESLint exit 1，四个新 Apache 文件被默认 MIT header 规则拒绝；停止该序列后核对原有 PDF 例外，增加仅限这四个文件的 Apache header 登记，重跑最终 exit 0、零诊断。未改其许可证。精确最终 lint：

```powershell
node node_modules/eslint/bin/eslint.js eslint.config.js extensions/mathematic.vscode-pdf/src/extension.js extensions/mathematic.vscode-pdf/src/selectionBridge.js extensions/mathematic.vscode-pdf/assets/main.mjs extensions/mathematic.vscode-pdf/assets/selection.mjs extensions/mathematic.vscode-pdf/test/selection.test.cjs extensions/mathematic.vscode-pdf/test/selection-dom.test.mjs extensions/becoder.beacon/src/extension.ts extensions/becoder.beacon/test/attachments.test.ts extensions/becoder.beacon/test/vscodeMock.ts
```

五个 PDF 运行 JS 文件分别 `node --check` exit 0（extension.js、selectionBridge.js、main.mjs、selection.mjs、定制 viewer.mjs）。Beacon manifest、中文 bundle、组件清单 JSON 解析与菜单命令/中英标题 key 检查 exit 0。发布清单首次只核对 runtime，发现新增 test 夹具会入包；添加 `.vscodeignore` 的 `test/**` 后再核对 runtime 全部保留、tests 为空。

主代理另作只读检查：既有 link/open 策略、PDF 只读选项、单 host API、选区之外不读 DOM 控件、参数不接收任意源路径、请求 nonce/版本/关闭/超时、工作区变化、正文脱敏/预算、无自动发送、内存预览。源码没有改核心模块/层级、样式或进程行为，未重复上一批核心类型/层级/Runner 验证。PDF.js 原有 Apache notices 保留，新 host/DOM 代码同为 Apache-2.0；组件修改说明已同步。不安装依赖、不读学生程序或账号、不进行 Git 写操作、不构建 Windows/Setup，旧应用不能验收本批。
