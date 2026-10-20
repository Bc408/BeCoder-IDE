# Beacon DeepSeek 设置闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 负责人已于 2026-10-20 授权实施；使用 executing-plans 在本会话顺序执行，独立只读复审。不自动创建提交、推送或清理工作树。

**Goal:** 在 DeepSeek 上完成单连接、候选确认、服务能力同步、供应商启停与主动批量测试，并将设置页重构为已确认的 Codex 视觉及 Cherry 部分组织形式。

**Architecture:** 继续由 Connections 持有配置和 SecretStorage；把模型发现与确认持久化分开，候选仅驻宿主内存。纯配置转换和能力解析可独立测试；批量测试由窄控制器持有取消与逐模型结果；React 只维护草稿、选择和弹窗，正式请求继续捕获不可变连接快照。

**Tech Stack:** 现有 TypeScript、React 19、Vercel AI SDK 7、`@ai-sdk/deepseek` 3.0.50、Code-OSS Webview／SecretStorage、Node test、esbuild、Playwright；不新增依赖。

**Spec:** [DESIGN.md](../../../DESIGN.md)。负责人于 2026-10-20 确认书面设计并要求进入实施计划。源码核查 HEAD 为 `0953468705a3ac9a46cdbf4521d7878fe6d2970a`，分支为 `codex/BeCoder_Next`；执行前重新核查。

## Global Constraints

- “本轮新设置页仅开放 DeepSeek。”其他供应商不展示新入口，不删除已有数据或密钥。
- “每家供应商只有一组连接、一串密钥；无多实例、多密钥、轮换或池化”。
- “不维护随安装包发布的模型能力目录”；服务未声明为未知，手动修正可用，下一次获取确认覆盖修正。
- “确认后统一替换已配置模型和能力；取消不改变配置”；零选择合法，未返回／未勾选旧模型移除。
- “同一模型 ID 的生成参数保留；与新能力冲突时提示调整，不静默修改”。
- “无模型级启停开关”；供应商开关、测试和聊天选择相互独立，活动回复不受设置改动打断。
- “不引入价格、币种、缓存价格、计费档位设置”。不扩大到通用供应商框架、MCP 或其他页面重构。
- 密钥留空保留、明确移除，不将已保存明文发往 Webview；中英文、主题、键盘访问同步。
- 不改学生源码、Runner／CPH／Notebook、工作区／草稿／模式／会话隔离，不引入动作等待队列。
- 本轮计划阶段不运行构建、模型请求或 Git 写入。实施期间仅按获批范围检查和构建，不自动 package、Setup、发布或执行真实收费测试。

## Review Focus

- 服务返回空列表、字段缺失、重复 ID 或仅其他协议声明：区分合法空集合与失败，缺失能力不得猜成支持。Task 1、3 固定断言。
- 候选打开期间另一窗口更换连接／密钥或配置：过期确认不得覆盖新状态，密钥不能随候选泄露。Task 3 固定断言。
- 同步使旧思考／输出参数失效：能力保存成功、参数原值保留，发送前阻止冲突，不能被 SDK 静默省略。Task 2、4 固定断言。
- 测试等待期间取消、关页、重复点击或聊天开始：取消能打断当前请求，不排入下一次动作，迟到结果不复活已释放状态。Task 5、6 固定断言。
- 隐藏供应商及旧 disabled 模型、超长名称、浅色窄窗口：不丢旧数据，不误用隐藏供应商，不溢出，不把能力和操作挤成竖列。Task 2、6、7 固定断言与截图。

---

## 文件地图与接口约定

所有路径相对于仓库根目录。新建文件前先读同所有权区域至少两份相邻文件，遵循版权、import、命名和测试约定。以下接口为本计划的实现约定，不表示已有源码。

