# Beacon 信息流提示词设计：第2轮能力发现与调用

日期：2026-11-26。源码基线：`Beacon_Next@eb48d147`；生产提示版本仍为`2026-11-26.3`。修订：`R2-D2`。状态：本稿已纳入负责人批准的[统一设计IF-D1](../../superpowers/specs/2026-11-26-beacon-prompt-information-flow-design.md)，已接入工作树2026-11-26.4；集成限定以统一设计为准，下文保留本轮设计与审阅过程。

负责人已采纳[第1轮](2026-11-26-prompt-information-flow-round-1.md)的首层环境信息：本次模式、所选Beacon根和该根的用户行为采集资格。本轮横向设计九工具的用途和参数说明，使模型在第一次请求时能够发现合适来源、准确指定目标。实际结果的正文、空／部分／失败状态在下一轮与每个来源一起细化；本轮先标出两层之间的交接。

核心：**设计好信息出现的位置、时机和含义，让LLM自然取得当前需要的上下文。** 九工具同时参与能力发现，本文排列不规定调用顺序。普通请求、摘要子请求、续答等从整体信息流一起考虑，不以一个通用说明覆盖实际不同的阶段能力。

## 1. 本轮职责

| 位置 | 此刻需要交代 | 下层承接 |
| --- | --- | --- |
| 工具用途说明 | 读取什么来源、适用范围、与相邻来源的区别 | 返回后才需要的字段释义由对应结果承接 |
| 参数说明及schema | 如何指定目标、默认行为、互斥／必需参数、位置单位 | 不让LLM推算已有游标或把目录当正文 |
| 动态文件范围 | 本次inspectFile的实际文件权限和相对路径基准 | 工程执行原有scope与路径检查 |
| 产品知识主题 | 哪个主题包含什么产品知识，可直接读对应主题 | 正文解释真实产品功能与术语，不强制先读概览 |
| 摘要阶段声明 | 本阶段实际可以读取的固定历史记录 | 不能继续展示普通请求的目录／latest／文件筛选入口 |

本轮不改变九工具名称、采集与持久化、权限、只读边界、队列容量、现场范围、实时读取行为或普通工具调用的接受集合。不恢复readMaterial、写工具、代码快照或harness选题绑定。普通schema的更精确约束可另列工程变更；不能仅靠用途文字宣称校验已经改变。

## 2. 九工具用途：英文候选与中文语义

### readCurrentCode

```text
Read the complete contents, at call time, of all C/C++ documents and BeCoder notebooks displayed in this window's editor panes. Includes unsaved changes, filenames and paths; each document appears once and notebooks include all numbered content cells.
```

中文：读取调用时当前窗口全部可见C/C++文档和BeCoder笔记的完整内容，含未保存修改、文件名与路径。每份文档仅一次，笔记包含全本编号内容单元格。

选择意义：现场代码和笔记。没有pageId或文件路径参数，不要求模型先定位某页。codeHash的具体含义在结果层承接，不在这里展开。

### readProblemRecord

```text
Read the user's recent problem-viewing activity: which OJ problem they viewed, its associated code-file path and viewing time.
```

中文：读取用户近期看题行为：看了哪个OJ的哪道题、关联代码文件路径和查看时间。

选择意义：用户看题行为。遵循负责人已定表达，不添加“没有题面”或指示下一步调用fetchProblem的尾句；题面用途由fetchProblem自身明确说明。记录查询方式由共享参数承接。

### readRunRecord

```text
Read the user's recent local run records from Runner (program runs), CPH (local test cases) and Notebook (code-cell runs). Records provide captured code, compilation results, inputs and outputs when available; CPH records may also include answer-check results.
```

中文：读取用户近期本地运行记录：Runner程序运行、CPH本地测试点、Notebook代码单元格运行。记录提供实际取得的代码、编译结果、输入与输出；CPH记录还可能含答案检查结果。

选择意义：本地执行事实，不读取当前改稿，也不冒充线上判题。来源名称在此给最短释义，使模型无需先读产品概览就能判断入口用途。status／check、输出流合并方式及截断值的含义将在具体返回处解释。

### readVerdictRecord

```text
Read retained final online-judge results for the user's submissions, with submitted code, diagnostics and per-test results when available. Each verdict describes its recorded submission.
```

