# Beacon 底层建筑夯实执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由负责人审阅后选择；本文件不授权 Git 提交、推送或发行。

**Goal:** 将用户真实行为凭证、模型工具读取产生的对话代码队列、题目线索与干净题面准确供应到当前回答，并实现协议恢复与首版同步压缩。

**Architecture:** 共享队列复用 BeaconStore／Coordinator，代码读取通过现有页面 owner 同次写本对话队列；ContextTools 统一目录与精确读取，OJ／CPH 暴露窄只读接口，LLM 判断讨论题目。会话原文、摘要投影与队列独立，provider 在实际步骤入口检查预算。

**Tech Stack:** 现有 TypeScript、Code - OSS 服务／IPC、Node 文件存储、扩展命令、AI SDK、node:test 与 Mocha；不增加运行依赖。

**Spec:** [阶段设计](../../beacon/foundation-design.md)、[总体架构](../../beacon/architecture.md)、[代码队列](../../beacon/code-snapshots.md)、[压缩设计](../../beacon/context-compaction.md)、[完整能力](../../beacon/prd.md)。

修订日期：2026-11-22。状态：下一阶段候选执行计划，待负责人书面审阅及选择执行方式；文档回迁不授权产品实施。源码路径相对仓库根，文档入口为[Beacon](../../beacon/README.md)。

## Global Constraints

- Get Problem 记录包含题面正文、题目、对应代码文件和用户查看时间；当前 `.beaconWork` 跨对话共享，上限 13 条，题目＋代码文件去重，用户再次获取更新查看时间并移到队尾。
- 用户行为持久化先要求已选择且正常可用的Beacon工作区；无根／根异常不采集、不写替代根。有效根下三档均持续采集Get Problem及四类执行／测评记录，Blackout只禁止Beacon消费，不关闭软件生产者。各执行来源20条独立配额，活动保护保持，不依赖聊天／模型、不新增运行／交题／后台查询。
- LLM 读取当前编辑器代码时由 harness 同次保存完整原稿到本对话；默认 10 份，UTF-8 正文上限 256 KiB。相同文件相同内容复用并移到队尾；历史读取不刷新次序。
- 超限或保存失败仍反馈实际读取，保存状态独立，原队列保持，不保存截断快照、不伪造 ID。发送不捕获代码，重放不执行工具。
- 对话代码队列不绑定分支；编辑／重答不隐藏原快照，其他分支文字、要求、许可及普通私有材料继续隔离。
- 代码快照跨调用分页不保留已淘汰对象；共享近期记录首次精确读取后的本回答固定版本规则保持，两者不能混同。
- 底层分别提供 Get Problem、CPH、文件名／目录候选，由 LLM 判断讨论题目；不建立强绑定库、不改写历史记录身份。
- 模型联网题面只进入上下文，无新缓存／队列或 Get Problem 回写；不调用会建源码、导入样例或改变面板的完整 Get Problem 命令。
- 当前模型同步压缩仅发布摘要投影，不选择删除代码。B=min(I,C−O)，T=floor(.90B)，G=floor(.60B)，同普通待发步骤最多一次修复，整理自身不递归。
- Blackout保留本窗口已打开代码编辑页正文／文件名／路径，题面直接调OJ Connect只读联网；Runner／CPH／Notebook／OJ测评记录和Get Problem持久来源均不可用，其他所有档位的运行／测评事实也只消费持久化记录，不另读对应功能页面。根、模式、敏感过滤、占用、独立Notebook、草稿和历史保持。冲突拒绝不排队。Beacon 不修改学生源码、不 Shell、不自主运行／停止／登录／交题。
- 本轮后续实施仍需负责人审阅本稿并选择方式；现行文档由docs/beacon统一维护，不操作私有API配置或真实用户历史，不以历史模型报告代验收。

## Review Focus

1. 同一回答内 dirty 稿改动、同内容重读、超 262144 字节、落盘失败：返回实际读稿，只有成功保存才报告队列 ID，失败不先淘汰。Task 4。
2. 编辑旧问题后代码队列仍可读，但旧普通私有材料不能借 native fallback／摘要复活；纯追加不废掉合法摘要。Task 6、8。
3. Get Problem／CPH／路径候选冲突，模型补取题面：保留多来源，网络结果零队列写入，不弹出或修改 get／import UI。Task 2、5。
4. 代码分页第 11 份淘汰与共享凭证更新：前者明确淘汰，后者同回答仍读首次固定 revision；两条测试不可共用一个缓存假设。Task 1、4、5。
5. 工具成功后回答失败、换模型私有字段、工具结果使输入超限：保留完成事实且不重演，步骤预算计量最终请求并单次有界恢复。Task 6–8。

---

## 1. 基线、文件归属与参数状态

当前分支 Beacon_Next，HEAD e28ac79c490921aee8e27e92c589648c129607b0；其后工作区包含未提交的文档清洗与本次现行文档回迁；正式实施前重核差异并保留已有工作。原生现有 producer 为 runner／cph／notebook，队列 10／10／30，读取 consumeRuntimeRecord 会写会话 materials；ContextTools 页面捕获也进入 contextSnapshots。当前编辑稿可由 workbench model.getValue() 取得，但发送时 target.version 和旧缓存会限制实时新读。现有Coordinator.beginActivity可在正常根下建立活动，但runtimeWrite经store()会拒绝Blackout；本轮须修正该生产／消费混用，不因句柄建立成功就宣称Blackout已能落盘。provider.prepareStep 当前主要执行 fileMessages，尚无本稿压缩实现。