| 文件 | 责任 |
| --- | --- |
| 修改 `extensions/becoder.beacon/src/models.ts` | 能力类型、服务值／修正合成，删除本地目录 |
| 新建 `extensions/becoder.beacon/src/deepseekModels.ts` | DeepSeek 模型列表 schema 和字段映射，不带存储／UI |
| 修改 `extensions/becoder.beacon/src/connection.ts` | `ModelInfo.name?`、输出预算通用数值安全界限 |
| 修改 `extensions/becoder.beacon/src/modelConfiguration.ts` | 配置类型、存量读取、纯候选替换及参数问题列表 |
| 修改 `extensions/becoder.beacon/src/connections.ts` | 候选生命周期、确认保存、供应商开关和发送就绪判断 |
| 新建 `extensions/becoder.beacon/src/providerTests.ts` | 一批测试的状态、取消、单项执行，不读取聊天或文件 |
| 修改 `extensions/becoder.beacon/src/provider.ts` | DeepSeek 发现接入及最小文本测试，保持聊天 SDK 适配 |
| 修改 `extensions/becoder.beacon/src/extension.ts` | 新命令路由、设置状态发布、关页取消、聊天／测试互斥 |
| 修改 `extensions/becoder.beacon/webview/Settings.tsx` | DeepSeek 主页面、连接草稿及测试视图 |
| 新建 `extensions/becoder.beacon/webview/SettingsDialogs.tsx` | 发现／详情弹窗及小型共用焦点容器，避免引入通用组件平台 |
| 修改 `extensions/becoder.beacon/webview/App.tsx`、`webview/beacon.css` | 模型菜单与共享能力摘要、设置域样式，不改变聊天其他布局 |
| 修改 `extensions/becoder.beacon/test/{models,settings,session,attachments}.test.ts`、`test/vscodeMock.ts` | 所属解析、配置、请求及宿主接线回归 |
| 新建 `extensions/becoder.beacon/test/providerTests.test.ts` | 可取消批量测试的网络 mock 回归 |
| 修改 `extensions/becoder.beacon/test/render.mjs`、`build.mjs`、`package.json` | 新测试 bundle、npm test 清单、已有生产渲染脚本更新 |
| 修改 `extensions/becoder.beacon/l10n/bundle.l10n.zh-cn.json` | 宿主新消息翻译；Webview 继续现有 `t(en, cn)` |
| 修改 `extensions/becoder.beacon/README.md`、`docs/beacon/implementation-status.md` | 实施后更新事实和证据，不提前写完成 |

### 核心类型

```ts
// models.ts，保留现有 ModelCapabilities 字段与 ModelSettings 的结构。
type DeepSeekEffort = 'low' | 'high' | 'max';
// ModelCapabilities 新增可选 reasoningEfforts?: DeepSeekEffort[]。
// 只有存在有效声明才给列表；不填一份硬编码默认档位目录。

// modelConfiguration.ts
// ProviderConfiguration 新增 enabled?: boolean：undefined 表示尚未初始化启用选择。
// ConfiguredModel.enabled 改为可选旧字段；可读取／保留但新流程不再用作门槛。
interface ModelDiscovery {
  id: string;
  revision: number;
  provider: 'deepseek';
  models: ModelInfo[];
}
interface ParameterIssue {
  field: 'temperature' | 'topP' | 'maxOutputTokens' | 'thinking' | 'effort';
  code: 'unsupported' | 'exceeds-limit' | 'unknown-support';
}

// providerTests.ts
type ModelTestStatus = 'waiting' | 'running' | 'success' | 'failure' | 'cancelled';
interface ProviderTestSnapshot {
  id: string;
  revision: number;
  running: boolean;
  models: { id: string; status: ModelTestStatus; error?: string }[];
}
```

`ModelCapabilities.source` 新生成值只有 unknown／service／manual；旧配置中的 catalog 来源须被识别并失效，不能改名成 service 留用。旧服务声明及手动值继续可读；DeepSeek 端点变化后失效端点绑定的旧能力。思考模式／强度属于生成设置，不随能力刷新删除。

`SettingsCommand` 从当前宽对象改为带公共 `requestId`、`revision`、`provider` 的 discriminated union：`saveConnection`、`fetchModels`、`confirmModels { discoveryId, ids }`、`cancelDiscovery { discoveryId }`、`saveModel`、`removeModel`、`selectModel`、`toggleProvider { enabled }`、`testProvider`、`cancelProviderTest { testId }`。移除新流程中的 `toggleModel`。取消入口不能因 pending 标志而被一并拒绝。

`SettingsSnapshot` 增加可选 `discovery`、`providerTest`、`parameterIssues: Record<string, ParameterIssue[]>`。候选与测试快照不含密钥、服务原始错误或聊天材料。状态变化需要独立发布标识，不能仅依赖配置 revision；不为进度而假装配置已保存。

## Task 1: DeepSeek 服务模型解析与能力来源

