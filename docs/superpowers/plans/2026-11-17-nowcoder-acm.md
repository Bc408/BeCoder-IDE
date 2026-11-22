# 牛客 ACM 接入 OJ Connect 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 executing-plans 按任务执行；只有负责人另行选择并行实施时才使用 subagent-driven-development。每项先写有意义的失败用例，再完成最小实现和受影响复验。负责人已授权实施、测试和干净 stage；Git 操作未获授权。

**Goal:** 将已验证的牛客 ACM 官网提交路线接入现有 OJ Connect，完成源码、题面／样例、快捷键交题及本次正式结果的统一体验。

**Architecture:** 牛客适配器复用现有扩展控制器与洛谷式共同页面。原生宿主通过当前持久 Session 执行固定 ACM 读取与单次表单 POST，正式记录独立查询；不创建提交网页，不引入现代备用路线或通用请求框架。

**Tech Stack:** TypeScript、Electron Session、现有 Extension API、React 共同页面及共享 HTML／公式／高亮管线；负责人已批准主进程生产依赖 Acorn 8.16.0，仅解析静态字面量，不执行远程代码。

**Spec:** [接入设计](../specs/2026-11-17-nowcoder-acm-design.md)；[可复用的正式证据摘要](../../oj-connect/nowcoder-protocol-evidence.md)。状态：实施及验证中；负责人已确认文件命名，并决定三站统一采用洛谷式 120 秒本地跟踪、保留记录和继续查询。未完成任务不能标为已交付，执行前仍需审阅本计划。

## Global Constraints

- 首批仅公开 ACM 标准输入输出题与已结束、公开、个人可提交的比赛题；完整 C／C++ 程序，不改写学生源码。
- 单一 `/nccommon/submit_cd` 发送、`/nccommon/status` 读取；成功标准是官网记录和评测语义，不校验 ID 必须以 8 开头。
- 常规提交不创建、导航或显示浏览器网页；共享真实 Session，凭据不交给扩展／Webview，不增加账号库。
- 当前源码快照、单次消费、并发立即拒绝、回执后释放、独立查询、未知受理不重发沿用共同边界；不加队列、预热、页面池、通道切换或新认证。
- 复用现有洛谷组件、内容渲染和 CPH；除明确批准的三站本地跟踪边界统一外，保护洛谷、AtCoder、普通浏览器及已有 CPH parser 的其他场景。
- 三站每轮本地自动跟踪约 120 秒，停止后保留记录并允许继续查询；推送／HTTP及官网Interval各自保留，不扩张为统一频率或新调度器。
- 偏好按站点和 C／C++ 分开。缺失分数／测试点／单位不猜；未结束不显示占位0分，真实终态0分不隐藏。
- 最终交付干净 stage，不继承旧 data 或研究 profile。产品实施、真实验收、构建和 Git 发布分别授权、分别记录。

## Review Focus

- 同一内部题目的公开／比赛身份不能串用：任务 1、2、4。
- 发出后超时、307跳转、重复命令或取消晚到不能二次发送：任务 2、3。
- 登录轮换、退出、跨窗口／存储范围以及旧请求迟到不能串号或假掉线：任务 2、3。
- 顶层响应、未知状态、错误对象、缺失分数和 CE 前缀不能误报成功／破坏源码：任务 1、5。
- 正式 ID 后面板慢加载、关闭重开和查询失败不能占住发送或丢失已有结果：任务 4、5、6。

## 开始执行前

- [x] 负责人确认 `18204.cpp`／`5657_A.cpp` 保留入口身份；失配提示、不自动转换。确认三站沿用洛谷的 120 秒本地等待、保留记录及继续查询行为。此框只记录设计决策，不代表源码完成。
- [ ] 读取 AGENTS.md、VISION.md、设计与当前源码；刷新分支、HEAD、dirty paths。重新取得理解证明与本轮实施授权，不由本计划推导 commit／push 权限。
- [ ] 按现行文件和 package scripts 预检验证命令；现有 `scripts/test-oj-connect.cjs` 依赖本地生成 bundle，不能在未准备输入时直接运行并当产品失败。

## Task 1：核准剩余只读协议并固化身份／数据解析

**Files:**

- Create: `src/vs/platform/browserView/electron-main/nowcoderProtocol.ts`、`src/vs/platform/browserView/test/electron-main/nowcoderProtocol.test.ts`。
- Modify: `docs/oj-connect/nowcoder-protocol-evidence.md`，补齐下面的真实来源和单位；仅确有必要才改运行时依赖及许可。

**Interfaces:**

