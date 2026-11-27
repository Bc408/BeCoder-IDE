# Beacon产品上下文提示词接入

日期：2026-11-27。负责人已逐项审定以下英文文本，并授权统一接入、将BeCoder应用版本更新为`2.2.0`，本地提交及推送对应分支。开发基线`Beacon_Next@10efc351`；内部提示版本更新为`2026-11-27.1`。本轮不进行Beacon模型问答或API测试。

本轮范围是提示内容和结果短释义，不改变工具参数、三队列存储／容量／去重、权限、执行owner或压缩算法。上一轮[33轮问答](../evaluation/2026-11-27-prompt-information-flow-interview-dialogue.md)、[访谈](../evaluation/2026-11-27-prompt-information-flow-interview.md)和[核验](../evaluation/2026-11-27-prompt-information-flow-interview-report.md)保留其`.4`提示与2.1.1宿主身份，不作为本轮新文字的模型效果证明。

## 1. system取材原则

位置：[prompts.ts](../../../extensions/becoder.beacon/src/prompts.ts)。替换原取材和版本对应的两句，其他导师原则与宿主元数据包装保持。

```text
Reuse earlier observations while they remain relevant to the learner's question. When the question concerns later edits or activity, obtain the current evidence needed through the tools offered for this request. Keep live code observations distinct from captured execution and submission versions.
```

中文语义：复用仍适用于当前问题的先前观察；讨论后续修改或新活动时，通过本次工具取得所需当前证据；区分现场代码与执行稿、提交稿。材料选择由模型判断，不规定每轮必读、固定调用顺序或讨论对象绑定。

## 2. 共享队列与截断取舍

位置：[beacon产品主题](../../../extensions/becoder.beacon/resources/product-info/beacon.md)。补在既有队列说明和容量说明相应位置，不在system复制。

```text
Eligible user activity is saved to the selected workspace's shared queues independently of conversation turns. Listing records or using latest queries the records retained at call time. latest selects the most recently enqueued record within the optional filePath filter; it does not identify the task being discussed. Previous tool results remain historical observations and do not refresh automatically as the queues change.

Runner, CPH and Notebook share one run queue. latest selects the newest matching record across these sources, subject to filePath when supplied. Each record's source identifies the execution method.
```

中文语义：采集独立于对话轮次；目录和latest读取调用时保留内容。latest按入队顺序及可选文件筛选选择记录，不决定谈论对象；旧工具返回不自动刷新。run由三种执行方式共用，以source分辨来源。

```text
In BeCoder's supported learning workflows, very long input or output usually comes from large test data, repeated output from an endless loop, or extensive compiler errors. Preserving all of this text adds little value to routine teaching and debugging, so run records deliberately retain bounded prefixes to keep the context useful and manageable.
```

中文语义：聚焦BeCoder承诺的学习场景，超长材料通常来自大测试数据、死循环重复输出、大量编译错误。完整持久化的教学与纠错价值很低，主动保留有限前缀；不追加对其他情境的推测或恢复要求。

当次截断返回的现有短释义保持：

```text
Values marked truncated are saved prefixes; their omitted suffixes are not available through this record.
```

8192／4096／1024码点和单条32768字节规则保持；理由与实际返回范围分别说明。

## 3. Notebook输入配对

位置：[notebook产品主题](../../../extensions/becoder.beacon/resources/product-info/notebook.md)。

```text
Each input cell uses the nearest preceding C/C++ code cell, ignoring intervening Markdown cells. Multiple inputs can use the same program until another C/C++ code cell appears. Running an input executes that program with the input's text.

Run All or Run Selection captures the selected inputs, their associated code and their positions at the start, including unsaved edits. Each associated code cell is compiled once for that action, and its inputs run in separate processes. Later edits or reordering affect subsequent runs, not the captured execution.
```