**Files:** `src/{models,connection,provider}.ts`、新 `src/deepseekModels.ts`；测试 `test/{models,session}.test.ts`（均在 `extensions/becoder.beacon/`）。

**Interfaces:** 产生 `parseDeepSeekModels(value: unknown): ModelInfo[]` 和 `resolveCapabilities(...)` 的无目录行为；`listModels(...)` 保留调用签名，DeepSeek 分支改用新解析器。其他 provider adapter 保留，不增加新 UI 适配。

- [x] **1. 写失败测试。** `DeepSeek discovery parses explicit metadata without name inference`：构造 id 为任意别名、name 为显示名、`context_window: 1048576`、`max_output_tokens: 393216`、`input_modalities: ['text','image']`、`output_modalities: ['text']`、`effort.supported_levels: ['low','high','max']`。断言名称、容量、视觉和推理按字段取得，与 ID 无关；`resolveCapabilities('deepseek', officialURL, 'deepseek-flash')` 无声明时仍是 unknown。
- [x] **2. 增加边界断言并运行红灯。** `missing metadata and protocol-specific declarations remain unknown`：仅 `api_capabilities.anthropic_messages` 不提升当前 OpenAI-compatible 工具支持；缺省模态为 unknown，显式 `['text']` 的视觉为 unsupported。合法 `data: []` 返回空列表；null、无 data、空 ID、冲突重复 ID 拒绝；完全相同条目可去重。用检查表 V1、V2、F1 运行，记录真实失败，不复用旧 dist-test。
- [x] **3. 实现解析及移除目录。** 仅映射显式服务字段：文本输入／输出可确定聊天用途，非空合法 effort 列表可声明推理，未声明工具为 unknown。官方当前 schema 没有适用于聊天协议的工具字段时保持未知，交用户修正；不把 Anthropic 协议字段挪用。保留通用三态和安全数值界限，拒绝结构坏数据，不做型号正则兜底。`ModelInfo.name?` 随发现结果保留。
- [x] **4. 运行绿灯。** V1、V2、F1；更新过去依赖目录的请求 fixture 为显式能力，保持原图片／工具／协议回归的意义，不能删掉测试只为过关。

