# Beacon 工具与事实表达清洗设计

日期：2026-11-26（Asia/Shanghai）。状态：负责人已逐项确认产品取舍，并授权本文落盘后连续进入计划与实施。本文是目标合同；当前源码、模型观察和交付状态分别记录，不因设计落盘而宣称实现。

起点为 `Beacon_Next@950befec109132e25c190d896e8375a17a04ef0a` 加当前工作树中已完成的 run 容量修复。本轮保留这些未提交改动。来源为[八题原生访谈](../../beacon/evaluation/2026-11-25-native-harness-interview-dialogue.md)、负责人后续逐项决定及[当前工具合同](../../beacon/tool-contract.md)。本文替代旧方案中与本轮决定冲突的部分，不改写历史访谈或报告。

## 1. 目的、范围与分工

让模型用直接、精简、可衔接的事实理解学生代码和真实结果。业务模块负责执行事实，BeCoder/harness 负责可信度、查询、结构和权限，LLM 负责讨论对象、证据选择和教学。不添加调用顺序口诀，不把产品知识写成员工手册。

保留九个工具：`readCurrentCode`、`readProblemRecord`、`readRunRecord`、`readVerdictRecord`、`fetchProblem`、`inspectFile`、`readPage`、`browseWeb`、`readBeCoderInfo`。移除 `readMaterial` 及专用材料机制。

保护既有工作区采集／模式消费分离、用户主动运行与提交、Notebook 独立文档、CPH 检查、并发拒绝和进程清理。模型仍只读；不恢复 codesnap，不引入题目自动绑定、跨会话检索、共享用例库、里程碑或写能力。Notebook 造大数据、期望输出和学习资产写入保留为后续方向。

负责人另授权最终交付新 stage 和独立干净的访谈环境，但暂不启动任何 BeCoder 实例。不包含 Git 提交、推送、Setup 或 Release。

## 2. 已确认决定

| 项目 | 目标行为 |
| --- | --- |
| 编译耗时 | 不返回给 Beacon；原生界面计时保留。C++ 编译慢的 gch 用途和入口放在产品知识 |
| 程序运行耗时 | 保留实际测量，返回整数毫秒，不用小数据推定最坏性能 |
| run 时间戳 | 只返回 startedAt，精确到秒，不返回 endedAt |
| 编译配置 | 返回具名 standard／optimization；不返回命令数组、临时路径或固定宏头文件清单 |
| inspectFile | 保留 read／list／find／search；绝对及授权根相对路径；文本统一字符续读；明确错误 |
| 三个记录工具 | 共同支持 latest:true、filePath 筛选及组合；保留目录和指定 ID |
| codeHash | 对完整实际代码只作 CRLF→LF 后计算，正文不改；当前稿、执行稿、提交稿同口径 |
| 评测逐点 | 每行具名对象，按站点真实字段和原单位组织 |
| Notebook 位置 | codeCellNumber／inputCellNumber 都数整个笔记全部单元格，从 1 开始；正文使用相同编号 |
| readPage | 模型不填写 version，harness 在调用时取得当前版本并验证读取一致性 |
| sourceVerification | 不返回模型；mismatch 由产品页面和右下角通知报告，本次记录不入队、不替换旧项 |
| 其他核验状态 | matched／not-checked／unavailable 沿既有终态采集，缺源码不补造 |
| readProblemRecord | 名称保留；说明聚焦用户近期看题活动，不称做过／做完题目 |
| readMaterial | 工具、目录、专用正文副本、新增采集和回读接线退出；实际工具历史保留 |
| 产品知识 | 七主题继续按需整篇读；移除模型配置教程及无助于学习纠错的工程噪声；统一英文并附中文审阅稿 |

## 3. 模型投影与原生事实

沿现有队列和工具拥有者增加确定性的纯投影，不另建索引、正文库、镜像队列或动态字段分配系统。模型结果使用明确的允许字段，禁止直接展开原生对象而泄漏已经移除的字段。

本轮清洗首先约束模型返回。现有队列的 args、编译耗时、endedAt 等原生字段可继续作为旧格式／采集事实保留，不进行后台迁移或批量重写。它们不能经目录、正文、错误或普通页面绕行回到模型。新 codeHash 与 codeCellNumber 是采集时才能正确确定的事实，随对应记录持久化。

run 的 8192／4096／1024 Unicode 码点字段上限及包含 ID 的 32768 UTF-8 字节拒收规则继续作用于最终入队对象，新增字段也计入大小。新查询不绕过旧超大记录拒读，不因 latest 读取失败而暗选另一条。实际执行输入、编译命令、检查器和原生输出不使用 Beacon 投影。

## 4. 三个记录工具的共同查询