中文：读取近期保留的用户线上提交的最终判题结果，以及实际可得的提交代码、诊断和逐测试点结果。每份判词描述其记录中的那次提交。

选择意义：线上提交稿与最终评测，区别于本地运行及当前编辑稿。隐藏输入是否提供由结果事实交代。

### fetchProblem

```text
Fetch a problem's statement, samples and constraints from Luogu, Codeforces, AtCoder, Nowcoder or Lanqiao. Use it to read or confirm a supported problem's requirements. This tool is independent of the chat web-search switch.
```

中文：从洛谷、Codeforces、AtCoder、牛客或蓝桥获取题面、样例和约束；需要阅读或确认支持题目的要求时使用。此工具与聊天联网搜索开关独立。

选择意义：五站正式题面入口。说明自身适用性，不给所有问题规定取材前置步骤，不触发用户Get／Import行为或写入看题记录。

### readPage

```text
Read the currently loaded content of an eligible text, browser or PDF page using its ID from the host page directory. C/C++ text documents and BeCoder notebooks are excluded from this tool; readCurrentCode reads those displayed in editor panes.
```

中文：使用宿主页面目录中的ID，读取符合读取条件的文本、浏览器或PDF页面当前已加载的内容。此工具不读C/C++文本与BeCoder笔记；readCurrentCode读取它们当前显示在编辑区中的文档。

选择意义：已打开普通页面，区别于从本地路径读取文件或联网取网页。这里的text包括非C/C++普通编辑文档，不把它统称为“非代码页面”而排除其他语言源码。保持既有PDF提取边界，本轮不扩展OCR或复杂页面能力。已有不可读／受保护功能页仍沿原规则拒绝。

### inspectFile

```text
Inspect local files and directories within the file scope below: read a file, list a directory, find entries by name or search text. Open text includes unsaved edits; Notebook files return numbered content cells. File reads support text, images and binary excerpts.
```

中文：在下述文件权限内查看本地文件或目录：读取文件、列目录、按名称查找文件或目录、搜索文本。已打开文本包含未保存修改，笔记文件返回编号内容单元格。文件读取支持文本、图片与二进制片段。

用途后追加本次真实权限的最少动态说明，以下仅为合成候选：

```text
File scope: ordinary files within the selected Beacon workspace. Relative-path base: D:/BeaconDesignLab. Protected paths remain excluded.
```

```text
File scope: local files on this computer, including outside the selected Beacon workspace. Relative-path base: D:/BeaconDesignLab. Protected paths remain excluded.
```

第一段对应workspace权限，第二段对应computer权限；none时不注册该工具。动态路径来自已有实际roots，不用运行记录workingDirectory或当前编辑器目录推测。相对根、权限和真实注册一致；不因第1轮已提供所选根就省掉这里的文件访问范围。

### browseWeb

```text
Search public web information or fetch a public webpage. Returns source links with search excerpts or page text; cite relevant links when using them. The chat web-search switch controls this tool.
```

中文：搜索公开网络信息或取得公开网页，返回来源链接及搜索摘录或页面文字；使用时引用相关链接。聊天联网搜索开关控制此工具。

选择意义：普通公开联网，区别于已加载页面和专用题面解析。现有调用额度、截断及失败结果的具体含义在结果层承接；只展示实际仍可用的操作，不增加通用浏览器控制、登录或私有网络能力。

### readBeCoderInfo

```text
Read BeCoder product knowledge by topic, together with the running application's release version: features, terminology, usage and supported scope. This reads bundled product knowledge, not personal settings or activity records.
```

中文：按主题读取BeCoder产品知识及实际运行应用的发行版本，包括功能、术语、用法和支持范围；读取随包产品知识，不查询个人设置或行为记录。

选择意义：软件环境知识。主题可直接选择，模型不必先读overview。产品功能说明不会赋予模型操作能力。

## 3. 普通请求的参数文字

现有属性类型、枚举、数值界限及实际接受规则先保持。以下是拟替换的属性说明，未展示的结构沿现行合同；本节不等于已修改schema。

### 三记录工具共用

| 参数 | 英文候选 | 中文语义 |
| --- | --- | --- |
| id | Read one retained record by its ID. Omit latest and filePath when using id. | 读指定保留记录；与latest、filePath互斥 |
| latest | Return the most recently enqueued record matching filePath, or the latest in this queue if filePath is omitted. Omit both id and latest to list records, newest first. | 取当前队列中最新入队的匹配项；没有文件筛选则取队列最新；不提供id或latest时列目录 |
| filePath | Filter by the recorded path, absolute or relative to the selected Beacon root. For Notebook runs, use the notebook file path. Applies to listing and latest; omit when using id. | 按记录路径筛选，可结合latest；Notebook记录用笔记路径；不与id组合 |

