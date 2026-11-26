# Beacon 硬能力工程审查与修复

日期：2026-11-26（Asia/Shanghai）。负责人授权对整个Beacon硬能力作code review与bug修复。基线为`Beacon_Next@950befec109132e25c190d896e8375a17a04ef0a`及既有未提交实现；本轮保留原工作树，只修复可复现的工程问题。

## 审查范围与结论

覆盖工具参数及真实读取、文档身份、模式／根权限、用户行为采集与发布、执行适配、会话请求归属、模型预算、媒体及同步压缩。主审与四个领域审查／修复agent分工，另有独立只读agent复核修复。没有增加工具、队列、快照、索引或模型操作权限，没有以提示词补偿工程缺陷。

确认并修复18项缺陷；下表按独立根因计数，测试用例数不等于缺陷数。源码、自动检查和stage分别记录，未以本轮工程回归证明模型教学质量或真实站点全闭环已通过。

## 已修复问题

| 编号／级别 | 原问题与正常触发 | 最终处理及所有者 |
| --- | --- | --- |
| 01 P1 | 运行结束后的记录仍在发布，关闭最后窗口时退出等待只覆盖恢复指针，本次记录可能未保存完 | [Coordinator](../../../src/vs/platform/beacon/node/beaconCoordinator.ts)与[Main Service](../../../src/vs/platform/beacon/electron-main/beaconContextMainService.ts)在应用最终退出时等待既有发布尾部；普通窗口关闭、执行退役与下一次运行仍独立 |
| 02 P1 | 4K／8K等小窗口在未指定本轮输出时，将整个窗口预留为输出，首问报invalid-model-budget且未发请求 | [Provider](../../../extensions/becoder.beacon/src/provider.ts)仅在默认预留会占满窗口时采用既有3:1输入／输出比例；服务容量和用户显式回复预算不改。真实输入仍须通过容量检查，不隐藏工具schema来迎合小模型 |
| 03 P2 | 页面切换后迟到的发送／重答／继续动作缺少view身份校验，可能作用于当前会话 | [宿主](../../../extensions/becoder.beacon/src/extension.ts)和[Webview](../../../extensions/becoder.beacon/webview/App.tsx)复用viewKey，在请求准备前拒绝旧页面动作；既有调用方未传该字段仍保持兼容 |
| 04 P2 | Runner等待采集登记期间切标签，登记对象仍是A而实际运行了B，记录路径不匹配 | [Runner](../../../extensions/danielpinto8zz6.c-cpp-compile-run/src/compile-run-manager.ts)在首个await前固定点击时的TextDocument，源码准备、dirty保存和执行使用同一目标 |
| 05 P2 | CPH编译成功后、helper尚未启动学生程序时停止，仍发出已执行事件并留下check／耗时 | [CPH](../../../extensions/becoder.cph/src/execution.ts)依据实际started事实，启动前取消不发送执行／检查事件；记录保not-run、skipReason:cancelled |
| 06 P2 | 提交后在编辑器内改名／删除原源码，完整终态因旧filePath的ENOENT无法入队 | Coordinator将problem／verdict路径视为历史事实，沿最近存在祖先核验原根范围；外逃、dangling junction、旧scope和失效根继续拒绝，不读取替代源码 |
| 07 P2 | readPage先全文脱敏、切片后再次脱敏，返回长度和nextOffset漂移 | [ContextTools](../../../extensions/becoder.beacon/src/contextTools.ts)只对全文脱敏一次，再按码点切片；元数据独立脱敏，分段拼接与完整脱敏稿一致 |
| 08 P2 | 通过目录联接或Windows大小写别名打开的Notebook有dirty稿，inspectFile却回退到磁盘稿 | [Notebook owner](../../../extensions/becoder.notebook/src/editApi.ts)按真实文件身份寻找已加载文档，保留dirty内容，不额外打开资源 |
| 09 P2 | inspectFile取得dirty正文后，异步磁盘核验／句柄关闭期间文档改版、关闭或被替换，仍返回旧内容成功 | [FileTools](../../../extensions/becoder.beacon/src/fileTools.ts)与[编辑器桥](../../../extensions/becoder.beacon/src/workspaceFiles.ts)保留本次owner／version校验闭包，最终关闭句柄后再核对；Notebook同样适用，不增加存储或全局监听 |
| 10 P2 | 可见Notebook尚无加载owner时，被过滤掉并成功返回空files | [页面owner](../../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts)保留带明确失败原因的可见Notebook项；不把缺失误报为空，不自动打开后台笔记 |
| 11 P2 | search跳过访问失败／改版／投影失败的普通文件，却声称完整无匹配 | FileTools将此类实际遗漏标记在已有truncated字段；已取得匹配可用，凭据／私有／范围外的正常排除不制造失败 |
| 12 P2 | 百炼／Moonshot／Ollama压缩工具图片时未做普通请求的媒体转换，base64被当作正文，可能提前容量失败 | Provider与[Compaction](../../../extensions/becoder.beacon/src/compaction.ts)复用同一最终消息准备路径，计量和实际出站都保留图片part；不丢图、不将图片bytes计作普通文本 |
| 13 P2 | 压缩子请求未继承捕获连接中的关闭思考／effort／适用采样参数 | Compaction透传本次已捕获参数与providerOptions，仍使用当前模型、原预算与一步一次恢复 |
| 14 P2 | Runner采集scope／activity登记异常仅写trace，用户不知道应保存记录漏采 | Runner统一按request通知失败，同动作至多一次，执行继续；正常无根／根外返回undefined仍静默 |
| 15 P2 | Runner编译中停止时compiled事件缺少取消事实，被记录成编译失败 | [RunnerProcess](../../../extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerProcess.ts)传递真实取消标记，编译状态为cancelled，未执行输入继续保持未执行 |
| 16 P2 | Notebook捕获collectionScope异常静默，无法告知本批记录未正常采集 | [Notebook](../../../extensions/becoder.notebook/src/extension.ts)复用批次失败通知，正常无根／根外不报警，程序运行继续且后续操作可用 |
| 17 P2 | CPH捕获collectionScope异常同样被当作正常不采集，完整运行结束却没有保存失败提示 | [JudgeView](../../../extensions/becoder.cph/src/judgeView.ts)运行样例时复用本动作通知；正常无根／根外保持静默；Compile Only不查询采集范围也不报采集错 |
| 18 P2 | OJ Connect拿题／导入／提交前捕获scope异常静默，后续上下文无法形成但用户不知情 | [OJ Connect](../../../extensions/becoder.oj-connect/src/extension.ts)在scope异常时作准确的前置失败通知，核心动作继续；undefined排除仍静默，不重复终态采集、不重试或重交 |