```ts
type RecordQuery =
  | { id: string }
  | { latest?: true; filePath?: string };
```

所有输入拒绝额外字段。id 非空且最多 256 字符，filePath 非空且最多 4096 字符；latest 只接受 true。id 与 latest／filePath 互斥。

| 输入 | 结果 |
| --- | --- |
| `{}` | 当前队列简短目录，最新入队在前 |
| `{ "filePath": "luogu/P8218.cpp" }` | 该文件对应的目录 |
| `{ "latest": true }` | 当前队列最新一条完整模型投影 |
| `{ "latest": true, "filePath": "luogu/P8218.cpp" }` | 先筛文件，再取最新一条完整模型投影 |
| `{ "id": "record-id" }` | 指定记录的完整模型投影 |

latest 的范围是当前 `.beaconWork` 共享队列，顺序取实际已发布队列的入队顺序，不以时间字符串排序，也不是当前聊天或当前讨论对象。problem／verdict 的正常去重入尾继续成立；run 不去重。

查询从同一已提交队列快照完成筛选和选择，不能先找 ID 再在竞态中悄悄读取另一个结果。成功读取后以真实 kind＋ID 固定本回答内的事实；不以 latest 或文件路径缓存为永久选择。后一次 latest 可看到新入队记录。

filePath 接受绝对路径或相对当前 Beacon 授权根的路径，匹配实际记录的代码文件路径；Notebook run 匹配笔记路径。只作 Windows 路径规范比较（分隔符、大小写、`.`／`..`），不以文件名猜题，不 realpath／打开历史文件，不要求文件仍存在，不跟随链接猜同一对象。null 路径只在未筛选查询中出现。此过滤不产生文件读取许可。

目录空集返回 `{ "records": [] }`；latest 无匹配返回小型 not_found；指定 ID 缺失／淘汰不改指其他记录。Blackout、无可消费根或 scope 变化沿现有硬边界拒绝。压缩子请求只允许既有已固定 ID，不能借 latest／筛选目录取得新材料。

## 5. 当前代码、run 与 codeHash

### 5.1 指纹

```text
codeHash = lowercaseHex(SHA256(UTF8(fullCode.replace(/\r\n/g, '\n'))))
```

算法固定 SHA-256，64 位小写十六进制。仅归一化 CRLF，不删除空格、注释、尾换行或单独 CR；不修改源码、不哈希附加头文件或编译产物。哈希计算在 run 源码截断之前。返回它的前提是实际取得完整原稿并有相应读取权限；缺代码或旧记录只剩前缀／头尾时省略，不给截断正文冒充完整原稿的哈希。旧完整字符串可在读取投影时计算，不回写磁盘。

readCurrentCode 每个 files 元素加入 codeHash；run 放在 program.codeHash；verdict 放在 submission.codeHash。相同哈希只表达上述规则下文本相同，不表达 AC、来源核验或程序行为等价。verdict 既有严格原文去重继续独立，不能用本哈希替换去重条件。

### 5.2 run 允许返回的字段

| 位置 | 保留 | 不再返回 |
| --- | --- | --- |
| 外层 | id、source、operation、startedAt、status、runs、必要 error／gaps、实际 runtime workingDirectory | endedAt、终端 command |
| program | filePath、language、code、codeHash、可得 codeCellNumber | 旧 codeBlockNumber 的误重命名 |
| compile | status、standard、optimization、output、error、实际 exitCode／signal | compiler 路径、args、compile.workingDirectory、durationMs |
| runs[] | 实际 input、expectedOutput、output、status、check、整数 durationMs、exitCode／signal、skipReason／error、来源专有序号和名称 | 不补不存在的 check，不合成未知 stdin |

standard／optimization 从本次真实编译参数／配置确定，不使用当前产品默认值补历史。当前规范可表达 c11／c17／c23 或 c++11／14／17／20／23，以及 O2；旧数据可靠解析不到就省略。不展示可执行 shell 片段或再增加 include 参数。

startedAt 保留时区，ISO 格式去掉小数秒；底层完整时间不改变。每个可得运行 durationMs 使用 Math.round，缺失仍省略，0 不等于未运行。不同来源计时口径如实由产品知识解释，不宣称去掉所有启动／收尾开销。

```json
{
  "record": {
    "id": "run-example", "source": "notebook", "operation": "run-inputs",
    "startedAt": "2026-11-26T01:10:00Z", "status": "completed",
    "program": {
      "filePath": "D:/practice/review.bcnb", "language": "cpp",
      "code": "int main() {}\n",
      "codeHash": "bc8bb8e433bf65214540115414c821c904b2a30d60a3ac0424bf9b77a00024b7",
      "codeCellNumber": 2
    },
    "compile": { "status": "succeeded", "standard": "c++20", "optimization": "O2" },
    "runs": [{ "input": { "mode": "text", "text": "" }, "inputCellNumber": 3, "inputName": "empty", "status": "completed", "durationMs": 7, "exitCode": 0, "output": { "merged": "" } }]
  }
}
```

