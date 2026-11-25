# Beacon 提示词调优与产品知识工具实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 推荐Native执行，主agent单写者完成相互依赖的接线，最后由独立只读审阅者检查；负责人已选择Native并批准实施。

**Goal:** 以精简导师核心、准确工具说明和按主题产品知识，改善Beacon的取材、事实理解与教学表达，并以同场景模型对照交付证据。

**Architecture:** 导师system只保已批准原则，工具Schema承载用途与参数，模型专用产品知识随应用发布且按主题读取。新readBeCoderInfo复用ContextTools／Provider／协议／预算，版本由运行宿主IProductService提供，不引入新队列、配置读取或工具调用流水线。

**Tech Stack:** 现有TypeScript、Code - OSS服务、Node fs、AI SDK、esbuild、node:test／Mocha／Electron测试和DeepSeek Flash；不新增依赖。

**Spec:** [已通过设计](../specs/2026-11-25-beacon-prompt-quality-design.md)。2026-11-25负责人先批准设计及计划，再选择Native并确认进入实施；后续明确要求所有生产提示和产品主题正文采用英文、避免语义漂移。实施及验证见末尾执行记录。

## Global Constraints

- 基线为`Beacon_Next@5dfd3eee3f892a221bd0af894559babea55cfa3a`，另有本轮设计／导航文档未提交；保留它们，不回退或混入他人修改。
- 导师核心按设计§3的原则作等义英文表达；初版为`2026-11-25.1`，有限修订最终为`2026-11-25.3`；删除逐工具capabilities和过细场景清单。具体教学示例和好坏回答只在评测侧。
- 模型自主选对象和材料，不设置当前题目、不强制先查概览、不强制每题fetchProblem、不自动注入所有产品主题。
- 新工具输入为`{topic?: 'overview'|'problems'|'runner'|'cph'|'notebook'|'oj-connect'|'beacon'}`，成功结果仅`{version,topic,content}`；空对象读overview，主题整篇返回。
- 主题正文只述产品事实、关系、真实入口、必要条件及支持范围，不含“用户说某词就……”或调用／回答流程；排除通用编辑器教程和未交付愿景。
- 版本来自运行宿主IProductService.version，不用vscode.version、Beacon扩展版本、当前源码package.json或联网最新版本。官方项目地址为`https://github.com/Bc408/BeCoder-IDE`。
- 产品知识工具在Blackout／Spot／Flood及无工作区可用，前提为模型支持工具调用；不读取用户配置、账号、路径、代码或记录。即时配置查询沿Flood已有权限，不新增接口或扩权。
- 保持problem13／run30／verdict20、8KiB运行输出、当前代码整读及零独立快照、五站fetch与搜索开关解耦、Notebook独立运行和历史不重演。
- 不改压缩算法、90%／60%合同、一步一次恢复、20步共享额度；压缩子请求不新增readBeCoderInfo能力，既有缺口继续单列。
- 不安装依赖、不清缓存／测试证据、不改系统环境或已有工具链；台账和输出只建本任务新目录。API密钥只读本机私有配置，绝不打印。
- 计划已获批，实施、云测试、stage及本专项资源验证属于本轮授权范围；Setup、完整包验证、GUI、Git commit／push、PR及Release不自动执行。

## Review Focus

1. 产品发行号与扩展兼容号不同：当version=2.1.1、extensionApiVersion=1.140.0时仍返回2.1.1，且不访问工作区服务；Task 2测试。
2. 无根／Blackout或产品资源缺失：产品说明可读，原记录仍受限；缺失报read_failed而不是空正文或文件兜底；Task 2、3测试。
3. 产品说明被理解为操作能力：介绍提交／运行不能增加模型写入或执行工具，普通概念也不应自动获取软件指南；Task 3出站测试与Task 4场景。
4. 精简后角色／隐私边界退化：用户纠正仍为用户消息、工具返回不晋升system，旧事实不重演，压缩不查新知识；Task 3测试及Task 4连续轨迹。
5. 源码有主题而发行包没有，或基线／候选使用不同夹具：资源验证必须覆盖正式stage，评测冻结源与夹具哈希，失败和剔除不消失；Task 1、2、5覆盖。

## 文件与接口分工

