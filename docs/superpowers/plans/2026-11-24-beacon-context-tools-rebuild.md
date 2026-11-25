# Beacon上下文工具重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划建议本会话Native执行、独立只读复审；最终执行方式由负责人选择。文件生成不代表已开始实施，不授权Git提交、推送或发行。

**Goal:** 将已收敛的九项工具、三个近期业务队列和Notebook编译复用接入真实生产链，保留简洁接口、真实来源和原有用户执行行为。

**Architecture:** 执行owner提供普通执行事实，采集适配器整理为一份程序及其多组输入结果，Store原子发布当前.beaconWork的三个队列。ContextTools按业务能力分开注册工具；LLM判断题目、运行、当前代码之间的关系。代码读取无额外存储，完整代码／记录接入既定压缩，Notebook执行不依赖Beacon采集。

**Tech Stack:** 现有TypeScript、Code - OSS服务／IPC、Node文件存储、扩展API、AI SDK、node:test、Mocha；不增加运行依赖、数据库或事件总线。

**Spec:** [设计基线0.4](../specs/2026-11-23-beacon-tool-interface-simplification-design.md)；[架构](../../beacon/architecture.md)、[阶段设计](../../beacon/foundation-design.md)、[需求](../../beacon/prd.md)、[压缩合同](../../beacon/context-compaction.md)。

日期：2026-11-24。状态：负责人已确认本会话实施，Native执行；候选基于Beacon_Next@74d09ef4e784fb29607569bb297131d739742ef4，源码与文档改动未提交。当前进度／证据见implementation-status及本机计划台账。旧执行计划及旧模型成绩不构成本计划的开发／验收证据。

执行进度：Task1—8已完成：725项拥有者回归、独立只读审阅及4项重要问题修复、36回合有限模型观察、报告和stage已交付。完整stage命令两次300秒超时，官方min-ci恢复入口159.74秒退出0；整仓lint既有失败与新增诊断为0分别记录。详见[能力报告](../../beacon/evaluation/2026-11-24-context-tools-rebuild-report.md)。工程观察接点目前仍是unknown适配而非下文预期的有限联合，列为明确技术债，不将计划接口当作已落实类型。后文准备时态和步骤保原审阅含义，以本段及实际报告区分设计／实现／验证。负责人GUI验收未完成，本轮无Git或发行操作。

## Global Constraints

- 九项工具：readCurrentCode、readProblemRecord、readRunRecord、readVerdictRecord、fetchProblem、inspectFile、readPage、readMaterial、browseWeb。inspectFile最终使用单数模型工具名，复用现有FileTools；移除inspectContext操作并集和editNotebook模型入口。
- 三个队列仅在当前正常所选.beaconWork跨对话共享：problem13条、run三来源共30条、verdict20条。无根／异常不采集、不写替代位置、不补采；有效根Blackout也采集，但模型不能列／读持久来源。
- problem以规范化后的problem（oj＋problemId）与实际filePath字段共同去重；相同则删旧项，以新ID和新viewedAt入尾，不同路径分别占位。filePath无可靠值为null，不补旧路径；不存题面。
- run不去重，只在程序组结束／失败／取消后入队；无活动占位、题目身份／候选或runtimeLimits。CPH仅编译不记录；运行请求编译失败仍记录。CPH特判只保check结果，不存检查器代码、类型、配置、路径、命令或诊断。
- 每条run的编译及所有input实际程序输出合计8192 UTF-8正文字节，超限保头尾和真实省略量；不计源码／input／expected／元数据。CPH程序输出分流，Runner／Notebook程序输出合流；不改变执行器本身的限制。
- verdict只采完整最终结果；同oj、同problemId且可靠实际提交代码完全相同则移除旧项，新结果入尾。正文严格相等，不归一化空白、换行或注释；缺代码保留且跳过去重。
- readCurrentCode一次读调用当下所有可见分屏C/C++整稿，含dirty及未命名页面（filePath:null），不读后台标签、不打开资源、不要求模型选择pageId／version。codesnap全部撤回，普通历史、执行稿和提交稿保各自身份。
- 三记录工具空参列全部保留目录，ID整读；不加producer／revision／part／分页，不因模型余量二次裁剪。完整工具交换闭合后计量，沿原90%主动线、约60%目标、同一步至多一次恢复；整理不递归、不重新执行工具。
- fetchProblem只用oj＋problemId，复用五站Get Problem核心只读解析；与browseWeb搜索开关互不影响。无专门缓存／持久题面、用户行为回写、面板／导入／保存／登录／提交副作用。
- 运行／测评事实不由readPage、inspectFile、终端渲染或Notebook outputs绕读。模型不写学生源码、不Shell、不自主运行／停止／登录／提交；不恢复上轮对象、强制绑定或固定取材流水线。
- Notebook同一代码块本次操作编译一次、各input独立进程；点击时固定内容，失败继续、用户停止整个批次。无跨次编译缓存，不把不同代码块按正文合并；采集失败不影响执行、取消、清理和原生结果。
- 修改限本计划所有者；保当前dirty文档、用户数据、原生草稿／历史／附件、源码及Notebook独立能力。新增可见文案遵循原中英文／状态标题规则；不改许可证、安装元数据或发行版本。
- 不沿用旧API评测、备份提交或发布授权。本计划通过后按所选方式实施；准备阶段仅文档的边界已由负责人后续实施授权更新；仍不授权Git或发行。

