# Beacon 用户行为上下文就绪与可见文档读取设计

日期：2026-11-26（Asia/Shanghai）。状态：负责人已审阅通过，并授权[实施计划及实现](../plans/2026-11-26-beacon-context-availability-and-visible-notebook.md)。实现、验证及实际体验分别记录，审阅通过不替代验证。

起点为 `Beacon_Next@950befec109132e25c190d896e8375a17a04ef0a` 加当前维护工作树。保留已有未提交实现、访谈和报告。本稿不授权 Git 提交、推送、构建、启动实例、云端测试或发布。

现行实现从 [Beacon入口](../../beacon/README.md)、[工具合同](../../beacon/tool-contract.md)、[底层设计](../../beacon/foundation-design.md)及[实现状态](../../beacon/implementation-status.md)读取。本稿定义下一轮目标；只替代与本轮决定冲突的条款，不将未实现设计写成当前行为。

## 1. 目的与本轮范围

保证 BeCoder 推荐的正常拿题、编码、运行、测试和取得线上结果流程中，已经产生的应采集事实能够可靠入队，并在 Beacon 允许发起新回答时可被工具读取。让当前可见 BeCoder Notebook 与 C/C++ 编辑页面具有同等的现场内容读取地位，消除同文档多视图造成的重复采集。

业务模块负责执行与结果，采集适配器负责整理，原生 Coordinator／Store 负责采集资格、发布与就绪状态，Beacon 宿主及界面负责发送门禁，LLM 继续判断讨论对象和取材。

本轮收敛为三组改动：

1. 审查并修正用户行为记录的采集可靠性，补齐记录就绪前的发送门禁和入队失败通知。
2. 将可见 Notebook 的完整内容单元格接入 `readCurrentCode`，并在宿主元数据中暴露其文档身份。
3. 在采集源头按文档身份去重，同时覆盖宿主目录、正文和后续协议的回归。

保留九工具、三个既有近期队列及当前查询方式。Runner／Notebook 不自动判题，CPH 正常提供本地 check；将这项事实及真实状态写清，属于上述改动必需的接口说明与摘要修正。其余教学推理、篇幅、自述失真和通用提示质量问题保留为后续评测线索，不在本轮逐项叠加系统提示。

## 2. 已确认产品决定

| 项目 | 确认行为 |
| --- | --- |
| 记录就绪 | 应采集的记录未完成入队时，Beacon 不允许发送；成功以工具可读的已发布记录为准 |
| 等待文案 | 中文严格为“正在保存用户行为上下文”；英文为“Saving user activity context” |
| 保存失败 | 应采集记录未能正常入队时，右下角通知用户；失败结束等待，保留草稿，不自动发送或重跑 |
| 执行独立 | 程序运行、清理与下一次用户运行不等待 Beacon 证据落盘；记录准备状态单独参与聊天门禁 |
| 规范流程 | 聚焦推荐用法；修正常流程的丢记录、错稿、错位置与错误反馈，不为任意外部改写增加兼容系统 |
| Notebook 现场读取 | 与可见 C/C++ 页面平权，读取调用时的完整笔记内容，含未保存修改，不限滚动区域 |
| Notebook 内容 | 全本 Markdown、C/C++ 和 input 单元格，统一按整个笔记从 1 计数；执行结果仍只走 run 记录 |
| Notebook 哈希 | 每个 C/C++ 代码块独立提供 codeHash，沿用当前完整源码哈希规则 |
| 文档去重 | 同一文档多个可见分屏只返回一份；不同文件同内容分别返回；笔记内相同代码的不同 cell 保留 |
| 自主判断 | 不绑定讨论对象，不增加当前题目选择接口或强制取材顺序 |

后续工程条款按这些决定选择最小实现方式，随本稿审阅，不需要另建 pending 持久队列、来源索引或正文库。

## 3. 已有证据与审查重点

[第二轮访谈](../../beacon/evaluation/2026-11-26-native-harness-interview-report.md)中，实际 Get／Import、三来源运行与 dirty 改稿已发生。某次 CPH 复测命令返回但没有新记录，重开面板并再次发起动作后产生新运行；因实验侧直接修改配置，不能将此认定为正常按钮缺陷或队列延迟。