| 范围 | 创建／修改路径（仓库相对） |
| --- | --- |
| 产品知识模块 | 新增`extensions/becoder.beacon/src/productInfo.ts`、`resources/product-info/{overview,problems,runner,cph,notebook,oj-connect,beacon}.md` |
| 元数据与工具接线 | 修改`src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`、`extensions/becoder.beacon/src/{context.ts,contextTools.ts,contextToolContract.ts,extension.ts,provider.ts}` |
| 导师核心 | 修改`extensions/becoder.beacon/src/prompts.ts`；Provider中的fileSchema／webSchema说明同步清理 |
| 新工具测试 | 新增`extensions/becoder.beacon/test/productInfo.test.ts`和`test/verify-product-info.mts`，新增`src/vs/workbench/contrib/becoder/test/electron-browser/beaconProductInfo.test.ts`；修改现有context／semanticContext／prompts／compaction测试中受影响部分 |
| 云评测 | 新增`extensions/becoder.beacon/test/{contextQuality.ts,contextQuality.test.ts,context-quality-evaluation.ts}`及`test/fixtures/context-quality-{dev,holdout}.json`；修改`build.mjs`和扩展package.json以注册测试／评测产物 |
| 交付文档 | 同步`docs/beacon/{README,prd,architecture,tool-contract,implementation-status}.md`、扩展README；新增`docs/beacon/evaluation/2026-11-25-prompt-quality-{report,samples}.md`；底层／压缩正文仅在入口交叉引用确需更新时修改，不重写合同 |

表中product-info路径均位于Beacon扩展；不创建根目录通用知识库。新源码采用相邻文件版权／导入约定，资源和评测fixture不含生产密钥。`src/session.ts`、`history.ts`、`protocol.ts`和Webview不预先重构；只有实际新工具接线证明需要最小适配时才改，并记录原因。

## Task 1：固定场景与可复现基线

**Files:** 新增上述三个contextQuality测试文件及两份fixture；修改`extensions/becoder.beacon/build.mjs`、`package.json`。先读现有`test/promptEvaluation.ts`、`promptEvaluation.test.ts`及旧重构评测脚本，但不依赖忽略目录脚本运行。

**Interfaces:**

- `contextQuality.ts`导出`readContextQualitySuite(value: unknown): ContextQualityScenario[]`、`validateContextQualityFixture(scenario: ContextQualityScenario, signal: AbortSignal): Promise<void>`、`runContextQualityScenario(runtime: ContextQualityRuntime, scenario: ContextQualityScenario, options: ContextQualityOptions, signal: AbortSignal): Promise<ContextQualityResult>`。
- `ContextQualityScenario`含`id: string`、`turns: ContextQualityTurn[]`及仅HT02使用的`historyPrefix?: {role: 'user'|'assistant'; text: string}[]`／`capacityOverride?: {contextWindow: number; maxInputTokens: number; maxOutputTokens: number}`；turn为`{question: string; fixture: ContextQualityFixture; criteria: string[]; evidenceNeeds: ContextQualityEvidence[]}`，evidence取`current-code|statement|run|verdict|product-info`，不强制一条工具调用序列。fixture给本轮完整`mode`、`webEnabled`、`workspaceUsable`、`pages`、`files`、`problemRecords`、`runRecords`、`verdictRecords`、`statements`和`webSources`；按生产类型校验，statements用规范题目身份到ProblemDocument的固定映射。无数据用空列表，缺失不能自动补来源。history只来自同轨迹之前真实生成的ChatHistory，HT02额外的长合成前缀单独记为fixture预置历史。
- `ContextQualityOptions`为`{connection: Connection; workspace: string; productInfoRoot: string; request: typeof fetch}`，connection只在内存中使用，不序列化含密钥对象。每场景使用独立workspace，真实BeaconStore持久记录；生产源码边界如editor／OJ的transport返回fixture事实，不直接替代整个工具结果。
- `ContextQualityRuntime`包含冻结生产`createGenerator`、`ContextTools`、`BeaconContextClient`、`ChatHistory`、`FileTools`及题号解析导出；候选另有`createBeCoderInfoReader`，旧baseline此项为undefined，不补新能力。freeze只在productInfo.ts实际存在时加入其导出，Task 1不静态导入尚未创建的产品模块；不向旧bundle拼接候选代码。两臂由相同评测器加载不同冻结bundle，不给生产Provider加baseline开关或system override。评测中的宿主版本为明确标记的合成2.1.1，真实版本桥另由Task 2原生测试验证；产品主题正文使用随候选发布的真实资源。
- `ContextQualityResult`保用户回合状态、完整回答、真实tool输入／输出、出站system与schema、usage、压缩事件、时长及错误；缺usage为null，保原判与人工修订。

