# Notebook input 与图片体验实施及历史验证台账

当前实现以[正式设计](notebook.md)、[类型/UI 台账](notebook-ui-plan.md)和[渲染清理台账](render-review-plan.md)为准。旧格式/图片迁移的失败与通过记录仅说明过去的测试时点；相关能力已移除。

## input 改名目标纠错台账（2026-10-13）

命令来源与预检：Notebook package.json 的 typecheck/build/test、已存在的 `node_modules/eslint/bin/eslint.js`；TypeScript/esbuild/config、三个普通源码/测试文件均存在。没有新运行依赖、核心模块、样式或进程改动，仅执行所属检查，不构建 Windows/Setup、不启动 GUI、不进行 Git 写操作。生产调用链只读复核包含原生工具栏、扩展宿主参数转换、改名命令、原生 metadata 编辑与 serializer。

| 精确命令 | 结果与范围 |
| --- | --- |
| `npm --prefix extensions/becoder.notebook run build`（开发 RED 夹具） | exit 0；尚无目标解析函数，测试 bundle 明确警告该 export 不存在 |
| `node --test --test-name-pattern='input commands' extensions/becoder.notebook/dist-test/model.test.cjs` | exit 1；2 项预期失败，缺少点击目标解析，不是编排失败；修正后才开始最终验证 |
| `npm --prefix extensions/becoder.notebook run typecheck` | 最终 exit 0 |
| `npm --prefix extensions/becoder.notebook run build` | 最终 exit 0，无诊断 |
| `npm --prefix extensions/becoder.notebook test` | 最终 exit 0，21/21，无跳过 |
| `node node_modules/eslint/bin/eslint.js extensions/becoder.notebook/src/model.ts extensions/becoder.notebook/src/extension.ts extensions/becoder.notebook/test/model.test.ts` | 最终 exit 0，零诊断 |

回归覆盖点击 B 而选中 A、命令面板选区回退、目标调序/删除/关闭、非 input 与其他类型 Notebook；直接测试真实目标解析。取消名称输入继续走原生返回，异步 editable 返回后再次核对目标，使用最新 metadata，均经主代理只读检查；没有声称 Node 夹具验证了真实工具栏、提示框或 WorkspaceEdit 交互。最新源码未进入先前应用包。

> 2026-10-13 后续清理决定：开发期旧格式、input/图片迁移和安装级旧聊天导入不再支持；删除独立选图插入按钮/命令，保留原生 Markdown 图片粘贴。下文此前的迁移任务及结果为历史记录，不再是当前承诺。

后续清理验证台账：开发 RED `node --test --test-name-pattern='development formats' extensions/becoder.notebook/dist-test/model.test.cjs` exit 1（version 1 未拒绝），修改后 Notebook 全 suite exit 0（19/19）。Notebook typecheck/build exit 0；`npm run typecheck-client` exit 0（120秒外部限制）；`npm run compile-oi-extensions` exit 0（120秒外部限制）；`npm --prefix extensions/becoder.beacon test` exit 0（113/113）。静态检查输入只含普通现存文件，已删除 historyStore/core旧测试不传给内容检查器。7份 JSON 解析、文档结构脚本及 scoped git diff --check exit 0。源码编辑脚本首次因 Python 默认 GBK 读取中文 JSON 失败，属于编辑编排错误；改为明确 UTF-8 后继续完成，未把该失败作为验证结果。

清理 scoped ESLint 精确命令（exit 0，零诊断）：

```powershell
node node_modules/eslint/bin/eslint.js extensions/becoder.notebook/src/model.ts extensions/becoder.notebook/src/edits.ts extensions/becoder.notebook/src/images.ts extensions/becoder.notebook/src/extension.ts extensions/becoder.notebook/src/editApi.ts extensions/becoder.notebook/build.mjs extensions/becoder.notebook/test/model.test.ts extensions/becoder.beacon/src/extension.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/test/files.test.ts extensions/becoder.beacon/webview/Workspace.tsx src/vs/workbench/contrib/becoder/common/beCoderNotebook.ts
```

