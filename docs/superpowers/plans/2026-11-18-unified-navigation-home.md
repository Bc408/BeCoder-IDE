# Unified Navigation Home Implementation Plan

> 执行：负责人已授权本会话自行推进。主 agent 负责首页、入口、启动和集成，独立工作项可分配 agent；不因通用技能中的提交步骤自动 commit。使用 executing-plans 的逐项验证原则。

**Goal:** 将开始、浏览器首页与新标签统一为本地导航页。
**Architecture:** 扩展现有 browserView content widget；复用配置、搜索、历史和文件命令；原生浏览器模型继续管理网页与会话。
**Tech Stack:** TypeScript、原生 DOM/CSS、Code-OSS services，零新依赖。
**Spec:** `docs/superpowers/specs/2026-11-18-unified-navigation-home-design.md`

## Global Constraints

- 首页无最近文件；历史分组，不引入时间戳数据库。
- 搜索、链接管理进入原生设置；保留现有设置值。
- 不改变 OJ Connect／CPH／NoteBook 的业务所有权和会话。
- 不自动 commit、push、构建 Setup 或删除缓存。

## Review Focus

1. 恢复窗口、skipWelcome 与 startupEditor=none 不被第二个启动贡献覆盖。
2. 主页标签复用不触及后台登录／提交标签；带 URL 的打开命令不改变。
3. 返回首页后可后退，原生网页视图不遮挡本地 DOM。
4. 锁定浏览器分组中的文件创建与历史文件进入正常编辑器组。
5. 无效设置、安全协议、配置实时变化和会话隔离。

## Tasks

### 1. 共享搜索和原生设置

Files: `browserView/common/browserSearch.ts`、`electron-browser/features/browserSearchFeatures.ts`、`browserNavigationFeatures.ts`、`test/common/browserSearch.test.ts`。

- [x] 扩展现有行为测试：自定义引擎名称／模板、中文与特殊字符编码、非法 URL 与模板、内置兼容与默认回退；先运行确认缺失行为失败。
- [x] 保持 `buildSearchUrl`、`getBrowserSearchEngineLabel` 共用入口，接收可选自定义引擎配置；原生设置注册并接入地址栏。首页直接调用同一函数。
- [x] 浏览器设置查询同时包含首页网站链接配置，不新增设置管理器。
- [x] 运行拥有测试与 typecheck。

### 2. 统一历史

Files: `browserHistoryFeature.ts` 和拥有测试。

- [x] 最近文件从 `IWorkspacesService.getRecentlyOpened()` 获取；保留文件自身顺序，原有网页历史按日期显示。真实服务调用测试涵盖打开、删除、搜索与清除边界。
- [x] 扩展现有 QuickPick，右侧添加历史入口；文件打开通过编辑器服务，网页沿用当前模型。
- [x] 确认地址栏建议、临时浏览器历史隔离不变。

### 3. 首页、导航与启动

Files: `browserWelcomeFeature.ts`、拥有 browser CSS、`browserTabManagementFeatures.ts`、`startupPage.ts`、`gettingStarted.contribution.ts`、`beCoderNewTab.contribution.ts`、`multiEditorTabsControl.ts`。

- [x] 检查至少两个相邻实现与测试，补首页识别／复用、返回当前标签、旧入口和启动行为回归。
- [x] 本地 content widget 显示搜索、网站快捷方式与 C/C++/Notebook 入口。配置监听与 DOM 事件全部注册释放；无 innerHTML 用户配置插入。
- [x] 注册唯一主页命令、原生新标签转发；标题栏只一个主页，导航栏当前标签回主页，标签栏＋创建新页。
- [x] 删除第二启动贡献和失去消费者的旧页面实现；必要旧资源序列化兼容保留。
- [x] 复用原生保存逻辑，核对 `.cpp` 注册与 Notebook 保存路径。

### 4. 集成验证和交付