- [x] **Step 1：先写评测器离线回归。** `contextQuality.test.ts`覆盖`invalid_fixture_blocks_network`、`account_failure_stops_remaining_slots`、`history_and_tool_facts_keep_roles`、`frozen_runtime_is_not_rebuilt_from_candidate`：无效夹具令请求计数为0；401／402／403停止剩余槽并保not-run；工具结果不当system；基线bundle哈希不随候选修改变化。用注入fetch／本地流完成，不接云。
- [x] **Step 2：先构建并观察red，再最小实现评测模块及CLI。** 本阶段`npm --prefix extensions/becoder.beacon run typecheck`、`npm --prefix extensions/becoder.beacon run build`、`node --test extensions/becoder.beacon/dist-test/contextQuality.test.cjs`应先在未实现接口上失败，再退出0。实现不修改旧固定Ollama入口的模型、参数和十案例约束；新云评测是独立test-only入口。
- [x] **Step 3：固定CLI和产物。** 新`dist-test/context-quality-evaluation.cjs`支持`freeze --out <new-dir>`、`fixtures --suite all --out <new-dir>`、`run --arm baseline|candidate --suite dev|holdout --runs 2 --runtime <bundle> --config <private-json> --out <new-dir>`。freeze导出runtime.cjs／manifest；所有out新建且不得覆盖。记录源码hash、HEAD／dirty diff、fixture hash、模型与参数、Node／SDK、实际请求和失败分类；禁止保存Authorization头或私有配置正文。
- [x] **Step 4：完成Task 4场景表的24个单轮及4条四轮轨迹。** dev为16单轮＋2轨迹，holdout为8单轮＋2轨迹。验证合成运行稿、输入、输出及退出状态相符；CPH check超时可与学生进程正常完成并存，不为验证而执行未知检查器。边界元数据可合成，不能据fixture声称真实网站成功。
- [x] **Step 5：冻结旧源码并离线验夹具。** 在任何Task 2／3产品修改前执行freeze，输出`tmp/beacon-prompt-quality/2026-11-25/baseline-runtime/runtime.cjs`及manifest；执行fixtures检查全部场景。若执行日期或已有目录导致冲突，使用同父目录下新时间戳子目录并将实际路径一次性固定在台账，后续命令统一引用。不覆盖旧批次。
- [x] **Step 6：预检本机DeepSeek配置并跑baseline dev。** 配置只从既有`tmp/beacon-prompt-eval/private-cloud-test.json`读取，需approved=true、provider=deepseek、model=deepseek-flash及合法HTTPS地址。用生产listModels确认该模型存在，冻结有效连接／能力与生成参数；不改私有文件，不上传学生历史。48用户回合完成情况如实保留，fixture-only不计模型结果。holdout暂不用于提示修订。

Task 1交付为评测基础设施和不可变基线，尚无产品行为变更。若缺密钥、配置未批准或模型不可用，保留离线产物并说明阻碍，不换模型。

## Task 2：产品主题、实际版本及读取工具

**Files:** 创建`src/productInfo.ts`、七份主题资源、`test/productInfo.test.ts`、`test/verify-product-info.mts`及原生版本测试；修改context.ts／contextTools.ts／contextToolContract.ts／extension.ts／build.mjs／扩展package.json和workbench桥。

**Interfaces:**

```ts
// extensions/becoder.beacon/src/productInfo.ts
export const beCoderInfoTopics = ['overview', 'problems', 'runner', 'cph',
  'notebook', 'oj-connect', 'beacon'] as const;
export type BeCoderInfoTopic = typeof beCoderInfoTopics[number];
export interface BeCoderInfo { version: string; topic: BeCoderInfoTopic; content: string }
export type BeCoderInfoReader = (topic: BeCoderInfoTopic, signal: AbortSignal) => Promise<BeCoderInfo>;
export function createBeCoderInfoReader(resourceRoot: string,
  readVersion: (signal: AbortSignal) => Promise<string>): BeCoderInfoReader;

// context.ts / ContextToolOptions
BeaconContextClient.productVersion(signal: AbortSignal): Promise<string>;
ContextToolOptions.readBeCoderInfo?: BeCoderInfoReader;
```