当前源码将执行退役与部分证据发布分离；发送入口主要检查 runtimeBusy，尚需验证“界面显示结束后立即提问”是否能读到本次记录。Store 已有写锁、临时文件同步与原子替换，但这些措施不单独证明上游事件完整、错误被报告或发布时序符合聊天门禁。

重复正文已由原生记录和只读复现支持：7 次现场代码读取中 6 次包含两份完全相同条目。编辑器服务按分屏枚举同一文档，Beacon 逐 source 读取和列目录；复现中目录也会重复，甚至有相同 pageId。后续独立审查未发现历史装配再次插入同一工具结果的明确证据；本次日志没有原始 HTTP，不能宣称所有请求的传输层均已验收。

实施前的审查沿“正常业务动作 → 实际内容与结果 → 采集适配 → 原生发布 → 工具读取”定位具体缺陷。只修已确认问题；不能把缺记录一律归因于 LLM 或一律归因于落盘延迟。

## 4. 用户行为上下文就绪与发送门禁

### 4.1 就绪状态的职责

复用现有采集和发布所有者，增加原生只读状态 `collectionPending:boolean`。它只用于宿主／界面门禁，不作为模型工具字段或新持久数据，不把正在执行的业务伪造成队列元素。

状态覆盖适配、校验和发布阶段，不能只在 Store 写文件时短暂置位。应采集结果进入处理链前即登记，避免界面先宣告完成、门禁后置位。已有执行占用结束到发布完成之间不能出现可发送空窗。

保存状态不冒充 runtimeBusy，不改变根身份、采集 scope 或选择代数；发送门禁从二者分别派生。不因增加此状态而禁止草稿编辑、拖延进程清理或改变其他已有操作权限。

| 阶段 | 聊天新请求 | 完成条件 |
| --- | --- | --- |
| 原生程序仍在运行 | 沿现有 runtimeBusy 禁用 | 执行及必要清理退役 |
| 应采集结果正在整理或发布 | collectionPending 禁用 | Store 成功发布，或失败明确结束 |
| 记录发布成功 | 无其他阻塞时恢复 | 对应记录具有真实 ID，当前队列读取可取得 |
| 采集／发布失败 | 发出通知后，无其他阻塞时恢复 | 失败已报告，采集状态释放，旧队列按原规则保留 |
| 无须采集 | 不增加保存等待 | 保持既有运行／会话门禁 |

“成功发布”沿原生 Store 的原子发布确认，不用上游 void 命令返回、界面渲染完成或 fire-and-forget Promise 代替。无需在生产每次保存后整份读回队列；以同一原生发布结果和实际读取链保证一致，并由回归验证。

多个应采集任务重叠时，相关任务全部成功或失败结束后才能恢复。共享同一合法 Beacon 根的窗口以原生根身份上的未完成采集状态为依据，不按聊天复制状态；通知由原动作所属窗口发出。无关根的任务不互相阻塞。模式不改变有效根的软件采集，因此 Spot／Flood／Blackout 对这段保存等待采用同一门禁。

只保留本次实际任务必要的生命周期状态；复用完成／取消／异常路径释放，不新增用户操作等待队列、自动重放、备用落盘位置或任意超时猜测成功。切根、关闭窗口等沿既有 scope 和所有权规则结束，不能把旧结果改投新根或留下永久禁用。

### 4.2 三类队列的开始与结束

| 来源 | 应采集阶段 | 不构造记录的情况 |
| --- | --- | --- |
| problem | 支持站点的真实 Get／Import 已取得可用身份，准备发布读题事实；在交付动作完成前衔接保存门禁 | 无合法采集根、非五站、动作未取得题目身份或主动取消且未产生事实 |
| run | 正常运行动作固定合法采集范围；实际编译尝试开始后保留本次记录职责，直到结束事实成功发布或明确失败 | CPH Compile Only、无合法范围、编译尚未开始的后续程序，不产生虚假尝试 |
| verdict | OJ Connect 完整取得可入队的最终结果后，在展示终态与采集发布之间衔接保存门禁 | queued／judging 尚无最终记录、取不到完整终态、源码 mismatch 等已有拒收情形 |

OJ 远程判题等待期间没有最终记录可发布，不新增“等待 OJ 结束才能聊天”的规则；一旦终态已取得并进入应采集处理，就不能在保存尚未结束时提前开放发送。程序原有运行门禁保持不变。

