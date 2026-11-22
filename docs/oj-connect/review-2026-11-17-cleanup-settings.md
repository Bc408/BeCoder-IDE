# OJ Connect 源码审查、去冗余与设置准备

后续状态：本报告保留只读审查当轮结论；获批后的修复、设置与验证见[维护实施记录](maintenance-settings-2026-11-17.md)。

日期：2026-11-17。负责人已确认 AtCoder 代码提交能力闭环且达标。本轮审查与清理不重新设计提交路径，不修复审查发现的 bug，不新增设置，不构建 stage，不提交或推送 Git。

## 对照基准与证据边界

- 当前 `OJ_connect` 分支工作区，基线 HEAD 为 `ba0d14cc6ead7ae9d4e0d8ad61ee4b7b9b73e4d3`；此前未提交改动保留。本报告的清理清单只描述本轮新增变更，不能用整个 `git diff HEAD` 代表本轮工作量。
- 本地完整 vscode-luogu **4.20.0**，固定提交 `987ca974b5419230a07b59a195ec44026e16f6f4`，路径 `tmp/oj-connect-audit/luogu-full-review/upstream`。本轮未追踪上游后续版本。
- 核对扩展命令／配置、目录识别、导入、偏好、提交与评测控制器、Webview、双站适配及对应浏览器宿主；共享渲染只追到 OJ 的实际消费路径。
- 三个只读审查分工分别覆盖工作流／宿主、设置、前端／渲染；主代理核对引用并执行删除与回归。未访问真实账号或发送新提交。
- 下列“已确认”指源码条件及本地合成复现成立，不等同于已在真实网站重现所有场景。独立的会话范围风险明确列为待验证。

## 已确认缺陷：本轮均未修复

### P2：实际评测面板覆盖 AtCoder 官网查询间隔

位置：[recordPanel.ts](../../extensions/becoder.oj-connect/src/views/recordPanel.ts) 的 `track()`、[recordController.ts](../../extensions/becoder.oj-connect/src/recordController.ts) 的等待表达式。

`RecordPanel` 对 AtCoder 总是传入 `intervalMs: 2000`，而 `RecordController` 优先采用这个值，之后才读取 `snapshot.pollAfterMs`。宿主虽然解析并交付了有效官网 `Interval`，实际页面却无法采用它。官网间隔小于 2 秒时结果刷新变慢，大于 2 秒时又可能过度查询。

内存加载实际 `RecordPanel` 和 `RecordController`，模拟首次 judging、官网间隔 750ms、第二次 AC；观测到等待 **2000ms**，而非 750ms。现有控制器单测通过，却没有覆盖面板传参这个集成缺口。洛谷仍依赖推送等待，不能把两站的节奏强行统一为一个常数。

后续最小修复候选：仅洛谷显式传 0，AtCoder 不覆盖控制器的官网间隔／缺省策略；补面板层回归。

### P2：打开洛谷题面静默覆盖失效的编译器偏好

位置：[problemPanel.ts](../../extensions/becoder.oj-connect/src/views/problemPanel.ts) 的 `open()`，以及 [workflowController.ts](../../extensions/becoder.oj-connect/src/workflowController.ts) 的语言选择。

已有偏好不在本题可用目录时，题面直接取 `languages[0]` 并记为新的窗口偏好。随后快捷键提交把它当作有效选择，不再询问。与[共同流程设计](shared-workflow-design.md)“语言不存在时要求重新选择，不静默改为其他版本”不符。

实际 `ProblemPanel` 合成输入：已存 `cpp23`、本题仅有 `cpp14`，只打开题面便观测到 `selectLanguage('cpp14')`。未打开题面直接提交时，控制器原本会要求选择。首次完全没有偏好时使用洛谷默认项，与已有偏好失效是不同情况。

后续最小修复候选：区分“尚无偏好”和“已有偏好失效”，后者保持未选择，由用户明确选择；不另建偏好框架。

### P3：复制按钮不能直接通过键盘进入

位置：[styles.css](../../extensions/becoder.oj-connect/webview/styles.css) 的 `pre.markdown-code > .copyButton`，以及 [codeCopy.ts](../../extensions/becoder.oj-connect/webview/luogu/codeCopy.ts)。

控件默认 `visibility: hidden`，只有 hover／focus-within 时可见；父级 pre 本身不可聚焦，因此键盘无法先进入以触发 focus-within。当前 CSS 的 Chromium 探针中，从代码块前一个按钮按 Tab 会直接跳到后一个按钮；先用鼠标 hover 才能 Tab 到复制按钮。正文代码、样例与编译输出共用该实现。

这是上游同类隐藏方式也存在的缺陷，不能把“沿用洛谷代码”当作可访问性已经正确的证据。后续可在不改变常规视觉的前提下调整焦点可达性。