中文语义：向上取最近C/C++格，跳过Markdown；一个程序可对应多个输入。开始时捕获本次输入、代码和位置，含未保存内容；同代码格本次编译一次，各input独立进程。后续编辑／调序影响后续运行。既有失败继续、编译失败跳过及主动停止整批的说明保持。

位置：[toolResultNotes.ts](../../../extensions/becoder.beacon/src/toolResultNotes.ts)。只有readCurrentCode实际返回Notebook，或inspectFile实际返回notebook-content时附以下同一常量；普通代码、普通文本及失败返回不附，不根据学生正文生成说明，不写回raw结果或记录。

```text
Each input cell uses the nearest preceding C/C++ code cell, ignoring intervening Markdown cells.
```

## 4. 编译源码来源与CPH配置路径

位置：[runner产品主题](../../../extensions/becoder.beacon/resources/product-info/runner.md)。

```text
Runner explicitly saves unsaved changes in the target source document before compilation, even when editor auto-save is off. If saving fails, the run does not proceed. Compilation uses a captured copy of the main source file, and the run record describes that captured version. Later editor changes do not alter the recorded execution.
```

位置：[cph产品主题](../../../extensions/becoder.beacon/resources/product-info/cph.md)。

```text
CPH explicitly saves the associated source document before compilation, even when editor auto-save is off. If saving fails, the action does not proceed. Compilation uses a captured copy of the main source file; all test cases in that action use the resulting program. The run record describes that captured version and the test data used for that action.
```

中文语义：两者均在编译前显式保存，自动保存关闭不影响这一步；保存失败不继续。编译及记录对应捕获的主源码，CPH本次测试点使用同一产物，保当次代码和数据。该事实与Notebook直接捕获单元内容分别表述，不新建源码来源字段或快照机制。

```text
CPH stores test-case definitions in a .cph directory beside the associated source file. For <directory>/<filename>, the metadata path is <directory>/.cph/.<filename>_<path-hash>.prob. The filename includes the source extension. The hash is derived from the source path, not its code contents; srcPath inside the metadata identifies the associated source.

These files contain the saved test inputs and expected outputs. Historical run records contain the code, inputs and results captured for their executions. The workingDirectory in a run record belongs to that execution and is separate from the saved test-case directory.
```

中文语义：源码同目录的.cph保存配置，文件名保源码扩展名，哈希来自源码路径；srcPath认关联源码。配置输入／期望与历史执行事实分开，执行目录不等于配置目录。既有样例导入和编辑配置不触发执行等说明保持。

## 5. 应用版本与验证

应用发行版本只修改根package.json及package-lock.json的根版本为2.2.0；product.json的扩展API兼容号、各扩展版本、第三方依赖及历史记录保持。产品信息临时包测试改为读取根应用版本，继续验证包与源码版本相符，不将合成2.1.1测试值或既有访谈历史整体替换。

新增一项离线回归验证Notebook短释义：实时与语义文件入口同义、普通内容及失败不附、续读游标保留、raw输入不变；先在旧实现失败，再随接入通过。首次新增测试直接访问SDK联合类型的value导致TypeScript报错，修正测试的安全属性读取后类型检查通过；它是测试代码错误，不是缺失短释义的行为失败。预检曾将tsc6入口误写为tsc6.js，核对实际文件后修正，属于验证编排错误；原日志保留。

最终Beacon类型检查、生产bundle构建、24项toolInformation定向回归、368项完整离线回归（21 suites，0失败／跳过／取消）及strict lint退出0。产品正文／提示原文、Notebook两入口notes、应用及锁文件版本一致性另作静态核对；文档结构与链接、Git diff分别检查，最终命令收据保留在`.superpowers/sdd/2026-11-27-beacon-product-context/validation.jsonl`。

上述自动回归使用本地合成响应，不调用实际模型、发现模型、联网评测或进行新Beacon问答。没有新建stage或Setup，没有启动新的BeCoder实例；当前已有stage和访谈实验继续保留其原始版本，不把扩展构建或分支推送称为2.2.0安装包、Release或模型质量验收。