## 回归与复审

各修复先用真实生产入口／owner及确定性barrier建立RED，再作最小修复。模型网络请求使用mock fetch；执行测试按拥有者既有测试使用本地合成程序与工具链。没有调用真实模型或网站账号。

| 不重复计数的测试集合 | 通过 | 跳过 |
| --- | ---: | ---: |
| Beacon完整套件 | 342 | 0 |
| 原生队列／基础设施／页面身份及应用退出 | 82 | 0 |
| 已加载Notebook页面owner | 5 | 0 |
| Runner完整套件 | 161 | 0 |
| CPH完整套件 | 104 | 1 |
| Notebook完整套件 | 50 | 0 |
| OJ Connect完整套件 | 197 | 0 |
| 合计 | **941** | **1** |

跳过项需要用户生成的PCH缓存，未记作通过。原生82项通过当前源码内存转译运行，保真实文件系统／租约和disposable检查，仅stub环境DI token；其中2项执行实际Main Service退出挂接。标准`npm run test-node`另外通过81项，包含与上述重叠的80项业务回归和运行器Errors检查，不再次累计。页面owner的5项为headless所有者测试，不代表真实GUI或该测试夹具未启用的disposable检查。

客户端类型、Beacon类型／strict lint、变更原生与生产者lint、完整分层、生产Webview render及相关parser检查均已通过；OI统一编译和最终stage状态在下节单列。没有宣称整仓ESLint零警告。原始RED、失败和修正均保留在本轮[验证台账](../../../.superpowers/sdd/2026-11-26-beacon-hard-capability-review/checks.jsonl)。

独立复审覆盖view归属、预算／图片／参数、原生退出／历史路径、工具读取和执行适配，未发现具体阻塞问题。独立agent在内存中执行session15项及撤回修复的15项RED、脱敏分页1项、Notebook scope3项，以及追加的CPH6场景／OJ helper3场景各重复两次；其他部分为源码及测试逻辑审查。主审另外完成统一suite，二者分别成立，不将源码阅读称为原生GUI验收。

## 失败记录与保护边界

- RED包含view动作归属、session15项、native7项以及工具／执行适配的确定性失败。初版view用例提前flush取消了请求，修正用例后才取得真实失败；native两项拒绝形态断言也在生产修改前修正。未把这些初版测试结果当作产品通过证据。
- Notebook测试首次引入原生URI依赖，触发其测试配置缺少应用全局声明；改用Node文件URI函数后原命令通过。最终统一lint又发现跨slice重复import，合并后0错误、0警告。两次失败的原输出均保留。
- 既有npm项目配置警告、图片part弃用警告及故意失败夹具输出保留，不影响退出码；不会据此声称无任何警告。
- 九工具、problem13／run30／verdict20、run字段和32KB限制、Blackout采集／消费分离、无自动执行／重试／重放、无代码快照均保留。退出等待只在应用最终退出；普通执行、关闭窗口和即时重跑不等待记录磁盘发布。

## 构建与交付

本轮最终OI统一编译已退出0；标准`npm run gulp vscode-win32-x64-min`于2026-11-26 12:54:53（Asia/Shanghai，按台账起点与耗时换算）退出0，用时168.31秒。stage入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。这是本轮最终源码的新构建，未启动实例，未作Setup或原生GUI验收。

stage使用已核对仓库校验值的本机Electron归档，仅对子进程设置环境变量。未清理用户数据、工作区、缓存或旧访谈环境，未作Git commit／push／Release。未运行Setup、真实应用实例、账号登录／提交或新一轮Beacon访谈。

## 仍需单独验收

本轮可证明具体工程缺陷的复现、修复及自动回归；仍需负责人在正常拿题、dirty改稿、Runner／CPH／Notebook、提交与Beacon求助流程中验收体验。五站实时页面、网络服务及模型选材／教学质量未在本轮重新测试。既有压缩60%目标、整理schema收紧和执行观察unknown类型技术债未借本次review扩大实施，继续按[实现状态](../implementation-status.md)维护。