示例值只说明结构，哈希在实现和验证时由真实源码计算。目录仍简短，保 ID、来源、操作、startedAt、文件及可得代码位置和实际摘要；不把完整 I/O 塞入所有目录项。

### 5.3 状态与完整性

外层 completed 表示这一组流程结束，不等于所有程序成功或答案正确；compile.status 是编译结束情况；runs[].status 是学生进程结果；check 是独立答案检查结果。无检查不填 passed。CPH 分流，Runner／Notebook 合流，合流不能反推 stderr 为空。完整字符串、truncated 前缀、null 未知、空串、not-run 各自保留，正文截断和执行器停止分别表达。

## 6. inspectFile 与 readPage

### 6.1 路径和操作

inspectFile 保留 operation、path、offset、limit、query，不拆工具。read 接受 offset／limit；list 只列指定目录；find 递归按名称匹配；search 在授权目录内按文本匹配。find／search 需要非空 query；与操作无关的参数明确拒绝，不静默忽略。list／find／search 的 limit 仍为结果条数，默认 100、最多 200，不接受 offset。

生产授权根来自当前所选 Beacon 根，不把编辑器其他文件夹自动加入。动态说明提供实际绝对根和权限。相对路径以该根为基准，`.` 为根目录；单根根名不作隐式别名。泛用读取器现有多根调用继续用明确根名前缀且拒绝重名歧义，生产不为此增加多根采集。

保留真实目标 canonicalization、scope 复核、链接边界、凭证文件／`.beaconWork` 隔离。错误按自有错误或 OS code 分类，不能通过异常文本猜测：路径不存在、拒绝访问、超授权范围、类型不符、读取中变化、参数错误、预算不足均给出可行动的小结果，不暴露堆栈／秘密。

### 6.2 文本范围

文本 offset／nextOffset 统一为从 0 开始的 Unicode 码点位置；limit 为最多码点数。磁盘 UTF-8 文本、dirty 编辑稿、Notebook 语义正文、readPage 正文使用同一口径。默认 read limit 为 32768，最多 131072；inspectFile 单次原有 128 KiB 正文和本回答 8 MiB 预算仍是硬上限，预算导致少返回时返回真实 nextOffset。实现应流式解码跳过磁盘前缀，避免为统一单位无限整读大文件，不切断 UTF-8 或代理对。

非文本原能力保留：图片沿现有 4 MiB 与视觉能力边界，不接受文本续读；二进制 hex 读取保原始字节偏移并明确 offsetUnit:byte，不能伪装字符。文本结果明确 offsetUnit:character。所有续读按实际返回正文计算 nextOffset，不让 LLM 自行推算字节。

Notebook 正文由 owning API 提供，排除 outputs／attempt 等执行字段，不回退 raw JSON；其每个 cell 显示 cellNumber。读取不打开资源，不保存 dirty 文件。

### 6.3 页面

```ts
readPage({ id: string, offset?: number, limit?: number, pageNumber?: number })
```

模型只给目录中的 id；version 不再是输入。PDF 仍要求合法的 1-based 物理 pageNumber，保现有文本提取而非 OCR，不扩展复杂页面能力。

harness 在调用时取得该页当前内部版本，以该版请求拥有者读取，并验证读取后的页身份、版本及权限。关闭、变化、不可读或变更 scope 如实失败，不静默取旧正文。返回页面来源、调用时版本／取得时间及真实范围，不建立专用快照；不同调用各读当前页，不能承诺跨调用页面未变化。

五站正式题面沿 fetchProblem；运行、测评事实沿持久记录。readPage 不开放这些功能页的旁路正文。当前代码仍由 readCurrentCode 读全部可见 C/C++ 页，包括未保存及未命名文件，不靠 pageId 选代码。

宿主目录说明仅交代“本回答开始时取得的可读页面元数据”，不是会话冻结目录，也不是所有磁盘文件；不增加宿主选题／过期状态机。

## 7. Notebook 统一位置

新记录 program.codeCellNumber = 点击时完整笔记中该程序单元格的位置＋1；runs[].inputCellNumber 使用同一完整笔记坐标。Markdown、其他代码和 input 块均占一个位置，Run Selection 不能对选区重新编号。

```text
cell 1 Markdown → cell 2 C++ → cell 3 Input → cell 4 Markdown → cell 5 C++ → cell 6 Input
```