## Review Focus

- 运行中换根、根被替换、采集失败或晚到回调：不把结果写进另一个根，不拖住执行owner释放，不排队重放（Task2、3）。
- Notebook点击后编辑／调序／删除单元格、某input超时或用户停止：本次计划固定，单程序一次编译，真实失败与未执行分开（Task4）。
- CPH单跑原第5点、Python特判超时、真实空expected及19位整数：保原序号和文本，只保check，不能把检查器失败改称学生程序超时（Task3）。
- 老聊天、弃分支、已完成工具后连接中断、Blackout读取：历史可打开，撤回入口不执行、不借材料或缓存恢复持久权限（Task6、7）。
- 多个大输出流、UTF-8边界及完整结果超过模型容量：总保留8192字节、事实不被二次裁剪，压缩一次后仍不够则容量失败（Task1、6、7）。

## 1. 变更地图与依赖

路径均相对仓库根；以下“新增”是实施目标，本轮未创建产品文件。只按需要拆出职责明确的小模块，不为每个工具建框架。

| 所有者 | 实施文件 |
| --- | --- |
| 共享DTO与新记录规则 | 修改src/typings/becoder-beacon.d.ts；src/vs/platform/beacon/common/beaconContextTypes.ts、beaconContext.ts；新增src/vs/platform/beacon/common/beaconRecords.ts |
| 存储／IPC | 修改src/vs/platform/beacon/node/beaconStore.ts、beaconCoordinator.ts；electron-main/beaconContextMainService.ts；workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts |
| 输出采集／Runner | 新增extensions/danielpinto8zz6.c-cpp-compile-run/src/executionResults.ts、runRecordAdapter.ts；修改beaconEvidence.ts、runnerProcess.ts、compile-run-manager.ts、extension.ts |
| CPH | 修改extensions/becoder.cph/src/execution.ts、toolchain.ts、judgeView.ts、judgeSession.ts；不改用户题目和检查器资产 |
| Notebook | 修改extensions/becoder.notebook/src/model.ts、extension.ts和build.mjs必要测试接线；Runner侧notebookProcess.ts、extension.ts；必要共享类型在executionResults.ts |
| 可见页面 | 修改src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts及platform/beacon/common/beaconPages.ts必要测试接点 |
| 九工具 | 修改extensions/becoder.beacon/src/contextTools.ts、contextToolContract.ts、context.ts、provider.ts、extension.ts、connections.ts、prompts.ts；fileTools.ts／webTools.ts仅作必要接线 |
| 五站取题 | 修改extensions/becoder.oj-connect/src/extension.ts及现有解析入口；重点核对adapters/nowcoder/task.ts规范ID往返，不重写五站解析 |
| 历史／压缩 | 修改Beacon的history.ts、session.ts、protocol.ts、compaction.ts、contextBudget.ts中受工具契约影响的部分；不重设计压缩算法 |
| 回归 | 扩展各自现有test目录；原生src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts；必要新测试写入原生beaconRecords.test.ts并由相同测试入口运行 |

依赖：Task1 → Task2；Task3、Task4、Task5可在接口冻结后分别推进；Task6接入Task2—5；Task7移除旧入口并收口；Task8全链回归与交付。Notebook不是单独延期事项。

## 2. 工程接口基线（随本计划审阅）

### 2.1 模型看到的请求

~~~ts
readCurrentCode({})
readProblemRecord({ id?: string })
readRunRecord({ id?: string })
readVerdictRecord({ id?: string })
fetchProblem({ oj: 'luogu' | 'codeforces' | 'atcoder' | 'nowcoder' | 'lanqiao', problemId: string })
inspectFile({ operation: 'read' | 'list' | 'find' | 'search', path: string, query?: string, offset?: number, limit?: number })
readPage({ id: string, version: string, offset?: number, limit?: number, pageNumber?: number })
readMaterial({ id: string, offset?: number, limit?: number })
browseWeb({ operation: 'search' | 'fetch', query?: string, url?: string })
~~~

