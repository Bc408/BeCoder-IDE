# Beacon 底层建筑夯实执行计划

> 2026-11-23实施后修订：负责人撤回讨论对象的harness绑定。本计划原targetSelection／pinnedTarget及跟随／会话固定描述仅保留原审阅身份，不再作为现行实现要求；以[当前代码工具规则](../../beacon/code-snapshots.md)与[最新实现状态](../../beacon/implementation-status.md)为准。模型容量已提供C但未提供I时，按C约束输入，不能再套用缺省24K上限。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由负责人审阅后选择；本文件不授权 Git 提交、推送或发行。

**Goal:** 将用户真实行为凭证、模型工具读取产生的对话代码队列、题目线索与干净题面准确供应到当前回答，并实现协议恢复与首版同步压缩。

**Architecture:** 共享队列复用 BeaconStore／Coordinator，代码读取通过现有页面 owner 同次写本对话队列；ContextTools 统一目录与精确读取，OJ／CPH 暴露窄只读接口，LLM 判断讨论题目。会话原文、摘要投影与队列独立，provider 在实际步骤入口检查预算。

**Tech Stack:** 现有 TypeScript、Code - OSS 服务／IPC、Node 文件存储、扩展命令、AI SDK、node:test 与 Mocha；不增加运行依赖。

**Spec:** [阶段设计](../../beacon/foundation-design.md)、[总体架构](../../beacon/architecture.md)、[代码队列](../../beacon/code-snapshots.md)、[压缩设计](../../beacon/context-compaction.md)、[完整能力](../../beacon/prd.md)。

创建日期：2026-11-22。实施筹划修订：2026-11-23。负责人已通过现行架构方案并授权本轮实施筹划与落盘；本稿是基于已通过方案的执行审阅稿，仍须选择执行方式后才开始产品代码。源码路径相对仓库根，文档入口为[Beacon](../../beacon/README.md)。本轮不执行产品测试、模型请求、构建或Git提交。

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

本轮筹划起点为干净的Beacon_Next，HEAD `c54e9e4970c59fb1553b38581dc951fc3fb9d8fa`；已包含此前文档清洗、回迁及123条路径备份。`e28ac79c490921aee8e27e92c589648c129607b0`仅是原件追溯恢复点，不再用其未提交状态描述当前仓库。正式实施前重新核对差异并保留后续工作。

原生现有producer为runner／cph／notebook，队列10／10／30，consumeRuntimeRecord会写会话materials；ContextTools页面捕获也进入contextSnapshots。当前编辑稿可由workbench model.getValue()取得，但发送时target.version和旧缓存限制实时新读。Coordinator.beginActivity可在正常根下建立活动，runtimeWrite却经store()拒绝Blackout；必须拆开生产／消费，不能用句柄建立成功证明落盘成功。provider.prepareStep主要执行fileMessages，当前没有本稿预算和压缩实现。Notebook原生输出、资产工具outputs／attempt与普通.bcnb文件读取仍需一并收敛。

### 1.1 文件归属与最小改动

| 改动单元 | 文件与责任 | 写入约束 |
| --- | --- | --- |
| 原生材料存储 | 新增 `src/typings/becoder-beacon.d.ts`声明共享纯DTO，由 `src/vs/platform/beacon/common/beaconContextTypes.ts`重导出；`beaconContext.ts`与main service／workbench命令桥传递；node的Store／Coordinator负责根、占用、原子发布和队列 | Task1主整合者独占；消费者不能在扩展侧另写JSON |
| 真实用户行为生产 | Runner／CPH／Notebook已有执行owner，以及OJ导入、提交、记录更新owner | 只把已有真实事件接入原生门，不增加执行、查询或页面副作用 |
| 页面与模型工具 | workbench的 `src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts`只提供真实现场；Beacon的contextTools／context／extension负责工具编排与本回答共享固定表示 | Task4–5同一整合者，代码队列不复用共享固定缓存 |
| Notebook内容表示 | Notebook model／editApi解释文档；Beacon fileTools／workspaceFiles／notebookTools只交付合法内容投影 | 保持运行字段与完整备份在宿主，禁止复制一套Notebook解析器到Beacon |
| 原始会话与协议 | Beacon history／session／protocol负责完成工具、有效分支、普通checkpoint与摘要提交 | Task6–8同一整合者，不能由provider直接改磁盘或普通data中的候选摘要 |
| 输入预算与摘要 | 新增 `extensions/becoder.beacon/src/contextBudget.ts` 和 `extensions/becoder.beacon/src/compaction.ts`，分别负责计量和同步整理编排；新增各自test并登记实际build／test | 不引入模型目录、数据库、后台任务或通用代理服务 |

以下分组允许独立测试，不是额外的产品阶段：Task1–3接通用户行为；Task4–5接通受控取材；Task6–8接通连续请求；Task9联合交付。未全部完成前不把中间构建交给负责人当作本阶段成品。

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

新增纯声明 `src/typings/becoder-beacon.d.ts`，模块名为 `becoder-beacon`，定义本节新增DTO；native common的beaconContextTypes.ts只作type-only重导出。ProblemRef／ProblemDocument／RecordSnapshot／SubmissionEvaluation复用现有becoder-oj-connect声明，不引入服务、扩展实现或模型SDK。保留既有 `BeaconProducer = 'runner' | 'cph' | 'notebook'`，另设下列RecentProducer，不能使startRuntime接受problem／oj。

OJ扩展的tsconfig.json与tsconfig.test.json显式include新声明，使用 `import type { ... } from 'becoder-beacon'`；不要将native common的.ts作为OJ可emit的rootDir输入，也不扩大rootDir或改变out／out-test布局。Beacon与其他消费者按各自现行type-only入口使用，声明没有运行产物。