第二份程序记录 codeCellNumber:5、inputCellNumber:6。Notebook 正文投影中也为每格提供 cellNumber，方便直接对照。编号固定执行当时的计划，后续调序不改历史；名称可重复，不新增稳定身份体系。

旧 codeBlockNumber 只数 C/C++ 块，不能直接改名为 codeCellNumber，也不能用当前已调序笔记倒推。旧记录缺新位置时省略代码位置，并用简短 gaps 说明旧位置不可与当前正文坐标等同；旧 inputCellNumber 的既有正确含义保留。执行与观察适配解耦、同程序一次编译、多 input 独立运行等行为继续保护。

## 8. verdict 可信度与具名明细

sourceVerification 是 OJ Connect 的工程事实，模型投影不返回它。出现 mismatch 时页面明确显示 mismatch／源码不匹配，右下角通知；拒绝该次观测入队和去重，不把它认成当前文件的有效验证，不触发重交。页面仍可查看原站真实结果供人核对。

matched／not-checked／unavailable 继续按最终结果规则入队；缺源码只省略 code／codeHash。通知按本次观测去重，不因轮询或 Webview 重绘反复弹出。无 Beacon 根或 Blackout 不影响产品 mismatch 提示。旧队列中的 mismatch 读时排除，不批量删除；按该旧 ID 读返回 unavailable，不暗换其他记录。

OJ Connect 原生 rows 和 UI 可继续原结构，Beacon 用站点拥有者的确定映射生成具名明细。模型 groups 为 `{name, rows:[具名对象]}`；每行保可得 testCase、status、time、memory、description、score、signal、exitCode 等文字，缺项省略。单位原样保留，不把各站特有文本强转成数字，也不从耗时猜隐藏测试规模。列映射必须覆盖五站当前实际来源，不能用洛谷位置表解析所有站点。

```json
{
  "groups": [{
    "name": "Subtask #0",
    "rows": [{ "testCase": "1", "status": "AC", "time": "4 ms", "memory": "788 KiB", "description": "ok accepted", "score": "Score: 10", "exitCode": "Exit with code 0" }]
  }]
}
```

result 原始总判词、可得分数、时间、内存、编译诊断及测试点摘要继续保留；verdict 不套用 run 字段截断或32KB规则，不改变既有 strict 原文去重。

站点映射固定为：洛谷八列依次为 testCase／status／time／memory／description／score／signal／exitCode；Codeforces四列为 testCase／status／time／memory，只有经格式核实的第五列映为 exitCode；AtCoder前四列同名，额外未知列只放 extraColumns，不猜其含义；蓝桥只有前四列；牛客无逐点行，不从汇总制造行。所有字段保持原字符串，含实际零值和英文状态，不将 CF 的 OK 重写成 AC。

## 9. readMaterial 整体退出

移除工具名、参数／返回类型、Schema、注册、说明、活动识别与压缩允许列表中的 readMaterial。移除宿主 materials 目录、ContextSnapshot 专用正文采集、capturePrivate、有效材料 key 授权扫描和相应新写入／回读接线；不是只隐藏工具名。

readPage 的真实调用、返回正文和来源继续进入普通工具交换与对话持久化。摘要只依普通有效历史及既有已固定业务记录；不为移除入口新建替代存储，也不通过普通文件读取绕过。图片附件、用户选区、草稿附件、原始聊天、有效分支与原协议配对保留各自所有者。

旧 contextSnapshots 数据可以作为不消费的历史附属数据保留，不恢复回读许可，不主动擦除旧文件；兼容加载不能继续依赖已移除的运行时材料机制。旧 readMaterial 交换作为已经发生的历史事实可正常显示／重放，但永不重新执行，也不把历史工具重新注册。页面关闭后只依已实际返回的历史与摘要，不承诺独立回读完整旧页面。

## 10. 工具说明与参数英文审阅稿

以下是目标英文原文及中文等义审阅，不是回答模板。生产统一英文，回答跟随用户语言。导师 core 保现有原则；不新增逐场景禁令。各工具只解释职责、参数和必要结果语义。