### P3：原生 HTML 的内部锚点链接丢失目标

位置：[共享 parser.ts](../../extensions/becoder.shared/content/parser.ts) 的 `schema` 与 `parseHtml()`。

清洗规则将全局允许属性收窄为 `className`，删除作者 HTML 的 `id`，但保留 `href="#details"`。合成输入 `<a href="#details">details</a><h3 id="details">Details</h3>` 输出 HAST 仍有链接，标题却没有目标 id，因此无法跳转。

该问题适用于含内部导航的原生 HTML；本轮未找到并验收一个实际 AtCoder 题号，不宣称所有题目受影响。后续需设计安全且一致的 id／href 重写，不能简单放开任意 id 而忽略清洗器的 DOM 命名冲突防护。

## 待验证风险

**洛谷评测中切换浏览器数据存储范围可能释放错会话。** [browserOjConnectFeature.ts](../../src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts) 的洛谷 `readRecord`／`releaseLuoguRecord` 每次重新调用 `luoguSessionId()`；记录没有像 AtCoder 一样固定其原存储范围。若在推送等待期间修改 `workbench.browser.dataStorage`，后续读取或关闭可能作用于新 Session，旧 Session 的推送未被及时释放。[luoguSessionClient.ts](../../src/vs/platform/browserView/electron-main/luoguSessionClient.ts) 的 `releaseRecord()` 只清理当前客户端中的 track。

本项来自调用链核对，尚未用完整宿主夹具或真实切换复现。后续应先验证“旧读取等待＋范围切换＋关闭记录”的资源生命周期，再决定修改；不据此新增会话管理层。

## 已清理的死代码与冗余

1. 删除无生产入口的旧 `readAtCoderSubmission` 实验接口、主进程实现、公共 DOM 探针、实验快照类型及其专属测试。该链路早期用于把当前详情导出 JSON，现有工作台命令与 OJ 生产链路已不调用它。旧 DOM 解析与当前正式 HTML 解析并存，属于可以确定移除的重复路线。
2. **保留** `parseAtCoderRecordHTML`、`detailRoute`、`decodeAtCoderHTML`、`extractAtCoderSourceHTML`、`checkAtCoderSourceResponse`，以及四个相关解析测试。它们仍被当前交题核对、评测和账号读取使用；没有删除整个 AtCoder 解析模块。
3. 删除共同面板没有生产消费者的八个 label：`openOriginal`、`waiting`、`sample`、`time`、`memory`、`verification_matched`、`verification_unavailable`、`verification_not-checked`，同步删除专属中文翻译及测试夹具中的闲置字段。**保留 `openOriginal` 动作和链接**，也保留源码核对逻辑；只删除未显示的文案。
4. 修正渲染测试中“颜色跟随当前主题”的陈旧断言文案，断言本身仍要求颜色保持固定。架构文档移除已不存在的实验读取现况描述；历史可行性记录保留其历史语义。

没有为追求删除数量处理通用 CSS。作者题面 class、动态状态键与共享生成节点仍可能消费它们；例如 `.oj-input-format` 明确由共享解析器生成，不能误判为死样式。本轮也没有把上游的失效设置导入本项目。

## 对复用与抽象的判断

| 当前实现 | 上游对照与判断 |
| --- | --- |
| 题面／评测 JSX、提交区、控件、日期、复制生命周期 | 已从固定版本迁入或裁剪适配，来源见 [UPSTREAM.md](../../extensions/becoder.oj-connect/UPSTREAM.md)；不能因本地文件名不同便认定重新发明。 |
| `MarkdownService` 缓存、并发去重、按需加载 | 沿用上游模式，输出适配为安全 HAST。共享代码渲染已统一，不建议恢复高亮 HTML 往返或再建一套 renderer。 |
| 共同工作流与两站 adapter | 共同层表达用户动作、源码快照与正式记录；各站负责真实协议和更新方式。不是应直接抹平的重复；洛谷推送与 AtCoder 查询应继续各自成立。 |
| 受限 browser host、页面租约、会话与回执校验 | 扩展／工作台／原生进程拥有不同权限，存在多层不等于过度解耦。未发现可在保持权限、单次发送和旧回执排除条件下整层删除的证据。 |
| 源码 identity、目录校验、既有稿保护、CPH 窄接口 | 服务于 BeCoder 的用户资产边界；洛谷插件没有同一安装／进程边界，不能据其更短而直接删掉这些保护。 |

没有发现需要新增通用注册表、提交策略框架或后台队列的理由。当前更值得处理的是上述具体缺陷及少量残留，而不是再次搬动已验收的提交架构。长公式裁切假设已通过本地窄栏探针排除，本轮不列为 OJ 缺陷。