`productInfo.ts`不导入vscode；版本callback通过现有内部命令`_becoder.beacon.context`的新`productVersion`操作获得字符串。extension.ts以扩展真实安装位置拼接`resources/product-info`创建reader并注入ContextTools；不从cwd、Beacon根或用户参数确定资源目录。

- [x] **Step 1：写读取器red用例。** `productInfo.test.ts`的`topic_reads_one_complete_resource`检查七主题及长正文完整返回；`invalid_topic_has_no_reads`检查null／空串／未知主题／`../`／额外字段在ContextTools或Schema层被拒绝且reader未调用；`missing_resource_or_version_is_read_failed`检查缺文件、空正文、版本空串／读取失败不当成功；`cancelled_read_never_delivers_body`覆盖调用前和读取中的取消。
- [x] **Step 2：写真实版本桥red用例。** `beaconProductInfo.test.ts`调用已注册命令handler，以仅能提供IProductService的测试accessor给出version=2.1.1、extensionApiVersion=1.140.0；断言结果2.1.1，若请求主进程／工作区／配置服务立即失败。另测产品字段改变即返回新值。该测试必须在Electron runner运行，不误用Node／Chromium排除electron-browser用例的入口。
- [x] **Step 3：运行red后实现最小读取。** 桥在访问ProxyChannel、窗口scope或pages之前处理productVersion，仅返回IProductService.version。client不调用refresh／scopedCall；前后检查signal，校验为非空字符串后原样返回。reader用固定topic→文件名映射读UTF-8，拒绝空内容；无联网、重试、备用目录或新缓存。错误经ContextTools转read_failed，取消保持取消。
- [x] **Step 4：注册新工具。** `contextToolNames`加入readBeCoderInfo，输入Schema固定topic枚举，空对象归overview，严格拒绝多余字段；补BeaconToolInputs／Outputs类型。ContextTools常规names在reader注入时包含该工具，缺reader不发布假能力，compactionView.names明确排除。info执行分支在用户scope检查之前调用reader；原队列／页面执行检查保持。全模式和无根可读，但模型tools=false不注册任何工具。
- [x] **Step 5：撰写七主题并核实事实。** 逐项读取Runner、CPH、Notebook、OJ Connect、Beacon拥有者源码及当前README核对入口和条件，按负责人最新决定维护英文模型专用说明，并与原确认事实逐项核对。overview含Code - OSS关系、官方GitHub、精确目录ID；beacon主题解释设置含义，不返回用户设置现值。没有术语识别口诀、工具调用指令、教学示例、历史评测或未来功能宣传。形成七份原文供负责人查看，后续反馈进入候选修订。
- [x] **Step 6：接入build／测试并green。** build.mjs新增productInfo测试入口，package.json的test包含新bundle。使用第“验证命令”节的Beacon与原生命令，确认读取整篇、版本区分和所有错误／取消均通过。
- [x] **Step 7：建立资源交付验证器。** `node extensions/becoder.beacon/test/verify-product-info.mts --app <stage-root>`只读检查`resources/app/package.json`版本、`extensions/becoder.beacon/dist/extension.cjs`和七份`resources/product-info/*.md`；比较该候选源码资源的字节hash与stage，不把旧stage或文件存在当新源码证明。测试验证器能拒绝缺主题、空主题及替换字节。构建前对合成目录测试，正式产物验证留Task 5；这不是完整安装包验证。

## Task 3：导师核心与工具说明精简，验证出站信息流

**Files:** 修改prompts.ts、contextToolContract.ts、Provider中的description与参数文字；更新`test/{prompts,context,semanticContext,compaction}.test.ts`及必要新工具测试。类型／协议仅作新工具所需最小接线。

**Interfaces:** 保留`composeBeaconPrompt(input: BeaconPromptInput): BeaconPrompt`，为保持现有调用方可继续接受toolNames，但不再根据名字追加capabilities。sections收敛为core／context，evidence原则已合入核心；version初版为2026-11-25.1，最终为2026-11-25.3。既有工具参数结构与结果不变，readBeCoderInfo沿Task 2定义。