正式实施前再核对源码与命令。以下产品数值已确认：Get Problem 13、四类执行来源各20、代码队列10／262144字节、压缩90%／60%。其余为本执行计划提出的工程值，随本稿审阅，不冒充已运行或已获逐项批准：

| 项目 | 本计划采用方式 |
| --- | --- |
| 共享文件 | `.beaconWork/cache/problem/records.json` 及 oj／runner／cph／notebook 同形文件，version 2；无额外正文文件、索引或永久题库 |
| 对话代码文件 | `.beaconWork/conversations/<conversationId>/code-snapshots.json`，单文件 `{version:1, records:[...]}`，复用原子 JSON 发布；与 conversation.json 写入共用对话 lease |
| 共享记录容量 | 单条最终 JSON 上限 8 MiB；执行记录先预留 64 KiB 身份／状态／覆盖，再按字段分配正文头尾；静态题面／结果超限保存失败，核心操作继续 |
| 执行源与批量 | 保留现有默认 1 MiB 主编译稿采集额度与完整哈希，超量标不完整；事件批量64 KiB／250ms，实际运行限额不改 |
| 工具读取 | 字符页默认32768、上限131072，每回答返回预算8 MiB；还要受当前请求剩余 token 预算约束，不能把字节额度当可直接灌入窗口 |
| 共享固定表示 | 每回答原文最多32 MiB；首次合法成功读取后固定，额度不足拒绝新增固定记录，不偷偷淘汰已固定版本；不用于代码快照跨调用保护 |
| 旧数据 | version1读时适配不改写，下一真实生产写入才发布version2并裁剪；旧私有 materials／contextSnapshots 不扫描删除，不变成新代码队列的来源 |

## 2. 共同 DTO 与工具契约

共享类型放现有 `src/vs/platform/beacon/common/beaconContextTypes.ts`，ProblemRef／ProblemDocument／RecordSnapshot／SubmissionEvaluation 仅复用 `src/typings/becoder-oj-connect.d.ts` 的 type-only 定义。不得引入服务或 SDK 到 DTO。

```ts
type BeaconRecentProducer = BeaconProducer | 'problem' | 'oj';
interface IBeaconRecordRef { producer: BeaconRecentProducer; id: string; revision: number }
interface IBeaconCollectionScope {
  slot: string; root: string; workspaceIdentity: string; rootSelectionEpoch: number;
}
interface IBeaconDigest { value: string; representation: 'compiler-bytes' | 'utf8-text-lf' }
interface IBeaconRecentItem extends IBeaconRecordRef {
  sequence: number; capturedAt: number; sourceVersion: string; sourceUri?: string;
  problem?: ProblemRef; sourceDigest?: IBeaconDigest;
  state: 'available' | 'active' | 'finished' | 'unknown';
  viewedAt?: number; trigger?: 'get-problem' | 'import-cph'; coverage: IBeaconCoverage;
}
type BeaconRecentPayload =
  | { kind: 'runtime'; code: string; startedAt: number; events: unknown[] }
  | { kind: 'problem'; document: ProblemDocument }
  | { kind: 'oj'; record: RecordSnapshot }
  | { kind: 'oj-evaluation'; attemptId: string; evaluation: SubmissionEvaluation };
interface IBeaconRecentRecord extends IBeaconRecentItem { payload: BeaconRecentPayload }
interface IBeaconCoverage {
  complete?: boolean;
  channels: { phase: string; stream: string; sampleId?: string; blockId?: string;
    observedBytes: number; retainedRanges: [number, number][];
    omittedRanges: [number, number][]; sourceTruncated: boolean }[];
}
interface IBeaconCodeObservation {
  sourceUri: string; fileName: string; filePath?: string;
  pageId: string; version: string; languageId: 'c' | 'cpp';
  observedAt: number; contents: string; contentSha256: string;
}
interface IBeaconCodeSnapshot extends IBeaconCodeObservation {
  id: string; capturedAt: number; lastObservedAt: number; lastObservedVersion: string;
}
type IBeaconCodeSave =
  | { state: 'saved'; id: string; reused: boolean }
  | { state: 'disabled'; reason: 'blackout' }
  | { state: 'not-saved'; reason: 'too-large' | 'save-failed' };
interface IBeaconProblemHint {
  kind: 'get-problem' | 'cph' | 'path'; sourceUri: string; problem: ProblemRef;
  observedAt: number; viewedAt?: number; record?: IBeaconRecordRef; basis: string;
}
```

coverage 的采集缺失与分页裁剪分开；未知采集长度不捏造字节范围。sourceVersion 标来源正文，revision 标队列更新。IBeaconRecentItem 直接含文件、题目、触发及时间，供目录恢复事实，不再要求从被移除的 payload 恢复永久绑定。Get Problem 的 ID 由规范题目身份＋规范 sourceUri 派生，不能只按 problem URL 去重；OJ 正式记录按规范记录身份，正式编号之前使用真实尝试身份。

代码文件名、sourceUri和可得filePath来自本次真实编辑器对象，不为读取元数据额外读磁盘；未保存且没有磁盘路径的文档如实省略filePath，不捏造路径。Blackout与Spot／Flood都返回这些当前代码页元数据。

原生新增窄方法沿既有 main service／IPC／workbench 接线；windowId、scope 来自真实窗口，不由模型指定：

