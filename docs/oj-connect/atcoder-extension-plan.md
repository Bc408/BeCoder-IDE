# OJ Connect AtCoder 插件化第一阶段实施计划

本文保留第一阶段迁移时的接口、步骤与检查记录，不是当前接口清单。该阶段快捷键闭环已获负责人确认；后续共同题面、评测页、登录侧栏与洛谷适配已实施，旧 `submit`／`revealResult` 桥与实验工具栏已移除。未采集的逐字段验收证据仍保持未勾选，不据此重新开启已完成的迁移。当前结构与验收状态见[技术架构](architecture.md)及[开发入口](README.md#当前实现状态)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 负责人已确认当前会话顺序执行。步骤使用复选框跟踪，未通过验收的步骤保持未勾选。

**Goal:** 让统一内置扩展接管当前已跑通的 AtCoder 源码快捷键提交流程，通过受限宿主接口保留真实会话、一次发送和本次记录核对，完成可独立验收的首个迁移增量。

**Architecture:** 扩展持有用户工作流、简单题号猜测、源码快照和语言选择。Workbench 提供绑定本窗口页面的结构化命令桥；Electron 主服务先保留已经验证的提交事务。后续再将站点页面规则组织为扩展构建资源，完成独立题面／评测页及浏览器导入到 CPH 的完整流程。

**Tech Stack:** 现有 TypeScript、VS Code 扩展 API、内部命令／IPC、Electron 浏览器 session、Node 原生测试和现有 tsc／Mocha；不新增运行时依赖或账号服务。

**Spec:** [产品与开发入口](README.md)、[技术架构](architecture.md)。这两份设计已由负责人审阅确认。

## Global Constraints

- 一个统一的 OJ Connect 内置扩展，扩展 ID 为 `becoder.oj-connect`，首个实现站点为 AtCoder。
- 默认目录为 `luogu`、`codeforces`、`atcoder`、`lanqiao`、`nowcoder`；目录识别与后续导入共用插件设置。
- 不新增持久源码—题目绑定库或文件移动冲突机制；当前操作的临时页面句柄不承担题目数据库职责。
- 源码以按键时的编辑稿为快照，包括未保存文本；不自动保存或改写源码。
- 一次用户请求最多自动发送一次；网页手动 Submit、取消后验证晚到、未知结果不得触发补发。
- Cookie、验证码凭据和 Electron webContents 留在浏览器宿主；不提供任意脚本／任意带登录态请求入口。
- Beacon 不新增登录、提交或改写源码工具；保留当前 CPH 和浏览器通用导入行为。
- 本阶段无 Git 提交／推送、Setup 或新站点真实账号操作；源码与 staged／包内容／运行验收分别成立。

## 分阶段交付与本计划覆盖

| 里程碑 | 交付 | 本计划 |
| --- | --- | --- |
| A | 内置扩展、窄宿主桥、AtCoder 提交工作流迁移、构建交付 | 六项任务完整覆盖 |
| B | 独立题面、Ctrl+Alt+P、站点子目录导入、重复导入保留源码、显式导入 CPH | 后续独立计划，保留原设计要求 |
| C | 独立评测记录页、实时结果展示、五站登录摘要侧栏、站点页面规则资源归属 | 后续独立计划，不以现有官网结果摘要冒充完成 |
| D | 其余各站点原生题面／提交／评测的逐站实测 | 按调研证据分别计划，不建立空适配器或声称五站可用 |

里程碑 A 的结果展示继续使用官网正式记录＋现有摘要。它交付的是可用的扩展侧工作流，不是整个 OJ Connect 产品完成；侧栏、题面和记录 Webview 不在本增量中搭空壳。

## Review Focus

1. `luogu/abc086_a.cpp` 不得因为文件形似 AtCoder 而自动向 AtCoder 提交：任务 2 固定目录优先测试。
2. 用户按键后继续修改编辑稿，发送仍必须使用按键时快照：任务 3 在语言选择等待点修改文档后核对传输内容。
3. 两个窗口打开同一网站，其他窗口的句柄不得可用：任务 1 的窗口／页面句柄测试。
4. 扩展退出、主机重启或崩溃时正在等待验证码，验证晚到不得发送：任务 4 的状态清理和 Electron 集成用例。
5. 新旧快捷键都还存在时会出现重复行为：任务 4 测最终快捷键解析，任务 5 计真实 POST 次数。

## 文件与接口约定

本阶段新增 `extensions/becoder.oj-connect/`，不使用用户扩展目录或日常账号数据。普通扩展文件按现有 GPL BeCoder 扩展约定；搬移既有代码保留其版权头及许可来源。

共享 DTO 定义在 `src/typings/becoder-oj-connect.d.ts` 的 ambient module `becoder-oj-connect` 中，核心与扩展仅作 `import type`，不生成运行时模块、不声明成标准 vscode API。扩展 tsconfig 显式纳入该声明与 `src/vscode-dts/vscode.d.ts`。核心既有 AtCoder DTO 改为从该声明导入／再导出，保持现有 IPC 方法形状。

```ts
export interface IAtCoderPageRef { handle: string; url: string }
export interface IAtCoderTaskForm {
    languages: { id: string; label: string }[];
    hasDraft: boolean;
}
export interface IAtCoderSourcePayload {
    source: string; fileName: string; languageId: string; replaceDraft: boolean;
}
export interface IAtCoderShortcutResult {
    url?: string; id?: string; status: string; score?: string;
    owner?: string; verified: boolean; stopped?: boolean;
}
export interface IAtCoderBridge {
    openTask(taskURL: string, sourceUri: string): Promise<IAtCoderPageRef>;
    inspectTask(page: IAtCoderPageRef): Promise<IAtCoderTaskForm>;
    submit(page: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult>;
    revealResult(page: IAtCoderPageRef): Promise<void>;
    cancel(page: IAtCoderPageRef): Promise<void>;
    release(page: IAtCoderPageRef): Promise<void>;
}
```

六个窄桥命令为 `_becoder.ojConnect.atcoder.openTask`、`.inspectTask`、`.submit`、`.revealResult`、`.cancel`、`.release`。它们绑定运行该命令的 Workbench 窗口；参数不能提供 windowId、session、脚本或请求地址。内部命令名不是调用者身份或安全隔离证明，宿主必须校验参数、页面归属和当前路由。

句柄由核心生成，映射真实 view ID、完整预期 URL、发送消费状态及宿主返回的最后结果。每次用户提交操作新建句柄；同一句柄的 submit 最多消费一次。revealResult 只展示宿主保存的结果，不接受扩展传入的任意“成功结果”。句柄在导航失配、页面关闭、释放、扩展停止或两分钟请求期限结束时失效；取消／释放不重新打开页面。

### Task 1: 本窗口 AtCoder 宿主桥

**Files:**
- Create: `src/typings/becoder-oj-connect.d.ts`。
- Create: `src/vs/platform/browserView/common/atcoderBridge.ts`、`src/vs/platform/browserView/test/common/atcoderBridge.test.ts`。
- Create: `src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts`。
- Modify: `src/vs/workbench/contrib/browserView/electron-browser/browserView.contribution.ts`，以及 `src/vs/platform/browserView/common/browserView.ts`、`atcoderWorkflow.ts`、`atcoderShortcut.ts` 中的 DTO 引用。

**Interfaces:** 消费既有 `IBrowserViewService.prepareAtCoderTask/submitAtCoderTask/cancelAtCoderTask`；提供上文 `IAtCoderBridge`。纯 `AtCoderBridgeController` 由构造参数注入页面打开、检查、发送、取消、展示、生成句柄等端口，保持 Node 测试不依赖 Electron／DOM。

构造签名为 `new AtCoderBridgeController(ports: IAtCoderBridgePorts)`；另提供 `dispose(): Promise<void>` 取消并释放全部本窗口句柄。端口 `openTask(taskURL, sourceUri)` 返回 `{ viewId: string; url: string }`；`inspectTask/submit/cancel/revealResult` 接收该内部页面对象，签名分别对应公开桥方法，revealResult 额外接收宿主保存的 `IAtCoderShortcutResult`。`newHandle(): string` 和 `isPageCurrent(page): boolean` 注入确定的句柄及发送前页面检查。核心自己保存 viewId，绝不让扩展用 viewId 替代 handle。只有 inspect／submit 的前置检查要求原 task URL；事务内 own-list／正式详情导航沿用主服务状态机，不把成功导航误判为失配。

- [x] **Step 1: 写失败测试。** `rejects foreign window handle`、`rejects changed page URL`、`consumes submit handle once`、`reveal uses host receipt`；断言分别拒绝调用、底层发送零次、双调用只发送一次、伪造结果参数无法覆盖真实回执。
- [x] **Step 2: 观察 RED。** 用下文“核心聚焦检查”编译并运行新增 suite；失败必须落在上述行为，而非依赖或命令不存在。
- [x] **Step 3: 实现端口控制器与六个桥命令。** 窗口 ID 由 Workbench 的 `mainWindow.vscodeWindowId` 内部取得；使用实际 model URL 作为预期 URL。openTask 复用当前窗口同题 view 或打开侧边 view，最多等 20 秒。sourceUri 仅用于核对／显示当前已打开模型，不从磁盘另读源码。
- [x] **Step 4: 处理释放。** 将导航、关闭、提交取消和句柄失效合并为请求生命周期；release 后重用句柄明确拒绝，取消不能触发发送。保留既有实验读取命令及手动 Prepare Submission 工具栏。
- [x] **Step 5: 跑新增 suite 和既有 AtCoder suites 至全绿，再跑 `npm run typecheck-client`。** 本任务结束时旧 Ctrl+Alt+S 仍可使用；尚不切换用户入口。

### Task 2: 扩展内简单猜题与配置

**Files:**
- Create: `extensions/becoder.oj-connect/package.json`、`tsconfig.json`、`tsconfig.test.json`、`LICENSE`。
- Create: `src/problemResolver.ts`、`src/settings.ts` 及对应 `test/problemResolver.test.ts`、`test/settings.test.ts`（均相对新扩展根）。

**Interfaces:** `SiteId = 'luogu' | 'codeforces' | 'atcoder' | 'lanqiao' | 'nowcoder'`；`SiteDirectories = Record<SiteId, string>`；`resolveAtCoderTask(filePath: string, directories: SiteDirectories): { kind: 'task'; url: string } | { kind: 'inputRequired' } | { kind: 'unsupported'; site: SiteId }`。

- [x] **Step 1: 写失败测试。** 固定 `atcoder/abc086_a.cpp`、`atcoder/abc-86_a.cpp`、无站点目录的 `AT_abc086_a.cpp` 均得官方 ABC086 A URL；`luogu/abc086_a.cpp` 为 unsupported／luogu；`atcoder/solution.cpp` 为 inputRequired。自定义 atcoder 目录名参与同样识别，不读取任何绑定数据库。
- [x] **Step 2: 建立仅支撑该模块检查的扩展 tsconfig／npm scripts，运行测试观察 RED。** `typecheck` 使用仓库 `tsc6 --noEmit`，`build` 生成 CommonJS 到 `out/`，`test` 编译到 `out-test/` 并使用 `node --test`；不执行 clean 或删除依赖。
- [x] **Step 3: 实现 resolver。** 只判断当前文件直接父目录，按有效配置确定站点；没有站点目录时匹配已知 AtCoder 文件特征。沿用当前 abc／arc／agc／ahc 的数字补零行为，并支持 `AT_` 前缀。缺少题号时由调用者提示，其他站目录不后台切到 AtCoder。
- [x] **Step 4: 定义设置 `becoder.ojConnect.directories`。** 默认对象精确为 `{ luogu:'luogu', codeforces:'codeforces', atcoder:'atcoder', lanqiao:'lanqiao', nowcoder:'nowcoder' }`。验证单级合法目录名及 Windows 下大小写不敏感的重复名；无效配置给出明确错误，不能静默写入／猜题。设置改变不移动文件。
- [x] **Step 5: 验证。** `npm --prefix extensions/becoder.oj-connect run typecheck`、`npm --prefix extensions/becoder.oj-connect test`。当前只提供 AtCoder 路由，不创建其他站点空适配模块；导入写文件留到里程碑 B。

### Task 3: 扩展侧当前编辑稿提交工作流

**Files:**
- Create under the new extension: `src/browserHost.ts`、`src/submissionController.ts`、`src/extension.ts`、`src/adapters/atcoder/task.ts`、`test/submissionController.test.ts`、`test/browserHost.test.ts`。
- Create: `package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`；update manifest 的命令和激活声明。

**Interfaces:** `ISourceSnapshot = { uri: string; fileName: string; version: number; family: 'c' | 'cpp'; source: string }`；`SubmissionController.submit(snapshot: ISourceSnapshot): Promise<IAtCoderShortcutResult | undefined>`、`cancel(): Promise<void>`、`dispose(): Promise<void>`。UI 端口注入题号输入、语言选择、草稿确认与进度显示；browserHost 实现 Task 1 的 `IAtCoderBridge`。

- [x] **Step 1: 写失败测试。** 用确定的等待屏障模拟语言选择期间编辑器变化，断言发出的 source 仍为按键时文本；验证 CRLF 转 LF、取消选择零发送、拒绝替换网页草稿零发送、并发按键只启动一项、错误桥返回被拒绝。测试实际控制器，不对模拟器自身写断言。
- [x] **Step 2: 运行扩展测试观察 RED，然后实现控制器。** 按快照→resolver→必要时输入官方链接→openTask→inspectTask→选择有效 C/C++ 语言→草稿确认→submit→revealResult→release 编排；选择器等待后不重新读取活动文档。输入链接仅接受官方 AtCoder task URL。
- [x] **Step 3: 实现 `becoder.ojConnect.submit`、`becoder.ojConnect.stopSubmission` 两个公开命令。** activate 注册 disposables；deactivate 主动 cancel/release。语言偏好仅在当前扩展实例内按 C／C++ 记住，每次按当前页面有效选项校验；不保存源码题目绑定。
- [x] **Step 4: 适配 vscode API 与运行文案。** 先读取 `window.activeTextEditor.document.getText()` 和 document.version；仅接受本地 C/C++ 编辑器。进度用窗口状态而非覆盖浏览器的通知进度。运行时使用 `vscode.l10n.t`，manifest 文案英中同步。不得调用旧核心提交命令当作实现。
- [x] **Step 5: 跑 typecheck/build/test。** 此时通过命令面板可走新流程；快捷键仍留待下一任务统一切换。

### Task 4: 快捷键切换与扩展结束时取消

**Files:**
- Modify: 新扩展 manifest／extension.ts；`src/vs/workbench/contrib/browserView/electron-browser/browserView.contribution.ts`、Task 1 的桥贡献。
- Remove after consumer check: `src/vs/workbench/contrib/browserView/electron-browser/features/browserAtCoderShortcutFeature.ts`。
- Modify: 核心 `atcoderShortcut.ts`／相应单测，移除已由扩展接管的文件名推断；保留发送脚本、列表核对等宿主消费者。
- Test: 扩展控制器测试、核心 bridge suite；新增 `src/vs/workbench/contrib/browserView/test/electron-browser/browserOjConnectFeature.test.ts`。

**Interfaces:** Ctrl+Alt+S 由 `becoder.ojConnect.submit` 独占，when 为 `editorTextFocus && (editorLangId == c || editorLangId == cpp)`；旧 F1 命令 ID 可注册为无快捷键的转发别名，但不保留第二套提交处理器。

- [x] **Step 1: 写失败测试。** 最终键位解析在 C/C++ 聚焦时只选中扩展提交命令，其他上下文不触发；在验证码等待阶段模拟扩展结束，随后放行验证，底层发送仍为零。
- [x] **Step 2: 实现切换。** 当前核心快捷键权重为 300，内置扩展权重也为 300，不能靠注册顺序赌覆盖；删除旧绑定与模块导入后再启用 manifest 绑定。保留原有 Share 在其他上下文的行为。
- [x] **Step 3: 实现核心侧取消。** 订阅 `IExtensionService.onWillStop`、`onDidChangeExtensions` 和 `onDidChangeExtensionsStatus`；OJ Connect 被移除或 runtime status 的 activationStarted 清零时取消其本窗口租约。对应仓库 crash 路径会停止 hosts、清空状态并发状态变化事件，不以扩展 deactivate 必定执行作保证。取消必须到达主进程 AbortController，不能只清 UI。
- [x] **Step 4: 跑核心／扩展单测及相关 Electron UI 测试。** Electron 测试前使用可用 watch；无 watch 时先 `npm run typecheck-client`、`npm run transpile-client`，核对 Electron 版本和输出，再执行 `.\scripts\test.bat --runGlob '**/browserOjConnectFeature.test.js'`。测试入口已支持 runGlob／glob 参数；禁止用 `npm run compile` 充当类型验证。

### Task 5: 真实 Electron 合成链路回归

**Files:** Modify `scripts/test-atcoder-shortcut.cjs`；复用 `src/vs/platform/browserView/test/common/atcoderForm.fixture.html`，添加需要的确定性测试屏障。

**Interfaces:** 使用新扩展编译后的 SubmissionController，经纯桥控制器调用真实 BrowserViewMainService.prototype；测试页面仍为私有 intercepted Electron session，不使用用户 Cookie 或真实 OJ。

- [x] **Step 1: 扩展测试先 RED。** 加入 extension snapshot→bridge→真实表单发送→own-list→新 ID／源码核对→正式结果的路径；在“验证码未就绪”屏障取消／模拟扩展结束后才设置成功，断言 POST 零次。保留旧 ID 10 排除、新 ID 11、AC、歧义拒绝及手动 Submit 不重复用例。
- [x] **Step 2: 修正任务间接口直至 GREEN。** 统计实际 intercepted POST，不把命令被调用次数当成成功；验证 Unicode／换行与发送快照一致。测试结束观察器和租约均释放，可立即再次操作。
- [x] **Step 3: 记录源码／运行证据。** 固定 Electron 来源、版本、脚本命令、结果和失败修正；禁止通过删掉旧边界用例获取通过。合成全绿后才进入应用构建。

### Task 6: 内置分发、正式检查与负责人验收

**Files:** Modify 根 `package.json` 的 compile-oi-extensions、`build/lib/extensions.ts` 的 prebuiltOIDistributionExtensions、`build/azure-pipelines/win32/verify-becoder-package.ps1`、`build/lib/test/oiExtensionBoundary.test.ts`、`resources/oi-defaults/BUNDLED-COMPONENTS.json`；新增扩展 `README.md` 与来源／许可记录；更新 OJ Connect 当前状态。

**Interfaces:** manifest 为 publisher `becoder`、name `oj-connect`、version `0.1.0`、main `./out/extension.js`、`engines.vscode: ^1.130.0`（同现有 CPH）；untrustedWorkspaces／virtualWorkspaces 均声明不支持，保持本地工作区入口。`vscode:prepublish` 调用新扩展 build，编译链先生成扩展再打 staged；不为此修改其他扩展的受保护策略。

- [x] **Step 1: 写分发边界失败测试。** 校验 manifest、英中文案键、主入口、编译链、随包许可与来源清单一致；精确检查 OJ 扩展禁用／缺失时桥入口不会保留等待中的发送，不宣称此阶段已有独立题面或五站侧栏。
- [x] **Step 2: 补齐构建与清单。** 复用仓库依赖，不安装第二套 TypeScript／Electron；原有生成目录和工具链资产保留。新增包验证条目包括 manifest、out/extension.js、许可证、文案与源信息，不能只把测试期目录算成分发完成。
- [x] **Step 3: 最终只读审查。** 按完整需求、临时句柄生命周期、两窗口隔离、源码快照、单次发送、旧键位移除、许可及实际运行证据检查；具体发现修复后重跑受影响检查。
- [x] **Step 4: 执行下文正式矩阵。** 每条记录退出码、耗时、日志与失败层。任一必需检查失败不继续打包；不得引用修复前检查充当最终通过。
- [ ] **Step 5: 交负责人真实验证。** 沿用独立 Portable 数据，以 ABC086 A 验证聚焦代码→Ctrl+Alt+S→验证码就绪后自动发送→打开对应新正式记录。记录新的 ID，核对本次源码；不要把旧 `80777721` 当作新构建验收。既有授权范围内由用户处理登录／验证码，不增加错误答案或新站点提交。
- [ ] **Step 6: 更新当前状态，交付里程碑 A。** 本计划任务完成后不自动进入 B／C／D，不提交／推送或构建 Setup。

## 验证命令与执行前预检

下列为本轮实施采用的命令清单；执行结果见本节末的当前状态与执行台账。新扩展 scripts、测试与产物需先由所属任务建立并核对；缺少命令是编排失败，不是源代码通过。每次执行前按 [validation protocol](../../.agents/skills/develop-becoder/references/validation-protocol.md) 核实输入和执行入口并冻结当次清单。

核心聚焦 Node suites：沿用已存在的 tsc／Mocha 入口，增加共享声明和新测试文件：

```powershell
.\node_modules\.bin\tsc.cmd --target es2022 --module nodenext --skipLibCheck --types node,mocha --rootDir src/vs/platform/browserView --outDir tmp/oj-connect-audit/mvp-tests src/typings/becoder-oj-connect.d.ts src/vs/platform/browserView/test/common/atcoderBridge.test.ts src/vs/platform/browserView/test/common/atcoderShortcut.test.ts src/vs/platform/browserView/test/common/atcoderWorkflow.test.ts src/vs/platform/browserView/test/common/atcoderSubmission.test.ts
node node_modules/mocha/bin/mocha.js --ui tdd tmp/oj-connect-audit/mvp-tests/test/common/atcoderBridge.test.js tmp/oj-connect-audit/mvp-tests/test/common/atcoderShortcut.test.js tmp/oj-connect-audit/mvp-tests/test/common/atcoderWorkflow.test.js tmp/oj-connect-audit/mvp-tests/test/common/atcoderSubmission.test.js
```

扩展建立 scripts 后：

```powershell
npm --prefix extensions/becoder.oj-connect run typecheck
npm --prefix extensions/becoder.oj-connect run build
npm --prefix extensions/becoder.oj-connect test
node --test build/lib/test/oiExtensionBoundary.test.ts
```

Electron 合成脚本继续使用 inspected build esbuild 入口生成 `tmp/oj-connect-audit/shortcut-main.cjs`；脚本以与应用相同的 Electron 启动。当前已验证的测试运行时为 `tmp/oj-connect-audit/electron-runtime/electron.exe`；复用前确认存在及版本，缺失时从仓库指定版本的已验证归档准备，不猜依赖内部可执行文件位置。

最终顺序：新扩展 typecheck/build/test、核心聚焦测试与合成 Electron、现有 OI 分发边界、客户端类型检查、OI 扩展编译、相关 lint／layers、staged、直接包验证。根命令及阶段超时：

```powershell
npm run typecheck-client
npm run compile-oi-extensions
npm run valid-layers-check
npm run gulp vscode-win32-x64-min
& build/azure-pipelines/win32/verify-becoder-package.ps1 -PackagePath ..\VSCode-win32-x64 -IncludeCompiler $true
```

typecheck／扩展编译外部超时 120 秒，staged 300 秒。lint 输入只取存在的变更普通文件；删除的旧入口另做消费者检查。本增量不计划 CSS 修改；若新增界面样式，再加入 owning CSS 检查与渲染验收。构建前保存并关闭占用 staged 目录的测试版；保留独立数据，不强杀未保存窗口。

每任务结束记录局部 GREEN 与待验收项，不执行未经授权的 commit。需要 Git 备份时由负责人另行明确，不能照搬技能示例中的自动 git add／commit。

## 计划自审与本轮交付

已对照产品和架构确认：第一阶段完整覆盖 A，B／C／D 的原要求明确保留，没有以包装旧提交命令冒充业务迁移。五项 Review Focus 均有归属测试；共享 DTO／桥方法／控制器方法名称一致。当前源码仍在 `OJ_connect` 的既有未提交工作树中，执行前保留用户与此前 MVP 改动，不默认创建空 worktree 丢失基线。

负责人已批准执行。任务 1–5 已完成源码与回归验证；最终核心 25 项、扩展 12 项、Electron 快捷键 2 项、OI 分发边界 29 项通过，真实 Electron 组合链路也已通过。独立审查的两个生命周期问题已补回归并修复。staged 构建已通过（163.38 秒），使用 PowerShell 7 执行直接包验证已通过（IncludeCompiler=true，13.8 秒）。新版本启动后负责人确认“快捷键交题闭环依旧达成”；新提交 ID、最终判定与源码字段未另行采集，Step 5 的完整字段核对证据仍未补齐，旧记录不能替代本轮。

本阶段对计划的必要调整：既有执行分支包含未提交 MVP，保留当前 OJ_connect 工作树及忽略目录中的执行台账；测试启动器适配本仓库已移除的 Remote manifest；分层 checker 的显式声明清单补入共享 DTO。没有改动账号、系统环境或 Git 状态。记录见忽略目录 `tmp/oj-connect-audit/atcoder-extension/progress.md`。少数异常提示仍含内部错误标识，作为非阻塞文案改进留待后续处理。


2026-11-14 体验收敛：原实验 JSON 读取入口和手动 Prepare Submission 工具栏已由共同题面／评测前端接替；上文复选项保留第一阶段执行时点，不要求恢复旧界面。当前来源与复用范围见扩展 UPSTREAM.md。