- [x] **Step 1：先调整真实装配red用例。** `prompts.test.ts`的`registered_tools_do_not_duplicate_system_guidance`比较有／无工具时的相同核心，断言无Capability段、无主题正文自动注入；`no_tools_keeps_mentor_core`确认tools=false时仍有导师核心且tools字段为空。只测试装配职责，不把每一句教学话术做字符串断言。
- [x] **Step 2：写结果边界与历史red用例。** `product_info_is_an_ordinary_paired_tool_fact`让生产Provider经历info调用→成功JSON→回答，确认版本／正文仍为tool角色，停止后重答／历史续接不再次读取；`blackout_info_does_not_enable_records`测试有根和无根Blackout可读说明、不能读记录；`compaction_cannot_fetch_product_info`断言整理出站schema不含新工具且执行拒绝。保用户纠正／材料伪装指令角色测试。
- [x] **Step 3：实施精简。** 将设计§3原则作等义英文表达并维护为稳定块；必要时间、版本及页面／材料元数据保留。删除旧capabilities与场景清单，不改名接回旧长段落。contextToolContract和Provider采用设计§4用途／参数说明，包含CPH程序状态／check、提交稿身份等必要语义；不把旧system内容整包搬入description。工具名和用途一致，无循环路由要求。
- [x] **Step 4：校准参数语义。** 三记录id可选，fetchProblem五站规范题号，readPage的id／version／PDF物理页，文本偏移的真实单位及nextOffset；inspectFile磁盘字节与打开文档字符保持差别；不新增参数或统一错误单位。按相同输入对照旧schema的结构约束，允许description改变，新增info为唯一能力增项。
- [x] **Step 5：确认真实活动／历史／预算。** 新工具沿现有read类型显示`readBeCoderInfo`，不显示为网页获取；fetchProblem和browseWeb原文案保留。实际声明和完整工具结果参与计量，提示／schema变更重建usage锚。不为说明结果建私有material，不在压缩中重新读取说明；如通用协议已支持无需改写history／session。
- [x] **Step 6：运行green。** typecheck→build→新工具、prompts、semanticContext、contextBudget和compaction聚焦测试通过后，运行Beacon完整test和lint。核对所有当前工具组合的出站Schema，没有writer／旧工具别名或自动联网增项。

## Task 4：DeepSeek配对效果测试与有限迭代

**Files:** 完成Task 1评测器／fixture，修订仅限Tasks 2／3已批准范围；生成本任务新证据目录和最终report／samples文档。不改生产恢复／压缩以调成绩。

**Interfaces:** 复用Task 1的freeze／fixtures／run CLI。普通回合沿生产Provider三分钟deadline及20步共享额度；CLI按回合记录，不用一个120秒外部超时杀掉整批。按场景检查点保存，可取消和恢复未执行槽，不覆盖已有失败或自动重跑已完成槽。

### 固定场景表

| 集合 | ID | 输入与人工审阅重点 |
| --- | --- | --- |
| dev单轮 | D01–D03 | 循环只给提示、二分不变式原理、按请求给完整BFS解答；深度／讲解是否有效 |
| dev单轮 | D04–D06 | dirty修复、双分屏文件歧义、旧AC和新稿；观测／版本与必要澄清 |
| dev单轮 | D07–D10 | 五站只有题号、已给充分题面、明确刷新、已有历史题意；必要／无须fetch分别判 |
| dev单轮 | D11–D13 | Runner交互stdin缺口、CPH学生exit0而check超时、CPH测试全部多点；不以目录替正文，不混状态 |
| dev单轮 | D14–D16 | Notebook一个程序多input、反事实输出拼接、64位加法溢出条件；实际代码和计算正确 |
| dev轨迹 | DT01（4轮） | 提示→只追问未懂一步→真实dirty改稿→明确完整代码；深度变化、当前稿和旧建议区分 |
| dev轨迹 | DT02（4轮） | 产品概览／版本／GitHub→CPH用法→Runner输入文件→纯概念；按需主题与停止无关取材 |
| holdout单轮 | H01–H03 | 新算法／新数值的代码纠正、历史提交比较、非五站CPH元数据与网页兜底；不复刻dev模板 |
| holdout单轮 | H04–H05 | AtCoder题号且搜索关闭、无根Blackout取五站题面；不把搜索开关或持久队列当取题前提 |
| holdout单轮 | H06–H08 | OJ Connect支持范围／用法，Notebook独立使用，产品主题或版本读取失败；无学生代码多读、不编造配置现值 |
| holdout轨迹 | HT01（4轮） | 跨题、用户纠正、充分已给题面、继续解释新问题；不把历史限制延长到新题 |
| holdout轨迹 | HT02（4轮） | 长合成会话→取真实运行事实→触发压缩→追问已读来源与教学目标；记录压缩尝试及逐轮连续性 |