```ts
captureCollectionScope(windowId: number): Promise<IBeaconCollectionScope | undefined>;
captureProblem(windowId: number, input: { document: ProblemDocument; sourceUri: string;
  viewedAt: number; trigger: 'get-problem' | 'import-cph' }, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef>;
captureOj(windowId: number, input: { record: RecordSnapshot; sourceUri?: string }
  | { attemptId: string; evaluation: SubmissionEvaluation; sourceUri?: string }, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef>;
listRecent(windowId: number, producer: BeaconRecentProducer, scope: IBeaconContext): Promise<IBeaconRecentItem[]>;
readRecent(windowId: number, ref: IBeaconRecordRef, scope: IBeaconContext): Promise<IBeaconRecentRecord>;
saveCodeRead(windowId: number, observation: IBeaconCodeObservation, scope: IBeaconContext): Promise<IBeaconCodeSave>;
listCodeSnapshots(windowId: number, scope: IBeaconContext): Promise<Omit<IBeaconCodeSnapshot, 'contents'>[]>;
readCodeSnapshot(windowId: number, id: string, scope: IBeaconContext): Promise<IBeaconCodeSnapshot>;
```

saveCodeRead 是代码工具内部接线，只接受页面 owner 本次实际取得的原文，模型不能传任意正文／目标路径，也无独立保存或删除入口。原生按 scope.activeId 定位当前对话；共享生产使用独立IBeaconCollectionScope：仅固定发起窗口工作区身份／rootSelectionEpoch与真实对象，不含mode／activeId，也不使用会因模式切换增加的消费epoch。采集scope只在已选正常根时由原生owner捕获；没有scope则该行为不采集，之后选根不补写先前行为。换根／取消选择／根失效使scope失效，模式或聊天变化不影响。Blackout只裁切持久化来源能力，不建立临时队列或替代引用。currentCode仍可按页面权限返回打开代码编辑页的正文、文件名、路径，但保存状态为disabled／blackout，不调用saveCodeRead；原生保存方法在Blackout也须拒绝。代码队列目录／回读、共享近期、Get Problem正文及其他持久化来源在schema／overview与执行入口均不可用，不能借已加载缓存绕过。普通已加载消息和真实工具返回继续沿原流程作为输入，不因此新增持久化来源读取。

inspectContext 保留既有 pages／page／records／record／material，扩展：

| operation | 输入与结果 |
| --- | --- |
| currentCode | 可选显式代码页面id及offset／limit；新读解析当前目标，返回文件名、路径、本次来源、version、contents／coverage、save。仅保存成功有snapshotId，后续按codeSnapshot读取；Blackout仅普通页面返回和disabled状态，没有快照入口。没有保存的分页必须显式带原 pageId／version，变版失败，不缓存旧全文；继续分页不调用 saveCodeRead |
| codeSnapshots／codeSnapshot | 本对话队列目录，或快照id＋offset／limit；不刷新次序。代码页读取的旧兼容入口一并路由此链路，避免绕过读取即保存 |
| problemHints | 指定或当前代码对象；Spot／Flood返回Get Problem行为、CPH关联和路径候选，Blackout不调用持久元数据，只保由当前代码文件名／路径可解析的线索，来源状态明确mode-disabled；不产生唯一裁定或代码捕获 |
| problem | 明确ProblemRef；读取某份保存题面须携带problem记录ref或对应sourceUri，不能静默在同题不同文件中选一份。未明确时返回候选元数据供LLM选择；也可显式refresh直接只读联网。Blackout禁保存题面来源，直接调OJ Connect联网，不读编辑器中的题目页；网络结果零专门持久化，遵守联网开关与原站会话条件 |

共享 record 选择器保留整条与分页：题面locale／sectionIndex、CPH sample index及input／expected／actual、compile、input／output按流、Notebook blockId／inputId、OJ实际verdict字段。模型索引1起算，owner单点转换；不存在字段返回part-unavailable，真实空输入是成功空内容。读取本身仍执行敏感过滤，不能通过新的队列接口绕过已有屏蔽。

## 3. 任务与依赖

主顺序为1→2→3→4→5→6→7→8→9。接口稳定后2／3的生产者可分工，但DTO、Store／Coordinator、ContextTools只由一个整合者修改。每项采用有意义的红灯→最小实现→绿灯→只读审查，不自动commit。下面的测试名与断言是必须落地的具体回归，测试文件不存在时须先生成本次测试产物，不能以编排错误充当红灯。

### Task 1: 共享队列与对话代码队列的原生存储

**Files:** 修改 `src/vs/platform/beacon/common/beaconContextTypes.ts`、`src/vs/platform/beacon/common/beaconContext.ts`、`src/vs/platform/beacon/node/beaconStore.ts`、`src/vs/platform/beacon/node/beaconCoordinator.ts`、`src/vs/platform/beacon/electron-main/beaconContextMainService.ts`、`src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`；测试 `src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`。

**Interfaces:** 实现§2原生方法及captureCollectionScope；Coordinator在已有owner内拆分collectionStore（仅校验正常所选根）和store／ownedStore（校验Beacon消费模式与会话）。runtimeWrite、用户captureProblem／Oj走collectionStore，不能沿现有会拒绝Blackout的store()。rootSelectionEpoch只随根选择／身份或可用性变化，不随模式／聊天变化，不新增数据库或独立服务；scope字段只供受信内部调用。Store内部 `saveRecentRecord(record, activeIds, promote)`、`saveCodeRead(conversationId, observation)`、`listCodeSnapshots(conversationId)`、`readCodeSnapshot(conversationId,id)`。共享queue锁保护读改裁剪发布；代码文件与本会话删除共用write:<id> lease，不能与独立会话checkpoint互相覆盖。