全部沿真实JSON Schema和执行时校验，additionalProperties:false；ID非空，null不能冒充省略。文件、页面、主动材料和普通网页保原读取能力／已有范围参数；只有新记录及当前代码整读不分页。页面／主动材料的安全元数据沿现有describe入口，不注入三个共享队列目录，不增第十个目录工具。PDF参数只保既有接线，本轮不扩OCR／复杂提取。

新语义工具成功外壳：当前代码为{files:[{fileName,filePath,isDirty,code}]}，三记录工具为{records:[目录项]}或{record:完整记录}，fetchProblem为{problem,document, retrievedAt}。fetch的document复用已清洗的标题、题面、样例及限制，不携带登录／选编译器UI；返回实际可得语种，不新增locale选择矩阵。既有文件／网页工具保其现有返回结构，不为统一外壳重写通用能力。

新语义工具失败统一为{error:{code,message}}；code限定invalid_arguments、unavailable、not_found、read_failed、network_error、login_required、parse_error。取消沿AbortSignal中断，不包装成成功或可自动重试事实。message沿既有脱敏和本地化，不暴露堆栈／密钥；不存在和已淘汰不建墓碑区分。description只写各自用途，教学、ID不转述等进入system。

### 2.2 三种持久记录

run字段完全沿设计§6.3—6.5，并应用最新删减：无runtimeLimits、无题目、无检查器详情、无compile-only。目录不含正文；摘要由harness按实际字段确定性生成，最新入队在前显示。

problem完整字段为id、problem:{oj,problemId}、filePath:string|null、viewedAt:带时区ISO时间。不加题面、永久关联历史、模型解释或另一个源码副本；目录直接使用这些短字段。

verdict完整字段为id、problem:{oj,problemId}、filePath:string|null、observedAt、submission、result。submission承接可得id、url、submittedAt、language、code、codeLength、sourceVerification；result承接rawStatus、score、time、memory、compileMessage、compileSucceeded、testCaseSummary、groups。原站字符串及单位原样保留，不把19位整数转为Number。缺项省略，不补隐藏测试，不把当前编辑稿补成提交稿；目录仅给ID、题目、文件、时间和简短结果，不注入提交源码／逐点正文。

### 2.3 内部交接

~~~ts
type BeaconRecordKind = 'problem' | 'run' | 'verdict';
interface IBeaconRecordByKind {
  problem: IBeaconProblemRecord;
  run: IBeaconRunRecord;
  verdict: IBeaconVerdictRecord;
}
type IBeaconRecordWrite<K extends BeaconRecordKind> = Omit<IBeaconRecordByKind[K], 'id'>;
// Store：kind是内部闭包常量，模型不填写。
appendRecord<K extends BeaconRecordKind>(kind: K, input: IBeaconRecordWrite<K>): Promise<string>;
listRecords<K extends BeaconRecordKind>(kind: K): Promise<IBeaconRecordByKind[K][]>;
readRecord<K extends BeaconRecordKind>(kind: K, id: string): Promise<IBeaconRecordByKind[K]>;
// Coordinator：额外校验窗口、采集scope／读取scope及本次真实来源。
captureRun(windowId: number, handle: string, record: IBeaconRecordWrite<'run'>): Promise<string>;
// ContextTools：统一宿主分派，分别注册模型工具，不暴露operation并集参数。
execute<K extends BeaconToolName>(name: K, input: BeaconToolInputs[K], signal: AbortSignal): Promise<BeaconToolOutputs[K]>;
~~~

IBeaconProblemRecord／IBeaconRunRecord／IBeaconVerdictRecord在src/typings/becoder-beacon.d.ts定义，common/beaconRecords.ts负责纯验证、配额和队列变换，不导入扩展或执行模型。BeaconToolName／Inputs／Outputs定义在contextToolContract.ts，类型键严格等于九工具名。实体ID由Store生成UUID；程序来源、时间和正文来自owner，不能从模型参数制造执行记录。

输出保留函数在runRecordAdapter.ts：retainRunOutput(record: IBeaconRecordWrite<'run'>, maximumBytes = 8192): IBeaconRecordWrite<'run'>。按设计的跨流均分／短流余量回配算法保头尾，UTF-8边界取整；只保留实际省略信息，不存原始事件。校验、采集及发布失败分别报告，不导致补跑或核心命令失败。

普通执行接点IExecutionResultObserver为可选同步观察函数(fact: ExecutionFact):void；ExecutionFact是在executionResults.ts定义的有限类型联合，只含编译开始／结束、分阶段流输出、input结束、程序组结束的普通执行事实。观察异常由执行owner隔离，不await落盘、不反向控制进程；这些临时回调不是持久原始事件或通用事件总线。NotebookProgramCallbacks沿已有phase／output界面回调并增加该observe接点。

## 3. 旧数据与实施安全

以下是本计划提出的最小兼容策略，审批范围包含该策略，不包含清理旧资产：