五站题号格式、其他未覆盖的产品主题／非法topic／权限边界另由离线参数化回归覆盖，不为云端分母补造条目。云夹具使用可核对的站点格式及合成题面；不宣称实际站点联通。

- [x] **Step 1：锁定对照条件。** 两臂使用同一实际配置和模型发现结果、temperature／top-p／输出预算／thinking设置；沿已保存值，未设值不强填。服务忽略某参数时记录，不能称确定性。基线固定旧runtime；候选在源码验证后freeze。没有产品工具的旧基线如实表现，不向其补塞新产品指南。
- [x] **Step 2：比较dev。** baseline已48回合，候选用相同dev每场景2次，共48回合。记录必要事实是否取得、无关读数、事实错误、教学与冗余；产品新能力的增益与既有教学回归分开，不能单一平均分掩盖退化。
- [x] **Step 3：至多两轮有理由修订。** 每轮先定位夹具／字段语义／描述或原则表达原因，只改已授权提示与产品事实。每版保源码hash和原答；新版本需重跑受影响离线检查及dev48回合，最多追加96候选回合。同类充分材料仍失败，标记疑似能力瓶颈，停该项并反馈；不追加逐例禁令或试到碰巧成功。
- [x] **Step 4：冻结最终候选再打开holdout。** baseline与最终候选各32回合（8单轮×2＋2轨迹×4×2）。holdout结果不用于本轮继续改提示；若发现重大退化，候选不验收，报告具体失败并提下一轮有边界方案。因无效夹具必须修正时保原样本、两臂同范围补测并单列次数。
- [x] **Step 5：给出完整分母与问答审阅包。** 基础共160用户回合，两轮修订最多追加96，常规总上限256；这是用户回合数，模型请求／工具调用／压缩次数分别实计。余额、鉴权、传输或容量失败保失败和not-run，夹具修正补测单列且两臂一致，不覆盖失败或混入原分母；不静默换Ollama或更强模型。
- [x] **Step 6：交负责人原文。** 至少选12组两臂对照：必要取题、无须取题、CPH check、旧判词、主题使用、版本、讲解深度、新算法和压缩各有代表，并包含全部候选明显失败及未参与调优样本。每组带用户问题、必要材料、真实工具调用、完整回答和人工判据，不能只给自动评分。

必要fetch指标的分母仅含“需新题面且身份已确定”；身份歧义需澄清和已有充分题面分别分类。产品知识亦区分需要／可选／无须，非空返回不证明取材有价值。模型错误按场景人工判，事实错误和教学冗余分别记录。

网络仅放行本机批准配置的模型发现／chat端点；OJ／网页／编辑器为合成边界，学生代码与历史不上云。无效输入在调用前拒绝。401／402／403立即停止批次；恢复仅补未执行槽。疑似模型瓶颈只停止对应项，独立场景可继续；全局协议或权限问题停止整个候选测试。

HT02为有意触发压缩的工程观察：两臂仅在该场景的连接副本设置C=42000、I=33000、O=4096，先确认服务容量不低于这些值；不修改私有配置，不声称这些值是模型真实窗口。按两臂完整输入计量固定足以触发的同一份长合成前缀，fixture／manifest显式记录该预算覆盖与预置历史。压缩是否发生、结构是否合法、后续语义是否连续分别报告，不以最后能回答掩盖中途失败。

## Task 5：最终复审、回归、文档与stage交付

**Files:** 同步第“文件与接口分工”节的当前文档，新增report／samples，完成资源验证脚本；不把设计目标写成已有成绩。