- [ ] 写回归 `problem thirteen and four execution queues twenty`，断言13／20互不挤占，真实活动额外保护、收尾裁剪、孤儿不永久保留；写 `valid selected root collects in all modes`、`no root or invalid root never collects`、`blackout collector writes while model record reads denied`，逐一覆盖Get Problem及四类执行来源，不能以beginActivity成功冒充后续runtimeWrite成功；`code queue ten and 262144 utf8 boundary` 覆盖262143／262144／262145及多字节中文。
- [ ] 写 `same file same content promotes without duplication`、`same text other file remains distinct`、`failed queue publish preserves old records`、`delete conversation removes code queue only`；断言旧快照不因失败发布提前丢失，聊天删除不级联共享队列或用户资产。
- [ ] 按V1编译并运行，记录具体缺少新策略的失败断言；实现version2共享适配、单文件代码队列和原子发布，去重只查仍保留对象，reuse保ID和首次捕获的version／observedAt／capturedAt，更新lastObservedAt／lastObservedVersion。工具本次观测元数据另按实际版本返回，不把复用快照的首次时点冒充本次读取。
- [ ] 所有列表／读取检查根、owner、模式与保护路径；真正缺文件为空，损坏／不支持格式为稳定错误。version1只读适配，下一真实写入才升级，不把旧私有材料扫描进新队列。
- [ ] 重跑V1及受影响类型检查；检查多窗口同根独立对话、根替换／符号链接、损坏、只读和跨根拒绝。固定原文32MiB的分配边界由Task5接入。

### Task 2: 用户 Get Problem／支持导入与 OJ 结果生产

**Files:** 修改 `extensions/becoder.oj-connect/src/extension.ts`、`src/importController.ts`、`src/views/problemPanel.ts`、`src/views/recordPanel.ts`、`src/workflowController.ts`、`src/adapters/lanqiao/adapter.ts`、`src/browserHost.ts`（本行短路径均在OJ扩展）；共享DTO `src/typings/becoder-oj-connect.d.ts`，宿主 `src/vs/workbench/contrib/browserView/electron-browser/features/browserProblemFeature.ts`、`browserOjConnectFeature.ts`；现有OJ test与浏览器 `src/vs/workbench/contrib/browserView/test/electron-browser/browserProblemFeature.test.ts`。实际尝试身份若由站点bridge持有，只沿该既有bridge透传，不新增提交管理器。

**Interfaces:** `publishAcquiredProblem(document,sourceUri,viewedAt,trigger,scope: IBeaconCollectionScope | undefined): Promise<void>`只在scope存在时调用captureProblem并自行交接保存错误。scope在用户操作发起时由captureCollectionScope取得，贯穿异步解析／导入，成功回调不得重取当前scope；无根时undefined是正常未采集，不是Get Problem失败。OJ提交／查询同样透传原采集scope，保存只核工作区身份／rootSelectionEpoch和真实对象，不核模式／activeId。SubmissionEvaluation的真实尝试标识来自提交owner，不由面板题目／路径拼凑。现有sourceBinding只负责其原面板亲和，不扩成持久绑定库。

- [ ] 写五站参数化 `user get problem saves statement without cph`、`reacquire same problem and file promotes`、`same problem different files retain two records`、`capture failure leaves get import successful`；断言实际查看时间来自成功节点，不由mtime替代；加入延迟返回期间切根／取消根／根失效不重定向保存，Spot转Blackout或Blackout转Spot仍在同一正常根采集，单纯换聊天也不阻断；无scope发起后才选根不把旧行为补存。
- [ ] 写 `supported import exposes actual source and problem`、`cph only source has no full support assertion`、`evaluation identity survives preview closure`、`two same problem submissions stay separate`；preparing无真实发送不能伪造提交记录，正式记录轮询只更新同一项revision。
- [ ] 按V2／V3确认缺少行为的红灯，在用户真实成功节点发布含完整题面的记录；支持导入按真实trigger标注，不把import冒充点击Get Problem。相同题目和文件更新，普通保存／打开面板不刷新行为次序。
- [ ] OJ在真实结果owner回调供证，不依赖预览仍打开。已有正式RecordRef按规范URL身份；正式编号之前的真实attempt贯通DTO／adapter／workflow与宿主，不新增查询／重交或提高sourceVerification。
- [ ] 保存故障本地化提示，既有登录、轮询、取消与核心导入成功保持。重跑V2／V3，不为Beacon接入改变原站DOM或猜外部行为。

### Task 3: 真实执行凭证与结构化头尾

**Files:** Runner扩展 `extensions/danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence.ts`、`src/compile-run-manager.ts`、`src/runnerProcess.ts`、`src/notebookProcess.ts`及现有test；CPH扩展 `extensions/becoder.cph/src/toolchain.ts`、`src/execution.ts`、`test/execution.test.ts`、`test/judgeSession.test.ts`。Notebook自身接线仅必要差量，不改独立文档流程。

**Interfaces:** 保留RuntimeEvidence.start／event／finish。stream事件统一实际phase／stream／sequence／offset／bytesBase64及可得sampleId／blockId；coverage用§2结构；开始时固定真实主编译稿及当时实际已有题目来源。

- [ ] 写 `preparation failure has no attempt`、`compile input stays actual after editor changes`、`round complete is not all samples accepted`、`head tail retains channel order`；覆盖CE／RE／取消／TLE／OLE／启动失败／未知收尾。
- [ ] 按V4／V5确认真实失败；Notebook按笔记实际路径归属，不借关联源码／cwd。编译前取消或准备失败不建attempt；编译开始后的真实失败供证，sourceTruncated如实保留。
- [ ] 将JSON前缀截断改为来源字段级预算：身份／状态／覆盖先留，正文余额保头尾各半；尾部滚动更新，最终版本不累积已替换尾部。input／expected／诊断分别保持字段结构，不拼接跨省略区字节。
- [ ] PTY合流、实际键入／回显、来源未收尾与存储省略分别表达。保现有运行时限和输出限制，不承诺环境完整重现；重跑V4／V5和V1收尾回归。