latest仍只允许true；不是“上次对话讨论的对象”，列表也不表示读过正文。problem列表本身已含完整看题身份；run／verdict列表与正文的区别在各结果形态中保持。

### fetchProblem

| 参数 | 英文候选 |
| --- | --- |
| oj | Problem source: luogu (洛谷), codeforces, atcoder, nowcoder (牛客 ACM), or lanqiao (蓝桥). |
| problemId | Canonical problem ID: Luogu P1001 or P1001@12345; Codeforces 2026/A; AtCoder abc300/abc300_a; Nowcoder problem/12345 or contest/12345/A; Lanqiao 12345. |

oj与problemId必需，只有现有五个oj枚举。规范ID示例保当前合同，不加入题目候选推断器或新的URL参数。

### readPage

| 参数 | 英文候选 |
| --- | --- |
| id | ID of an eligible open page from the host page directory. |
| offset | Zero-based Unicode character offset. Use the returned nextOffset to continue. |
| limit | Maximum Unicode characters to return; default 32768, maximum 131072. |
| pageNumber | For PDFs only: required 1-based physical page number. PDF reads extract text, not OCR. |

无version参数；调用时版本与权限由harness核验。PDF物理页号与文本offset分别作用，不混成同一个位置单位。

### inspectFile

| 参数 | 英文候选 |
| --- | --- |
| operation | read: read one file; list: list immediate directory entries; find: recursively match file or directory names; search: recursively find matching text lines in inspected file content. |
| path | Absolute local or UNC path, or a path relative to the listed file root. Use . for that root. read requires a file; list, find and search require a directory. |
| offset | For read only: zero-based Unicode character offset for text, or byte offset for binary excerpts. For the next range, pass the returned nextOffset as offset. |
| limit | For text/binary reads: maximum Unicode characters or bytes respectively, default 32768 and maximum 131072, subject to result budgets. For list/find/search: maximum returned entries or matches, default 100 and maximum 200. Omit offset and limit for images. |
| query | Required for find/search. Literal, case-insensitive substring: find matches each file or directory name, not its parent path; search matches within individual text lines, without crossing line breaks. Omit for read/list. |

read接受path及offset／limit，图片读取例外、须省略offset与limit；list接受path／limit；find／search接受path／query／limit。与操作无关的参数继续按工程校验拒绝。find可命中文件或目录的名称，不匹配父路径；search在实际检查的文本范围内逐行匹配，不跨换行符；find与search不是正则或glob；list不递归。文本页的零起点Unicode位置沿当前实现，不照搬pi的1起点行号。二进制结果为hex展示，续读位置按原字节计算。nextOffset只提供后续位置，不保证本回答尚有读取额度；不用在每个参数旁反复叠加这句，具体预算不足反馈在结果层设计。

### browseWeb

| 参数 | 英文候选 |
| --- | --- |
| operation | search: search public web information using query; fetch: read a public HTTP(S) page using url. |
| query | For search: the public search query, within the real user's requested scope. |
| url | For fetch: a public HTTP(S) URL supplied by the user or found in search results. |

保持既有操作与校验；是否进一步从schema层表达每个操作的必需参数，在工程方案中单列，不以本表冒充已完成。联网服务的返回没有offset分页，不能从其truncated推导可用续读游标。

### readBeCoderInfo

| 参数 | 英文候选 |
| --- | --- |
| topic | overview (default): product and topic directory; problems: obtaining tasks; runner: compilation and program runs; cph: local test cases and answer checking; notebook: learning documents and code-cell runs; oj-connect: supported OJs and submissions; beacon: workspace, modes and retained records. Any topic can be read directly. |

保持七个固定主题及默认overview；主题不是个人配置查询或行为目录。详细事实留在按需正文。

## 4. 普通请求与摘要子请求

普通请求保三个记录工具的列表、id、latest和filePath用法。摘要子请求实际只可读本回答已固定的历史ID，拟按本阶段能力裁定声明：用途说明指明已固定历史记录，输入仅含必需id；不宣告目录／latest／filePath，不增加可读记录。是否每个工具只在确有对应固定ID时注册，以及如何将合法ID范围呈现给模型，在摘要轮细化。