主代理另作只读复核：迁移/导入/选图调用链和专用依赖已移除；当前格式校验、ID、附件粘贴、输出与完整备份仍有消费者和测试。未改变 Runner/native helper、核心执行入口或层级依赖，未重复相关既有验证，也不构建发行包。当前旧全局存储的读取排除是会话隐私边界，保留，不能当成迁移功能删除。

> For agentic workers: use executing-plans inline. 项目负责人已直接授权实施；依照 AGENTS.md 不启动子代理、不进行 Git 写操作。

**Goal:** 独立 input 单元格承接用户执行、状态及最近结果；图片采用原生附件短引用。

**Architecture:** 保留 Code-OSS 原生 Notebook 文档与编辑器。Runner 接收冻结的代码/input，Notebook 只允许 input 身份执行。图片 bytes 随单个 `.bcnb` 保存，Markdown 正文不含新插入图片的 base64。

**Spec:** 负责人最新决定已同步 `notebook.md`：独立 `becoder-input` 原生单元格；输出不分 stdout/stderr，debug 库自身 ANSI 着色；已认可附件路线。

## Global Constraints

- 当前分支 codex/BeCoder_Next，HEAD 865c504d0795d7b64dc413756916e17ee36696c5；保留已有未提交改动。
- Notebook 独立于 Beacon；不改学生源文件，不调用模型/账号，不安装依赖，不构建发行包或操作 Git。
- 复用原生 dirty/undo/save、工作区 trust、改写/运行交接；不添加失败回滚系统。
- 每次使用最新未保存代码/input；旧结果不冒充新验证；结果按 input 保存。
- 移植或打包 Microsoft MIT 代码时保留声明；新增 BeCoder 代码 GPL-3.0-or-later。

## Review Focus

- 当前独立 input 各自保留最近实际结果，不模拟结果、不迁移旧开发格式。
- 移动/删除 input、清除输出、关闭文档之后，迟到输出不串到其他结果。
- ANSI 转义序列及 UTF-8 被拆包时，颜色/文本仍正确；普通 cerr 不自动染色。
- 原生粘贴异步返回时，目标文档及 metadata 没有被旧快照覆盖；一次原生撤销涵盖引用与附件。
- 保存、重新打开、完整备份及 Beacon 内容编辑保留附件和 input 身份。

## Tasks

1. [x] 数据：当前格式支持独立 input；一次序列化；拒绝旧开发格式，不迁移图片。文件：Notebook model/edits，公共身份判断及测试。
2. [x] 编辑体验：添加 input 命令与工具栏；移除旧内嵌输入 UI，改为 input 结果状态；原生执行按钮按身份开放；Beacon 内容接口同步。文件：Notebook extension/manifest/l10n，Notebook context/布局，Beacon schema。
3. [x] 执行：冻结上方最近 C/C++ 与 input；进程出口合并；分阶段计时；单输出持续追加；ANSI 流式适配复用原生解析。文件：Runner notebookProcess/helper/control，Notebook outputQueue/renderer 及测试。
4. [x] 图片：附件短引用与 metadata 同次原生编辑，使用既有 Markdown attachment renderer；当前格式保存/备份测试。文件：Notebook image helper/provider/model。
5. [x] 完整检查、单独只读自审、更新正式设计及实现状态；界面/性能仍待产品验收。

## Validation ledger

预检确认 Node/npm、root TypeScript tsc6/.bin/tsc、build esbuild、renderer 类型和现有 GCC 均存在。Runner 使用 webpack.config.js，未发现 build.mjs，未启动任何错误入口。

开发 RED 为预期失败实验，不计作正式验证；正式验证非零/超时按 AGENTS.md 停止，不自动重试。

开发记录：基础 Notebook typecheck exit 0。迁移、附件短引用、plaintext 内容编辑、上方代码捕获、ANSI 拆包、Runner 分阶段时间及 helper 时间协议均已观察 RED→GREEN。开发阶段完整 Notebook suite 首次 17/18；失败为旧 fixture 的实际 input 已不同于选中 input，迁移正确保留额外历史 input，测试错误假定结果仍在旧 index。修正该断言后再做开发检查；正式最终序列尚未启动。

冻结最终命令（仓库根执行）：