### Task 4: 实时编辑器代码工具与对话队列

**Files:** 修改 `extensions/becoder.beacon/src/contextTools.ts`、`src/context.ts`、`src/extension.ts`、`src/history.ts`、`src/session.ts`、`src/toolFeedback.ts`、现有l10n；workbench `src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts`和Task1接线；测试Beacon `test/context.test.ts`、`test/attachments.test.ts`、`test/drafts.test.ts`与原生infrastructure。

**Interfaces:** currentCode读取由页面owner一次取得IBeaconCodeObservation，内部saveCodeRead；历史使用codeSnapshots／codeSnapshot。Blackout仅保既有当前页读取，save=disabled／blackout，不生成或列举代码队列、不提供替代ID。持久结果snapshotId与本次观测version分别表示，reuse不把旧捕获时间冒充本次。

- [ ] 写 `send has no snapshot writes`、`live read sees dirty edits within one answer`、`live read persists exact same observation`；在读取后保存前模拟改稿，断言保存仍是本次取得内容，非第二次读到的新稿。
- [ ] 写 `snapshot save failure still returns code`、`over limit reads without truncated snapshot`、`historical read does not promote`、`code paging fails after eviction`、`regenerate keeps conversation code directory`。断言原队列未变、ID真实、其他对话拒绝和源文件零修改。
- [ ] 按V1／V6确认红灯；去掉代码工具发送时target.version锁和自动captureContext整稿回调。兼容page(text C/C++)也接同一代码链路，不保留隐藏第二份旧稿，不扩大任意文件读写。
- [ ] 新读解析实际focus或显式对象，含dirty；默认首片返回并保存完整稿，后续snapshot分页不新建／promote。未保存时带原pageId／version续页，变化／关闭明确失败，不加全文缓存。全部返回仍执行敏感过滤与覆盖标注。
- [ ] 写 `blackout clips persistent sources without replacement queue`：打开代码编辑页正文／文件名／路径普通返回可用；代码／共享记录／Get正文／持久material等来源不出现在可用目录及operation说明，强行调用在执行层拒绝，本次模型工具路径的底层list／read／save次数均为0（不包含独立软件采集写入）；即使已预加载持久来源缓存也不重新开放。无镜像队列或跨档补存。复用已有真实工具活动预留可视化，不实施新UI；重跑V1／V6和既有草稿／继承回归。

### Task 5: 多来源题目线索、只读题面与共享selector

**Files:** Beacon `extensions/becoder.beacon/src/contextTools.ts`、`src/context.ts`、`src/provider.ts`、`src/prompts.ts`及 `test/context.test.ts`、`test/prompts.test.ts`；OJ `extensions/becoder.oj-connect/src/extension.ts`、`src/problemResolver.ts`、`src/browserHost.ts`、`src/beaconPages.ts`及现有test；workbench `src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts`；CPH `extensions/becoder.cph/src/extension.ts`、`src/problemStore.ts`及 `test/problemStore.test.ts`。如需新增type-only API，复用既有内部typings区域。

**Interfaces:** CPH激活API增 `readBeaconAssociation(sourceUri): Promise<{sourceUri:string;url:string;revision:string}|undefined>`，只调现有ProblemStore.load；OJ增 `resolveBeaconProblem(sourceUri): ProblemResolution`及 `readBeaconProblem(ref,signal,options): Promise<ProblemDocument>`，仅转现有resolver／adapter。Beacon聚合IBeaconProblemHint数组与每源错误，不定义唯一selectedProblem状态。inspectContext schema使用§2操作。