| 工具 | English | 中文对照 |
| --- | --- | --- |
| readCurrentCode | Read the complete code in all currently visible C/C++ editor panes at call time, including unsaved edits, filenames, paths and codeHash. Background tabs are excluded. | 读取调用时全部可见 C/C++ 编辑页整稿，含未保存修改、文件名、路径和 codeHash；不读后台标签。 |
| readProblemRecord | Read recent problem-viewing activity recorded by BeCoder: OJ, problem ID, associated code-file path and viewing time. Statement text is available through fetchProblem. | 读取 BeCoder 记录的近期看题活动：OJ、题号、关联代码路径和时间；题面正文由 fetchProblem 提供。 |
| readRunRecord | Read recent Runner, CPH and Notebook execution records: executed code, compilation outcome and input/output results. Process status and answer checking are separate facts. Text marked truncated is an incomplete prefix. | 读取三来源运行凭证，包含执行稿、编译结果和输入输出。程序状态与答案检查分开；truncated 文本是不完整前缀。 |
| readVerdictRecord | Read recent final OJ verdicts, submitted code when available and named test-case details. A verdict belongs to that submission, not automatically to the live editor draft. | 读取近期最终评测、可得提交稿和具名逐点明细；结果属于那次提交，不自动验证当前编辑稿。 |
| fetchProblem | Fetch the statement, samples and constraints from Luogu, Codeforces, AtCoder, Nowcoder or Lanqiao using its OJ and canonical problem ID. | 按站点与规范题号获取五站题面、样例和约束。 |
| inspectFile | Read files, list a directory, find names or search text within the authorized file scope. Open text includes unsaved edits. Notebook files return numbered content cells without execution results. Long text reads return nextOffset. | 在授权范围读文件、列目录、找名称或搜正文。打开文本包含 dirty 稿；笔记返回编号正文格、不含运行结果；长文本返回续读位置。 |
| readPage | Read the current content of an eligible page by its ID in the host page directory. Text ranges use character offsets. PDF text extraction is not OCR. | 按宿主目录 ID 读取获准页面当前正文；文本使用字符偏移；PDF 文本提取不是 OCR。 |
| browseWeb | Search public information or read a supplied webpage. Returns source links and text; cite relevant source links when using them. kind distinguishes search excerpts from page text; truncated marks incomplete text. Up to 6 lookups and 32000 characters per answer. No local files or private networks. | 搜索公开信息或读取给定网页，返回来源链接与文字；使用时引用相应来源。kind 区分搜索摘录和正文，truncated 表示不完整；保原有查询及字符预算，不读取本地或私网。 |
| readBeCoderInfo | Read the running BeCoder version and topic-specific product features, terminology, usage and supported scope. | 按主题读取实际运行版本及产品能力、术语、使用方法和范围。 |

参数描述：

| 参数 | English | 中文对照 |
| --- | --- | --- |
| record.id | Read this record ID. Cannot be combined with latest or filePath. | 读取此 ID；不能与 latest／filePath 同用。 |
| record.latest | Return the latest enqueued matching record in the selected Beacon workspace. Omit to list records. | 返回所选 Beacon 根中最新入队的匹配记录；省略则列目录。 |
| record.filePath | Filter by the recorded file path, absolute or relative to the selected Beacon root. Notebook runs use the notebook path. | 按记录路径筛选，可绝对或相对所选根；Notebook 用笔记路径。 |
| inspectFile.path | Absolute local/UNC path, or path relative to the listed authorized root. A dot means that root. | 绝对本地／UNC 路径，或相对列出的授权根；点表示该根。 |
| text.offset | Zero-based Unicode character offset. Continue with the returned nextOffset. | 从 0 开始的 Unicode 字符位置；用返回位置续读。 |
| read.limit | Maximum text characters to return; default 32768, maximum 131072. File byte budgets may return fewer. | 最多返回字符数，默认32768、最多131072；文件字节预算可使实际更少。 |
| scan.limit | Maximum results; default 100, maximum 200. | 最大结果条数，默认100、最多200。 |
| inspectFile.query | Literal, case-insensitive name text for find, or content text for search. | find 匹配名称、search 匹配正文，忽略大小写的字面文本。 |
| readPage.id | Page ID from the host page directory. | 宿主目录中的页面 ID。 |
| readPage.pageNumber | Required for PDFs: 1-based physical page number. | PDF 必需，从1开始的物理页码。 |
| fetchProblem.oj | Luogu (洛谷), Codeforces, AtCoder, Nowcoder (牛客 ACM), Lanqiao (蓝桥). | 保留五站枚举及名称对应。 |
| fetchProblem.problemId | Canonical IDs: Luogu P1001 or P1001@12345; Codeforces 2026/A; AtCoder abc300/abc300_a; Nowcoder problem/12345 or contest/12345/A; Lanqiao 12345. | 保留五站规范 ID 及例子，不增加 URL 重复参数。 |
| readBeCoderInfo.topic | overview: product and topics (default); problems: obtaining tasks; runner: compilation and runs; cph: local checking; notebook: learning documents; oj-connect: online submissions; beacon: workspaces, modes and recent records. | 七个固定主题可直接读取，默认overview；不再将beacon描述成模型配置教程。 |