- `npm --prefix extensions/becoder.notebook run typecheck`（120 秒；owning TypeScript）
- `npm --prefix extensions/becoder.notebook run build`（120 秒；extension/renderer/test 产物）
- `npm --prefix extensions/becoder.notebook test`（120 秒；Notebook 全部 focused suite）
- `npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run test`（120 秒；Runner 全部 suite，样例在临时目录）
- `npm run typecheck-client`（120 秒；core 变更）
- `npm run compile-oi-extensions`（120 秒；bundled extension closure）
- `node node_modules/eslint/bin/eslint.js` 加本轮 27 个已核实普通文件（Notebook src/test/renderer、Runner notebookProcess/control/test、Beacon provider/contextTools、BeCoder 公共/页面/桥/UI、Notebook 布局/上下文/执行/输出模型及 eslint.config.js）；精确命令随正式结果保存。
- `npm run stylelint -- src/vs/workbench/contrib/becoder/browser/beCoderNotebookInputs.css`（120 秒）
- `npm run valid-layers-check`（120 秒；现有 npm 脚本及七个层级入口已核对，不改边界规则）
- `.agents/skills/develop-becoder/scripts/validate-project-docs.ps1`（文档结构；不代表运行验收）

本轮不运行 staged/Setup 构建，不启动安装产品，不修改 D:/c++/test.ipynb。GUI 手感与图片性能以之后的真实产品验收为准。

预检结束：正式序列从下一条 Notebook typecheck 开始。开发 Notebook suite 最新 19/19（随后增加代码示例保护用例，需最终重跑）；隔离 helper 编译 exit 0，真实 merged C++ 样例 1/1。全部运行适配为用户明确触发后的依次 input 执行；只执行 input，不共享程序状态，不引入判题。源入口与版本/附件迁移要求一起实施。

正式序列停止：`npm --prefix extensions/becoder.notebook run typecheck` 已调用，结果回传脚本因尝试保存 undefined session_id 抛出 `Unable to store "nb_check_session". Only plain serializable objects can be stored.`。该调用的退出码与诊断未成功回传，不计通过，也不推定为源码失败。失败类为 orchestration；没有自动重试。后续 Notebook build/test、Runner suite、core typecheck、OI bundle、lint/stylelint/layers/docs 检查均未作为最终矩阵执行。需先恢复具有完整结果记录的类型检查，再完成冻结矩阵。当前源码及文档不是验收就绪声明。

负责人随后直接授权“继续，允许自行纠错”：恢复调用后 typecheck exit 1，准确诊断为 `src/extension.ts(67,19) TS7030: Not all code paths return a value`。runInput 正常分支返回运行状态、异常分支漏返；补齐异常/取消返回状态。继续纠错和重跑依据这一最新直接授权，不删除前次失败记录、不把失败算作通过。

恢复后的 Notebook typecheck/build/test exit 0，20/20。Runner 首次完整 suite exit 1（85/91），Notebook 实际 GCC 用例全部通过；6 项 compilationSnapshot 旧测试未能启动编译器（status null），因为 npm --prefix 下默认工具链目录不存在。预检漏核该独立测试参数，是 orchestration，不是 GCC 源码结果。沿用测试已有 `BECODER_TEST_TOOLCHAIN_ROOT`，对子进程设置 `D:/mythings/BeCoder/data/toolchains/ucrt64` 后重跑，不改全局环境/产品代码；两个编译器及 helper 已核实存在。


## 本轮纠错后最终记录（2026-10-13）