- [ ] 写 `hints keep conflicting get cph path evidence`、`one source error keeps other hints`、`metadata query does not read code or create snapshots`。CPH只读接口不createLocal／import／导航，不因源码页面读权自动读根外sidecar；磁盘访问执行真实Spot／Flood权限。
- [ ] 写 `saved statement default includes body and viewed time`、`same problem different files select exact saved record`（两文件题面正文／时间不同，指定record或sourceUri只返对应项，未指定不擅选）、`llm fetch refresh has no persistent writes`、`network fetch has no get import panel side effects`、`network failure preserves saved statement`。本地无正文可取五站干净题面，联网开关关闭／登录缺失／解析缺失均按真实状态反馈。
- [ ] 按V2／V5／V6确认红灯；实现hints与题面路由，模型明确选择题目标识，原规范URL和站点题目标识均验证，不能把任意URL或模型推导写成用户看题行为。
- [ ] 写 `shared first read pins exact revision across eviction`、`first read changed fails`、`next answer rechecks`、`selectors keep source structure`、`returned fragments only enter protocol`。首次成功固定发生在scope／预算／selector校验后；32MiB不足拒绝新增，命中仍查scope；回答结束释放共享固定表示。
- [ ] 新增 `runtime and verdict pages are not alternative evidence sources`，在所有档位断言不暴露OJ题面／判题页面读取和Runner／CPH／Notebook输出页面；context.withOjPages不再注入此类页面，专属OJ页面API消费者移除，通用浏览器入口不得回退读取这些功能页。移除workbench Notebook功能页面的自动上下文投影（含正文与outputs／attempt）；独立文档本身、用户主动材料及合法资产操作保持，不删Notebook备份和执行owner。Blackout模型请求路径同时断言代码页名称／路径与正文可读、OJ Connect联网可用、持久记录的列表／读取owner调用数为0；另由软件层真实用户行为路径断言有效根的生产写入正常发生，不把两类调用混算为0。
- [ ] 补齐Notebook模型读口：修改Beacon provider的notebookSchema、模型工具输入类型／桥接及 `extensions/becoder.notebook/src/editApi.ts`，不再向模型暴露或执行editNotebook.read的outputs／attempt；直接伪造参数亦拒绝。增加 `notebook asset reads cannot bypass persisted evidence`，检查最终工具schema、合法内容读取、伪造字段拒绝及返回内容无运行字段；宿主完整备份／输出保留／原生保存与用户运行保持，不能通过删除笔记真实结果来满足此断言。
- [ ] 同一规则贯通 `extensions/becoder.beacon/src/fileTools.ts`、`src/workspaceFiles.ts`、`src/notebookTools.ts` 及 `test/files.test.ts`，复用 `extensions/becoder.notebook/src/model.ts` 的现行格式解释。inspectFiles.read／search对.bcnb与.bcnb-backup先生成内容投影，排除outputs、metadata.becoder.attempt和executionSummary，再分页／检索；磁盘、打开文本及普通文本笔记页面均不可原文旁路，损坏／不支持格式明确拒绝，不返回JSON或base64兜底。加入 `notebook file reads and search expose content only`，用真实工具入口核验Spot／Flood、分页与search均无运行字段、内容仍可读、源文件与完整备份零改动、用户主动材料保持原身份；只在模型可见表示层处理，不新增存储或通用解析服务。
- [ ] 移除新共享读取中的consumeRuntimeRecord和私有contextSnapshots回调，sourceUri／题目／digest真实保留。明确代码队列和共享pin不共用淘汰策略；重跑V1／V2／V5／V6。

### Task 6: 完成工具事实、有效分支与换模型

**Files:** Beacon `extensions/becoder.beacon/src/history.ts`、`src/session.ts`、`src/protocol.ts`、`src/extension.ts`、`src/contextTools.ts`；test `session.test.ts`、`requestRecovery.test.ts`、`context.test.ts`、`attachments.test.ts`。

**Interfaces:** `type ProtocolSource = Pick<ProtocolTurn,'provider'|'baseURL'|'model'>`；`replayProtocol(turn,source?,mode?: 'conversation'|'completed-tools'): ModelMessage[]`；`ChatHistory.effectiveContextAccess(beforeId?): {keys: readonly string[];snapshots:ContextSnapshot[]}`仅供普通私有材料，代码队列独立owner检查。

- [ ] 写 `completed tool remains after failed answer and reload`、`stop race checkpoints completed pair once`、`discarded private material blocked before memory and native fallback`、`whole conversation code queue survives branch edit`；执行次数断言1，失败回答仍保持error。
- [ ] 写 `same endpoint different model strips private fields`、`matching source retains compatible metadata`、`business json named reasoning remains data`；unknown来源同样去私有字段，不将思考转普通文本。
- [ ] 按V6确认红灯；error仅投影真实完整配对工具事实，未完成工具不补成功；停止后迟到正文不接收，回放只构造消息不执行工具。新鲜显式工具调用仍是新行为，不被旧结果拦截。
- [ ] 普通私有key先查有效前缀再内存／native fallback；共享事实按当前根独立读取；代码队列按本对话可读且不恢复旧指令／许可。换模型按完整来源过滤协议外层字段，不递归删业务数据。
- [ ] 用最终mock fetch body核验首发／继续／重答／工具续轮，普通消息顺序与导师入口保持；重跑V6。

### Task 7: 实际输入预算与步骤准备

**Files:** Beacon修改 `extensions/becoder.beacon/src/models.ts`、`src/provider.ts`、`src/prompts.ts`、`src/requestRecovery.ts`；新增 `extensions/becoder.beacon/src/contextBudget.ts`、`test/contextBudget.test.ts`，修改 `build.mjs`和 `package.json`将新测试加入真实build／test清单。

**Interfaces:** 新模块导出 `measureBeaconRequest(input,usageAnchor?): {estimatedInput:number;budget:number;trigger:number;target:number}`；input包含已解析C／I／O、实际system／tools／messages和phase:'answer'|'compaction'。provider的异步SDK prepareStep复用该准备入口与Task8投影；onStepEnd归一并发布与当前投影匹配的usage锚。

- [ ] 写 `32768 24576 8192 yields 24576 22118 14745`、`T minus one T T plus one`、`output reserved once and actual request matches`、`utf8 json and media count in final input`、`invalid usage model branch prefix resets anchor`；缓存token仍占窗口，全零／错误usage不作锚。
- [ ] 按V6生成新增test产物并确认红灯；计量最终适配后的规则／schema／消息／目录／实际工具结果，未返回磁盘正文只计目录；无tokenizer时使用保守估算并标媒体未知，不按字符统一除四。
- [ ] 首发／继续／重答／编辑／每次工具续轮均检查，工具批次闭合后才允许整理，适配后增量必须重计；O固定与实际maxOutputTokens一致，保留模型生成参数冲突的既有拒绝机制。
- [ ] 识别提供方明确context拒绝，包含受限错误正文的已知400分类；不把所有400／413／length当可恢复。把Task8的最多一次语义恢复与原有限网络运输重试分开，已输出／执行活动不透明重演。
- [ ] 验证普通模型步骤20步计数和已完成工具身份不因压缩重置；重跑V6及最终body断言，新test必须进入npm test。