- 新队列复用BeaconStore与既有文件发布方法，写入.beaconWork/cache/context/problem.json、run.json、verdict.json，各一个{version:1,records:[...]}。只激活这一套队列，不另建索引、详情正文库、归档或镜像；临时发布文件不是第二套存储。
- 旧cache/runner、cph、notebook、problem、oj及会话code-snapshots.json不自动删除或迁移；旧原始事件不足以直接证明新记录完整性，不后台重建或补采。新队列从此后真实行为开始形成。
- 移除旧codesnap读写API及模型入口；保留旧文件不使其可被inspectFile／readMaterial重新发现或回读。.beaconWork内部数据继续受原保护，不是可遍历的普通学生目录。
- 原聊天、附件和已完成工具交换继续可打开；工具名字、参数、结果保原样，协议重放不执行。保留合法分支内已经返回的事实，不再依赖旧快照文件；其他聊天／弃分支不得恢复。
- 旧记忆／摘要保原始文件；适用性继续核对有效前缀和当前权限。工具契约改变重建usage锚点，失效摘要不安装；不为兼容旧工具增加隐藏执行别名。
- 保留当前dirty文档，不在执行起点自动提交、重置或清理。执行前按using-git-worktrees流程检查现有附加工作树；需要隔离时先保证当前未提交设计在目标工作树可用，不能只从HEAD创建后丢掉本轮设计。
- 发布前失败保原队列；原子替换后确认受阻时，区分已发布／确认不明，不盲回滚、删新文件或重复追加。继续校验根身份、目标身份和临时文件所有权，不重定向保存。

## Task1：定义三个记录合同与纯队列规则

**Files:** 修改src/typings/becoder-beacon.d.ts、src/vs/platform/beacon/common/beaconContextTypes.ts；新增common/beaconRecords.ts、test/node/beaconRecords.test.ts。

**Interfaces:** 产生§2.3的BeaconRecordKind／IBeaconRecordByKind／IBeaconRecordWrite及各类DTO；纯函数签名为validateBeaconRecord<K extends BeaconRecordKind>(kind:K,value:unknown): asserts value is IBeaconRecordByKind[K]，appendBeaconRecord<K extends BeaconRecordKind>(kind:K,current:readonly IBeaconRecordByKind[K][],input:IBeaconRecordWrite<K>,id:string):IBeaconRecordByKind[K][]。输出只接受新结构；旧结构隔离，不先删仍有消费者的类型。

- [ ] 写失败测试：problem同题同路径替换为新ID移尾、同题异路径分别占位及null路径相等；run第31条只留最新30且不去重；verdict同题同代码严格相等替换、缺代码不去重、异站／异题不合并。
- [ ] 测非法／未知字段拒绝，包括run.problem、runtimeLimits、checkerRun、active／events；保空字符串与19位数字文本。纯验证不执行IO、不将缺字段改成0或成功。
- [ ] 在完成拥有者类型检查、刷新测试转译后，运行原生测试确认红灯；新增最小实现使以上断言通过。TDD红灯是预期行为，必须证明不是缺工具／入口的编排失败。
- [ ] 复跑原生相关测试及客户端类型检查，确认模型DTO和内部类型同源，没有跨层运行时依赖。

## Task2：三个队列接入Store／Coordinator／IPC

**Files:** 修改beaconStore.ts、beaconCoordinator.ts、common/beaconContext.ts、electron-main/beaconContextMainService.ts及workbench的beaconContext.contribution.ts；测试beaconInfrastructure.test.ts。

**Interfaces:** 产生Store的appendRecord／listRecords／readRecord；Coordinator的captureRun及按kind列／读接口。新captureProblemRecord(windowId,input:IBeaconRecordWrite<'problem'>,scope:IBeaconCollectionScope):Promise<string>与captureVerdict(windowId,input:IBeaconRecordWrite<'verdict'>,scope:IBeaconCollectionScope):Promise<string>分别接读题事实和最终评测适配结果，避免在Task3切换前改变旧captureProblem／captureOj调用签名。旧写入口于Task7退出。根、窗口、scope继续从宿主取得。

- [ ] 写失败测试：新目录缺失返回空队列；损坏文件明确失败；原子发布前抛错保旧队列；两个窗口同根串行发布无丢失，写入互斥不成为用户操作等待／重放队列。
- [ ] 写scope测试：无根／根外来源不采集，正常根Blackout仍采集而列／读被拒；换根及晚到回调不写新根，链接／文件替换不逃逸。
- [ ] 将真实采集资格与读取模式分开；复用根及文件身份校验、已有lease／原子发布。run在captureRun一次发布，不使用startRuntime／appendRuntime落活动记录；runtimeBusy／占用handle仍由原owner管理。
- [ ] problem按保存字段严格比较；文件安全校验使用canonical身份，不能因最近记录或同内容替换filePath。无可靠路径仍需合法collectionScope，不以null路径绕根验证。
- [ ] 测旧五队列、快照、聊天文件字节不因新读写变化；明确不自动迁移。通过原生Store／Coordinator回归和类型检查。

