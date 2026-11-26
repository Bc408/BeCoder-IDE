# Beacon 信息流提示词设计：第3轮工具结果与后续入口

日期：2026-11-26。基线`Beacon_Next@eb48d147`，生产提示仍为`2026-11-26.3`。修订`R3-D1`，已接入工作树2026-11-26.4。本稿已纳入负责人批准的[统一设计IF-D1](../../superpowers/specs/2026-11-26-beacon-prompt-information-flow-design.md)；集成限定以统一设计为准，下文保留本轮设计与审阅过程。

负责人已采纳[首层环境](2026-11-26-prompt-information-flow-round-1.md)，并采用[第2轮](2026-11-26-prompt-information-flow-round-2.md)的运行结果形式：harness生成相关短notes，与record事实分开，随结果返回。本轮设计每个来源的成功、空、部分和失败分支；摘要、图片适配及历史回放在后续轮继续审阅，但连接关系从本轮即保护。

## 1. 位置、事实与释义

工具用途和参数在调用前帮助选择来源与指定目标；正文、相关短释义和后续读取位置在实际调用返回时提供。模型看到的最终结果才是审查对象，不用UI的活动文字或错误通知代替模型反馈。

正常结果保持各来源本来的形态：files、records／record、problem／document／retrievedAt、文件／页面正文、sources，以及version／topic／content。run增加已批准的外层notes；其他来源仅在字段本身不足以说明含义时，拟用相同的可选短notes，具体候选如下。没有适用释义时省略notes，不制造空数组或给每个字段包一层说明。

notes是应用确定性生成的字段释义，不能用另一次LLM调用生成，不能将原始源码、网页、诊断正文里的指令晋升为应用说明。它不判断解题对错、关联题目或替模型选择材料，不改写record、队列和用户资产，不增加新记录、索引、缓存或阶段hook。每条返回内相同含义只说一次；不另建跨轮提示去重状态。

以下英文是候选的生成模板；占位符只在有真实值时插入。每项按适用条件产生，不把整张说明表每次全部发给模型。每项都需要中文审阅，以下表格的“含义”即对应中文语义。

## 2. 实时代码与Notebook

来源：[contextTools](../../../extensions/becoder.beacon/src/contextTools.ts:128)。保持files数组、文件路径／dirty、代码正文、Notebook编号cells和已有hash；不新增捕获时间字段，不把请求开始时间伪作各文档的原子读取时间。

| 实际条件 | 英文候选 | 含义 |
| --- | --- | --- |
| files含codeHash | codeHash identifies the complete captured code after CRLF-to-LF normalization. | hash描述完整捕获稿的换行归一化文本，不是执行或正确性结论；此模板在历史代码来源共用 |
| 返回Notebook | cellNumber is the 1-based position among all cells in the notebook as read by this call. | 当前笔记位置按本次全本内容计数，不是历史执行位置 |
| files为空 | No C/C++ document or BeCoder notebook is currently displayed in this window's editor panes. | 本次没有符合现场读取范围的可见文档，不表示磁盘或后台不存在 |

“调用时现场”已经由工具用途交代，成功结果不再重复一大段读取规则。缺路径保持null，isDirty表示未保存修改；这些现成字段不增加统一来源／时间／版本模板。Notebook附件只保原描述，不因读取笔记自动读取附件或运行输出。

## 3. 三个近期队列

来源：[查询与固定事实](../../../extensions/becoder.beacon/src/contextTools.ts:100)、[模型投影与目录](../../../extensions/becoder.beacon/src/recordProjection.ts:26)。三个队列各自的事实身份和保存规则保持。

### 3.1 目录与空结果

| 实际返回 | 英文候选 | 含义 |
| --- | --- | --- |
| 任一records列表，包括空列表 | These are currently available recent records, newest first, not a complete activity history. | 只说明当前保留并可读的近期范围，不推断更早行为 |
| run／verdict目录 | Entries are summaries; id reads the corresponding retained record. | 目录不等于读过详情；problem目录原本就含完整看题身份，不附此句 |
| records为空 | No matching record is available in this recent queue. | 当前队列在本次筛选下无可用项；保records:[]成功形态 |
| latest无匹配项 | 同上述空目录释义，error.code为not_found | 选择不到一项，与成功空目录分别表示 |
| 指定ID读失败且无法确认原因 | The requested record is not available. | 不擅自断言被淘汰、从未存在或原活动未发生 |