## 设置页面准备：逐项对照洛谷 4.20.0

当前 OJ Connect 只公开 `becoder.ojConnect.directories`。AtCoder 题面语言与 C／C++ 版本存在本机 Memento 中；洛谷版本偏好在当前窗口内存中。下面只是建议，不表示新增设置已获产品确认或已经实现。

| 洛谷设置 | 实际上游消费者／用途 | OJ Connect 建议 |
| --- | --- | --- |
| `defaultLanguageVersion` | `workspaceUtils.askForLanguage` 与题面提交区，按语言族选择默认版本 | **优先准备**按站点、C／C++ 暴露默认编译器。只能使用当前站点实际可用项；不硬搬洛谷静态版本名，不以设置替换有效性检查。先解决失效偏好 bug。 |
| `alwaysUseDefaultLanguageVersion` | 快捷键中跳过可用默认版本的选择；无效时仍询问 | 当前已实现有效偏好直接使用。暂不再增加一个平行开关；明确默认版本和手动改选入口即可。 |
| `webviewViewColumn` | 共同 helper 提供 `Beside/Active/One/Two/Three`，题面、记录等创建时读取 | **可选准备**统一面板位置设置，默认保留当前复用源码右侧编辑组的策略。先一项共同设置，不拆成两站、题面／记录的多套矩阵；已有面板不自动搬动。 |
| `guessProblemID` | 控制是否自动采用 CPH／文件名猜测；关闭仍会计算并预填 | 保留现有目录＋文件名规则与失配输入，不照搬 CPH 优先，不为已固定主流程增加开关。 |
| `showRecordPanel` | 仅 manifest 声明，4.20.0 源码没有读取；记录命令仍创建面板 | **不引入**。截图中的设置并不能证明上游真正支持关闭；也与当前提交后直接展示结果的目标相悖。 |
| `cphStyle` | 改发往外置 CPH 的名称，以影响其新建源码文件名 | **不引入**。OJ 已绑定当前源码，CPH 只导入样例。 |
| `cphPort` | 外置 CPH HTTP 端口，默认 27121 | **不引入**。BeCoder 使用内置命令衔接，不需要本地端口。 |
| `maxHistoryLength` | 持久浏览历史裁剪，涵盖题目／比赛／题单 | **不引入**。侧栏仅管理登录，不借设置恢复历史系统。 |
| `defaultProblemSet` | 随机题来源默认筛选 | **不引入**，随机题已明确裁剪。 |
| `defaultDifficulty` | 随机题难度默认筛选 | 同上。 |
| `showSelectProblemsetHint` | 随机题时是否询问来源 | 同上。 |
| `showSelectDifficultyHint` | 随机题时是否询问难度 | 同上。 |

另一个 OJ 自身已有、值得准备显式入口的偏好是 **AtCoder 题面默认语言（英／日）**：默认英文，保留页面即时切换；目标题没有所选语言时采用真实存在的内容，不生成空翻译。洛谷只有一种内容时不显示多余控件。是否作为用户设置公开、是否与已有 Memento 合并，留待下一步决策；应由一个入口拥有取值优先级，不能把设置和隐藏记忆变成两套竞争状态。

固定 One Monokai 高亮主题继续保留，不建议新增主题跟随、渲染引擎、Worker 数量、缓存容量、网络超时或验证时长等设置。它们要么已有负责人明确决定，要么属于内部实现参数。账号不放入普通设置；会话继续由内置浏览器拥有。

## 本轮验证与交付边界

执行前核对当前脚本、配置、模块与普通文件输入；精确命令在忽略目录 `tmp/oj-connect-audit/review-20261117/validation-plan.json`，退出码／日志在 `tmp/oj-connect-audit/shared-workflow/review17-*.json` 和同名 `.log`。

已确认缺陷的控制器复现入口为 `node tmp/oj-connect-audit/review-20261117/reproduce-findings.cjs`；它加载实际 TypeScript 并替换 UI／网络边界，只观察问题，不修改生产代码、不读取个人数据。

验证结果：扩展四项 TypeScript 检查、80 项 Node 测试及内容／缓存回归、27 项核心 Mocha 测试、扩展生产 bundle、双站生产页面渲染回归、客户端类型检查和 scoped ESLint（零警告）均退出 0。实际页面渲染回归覆盖公式、高亮、样例原文、复制、窄栏、蓝色评测动画与终态停止，最终重跑耗时 13.32 秒；文档结构、链接、JSON 与差异空白检查也通过。测试通过只说明现有回归与本轮删除兼容，不代表上面列出的 bug 已修复。本轮没有 stage／Setup、真实网站新提交、commit 或 push；此前 stage 不包含本轮源码清理。