- 消费既有 `ProblemRef`、`ProblemDocument`、`LanguageOption`、`RecordRef`、`RecordSnapshot`；不新增第二套 DTO。
- `assertNowcoderProblem(problem: ProblemRef): void`：严格校验 site、nativeId、固定 HTTPS host及规范 URL。
- `nowcoderRecord(problem: ProblemRef, id: string): RecordRef`：正整数 ID，固定官网详情路径 `/acm/contest/view-submission?submissionId={id}`。
- `parseNowcoderStatus(record: RecordRef, raw: unknown): RecordSnapshot`：先验证业务结构与原 ID，再转换状态；纯函数、无网络。
- client 私有准备上下文至少保留 questionId、tagId、subTagId、doneQuestionId、有效语言和必要权限事实；不塞入公共 ProblemRef。

- [ ] 只读核对官网 ACM 语言配置及逐题允许规则；记录配置资源、静态读取方式、真实选项和失效行为。核准登录／退出路由、完整状态表、资源单位及可选分数来源。没有证据的字段省略，不拼装猜测参数。
- [ ] 先断言公开18204和5657/A得到不同 nativeId／场景参数但相同内部 qid235780；非法host、凭据URL、冲突ID被拒绝；业务错误／错误对象／无ID不成为合法终态。运行 focused RED。
- [ ] 使用现有安全解析能力实现静态数据读取与纯映射；不 eval／执行官网脚本。若需要新增解析依赖，先说明理由和归属并对齐，不因本机node_modules已有包就直接运行时引用。
- [ ] 测试顶层返回、AC／WA／CE、未知状态、pending零值、缺失分数、真实0分、通过率不当分数、isShowTestCase=false、CE0/0；按实际资料补齐而非固定假状态。
- [ ] 运行 client typecheck 后 focused core tests，RED/GREEN各自记录。任何新增fixture只保留最小人工或脱敏数据，不复制整页账号材料。

**交付门槛：** 无网页生产语言获取及身份／单位未核准时，只完成可证明的解析部分，后续发送任务不得绕过门槛。涉及新产品边界时回到 brainstorming。

## Task 2：原生 Session 固定操作与一次发送

**Files:**

- Create: `src/vs/platform/browserView/electron-main/nowcoderSessionClient.ts`、`src/vs/platform/browserView/test/electron-main/nowcoderSessionClient.test.ts`。
- Modify: `src/vs/platform/browserView/common/browserView.ts`、`src/vs/platform/browserView/electron-main/browserViewMainService.ts`；补进实际发现的显式 IPC 白名单，不假设 ProxyChannel 自动等于完整接通。
- Test: 使用既有同版本 Electron 拦截 fixture 模式，新增 `scripts/test-nowcoder-session.cts` 及有正式入口的构建／运行脚本，不能依赖研究目录已有临时 bundle。

**Interfaces:**

- client 依赖绑定当前窗口与范围的 `Session.fetch`，支持 AbortSignal；固定的 `readProblem`、`loginSummary`、`prepare`、`send`、`readRecord`，无任意 URL 暴露。
- `prepare(problem, signal)` 返回站点内部上下文、真实语言及账号身份；`send` 接收已核准上下文、当前源码／语言和单次任务身份，返回既有 `SubmissionOutcome`。
- main service 暴露 scope／window 绑定的牛客语义操作；扩展不指定任意窗口，read／send／release 不依赖标签 id。方法签名与现行 BrowserSession 归属统一后固定在同一任务提交中。

- [ ] RED：没有任何远程网页也能GET／POST／查ID；仅允许设计端点，逐字段断言 form-urlencoded 和公开／比赛上下文；更换语言标签不能改变未授权ID。
- [ ] RED：模拟服务器受理后响应丢失，只发一次并返回unconfirmed；307不跟随重放POST；成功仅接受code／正式ID等已核准结构；同句柄重复send被拒绝。
- [ ] 以最小client实现固定请求、响应大小／时间限制、一次发送边界和取消。复用已有会话获取方式，不搬洛谷HTTPS／CSRF／WebSocket，不用现代judge授权。
- [ ] RED→GREEN：取消后准备迟到零POST；请求发送后中断不宣称not-sent；旧finally不删新任务；身份／scope变化在发送前中止；正式回执后不等待额外详情GET。
- [ ] 实现真实摘要，网络异常为unknown；共享登录／退出遵照任务1证据，去除同范围并发摘要请求的重复工作，旧读结果不覆盖新登录。不得清空全站Cookie。
- [ ] 将合成Electron测试接成可复现命令，正式记录确切构建输入、Electron入口及退出结果；不混用真实账号profile。

## Task 3：受限命令、句柄与账号生命周期

**Files:**

- Create: `src/vs/platform/browserView/common/nowcoderBridge.ts`、`src/vs/platform/browserView/test/common/nowcoderBridge.test.ts`。
- Modify: `src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts` 及同所有者 `test/electron-browser/browserOjConnectFeature.test.ts`、`src/typings/becoder-oj-connect.d.ts`。