## Task3：Runner、CPH与OJ的真实采集适配

**Files:** 新增Runner的executionResults.ts、runRecordAdapter.ts；修改beaconEvidence.ts、runnerProcess.ts、compile-run-manager.ts；CPH execution.ts、toolchain.ts、judgeSession.ts、judgeView.ts；OJ extension.ts、workflowController.ts、importController.ts、recordController.ts必要回调。

**Interfaces:** executionResults.ts定义IExecutionProgramResult（程序／编译／多input实际结果）及§2.3的IExecutionResultObserver，二者不导入becoder-beacon／scope／队列。runRecordAdapter.ts产生toBeaconRunRecord(result:IExecutionProgramResult):IBeaconRecordWrite<'run'>及retainRunOutput；BeaconEvidence改为外围采集适配，不参与编译／进程控制。

- [ ] 写失败测试：CPH单点原序号5不变、全部多点一条、仅编译0条、运行编译失败1条；Python检查器失败时仅保实际check，保学生程序独立状态，拒绝checker配置／诊断及problem对象透传。
- [ ] 写Runner输入与流测试：Run With Input取同目录真实input正文；Run的实际合流输出与可确认输入分开。先以真实PTY输入链和合成程序核实输入边界；不可可靠恢复时text:null并标gaps，不保存按键流、不按回显猜输入、不改变终端编辑行为。
- [ ] 写8KiB测试：中文／emoji临界、多input多流、短流余量、空输出、来源先已截断；断言保留正文总和<=8192、原input／expected／code不变、省略量准确且身份不丢。采集不累计无界原始事件。
- [ ] 写采集失败／取消／关闭测试：适配器观察失败不让核心操作失败，不将必要进程清理交给落盘；结束后无活动记录占位，忙时立即拒绝，不自动补跑。
- [ ] problem回调只取五站身份、路径与实际用户查看时间；LLM fetch不触发。verdict仅在phase为finished且已取得完整结果时发布，自动轮询中间态不入队；同一次最终回调交付保持幂等，不额外建立持久幂等表或内容去重规则。
- [ ] 提交代码只用站点返回的真实提交稿或owner已确认与该提交回执对应的实际载荷；不能拿当前文件补齐。验证缺代码终态、严格文本去重和原站状态／单位；运行扩展、CPH和OJ拥有者检查。

## Task4：Notebook编译复用并解耦采集

**Files:** 修改Notebook model.ts、extension.ts及Runner notebookProcess.ts、extension.ts；沿Task3普通执行结果接点，不在Notebook执行内持有BeaconEvidence。测试Notebook model.test.ts、Runner notebookProcess.test.ts和必要扩展mock。

**Interfaces:** Notebook模型产生captureNotebookRunPlan(data:NotebookData,selectedInputIndexes:readonly number[]):INotebookRunPlan，每个程序项含完整code、language、codeBlockNumber和已确定input列表，按原执行顺序排列。Runner的executionResults.ts定义NotebookProgramGroupRequest及NotebookProgramCallbacks，notebookProcess.ts提供runNotebookProgramGroup(request:NotebookProgramGroupRequest,signal:AbortSignal,callbacks:NotebookProgramCallbacks):Promise<IExecutionProgramResult>；保现runNotebook过渡包装直到所有消费者切换。Notebook层持有整批一个AbortController，程序组之间也检查停止，不为每组重新接收用户输入。

- [ ] 写计划测试：点击时捕获整批dirty代码／input和关联，只数C/C++块从1计codeBlockNumber，inputCellNumber按整个笔记从1计数。点击后编辑／调序不改变本次计划，删除／关闭影响展示有效性但不改写执行事实。
- [ ] 写编译次数测试：同块3个input仅一次编译、3个独立进程；两个同正文代码块仍各编译一次；第二次用户操作重新编译，不跨次缓存。每程序一条run，不为整批另建父记录。
- [ ] 写失败序列测试：本块编译失败跳过本块input、继续别块；某input RE／TLE／OLE保结果且继续；主动停止终止整批，不启动剩余input和程序，不虚构未编译程序记录。
- [ ] 改执行流程：一份临时编译产物由程序组唯一持有，各input共享只读可执行文件但独立进程／计时／限制，所有分支由执行owner清理；无Beacon根或observer失效照常运行。
- [ ] 保原生input输出及状态容器。编译流只真实发生一次，结果状态明确标出共享编译耗时，不把每input引用的同一耗时累计为多次编译；必要英文状态标签和中英文说明随原模块规则更新，不做界面改版。
- [ ] 用无Beacon observer的执行测试证明独立性，并回归资源保护、关闭、取消、即时再次运行、既有2秒／262144字节限制及真实清理结果；这些限制不进入run持久字段。