参考：[DeepSeek List Models](https://api-docs.deepseek.com/api/list-models/)，本计划阶段已只读核对；接口样例不证明用户账号实际返回相同内容。实施时不读取用户密钥来刷新资料。

## Task 2: 配置兼容、纯集合替换与参数问题

**Files:** `src/{modelConfiguration,models,connection}.ts`、`package.json` 默认配置、`test/{settings,models}.test.ts`、`test/vscodeMock.ts`。

**Interfaces:** 产生 `replaceDiscoveredModels(current: ProviderConfiguration, candidates: ModelInfo[], ids: string[]): ProviderConfiguration`、`modelParameterIssues(provider: ProviderId, baseURL: string, model: ConfiguredModel): ParameterIssue[]`；现有 `validateModel(...)` 在正式保存详情／发送时使用问题列表，结构解析不再等于动态可发送校验。

- [x] **1. 写集合替换红灯。** `confirmation replaces membership and capabilities but preserves generation settings`：旧 A 自定义名称、温度 0.4、输出预算 300000、thinking disabled、手动 vision；候选 A 新上限 200000 和新 B；确认 `['A']` 后保留 A 名称及所有参数，清除 overrides，用新服务能力，B 不加入，旧 Pro 移除。断言同步结构合法但 issues 包含 `maxOutputTokens/exceeds-limit`。
- [x] **2. 写存量保护红灯。** `legacy providers and disabled model records survive reading`：四家已有配置、不同密钥引用、旧 enabled false 模型均不丢；仅运行新菜单规则时忽略模型级 enabled，不偷偷丢弃旧字段。缺省 provider.enabled 保留 undefined，已有有效选择的 DeepSeek 视为可启用；隐藏供应商原选择可保留数据但不能发送／自动改选。parse 不写配置、不读旧废弃全局配置键。
- [x] **3. 实现配置转换。** 替换集合不得接受候选外 ID；首次 undefined 且确认非空变为 enabled true，显式 false 保持 false，空选择不自动切开关；删除后重加不恢复参数。旧 catalog 能力失效而非伪造来源，非 DeepSeek 数据原样保留。输出参数结构上限与通用能力数值安全界限对齐到 10000000；实际服务上限由问题列表控制，移除旧 131072 型号无关硬截断。
- [x] **4. 实现问题列表并跑绿灯。** 服务上限变化、推理未知／不支持、effort 不适用、SDK 会省略 sampling 时有具体问题；不因能力更新而删参数。V1、V2、F2 和 F1 必须通过。详情编辑造成冲突时阻止该次保存并保留草稿；同步能力造成旧参数冲突时允许配置保存，发送前阻止。

## Task 3: 宿主候选事务与供应商启停

**Files:** `src/{connections,modelConfiguration}.ts`、`test/settings.test.ts`、`test/vscodeMock.ts`。

**Interfaces:** `Connections.apply(command: SettingsCommand): Promise<void>` 保留异步入口；内部新增 `discoverModels(signal: AbortSignal): Promise<ModelDiscovery>`、`confirmModels(discoveryId: string, ids: string[]): Promise<void>`、`cancelDiscovery(discoveryId: string): void`。候选只能由当前宿主实际请求创建；Webview 不能提交可信能力值。

- [x] **1. 写无副作用发现红灯。** `discovery and cancellation never write modelConfiguration`：快照前后配置、密钥、selection 深相等；发现返回新候选并预选交 UI，取消只清候选。服务合法空列表可确认清空；401／超时／坏 JSON 均保留旧列表。
- [x] **2. 写失败／竞态红灯。** `stale or forged discovery cannot replace current settings`：打开候选后改地址、同地址换密钥、另一窗口更新 revision、伪造 discoveryId／候选外 ID、重复确认，均不能覆盖新配置。`failed confirmation preserves the previous complete document`：模拟 updateError，原数据、selection、开关不变，候选可重试；清空确认仍保留密钥。
- [x] **3. 实现候选和保存。** 候选驻 Connections 内存，一次一个；含 revision／连接绑定但网页无凭据指纹。统一调用现有 persist CAS，成功后清候选并更新 selection；取消、连接刷新、释放使旧候选失效。冻结配置写操作，重复动作直接拒绝，不延后执行。确认仅用 Task 2 的结构转换，不用动态参数校验阻止能力更新。
- [x] **4. 写启停／选择断言并实现。** `provider toggle clears selection without altering in-flight connection`：关 DeepSeek 清其当前选择，开不恢复；其他 selection 不被删除，隐藏 provider 不可用；首次非空确认启用，无自动 selection／请求。remove／confirm 后只有当前 ID 失去资格才清选择。get configured、snapshot choices、request 门槛同时生效，不能只改 UI。V1、V2、F2 跑绿灯。

## Task 4: 真实请求参数与不可变快照

**Files:** `src/{models,modelConfiguration,provider,connections}.ts`、`test/{models,settings,session}.test.ts`。

**Interfaces:** 沿用 `Connections.request(...)`、`createGenerator(...)` 和 `reasoningOptions(...)`；Task 2 问题列表为 UI 与宿主共用。`parameterPolicy(...)` 返回服务声明可用档位，不再用模型 ID 推断能力；SDK 的实际序列化规则单独处理为协议约束。

- [x] **1. 写载荷红灯。** `service limits and effort options reach the installed adapter unchanged`：393216 能作为显式预算进入 max_tokens；超新上限、未知 effort／不支持 thinking 在 fetch 前拒绝；默认参数不出现。未来 effort 超出当前 SDK 的 canonical low/high/max 时标为不支持，不能静默映射成另一个档位。
- [x] **2. 写 SDK 省略保护红灯。** 已安装 SDK 在 reasoning 默认开启时会按 ID 省略温度／Top-P；用任意别名、现有别名、显式 thinking disabled／enabled 的 mock 请求检查请求体。声明与 SDK 行为冲突时必须提示参数问题，不能显示“已应用”而实际不携带。不得导入 SDK 私有路径、修改 node_modules，或用安装内能力目录掩盖差异。
- [x] **3. 实现请求检查。** 保留现有 SDK 协议及恢复；只把明确支持且可实际编码的参数发送。effective sampling 的适配器约束可保留与其当前行为一致的最小判断，但不用于给模型贴能力标签；以请求体测试锁定它。旧 model settings 思考／effort 在刷新后仍保存，失效时指出对应字段。
- [x] **4. 回归快照。** 捕获请求后关供应商／清模型／换密钥／同步能力，旧请求继续用旧地址、密钥、参数和能力；下一次 request 被新门槛拒绝或使用新状态。图片／工具未知时不注册工具／不发送图像，无新的聊天历史或材料路径。V1、V2、F1、F2、F3 通过。

## Task 5: 可取消的供应商批量测试

**Files:** 新 `src/providerTests.ts`、新 `test/providerTests.test.ts`；修改 `src/{provider,connections,modelConfiguration,extension}.ts`、`build.mjs`、`package.json`、宿主翻译。

**Interfaces:** `testModelConnection(connection: Connection, signal: AbortSignal, request?: typeof fetch): Promise<void>`；`ProviderTests` 构造接收单项 `probe` 和 `changed`，提供 `start(connections: readonly Connection[], revision: number): Promise<void>`、`cancel(id: string): void`、`snapshot: ProviderTestSnapshot | undefined`、`dispose(): void`。控制器只持有本次调用快照，不直接读配置／历史。

- [x] **1. 接入测试构建并写红灯。** `build.mjs` 按相邻 test bundle 增加该文件，`npm test` 增加 dist-test/providerTests.test.cjs。`batch tests only configured models and preserves partial outcomes`：A 成功、B 401、C 成功，顺序及逐项状态正确，总结果非全成功；未添加模型不调用，selection、enabled 和历史未变化。
- [x] **2. 写取消／隔离红灯。** 延迟首项时取消，当前 signal 被 abort，后续未启动项标 cancelled；重复 start 立即拒绝，dispose 后回调不发布旧状态。捕获的请求体仅固定短文本，无 system prompt、工具、文件、附件、聊天消息、温度、用户预算或 capability overrides。错误结果不得包含伪造的 API key／原始服务正文。
- [x] **3. 实现最小文本探测。** 使用现有 DeepSeek SDK `streamText`，`maxRetries: 0`，每项 30 秒总时限；固定消息 `Reply with OK.`，无用户上下文；获得非空正文即算连通并终止该流。空正文结束／仅推理不能算正文成功。测试使用模型默认参数，不因用户参数冲突而偷偷修改配置；明确其不验证自定义参数或高级能力。关闭供应商仍可测试，无密钥／无模型直接说明。
- [x] **4. 实现批次生命周期。** 一个批次内串行调用，取消直接作用于当前控制器，不经普通 pending 拦截；不自动重试模型或整批。extension 在启动前和发送前双向检查测试／聊天冲突，谁先开始谁持有活动状态，后来的动作直接拒绝，草稿保留，不停止既有任务。设置页关闭只取消测试／候选，不停聊天；宿主退出统一 dispose。
- [x] **5. 接线并跑绿灯。** settingsSnapshot 的 stamp 含测试状态标识／候选标识，progress 每项可见；command 的 requestId 与 batch id 分离，取消不会等待 start 完成才处理。配置变化使旧结果失效，不通过 enabled 或 keyConfigured 表示连接成功。V1、V2、F2、F4，以及已有 attachments 宿主回归通过。

## Task 6: 设置主页面、候选／详情弹窗和聊天菜单

**Files:** `webview/{Settings,App}.tsx`、新 `webview/SettingsDialogs.tsx`、`webview/beacon.css`、`src/extension.ts`、`test/{render.mjs,attachments.test.ts}`。

**Interfaces:** `SettingsDialogs.tsx` 导出 `ModelDiscoveryDialog({ discovery, configuredIds, pending, confirm, cancel })` 和 `ModelDetailsDialog({ provider, baseURL, model, issues, pending, save, cancel })`；回调只提交 ID 集合或编辑草稿，不提交可信 discovered。`Settings` 保留 `post(message)` 入口，使用 Task 3／5 的宿主快照；聊天 `ModelPicker` 只消费宿主 choices。

- [x] **1. 更新生产渲染 fixture 并跑红灯。** 把旧多供应商导航／模型开关／内联 form 断言替换为已确认流程，保留聊天其余测试。候选预选旧 A、新 B 不选，过滤 B 后全选不丢隐藏 A；取消不提交写命令；空选择确认文案明确。保存失败保留地址／模型草稿；选择菜单与供应商开关状态一致。
- [x] **2. 实现主页面。** 只呈现 DeepSeek，无空白侧导航；标题旁为测试和供应商开关；连接整体分组、保存／取消、已保存密钥状态和明确移除。未保存连接时锁获取／测试并提示，明文密钥只存在当前输入草稿，成功保存即清空。不提供模型级开关、模型行测试或点击名字即切聊天模型。
- [x] **3. 实现两类弹窗。** 候选搜索、过滤结果全选、计数和差异摘要、零候选、加载／错误、取消／确认；详情 ID 只读、名称、能力来源／三态、收起的手动修正、生成参数保存／取消。只修正用户显式改动字段；切思考模式不偷偷删采样参数，有冲突则保留并提示。关闭未提交弹窗不发送保存。
- [x] **4. 实现视觉及访问性。** settings 域 CSS 遵守 DESIGN.md 的列分配、尺寸起点、语义 token、圆形图标命中和角色形状；其他聊天 CSS 不被误改。弹窗焦点限制、Esc、归还入口、滚动正文和固定操作；处理中取消按钮仍可用。测试提示明确数量和额度事实，不增价格表或额外确认向导。
- [x] **5. 补运行接线回归。** 在 attachments.test.ts 用真实 mock host 消息覆盖 settings panel dispose、迟到候选／测试结果、测试期间发送被拒且保留草稿、活动回复时测试被拒、关供应商后继续／重答不绕过选择。webview 本地 flag 不能替代宿主拒绝。V1、V2、F5 和 V3、V4、R1 通过。

## Task 7: 最终验证、视觉迭代与事实文档

**Files:** `test/render.mjs`、`README.md`（扩展）、`docs/beacon/implementation-status.md`；其他文件只修复本计划内具体发现。

**Interfaces:** 产出验证台账 `tmp/beacon-deepseek-settings/validation.md`、对应原始日志及截图清单；不是产品文件、不是提交对象。台账每行包括命令、cwd、输入、退出码、失败分类、失效检查及重跑。

- [x] **1. 完成完整扩展回归。** 最终 V1、V2、V3、V4、R1、V5 全部对应最后源码，新增测试必须加入 build 和 npm test。失败先记录 source／orchestration／external 分类，修复后最小复跑再恢复检查；不能带红灯构建。
- [x] **2. 检查实际截图并迭代。** 生产 bundle 的 1440、900、620、360 px，浅／深色，中英文至少各一次；覆盖长 ID／名称、无模型、无匹配、候选／详情滚动、零选择、手动修正、参数冲突、测试中／部分失败／取消。检查无横向溢出、操作不遮挡、能力不竖排、键盘焦点和按钮／说明对比度。测试断言过不代替亲自看图；修改后仅重跑受影响检查。
- [x] **3. 最终只读审查。** 逐条对照 DESIGN.md 的决定和验收场景，复核无目录能力兜底、SDK 实际 payload、SecretStorage、stale／dispose／取消、旧供应商数据、无动作队列及对话／权限边界。发现具体问题则修复、复跑对应测试和最终必要矩阵，不扩大重构。
- [x] **4. 执行最终应用检查。** C1 → C2 → C3，分别 120／120／300 秒外部时限；直接保留生成物，不清缓存或产物。此计划不含包校验、Setup、安装或 GUI 自动化。若负责人后续明确要求隔离产品 GUI／真实账号验收，再按该授权进行，不从本条推断许可。
- [x] **5. 更新事实与交付。** 扩展 README 写当前真实行为，implementation-status 记录最终源码／构建／渲染证据，未执行真实模型旅程明确列出。旧文档历史证据不改写。本轮停止于 staged 应用交付和负责人验收边界；不自动 commit、push、PR、package 或 Setup。

## 校验命令、预检及运行顺序

本表是实施时的冻结候选清单，不代表计划阶段已执行。执行前再次核对脚本、模块、输入和浏览器依赖；新增测试编译产物仅由 build 生成，不手工编辑 dist／dist-test。watch 存在时优先已有 watch，否则先所属 typecheck／build，再运行测试；禁止 `npm run compile`。

| ID | cwd | 精确命令 | 成功证据／时限 |
| --- | --- | --- | --- |
| V1 | 仓库根 | `npm --prefix extensions/becoder.beacon run typecheck` | exit 0；120 秒 |
| V2 | 仓库根 | `npm --prefix extensions/becoder.beacon run build` | 生产 host／UI／worker 和测试 bundle exit 0；120 秒 |
| F1 | 扩展目录 | `node --test dist-test/models.test.cjs dist-test/session.test.cjs` | 目标场景及既有测试通过；120 秒 |
| F2 | 扩展目录 | `node --test dist-test/settings.test.cjs` | 配置／候选／启停断言通过；120 秒 |
| F3 | 扩展目录 | `node --test dist-test/models.test.cjs dist-test/settings.test.cjs dist-test/session.test.cjs` | 请求体／快照及参数边界通过；120 秒 |
| F4 | 扩展目录 | `node --test dist-test/providerTests.test.cjs` | 批次／取消／隔离通过；先完成新增 bundle 注册；120 秒 |
| F5 | 扩展目录 | `node --test dist-test/attachments.test.cjs` | 真实扩展 mock host 消息及草稿回归通过；120 秒 |
| V3 | 仓库根 | `npm --prefix extensions/becoder.beacon run lint` | 零警告；120 秒 |
| V4 | 仓库根 | `npm run stylelint -- extensions/becoder.beacon/webview/beacon.css` | 所属 CSS 入口确实匹配并 exit 0；120 秒 |
| R1 | 仓库根 | `npm --prefix extensions/becoder.beacon run test-render` | 生产 Webview Playwright 场景通过且人工看图；120 秒 |
| V5 | 仓库根 | `npm --prefix extensions/becoder.beacon test` | 全部扩展测试含新增项通过；120 秒 |
| C1 | 仓库根 | `npm run typecheck-client` | exit 0；120 秒 |
| C2 | 仓库根 | `npm run compile-oi-extensions` | exit 0；120 秒 |
| C3 | 仓库根 | `npm run gulp vscode-win32-x64-min` | exit 0；300 秒 |
| D1 | 仓库根 | `git diff --check` | exit 0；新增未跟踪文件另做空白／链接检查 |
| D2 | 仓库根 | `pwsh -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1 -RepositoryRoot .` | 文档结构通过；执行时解析现有 pwsh 的绝对路径 |

已只读确认：根目录 scripts、扩展 scripts、tsc6、ESLint、gulp、esbuild、AI SDK、Oniguruma WASM 和仓库根 Playwright 模块存在。扩展目录没有独立 playwright，现有 Node 模块解析可使用根模块；不误判为需要安装。浏览器二进制、实际应用构建入口和执行时文件状态仍须正式运行前预检；缺失依赖属于 orchestration，不能报告为源码结果或自动安装。

超时由外部 runner 控制；长命令用可轮询会话并在相应截止时终止，不能把 yield_time 当作超时。记录失败尝试后修复最小受影响层，不以旧 bundle 或旧 staged 目录冒充新验证。这里不预先要求原生层测试／分层全量检查，因为本计划不改原生层；若实际变更跨界，先报告范围并修订计划。

## 实施方式、检查点和交付

依赖顺序：Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7。Task 1/2 的接口与 Task 3/5/6 紧密相关，不同时写 Connections 或 Settings。每个任务以回归结果形成可审查检查点，不以 Git commit 作为自动步骤；Git 写入仅在负责人明确要求时执行。

建议 Native：主代理按 executing-plans 顺序实施，完成后一次独立只读复审；共享配置与消息接口较多，这样上下文连续、减少交接。也可选择 subagent-driven-development 按任务实现／复审，但仍一处代码只允许一个写入者。负责人已确认实施，执行方式采用本会话顺序实现并进行一次独立只读复审；结果见本机验证台账。

正式实施前读取 AGENTS.md、VISION.md、DESIGN.md、本文和最新源码／工作树；保留已有文档变更，不新建备份提交。若隔离工作树成为实际需要，先用 using-git-worktrees 按应用工具检查可复用工作树，并确保本轮未提交设计进入正确上下文，不能丢掉设计或覆盖当前工作树。

计划已获准实施，任务状态按本机验证台账更新。最终交付应明确：完成的行为、验证命令与失败重跑、截图位置、staged 产物位置、真实模型与负责人验收的未完成项；不把计划打勾当作产品证据。

## 本轮执行结果

2026-10-20 本会话顺序实施并由 settings_review 独立只读复审。171/171 Node 回归、所属类型／bundle／lint／CSS、生产 Webview 渲染、客户端类型检查、OI 编译及最终 staged 构建通过。文档结构、链接及空白检查通过。截图已查看；无真实账号或收费调用、桌面 GUI、package／Setup、Git 写入。具体失败和重跑见本机 tmp/beacon-deepseek-settings/validation.md。设计中的产品验收仍由负责人完成，不因任务步骤完成而标记验收通过。