宿主包装英文：`Host page metadata observed at the start of this response. This is not a directory of all files or page bodies.` 中文：本回答开始时取得的页面元数据，不是所有文件或页面正文的目录。工具范围、哈希和身份核对信息不要求模型机械搬入教学回答。

## 11. 七主题产品知识英文与中文对照

只保产品事实和必要使用入口，不含工具调用步骤、用户意图口诀或模型配置教程。以下为随包主题目标原文；中文用于审阅，不运行时重复注入。

### overview

English:

> BeCoder is a Windows Code - OSS derivative for competitive programming and C/C++ learning. It bundles GCC, clangd and local execution, with an embedded problem browser, Runner, CPH local tests, standalone Notebook, OJ Connect and the optional Beacon tutor. The official repository is https://github.com/Bc408/BeCoder-IDE.
>
> Topics: problems (obtaining tasks), runner (compilation and runs), cph (local checking), notebook (learning documents), oj-connect (online submissions), beacon (workspaces, modes and recent records). Each topic can be read directly. The returned version is the running application's release version, not an extension API compatibility version.
>
> General-purpose MCP, Debug/GDB, a graphical Git interface and remote development are outside the current product scope. Model availability does not control the independent programming features.

中文：BeCoder 是 Windows 上面向竞赛和 C/C++ 学习的 Code - OSS 衍生产品，随包 GCC、clangd 和执行环境，包含上述特色功能与官方仓库。列七主题职责并允许直接读；返回实际发行版本，不是扩展 API 兼容号。保留明确的产品排除范围及编程功能独立性，不展开普通编辑器常识。

### problems

English:

> The embedded browser's OJ Connect button offers Get Problem and Import to CPH. For supported OJs, Get Problem creates or opens the associated source in an OJ subdirectory and opens its statement; it preserves existing code and unsaved edits and does not initialize CPH. Import to CPH imports samples and associates the same source. The statement's CPH action can also import its samples; replacing existing samples requires confirmation.
>
> Full OJ Connect support covers Luogu, Codeforces, AtCoder, Nowcoder ACM and public Lanqiao practice within each site's supported scope. CPH supports additional imports without extending that scope. Source creation requires an open editor folder; Ctrl+Alt+P opens the identified source's statement.
>
> Successful five-OJ acquisition records which problem was viewed, its associated file and the viewing time. This activity does not contain the statement, prove a solution was completed or permanently bind later runs to the problem.

中文：内置浏览器提供 Get Problem 和 Import to CPH；前者保原代码／dirty、开源码和题面，不自动初始化 CPH；后者导样例并关联同稿，替换需确认。保五站和其他 CPH 题源边界、文件夹前提与题面入口。读题行为只说明看题身份、文件和时间，不代表完成或永久绑定。

### runner

English:

> Runner compiles and runs C/C++ with bundled GCC. The editor run action or F6 saves the source and runs it in its directory. Run With Input (Shift+F6) captures the bytes of a file named input, without an extension, beside the source and pipes them to stdin; stdin closes at the end. Interactive Run supports terminal input and getch(). Terminal echoes do not reconstruct reliable stdin.
>
> Local compilation uses the selected language standard and O2, defines DEBUG and enables Wall diagnostics. C++ additionally includes bits/stdc++.h and BeCoder's bits/debugger.h. The debugger header supplies debug(x) and dout helpers that write to stderr. These local additions are not automatically included in source submitted to an OJ. The owner-provided submission snippet is:

```cpp
#ifndef DEBUG
#define debug
#endif
```

English continued:

> The lower-left gear menu's Generate gch Cache action (生成 gch 缓存) creates an optional C++ precompiled-header cache for the current compiler settings. It can reduce C++ compilation work; it does not improve the submitted algorithm or program runtime. A missing or incompatible cache falls back to ordinary header compilation. Keep BeCoder open during generation; after changing C++ settings the user can generate it again.
>
> Runner and Notebook merge program stdout/stderr; CPH keeps them separate. Compile diagnostics are distinct from program output. Run durations describe the respective executor's measured elapsed time, not pure CPU time or an OJ measurement: Runner/CPH include their execution and teardown boundary; normal Notebook runs use the helper's student-process elapsed time. Compilation duration is separate in the native UI.
>
> Ctrl+C cancels Runner. Busy requests are rejected, not queued. BC run <source> and run <source> -WithInput use this same Runner; general shell commands belong to the separate native terminal.