## Task5：当前可见代码整读与五站取题

**Files:** 修改workbench/beaconPages.ts、beaconContext.contribution.ts，必要common/beaconPages.ts；OJ扩展extension.ts、browserProblem.ts及nowcoder/task.ts；扩展context.ts／extension.ts；测试原生页面与OJ statementRead／problemResolver。

**Interfaces:** 页面owner提供readVisibleCurrentCode():Promise<IBeaconCurrentCodeFile[]>，DTO为fileName、filePath:string|null、isDirty、code。OJ提供resolveBeaconProblemId(oj,problemId):ProblemRef并复用readBeaconProblem(ref,signal,options)，两项模型参数不再携带URL副本。

- [ ] 写失败测试：两个可见分屏均返回整稿；后台标签排除；未保存修改／未命名页面可读；新调用读到新稿；无代码返回空数组，关闭／身份变化与读取错误不冒充空页面。沿现有双栏文本展开和loaded-model检查，不为读代码打开文件。
- [ ] 写零额外存储测试：当前代码读取、发送、继续、重答及协议回放均不调用saveCodeRead；三模式一致保页面读权，不授父目录／backing file权限。
- [ ] 五站标识往返测试覆盖Luogu比赛范围、CF比赛／题号、AtCoder完整task、Nowcoder公共／比赛两类、Lanqiao编号；无效身份明确失败，不搜索猜题。修复牛客规范ID不能直接回入解析器的问题。
- [ ] 移除fetchProblem侧webEnabled门；browseWeb保自己的开关。测试搜索关闭时fetch成功、搜索仍不可用；取题不建文件／Import／切面板／更新viewedAt／存题面，认证／网络／解析失败分别表达。
- [ ] 页面保原敏感过滤，普通readPage拒绝C/C++、CPH／Runner／OJ结果功能页及Notebook运行字段；既有PDF文本能力保原权限，不扩功能。

## Task6：九工具、系统提示与完整结果预算

**Files:** 修改Beacon contextToolContract.ts、contextTools.ts、provider.ts、extension.ts、connections.ts、prompts.ts，必要contextBudget.ts；测试context.test.ts、prompts.test.ts、promptEvaluation.test.ts、providerTests.test.ts。

**Interfaces:** 产生§2.1的九份schema及简短description，BeaconToolInputs／Outputs；ContextTools.execute(name,input,signal)；provider只注册当前真实可用能力，执行层再次校验模式和scope。三记录工具分别闭包固定kind。

- [ ] 先测出站工具集合恰为当前模式允许的九项子集；没有inspectContext、editNotebook、codeSnapshot或problemHints，模型参数不含producer／revision／part。再测每个合法请求及多余参数、空ID、nullID和错工具ID。
- [ ] 三队列按需列目录、ID整读，允许直接已知ID读取，不强制先列目录。首个合法成功记录在本回答固定，后续并行读共用同一事实；目录未读正文不自动固定，不读其他会话或刷新队列次序。
- [ ] 移除代码／记录在ContextTools的动态截短与余量拒读；完整结果闭合保存后进入下一请求计量。通用文件／网页既有范围和结果标记保留，不能把其局部分页机制转嫁给新记录。
- [ ] system简短承接导师定位、独立三记录、题目关系由LLM判断、当前稿与执行／提交稿不同、内部ID默认不转述、按问题取材。工具描述只说明用途，不堆持久化／协议工程规则。
- [ ] 运行真实SDK模拟响应测试：正常多工具调用、非法参数后纠正、长结果引发整理、图片估算unknown和无工具模型路径；工具已成功后回答失败仍保配对，不假装整体成功。
- [ ] 完成本模块类型／构建／离线测试／lint；检查非五站CPH元数据＋browseWeb兜底仍沿原文件／网络权限。

## Task7：压缩、旧协议兼容与撤回能力清理

**Files:** 修改Beacon compaction.ts、history.ts、session.ts、protocol.ts、contextTools.ts及原生Store／Coordinator／IPC中退出的接口；connections.ts／notebookTools.ts仅删除模型写能力所独有的接线，不删除Notebook用户命令及共用资源锁。

**Interfaces:** ContextTools.compactionView()仅提供本回答已经固定记录的按ID读取和有效材料读取；schema与普通九工具同源但受限。不列新目录、不读新代码、不联网、不写资产；执行时再次限制，不仅隐藏schema。