- 主代理单独只读自审覆盖结果归属、原生执行入口、取消/删除/清空的迟到输出、冻结的 dirty 内容、图片附件保存/上下文投影、原生复制输出、许可证及跨扩展编译。未使用子代理。
- 自审发现并用失败用例复现：原生复制未识别新的流 MIME；旧图片迁移误改缩进/跨行代码示例。复制接入原生文本入口并去除 ANSI；迁移复用现有 markdown-it 的块/行内解析，代码示例保留。两项回归修正后 Notebook 22/22，无跳过。
- 测试直接导入核心浏览器类型曾使扩展 checker 越界检查核心图，属于测试编排问题；独立 esbuild fixture 运行实际核心 copyCellOutput，扩展只引用 fixture 边界，核心仍由客户端 checker 验证。fixture 为 TypeScript，独立于扩展 tsconfig。
- 完整 OI 编译首次 exit 1：Beacon 间接检查 Notebook 的 images.ts，缺少 markdown-it 类型映射。复用现有 Markdown 扩展的完整声明，修正 Beacon paths 后完整命令 exit 0；不安装依赖。
- scoped ESLint 首次 exit 1：两份 mjs 的 header/新 JavaScript 规则，另有两处重复导入警告。构建脚本列入既有允许表并按 GPL header 检查；测试 fixture 改 TypeScript；导入合并。重跑 exit 0，零诊断。
- Notebook typecheck/build exit 0（完整 OI 编译再次覆盖）；Notebook test 22/22 exit 0；Runner test 91/91 exit 0（现有 GCC + 独立 helper，工具链变量仅在测试子进程中设置）；Beacon test 115/115 exit 0，测试使用本地/模拟协议，不是线上账号/模型验收。
- npm run typecheck-client 最后重跑 exit 0；npm run compile-oi-extensions exit 0；scoped ESLint exit 0；scoped stylelint exit 0；文档结构校验 exit 0；git diff --check exit 0（既有 CRLF 提示，不是内容错误）。npm run valid-layers-check exit 0（层级扫描及六类环境 TypeScript 完整执行）。
- Notebook 构建产物新增完整 THIRD_PARTY_NOTICES.txt，含现有 markdown-it 及其依赖许可证和 Microsoft renderer MIT 文本；.vscodeignore 不排除此文件。Beacon 既有 metafile 许可证采集保持。源基线/HEAD 未变，新增源码尚未提交。
- 正式命令入口新增检查：.eslint-allowed-javascript-files、Beacon tsconfig、TypeScript fixture 都为现存普通文件；清晰保留本轮失败和重跑，不将失败计作成功。

最终 scoped ESLint 精确命令：

```powershell
node node_modules/eslint/bin/eslint.js extensions/becoder.notebook/src/extension.ts extensions/becoder.notebook/src/model.ts extensions/becoder.notebook/src/images.ts extensions/becoder.notebook/src/ansiStream.ts extensions/becoder.notebook/src/outputQueue.ts extensions/becoder.notebook/src/edits.ts extensions/becoder.notebook/src/editApi.ts extensions/becoder.notebook/test/model.test.ts extensions/becoder.notebook/renderer/index.ts extensions/danielpinto8zz6.c-cpp-compile-run/src/notebookProcess.ts extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerInputControl.ts extensions/danielpinto8zz6.c-cpp-compile-run/test/notebookProcess.test.ts extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerInputControl.test.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/src/contextTools.ts src/vs/workbench/contrib/becoder/common/beCoderNotebook.ts src/vs/workbench/contrib/becoder/browser/beCoderNotebookInputs.ts src/vs/workbench/contrib/becoder/electron-browser/beCoderNotebook.contribution.ts src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts src/vs/workbench/contrib/notebook/common/model/notebookCellOutputTextModel.ts src/vs/workbench/contrib/notebook/common/notebookContextKeys.ts src/vs/workbench/contrib/notebook/browser/view/cellParts/cellContextKeys.ts src/vs/workbench/contrib/notebook/browser/controller/executeActions.ts src/vs/workbench/contrib/notebook/browser/controller/cellOperations.ts src/vs/workbench/contrib/notebook/browser/services/notebookExecutionServiceImpl.ts src/vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel.ts src/vs/workbench/contrib/notebook/browser/viewModel/cellOutputTextHelper.ts eslint.config.js extensions/becoder.notebook/build.mjs extensions/becoder.notebook/test/coreOutputFixture.ts
```

新增联动验证命令：`npm --prefix extensions/becoder.beacon test`。后续验收只针对本轮体验变化：多 input 对应最近上方程序、编辑后运行、取消/清空、普通 cout/cerr 与 debug 紫色、编译错误/耗时、图片粘贴/撤销/保存重开、当前 bcnb 保存重开和大图手感。源码检查不能确认这些 GUI 行为；本轮不构建应用/Setup、不操作安装产品或学生文件、不进行 Git 写操作。