这是已选择A范围内的阶段声明设计候选，不是改权限或开放新历史。执行层固定ID校验保留，不能以收窄schema取代原授权检查。阶段声明与真实计量及出站schema必须一致，实施时专门验证。

## 5. 向结果层交接的说明

| 信息 | 交给哪处解释 | 原因 |
| --- | --- | --- |
| codeHash的文本归一化及含义 | 实时代码／历史代码结果 | 读到hash时才需要解释比较口径 |
| status、CPH check、stdout/stderr与merged | run返回 | 跟具体来源和实际字段一起出现 |
| 已存前缀、未知stdin、未执行input | run对应返回分支 | 明确实际缺口，避免将缺失补成事实 |
| verdict逐点结果可能没有测试输入 | verdict对应返回 | 由实际返回范围支撑表达，不推断隐藏数据 |
| 文件范围、续读位置、搜索不完整 | 文件／页面对应结果 | 真实游标随实际范围产生；不让模型自己推算 |
| 网页摘录、正文、截断与额度不足 | browseWeb对应结果 | 没有offset就不承诺offset，预算不是网站内容事实 |

本轮候选的用途说明已据此收窄，但下一轮的结果表达尚未完成；因此这些文案不能单独接入生产，防止移出旧说明后产生信息缺口。结果解释可以是固定字段说明或宿主生成的短释义，不能改写记录事实、复制完整产品手册或为所有结果套统一长模板。

## 6. 负责人已采用的运行结果释义形式

负责人回复“采用”：运行记录的字段释义放在返回结果的外层，由harness生成短notes，与原record分开。下面是结构示意，record仅节选相关字段，不是完整合法记录或真实测试返回：

```json
{
  "record": {
    "source": "runner",
    "runs": [
      {"output": {"merged": {"text": "captured prefix...", "truncated": true}}}
    ]
  },
  "notes": [
    "Runner output combines stdout and stderr; Runner does not automatically check answers.",
    "Truncated values are saved prefixes. Their omitted suffixes were not retained in this record."
  ]
}
```

建议采用此方向：第一次发现工具时明确“用户的本地运行”，读到结果时再明确该条是CPH分流与check，还是Runner／Notebook合流且无自动答案检查。notes只根据真实来源和实际字段生成适用的释义，不改写record、不写入持久队列、不把学生源码或原始输出当作指令；源码、输出等缺口必须来自实际截断标记，不能靠模型猜测。当前record原本的字段保持，不为每个字段另包一层对象，也不增加分页、快照或通用提示注入框架。

notes名称、其他来源是否需要对应包装、每条说明出现条件及最终英文，在下一轮细化供审阅；已确定“工程释义与记录事实分开、随相关结果提供”的具体方向。生产目前没有这个notes字段。

## 7. 审阅与验证

本候选需两份独立只读审查：源码及参数语义一致性、仅凭候选文字能否区分来源与构造有效调用。主agent核实并修订，再复检改变的入口。任何后续模型检查允许直接回答、直接id／latest及合法历史复用，不用固定工具轨迹评判正确。

本轮只编写设计文档，不改生产提示、参数校验、工具返回、采集或持久化，不构建、不调用模型API、不作Git提交或推送。

独立输入语义审查确认九工具可区分现场、三类用户行为、题面、产品知识及普通页面／联网来源；D1按建议明确可见编辑区、find匹配名称和图片范围规则，修订后复检无必改项。其建议在readPage再复制一段fetchProblem用途未采纳：两者已有“已加载页面”与“五站联网解析”的独立说明，避免相邻工具互相搬运全文。

独立源码审阅另指出readPage不读任何C/C++文本／BeCoder笔记、search逐行而非任意全文子串、nextOffset不保证剩余预算。主agent已逐项核对并形成D2：准确表达readPage排除范围和逐行搜索；游标参数只说明后续位置，预算局限交给实际结果／错误承接，不逐字段堆重复免责声明。原审阅者已复检D2，确认原三点源码一致性闭合，无需继续修改这三处。负责人后续已采用运行结果notes方向，具体设计在下一轮展开；摘要阶段声明仍待后续细化。均不是已交付能力，静态复检不代表实际装配或模型效果通过。