中文：保 Runner 入口、保存与 cwd、文件 input 及交互输入区别。标准和 O2 是本次配置事实；固定 DEBUG／Wall、C++ 强制头和 debug／dout 的 stderr 行为由产品解释，不注入每条记录参数墙。提交建议严格使用负责人上述宏，不改成函数式宏，不擅加代码。说明左下齿轮“生成 gch 缓存”的 C++ 用途、回退及需保持应用开启；不承诺算法运行加速。保三来源计时和分流差异、取消、忙时拒绝及 BC 与原生终端的区别。

### cph

English:

> CPH stores editable input/expected-output test cases associated with a C/C++ source, under its adjacent .cph directory. Samples can be imported from a problem. A case action runs one case; Run All compiles the program once and executes its cases independently. Each action produces one program record. Compile Only produces no run record.
>
> CPH reuses Runner's compiler configuration and separates program stdout/stderr. It supports output comparison and user-provided Python checkers; the latter require Python. The program's exit/timeout and the answer check are independent. A normally exited program can have wrong-answer or checker time-limit; checker failures do not establish student-program failures. Beacon receives the check result, not checker code or configuration. Passing local cases does not establish OJ acceptance.

中文：CPH 保存关联源码的 input／expected 样例；单点／全部同权一条，全部一次编译，Compile Only 不入队。复用 Runner、运行输出分流，Python 仅用于自定义检查器；程序状态与检查结果独立，Beacon 不取得检查器实现，本地通过不是 OJ AC。

### notebook

English:

> Notebook is an independent .bcnb learning document with C/C++, Markdown and input cells. An input runs the nearest preceding C/C++ cell. Run All/Selection fixes the code and input associations when clicked, compiles each program once, and runs its inputs in separate processes. A failed input does not stop the others; a compile failure skips that program's inputs; explicit cancellation stops the batch.
>
> Every cell has a 1-based position in the whole notebook, including Markdown and inputs. Recorded codeCellNumber/inputCellNumber describe positions at execution time; later reordering does not update past records. Input names can repeat. Content reads include numbered cell text, not execution results.
>
> Execution uses Runner and workspace trust, merges stdout/stderr, and gives each input a 2-second runtime limit and 256 KiB output limit. A reached limit stops execution. Each input retains its latest result in the user's document. A saved notebook runs in its own directory.
>
> The editor's linked-notebook action creates or opens a .bcnb under .notebook in the editor root, following the source's relative path and complete filename. Initial creation copies code once; later edits and moves are independent. Users can also create/save notebooks freely. Beacon currently cannot write or run them. Notebook is not Jupyter/ipynb/Python execution.

中文：独立 .bcnb、最近前置程序、点击时固定批次、一次编译和失败／取消行为保留。全体单元格从1计数；历史位置、可重复名称、正文不含执行事实分开。原生2秒／256KiB是停止执行，文档保最近结果。关联笔记复制一次后独立，用户可自由保存；本轮不增加模型写入或运行。

### oj-connect

English:

> OJ Connect uses the embedded browser's real website sessions for problem statements, per-site compiler selection and user-initiated submissions. Users log in and handle required human verification. Ctrl+Alt+S submits the focused supported C/C++ draft, including unsaved edits; a statement-page submission uses that page's associated source.
>
> Supported scope: Luogu problems permitted by the integration; AtCoder supported public statements and ordinary submissions; Codeforces post-contest public ordinary practice (not Gym, ongoing/virtual/group/private/team contests, mirrors or output-only); Nowcoder public ACM stdin/stdout tasks and ended public individually submittable contests (not function-template/PAT/ongoing/private/team/paid tasks); Lanqiao supported public ordinary C/C++ practice. CPH-only imports do not extend these scopes.
>
> Acceptance of a submission and its final verdict are separate. Uncertain acceptance continues verification, never automatic resubmission. Results preserve the site's actual status, units, diagnostics and available case details; an earlier AC belongs to its submitted code. A detected submission-source mismatch is displayed on the record page and notified, and that observation is excluded from Beacon's verdict queue. Missing source alone does not discard an otherwise final result.

中文：真实站点会话、用户登录／验证码／提交、dirty 与关联来源保留。逐站保当前支持范围。受理不明核对而不重交，最终数据只保原站可得内容。源码不匹配由页面和通知报告、本次拒收入队；缺源码不自动抛弃最终判词。

### beacon

English:

