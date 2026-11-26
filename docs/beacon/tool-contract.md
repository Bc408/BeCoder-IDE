# Beacon 工具合同

更新：2026-11-26。本文维护当前接口与模型可见字段；验证和交付另见[实现状态](implementation-status.md)。九工具底座见[工具清洗设计](../superpowers/specs/2026-11-26-beacon-tool-information-design.md)，本轮[上下文就绪与可见Notebook设计](../superpowers/specs/2026-11-26-beacon-context-availability-and-visible-notebook-design.md)已批准并按[实施计划](../superpowers/plans/2026-11-26-beacon-context-availability-and-visible-notebook.md)实施中；历史报告不证明新合同效果。

## 1. 九工具输入

```ts
readCurrentCode({})
readProblemRecord({ id?: string, latest?: true, filePath?: string })
readRunRecord({ id?: string, latest?: true, filePath?: string })
readVerdictRecord({ id?: string, latest?: true, filePath?: string })
fetchProblem({ oj: 'luogu'|'codeforces'|'atcoder'|'nowcoder'|'lanqiao', problemId: string })
inspectFile({ operation: 'read'|'list'|'find'|'search', path: string, offset?: number, limit?: number, query?: string })
readPage({ id: string, offset?: number, limit?: number, pageNumber?: number })
browseWeb({ operation: 'search'|'fetch', query?: string, url?: string })
readBeCoderInfo({ topic?: 'overview'|'problems'|'runner'|'cph'|'notebook'|'oj-connect'|'beacon' })
```

成功形态：当前可见文档为files数组，以kind:code／notebook区分源码和笔记；记录为records目录或record投影，题面为problem／document／retrievedAt，页面为ok／contents／source和范围。文件、网页保自身形态。错误为小型明确结果，不以空正文冒充失败。id与latest／filePath互斥。英文上下文工具说明集中在contextToolContract.ts，提示版本2026-11-26.3；用途说明不规定调用顺序。

<a id="5-problem和五站题面"></a>

## 2. 权限、容量与来源

工作区决定采集资格，模式决定消费：有效根在Blackout也持续采集，模型不得列／读持久记录；无根或异常不采集不补采。Spot普通文件限Beacon根，Flood保原只读扩展范围；当前可见C/C++与BeCoder Notebook内容及五站fetchProblem保原页面权限，fetch独立搜索开关。现场Notebook含dirty、未命名及根外内容，在三模式及无根可读；不授磁盘backing file、相邻文件或引用附件读权。

collectionPending为独立宿主发送门禁，覆盖应采集事实适配至发布，不进入模型、持久记录或scope epoch；同根窗口共享、有效根三模式同规则。显示“正在保存用户行为上下文”，所有新请求在实际受理前复核。失败由原动作窗口右下角通知、同动作至多一次，确认不明如实说明；完成或失败结束后保草稿、由用户重发，不排队、重跑或自动重试采集。执行退役及清理不等待保存；远程OJ未取得终态不增加保存等待。

problem13：五站Get／Import的题目身份、关联文件及时间，同题同路径更新入尾；不含题面。run30：Runner／CPH／Notebook一份程序的一次编译和多个input，不去重；CPH单点／全部同权，Compile Only不入队。verdict20：完整最终结果，同站同题严格相同实际提交稿替换旧项入尾；缺稿跳过去重。读取不续期。

fetchProblem规范题号：Luogu P1001或P1001@12345；CF 2026/A；AtCoder abc300/abc300_a；牛客problem/12345或contest/12345/A；蓝桥12345。独立复用五站核心解析，不产生用户Get／Import副作用或题面持久库。非五站题沿授权.cph元数据／普通网页补充，不扩完整闭环。

## 3. 模型投影与原生事实

沿现有队列和工具拥有者增加确定性的纯投影，不另建索引、正文库、镜像队列或动态字段分配系统。模型结果使用明确的允许字段，禁止直接展开原生对象而泄漏已经移除的字段。