- [x] 预检命令、记录精确输入与结果到本计划末尾。使用现有 npm 脚本，拥有测试先于全量检查。
- [x] 运行实际本地 DOM／Electron 渲染检查，验证搜索／链接当前标签导航、返回／前进、宽窄布局、历史与新建入口。
- [x] 作独立只读复核，处理具体问题并重跑受影响检查。
- [x] 执行 `npm run typecheck-client`（120s）、`npm run compile-oi-extensions`（120s）及相关 lint；通过后如交付 stage，执行 `npm run gulp vscode-win32-x64-min`（300s），不继续 Setup。
- [x] 更新用户文档事实，交付准确的已验证范围及未完成验收项。

## Execution Ledger

- 2026-11-18：源码基线 `573b0e96`，工作区干净。负责人明确授权收敛文档并自行推进，因此不重复请求方案许可。

### 已实现与复核

- 首页、空白浏览器与旧开始页统一到原生 browserView 的本地 DOM；删除不再消费的旧页、CSS 和默认语言设置，保留旧命令／序列化兼容和显式 walkthrough。
- 地址栏与首页共用搜索配置／构造；自定义引擎与网站链接进入原生设置。文件历史复用原生最近打开服务，网页继续沿用原浏览器历史。
- 首页／网页切换只影响当前原生视图可见性；未修改 OJ 登录、提交、CPH 导入、NoteBook 保存协议或会话所有权。无新增依赖或许可变化。
- 独立 agent 已只读复核启动所有者、命令生产注册、主页复用、隐藏 OJ 视图、异步释放及删除项引用；主 agent 另行复核最终实现。未发现阻断项。

### 验证命令与结果

内容检查输入按 `git diff --name-only --diff-filter=ACMR` 与未跟踪文件枚举，仅把存在的普通文件交给解析器／lint；删除项另作消费者检查。命令入口均已核对，构建上限 300 秒，类型检查／扩展编译上限 120 秒。

| 命令与输入 | 最终结果 | 证据与范围 |
| --- | --- | --- |
| `npm run transpile-client` | exit 0 | 生成最终拥有测试运行所需的 out；未手改产物 |
| `node_modules/electron/dist/electron.exe test/unit/electron/index.js --runGlob **/browser{Home,Search,WelcomeFeature,HomeActions,HistoryFeature,RecentFiles,ProblemFeature,OjConnectFeature}.test.js --user-data-dir=tmp/home-review/electron-green-5` | exit 0，81 passing | `tmp/home-search/electron-green-5.log`；包含既有 OJ 浏览器入口回归 |
| `npm run typecheck-client` | exit 0 | 最终源码检查 session 17385；不是 compile 替代检查 |
| `npm run compile-oi-extensions` | exit 0 | session 64752 |
| `npm run valid-layers-check` | exit 0 | session 95027 |
| `node_modules/.bin/eslint.cmd`，最终变更中的现存 `.ts` | exit 0，无 warning | 输入清单 `tmp/home-review/eslint-inputs.txt`，执行器 `tmp/home-review/validate-source.ps1` |
| `ConvertFrom-Json -AsHashtable`，变更中的现存 JSON | 成功 | 与上述源检查同次执行 |
| `npm run stylelint -- "src/vs/{workbench/browser/parts/editor/media/multieditortabscontrol,workbench/contrib/browserView/electron-browser/media/browser}.css"` | exit 0 | 两份完整 CSS 共 52 条设计 token 建议，未当作零提示 |
| `.\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1` | exit 0 | 文档结构检查，另作语义复核 |
| `git diff --check` | exit 0 | 存在仓库 LF/CRLF 通知，无空白错误 |
| `node tmp/home-review/runtime.mjs` | exit 0 | 新隔离配置、真实 Electron／Playwright；截图由 agent 实际查看 |
| `node tmp/home-review/startup-runtime.mjs` | exit 0 | session 73334；startupEditor=none、skip-welcome 无注入首页；首页与文件重启恢复无重复首页；原生 C 保存默认 `.c` |