所有入口都使用同一规则：主页发送、详情发送、Enter／快捷键、继续、重答和编辑旧问题后的请求。界面禁用之外，宿主在新请求实际受理前核验原生状态；迟到状态消息不能绕过门禁。草稿可继续保留，恢复后由用户自行发送；不自动排队或发起模型请求。

保存提示使用既有发送状态提示位置，正文为“正在保存用户行为上下文”。与正常运行提示、聊天生成和聊天历史保存状态分别表达，不把 record 保存复用为程序仍在运行。

### 4.3 失败通知

应采集记录因适配异常、校验失败、32 KB 拒收、I/O 或发布失败未正常入队时，统一走右下角通知，不只记控制台、日志或终端。编译失败、错答、运行错误和取消是记录中的业务结果，不等于记录保存失败。

通知包括来源和对 Beacon 上下文的影响，保留产品原有业务结果。示例：“本次 CPH 运行记录未能保存至 Beacon，实际测试结果不受影响。”32 KB 拒收明确说明容量原因。若发布后确认失败、记录可能已经写入，应说明“无法确认本次记录是否已保存”，不冒称肯定未写入，也不自动追加、回滚或重跑。

同一次动作的同一失败只通知一次，避免适配器和原生入口重复弹窗。Notebook 批次可合并报告本批保存失败，不为每个字段失败分别弹窗。复用既有源码 mismatch 等特定通知，不再补发含义重复的通用通知。缺工作区、根外材料、仅编译和其他按规则不采集的操作不弹“保存失败”。

## 5. 可见 Notebook 与 readCurrentCode

### 5.1 读取范围

`readCurrentCode({})` 输入保持不变，一次读取当前窗口全部可见分屏中的 C/C++ 文档和 BeCoder Notebook。Notebook 首版特指本产品文档，不新增 Jupyter 或任意 Notebook 内核支持。

现场来源须由实际已加载的 BeCoder Notebook owner 识别，不能只根据文件后缀将未知编辑器、备份文本或后台文件当成当前笔记。

读取时取得完整当前内容，包含 dirty 和未命名文档；不读后台标签正文，不自动打开文档，不保存用户文件。当前 Notebook 内容与 C/C++ 页面一样沿现场页面权限，在无 Beacon 根、Blackout、Spot、Flood 中都可用；这不授予 backing file、相邻文件或外部附件的磁盘读取权限，敏感与内部资产过滤继续成立。

Notebook 读取由 Notebook 内容 owner 直接取得已加载模型并作内容投影，不能先走普通文件权限再借路径读取磁盘，以免误拒绝根外或未命名的可见文档，也不能借 owner 回退去读后台文件。现有 inspectFile 的笔记读取沿文件权限保留。

Notebook 返回整本 Markdown、C/C++ 和 input 的当前文本，保原顺序和全笔记从 1 开始的 cellNumber；不是屏幕当前滚动位置或仅选中单元格。排除 outputs、attempt、executionSummary 等执行事实。已有附件描述可按内容合同保留，不增加图片处理或自动追读引用文件的能力。

每个 C/C++ 单元格的 codeHash 对完整原稿按现有规则计算：只统一 CRLF→LF，UTF-8 后 SHA-256 小写 64 位。Markdown 和 input 不计算代码哈希，笔记整体也不生成冒充程序身份的 codeHash。不同单元格即使 hash 相同也分别保留。

读取不增加快照、题面缓存或新持久化。完整返回沿既有普通工具历史与预算／同步压缩处理，不把 run 的字段额度或 32 KB 入队上限套用到现场笔记。

### 5.2 返回结构

沿用 `files` 顶层数组，通过 `kind` 区分源文件和笔记；普通代码保留既有字段，Notebook 使用 cells，不将整本笔记塞进一个 code 字符串。

```ts
interface VisibleFileBase {
  fileName: string;
  filePath: string | null;
  isDirty: boolean;
}

type VisibleFile =
  | (VisibleFileBase & {
      kind: 'code';
      code: string;
      codeHash: string;
    })
  | (VisibleFileBase & {
      kind: 'notebook';
      cells: NotebookContentCell[];
    });

interface NotebookContentCell {
  cellNumber: number;
  kind: 'markdown' | 'code' | 'input';
  language: string;
  source: string;
  name?: string;
  codeHash?: string;
}
```