清洗约束模型返回。现有队列的 args、编译耗时、endedAt 等原生字段可继续作为旧格式／采集事实保留，不进行后台迁移或批量重写。它们不能经目录、正文、错误或普通页面绕行回到模型。新 codeHash 与 codeCellNumber 是采集时才能正确确定的事实，随对应记录持久化。

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

<a id="4-当前代码"></a>

## 5. 当前代码、run 与 codeHash

### 5.1 指纹

```text
codeHash = lowercaseHex(SHA256(UTF8(fullCode.replace(/\r\n/g, '\n'))))
```

算法固定 SHA-256，64 位小写十六进制。仅归一化 CRLF，不删除空格、注释、尾换行或单独 CR；不修改源码、不哈希附加头文件或编译产物。哈希计算在 run 源码截断之前。返回它的前提是实际取得完整原稿并有相应读取权限；缺代码或旧记录只剩前缀／头尾时省略，不给截断正文冒充完整原稿的哈希。旧完整字符串可在读取投影时计算，不回写磁盘。

readCurrentCode的kind:code元素有codeHash，kind:notebook仅每个language为c／cpp的code cell有codeHash，笔记整体、Markdown及input不计算程序hash；run放在program.codeHash，verdict放在submission.codeHash。相同哈希只表达上述规则下文本相同，不表达AC、来源核验或程序行为等价。verdict既有严格原文去重继续独立，不能用本哈希替换去重条件。

readCurrentCode({})的files联合结构为：

```ts
type VisibleFile = { fileName: string; filePath: string | null; isDirty: boolean } & (
  | { kind: 'code'; code: string; codeHash: string }
  | { kind: 'notebook'; cells: {
      cellNumber: number;
      kind: 'markdown' | 'code' | 'input';
      language: string;
      source: string;
      id?: string;
      name?: string;
      attachments?: Record<string, unknown>;
      codeHash?: string;
    }[] }
);
```

每次调用读取当前窗口全部可见文档的完整内容，不限滚动位置或选中cell。Notebook从实际已加载的BeCoder内容owner直接投影，全本cells保顺序并从1编号；含dirty和未命名文档，未命名filePath:null。name仅保实际input名称，已有id／附件描述可保留，不返回原始metadata或执行字段，也不自动追读附件。未知owner或投影失败明确失败，不凭扩展名读磁盘或回退raw JSON。run字段额度与32KB入队上限不套用现场内容。

读取前按canonical URI／文档模型身份合并同文档多视图，目录与正文共用身份整理，汇总visible／active；关闭一份视图不丢仍可见文档。不同文件同正文、多个未命名文档、同笔记相同代码cell分别保留，不按hash或null路径合并。后台标签不读；单次读取中关闭、改版或可见集合变化明确报错。跨调用保持新的现场观察，不重写普通历史或合并不同来源事实。

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

示例值只说明结构。目录仍简短，保 ID、来源、操作、startedAt、文件及可得代码位置和实际摘要；不把完整 I/O 塞入所有目录项。

run摘要按真实compile.status、runs[].status／check分别说明编译、已执行／未执行输入及检查结果；not-run／start-failed不算已执行，准备的输入数不冒充已运行次数。Runner／Notebook无自动答案检查；CPH检查完成才有check，编译失败或检查异常可缺check，不表示通过或产品不支持检查。

### 5.3 状态与完整性

外层 completed 表示这一组流程结束，不等于所有程序成功或答案正确；compile.status 是编译结束情况；runs[].status 是学生进程结果；check 是独立答案检查结果。无检查不填 passed。CPH 分流，Runner／Notebook 合流，合流不能反推 stderr 为空。完整字符串、truncated 前缀、null 未知、空串、not-run 各自保留，正文截断和执行器停止分别表达。