```ts
type BeaconRecentProducer = 'runner' | 'cph' | 'notebook' | 'problem' | 'oj';
interface IBeaconRecordRef { producer: BeaconRecentProducer; id: string; revision: number }
interface IBeaconCollectionScope {
  slot: string; root: string; workspaceIdentity: string; rootSelectionEpoch: number;
}
interface IBeaconDigest { value: string; representation: 'compiler-bytes' | 'utf8-text-lf' }
interface IBeaconRecentItem extends IBeaconRecordRef {
  dedupKey: string; sequence: number; capturedAt: number; sourceVersion?: string; sourceUri?: string;
  problem?: ProblemRef; sourceDigest?: IBeaconDigest;
  submission?: { attemptId?: string; recordKey?: string };
  state: 'available' | 'active' | 'finished' | 'unknown';
  viewedAt?: number; trigger?: 'get-problem' | 'import-cph'; coverage: IBeaconCoverage;
}
type BeaconRecentPayload =
  | { kind: 'runtime'; activityId: string; lastEventSequence: number;
      code: string; startedAt: number; events: unknown[] }
  | { kind: 'problem'; document: ProblemDocument }
  | { kind: 'oj'; record: RecordSnapshot }
  | { kind: 'oj-evaluation'; attemptId: string; evaluation: SubmissionEvaluation };
interface IBeaconRecentRecord extends IBeaconRecentItem { payload: BeaconRecentPayload }
interface IBeaconCoverage {
  complete?: boolean;
  channels: { phase: string; stream: string; sampleId?: string; blockId?: string;
    byteRepresentation: 'process-bytes' | 'utf8-observed-text'; observedBytes?: number;
    sourceOmittedBytes?: number; retainedRanges: [number, number][];
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

coverage的采集缺失与分页裁剪分开；未知采集长度不捏造字节范围。sourceVersion标来源实际版本，revision标当前条目更新。IBeaconRecentItem直接含文件、题目、触发及时间，供目录恢复事实。去重键与存储id分开：Get Problem的dedupKey来自规范题目身份＋规范sourceUri，不只按URL；OJ以真实attempt／正式recordKey查找；runtime以真实activityId查找。全新插入生成新id，只有仍保留条目才复用id并递增revision，淘汰后同键再入队也不能复用旧精确ref。不为此保历史索引或全局revision档案。

sourceVersion只在来源实际提供版本时出现，旧记录无此信息保持缺失。Queue.sequence是本地队列顺序；旧v1的sequence是批次去重水位，迁入runtime.lastEventSequence，不复制成队列顺序。事件批次序号与channel字节offset另行表达，不把三者混用。编译器原始bytes与已解码／过滤text分别标注byteRepresentation，不能将重新编码文本的字节数称为原始进程总输出。

代码文件名、sourceUri和可得filePath来自本次真实编辑器对象，不为读取元数据额外读磁盘；未保存且没有磁盘路径的文档如实省略filePath，不捏造路径。Blackout与Spot／Flood都返回这些当前代码页元数据。

原生新增窄方法沿既有 main service／IPC／workbench 接线；windowId、scope 来自真实窗口，不由模型指定：

```ts
interface IBeaconFoundationMethods {
captureCollectionScope(windowId: number): Promise<IBeaconCollectionScope | undefined>;
captureProblem(windowId: number, input: { document: ProblemDocument; sourceUri: string;
  viewedAt: number; trigger: 'get-problem' | 'import-cph' }, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef>;
captureOj(windowId: number, input: { record: RecordSnapshot; sourceUri?: string; attemptId?: string }
  | { attemptId: string; evaluation: SubmissionEvaluation; sourceUri?: string }, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef>;
beginOjCaptureActivity(windowId: number, input: { sourceUri: string; attemptId?: string;
  recordKey?: string }, scope: IBeaconCollectionScope): Promise<string>;
endOjCaptureActivity(windowId: number, handle: string): Promise<void>;
listRecent(windowId: number, producer: BeaconRecentProducer, scope: IBeaconContext): Promise<IBeaconRecentItem[]>;
readRecent(windowId: number, ref: IBeaconRecordRef, scope: IBeaconContext): Promise<IBeaconRecentRecord>;
saveCodeRead(windowId: number, observation: IBeaconCodeObservation, scope: IBeaconContext): Promise<IBeaconCodeSave>;
listCodeSnapshots(windowId: number, scope: IBeaconContext): Promise<Omit<IBeaconCodeSnapshot, 'contents'>[]>;
readCodeSnapshot(windowId: number, id: string, scope: IBeaconContext): Promise<IBeaconCodeSnapshot>;
}
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

### 2.1 实时代码的对象和分页接线

在common DTO新增 `type IBeaconCodeTarget = { kind: 'follow' } | { kind: 'page'; id: string }`。它表达现有“跟随／仅下一问／固定会话”的选择，不新增设置。显式工具id优先；无id时，已指定对象继续用该page身份，follow在新工具调用时解析当前活动C／C++代码页。不会将发送时version当当前稿要求。指定页面关闭则明确失败，不静默换到另一文件；无活动代码则返回不可用，由模型显式选择其他已列代码。

workbench新增窄读口 `readCurrentCode(target: IBeaconCodeTarget, expectedVersion?: string): Promise<Omit<IBeaconCodeObservation, 'contentSha256'>>`；从同一次内存model读取得正文、pageId、URI、文件名、可得路径、languageId、version及observedAt。扩展对同一contents计算contentSha256再调用saveCodeRead；不从磁盘补路径或二次读正文。原生页面DTO同步提供C／C++语言标识，普通文本、PDF、网页不冒充代码队列来源。打开的根外代码仍按页面读权处理，其本对话快照只写当前合法会话目录，不把该授权扩大为磁盘访问。

`Message.target`保留真实初始对象元数据；新增可选 `targetSelection: IBeaconCodeTarget` 记录该问题实际选择策略，history读写校验同步更新。继续／重答沿原问题策略解析新的工具观测；旧记录仅有target时按显式page身份兼容，不伪造过去的follow决定。对象选择不是正文捕获，发送仍零读存。

首次currentCode调用不携带分页version；保存成功后下一页只通过codeSnapshot(id,offset,limit)读取。未保存稿的续页必须显式携带原pageId／version及offset；桥重读同一当前版本、不落盘、不晋升，变版／关闭失败。旧page(text C/C++)入口在offset=0时同路读存，续页按已有快照或严格同版现场读取，不保隐藏全文。以工具入口区分新观测与续页，不因offset请求自动新建快照。

contentSha256按实际完整UTF-8正文计算，256KiB也按该原文计算；源码比较另用现有LF规范化口径并注明representation。文件去重采用编辑器canonical URI身份，Windows按已有路径比较规则处理，不为去重另获磁盘realpath权限。敏感过滤在模型表示分页前完成，不改变完整观测与保存状态的身份，回读再次过滤。

scope／owner在读取后发生变化时终止该工具交付，不能把权限失效包装成普通保存失败并交付给新会话。正常I/O保存失败／超量才走“读成功但未保存”；真实已完成写入按owner事实保留，取消不盲删已发布快照。新增错误沿toolFeedback的精确代码映射及中英文消息，不显示原始异常或伪造ID。

### 2.2 题目线索、局部读取与Notebook表示

OJ扩展的现有activate返回值将从专属页面投影转为窄取材API：`resolveBeaconProblem(sourceUri: string): ProblemResolution`只调用当前resolver；`readBeaconProblem(ref: ProblemRef, signal: AbortSignal, options?: { family?: 'c' | 'cpp' }): Promise<ProblemDocument>`只调用当前adapter.readProblem。ProblemResolution移到现有becoder-oj-connect ambient声明，由problemResolver.ts type-only重导出；Beacon只导入该声明。resolver桥先将合法file URI转换成fsPath，同步调用resolver再由async回调包装，untitled／不适用对象报告无可解析路径，不弹回退输入框。readBeaconProblem调用adapter前规范化为`{family: options?.family ?? 'cpp'}`，不把可选family直接传给必填ProblemReadOptions。

CPH保持onDidImportProblem并增加 `readBeaconAssociation(sourceUri: string): Promise<{ sourceUri: string; url: string; revision: string } | undefined>`，只调用源码所在目录的既有ProblemStore.load。两个API均通过真实扩展activate取得，不导入对方实现；元数据查询不弹输入框、不建题、不导航。读取CPH磁盘元数据前仍执行当前Spot／Flood真实路径权限，Blackout不调用该API。

ContextTools在本回答内新增 `readShared(ref: IBeaconRecordRef, signal: AbortSignal): Promise<IBeaconRecentRecord>`。先校验scope／ref／selector及剩余32MiB固定预算，再对精确revision作首次读取并固定真实表示；命中仍检查scope。selector在固定的来源结构上取字段，按真实UTF-8边界解码，不跨省略区拼接；本次返回truncated与来源coverage分别表达。首次失败不留下已固定条目，整理阶段仅可读取已经固定项，不首次固定新凭证。

ContextTools构造器收敛为 `constructor(client: BeaconContextClient, scope: IBeaconContext, protectedRoots: string[] = [], options: ContextToolOptions = {})`，替代不断增长的位置参数；全部现有调用者和测试同步调整。options明确包含privateSnapshots、allowedPrivateKeys、capturePrivate、target，以及下列窄回调；代码与共享record不走capturePrivate。Task4先由现有有效snapshot填合法key，Task6再用独立effectiveContextAccess完整替换，不能把“没缓存正文”当“可以任意原生回读”。

```ts
interface ContextToolOptions {
  privateSnapshots?: readonly ContextSnapshot[];
  allowedPrivateKeys?: readonly string[];
  capturePrivate?: (snapshot: ContextSnapshot) => void;
  target?: IBeaconCodeTarget;
  authorizeLocal?: (path: string, signal: AbortSignal) => Promise<string>;
  resolveProblem?: (sourceUri: string) => Promise<ProblemResolution>;
  readAssociation?: (sourceUri: string) => Promise<{
    sourceUri: string; url: string; revision: string;
  } | undefined>;
  readProblem?: (ref: ProblemRef, signal: AbortSignal,
    options?: { family?: 'c' | 'cpp' }) => Promise<ProblemDocument>;
}
```

FileTools增加内部公开方法 `authorize(path: string, signal: AbortSignal): Promise<string>`，只复用现有resolve做真实路径／模式／敏感／资产校验，不读正文、扫描目录或产生快照；extension将实例方法作为authorizeLocal传入。CPH关联读取先授权实际源码，owner继续校验其同目录sidecar，禁止符号链接逃逸；打开根外代码页的权限不自动授予其CPH元数据读取。所有回调返回后仍核对当前scope，单一来源失败只影响该来源状态。

Notebook当前edit.read的content读取可保留，outputs／attempt从模型schema和NotebookTools执行层同时排除；原生owner也拒绝此模型入口的伪造part。为普通模型文件read／search，沿Notebook已有激活API增加只读 `readBeaconContent(sourceUri: string, signal: AbortSignal): Promise<{ contents: string; version?: string; representation: 'notebook-content' }>`。该内部API仅由已经通过FileTools.resolve与文件身份核验的桥调用；不成为模型新工具。owner优先读取已加载Notebook最新内存稿，否则按现行.bcnb／.bcnb-backup格式解码真实文件；不打开UI、不加编辑租约、不备份、不保存或运行。返回按允许字段构造的cell内容、身份、input名称和附件描述，不返回outputs、attempt、executionSummary或任意原始metadata。

FileAccessOptions增加可选 `readRepresentation(file: string, signal: AbortSignal): Promise<{ contents: string; representation: 'notebook-content' } | undefined>`，由workspaceFiles桥接上段owner。FileTools对普通模型自动读取在授权和identity校验后、分页／search前调用；Notebook格式或API错误直接报错，不回到raw JSON／base64或已打开纯文本。普通文件返回undefined沿旧路径。suppliedFiles的用户主动捕获沿既有专属通道，不套模型自动取材裁切；不增加文档持久化、跨调用全文缓存或附件共享池。owner实际读取期间文件／版本变动也明确失败，不能把两份表示拼接成一页。

页面供应端移除自动Notebook功能页面投影及OJ题面／判题投影；普通文本方式打开的笔记同样不回传raw运行字段。泛用已打开浏览器路径对既有支持的OJ题面／评测功能页标记为专属来源不可读，模型转保存题面／只读OJ取题或持久测评记录；普通网页、PDF和用户主动材料保持其原身份，不新增比赛监控、任意DOM推测或账号访问。

### 2.3 原生调用链、采集代数与旧队列

本节capture／list／read／save方法逐项声明在IBeaconContextService，经BeaconContextMainService转交Coordinator，沿现有ProxyChannel.fromService注册，不新建channel。workbench命令仍为 `_becoder.beacon.context`，注入真实windowId：`captureCollectionScope`无input；`captureProblem`／`captureOj`统一为`{input,scope}`；`listRecent`为`{producer,scope}`；`readRecent`为`{ref,scope}`；代码方法为`{observation,scope}`或`{id,scope}`。方法中windowId和scope不由模型提交，ContextTools的模型schema只接受业务选择参数。

新增 `beginActivity(windowId: number, source: string, scope: IBeaconCollectionScope | undefined): Promise<string | undefined>`，全部Runner／CPH／Notebook调用者显式传第三参数，不保留省略时重新捕获的重载。IWindowContext的rootSelectionEpoch仅在所选根、身份或可用性改变时推进；模式／聊天变化不推进。活动保存`{source,canonical,collectionScope,producer?}`，collectionStore(context,scope)在开始、追加及串行写实际执行时重核原scope；A→B→A、根失效后恢复也不能复用旧代数。undefined表示本行为不采集，核心功能照常，不在准备完毕后重试取得新scope。

原生Store固定以下签名，windowId仅属于Coordinator层：`listRecentRecords(producer: BeaconRecentProducer): Promise<IBeaconRecentRecord[]>`；`readRecentRecord(ref: IBeaconRecordRef): Promise<IBeaconRecentRecord>`；`saveRecentRecord(producer: BeaconRecentProducer, record: Omit<IBeaconRecentRecord, 'id' | 'revision' | 'sequence'>, activeKeys: ReadonlySet<string>, promote: boolean): Promise<IBeaconRecordRef>`；`trimRecent(producer: BeaconRecentProducer, activeKeys: ReadonlySet<string>): Promise<void>`。activeKeys表达真实活动业务键，Store对当前保留条目的dedupKey／activityId／submission身份匹配，避免新插入id尚未交回时出现保护空窗；只在Coordinator真实句柄仍存在时提供。代码方法为 `saveCodeRead(conversationId: string, observation: IBeaconCodeObservation): Promise<IBeaconCodeSave>`、`listCodeSnapshots(conversationId: string): Promise<Omit<IBeaconCodeSnapshot,'contents'>[]>`、`readCodeSnapshot(conversationId: string,id: string): Promise<IBeaconCodeSnapshot>`。原runtime reader可保留为三来源兼容适配，但新工具不走consumeRuntimeRecord。

v1读取完整适配旧合法结构，保留id／revision／代码／events，旧sequence原值保存在payload.lastEventSequence；新queue.sequence按原数组顺序构造。旧runtime reader将lastEventSequence映射回原sequence，append继续按该水位去重。Notebook21–30条仍合法，读前后文件字节不变。真正ENOENT才为空，损坏／不支持格式抛稳定错误，生产写入也不得当空覆盖。下一真实生产写在同一queue lease内完成适配、更新、裁剪及一次v2发布；失败保原文件。

执行来源保留集合固定为“最新20条 ∪ 当前真实活动记录”，Get Problem按最新13条；真实活动从同根所有窗口的现存句柄聚合，不以磁盘state／finished推断。v2读取允许真实活动保护造成的超额；endActivity解除保护后重裁剪，reset／关闭／重启无对应任务的旧条目失去保护并保持未知终态。写入串行沿现有同根runtimeWrites协调，queue lease仍碰撞即失败；这是存储写入协调，不是等待用户动作或自动重放的队列。

### 2.4 用户取题、支持导入及OJ身份

新增内部 `IBeaconAcquisition = { scope: IBeaconCollectionScope | undefined; trigger: 'get-problem' | 'import-cph' }`。编辑器showProblem在用户命令开始时捕获，成功取得并显示真实ProblemDocument后publish；浏览器Get／Import在点击起点捕获并贯穿所有异步。`_becoder.ojConnect.importFromBrowser(document, requestId?, acquisition?)`保留原第二参数；CPH `_becoder.cph.importProblem(json,url,target,requestId,acquisition?)`保留原四参数。有acquisition但scope为undefined不得fallback重捕获；旧独立用户入口没有acquisition时才在其最早入口捕获一次。

题面面板Import to CPH可直接使用已有完整document。Companion的ImportedProblem只有样例／限制，不能伪装完整题面；支持Get的浏览器Import成功后，用同一原scope和实际sourceUri经既有只读取题owner补得ProblemDocument，再保存行为记录。此用户动作内的取题与LLM联网取材不同；补题面失败保CPH导入成功并报告Beacon材料缺失，不保存虚假空题面，不自动再次导入／建文件。

蓝桥真实attempt来自prepared.handle→native Attempt.requestId。扩展自己生成的preparing／sending展示事件不能当实际发送；只在有效native readProgress返回时透传真实attemptId。SubmissionHost增加独立 `onEvaluation(attemptId: string, evaluation: SubmissionEvaluation, sourceUri: string, scope: IBeaconCollectionScope | undefined): void`观察回调，与beginEvaluation的update／finish展示回调分离；真实RecordSnapshot在实际取得owner处发布，不依赖预览finish是否返回true。关闭预览仍照原逻辑停止跟踪，不新增查询，仅交接已经取得的事实。

已有真实attempt首次保存生成新本地id并在submission.attemptId保原值；确认正式记录后更新同一保留条目，submission.recordKey保规范正式身份，不为同次提交新增一条。没有本地attempt的用户记录查询按正式recordKey查找仍保留条目，找不到时生成全新本地id；淘汰后再次取得也用新id。不能靠题目／路径或时间猜合并。查找扫描全部当前保留项，包括20条以外真实活动保护项，不建独立索引；缺正式编号保持真实attempt状态，不造官网ID，旧引用按精确revision读取且绝不命中新插入正文。

OJ保护由Coordinator新增 `beginOjCaptureActivity(windowId: number, input: { sourceUri: string; attemptId?: string; recordKey?: string }, scope: IBeaconCollectionScope): Promise<string>` 和 `endOjCaptureActivity(windowId: number, handle: string): Promise<void>`，同步main service／workbench桥。前者只注册真实已开始的原生attempt或既有用户tracking的recordKey，至少一项有效；capture成功后句柄可记录实际条目ref。保护基于真实业务键／保留项身份，不增加UI busy、不占Runner运行门、不阻止原有切根流程，也不生产preparing凭证。

实际提交／tracking owner的finally释放OJ保护，reset／窗口关闭清理孤儿；根改变时旧scope采集拒绝，释放只移除旧句柄、不改写到新根。原根仍为当前有效选择时收尾裁剪，否则等待该根下一次合法生产写裁剪，不能重开旧根进行回填。scope为undefined不注册保护、不影响核心流程。新增回归：OJ活动越过20条仍可更新，真实收尾后恢复裁剪，关页停止原tracking而不新增请求。

### 2.5 完成协议、步骤准备与摘要提交接口

以下类型分别放在现有protocol／session及新增compaction模块，不再建一个协调服务。Generate保留现有四个参数，增加可选第五参数GenerationContext；ChatSession分配reply与protocolOffset后绑定真实requestId／replyId再调用，extension／connections只供应当前history绑定和固定模型。原生消费scope仍由闭包持有，不交给模型编造。

```ts
interface ClosedProtocolSnapshot {
  requestId: string; sequence: number; turn: ProtocolTurn;
  stepEnds: readonly { stepId: string; end: number }[];
}
interface EffectiveUnit {
  key: string; messageId: number; turnIndex?: number; unitIndex: number;
  messages: readonly ModelMessage[];
}
interface CompletedToolFact {
  requestId: string; turnIndex: number; logicalStepId: string; toolCallId: string; toolName: string;
  input: unknown; result: Extract<ToolModelMessage['content'][number], { type: 'tool-result' }>;
  status: 'returned' | 'error';
}
interface BeaconCompaction {
  schemaVersion: 1; coveredThrough: { messageId: number; unit: number };
  prefixSha256: string; summary: string; createdAt: number;
  inputCompaction?: { prefixSha256: string; summarySha256: string };
}
interface CompactionExpectation {
  conversationId: string; requestId: string; prefixSha256: string;
}
interface GenerationContext {
  acceptClosed(snapshot: ClosedProtocolSnapshot): void;
  acceptCompletedTool(fact: CompletedToolFact): void;
  prepare(snapshot: ClosedProtocolSnapshot, signal: AbortSignal): Promise<{
    conversationId: string; units: readonly EffectiveUnit[];
    checkpoints: readonly BeaconCompaction[];
  }>;
  commitCompaction(candidate: BeaconCompaction, expected: CompactionExpectation,
    signal: AbortSignal): Promise<void>;
}
```

CompletedToolFact由protocol.ts定义为本请求已准入的toolCallId／toolName、原input与实际ModelMessage工具结果表示；状态区分返回值与真实执行错误。记录键固定为requestId＋turnIndex＋logicalStepId＋toolCallId，同一步重复观察只记一次，后续合法步骤复用相同callId仍是新的真实调用；不接收未准入调用或伪造结果。logicalStepId由请求owner在SDK调用之外分配，准备重试不换ID，新普通步骤才更新，不能用每次SDK重建会从0开始的stepNumber替代。

ProtocolTurn新增可选stepEnds，元素为`{stepId,end}`，end是累计raw messages闭合终点并单调增加；旧记录缺少边界时保守按整turn处理，不猜同轮切点。EffectiveUnit的unitIndex是canonical原始闭合单元，不是适配后消息数组offset；fingerprint包含有序原始正文／附件／协议与配对，排除UI计时、草稿和显示状态。

provider.onStepEnd立即seal SDK权威step.response.messages，向acceptClosed同步提交累计raw协议；session按requestId／reply／turn／sequence幂等安装并同步通知history捕获。随后prepareStep直接await GenerationContext.prepare，再从该闭合协议生成有效单元与摘要输入，不能仅读取异步fullStream尚未捕获的History。保留完整raw协议，不能把已压缩模型输入写回原消息。迟到fullStream checkpoint携带其实际watermark，不能用最新全局序号标记旧快照并覆盖seal。

onToolExecutionEnd另外接request-bound完成sink，解决停止后session拒绝普通delta的竞态；实际执行已完成的返回／错误保持一次真实配对，未完成调用不补结果。停止后仍拒绝迟到正文／reasoning。SDK观察回调异常会被notify吞掉，因此sink错误必须在请求状态中锁存，并由直接await的prepare／结束收尾显式检查；不能靠向onStepEnd或onLanguageModelCallStart抛错阻止后续请求。

摘要确认提交可在同一次conversation原子save中保存“新seal的原始协议＋候选摘要”，不要求为压缩先单独写一次raw。失败时raw仍在普通checkpoint状态，候选不进入this.data／pending。ChatHistory.commitCompaction固定采用上面的CompactionExpectation对象；复用同一writer等待在途写入后，从最新合法状态克隆候选，原生save确认成功才发布模型投影。持久化桥扩展 `saveConversation(windowId,data,revision,expectedScope?: IBeaconContext)`，在Coordinator串行操作内部、实际发布前核对捕获scope；普通save可继续省略。成功发布后不因post-save abort检查抛成“保存失败”。

确认提交不能直接复用现有whole-conversation合并：候选不在this.data中会被误当本地删除。成功路径显式合入已提交compaction，同时保留等待期间的合法草稿／消息变化及native返回修订，并以合并后状态rebasing普通pending；失败路径候选保持隔离，之后普通flush也不能补存。新原生scope校验、取消／发布先后和writer合并均用可控promise／barrier测试，不依赖mtime或sleep。

本阶段Conversation只保存一份当前已发布compaction，checkpoints接口返回0或1份，不建摘要版本档案。inputCompaction只记录实际输入摘要的身份来源；校验的最终依据仍是完整原始覆盖前缀。覆盖区变化使当前摘要失效，从有效原文重建；纯追加或尾部编辑保留合法前缀。不因没有保存更旧摘要而恢复旧分支，也不要求永久保存摘要依赖全文。

### 2.6 预算与恢复的工程参数

contextBudget.ts导出 `measureBeaconRequest(input: PreparedBeaconRequest, anchor?: BeaconUsageAnchor): BeaconMeasurement`。PreparedBeaconRequest包含source三元组、phase、C／I／O、实际instructions、序列化active schema、已适配messages／媒体、projectionFingerprint及contractFingerprint；BeaconMeasurement包含estimatedInput／budget／trigger／target、method、unknownMedia与coverage。BeaconUsageAnchor固定匹配source、phase、projection／contract指纹和真实step.usage.inputTokens，不用累计totalUsage、不减cache、不把outputTokens与新增assistant协议重复计数。

```ts
interface PreparedBeaconRequest {
  source: ProtocolSource; phase: 'answer' | 'compaction';
  limits: { contextWindow: number; maxInputTokens: number; maxOutputTokens: number };
  instructions: unknown; activeTools: readonly { name: string; definition: unknown }[];
  messages: readonly ModelMessage[];
  media: readonly { key: string; kind: string; inputTokens?: number }[];
  projectionFingerprint: string; contractFingerprint: string;
  unitFingerprints: readonly string[];
}
interface BeaconUsageAnchor {
  source: ProtocolSource; phase: 'answer' | 'compaction'; inputTokens: number;
  projectionFingerprint: string; contractFingerprint: string;
  unitFingerprints: readonly string[];
}
interface BeaconMeasurement {
  estimatedInput: number; budget: number; trigger: number; target: number;
  method: 'usage-anchor' | 'tokenizer' | 'utf8-estimate';
  unknownMedia: readonly string[]; coverage: 'estimated-complete' | 'unknown-media';
}
```

limits分别对应公式C／I／O。activeTools.definition为整份实际模型可见工具定义，含description、input schema及适配后可见选项，不是只传input schema；contract指纹与估算都包含其全文。estimated-complete只表示各类表示均已纳入计量／估算，不宣称服务端精确token。usage锚仅在原unit指纹仍是当前输入有序前缀、全局contract一致且source／phase相同时复用；纯追加按未计量后缀补差，改写任一已计量unit、摘要或工具description则重建。

没有有效usage／适配tokenizer时，文本基线固定为：`UTF8(JSON.stringify(实际instructions、完整activeTools定义、非二进制消息表示)).byteLength + 256 + 32×消息数 + 64×active工具数`。这是保守估算策略，不声称服务端真实token；纯追加可用有效usage锚＋尚未计量的同口径增量。图片／二进制data不按base64字符数量直接计文本token，图片URI／MIME及消息封装仍计；可靠媒体计量并入，不能可靠计量的项目进入unknownMedia，不填0或假装完整覆盖。

负责人已选择允许未知媒体准入：unknownMedia存在时保留原图片，coverage标unknown-media，先对所有已知／可估部分按B／T检查；不因“无法估准”单独阻止发送，也不宣称整个请求已精确计量。此时estimatedInput明确只是已纳入估算部分，未知部分另列，不能呈现为实际总token或零成本。服务端明确context拒绝时仍共用当前普通步骤的一次修复；图片本身装不下或无合法整理前缀则诚实停止，不默默裁图、丢图、OCR或换模型。整理请求中的未知媒体同样标注并守已知部分容量，服务端拒绝则整理失败，不递归修复整理。

provider的三个关卡各司其职：异步prepareStep在fileMessages之后选择有效投影／主动整理；可抛错的language-model middleware核对SDK转换后的prompt／tools；注入fetch在任何网络发送前核对最终adapter body。最终适配增加材料时，退回同一个待发步骤重准备，不静默改body或重置修复额度。O在用户参数展开后显式设置，并在prepareStep返回相同有效maxOutputTokens；测试DeepSeek和兼容adapter实际body的max_tokens。onLanguageModelCallStart仅观察，不能当阻止发送的关卡。

请求级步骤状态在SDK调用之外保持：ordinaryStepId、repairUsed、已seal普通协议、当前步骤是否开始输出／工具执行，以及共享剩余step数。总额度沿现有20步，在普通回答和整理之间共用；每个实际完成模型步骤消耗一次，整理取材续轮不重置。未完成的上下文拒绝不冒充完成step，但消耗该ordinaryStep的一次修复；运输恢复沿既有最多2次／累计10秒规则与180秒总deadline，不重置到新SDK调用。没有足够步骤完成整理或继续回答时诚实停止，不额外分配20步。

compactBeaconContext单独调用当前捕获connection／model的受限streamText路径；只建历史代码／本次已固定凭证的只读工具map，不调用普通createGenerator，SDK activeTools也不能替换tools定义。每步仍守硬B；到T不再递归整理。上下文拒绝修复只重建尚未输出／执行的当前普通步骤，使用已seal协议及当前投影，不能从原始messages重跑之前工具。摘要只接受完整合法`{summary:string}`，确认新输入严格缩短且小于T后才提交；目标G未达到但满足最低发布条件时如实记录，不再压同一前缀。

## 3. 任务与依赖

主顺序为1→2→3→4→5→6→7→8→9。接口稳定后2／3的生产者可分工，但DTO、Store／Coordinator、ContextTools只由一个整合者修改。每项采用有意义的红灯→最小实现→绿灯→只读审查，不自动commit。下面的测试名与断言是必须落地的具体回归，测试文件不存在时须先生成本次测试产物，不能以编排错误充当红灯。

每项按同一顺序执行：先增该项列明的具体回归与精确断言；生成本次测试产物并记录真实红灯；只实现其Files／Interfaces范围；按交付门跑绿灯与受影响保护回归；作只读自查并记录证据后进入下一项。不为计划里的每个测试名另建重复测试文件。主整合者保持跨任务接口一致，存储／ContextTools／history同一时刻仅一位写入者。

### Task 1: 共享队列与对话代码队列的原生存储

**Files:** 新增纯声明 `src/typings/becoder-beacon.d.ts`；修改 `src/vs/platform/beacon/common/beaconContextTypes.ts`、`src/vs/platform/beacon/common/beaconContext.ts`、`src/vs/platform/beacon/node/beaconStore.ts`、`src/vs/platform/beacon/node/beaconCoordinator.ts`、`src/vs/platform/beacon/electron-main/beaconContextMainService.ts`、`src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`；测试 `src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`。

**Interfaces:** 产生§2与§2.3全部原生方法、共享纯声明与显式beginActivity采集scope；不新增IPC channel。Coordinator拆分collectionStore(context,scope)和消费store／ownedStore；runtimeWrite及用户capture走collectionStore，并在串行写实际执行时重核scope。Store采用§2.3固定签名，queue lease保护读改裁剪发布，代码文件与本会话删除共用write:<id> lease。消费scope仍含mode／epoch／activeId，采集scope不含这些字段。

**交付门：** 不接通模型也能通过真实Store／Coordinator测试五来源存储和三档采集门；旧runtime reader兼容，未接入的生产者留给Task2–3。先V1编译及定向测试，最后重跑V1；纯声明同时由后续OJ typecheck验证rootDir边界。

- [ ] 写回归 `problem thirteen and four execution queues twenty`，断言13／20互不挤占，真实活动额外保护、收尾裁剪、孤儿不永久保留；写 `valid selected root collects in all modes`、`no root or invalid root never collects`、`blackout collector writes while model record reads denied`，逐一覆盖Get Problem及四类执行来源，不能以beginActivity成功冒充后续runtimeWrite成功；`code queue ten and 262144 utf8 boundary` 覆盖262143／262144／262145及多字节中文。
- [ ] 写 `same file same content promotes without duplication`、`same text other file remains distinct`、`failed queue publish preserves old records`、`delete conversation removes code queue only`；断言旧快照不因失败发布提前丢失，聊天删除不级联共享队列或用户资产。
- [ ] 按V1编译并运行，记录具体缺少新策略的失败断言；实现version2共享适配、单文件代码队列和原子发布，去重只查仍保留对象，reuse保ID和首次捕获的version／observedAt／capturedAt，更新lastObservedAt／lastObservedVersion。工具本次观测元数据另按实际版本返回，不把复用快照的首次时点冒充本次读取。
- [ ] 所有列表／读取检查根、owner、模式与保护路径；真正缺文件为空，损坏／不支持格式为稳定错误。version1只读适配，下一真实写入才升级，不把旧私有材料扫描进新队列。
- [ ] 重跑V1及受影响类型检查；检查多窗口同根独立对话、根替换／符号链接、损坏、只读和跨根拒绝。固定原文32MiB的分配边界由Task5接入。
- [ ] 补 `v1 notebook thirty reads without migration`、`damaged queue is not overwritten`、`all windows contribute active protection`：旧Notebook30条读前后字节完全一致，下一真实写才v2；“最新20条∪真实活动”允许超额，旧活动仍可append，endActivity后裁剪；重启孤儿不保护、不补终态。模拟rename失败保原文件。
- [ ] 加 `legacy event sequence is not queue order`、`evicted key reinsertion never aliases old ref`：v1的旧批次水位如42移入lastEventSequence，适配队列顺序不改变它，新43接受、重复42拒绝；Get／OJ同键淘汰后重获使用新id，旧producer／id／revision精确读失败，新ref返回新正文，且无额外历史索引。

### Task 2: 用户 Get Problem／支持导入与 OJ 结果生产

**Files:** 修改 `extensions/becoder.oj-connect/src/extension.ts`、`src/importController.ts`、`src/views/problemPanel.ts`、`src/views/recordPanel.ts`、`src/workflowController.ts`、`src/adapters/lanqiao/adapter.ts`、`src/browserHost.ts`（本行短路径均在OJ扩展）；共享DTO `src/typings/becoder-oj-connect.d.ts`，宿主 `src/vs/workbench/contrib/browserView/electron-browser/features/browserProblemFeature.ts`、`browserOjConnectFeature.ts`；现有OJ test与浏览器 `src/vs/workbench/contrib/browserView/test/electron-browser/browserProblemFeature.test.ts`。实际尝试身份若由站点bridge持有，只沿该既有bridge透传，不新增提交管理器。

补充文件：OJ `tsconfig.json`、`tsconfig.test.json`显式包含纯声明；CPH `extensions/becoder.cph/src/extension.ts`透传第五参数；蓝桥实际身份接线与测试位于 `src/vs/platform/browserView/common/lanqiaoBridge.ts`、`src/vs/platform/browserView/electron-main/lanqiaoSessionClient.ts`、`src/vs/platform/browserView/test/common/lanqiaoBridge.test.ts`、`src/vs/platform/browserView/test/electron-main/lanqiaoSessionClient.test.ts`。仅透传已有requestId及进度，不改网站协议。

**交付门：** 用户原Get／Import／提交路径的成功和失败行为保持，真实材料在无Beacon聊天时亦落盘；有效根Blackout可写但消费拒绝。红灯／绿灯顺序V1、V2、V3，另含下方两个native bridge测试。

**Interfaces:** `publishAcquiredProblem(document,sourceUri,viewedAt,trigger,scope: IBeaconCollectionScope | undefined): Promise<void>`只在scope存在时调用captureProblem并自行交接保存错误。scope在用户操作发起时由captureCollectionScope取得，贯穿异步解析／导入，成功回调不得重取当前scope；无根时undefined是正常未采集，不是Get Problem失败。OJ提交／查询同样透传原采集scope，保存只核工作区身份／rootSelectionEpoch和真实对象，不核模式／activeId。SubmissionEvaluation的真实尝试标识来自提交owner，不由面板题目／路径拼凑。现有sourceBinding只负责其原面板亲和，不扩成持久绑定库。

- [ ] 写五站参数化 `user get problem saves statement without cph`、`reacquire same problem and file promotes`、`same problem different files retain two records`、`capture failure leaves get import successful`；断言实际查看时间来自成功节点，不由mtime替代；加入延迟返回期间切根／取消根／根失效不重定向保存，Spot转Blackout或Blackout转Spot仍在同一正常根采集，单纯换聊天也不阻断；无scope发起后才选根不把旧行为补存。
- [ ] 写 `supported import exposes actual source and problem`、`cph only source has no full support assertion`、`evaluation identity survives preview closure`、`two same problem submissions stay separate`；preparing无真实发送不能伪造提交记录，正式记录轮询只更新同一项revision。
- [ ] 按V2／V3确认缺少行为的红灯，在用户真实成功节点发布含完整题面的记录；支持导入按真实trigger标注，不把import冒充点击Get Problem。相同题目和文件更新，普通保存／打开面板不刷新行为次序。
- [ ] OJ在真实结果owner回调供证，不依赖预览仍打开。已有正式RecordRef按规范URL身份；正式编号之前的真实attempt贯通DTO／adapter／workflow与宿主，不新增查询／重交或提高sourceVerification。
- [ ] 保存故障本地化提示，既有登录、轮询、取消与核心导入成功保持。重跑V2／V3，不为Beacon接入改变原站DOM或猜外部行为。
- [ ] 按§2.4补 `explicit absent acquisition scope never recaptures`、`cph samples are not a full statement`、`native attempt survives false preview finish`、`official record updates one actual attempt`：覆盖浏览器两个原有参数布局、showProblem与题面Import；fake preparing／sending零发布，native handle与透传attemptId严格相同；finish=false不丢已得事实，关页不重开／新增查询。
- [ ] 加 `active oj record survives twenty newer entries then trims`，实际注册OJ保护句柄、发布／更新attempt或record、插入21条后旧活动仍可更改，finally释放后裁剪；reset／close清保护，不改变UI busy或原切根行为；扫描包含额外保护项，不能把活动第21项当已淘汰。

### Task 3: 真实执行凭证与结构化头尾

**Files:** Runner扩展 `extensions/danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence.ts`、`src/compile-run-manager.ts`、`src/runnerProcess.ts`、`src/notebookProcess.ts`及现有test；CPH扩展 `extensions/becoder.cph/src/toolchain.ts`、`src/execution.ts`、`src/judgeView.ts`、`test/execution.test.ts`、`test/judgeSession.test.ts`；Notebook `extensions/becoder.notebook/src/extension.ts`。自身接线仅必要差量，不改独立文档流程。

**Interfaces:** 保留RuntimeEvidence.start／event／finish。stream事件统一实际phase／stream／sequence／offset／bytesBase64及可得sampleId／blockId；coverage用§2结构；开始时固定真实主编译稿及当时实际已有题目来源。

**交付门：** 三来源在实际主编译开始后才形成凭证，原生格式和头尾覆盖可被独立读取，不依赖模型。按V4→V5→V1验证；保留同一采集scope贯穿准备／开始／追加／结束，不在Runner准备后重试取得新scope。

- [ ] 写 `preparation failure has no attempt`、`compile input stays actual after editor changes`、`round complete is not all samples accepted`、`head tail retains channel order`；覆盖CE／RE／取消／TLE／OLE／启动失败／未知收尾。
- [ ] 按V4／V5确认真实失败；Notebook按笔记实际路径归属，不借关联源码／cwd。编译前取消或准备失败不建attempt；编译开始后的真实失败供证，sourceTruncated如实保留。
- [ ] 将JSON前缀截断改为来源字段级预算：身份／状态／覆盖先留，正文余额保头尾各半；尾部滚动更新，最终版本不累积已替换尾部。input／expected／诊断分别保持字段结构，不拼接跨省略区字节。
- [ ] PTY合流、实际键入／回显、来源未收尾与存储省略分别表达。保现有运行时限和输出限制，不承诺环境完整重现；重跑V4／V5和V1收尾回归。
- [ ] 新版结构事件由Store按channel归并，滚动尾部替换已保存旧尾部，不能producer替换了尾、磁盘仍push累计；加入 `rolling tail replaces stored tail`，多次更新后最终JSON≤8MiB且身份／终态完整。Runner pipe／PTY已解码文本标utf8-observed-text；Notebook传递源输出裁切；CPH index、Notebook cellId／inputCellId由owner单点转selector标识，不假定已有sampleId／blockId。

### Task 4: 实时编辑器代码工具与对话队列

**Files:** 修改 `extensions/becoder.beacon/src/contextTools.ts`、`src/context.ts`、`src/extension.ts`、`src/history.ts`、`src/session.ts`、`src/toolFeedback.ts`、现有l10n；workbench `src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts`和Task1接线；测试Beacon `test/context.test.ts`、`test/attachments.test.ts`、`test/drafts.test.ts`与原生infrastructure。

**Interfaces:** currentCode读取由页面owner一次取得IBeaconCodeObservation，内部saveCodeRead；历史使用codeSnapshots／codeSnapshot。Blackout仅保既有当前页读取，save=disabled／blackout，不生成或列举代码队列、不提供替代ID。持久结果snapshotId与本次观测version分别表示，reuse不把旧捕获时间冒充本次。

**交付门：** 采用§2.1的targetSelection与workbench窄读口，代码来源和保存精确同次，旧page入口不旁路；跟随／指定策略、同轮dirty改稿、代码历史可独立验证。红灯与最终绿灯均运行V1、V6，目标策略改动同时覆盖旧历史载入和附件／草稿回归。

- [ ] 写 `send has no snapshot writes`、`live read sees dirty edits within one answer`、`live read persists exact same observation`；在读取后保存前模拟改稿，断言保存仍是本次取得内容，非第二次读到的新稿。
- [ ] 写 `snapshot save failure still returns code`、`over limit reads without truncated snapshot`、`historical read does not promote`、`code paging fails after eviction`、`regenerate keeps conversation code directory`。断言原队列未变、ID真实、其他对话拒绝和源文件零修改。
- [ ] 按V1／V6确认红灯；去掉代码工具发送时target.version锁和自动captureContext整稿回调。兼容page(text C/C++)也接同一代码链路，不保留隐藏第二份旧稿，不扩大任意文件读写。
- [ ] 新读解析实际focus或显式对象，含dirty；默认首片返回并保存完整稿，后续snapshot分页不新建／promote。未保存时带原pageId／version续页，变化／关闭明确失败，不加全文缓存。全部返回仍执行敏感过滤与覆盖标注。
- [ ] 写 `blackout clips persistent sources without replacement queue`：打开代码编辑页正文／文件名／路径普通返回可用；代码／共享记录／Get正文／持久material等来源不出现在可用目录及operation说明，强行调用在执行层拒绝，本次模型工具路径的底层list／read／save次数均为0（不包含独立软件采集写入）；即使已预加载持久来源缓存也不重新开放。无镜像队列或跨档补存。复用已有真实工具活动预留可视化，不实施新UI；重跑V1／V6和既有草稿／继承回归。
- [ ] 补 `follow resolves current focus but explicit target keeps identity`、`unsaved current code page fails after version change`、`scope change is not a soft save failure`：follow新调用可取当前活动代码，once／pin始终原对象的新稿；关闭指定对象不换文件，旧history不推造follow；保存时模拟改稿仍落读到的V1。正常保存失败返回V1，owner／mode已失效则交付拒绝而非跨会话带出V1。

### Task 5: 多来源题目线索、只读题面与共享selector

**Files:** Beacon `extensions/becoder.beacon/src/contextTools.ts`、`src/context.ts`、`src/provider.ts`、`src/prompts.ts`及 `test/context.test.ts`、`test/prompts.test.ts`；OJ `extensions/becoder.oj-connect/src/extension.ts`、`src/problemResolver.ts`、`src/browserHost.ts`、`src/beaconPages.ts`及现有test；workbench `src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts`；CPH `extensions/becoder.cph/src/extension.ts`、`src/problemStore.ts`及 `test/problemStore.test.ts`。如需新增type-only API，复用既有内部typings区域。

**Interfaces:** CPH激活API增 `readBeaconAssociation(sourceUri): Promise<{sourceUri:string;url:string;revision:string}|undefined>`，只调现有ProblemStore.load；OJ增 `resolveBeaconProblem(sourceUri): ProblemResolution`及 `readBeaconProblem(ref,signal,options): Promise<ProblemDocument>`，仅转现有resolver／adapter。Beacon聚合IBeaconProblemHint数组与每源错误，不定义唯一selectedProblem状态。inspectContext schema使用§2操作。

补充修改Notebook的 `extensions/becoder.notebook/src/editApi.ts`、`src/model.ts` 与激活导出，Beacon的 `extensions/becoder.beacon/src/fileTools.ts`、`src/workspaceFiles.ts`、`src/notebookTools.ts`、`test/files.test.ts`。消费§2.2的readonly API与readRepresentation，不运行导入命令来查CPH元数据，不在Beacon运行时直接导入Notebook实现文件。FileOutput补可选representation供模型辨认内容投影，不能伪装原文件字节。

**交付门：** 一个生产工具入口完成多源线索、精确保存题面、零持久化联网题面和来源selector；所有档位关闭功能页面／Notebook运行字段旁路，独立文档与主动材料保持。按V1、V2、V5、V6验证；网页／PDF受影响时补现有渲染回归，不以schema字符串断言替代执行入口拒绝。

- [ ] 写 `hints keep conflicting get cph path evidence`、`one source error keeps other hints`、`metadata query does not read code or create snapshots`。CPH只读接口不createLocal／import／导航，不因源码页面读权自动读根外sidecar；磁盘访问执行真实Spot／Flood权限。
- [ ] 写 `saved statement default includes body and viewed time`、`same problem different files select exact saved record`（两文件题面正文／时间不同，指定record或sourceUri只返对应项，未指定不擅选）、`llm fetch refresh has no persistent writes`、`network fetch has no get import panel side effects`、`network failure preserves saved statement`。本地无正文可取五站干净题面，联网开关关闭／登录缺失／解析缺失均按真实状态反馈。
- [ ] 按V2／V5／V6确认红灯；实现hints与题面路由，模型明确选择题目标识，原规范URL和站点题目标识均验证，不能把任意URL或模型推导写成用户看题行为。
- [ ] 写 `shared first read pins exact revision across eviction`、`first read changed fails`、`next answer rechecks`、`selectors keep source structure`、`returned fragments only enter protocol`。首次成功固定发生在scope／预算／selector校验后；32MiB不足拒绝新增，命中仍查scope；回答结束释放共享固定表示。
- [ ] 新增 `runtime and verdict pages are not alternative evidence sources`，在所有档位断言不暴露OJ题面／判题页面读取和Runner／CPH／Notebook输出页面；context.withOjPages不再注入此类页面，专属OJ页面API消费者移除，通用浏览器入口不得回退读取这些功能页。移除workbench Notebook功能页面的自动上下文投影（含正文与outputs／attempt）；独立文档本身、用户主动材料及合法资产操作保持，不删Notebook备份和执行owner。Blackout模型请求路径同时断言代码页名称／路径与正文可读、OJ Connect联网可用、持久记录的列表／读取owner调用数为0；另由软件层真实用户行为路径断言有效根的生产写入正常发生，不把两类调用混算为0。
- [ ] 补齐Notebook模型读口：修改Beacon provider的notebookSchema、模型工具输入类型／桥接及 `extensions/becoder.notebook/src/editApi.ts`，不再向模型暴露或执行editNotebook.read的outputs／attempt；直接伪造参数亦拒绝。增加 `notebook asset reads cannot bypass persisted evidence`，检查最终工具schema、合法内容读取、伪造字段拒绝及返回内容无运行字段；宿主完整备份／输出保留／原生保存与用户运行保持，不能通过删除笔记真实结果来满足此断言。
- [ ] 同一规则贯通 `extensions/becoder.beacon/src/fileTools.ts`、`src/workspaceFiles.ts`、`src/notebookTools.ts` 及 `test/files.test.ts`，复用 `extensions/becoder.notebook/src/model.ts` 的现行格式解释。inspectFiles.read／search对.bcnb与.bcnb-backup先生成内容投影，排除outputs、metadata.becoder.attempt和executionSummary，再分页／检索；磁盘、打开文本及普通文本笔记页面均不可原文旁路，损坏／不支持格式明确拒绝，不返回JSON或base64兜底。加入 `notebook file reads and search expose content only`，用真实工具入口核验Spot／Flood、分页与search均无运行字段、内容仍可读、源文件与完整备份零改动、用户主动材料保持原身份；只在模型可见表示层处理，不新增存储或通用解析服务。
- [ ] 补 `notebook content read does not acquire edit ownership`：读取未打开笔记、已打开dirty笔记和备份时不调用beginEdit／backup／apply／save／showNotebookDocument；保正文中的普通“WA”等文字，排除的只是原生运行字段。关闭Notebook API或损坏格式时拒绝raw回退；用户主动附件路径仍能按原授权捕获，不被自动模型reader的投影替换。
- [ ] 移除新共享读取中的consumeRuntimeRecord和私有contextSnapshots回调，sourceUri／题目／digest真实保留。明确代码队列和共享pin不共用淘汰策略；重跑V1／V2／V5／V6。

### Task 6: 完成工具事实、有效分支与换模型

**Files:** Beacon `extensions/becoder.beacon/src/history.ts`、`src/session.ts`、`src/protocol.ts`、`src/extension.ts`、`src/contextTools.ts`、`src/provider.ts`；test `session.test.ts`、`requestRecovery.test.ts`、`context.test.ts`、`attachments.test.ts`、`models.test.ts`。

**Interfaces:** `type ProtocolSource = Pick<ProtocolTurn,'provider'|'baseURL'|'model'>`；`replayProtocol(turn,source?,mode?: 'conversation'|'completed-tools'): ModelMessage[]`；`ChatHistory.effectiveContextAccess(beforeId?): {keys: readonly string[];snapshots:ContextSnapshot[]}`仅供普通私有材料，代码队列独立owner检查。

**交付门：** effectiveContextAccess独立产生授权key集合，不依赖当前是否缓存正文；overview、memory命中和materialRead fallback均先查key。按§2.5接完成sink与seal身份：error回复只投影真实完成调用／结果对，排除失败正文／reasoning；stopped回复保留停止前已接收正文、兼容reasoning与完成工具供继续，拒绝的只是停止后迟到内容，原状态不改complete。未知source与model不匹配均去私有字段，作用域只及类型化协议metadata，不递归删除业务JSON。

- [ ] 写 `completed tool remains after failed answer and reload`、`stop race checkpoints completed pair once`、`discarded private material blocked before memory and native fallback`、`whole conversation code queue survives branch edit`；执行次数断言1，失败回答仍保持error。
- [ ] 写 `same endpoint different model strips private fields`、`matching source retains compatible metadata`、`business json named reasoning remains data`；unknown来源同样去私有字段，不将思考转普通文本。
- [ ] 按V6确认红灯；error仅投影真实完整配对工具事实，未完成工具不补成功；停止后迟到正文不接收，回放只构造消息不执行工具。新鲜显式工具调用仍是新行为，不被旧结果拦截。
- [ ] 普通私有key先查有效前缀再内存／native fallback；共享事实按当前根独立读取；代码队列按本对话可读且不恢复旧指令／许可。换模型按完整来源过滤协议外层字段，不递归删业务数据。
- [ ] 用最终mock fetch body核验首发／继续／重答／工具续轮，普通消息顺序与导师入口保持；重跑V6。
- [ ] 明确过滤message／part的providerOptions、tool-result.output.providerOptions及内容输出项options，跨来源移除reasoning／reasoning-file；tool input与json output.value内同名业务字段完整保留。models.test的匹配fixture补完整model。加入 `completed tool sink survives abort before checkpoint consumption`，真实调用完成与流消费之间插barrier，执行计数1、配对1、迟到正文0；未完成调用0结果。observer错误锁存后直接关卡阻止下一请求，不测试“observer抛错等于停止”。
- [ ] 加 `stopped continuation retains accepted partial prose` 与 `same call id in two logical steps stays two executions`：停止前已接收文字／兼容reasoning在保存重启及继续后仍在；error只保完成工具。两个合法步骤复用callId时执行与配对均为2，同一步重复sink回调仍只记1，SDK重建不误换logicalStepId。

### Task 7: 实际输入预算与步骤准备

**Files:** Beacon修改 `extensions/becoder.beacon/src/models.ts`、`src/provider.ts`、`src/prompts.ts`、`src/requestRecovery.ts`、`src/extension.ts`、`src/connections.ts`；新增 `extensions/becoder.beacon/src/contextBudget.ts`、`test/contextBudget.test.ts`，修改 `build.mjs`和 `package.json`将新测试加入真实build／test清单。

**Interfaces:** 新模块导出§2.6的 `measureBeaconRequest(input: PreparedBeaconRequest, anchor?: BeaconUsageAnchor): BeaconMeasurement`，实现固定fallback公式与明确媒体coverage。provider的异步prepareStep直接await§2.5的GenerationContext.prepare；middleware和fetch最终关卡补齐适配增量，onStepEnd只发布匹配usage锚并seal协议，不承担可抛错阻断。

**交付门：** 不开启摘要时也能测量每次真实请求、阻止已知超限，并准确保留当前普通步骤状态；所有现有模型参数冲突检查保留。先V6构建新增测试，再跑预算／最终body断言；Task8消费相同PreparedBeaconRequest，不自建估算公式。

- [ ] 写 `32768 24576 8192 yields 24576 22118 14745`、`T minus one T T plus one`、`output reserved once and actual request matches`、`utf8 json and media count in final input`、`invalid usage model branch prefix resets anchor`；缓存token仍占窗口，全零／错误usage不作锚。
- [ ] 按V6生成新增test产物并确认红灯；计量最终适配后的规则／schema／消息／目录／实际工具结果，未返回磁盘正文只计目录；无tokenizer时使用保守估算并标媒体未知，不按字符统一除四。
- [ ] 首发／继续／重答／编辑／每次工具续轮均检查，工具批次闭合后才允许整理，适配后增量必须重计；O固定与实际maxOutputTokens一致，保留模型生成参数冲突的既有拒绝机制。
- [ ] 识别提供方明确context拒绝，包含受限错误正文的已知400分类；不把所有400／413／length当可恢复。把Task8的最多一次语义恢复与原有限网络运输重试分开，已输出／执行活动不透明重演。
- [ ] 验证普通模型步骤20步计数和已完成工具身份不因压缩重置；重跑V6及最终body断言，新test必须进入npm test。
- [ ] 补 `adapter-added prompt material is checked before fetch`、`resolved default O reaches max_tokens`、`observer exception cannot enforce a budget gate`：通过真实SDK＋注入fetch记录最终body，已知超限网络调用数0；检查两adapter的最终O，usage只用inputTokens加未计量后缀。将完整批次与延迟消费barrier接到prepare，不能只用构造字符串测试容量。
- [ ] 加 `tool description change invalidates estimate anchor` 和 `unknown image remains in final request`：只扩大工具description也改变计量和contract指纹；保留原图片bytes／URL，unknownMedia非空、coverage为unknown-media，已知部分未超限时正常到fetch。模拟服务端context拒绝只作一次合法修复，无前缀或图片自身无法容纳则停止；不丢图、换模型、OCR或把未知填0。

### Task 8: 摘要投影、原子发布与有界恢复

**Files:** Beacon新增 `extensions/becoder.beacon/src/compaction.ts`、`test/compaction.test.ts`；修改 `src/history.ts`、`src/session.ts`、`src/protocol.ts`、`src/provider.ts`、`src/requestRecovery.ts`、`src/prompts.ts`、`src/context.ts`、`src/extension.ts`、`src/connections.ts`、`build.mjs`、`package.json`及既有session／recovery测试。原生expectedScope保存桥修改 `src/vs/platform/beacon/common/beaconContext.ts`、`src/vs/platform/beacon/electron-main/beaconContextMainService.ts`、`src/vs/platform/beacon/node/beaconCoordinator.ts` 和 `src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`；不新增删除任务或快照管理服务。

**Interfaces:** 采用§2.5的BeaconCompaction、EffectiveUnit、GenerationContext与CompactionExpectation。ChatHistory增 `commitCompaction(candidate: BeaconCompaction, expected: CompactionExpectation, signal: AbortSignal): Promise<void>`，显式确认实际save，不以普通flush吞错状态作成功。新增 `selectCompaction(units: readonly EffectiveUnit[], checkpoints: readonly BeaconCompaction[]): BeaconCompaction | undefined` 和 `compactBeaconContext(input: BeaconCompactionInput, signal: AbortSignal): Promise<{summary:string}>`；BeaconCompactionInput含固定connection、有效units、合法旧摘要、保留尾部、只读context与同一请求的预算／步骤／deadline状态，不含代码删除入口。具体步骤沿§2.6，不复制普通createGenerator。

**交付门：** 新seal协议与摘要同一次确认save后可重启恢复，延迟checkpoint不回滚；失败候选绝不被以后flush补存。单份当前摘要的前缀选择、共享20步和一次修复均由真实session／provider测试验证。先V6红绿灯及V1保存桥，再重跑Task7和Task6受影响回归。

- [ ] 写 `summary does not mutate code or recent queues`、`summary invalid inside edited covered prefix`、`tail edit and append keep valid prefix`、`restart rebuilds same projection`。只根据覆盖前缀身份失效，不用整个会话revision一变就废弃摘要。
- [ ] 写 `completed tools batch closes before summary`、`summary failure cancel or save failure retains original`、`inflight checkpoint does not overwrite summary`、`failed candidate is absent from later checkpoint and restart`、`summary publication shrinks below T`、`compactor and read continuations never recurse`、`one repair shared by preflight and context rejection`；纯摘要不会重复执行原工具。
- [ ] 按V6确认红灯；压缩输入为当前有效历史、旧摘要、当前问题和必要尾部，可信规则单独重建。只读取材限本对话仍可读历史代码或本次已取得的合法材料；不开放currentCode、首次固定共享凭证、联网补取、学习资产写入或执行工具。沿现有总步数上限有界计数，整理内不因读取生成新普通步骤。
- [ ] 整理自身每次请求含取材后续轮仍核对合法输入容量与实际O，不按90%线启动第二层整理。单条必要材料或整理自身装不下、返回截断／非法、无收益／无可整理前缀时停止，保留原始历史，不盲删旧输入、不换模型。
- [ ] 验证候选“可信规则＋新摘要＋完整保留尾部＋当前请求”确实缩短且低于T，目标G；沿ChatHistory同一writer串行提交：等待已有checkpoint收尾，再基于最新合法会话克隆候选数据并直接确认save结果；候选提交成功前不写进this.data／pending，失败后普通checkpoint不能把它补存，成功后统一合入内存与待写状态，后续checkpoint不回滚摘要。取消／身份变化提交前拒绝，提交成功后报告真实状态。代码队列任何情况下均不由摘要选择删除。
- [ ] 同待发普通步骤主动检查与上下文错误共用一次修复额度，新增真实工具结果才是下一步骤；重启／恢复不重演完成工具。重跑V6与Task7预算回归，保持Blackout仅处理正常临时对话的输入投影，禁持久摘要来源读写，无代码内存镜像；分支与模式边界保持。
- [ ] 加入 `prepare sees sealed tools before stream consumer checkpoint`、`one save contains new raw batch and summary`、`local draft merge retains committed compaction`、`publication followed by abort still reports committed`。两工具批次hold住第二个工具时不整理；seal后hold住fullStream消费者时prepare仍见完整结果，保存payload含同一raw前缀与摘要。完成后普通checkpoint不能降序覆盖，保存失败后普通flush／重启都无候选，原raw事实仍保留。
- [ ] 用第19步触发整理、整理取材后额度耗尽、上下文400拒绝但之前已有工具、SDK重建以及整理自身超过T／B等场景验证：总20步不重置、没有下一步容量则停止；拒绝修复只重建当前未输出步骤，不重演先前工具，不把一般400／413／length当context错误。

### Task 9: 联合回归、模型观察与负责人交接

**Files:** 扩展上述测试及Beacon `extensions/becoder.beacon/test/fixtures/prompt-cases.json`来源说明时保持旧十场景身份；仅在本机Git忽略目录 `tmp/beacon-foundation-eval/` 创建foundation-model-cases.json、foundation-model-eval.ts、build-foundation-model-eval.mjs、foundation-model-eval.test.mjs与新结果目录。现行设计与实现差距继续在docs/beacon维护，私有配置和评估输出不进入文档或提交。

**Interfaces:** 测试调用Task1–8的实际生产服务、ContextTools、ChatHistory、createGenerator和适配路径；宿主／网站／模型可mock，不能仅拼提示字符串绕过生产者。

**交付门：** 前八项已有定向绿灯后，做生产链联合回归与合成强模型观察，记录最后一次正式检查对应的源码状态；再构建一次staged应用交负责人。既有API授权仅用于合成材料，私有配置留本地，实际站点登录／提交和安装版运行由负责人另行验收。已定产品行为不以4B模型回答失败撤回。

- [ ] 联合场景覆盖用户Get Problem（包括有效根下的Blackout）→13条正文队列→切回Spot／Flood后多来源线索→提问零代码捕获→模型读dirty稿并存快照→改稿再读→历史快照→指定失败样例→SDK出站；加入重启、新聊天、代码淘汰与共享pin差异。
- [ ] 联合覆盖代码写入失败／超量、同题不同文件、模型题面补取零专门持久化、工作区正常但Blackout用户采集仍落盘且Beacon不可读／切回可读、完成工具后断线、编辑分支、换模型、摘要阈值与context恢复。快照可见不等于恢复旧文字／许可；测评旧稿不等于新稿已验证。
- [ ] 预检冻结V1–V7命令和实际输入，跑检查；所有skip单列，实际GCC／helper与站点体验另验。主实施者按需求与阶段矩阵自查，独立只读审查具体问题，修复后重跑受影响检查。
- [ ] 外部评估runner用Beacon已安装esbuild打包真实入口，CLI为--config／--cases／--out；本机配置需approved=true，offline test验证未批准不联网、密钥不写出、新输出目录不覆盖、实际工具可达。只用合成材料，沿已有API授权，不在本轮文档工作运行。
- [ ] 强模型观察换题／旧判词／选择性结果／未知覆盖／完成工具断线／分支和代码队列／换模型／代码保存失败／联网题面无副作用／压缩十类，每类一次完整链路；失败保留原记录，修后只追加受影响案例，不预定反复提示调优。Ollama4B只作兼容冒烟，不作为教学上限；配置无效说明负责人，不打印或改配置。
- [ ] 源码与审查收敛后执行V8一次，交付staged应用和检查记录，由负责人验收五站正常流程、讲解依据与失败提示；此处停止。Setup、发布、提交／推送和代理操作真实账号不在本计划。

## 4. 实施时的验证命令

### 4.1 必须落地的断言样例

以下代码为实施时的测试片段，不是本轮已写入／运行的产品测试。沿各文件现有fixture、selected、coordinator与真实生产对象设置前置条件，不能把这些断言改成仅测试自造stub。

Task1在原生fixture创建source并选根后，先捕获scope，再切Blackout，随后beginActivity，真实start／append／end后检查Store；避免把UI忙时切档规则混作采集门测试：

```ts
const scope = await service.captureCollectionScope(1);
await service.setMode(1, 'blackout');
assert.deepStrictEqual(await service.captureCollectionScope(1), scope);
const handle = await service.beginActivity(1, source, scope);
await service.startRuntime(1, handle!, 'runner', source, 'V1', [{
  type: 'compile-attempt', sourceSnapshot: { canonicalPath: await fs.realpath(source) }
}]);
await service.appendRuntime(1, handle!, 1, [{ type: 'finished' }]);
await service.endActivity(1, handle!);
const rows = await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecentRecords('runner');
assert.equal(rows[0].payload.kind, 'runtime');
if (rows[0].payload.kind === 'runtime') { assert.equal(rows[0].payload.code, 'V1'); }
await assert.rejects(service.listRecent(1, 'runner', await service.getContext(1)), /workspace/);
```

Task4沿当前context.test.ts真实ContextTools＋native transport mock读V1、改为V2、再读；对spy捕获的saveCodeRead正文分别精确断言，不能只比返回文字。容量用多字节完整正文边界：

```ts
const exact = '中'.repeat(87381) + 'a';
assert.equal(Buffer.byteLength(exact, 'utf8'), 262144);
const capture = (contents: string) => ({ ...observation, contents,
  contentSha256: createHash('sha256').update(contents, 'utf8').digest('hex') });
const stored = await store.saveCodeRead(conversationId, capture(exact));
assert.equal(stored.state, 'saved');
const rejected = await store.saveCodeRead(conversationId, capture(exact + 'a'));
assert.deepStrictEqual(rejected, { state: 'not-saved', reason: 'too-large' });
```

Task7使用§2.6完整PreparedBeaconRequest fixture，limits为32768／24576／8192，非二进制消息表示由测试明确构造；纯预算算术断言与真实SDK body断言分别执行：

```ts
const value = measureBeaconRequest(input);
assert.deepStrictEqual([value.budget, value.trigger, value.target], [24576, 22118, 14745]);
assert.equal(value.method, 'utf8-estimate');
assert.equal(capturedBody.max_tokens, 8192);
```

Task6／8用可控promise和执行计数证明先前工具只执行1次；让第二工具、普通writer或fullStream consumer分别阻塞，不能用setTimeout猜测竞态。关键断言为“新raw batch与summary同payload”“失败候选不在之后flush／重启”“成功提交后本地draft仍在且summary不被whole-conversation merge吞掉”。编辑Q3、重答已覆盖回答、仅尾部变化及纯追加各自单测，比较实际出站body，不能只检查summary字符串存在。

### 4.2 命令矩阵

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

Task2新增蓝桥身份接线后，在V1编译完成的同一源码状态运行：`npm run test-node -- --run src/vs/platform/browserView/test/common/lanqiaoBridge.test.ts` 与 `npm run test-node -- --run src/vs/platform/browserView/test/electron-main/lanqiaoSessionClient.test.ts`。V3只验证真实已有浏览器动作入口，不把native mock当官网交题证明。

本阶段还会改变context工具描述及Notebook part选择，V6的既有models／session／context／files／attachments／drafts／prompts测试都属于保护范围。新增预算和压缩test必须同时加入build.mjs显式entry与package.json的npm test列表，不能仅通过手动运行新bundle留下默认test漏跑。未改变UI时不新增截图验收工作，完整工具可视化仍不在本轮。

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

自查按任务接口、字段及上下游名称一致、五类Review Focus、每条验收的源码与测试落点进行。新增运行模块仅contextBudget与compaction，另有共享纯声明becoder-beacon.d.ts和两份测试；无新的模型保存／删除快照工具、绑定服务或缓存平台。工具调用可视化记录真实活动接点，完整UI、tips/status／dream、完整视觉和候选增强不默认纳入。

### 5.1 自查与执行方式

主代理按writing-plans清单自行核对完整spec覆盖、步骤是否可执行、跨任务类型一致、五类Review Focus回归和篇幅比例；并行代理只作实际源码接点审计，不能代替主代理自查。审计揭示的OJ rootDir类型、真实活动scope、v1读取、蓝桥真实attempt、协议seal先后、observer吞错和writer merge均已落实到对应接口及测试。

建议Native方式：主代理按依赖连续实现，因Store／ContextTools／history的接口耦合较多，减少跨实现者交接，完成后由独立只读审阅者检查全分支。另一方式是逐任务新子代理实现＋独立审阅，隔离更细，但共享文件需要串行交接。具体方式由负责人选择，不因本轮授权筹划而默认开始实施。

正式实施前检查隔离工作区及当前Git状态，保留后续改动，不恢复已废弃设计；本轮没有创建代码worktree、运行产品检查或追加commit。用户认可方案与实施计划审阅分别记录，本次备份c54e9e49保持不变。

### 5.2 已确认的图片预算边界

负责人于2026-11-23选择：“采用：允许估算不确定时保留图片请求”。落实为§2.6的unknownMedia准入：保留图片、标明计量覆盖不完整，检查所有已知部分，服务端拒绝仍至多一次恢复；无合法容量则诚实结束，不静默丢图、OCR、换模型或把未知填0。此决定同步到需求LONG04与压缩规范，Task7明确回归。本轮筹划没有剩余需要负责人重新裁决的产品边界；具体执行计划和执行方式仍须审阅选择。