cell.kind 使用语义名称；input 的 name 有实际名称时保留。codeHash 仅在 language 为 c／cpp 的 code 单元格存在。Notebook owner 的内容投影由现场读取和 inspectFile 复用，编号、类型和正文同口径；原始用户文档格式与执行逻辑不改。已有必要的附件描述沿原内容合同补充，不展开原始 metadata。

未命名文档的 filePath 为 null，仍以真实文档身份分别处理。跨调用始终取得调用时现场，不能因上一轮内容相同而跳过读取。单次读取期间关闭、改版或可见文档集合变化，沿既有一致性合同返回明确错误，不用旧稿或磁盘稿伪装当前成功；不静默漏掉不可读文档。

### 5.3 宿主元数据与工具分工

Notebook 标题、路径／URI、文档类型及已有活动状态进入本窗口宿主元数据，权限与内部材料过滤保持。元数据只表达已打开文档身份，不自动携带正文；后台标签仍不因列入目录而获得现场正文读取权。

readCurrentCode 读可见现场，inspectFile 读授权路径中的普通文件／笔记正文，readRunRecord 读执行事实。readPage 继续不读取 Notebook 运行结果，不新增功能页旁路。模型仍自行判断讨论对象，无 activeProblem 或上轮对象接口。

## 6. 源头去重与历史边界

基于现有 canonical URI／模型文档身份在读取前合并同文档视图；不以正文 hash 或 filePath:null 作为去重键，不新增文件系统别名扫描或身份库。

| 情况 | 返回 |
| --- | --- |
| 同一源码／笔记在多个可见分屏 | 一份内容，只读取一次 |
| 同文档有一个可见视图、另一个后台视图 | 一份现场内容，后台副本不再增加条目 |
| 关闭一个分屏，另一个仍可见 | 保留该文档，不错误撤销剩余视图 |
| 不同文件正文相同 | 分别返回，各保自身路径 |
| 多个未命名文档 | 分别返回，不因路径为 null 而合并 |
| 同笔记不同单元格代码相同 | 分别保留 cellNumber 和 hash |
| 当前正文与 run／verdict 内的历史稿相同 | 保留各自实际来源与时间身份 |

宿主目录与正文共用一致的文档身份整理，避免正文一份而目录仍重复或出现同 pageId 多条。可见、活动状态由实际视图汇总，不误把后台标签当成第二个可见文档，也不丢掉仍存在的活动视图。

这项合并针对 C/C++ 和 BeCoder Notebook 文档；不按网页 URL 合并不同浏览器标签，不扩大为 PDF／其他功能页的身份重构。

不在协议层作全局文本去重。每次真实工具调用保真实名字、参数、结果和时间位置；跨轮同内容重读属于新的观察，继续沿普通历史保存。原有历史中的重复正文不自动批量重写；协议恢复、摘要与有效分支合同保持。

## 7. 工具语义与摘要

工具说明保持英文，只陈述用途与结果含义，不规定调用顺序。建议正式文本：

- readCurrentCode：`Read all currently visible C/C++ documents and BeCoder notebooks at call time, including unsaved edits, filenames and paths. Each document appears once. Notebooks include all numbered content cells; C/C++ code has codeHash. Execution results are excluded. Background tabs are excluded.`
- readRunRecord：`Read recent execution records: an optional filePath filters the list; id or latest reads one record. Runner and Notebook execute without automatic answer checking; CPH provides local check results when checking completes. runs[].status is the student process outcome; runs[].check is the independent answer-checking outcome. Program output is merged for Runner/Notebook and separate for CPH. Text values with {text,truncated:true} are incomplete prefixes.`

不向 system 加入逐工具操作手册；readBeCoderInfo 的 runner／cph／notebook／beacon 主题同步修正当前能力事实。一般教学篇幅、算法正确性、自述准确性等另设评测，不以本轮字段变动宣称解决。

run 目录摘要由真实字段确定性生成，分别说明编译结果、已执行／未执行输入和已有 check；不将准备的输入数说成已经执行的次数。示例语义：