- [x] **Step 1：独立只读code review。** 按产品事实、版本桥、全模式、无配置访问、权限／历史／压缩、资源打包和模型数据口径审查；主agent另做整体验证。发现具体问题先补回归再修，重跑受影响项；源码变更影响模型输出时重新判断Task 4证据有效性，不能复用旧候选成绩。
- [x] **Step 2：同步文档。** 新工具实际接入后才将当前九工具更新为十工具；PRD原141个稳定ID及行为保留，在相应章节承接产品知识能力。工具合同加精确输入／输出和模式，架构补知识与宿主版本所有者，实现状态分别记录新代码／离线／云测／构建／待验收。旧质量问题与历史统计不抹除。
- [x] **Step 3：执行最终源码矩阵。** 使用下表命令和外部期限；任何正式非零／超时记入台账并按层诊断。整仓ESLint原失败不能宣称通过，Beacon strict lint及变更原生源码lint分别报告；分层完整通过。只对实际变更失效项重跑，最终矩阵须对应最后源码。
- [x] **Step 4：只构建一次最终标准stage。** 在所有前置检查通过后，按`typecheck-client`→`compile-oi-extensions`→完整`vscode-win32-x64-min`执行，期限120／120／300秒。已有stage不是新源码证据；本机当前交付目录若缺失，由正式build创建，不手工拼装。失败诊断后最小恢复并重新执行受影响检查，不把失败或min-ci替代称完整标准命令通过。
- [x] **Step 5：只读验证本专项stage资源。** 在同一授权交付范围内运行verify-product-info.mts核对七主题、bundle和发行版本。该验证是本专项明确后续，不自动升级为完整包／Setup／GUI验证。源码或资源在build后变化使产物失效，须先重建再交付。
- [x] **Step 6：交付。** 给stage启动路径、精确源码与资源hash、验证台账、能力报告和原始问答。负责人手动确认产品使用指引和回答质量；未完成的模型项及压缩技术债单列。结束，不自动Git发布或启动产品。

## 验证命令、预检与台账

命令均从仓库根运行。现有脚本入口已只读核对；带“新增”的测试bundle／CLI由本计划任务创建，执行前必须确认真实存在。不得把命令预检当通过结果。

| 编号 | 精确命令 | 外部期限／用途 |
| --- | --- | --- |
| V01 | `npm --prefix extensions/becoder.beacon run typecheck` | 120秒；扩展拥有者类型 |
| V02 | `npm --prefix extensions/becoder.beacon run build` | 120秒；生产／测试bundle，包括新增入口 |
| V03 | `node --test extensions/becoder.beacon/dist-test/productInfo.test.cjs extensions/becoder.beacon/dist-test/contextQuality.test.cjs extensions/becoder.beacon/dist-test/prompts.test.cjs extensions/becoder.beacon/dist-test/semanticContext.test.cjs extensions/becoder.beacon/dist-test/contextBudget.test.cjs extensions/becoder.beacon/dist-test/compaction.test.cjs` | 120秒；按Task当前已创建文件选最小子集，最终全部 |
| V04 | `npm --prefix extensions/becoder.beacon test` | 120秒；包含新测试后的完整Beacon套件 |
| V05 | `npm --prefix extensions/becoder.beacon run lint` | 120秒；Beacon strict lint |
| V06 | `npm run typecheck-client` | 120秒；workbench版本桥 |
| V07 | `npm run transpile-client` | 120秒；无watch时为原生测试产生最新out，不能替类型检查 |
| V08 | `.\scripts\test.bat --run src/vs/workbench/contrib/becoder/test/electron-browser/beaconProductInfo.test.ts` | 120秒；Electron版本桥测试 |
| V09 | `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconRecords.test.ts --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts` | 120秒；既有采集／队列保护 |
| V10 | `npm run valid-layers-check` | 300秒；完整分层，保已知较长运行时间 |
| V11 | `node node_modules/eslint/bin/eslint.js src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts src/vs/workbench/contrib/becoder/test/electron-browser/beaconProductInfo.test.ts` | 120秒；原生变更文件，只有实际已存在普通文件可传入 |
| V12 | `npm run compile-oi-extensions` | 120秒；最终OI统一构建 |
| V13 | `pwsh -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1 -RepositoryRoot .` | 60秒；结构检查，另查变更Markdown链接／JSON／141需求ID |
| V14 | `git -c core.safecrlf=false diff --check` | 60秒；差异空白，新增文件另查 |
| V15 | `npm run gulp vscode-win32-x64-min` | 300秒；最终标准stage |
| V16 | `node extensions/becoder.beacon/test/verify-product-info.mts --app ../VSCode-win32-x64` | 60秒；新增本专项资源验证器 |