列表过滤仍由传入filePath和实际匹配决定。目录不预读正文或固定其版本。按ID首次成功读取的记录在本回答内固定；后续同kind＋ID保持同一事实，latest重新选择可取得新入队ID。notes不重写这些规则。

### 3.2 看题记录

保problem、filePath、viewedAt。它记录用户取得题目的行为，不作为永久代码／题目绑定。路径缺失保持null；不补题面、标题或代码正文，不更新用户查看时间。

详情字段已自足时不追加notes；列表沿3.1表达近期范围。需要题面时由fetchProblem的独立用途入口帮助模型发现，不在看题结果后强加“下一步必须读题面”。

### 3.3 本地运行详情notes

| 实际条件 | 英文候选 | 含义 |
| --- | --- | --- |
| 返回run详情 | record.status describes the overall operation; compile.status and runs[].status describe compilation and individual process outcomes. | 总流程状态、编译状态和各进程状态分别解释 |
| source为runner／notebook | {sourceName} does not automatically check answers. | sourceName只取本条来源Runner或Notebook；正常进程退出不自动产生答案判定 |
| source为cph | check records answer checking separately from process status; an absent check supplies no answer verdict. | CPH检查与学生进程结果独立，缺check不算通过 |
| 实际程序output含merged | Program output.merged combines stdout and stderr; these streams are not separated in this result. | 只解释实际合流表示，不反推stderr为空 |
| 实际程序output含stdout／stderr | Program output.stdout and output.stderr are separate captured streams. | 分流字段按实际名称理解，缺失流不补为空串 |
| 具有not-run／start-failed输入 | Inputs marked not-run or start-failed were not executed. | 准备的输入不冒充实际执行次数 |
| 实际input.text为null | input.text is unknown where it is null; an empty string means known empty input. | 无法捕获与实际空输入分别保留 |
| 有完整源码hash | 复用第2节codeHash释义 | hash在完整原稿上计算，不用截断正文反算 |
| Notebook具有codeCellNumber／inputCellNumber | Recorded cell numbers are 1-based positions among all notebook cells at execution time. | 调序不改历史位置，不宣布旧坐标失效 |
| 具有workingDirectory | workingDirectory is the directory used by this recorded execution. | 运行目录是该次执行事实，不冒充保存CPH配置或当前文件根 |

只生成与该来源和实际字段相关的释义，不再将输入输出或现有目录summary复述为另一份记录。记录中已有gaps、skipReason及error继续保原有事实；说明不能补出缺失的编译器选项、代码、输入或checker细节。

### 3.4 永久缺失的运行文本

| 实际字段形态 | 英文候选 | 含义 |
| --- | --- | --- |
| 新格式{text,truncated:true} | Values marked truncated are saved prefixes; their omitted suffixes are not available through this record. | 保存时已省略的部分不能从本记录续读，不增加分页或全文库 |
| 旧格式head／tail | This legacy output stores head and tail separately. | 只说明已有表示，不把尾部误写成连续前缀，也不从形状推断必有缺失 |
| 旧格式omittedBytes或sourceOmittedBytesAtLeast大于0 | Output counted by omittedBytes or sourceOmittedBytesAtLeast is unavailable through this record. | 只在实际计数大于0时说明缺失；omittedBytes大于0才可进一步明确本地省略的中段，不猜上游缺失位置 |
| 同时出现执行output-limit与文本截断 | Text truncation describes retained evidence; output-limit describes the process outcome. | 文本保留范围与实际执行终止分别理解 |

“不在本记录中”不等于所有用户文件或其他独立来源都不存在。工具不承诺从同一路径的当前内容恢复过去版本。执行器输出显示、32KB拒收、8192／4096／1024码点规则和队列容量不变；notes不写入队列或计入持久单条记录大小，但它实际进入模型请求，须计入上下文预算。

### 3.5 最终线上测评

保problem、filePath、observedAt、submission和result现行投影。notes只解释实际返回的提交稿、hash或逐点字段：

```text
This result describes the recorded submission. Per-test outcomes are judging results, not the underlying test inputs.
```