> The user selects a Beacon workspace independently of editor folders and .notebook. A healthy selected root collects real user activity into .beaconWork even in Blackout. No usable root means no collection or later backfill. Blackout disables model access to persistent records and uses a temporary conversation; live visible C/C++ and five-OJ problem fetching remain available. Spot permits ordinary reads within the Beacon root; Flood broadens permitted local reads. Neither grants writes, execution, login or submission.
>
> Recent queues are shared by conversations in that root: 13 problem-viewing records, 30 combined Runner/CPH/Notebook run records, and 20 final online verdicts. Limits are counts, not expiration days. Same problem and file replaces a previous viewing; runs do not deduplicate; same-site same-problem verdicts with exactly equal available submitted code replace the old result at the end. Reading does not renew retention. Recent queues are not a permanent solution archive; ordinary chat history and user-saved notebooks have separate lifecycles.
>
> An actual compilation attempt can leave a run record after compilation failure, runtime failure, timeout, output limit or cancellation; unstarted inputs are not-run. CPH Compile Only is excluded. Final verdicts can be unsuccessful; queued/judging or unavailable final results do not become final records. Normal process completion does not imply a correct answer. Unknown stdin is null; absent, empty, truncated and not-run values mean different things.
>
> Run code retains up to 8192 Unicode characters; each input, expected output and output stream up to 4096; each error up to 1024. Incomplete values use {text,truncated:true}. A serialized run over 32 KB is not saved without affecting execution; old oversized runs return a capacity error. These limits apply to evidence copies, not student files or original execution output.
>
> Users can attach material or ask on an editor selection. Actual tool results remain in this conversation's history; there is no separate page-material library or code-snapshot queue. A live code read includes visible unsaved drafts. The chat search switch controls browseWeb independently of five-OJ statement fetching. Product knowledge returns the real running version, not personal settings.

中文：所选根与编辑器／笔记根独立；有效根持续采集，模式只管消费。13／30／20 按条数与既有去重规则淘汰，读取不续期；聊天与用户笔记生命周期独立。解释真实失败、not-run、CPH仅编译例外、最终失败判词和中间态的区别。保字段前缀／32KB拒收事实及不影响执行。附件、选区、普通工具历史保留，不再另建页面材料库；现场代码与搜索／题面解耦。删除服务商、密钥、发现／测试／模型选择教程。

## 12. 兼容、实施边界与验收

兼容只读取旧格式并投影，不修改旧消息或批量迁移原资产。旧完整代码可补算投影哈希，旧截断代码不伪造；旧 Notebook ordinal 不转成全体 cell 坐标；旧 verdict mismatch 不消费；旧 rows 由对应站点明确映射。已完成旧工具交换保原名及真实结果，不重演；新 schema／提示契约变更重建预算锚点。移除专用页面材料不解决已经污染的超大历史容量，也不放宽压缩有界恢复。

实现所有者：Beacon 管工具合同、模型投影、历史与产品知识；Runner 观察适配提供截断前哈希、Notebook位置及本次设置；Notebook 提供计划坐标和正文编号；OJ Connect 管 mismatch 页面／通知／采集与站点明细映射；Store 保原子队列和选择事实。只新增必要的小函数，不搭通用查询引擎。

验收至少包括：

- 三记录目录／ID／latest／filePath组合、空匹配、并发新增／淘汰、Blackout／无根／晚到 scope、旧超大正文不回退、压缩只读已固定 ID。
- 所有模型返回都没有编译耗时、args、compiler、endedAt、sourceVerification 或 readMaterial；stage 中无退出工具注册；真实执行/UI仍完整。
- 当前／run／verdict哈希同口径，CRLF/LF相同、空白注释不同、截断前计算、未知不伪造；32KB仍计新增字段且失败保旧队列。
- 中文／emoji／CRLF磁盘和dirty稿／Notebook／页面字符续读、变化／取消、路径错误分类与链接权限；二进制／图片不伪称文本。
- Notebook全体位置、选区／多程序／dirty／运行中调序，正文与计划同口径，旧计数不误映射。
- 五站真实rows映射及缺失、单位、长整数、原状态；mismatch 页面及单次通知、拒收不替换，其他核验状态保终态入队，无根仍通知。
- 普通附件／历史／编辑分支／摘要兼容，页面新读取无专用正文副本；旧交换只回放不执行，关闭页面不补造旧全文。
- 英文与中文对照无语义漂移，宏逐字为负责人原稿，七主题随包、版本来自宿主，模型不获得写入／运行能力。

效果评测使用已授权 DeepSeek Flash、真实 Provider/工具/Store 装配；先比较必要事实取得、无关读取和字段理解，再看教学内容与冗余。保失败及实际分母，不以更多工具调用或一次成功冒充能力稳定。材料已足够仍反复推理错误时标记模型瓶颈，暂停该项提示堆叠。

最终阶段执行仓库要求的类型、OI编译和标准 stage 构建；文档检查、源码测试、云模型探测、stage 及真实应用验收分别成立。访谈准备使用全新独立应用／数据／练习目录，保所有内置能力和随包工具链，准备受控驱动与本机私有配置接入，不启动实例、不代用户登录或提交。最终报告注明仍需首次启动／登录的事项。