**Interfaces:** 固定命令前缀 `_becoder.ojConnect.nowcoder.`；prepare／send／cancel／release／readProblem／readRecord／loginSummary／reconcile／login／logout 按现有adapter所需接通。prepare对扩展仅交付句柄、语言及hasDraft=false；新增牛客专用prepared／payload类型，不让它引用 `ILuoguPrepared`。reconcile只读取，缺少唯一证据维持unconfirmed。

- [ ] RED：非法站点／URL／句柄、跨窗口调用、已消费句柄拒绝；正常固定命令调用绑定本窗口及当前scope。
- [ ] 实现最小站点bridge；不提取通用bridge基类，不改写AtCoder／Luogu生命周期。
- [ ] RED→GREEN：关闭普通浏览器不影响Session读取；只显式login打开网页；所有submit/read路径不触发openPage／reveal。release不关闭用户页面。
- [ ] RED→GREEN：登录变化、存储范围切换、扩展停用及窗口销毁后旧任务不晚发；已有记录按原会话读取，不从新账号继续；显式释放覆盖当前共同releaseRecord分派。
- [ ] 补齐三站事件／白名单并执行client typecheck与聚焦core/workbench回归，保留双站原断言。

## Task 4：扩展适配、题目识别、偏好及导入

**Files:**

- Create: `extensions/becoder.oj-connect/src/adapters/nowcoder/{task,adapter}.ts`、`test/nowcoderAdapter.test.ts`、`test/nowcoderTask.test.ts`。
- Modify: 扩展 `src/adapters/adapter.ts`、`src/browserHost.ts`、`src/domain.ts`、`src/extension.ts`、`src/problemResolver.ts`、`src/preferences.ts`、`src/views/loginModel.ts`，及对应test。
- Modify: 扩展 `package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`。
- Modify: `src/vs/workbench/contrib/browserView/electron-browser/features/browserProblemFeature.ts` 及对应导入测试。

**Interfaces:** `nowcoderProblem(input: string): ProblemRef | undefined`、`NowcoderAdapter implements OjAdapter`、`CommandNowcoderHost`；继续复用现有 `SubmissionSession`、`ImportController`、`SubmissionController`、`RecordController`。命名规则必须使用负责人最终确认值。

- [ ] RED：确认后的文件名／URL正反向解析、站点目录优先、自定义目录、歧义输入、公开与比赛不互换；无站点目录的 `18204.cpp`／`5657_A.cpp` 提示输入，显式牛客目录及输入框仍可解析；`validateProblemRef`、`validateRecordRef`接受三站并拒绝跨站记录。
- [ ] RED：`nowcoder.cCompiler`／`nowcoder.cppCompiler`与洛谷／AtCoder独立持久化；失效编译器重新选择，不静默换版本。settings默认空字符串、application scope，值只能来自本题可用目录。
- [ ] 装配第三adapter及host、更新双站硬编码和输入文案／本地化；只扩充必要分派，不新增注册中心。侧栏登录菜单和模型真正可用，不只换文字。
- [ ] RED→GREEN：按键捕获未保存源码、准备期间继续编辑不影响本次、重复快捷键拒绝、hasDraft=false不弹网页替换确认、正式ID后面板仍加载不阻塞下一次显式提交。
- [ ] 浏览器ACM Import路由到OJ Connect，生成确认后的文件名；已有源码和样例保护、无根／多根选择沿用原流程；明确点击CPH才导入同源码样例。
- [ ] 运行扩展typecheck、完整tests、CPH相关parser/import回归和浏览器导入测试。保留不属于本批范围的CPH parser能力。

## Task 5：共同结果页与真实数据展示

**Files:**

- Modify: `extensions/becoder.oj-connect/src/recordController.ts`；其他 `src/views/model.ts`、`src/views/recordPanel.ts`、`webview/luogu/record.tsx` 及相邻样式仅确需时修改，优先由牛客协议模块提供现有字段。
- Test: `extensions/becoder.oj-connect/test/recordController.test.ts`、`test/render.mts`；补牛客场景，不复制独立renderer。

**Interfaces:** Task1的 `parseNowcoderStatus` 输出既有 `RecordSnapshot`；未查源码不标matched。`RecordController.track` 签名保持不变，默认本地期限三站均为120000ms；AtCoder继续优先采用官网有效pollAfterMs，洛谷推送继续由adapter拥有，牛客沿用2秒间隔。