中文：这份结果描述记录中的那次提交；逐点结果是判题结果，不是底层测试输入。

逐点说明在实际提供逐点明细或统计时出现；没有逐点数据就不说已取得明细。提交代码缺失保持缺失，不能用当前编辑稿替换；hash仅在已有合法完整源码依据时解释。不把AC扩大成已取得隐藏用例、某类边界或最大规模数据。mismatch仍由业务层与Store拒收，不作为模型可消费判词。

## 4. 题面、产品知识和普通读取

### 4.1 fetchProblem

保problem／document／retrievedAt，不新增题面持久化。problem给本次规范题目身份，document给实际解析的题面、样例和约束，retrievedAt是取得时间，不是用户看题时间。

成功正文足够明确时不额外加notes，不复制Get／Import行为；可选字段缺失就保持缺失。身份非法、登录受限、网络或解析失败，只在owner有明确依据时说明具体原因，不把任意网页文本或站点错误字符串自动判断为可靠登录状态。

### 4.2 readBeCoderInfo

保version／topic／content：version为运行宿主发行版本，topic为实际主题，content为随包产品事实。用途及参数已说明来源，成功时无需再附一段“不是个人配置”的重复警告。七主题正文在后续内容审阅中对照本轮释义去除语义矛盾；本轮不自动删除仍有独立说明价值的产品知识。

### 4.3 文件／页面文本范围

保持原offset单位和nextOffset，不改成pi的行号参数。readPage保实际来源、内部版本、capturedAt和总字符等已有字段；inspectFile不凭空补当前未返回的总长度或观察时间。

| 实际条件 | 英文候选 | 含义 |
| --- | --- | --- |
| 文本返回nextOffset | To read the next range, use offset={nextOffset}. | 后续位置由harness计算，不让模型推算UTF-8字节 |
| PDF页内还有nextOffset | To read the next text range on this PDF page, keep pageNumber={pageNumber} and use offset={nextOffset}. | 同页内续读保物理页号；翻页是另一操作 |
| 二进制片段 | contents contains hexadecimal bytes; offset and nextOffset use byte positions. | hex不是已解码正文，位置按源字节 |
| Notebook语义投影 | Notebook text contains numbered content cells, without execution results. | 普通路径的笔记内容与执行事实来源分开 |
| find／search／list实际truncated:true | This listing or search is incomplete; it provides no continuation cursor. | 不完整搜索结果不代表没有其他匹配，也不伪造分页参数 |

同一nextOffset同时由字段与一句行动提示表达，目的只是降低下一次构造参数的开销；它不保证本回答还有预算，也不保证跨调用源文件未变化。预算不足、源关闭或改版分别用实际失败反馈处理，不增加页面快照或跨次锁定机制。

readPage的truncated也可能表示offset>0而未返回前缀，不等于后面必有剩余正文；真实nextOffset只在后面还有内容时出现。notes按实际范围表达，不从truncated布尔值生成通用“继续读取”。没有nextOffset时不凭空指定新位置或宣称已取得未返回的前缀。

图片保原图片part与元数据，禁止把base64作为普通文本交给模型阅读。图片适配后材料归属和时间在下一轮回流层审阅；当前不变更视觉能力或采用OCR兜底。

### 4.4 browseWeb

保sources数组中的id、url、title、text、kind、retrievedAt及truncated。notes按实际形态出现：

| 实际条件 | 英文候选 | 含义 |
| --- | --- | --- |
| kind为search | Search text contains excerpts, not full webpage content. | 搜索摘录区别于页面读取 |
| 任意来源truncated:true | Some returned source text is incomplete; no continuation offset is provided. | 不从网页截断推断可分页或重新fetch就一定完整 |
| 本地预算实际省略了后续来源，但已返回至少一项 | Some sources were omitted because the remaining web lookup budget could not accommodate them. | 来源集合不完整与单个text截断分别表达；保留已取得正文 |
| sources为空 | No sources were returned by this lookup. | 仅描述本次返回，不能扩大成网上没有答案 |

普通网页与五站题面分别保原能力；notes不自动生成未出现的参考链接、不发起第二次联网。引用取自实际sources，引用建议不在每个来源行重复。6次／32000字符预算保持，耗尽时用明确budget失败表达，不通过空来源冒充已成功查完。