云评测命令形式（均为Task 1新增入口；下面以2026-11-25的新批次为例）：

```powershell
node extensions/becoder.beacon/dist-test/context-quality-evaluation.cjs freeze --out tmp/beacon-prompt-quality/2026-11-25/baseline-runtime
node extensions/becoder.beacon/dist-test/context-quality-evaluation.cjs fixtures --suite all --out tmp/beacon-prompt-quality/2026-11-25/fixtures
node extensions/becoder.beacon/dist-test/context-quality-evaluation.cjs run --arm baseline --suite dev --runs 2 --runtime tmp/beacon-prompt-quality/2026-11-25/baseline-runtime/runtime.cjs --config tmp/beacon-prompt-eval/private-cloud-test.json --out tmp/beacon-prompt-quality/2026-11-25/baseline-dev
```

候选freeze使用`candidate-v1-runtime`；run中arm=candidate、runtime及out同步换为该版路径。修订为v2／v3，分别有独立runtime／dev目录。最终两臂suite=holdout，各写baseline-holdout和candidate-final-holdout。每次freeze哈希后固定，holdout只能使用已冻结最终候选。

执行前建立`.superpowers/sdd/2026-11-25-beacon-prompt-quality/validation-plan.json`和`checks.jsonl`，记录确切cwd、命令、输入、依赖、外部期限、预期副作用、退出码、输出及失败层级；调度器用子进程外部超时并终止所属进程树，不能靠npm内部timeout。复用既有runner时去除其历史标签、机器路径和工具链副作用，不盲跑旧脚本。

V08先核`.build/electron/BeCoder.exe`版本及test runner；不用Node或test-browser-no-install代替该Electron用例。V01／V06／V12的120秒和V15的300秒不因慢机静默放宽。依赖或入口缺失属于编排问题，正式validator开始后的源码失败才属源码结果。云批次不设低于其逐轮期限的短总超时；每轮180秒与生产恢复边界保持。

## 覆盖核对与执行交接

| 设计章节 | 本计划落点 |
| --- | --- |
| §1–2范围／决定 | Global Constraints、Review Focus及所有任务 |
| §3导师核心 | Task 3及真实出站测试 |
| §4工具用途／参数 | Task 2新工具、Task 3现有工具 |
| §5主题／版本／权限／资源 | Task 2、Task 3、V08／V16及产品场景 |
| §6模块接线 | 文件分工及Tasks 1–3 |
| §7模型对照／停止／审阅 | Task 4、源码门槛与Task 5交付 |
| §8当前与后续分开 | Task 5文档、现行九工具在实施前不改写 |

负责人已选择Native；主agent完成产品接线及有限修订，独立只读审阅者复核，最终教学与真实使用体验仍由负责人把关。Tasks 1–5的工程步骤已完成；夹具修正、失败、有效分母及模型瓶颈详见能力报告，checkbox不表示模型质量全部通过。

## 执行结果（2026-11-25）

Native实施与本计划工程步骤完成，最终生产提示2026-11-25.3及七主题均英文。279项Beacon回归、原生版本桥2项、基础设施51项、strict lint、类型、OI统一编译及完整分层通过。完整标准stage使用校验过的本机Electron归档在161.63秒退出0；第一次默认下载503失败保留，专项资源验证通过。当前工作区未commit／push，未做Setup／GUI。

最终公平模型对照各80回合完成；夹具修正保原证据并作成对补测。产品知识和规范题号有改善，教学推理、过度取材与冗长仍有缺陷，整体教学质量未全面验收。checkbox表示工程步骤已执行，不表示每条模型回答正确。详见[能力报告](../../beacon/evaluation/2026-11-25-prompt-quality-report.md)与[完整原答](../../beacon/evaluation/2026-11-25-prompt-quality-samples.md)。停止继续纯提示叠加，交负责人审阅候选。