| 真实情况 | 摘要重点 |
| --- | --- |
| CPH 编译失败，1份输入未运行 | 编译失败；1份输入未执行；尚无 check |
| Runner 运行完成 | 编译成功；1份输入已执行；无自动答案检查 |
| CPH 三点完成，均通过 | 编译成功；3个测试点已执行；3项 check 通过 |
| CPH 执行完成但检查阶段异常 | 保真实进程事实；说明 check 未取得，不伪造 passed 或说产品不支持检查 |

CPH 支持本地 check 是产品事实，不代表每条失败／未运行记录必有 check；Runner／Notebook 缺 check 则符合其能力分工。程序状态、编译结果和检查结果分层表达，编译 stderr 为空不能推断程序 stderr 为空。

## 8. 受保护范围与兼容

三队列仍为 problem13／run30／verdict20；容量、去重、失败结果入队、旧大记录拒读、源码 mismatch 和根资格保持。Blackout 有效根继续采集，持久消费仍关闭；现场 Notebook 平权不开放任何运行结果旁路。

无 codesnap、readMaterial、editNotebook、pending 记录库、新索引、共享用例库或后台迁移。无模型写文件、Shell、运行或提交能力。inspectFile、readPage、browseWeb、fetchProblem 的其他权限和功能保留，fetchProblem 与搜索开关仍独立。

不为任意外部改写 CPH 配置、路径别名、异常个人习惯或全文输出恢复增加机制。正常编辑、重新运行、普通失败、取消和合理多窗口属于现有产品流程，必须正确处理；存储错误不能借“非规范用法”排除。

## 9. 工程所有者与验收

| 所有者 | 本轮职责 |
| --- | --- |
| 业务 owner：OJ Connect／Runner／CPH／Notebook | 确认真实动作与应采集事实，衔接记录完成／失败及原生通知，不改变执行清理 |
| 采集适配器与原生 Coordinator／Store | 发布生命周期、collectionPending、采集资格、原子入队、错误归属与共享根状态 |
| 原生编辑器／Notebook owner | 可见文档身份、去重、dirty 正文、内容投影、版本一致性 |
| Beacon ContextTools／Provider | 工具返回联合结构、哈希、精简说明与来源语义；不扩大模型权限 |
| Beacon 宿主／Webview | 保存文案、按钮及所有请求入口门禁、迟到消息保护、保留草稿 |
| 文档 | 实施后同步当前合同／PRD／架构／底层／实现状态与提示对照；历史访谈原答保留 |

工程验收重点：

1. 正常 Get／Import、Runner、CPH 单点／全部、Notebook 单程序多 input／多程序及 OJ 终态均形成正确记录；真实执行稿、输入、输出、编号和去重正确。
2. 控制一次真实发布的完成时机，验证业务已退役而证据尚未发布时，按钮与宿主均拒绝新请求；完成后工具能读到对应 ID，用户必须再次主动发送。
3. 适配失败、校验失败、32 KB 拒收、写失败与发布确认不明均正确通知、释放等待、保留草稿；不重跑、不重复追加、不影响下一次正常采集。
4. 同根多个任务、两个窗口和模式切换不提前解除保存门禁，不使无关根被阻塞；窗口／根生命周期没有残留等待。
5. C/C++ 与 Notebook 同屏、dirty／未命名笔记、背景标签、根外现场与三模式的读取符合新合同；Notebook 返回全本编号正文，排除所有执行字段。
6. 每代码块 hash 与实际 run 同口径；同文档多视图、关闭其中一屏、不同文件同正文、多个未命名文档和同笔记相同代码多 cell 均按第6节返回。
7. 目录无重复文档，正文只读取一次；工具协议与后续历史中每个实际调用只配对一次，保留跨轮合法重读与不同来源事实。
8. 三来源的正常执行、编译失败、未执行与检查异常摘要准确；模型能区分无自动检查、未取得 check、已通过 check 和程序正常退出。

类型／拥有者回归、原生交互、有限模型效果和新 stage 分别记录，旧798项回归或既有stage不能证明本轮实现。原生验收只使用推荐流程；测试驱动等待业务真实结果，不以命令返回冒充执行完成。模型测试保原答和失败，不只统计工具成功率。

实施计划已形成并冻结变更及验证清单；负责人授权接着实现，交付stage。实例操作和云端测试不由设计稿落盘或源码检查自动执行，后续另行验收。