真实窗口已验证：启动仅一个首页、主页复用、旧命令和＋新建独立首页；搜索与网站链接留在当前标签；Home／Back／Forward；网页原生视图在网页可见、首页隐藏；自定义引擎的中文与特殊字符编码；340px 首页无横向溢出；C++ 新建语言与保存默认 `.cpp`；文件／网页历史分组；原生设置入口显示 9 个匹配设置。NoteBook 检查复用现有命令和保存实现，未在开发宿主声称完成其原生保存运行验收。

截图：`tmp/home-review/home-wide.png`、`home-narrow.png`、`history.png`、`home-settings.png`。开发宿主缺少随 stage 分发的工具链／部分内置扩展会产生环境警告；检查时只清除通知，不修改产品逻辑掩盖警告。

### 中间失败与复跑

- 首轮类型检查失败：ThemeIcon 类型和测试替身类型不符；修正后最终类型检查通过。
- Electron 前两轮失败涉及测试替身 DisposableStore 释放顺序，一轮使用了更新前 out；第三轮仅 Windows URI 大小写断言失败。修正测试后重生成，最终 81 项通过。
- JSON 检查首轮使用普通 `ConvertFrom-Json` 不接受语言包的空键，属编排失败；改用 `-AsHashtable`。ESLint 随后两条 warning 已消除，最终零 warning。
- 运行检查曾因驱动扩展引擎声明、页面 fetch、错误打包入口或与 transpile 并发而无有效结果；均属采证编排问题，已改为有效开发宿主、顺序执行和 Node 侧请求。自定义搜索期望改用共享编码规则；实际按钮可访问名包含图标字符的问题通过显式 aria-label 修正并重新运行验证。
- 追加启动恢复测试最初错误假设关闭最后标签会留下空组；源码确认原有行为会新开首页，未改写该行为。随后直接点未悬停的非活动标签关闭按钮被原生指针规则拦截，属检查编排失败。最终改为保留首页与文件，检查重启完整恢复这两个标签且不多开首页。

### Stage 交付边界

- 标准构建目标 `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`。构建前核对进程，只关闭本轮遗留的 `electron-red` 测试进程，未关闭日常实例。
- 旧目标的 `data` 已移至 `tmp/home-review/stage-data-before-home-20261118-014525` 独立保留，新 stage 不继承其中登录或个人配置。
- `npm run gulp vscode-win32-x64-min` 最终 exit 0，耗时 2.67 分钟，未触及 300 秒上限；日志 `tmp/home-review/stage-build.log` 与 `.err`。npm 的既有配置弃用通知及 fs.Stats 弃用通知未导致失败。新 stage 位于上述标准目录，仅作为候选交付；负责人视觉／实际使用验收待完成。未 commit、push、构建 Setup、额外包验证或启动打包后实例。

## 负责人验收后修正（2026-11-18）

负责人确认进入修正。前述验证仅对应首轮候选，不代表下列问题已解决。

- [x] 允许关闭最后一个首页和全部编辑器，不自动补建；标签栏＋仍显式新建首页，并修正其垂直对齐。
- [x] 首页地址栏及标签悬停不暴露 `about:blank`；首页地址建议采用统一判定。
- [x] 主页复用排除正离开首页的标签；返回首页时把当前浏览器容器内的焦点交给搜索框，不抢其他编辑器／地址栏的焦点。
- [x] 修正自定义搜索模板中的路径／片段编码，并统一空搜索引擎配置的行为。
- [x] 网站链接宽屏每行最多七个，窄屏自然换行；复用 BeCoder 图标并恢复“一切就绪”小字。
- [x] 清理旧命令内部转发、无消费者欢迎页颜色和焦点包装；搜索配置变化不重建网站按钮。保留旧标签恢复兼容。
- [ ] 回归测试、隔离 Electron 实际交互和截图检查、只读复核后执行标准 stage 构建。无提交、推送、Setup 或 OJ 协议改动。

验证预检：沿用已存在的 `npm run transpile-client`、Electron 单元入口、`tmp/home-review/validate-source.ps1`、stylelint、typecheck-client、compile-oi-extensions、valid-layers-check 和标准 stage 构建；新增拥有测试先红后绿。所有入口、模块及输入已核对；新证据写入本节，不覆盖首轮记录。隔离运行使用本地网页，不访问真实 OJ 账号。