### Task 8: 摘要投影、原子发布与有界恢复

**Files:** Beacon新增 `extensions/becoder.beacon/src/compaction.ts`、`test/compaction.test.ts`；修改 `src/history.ts`、`src/session.ts`、`src/provider.ts`、`src/requestRecovery.ts`、`src/prompts.ts`、`build.mjs`、`package.json`及既有session／recovery测试。原生沿既有conversation保存接线，不新增删除任务或快照管理服务。

**Interfaces:** `interface BeaconCompaction {schemaVersion:1;coveredThrough:{messageId:number;unit:number};prefixSha256:string;summary:string;createdAt:number}`存当前会话，可保已发布的合法checkpoint供有效前缀选择；ChatHistory增`commitCompaction(candidate: BeaconCompaction, expectedPrefix: string, signal: AbortSignal): Promise<void>`，须显式返回已提交成功或抛错，不能将普通flush的吞错状态当成功；`selectCompaction(effectiveUnits,checkpoints)`选择覆盖前缀一致的最近记录；`compactBeaconContext(input,signal): Promise<{summary:string}>`用当前选定模型。unit必须是闭合消息／工具交换单元，能覆盖同一用户问题中较早已完成步骤。

- [ ] 写 `summary does not mutate code or recent queues`、`summary invalid inside edited covered prefix`、`tail edit and append keep valid prefix`、`restart rebuilds same projection`。只根据覆盖前缀身份失效，不用整个会话revision一变就废弃摘要。
- [ ] 写 `completed tools batch closes before summary`、`summary failure cancel or save failure retains original`、`inflight checkpoint does not overwrite summary`、`failed candidate is absent from later checkpoint and restart`、`summary publication shrinks below T`、`compactor and read continuations never recurse`、`one repair shared by preflight and context rejection`；纯摘要不会重复执行原工具。
- [ ] 按V6确认红灯；压缩输入为当前有效历史、旧摘要、当前问题和必要尾部，可信规则单独重建。只读取材限本对话仍可读历史代码或本次已取得的合法材料；不开放currentCode、首次固定共享凭证、联网补取、学习资产写入或执行工具。沿现有总步数上限有界计数，整理内不因读取生成新普通步骤。
- [ ] 整理自身每次请求含取材后续轮仍核对合法输入容量与实际O，不按90%线启动第二层整理。单条必要材料或整理自身装不下、返回截断／非法、无收益／无可整理前缀时停止，保留原始历史，不盲删旧输入、不换模型。
- [ ] 验证候选“可信规则＋新摘要＋完整保留尾部＋当前请求”确实缩短且低于T，目标G；沿ChatHistory同一writer串行提交：等待已有checkpoint收尾，再基于最新合法会话克隆候选数据并直接确认save结果；候选提交成功前不写进this.data／pending，失败后普通checkpoint不能把它补存，成功后统一合入内存与待写状态，后续checkpoint不回滚摘要。取消／身份变化提交前拒绝，提交成功后报告真实状态。代码队列任何情况下均不由摘要选择删除。
- [ ] 同待发普通步骤主动检查与上下文错误共用一次修复额度，新增真实工具结果才是下一步骤；重启／恢复不重演完成工具。重跑V6与Task7预算回归，保持Blackout仅处理正常临时对话的输入投影，禁持久摘要来源读写，无代码内存镜像；分支与模式边界保持。

### Task 9: 联合回归、模型观察与负责人交接

**Files:** 扩展上述测试及Beacon `extensions/becoder.beacon/test/fixtures/prompt-cases.json`来源说明时保持旧十场景身份；仅在本机Git忽略目录 `tmp/beacon-foundation-eval/` 创建foundation-model-cases.json、foundation-model-eval.ts、build-foundation-model-eval.mjs、foundation-model-eval.test.mjs与新结果目录。现行设计与实现差距继续在docs/beacon维护，私有配置和评估输出不进入文档或提交。

**Interfaces:** 测试调用Task1–8的实际生产服务、ContextTools、ChatHistory、createGenerator和适配路径；宿主／网站／模型可mock，不能仅拼提示字符串绕过生产者。

- [ ] 联合场景覆盖用户Get Problem（包括有效根下的Blackout）→13条正文队列→切回Spot／Flood后多来源线索→提问零代码捕获→模型读dirty稿并存快照→改稿再读→历史快照→指定失败样例→SDK出站；加入重启、新聊天、代码淘汰与共享pin差异。
- [ ] 联合覆盖代码写入失败／超量、同题不同文件、模型题面补取零专门持久化、工作区正常但Blackout用户采集仍落盘且Beacon不可读／切回可读、完成工具后断线、编辑分支、换模型、摘要阈值与context恢复。快照可见不等于恢复旧文字／许可；测评旧稿不等于新稿已验证。
- [ ] 预检冻结V1–V7命令和实际输入，跑检查；所有skip单列，实际GCC／helper与站点体验另验。主实施者按需求与阶段矩阵自查，独立只读审查具体问题，修复后重跑受影响检查。
- [ ] 外部评估runner用Beacon已安装esbuild打包真实入口，CLI为--config／--cases／--out；本机配置需approved=true，offline test验证未批准不联网、密钥不写出、新输出目录不覆盖、实际工具可达。只用合成材料，沿已有API授权，不在本轮文档工作运行。
- [ ] 强模型观察换题／旧判词／选择性结果／未知覆盖／完成工具断线／分支和代码队列／换模型／代码保存失败／联网题面无副作用／压缩十类，每类一次完整链路；失败保留原记录，修后只追加受影响案例，不预定反复提示调优。Ollama4B只作兼容冒烟，不作为教学上限；配置无效说明负责人，不打印或改配置。
- [ ] 源码与审查收敛后执行V8一次，交付staged应用和检查记录，由负责人验收五站正常流程、讲解依据与失败提示；此处停止。Setup、发布、提交／推送和代理操作真实账号不在本计划。