当前实现存在预算余量不足以容纳来源开销时直接结束收纳的路径；候选需在工程层按该次循环和本地计数明确识别：尚未收纳任何来源即因预算退出，返回budget；已收纳至少一项但因预算省略后续来源，返回已有正文并附上述集合不完整释义；实际没有可用来源，保成功空数组。不能根据空结果或任意text.truncated反推原因。这里是待审工程表达变化，不是现行已交付事实，不增加跨轮状态或来源库。

## 5. 失败反馈：同一基本形状，保留具体原因

### 5.1 负责人已采用的模型失败结构

负责人回复“采用”：模型可见失败统一使用error:{code,message}。保留文件／网页原有ok:false，以及文件已有且已知的path；没有有效路径时不伪造。各来源不强行统一成功形状。示例是拟议投影，不是当前实际返回：

```json
{
  "ok": false,
  "path": "D:/BeaconDesignLab/missing.cpp",
  "error": {
    "code": "file-not-found",
    "message": "The requested path does not exist. Check the listed root and the relative or absolute path."
  }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "budget",
    "message": "The web lookup budget for this answer is exhausted."
  }
}
```

code保留来源明确给出的应用错误码；不为统一形状把路径不存在、权限、联网受限等压成一个unavailable，也不强建所有模块通用的大分类系统。message由应用生成安全英文，描述本次失败和已知可行操作，不泄露堆栈、秘密或原始网络响应。

文件当前已把file-not-found等具体原因映成material-missing等UI码，因此必须在FileTools捕获并分类异常的位置，保留fileErrorName的安全原因供模型投影使用。UI仍消费原code，原始文件结果error仍为字符串，message复用既有safeFileError，不从UI码反推原因，也不再建一张重复文案表。模型error对象只在模型投影内形成，不直接替换原始文件结果的error字段。

这项候选只调整模型投影与必要的明确错误分类；UI沿原活动映射和本地化流程。实现必须查清错误来源的消费路径，不通过重命名原错误而破坏通知或错误活动显示。历史工具返回按实际旧形态重放，不重写历史记录或将新notes事后套上旧结果。

### 5.2 具体原因与行动边界

| 已有可靠依据 | 应表达的内容 | 不额外承诺 |
| --- | --- | --- |
| 路径不存在 | 请求路径不存在；可检查本次列出的根与路径 | 不扩大成整个产品／工作区不可读 |
| 文件预算耗尽 | 本回答的文件额度已用完 | 不诱导无效重试或绕过原额度 |
| 参数组合无效 | 指明被拒绝的组合或该操作所需参数 | 不返回长版工具手册；不替模型静默改目标 |
| page关闭／改版 | 本次读取目标已关闭或读取期间变化 | 不自动打开、恢复或读取旧副本 |
| beacon-context-changed | 本请求的工作区或模式等scope已变化，本次读取不成立 | 不以新scope重放旧请求或跨根取材 |
| beacon-conversation-owner | 本次请求与当前会话归属不匹配 | 不转读其他会话或把新归属套回原请求 |
| beacon-notebook-content-owner | 该文档没有可用的受支持已加载Notebook内容表示 | 不误称会话归属改变，不回退raw JSON或磁盘执行字段 |
| 记录不可用 | 当前不能取得该记录 | 只有确知淘汰时才说淘汰，不否定用户经历 |
| 旧run超过32KB | 该条正文超限，其他记录仍可读取 | 不破坏原队列或将超大正文绕行普通文件读出 |
| OJ明确登录要求 | 对应题面读取需要用户处理站点登录 | 模型不登录、不提交、不新增验证码或账号查询能力 |
| 网络超时／解析失败／未知异常 | 保有依据的原因；未知则只说本次来源未读到 | 不用异常自然语言关键字猜登录、权限或站点支持情况 |

能直接指导修正的事实留在这次message中；没有可靠后续入口时如实停止该来源，不默认给所有错误加“重试／换工具”。不新增retryable、nextAction对象或自动恢复流水线。

ContextTools目前将多种错误转成同一泛化message，并用异常文本正则分类；文件已有独立安全错误说明，网页主要返回简码。这是本轮需要工程配合的位置。实施时优先使用已有受控代码、显式失败分支和OS code；上游确实没有可靠分类时保持通用read_failed，不能仅换更自信的说法。