### 修正验证记录

- 新增回归首轮受控运行 exit 1：捕获自定义模板路径编码、导航中的首页复用、返回首页焦点、空引擎、配置更新 DOM 重建和内部空白 URL 显示问题；另有测试替身缺少 dispose，已按测试问题修正。最终 `npm run transpile-client` exit 0 后，Electron 使用 `--runGlob **/browser{Home,Search,WelcomeFeature,HomeActions,HistoryFeature,RecentFiles,ProblemFeature,OjConnectFeature,UrlBarWidget}.test.js --user-data-dir=tmp/home-review/corrections-final`，exit 0，111 passing；日志 `corrections-final.log`。GPU 诊断没有造成测试失败。
- `npm run typecheck-client` 首轮 exit 1，仅测试替身类型转换缺少显式 unknown；修正后最终 exit 0（`corrections-typecheck.log`）。`npm run compile-oi-extensions` exit 0（`corrections-extensions.log`）。`npm run valid-layers-check` exit 0。源码 ESLint 与现存 JSON 解析 exit 0。
- `node tmp/home-review/corrections-runtime.mjs` 最终 exit 0。真实隔离窗口验证图标解码、八个链接七加一排布、340px 无横向溢出、当前标签返回首页后地址栏清空、焦点回到搜索框、关闭最后页／全部编辑器保持空白，以及＋新建。普通、紧凑和真正进入 wrapping 的 13 标签模式，＋与首行标签中心偏差均为 0。多行模式首轮观察到 15px 偏差，补充该模式的拥有 CSS 后重跑通过。
- 截图 `corrections-wide.png`、`corrections-narrow.png`、`corrections-wrapped.png` 已实际查看；最终多行标签另存条带截图 `corrections-wrapped-final-strip.png` 以核对修正效果。真实运行只使用本地网页和独立用户／扩展目录，未使用个人 OJ 会话。
- 首轮直接 Electron 测试进程的输出管道断开导致 EPIPE 主进程弹窗，属于测试启动编排问题，已停止该测试进程；之后受控测试全部通过 Start-Process 和独立 stdout/stderr 文件执行，并等待退出。未添加产品异常吞噬逻辑。运行脚本曾使用不存在的图标子元素及旧设置名，属于采证脚本问题，核对实际源码后修正；一次过长 shell 命令被工具策略拒绝，改为本地脚本文件执行，未改变权限。
- 独立只读 agent 核对最终所有者、模型监听、焦点、设置更新、空白 URL、旧颜色消费者，未发现可确认的阻断问题；其提出的多行对齐待测项已通过上述运行验证。主 agent 另作最终只读差异复核。无新增依赖或协议更改。
- 最终 stage 执行前仍需核对目标占用和旧数据；标准命令 `npm run gulp vscode-win32-x64-min`，300 秒上限。以本轮最终构建日志及交付说明记录实际结果；不把首轮候选构建当作本轮结果。不 commit／push，不构建 Setup。
- 构建预检已核对：标准目标无运行实例，D 盘日常实例保持运行且未操作；旧 stage 的 data 已完整保留至 `tmp/home-review/stage-data-before-corrections-20261118-113452`，新构建只带仓库 portable-data 默认数据，不导入此备份。构建执行器 `tmp/home-review/build-stage.ps1`，输出独立写入 `corrections-stage-build.log`／`.err`。最终 stylelint exit 0，52 条设计 token 建议；文档结构、JSON、ESLint 和 diff 检查均通过。
- 本轮 stage 首次构建 exit 1，54 秒：esbuild 报 `Two output files share the same path but have different contents: out-vscode-min/media/becoder-icon.png`。原因是主页引用旧欢迎页同名异内容图标，与标题栏图标发生生产打包冲突。仅把主页 CSS 改为复用 `workbench/browser/media/becoder-icon.png`，不修改通用打包器或图标资产。失败日志保留为 `corrections-stage-build-failed-icon.log`／`.err`。该 CSS 修正需重跑 transpile-client、拥有 CSS stylelint、隔离实际图标显示与交互，再执行原标准构建；先前 TypeScript、扩展和层次检查不受资源路径修正影响。
- 图标路径修正后：`npm run transpile-client` exit 0（`corrections-icon-transpile.log`）；拥有 browser.css 的 stylelint exit 0，43 条设计 token 建议；`node tmp/home-review/corrections-runtime.mjs` 受控隔离执行 exit 0（`corrections-icon-runtime.log`），图标成功解码为 1400px 源图并以 40px 显示，七加一链接、关闭末页、焦点和三种标签对齐回归全部通过，更新截图已实际查看。`git diff --check` exit 0。测试实例均已退出，仅 D 盘日常实例在运行。下次 stage 重试继续使用同一 300 秒执行器；候选构建成功与否以新日志及最终交付说明为准。