## 4. 实施时的验证命令

以下入口本轮只读核对package.json和实际文件，未执行产品验证。实施前重新确认Node、依赖、配置与本次生成产物，优先使用已有watch；否则按拥有者编译。类型／OI编译120秒，staged构建300秒，其他检查120秒；外部超时或非零退出均记录失败，不沿用旧证据。命令逐条执行。

| 编号 | 精确命令与依赖 | 证明范围 |
| --- | --- | --- |
| V1 | `npm run typecheck-client`；`npm run transpile-client`；`npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts` | 本次原生编译、存储／协调器；Node runner实际入口test/unit/node/index.js |
| V2 | `npm --prefix extensions/becoder.oj-connect run typecheck`；`npm --prefix extensions/becoder.oj-connect test` | OJ接线与解析mock，不证明真实网站 |
| V3 | `./scripts/test.bat --run src/vs/workbench/contrib/browserView/test/electron-browser/browserProblemFeature.test.ts` | 本次Electron浏览器动作；依赖V1生成与实际Electron |
| V4 | `npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run run compile`；`npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run test` | Runner与Notebook运行owner；test仅清其生成out-test |
| V5 | `npm --prefix extensions/becoder.cph run compile`；`node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`；`node --test extensions/becoder.cph/out-test/test/execution.test.js extensions/becoder.cph/out-test/test/judgeSession.test.js extensions/becoder.cph/out-test/test/problemStore.test.js`；`npm --prefix extensions/becoder.notebook run vscode:prepublish`；`npm --prefix extensions/becoder.notebook test` | CPH与独立Notebook；先V4生成CPH所需Runner测试产物 |
| V6 | `npm --prefix extensions/becoder.beacon run typecheck`；`npm --prefix extensions/becoder.beacon run build`；`npm --prefix extensions/becoder.beacon test`；`npm --prefix extensions/becoder.beacon run lint` | 当前扩展工具、协议、预算／压缩、最终mock body；新增测试由Task7／8加入build和npm test |
| V7 | `npm run valid-layers-check`；`git diff --check` | 层次与差异空白 |
| V8 | `npm run typecheck-client`；`npm run compile-oi-extensions`；`npm run gulp vscode-win32-x64-min` | 最终源码及staged应用，不证明Setup或GUI验收 |

原生TS lint先枚举本阶段现存普通源码，冻结清单后用实际 `./node_modules/.bin/eslint.cmd --config eslint.config.js --max-warnings 0`逐项传入。npm run eslint的build入口不接受路径缩小，不能给它添加无效参数。未改CSS不增加stylelint；删除文档不送内容解析器，旧清洗差异不混入源码lint。

记录exact command／cwd／输入／exit／原始输出／失败类别／受后续改动影响的检查。已有beaconPages.ts格式问题进入修改范围时修复，不将旧钩子失败当本阶段结果，不使用--no-verify绕过源检查。

外部模型runner只在Task9获准实施并创建后运行：

```powershell
node tmp/beacon-foundation-eval/build-foundation-model-eval.mjs
node --test tmp/beacon-foundation-eval/foundation-model-eval.test.mjs
node tmp/beacon-foundation-eval/bundles/foundation-model-eval.cjs --config tmp/beacon-prompt-eval/private-cloud-test.json --cases tmp/beacon-foundation-eval/foundation-model-cases.json --out tmp/beacon-foundation-eval/foundation-model-run-01
```

输出目录已存在必须换新路径并入台账，不覆盖旧证据。旧prompt-evaluation.cjs固定十案例／4B／三次重复，不承担本阶段验证。此文档工作不运行上述API、测试或构建。

## 5. 覆盖、自查与审阅交接

| 阶段契约 | 负责任务 |
| --- | --- |
| §2 五站支持、Get Problem与CPH／路径线索、模型选题 | 2、5、9 |
| §3 配额13／四类20／代码10与256KiB、真实行为及归属 | 1–4、9 |
| §4 原子队列、活动保护、真实终态、头尾与保存失败 | 1–3 |
| §5 实时代码、去重、跨分支可读、代码淘汰分页、Blackout | 1、4、6 |
| §6 题面只读联网零专门持久化、selector、共享pin、不复制整条 | 1、2、5、9 |
| §7 完成工具事实、普通私有分支与换模型 | 6、9 |
| §8 实际预算、同步摘要、前缀有效性、原子发布与有界恢复 | 7、8、9 |
| §9 工程／模型／五站体验的分层验收，后续范围保护 | 9 |

自查按任务接口、字段及上下游名称一致、五类Review Focus、每条验收的源码与测试落点进行。新增模块仅contextBudget与compaction；无新的模型保存／删除快照工具、绑定服务或缓存平台。工具调用可视化记录真实活动接点，完整UI、tips/status／dream、完整视觉和候选增强不默认纳入。

建议由主代理在当前会话按依赖整合，必要时把不重叠生产者交给子代理，最后独立审查；代码队列、共享队列和协议耦合较多，主整合减少接口交接。另一方式是逐任务独立子代理实施与审查。负责人书面审阅本稿并选择方式后，才进入具体代码实施；届时检查隔离工作区并完整保留已有文档清洗差异，不从旧提交恢复已废弃设计。