原生受控码在ContextTools按确切代码分别解释，不能因名字含owner就归为同一种失败。UI继续沿toolFeedback原映射消费，未知失败只兜底当前来源的读取失败。OJ题面失败沿readBeaconProblem→适配器readProblem→题面transport的实际链取得原因；例如transport明确识别登录跳转才可说明需要登录。OperationError只有提交阶段和交付状态，不是题面错误原因合同，不用于替代此链；不改造提交流程或新增登录探测。

## 6. 接入、回放与验收边界

1. 第2轮用途说明与本轮结果释义成组接入，不先移除旧说明造成信息缺口。
2. 新执行的toModelOutput、onToolExecutionEnd已完成事实与protocol.result复用同一确定性模型投影，notes和error对象在这三个出口保持一致并计入后续预算。webModelOutput显式保留可选notes，不能继续只重建ok／sources而丢弃释义。Context输出同样复用原返回的安全模型形态。UI通知不自动成为模型输入。
3. 原始文件结果继续保现行UI码和字符串error，供活动显示与message.toolResults[].output使用，避免现有history校验拒绝加载；模型结构化失败仅存在模型投影／协议事实中。旧protocol按已保存内容回放，不重新生成notes或用本轮投影改写旧结果。必要内部原因元数据的具体承载在实施计划核对，不能扩大为新的存储机制或迁移。
4. 普通成功结果和入队正文不重新截短；结果层释义不绕过权限、额度、采集与执行边界。已有脱敏继续作用，生成内容只取安全标识与确定性事实。
5. 摘要子请求仅能读已固定历史ID，参数声明在对应阶段收窄。该阶段必要的历史记录释义也计入出站预算，不能复用已移走说明而不补对应结果语义。
6. 后续离线验证覆盖实际toModelOutput、普通／摘要／续答请求、空／截断／错误、图片媒体part、旧历史兼容；模型观察另看选材、完整性和事实解释，不以调用次数判断质量。

本轮先作两份独立只读复检并修订单一候选。这里只是设计文档，不改生产代码、不构建、不调用模型服务、不提交或推送。产品知识正文与跨轮回流在后续轮继续推进。

## 7. 主agent的静态信息流推演

| 合成输入与返回 | 应保留的含义 | 避免的语义断点 |
| --- | --- | --- |
| 查看近期运行，返回records:[] | 当前队列和筛选下无可用项 | 不否定用户以前曾运行，也不从空目录虚构详情 |
| CPH编译失败，输入为not-run且无check | 编译失败导致输入未执行，没有本次答案判定 | 不将准备的测试点说成已经测试、不把缺check说成通过 |
| Runner源码hash存在、输出仅有truncated前缀 | hash指完整捕获稿；能分析可见片段，未保留输出不能续读 | 不用输出前缀重构完整结果；不因片段缺失否定静态推理 |
| readPage从非零offset读到最后一段，truncated:true但无nextOffset | 返回范围未包含前缀，当前无后续游标 | 不因truncated自动追加无效续读 |
| 搜索网页返回search摘录，普通浏览器实际加载验证页 | 两个来源和取得方式不同 | 不将联网摘录冒充内置浏览器已经加载的页面正文 |
| 文件预算失败但原记录工具仍可用 | 某工具本回答额度耗尽 | 不扩大成所有材料不可用，也不绕过原文件权限 |

这些是设计者对候选信息含义的检查，不是模型已实际作答或通过测试。

## 8. 独立复检与修订

一名审阅者复核成功／空／截断及回流接线，指出旧格式计数可为0、网页可能只省略后续来源、webModelOutput必须保留notes。另一名审阅者复核失败结构和消费链，指出必须在文件分类点保留原因、区分两类owner、沿实际题面链识别原因、同时保持模型投影和原始UI／历史合同。

主agent已定点核对源码并形成D1，修订上述7处；两名审阅者对各自改变点复检，确认原发现均在设计层闭合。失败链审阅者另校正原始文件结果位置为message.toolResults[].output，已核对修订。这是本轮限定范围的静态设计审查，不是全仓code review或模型验收。