## 灰色搜索按钮与发布前轻度复核（2026-11-18）

负责人追加授权：完成灰色按钮调整后作轻度 code review、清理死代码、本地 commit 并推送 `origin/OJ_connect`。此授权取代前述阶段的“不 commit／push”交付限制；不扩大到 Setup、Release 或 PR。

- 搜索按钮采用输入框前景与背景混合的内敛灰色，保留现有尺寸、轮廓及搜索行为。隔离 Electron 实测深浅主题，截图 `tmp/home-review/palette-empty.png`、`palette-light.png` 已实际查看。
- NoteBook 新建复用原生命令，可在没有工作文件夹时打开无标题文档；文件夹选择留到实际运行或关联源码需要时。实际验证新建、编辑、原生保存为 `.bcnb`、关闭与重开。
- 独立只读复核发现首页预渲染控件早于浏览器模型就绪，首次搜索／网站导航可能丢失。入口现等待当前 input 的原生 resolve，并确认 input 未替换或释放后再导航，无额外队列、预热或重试机制。四条回归覆盖搜索、网站、标签替换及创建失败。
- 清理旧欢迎页无消费者的翻译、旧图标及其三个构建资源入口；保留旧标签恢复兼容。两项构建边界测试从旧页面结构更新为原生首页和旧标签恢复契约，未恢复旧实现以迁就失效测试。
- 验证预检追加现有入口 `node --test --test-name-pattern="native browser homepage|legacy Welcome tabs" build/lib/test/oiExtensionBoundary.test.ts`，拥有 Electron 测试沿用 `run-gray-check.ps1 green`，源 lint 与 JSON 使用 `pwsh -NoProfile -File tmp/home-review/validate-source.ps1`；普通文件与删除项分别处理。提交使用正常 hook，禁止跳过。
- 两项旧边界断言首先 exit 1，更新后 exit 0。四条首次导航回归首先失败（另有旧行为未消费拒绝 Promise 的 afterEach 错误），修正后 Electron 最终 exit 0、78 passing；日志 `gray-green.log`。
- `npm run transpile-client`、最终 `npm run typecheck-client`、源码 ESLint、现存 JSON 解析和 `git diff --check` 均 exit 0。拥有 CSS 的 stylelint exit 0，保留 44 条设计 token 建议，不当作零提示。
- `node tmp/home-review/palette-runtime.mjs` exit 0：搜索按钮／Enter、清空与焦点、返回首页清空上次搜索、新标签不继承查询、地址栏无空白 URL、340px 无横向溢出以及上述 NoteBook 保存重开均通过。所有运行使用新隔离目录和本地网页，不使用个人 OJ 会话。
- 发布前 fetch 首次遇到 OpenSSL TLS 传输错误；仅本条命令采用 `git -c http.sslBackend=schannel fetch origin OJ_connect` 后成功，未关闭证书校验或更改全局配置。远端与本地基线一致。

最终提交、stage 构建和推送的实际结果以本次交付记录为准；构建前继续核对目标进程与旧数据，不把前述候选构建当作最终结果。
