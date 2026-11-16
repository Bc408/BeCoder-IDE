# AtCoder 体验补全实施计划

> **For agentic workers:** 使用 executing-plans 在当前会话逐项执行；每项先观察回归失败再实施，完成后作一次独立只读审查。

**Goal:** 以洛谷共同前端完成 AtCoder 的语言偏好、独立表单提交与持续结果反馈。

**Architecture:** 保留 OJ Connect 共同控制器、站点适配和受限浏览器宿主。偏好用扩展本机 Memento；任务表单独立拥有且共享持久会话；结果继续串行查询，不复制推送或认证框架。

**Tech Stack:** TypeScript、VS Code Extension API、Electron BrowserView、React、Node test／Mocha。

**Spec:** [已批准设计](../specs/2026-11-16-atcoder-experience-design.md)。2026-11-16 负责人确认进入实施，沿用先前连续开发授权，不再次停在计划批准。当前 OJ_connect checkout 含必须保留的既有工作，不新建空白 worktree、不提交或推送。

## Global Constraints

- 复用洛谷 UI、现有渲染与会话；不引入新的认证形式、依赖、队列或持久题目绑定。
- 当前源码快照含未保存内容；一次任务最多一条正式记录；受理不明只查询。
- 保留用户网页草稿、标签、源码、CPH 样例和洛谷基线。
- 产品检查、合成浏览器测试、stage 构建和真实账号验收分列。

## Review Focus

- 缺少偏好正文时仅回退本题，不覆盖已保存偏好：任务 1。
- 首次自动显示语言不能跳过用户选择；编译器失效重新选择：任务 1。
- 原站用户标签中有草稿时，新任务及结果读取不得导航／覆盖该标签：任务 3。
- 超两分钟正常评测持续，但单次请求错误保留最后结果且可重试：任务 2。
- CE 无源码、状态未知、页面关闭晚到结果：任务 4 与最终回归。

### Task 1: 持久偏好与显式选择

**Files:** 新增 `extensions/becoder.oj-connect/src/preferences.ts` 及 `test/preferences.test.ts`；修改 `src/extension.ts`、`src/workflowController.ts`、`src/views/problemPanel.ts`、`webview/luogu/submissionControls.tsx`、`test/views.test.ts` 和相关宿主测试。

**Interfaces:** `OjPreferences` 接受 Memento 的 get/update 窄接口，按 AtCoder 正文语言及 C/C++ 分别读写。控制器的语言读取使用当前偏好；主动选择持久保存。ProblemPanel 接收同一偏好实例。

- [x] 测试跨实例／重启读取、缺失回退不覆写、首次题面不自动选编译器。
- [x] 运行扩展 typecheck 和聚焦测试，记录 RED。
- [x] 实现最小本机偏好，选择操作等待存储成功；维持洛谷既有默认。
- [x] 聚焦与完整扩展测试 GREEN。

### Task 2: 提交反馈与持续评测

**Files:** `src/extension.ts`、`src/recordController.ts`、`src/views/recordPanel.ts`、扩展 package.json／本地化命令项、`test/recordController.test.ts` 和页面测试。

**Interfaces:** `TrackingOptions.timeoutMs` 支持明确无整轮截止的值，仅 AtCoder 使用；单次读取仍有自己的超时。移除用户可见 stopSubmission，内部取消／dispose 不变。

- [x] 测试超过 120 秒虚拟时间仍得到最终结果、关闭中断不晚更新；失败后重试同一记录。
- [x] 观察 RED，移除 AtCoder 整轮截止和误导性停止动作。
- [x] 验证洛谷现有截止／推送及完整扩展测试。

### Task 3: 同会话独立提交页面

**Files:** `src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts`、对应 `test/electron-browser/browserOjConnectFeature.test.ts`，必要时现有 AtCoder 事务及 fixture。

**Interfaces:** 现有 `openPage` 增加任务拥有页面的明确策略；AtCoder prepare 和 record acquisition 不选择用户标签。仍使用 resolveStorageScope 的持久 session，不新建账号。

- [x] 在真实 contribution harness 加入已有同题用户标签／草稿，验证任务使用新页面、原标签不导航或释放、记录读取独立、页面 scope 一致。
- [x] 观察 RED 后实施页面所有权；人工登录／验证仍自动继续。
- [x] typecheck-client、contribution harness 和现有 Electron 单次提交事务回归。

### Task 4: 原生状态解释与编译诊断

**Files:** `src/vs/platform/browserView/common/atcoderSubmission.ts`、相关 common tests、AtCoder DTO、原生结果映射、`webview/luogu/record.tsx`、本地化与 `test/render.mts`。

**Interfaces:** snapshot 增加可选 compileMessage；宿主仅传经过固定页面抽取与大小校验的文本；共同 RecordSnapshot 已有编译输出字段。原状态保持，已知状态给本地化 tooltip。

- [x] 核对既有真实页面／原站公开实现，确认编译诊断和源码缺失行为；测试 CE、正常结果、未知状态与缺失字段。
- [x] 观察 RED，复用共同输出与复制组件，补齐状态颜色／中文解释。
- [x] 聚焦解析、完整扩展、生产 render 与实际截图检查。

### Task 5: 审查、验证与 stage 交付

- [x] 更新当前文档实现状态，保留真实验收缺口。
- [x] 主 agent 逐项只读审查；执行一次独立只读审查，修复具体问题并重验受影响检查。
- [x] 冻结验证命令，保存台账：扩展 typecheck／完整测试／render、核心 common／contribution／Electron transaction、scoped ESLint、layers、diff、文档检查。
- [ ] 最终执行 `npm.cmd run typecheck-client`（120s）、`npm.cmd run compile-oi-extensions`（120s）、`npm.cmd run gulp vscode-win32-x64-min`（300s）。负责人最新明确要求全新 stage，不保留或恢复旧 stage 数据；不迁入其他版本的数据。只替换标准 stage 目标，不能杀日常窗口。
- [ ] 构建成功后交付 stage，明确真实登录、验证和本轮正式记录待负责人验收。不自动启动 GUI、Setup、包验证或 Git 操作。