- [ ] 写旧聊天fixture：包含已完成旧inspectContext／editNotebook交换、已有快照返回、停止／网络失败及有效分支。恢复保原名字和配对，继续新回答只提供新工具，不重执行旧调用、不补读旧快照文件。
- [ ] 写受限整理fixture：空参目录、新记录ID、live code、fetch／browse和写请求都被拒；已固定合法记录／当前材料可读。保当前模型、90%／60%及单步一次恢复；摘要格式瓶颈不在本轮改策略或引入新模型。
- [ ] 测大记录加入后一次整理、仍过容量的结束错误、不静默丢完整结果、不重执行成功工具；编辑／重答排除弃分支要求、材料和许可；换模型重建usage锚，私有字段按原兼容性过滤。
- [ ] 删除旧codesnap API／目录／保存／读取／分支特例、旧运行事件落盘入口及无消费者的operation联合；保普通对话材料和已完成工具事实。按消费者移除，不作关键词批量删文件。
- [ ] 共享记录不再由history.captureContext额外存一份raw正文或新material别名；本回答固定只服务一致性，实际工具返回只沿普通协议留存。用户主动材料的现有合法内容及读取入口继续保留。
- [ ] 运行历史／会话／压缩／原生权限回归；确认Blackout无持久回读旁路且当前代码、只读fetch和主动材料照常可用。

## Task8：全链回归、有限模型观察与stage交付

**Files:** 沿现有测试入口补新fixture；更新docs/beacon/implementation-status.md、使用README及必要的中英文当前实现说明。合成评测与原始日志放tmp/beacon-context-tools-rebuild/，不覆盖旧报告，不提交密钥或用户材料。

**Interfaces:** 无新产品能力；输出对应最终候选的验证台账、已知限制、测试材料和stage路径。执行批准不意味着模型、构建或负责人体验已经通过。

- [ ] 先完整运行§4冻结的离线矩阵，再由独立只读审阅者检查需求完整性、类型／权限／生命周期、数据发布、代码质量、旧能力退出和回归；具体发现修正后只重跑受影响检查，收尾按最终代码重新跑完整必需矩阵。
- [ ] 计划批准后的真实模型观察仅用合成材料：12个独立场景各2次＋3条4轮轨迹，共36个用户回合槽位；记录实际工具调用和API次数，后者可多于36。使用用户此前配置的DeepSeek Flash，执行前核对实际连接／模型及本机配置；缺失或失效则停止该阶段并报告，不擅自换模型，不在聊天显示密钥。
- [ ] 场景覆盖换文件与dirty、多分屏、problem同题异路径、Runner输入缺口、CPH单点／全部、检查器结果、Notebook共享编译及失败继续、verdict旧稿／新稿、Blackout、搜索关闭fetch及长结果整理。轨迹分别围绕改稿／运行／提交、Notebook多input、模式与历史分支。取材正确性和工具成功分开人工审阅，不以无报错或非空回答算通过，不沿用旧统计；报告实际分母、样本量、失败及未完成，36回合观察不换算为全能力稳定性。
- [ ] 同类结构化输出／协议失败连续复现2次，或明确模型容量／能力瓶颈时，冻结该项并报告；网络／鉴权／余额问题分类停止，不盲重试、不扩成无限提示词调优。未完成槽位保未完成，不能用新模型成绩覆盖。
- [ ] 原生／扩展及离线检查全部通过后，按§4完成最终客户端类型检查、OI扩展编译和一次Windows stage构建；构建失败定位、最小修复与受影响检查通过后才重试，不将旧artifact作为新候选。
- [ ] 交付stage产物、实际验证结果与能力限制，交负责人验收：真实Get Problem→CPH→改稿→Runner／Notebook→OJ→Beacon路径。默认不构建Setup、不发版、不运行安装版GUI；源码、模型、stage与本人体验分别报告。

## 4. 验证命令与交付边界

本节是实施时的候选命令清单，不是本轮已运行成绩。所有命令从仓库根执行。实施前再次按AGENTS的Validation Command Preflight核对脚本、模块、配置及现存输入，冻结台账；删除路径不交内容解析器。每条记录实际退出码、输出、失败类别和所需重跑。