- [ ] RED：等待无分数／资源占位零值、终态真实0分保留；无来源分数省略、通过率不当分数、无真实点表不造卡片、未知状态停止误导性完成显示。
- [ ] RED：三站长队列均在本轮约120秒停止、保留ID／最后快照；继续查询启动新一轮并且POST计数不变。用受控时钟／短测试期限，避免真实等待两分钟；覆盖正在读取或等待推送时截止，取消请求、回调不晚到。
- [ ] 去掉AtCoder无整轮截止的特判，复用共同期限、错误提示和继续查询。保留官网Interval、洛谷推送和正常终态立即停止；不为统一等待引入新的调度层。
- [ ] 复用洛谷布局／蓝色等待动画／复制控件；CE展示memo；已核准单位后才展示资源用量。首绘不等待源码／成绩详情，查询失败保留最后快照和正式链接。
- [ ] 若增加源码读取，先写CE前缀严格结构测试、普通源码首行不删测试；若没有生产消费者则不实现该专属解析器。
- [ ] 查询超时／取消／关闭重开只停止和恢复只读跟踪，不能重交；记录身份改变和跨Session结果被拒绝。
- [ ] 运行完整扩展test与test-render，查看实际宽／窄栏题面、公式、代码、样例、等待、AC／WA／CE及缺字段截图；验证两站既有页面。截图与测试分别记录，不以通过测试代替视觉检查。

## Task 6：复核、实测与干净 stage

**Files:** 当前开发／架构／扩展README、来源与许可登记及本轮实施记录；只更新实际实施事实，不把19条研究记录写成产品验收。

- [ ] 最终只读review：原始需求覆盖、所有消费者、重复解析／多余封装、未使用专用代码、迟到取消／旧finally、会话与不可逆发送边界。仅删除经调用链证明无用的代码；保留网站证据和真实保护。
- [ ] 实际复用第三方代码才更新 `extensions/becoder.oj-connect/UPSTREAM.md`、ThirdPartyNotices、组件来源及实际依赖清单；不将官网bundle假定为MIT，不随包放VSIX、研究脚本和登录数据。
- [ ] 执行前核对package scripts、真实可执行入口和每个文件输入，冻结验证台账。扩展命令：`npm.cmd --prefix extensions/becoder.oj-connect run typecheck`、`... run test`、`... run test-render`；核心focused tests使用任务1/3实际新增文件，先完成拥有者编译。
- [ ] 核心Node回归示例：`npm.cmd run test-node -- --run src/vs/platform/browserView/test/electron-main/nowcoderProtocol.test.js`，bridge同理；适用的Electron/workbench测试使用仓库实际入口。定向eslint、必要layers、边界与许可检查由实际改动推导，预检后写入台账，不照抄旧临时bundle路径。
- [ ] 使用获准隔离实例／同会话实测公开题和已结束比赛题，覆盖正确、错误、编译失败；逐条核对新ID、账号、目标题目、语言、源码和官网记录分数／长度。C如果未实测明确标出；认证／限流实况未观察不得写成已通过。
- [ ] 采集按键→进度、metadata／语言、POST→ID、ID→面板首绘、查询→更新和终态，各样本分别报告；避免侧栏刷新串行阻塞和重复详情读取，不宣称固定秒数或稳定p95。
- [ ] 正式顺序：`npm.cmd run typecheck-client`（120秒）、`npm.cmd run compile-oi-extensions`（120秒）、`npm.cmd run gulp vscode-win32-x64-min`（300秒）。失败分类、修复和最小重跑准确记账。
- [ ] 交付构建前核对固定目标 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64` 和正在使用的实例。已有数据不迁入；如替换占用或涉及保留／移除旧目录，先按当次授权安全处理，不修改日常D盘实例、不越界清理缓存。
- [ ] 提供空白数据stage由负责人验收；测试profile不写入交付目录。只交付stage，不隐含Setup、package verifier、commit、push或外部发布。标准构建完成后按AGENTS停止，不自动启动验收。

## 实施前文档验证台账（历史）

本轮只新增设计、证据与计划，更新开发入口。预检已确认PowerShell／Python／Git入口及五个Markdown普通文件；正式清单如下，工作目录均为仓库根：

| 命令 | 输入／用途 | 结果 |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\develop-becoder\scripts\validate-project-docs.ps1` | 正式文档结构；不证明需求或实现正确 | 首轮及决策落盘后复验exit0 |
| `python tmp\oj-connect-audit\nowcoder-20261117\check-planning-docs.py` | 五份本轮文档、15个新增本地链接、新文件空白和改动范围；临时校验器不作为产品依赖 | 首轮及决策落盘后复验exit0 |
| `git diff --check` | 已跟踪文档差异空白；新文档另由上一项检查 | 首轮及决策落盘后复验exit0 |

未运行产品源码、真实交题或构建检查。实施阶段按最终改动重新预检，不沿用本节当产品验证。只读内容审查另外核对：所选链路、公开／比赛身份、三站等待新决定、缺字段语义、来源许可、采证与产品事实分列。