编译成功但学生进程尚未启动就取消时，该input仍为not-run、skipReason:cancelled，不计作已执行；实际启动后被停止才为cancelled。外层批次取消和单input是否启动分别表达。

## 6. inspectFile 与 readPage

### 6.1 路径和操作

inspectFile 保留 operation、path、offset、limit、query，不拆工具。read 接受 offset／limit；list 只列指定目录；find 递归按名称匹配；search 在授权目录内按文本匹配。find／search 需要非空 query；与操作无关的参数明确拒绝，不静默忽略。list／find／search 的 limit 仍为结果条数，默认 100、最多 200，不接受 offset。

生产授权根来自当前所选 Beacon 根，不把编辑器其他文件夹自动加入。动态说明提供实际绝对根和权限。相对路径以该根为基准，`.` 为根目录；单根根名不作隐式别名。泛用读取器现有多根调用继续用明确根名前缀且拒绝重名歧义，生产不为此增加多根采集。

保留真实目标 canonicalization、scope 复核、链接边界、凭证文件／`.beaconWork` 隔离。错误按自有错误或 OS code 分类，不能通过异常文本猜测：路径不存在、拒绝访问、超授权范围、类型不符、读取中变化、参数错误、预算不足均给出可行动的小结果，不暴露堆栈／秘密。

search若实际跳过读取失败、改版或投影失败的普通文件，通过已有truncated明确结果不完整；已读取的匹配仍可用。凭据、私有路径和范围外文件按正常规则排除，不据此伪造读取失败或扩大搜索范围。

### 6.2 文本范围

文本 offset／nextOffset 统一为从 0 开始的 Unicode 码点位置；limit 为最多码点数。磁盘 UTF-8 文本、dirty 编辑稿、Notebook 语义正文、readPage 正文使用同一口径。默认 read limit 为 32768，最多 131072；inspectFile 单次原有 128 KiB 正文和本回答 8 MiB 预算仍是硬上限，预算导致少返回时返回真实 nextOffset。实现应流式解码跳过磁盘前缀，避免为统一单位无限整读大文件，不切断 UTF-8 或代理对。

非文本原能力保留：图片沿现有 4 MiB 与视觉能力边界，不接受文本续读；二进制 hex 读取保原始字节偏移并明确 offsetUnit:byte，不能伪装字符。文本结果明确 offsetUnit:character。所有续读按实际返回正文计算 nextOffset，不让 LLM 自行推算字节。

Notebook 正文由 owning API 提供，排除 outputs／attempt 等执行字段，不回退 raw JSON；其每个 cell 显示 cellNumber。读取不打开资源，不保存 dirty 文件。

已加载正文按真实文件身份匹配dirty owner，目录联接／Windows大小写别名不使其回退磁盘；一次读取在异步磁盘核验和句柄关闭后复核文档owner及version，改版／关闭／替换明确失败。readPage对完整正文脱敏一次后再切片，续读坐标基于该完整脱敏稿，片段不再次改写。

### 6.3 页面

```ts
readPage({ id: string, offset?: number, limit?: number, pageNumber?: number })
```

模型只给目录中的 id；version 不再是输入。PDF 仍要求合法的 1-based 物理 pageNumber，保现有文本提取而非 OCR，不扩展复杂页面能力。

harness 在调用时取得该页当前内部版本，以该版请求拥有者读取，并验证读取后的页身份、版本及权限。关闭、变化、不可读或变更 scope 如实失败，不静默取旧正文。返回页面来源、调用时版本／取得时间及真实范围，不建立专用快照；不同调用各读当前页，不能承诺跨调用页面未变化。

五站正式题面沿fetchProblem；运行、测评事实沿持久记录。readPage不开放这些功能页或Notebook执行结果的旁路正文。当前C/C++与BeCoder Notebook内容由readCurrentCode读全部可见文档，包括未保存、未命名及根外文档，不靠pageId选择，不读后台标签。

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