| 检查 | 精确入口／顺序 |
| --- | --- |
| 原生拥有者类型与新测试 | npm run typecheck-client；npm run transpile-client；npm run test-node -- --run src/vs/platform/beacon/test/node/beaconRecords.test.ts --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts |
| Beacon | npm --prefix extensions/becoder.beacon run typecheck；npm --prefix extensions/becoder.beacon run build；npm --prefix extensions/becoder.beacon test；npm --prefix extensions/becoder.beacon run lint |
| Notebook | npm --prefix extensions/becoder.notebook run typecheck；npm --prefix extensions/becoder.notebook run build；npm --prefix extensions/becoder.notebook test |
| Runner | npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run run compile；npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run test；测试脚本只清它自身生成的out-test目录，禁止扩大为依赖／stage清理 |
| CPH | 先完成Runner test以生成其测试模块，再npm --prefix extensions/becoder.cph run compile；node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json；npm --prefix extensions/becoder.cph run compile-webview；node --test extensions/becoder.cph/out-test/test/*.test.js |
| OJ | npm --prefix extensions/becoder.oj-connect run typecheck；npm --prefix extensions/becoder.oj-connect test；涉及生产接线再run build |
| 层级与lint | npm run valid-layers-check；npm run eslint（该脚本按自身过滤器检查，不接受文件列表参数）；修改CSS才运行npm run stylelint；Beacon扩展另跑其自身lint脚本 |
| 文档 | pwsh -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1 -RepositoryRoot C:/Users/Bc/Desktop/BeCoder/BeCoder_maintenance；本轮JSON／链接／需求ID检查；git -c core.safecrlf=false diff --check |
| 最终标准序列 | npm run typecheck-client → npm run compile-oi-extensions → npm run gulp vscode-win32-x64-min |

客户端typecheck和OI扩展编译外部期限各120秒，stage为300秒；期限不由npm返回假成功。使用当前watch则等待所属输出刷新，否则显式typecheck／转译后运行原生测试。npm run transpile-client只用于生成新测试JS，不能替代类型检查；不运行npm run compile，不手工编辑生成目录。

新beaconRecords.test.ts及新模块尚不存在，必须由Task1创建并完成对应转译后再预检运行路径；不能把预期缺入口当TDD红灯。扩展测试须先由已核实的build／compile生成测试产物；涉及新fixture时调整原拥有者build.mjs／脚本，不调用旧tmp审计包作为当前源码证据。

CPH实际编译运行测试依赖Runner测试JS、可用GCC／helper及Python检查器环境；Notebook真实进程测试也有缺工具跳过分支。预检核对测试实际引用的工具链和helper路径，必要时仅使用测试进程级配置，不改用户环境；输出skip单列，关键真实执行用例被跳过时不能宣称已验证编译复用或运行行为。

本轮文档准备只执行文档检查，不执行上表源码／模型／构建命令。计划通过后交付范围为源码、必要回归、上述有限模型观察和stage；不含Setup／包验证／发行／Git备份／真实账号提交，后者另需明确请求。

## 5. 执行方式与停止条件

建议Native：主代理在本会话按任务顺序实施，独立调查和最终只读复审可由子代理承担。共享DTO、IPC和执行接点较多，主代理串行合拢可减少不同实现者对接口的各自解释；只读审阅必须基于最终候选，不冒充负责人体验验收。

负责人也可选择subagent-driven-development：接口冻结后只分配不重叠写集合，每任务实施与审阅闭环；共享DTO／IPC单一写owner。无论方式如何，都不自动提交或推送。

停止并说明的情况：必须改变已定业务范围才能推进；五站身份或结果格式与仓库事实冲突；旧数据必须删除／改写才可继续；原清理／取消／忙时拒绝行为无法保持；源码检查未通过；模型出现冻结条件；实际权限或依赖缺失阻止验证。Runner交互输入若无法可靠取得，先按已定null＋gaps交付并报告该限制，不为取得正文擅改控制台协议；增强项冻结，其他已定能力继续。先完成不依赖阻塞项的已授权任务，不把工程不确定性变成反复询问已决定配额／字段的理由。

完成判据：九工具和三个队列有真实生产接线；Notebook优化已实施且独立；退出能力无新入口；最终源码回归、模型观察结果及stage各有当轮证据，失败或未执行项如实列出。代码实施须等负责人审阅本计划并选择执行方式，不能从本文件存在推断批准。

## 6. 设计覆盖自查

| 设计章节 | 实施任务 |
| --- | --- |
| §1—2九工具及目录／整读 | Task1、2、6 |
| §3工作区／模式和三个队列 | Task1、2、3、7 |
| §4当前代码与零额外存储 | Task5、6、7 |
| §5problem／五站题面与搜索解耦 | Task1、3、5、6 |
| §6run粒度、三来源字段、仅编译排除 | Task1、3、4、6 |
| §7Notebook优化与采集解耦 | Task3、4 |
| §8输出额度与完整结果压缩 | Task3、6、7 |
| §9verdict终态与严格代码去重 | Task1、3 |
| §10通用能力／权限／提示词 | Task5、6、7 |
| §11历史、分支、压缩读取边界 | Task2、6、7 |
| §12—13工程收口与验证 | 本计划§2—5、Task8 |

已自查同名类型／方法与任务依赖；Review Focus五类风险均有对应测试步骤。两个只读调查分别核对了执行／采集链及页面／工具链，未实施或提供通过成绩；本表不将其调查当作新源码独立审阅。执行前重新核对实际分支和dirty差异，保持本轮文档为实现依据。
