# Beacon Prompt Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Beacon 在完整会话上下文上稳定使用导师规则，正确解释当前代码与旧验证，并尊重用户的教学要求与最新纠正。

**Architecture:** 复用现有请求、会话协议和受控材料入口，新增一个应用自有提示装配模块。生成器从实际注册工具构造能力说明，保持用户原话和工具材料的原角色。先完成装配回归和本机模型对照，再为后续压缩保留基线；本计划不实现压缩或工作区记忆。

**Tech Stack:** 现有 TypeScript、AI SDK、Node test、esbuild、四家 provider 适配器及本机 Ollama；不新增生产依赖。

**Spec:** [Beacon 统一请求、提示词与上下文设计](../specs/2026-11-21-beacon-prompt-context-design.md)。行为夹具与人工判断以[评估案例](../../beacon/prompt-evaluation.md)为准。

状态：2026-11-22，首轮实现及工程检查、staged 构建完成。源码基线为 `Beacon_Next` / `e701f9c0` 加本会话未提交上下文与提示候选，不能丢弃该 diff 或把它描述为已验收版本。Task 0–3 完成；Task 4 已执行本地各 30 次、负责人另批 DeepSeek 三场景共 18 次及追加 P07 预算对照 6 次，教学质量门槛未达成，负责人体验验收待进行。执行与全部失败保留在本地 `tmp/beacon-prompt-eval/20261121-implementation-01/validation.md`，结论见[首轮报告](../../beacon/prompt-evaluation-2026-11-21.md)。旧提示执行包先冻结，其运行与候选开发重叠，实际出站检查未混入新核心；该时序调整及证据见报告。

## Global Constraints

- 导师核心始终进入有效请求，独立于联网、工具支持和 NoteBook；同一原始会话中不反复追加系统提示全文。
- 首轮只利用用户原话和既有工具协议理解教学要求，不建偏好数据库、意图分类器或每轮提取/审查模型。
- 用户消息保留 user 角色，页面/题面/附件/工具结果不升级为开发者指令或新许可。
- 宿主根、档位、会话、敏感过滤与版本校验保持；不新增个人信息查询许可台账或审批门。
- 不让 Beacon 运行/停止程序、Shell、登录/交题或修改学生源码；NoteBook 保留显式请求与原生备份/保存规则。
- 首轮不启用自动压缩、硬容量新策略、跨会话记忆、额外 OJ 历史或新 UI。
- 模型评估仅用合成材料；原批次固定回环 Ollama，不读取日常密钥/会话，不自动下载模型或改变用户设置。负责人 2026-11-22 另行提供本机私有配置并批准 P01/P02/P07 的 DeepSeek 旧/新各三次（18 场景、最多 72 实际请求）；之后明确允许追加 P07 旧/新各三次预算对照（双方 8192、默认思考、最多 12 实际请求）。各组单独留证，不扩大其他付费采样。
- 不清缓存、替换日常数据、自动 commit/push、构建 Setup 或发布 Release。Git 操作需要负责人另行明确授权。

## Review Focus

1. 联网关闭、工具不支持、无 ContextAccess 时仍有导师核心；不存在的工具说明不能误导模型。对应 Task 2/3。
2. 多步工具与运输恢复不重复 system、不改变模型配置快照、不重放已完成副作用。对应 Task 3。
3. 当前稿 V2、旧稿 V1 的结果、缺失页面及恶意材料分别保留真实身份，不能靠提示掩盖输入缺失。对应 Task 0/3/4。
4. “仅提示”改为“完整代码”、题 A 的局部要求与题 B 的新要求能正确接续，重答/编辑时不带入被删除的后缀。对应 Task 3/4。
5. 评估运行的取消、模型工具能力缺失和版本不一致如实失败，不偷偷粘贴正文、回退云端或把字串断言当教学质量。对应 Task 1/4。

## Task 0: 确认上下文候选可作为提示优化的输入

**Files:** 只读 `extensions/becoder.beacon/src/{extension,context,contextTools,session,protocol}.ts`，`extensions/becoder.oj-connect/src/beaconPages.ts`、`src/views/{problemPanel,recordPanel}.ts`，以及 `src/vs/platform/beacon/common/{beaconContextTypes,beaconPages}.ts` 与工作台 `beaconPages.ts`。证据记到执行时新建的忽略目录 `tmp/beacon-prompt-eval/<run-id>/validation.md`。

**Interfaces:** 沿用现有 `ContextAccess.describe/execute`、`ContextInput` 的 page/record/material 操作以及既有 `createGenerator`。本任务不发明替代 OJ 协议或新的对象存储。

- [x] 读取当前 Git 状态及上述完整 diff，记录 HEAD 和本次 source diff 的 SHA256；确认两个相邻源码/测试的版权头、import 和断言风格。当前工作区作为前置候选保留，不新建遗漏未提交修改的 checkout。
- [x] 核对当前对象、临时指定/固定、页面关闭与版本变化、源码绑定、同文件多题和已打开 OJ 面板的只读性；逐项确认元数据不被误当正文，旧判词不绑定新稿。重答/继续的现行对象语义须与统一设计一致，不能仅看新发送路径。
- [x] 核对全部调用都在真实工具 owner 处执行 scope/版本检查；快照只能在本会话回读；Blackout 不新增工作区读取；当前候选不触发站点查询/提交。
- [x] 依验证表预检后，运行当前 client、Beacon 与 OJ 类型及所属回归。发现必要的上下文缺口时记录所属文件、影响案例和最小修正范围；由同一候选的上下文收尾处理并重验后再建立基线，不把更换提示当作宿主修复。

该任务是输入准备门槛，不代表整体验收，也不要求现在一次补齐额外 OJ 历史、图片或其他后续能力。

## Task 1: 建立固定案例、回环评估 runner 和旧提示基线

**Files:** 新建 `extensions/becoder.beacon/test/promptEvaluation.ts`、`test/promptEvaluation.test.ts`、`test/prompt-evaluation.ts` 和 `test/fixtures/prompt-cases.json`；修改该扩展 `build.mjs`、`package.json` 的测试清单。不加入生产入口或打包配置的消费者。

**Interfaces:**

```ts
interface PromptEvaluationCase {
	id: string; // P01–P10，唯一
	history?: Pick<Snapshot, 'messages' | 'error'>; // 仅初始合成历史，无 system 覆盖
	turns: readonly PromptEvaluationTurn[];
}
interface PromptEvaluationTurn {
	text: string; // 本轮真实发送的合成用户原话
	context?: { overview: ContextOutput; pages: readonly ContextOutput[] };
	criteria: readonly string[];
}
interface PromptEvaluationTurnResult {
	index: number; // 从 1 开始，对应 turns 顺序
	status: 'complete' | 'error' | 'cancelled' | 'unsupported' | 'not-run';
	text: string;
	protocol: readonly ProtocolTurn[];
	durationMs: number;
	requestCount: number;
	toolCalls: readonly { callId: string; name: string; input: unknown; output: unknown }[];
}
interface PromptEvaluationAttempt {
	caseId: string;
	repetition: number;
	status: 'complete' | 'error' | 'cancelled' | 'unsupported';
	turns: readonly PromptEvaluationTurnResult[];
	durationMs: number;
	requestCount: number;
}
function readPromptCases(value: unknown): readonly PromptEvaluationCase[];
```

以上评估类型仅用于合成夹具与 runner；`Snapshot`、`ProtocolTurn`、`ContextOutput` 从现有 owner 导入，不建生产协议副本。每次场景尝试新建一个 `ChatSession`，必要时 `restore(structuredClone(history))`，随后按 `turns` 顺序分别调用 `send()`，每轮完成后才进入下一轮，继承实际生成的回答和工具协议。不得预填待测轮的 assistant 回答或一次提交全部待测用户消息。按轮生成新的 context/generator 以捕获文件切换，交互工具由进程内夹具返回，不触碰真实文件、账号或执行器。

- [x] 按 P01–P10 写完整夹具、分轮原话、可读元数据和逐轮判断点；先为 parser/runner 写 `rejects cloud or credential endpoints before sending`、`counts cancelled attempt without replay`、`does not fabricate tool coverage for a tool-less model`、`keeps the first generated reply and protocol when executing the second turn` 四个失败测试。endpoint 只接受规范 `http://127.0.0.1:11434/v1`，不跟随重定向，不接任意 cloud URL/headers。
- [x] 在 `build.mjs` 为两个测试 entry 新增 `dist-test/promptEvaluation.test.cjs` 和 `dist-test/prompt-evaluation.cjs`，`package.json` 的 `test` 加前者；类型/构建完成后运行聚焦用例，看见行为断言的预期 red，不把找不到模块当作预期失败。
- [x] 实现 parser 和测试专用 runner。CLI 固定为 `--phase baseline|candidate --model qwen3.5:4b --runs 3 --out <本次目录>`；输出目录必须新建且拒绝覆盖未知文件。通过现有 generator 获取响应，测试 fetch 包装器按轮记录合成请求、响应和实际 usage（若有），不读取产品 SecretStorage。某轮失败/取消就停止该场景余下轮次，记录为 `not-run`，不能算整场完成；场景请求数与耗时由实际逐轮数据汇总。
- [x] P01/P02/P08 通过合成 ContextAccess 的工具交换检查取材。P09 的伪造指令保留在页面/工具结果正文；P10 单独启用已有 browseWeb，将 `createGenerator` 的 `webRequest` 注入为进程内固定响应及调用计数；只有 provider 的模型 fetch 可发回环请求，测试“联网”不发真实请求。采样参数与期限遵循评估案例；复用同一请求取消，不增加隐式重试。
- [x] 先跑无网络的 runner 单元测试。仅检测 `/api/tags`、`/api/show` 和回环 `/v1` 的实际可用性，记录 Ollama 版本、模型 digest、工具能力及采样参数。缺模型/能力时明确阻断相关场景，不下载、不改设备配置。
- [x] 在改动产品提示之前执行 baseline 的 30 次场景尝试。记录输入夹具哈希、源码状态、实际出站规则摘要标识、回答、工具、耗时及可得 usage；按评估表人工读结果。若中途取消，保留所有尝试并明确未覆盖槽位。

## Task 2: 统一核心与条件规则的纯装配接口

**Files:** 新建 `extensions/becoder.beacon/src/prompts.ts` 与 `test/prompts.test.ts`；修改 `build.mjs` 和 `package.json` 的对应测试 entry。

**Interfaces:**

```ts
type BeaconToolName = 'inspectContext' | 'inspectFiles' | 'browseWeb' | 'editNotebook';
interface BeaconPromptInput {
	currentTime: string; // 本轮捕获的 ISO 时间，不在装配内部读钟
	toolNames: readonly BeaconToolName[]; // 来自本次实际 tools 对象
	contextDescription?: string; // 宿主目录元数据；不接受用户或网页配置 system
}
interface BeaconPrompt {
	version: string;
	system: string;
	sections: readonly { id: 'core' | 'evidence' | 'capabilities' | 'context'; source: 'application' | 'host' }[];
}
function composeBeaconPrompt(input: BeaconPromptInput): BeaconPrompt;
```

纯装配不调用模型、文件、网络或时钟，不修改调用者数组。`sections` 只供装配测试与合成评估审计，不记录用户正文，不作为给服务商的私有字段，不新建产品调试页面。

- [x] 在已有 provider 出站测试中先断言联网关闭且工具关闭仍含导师定位，观察旧实现的预期 red。随后写纯装配测试：工具集合为空时 core 存在、无 editNotebook/browseWeb 操作说明；各集合只含相应说明；同输入输出确定、传入数组不变。纯模块首次导入前可有最小可编译签名；预期 red 必须来自缺失行为。
- [x] 实现版本 `2026-11-21.1` 的原创规则。core 包含教学定位、正常学习可完整解法、最新用户要求与适用范围、纠错最小修改、真正代码变化核对、跳过已会内容、对实际验证诚实，以及产品已确认边界；用短小连贯正文，不固定对话格式、问答测验或回复句数。
- [x] evidence 规则说明当前稿与运行/提交版本、源码比较口径、材料覆盖/缺失/截断、按需取材与指令来源。它不内嵌全部材料，不声称哈希证明正确，不把外部指令视为用户授权。
- [x] 条件能力规则沿用现有联网许可/引用、NoteBook 显式请求/备份/保存/失败语义，将必要行为指导移到对应工具层。若提供 contextDescription 却没有 inspectContext，明确仅给元数据，不能声称读过正文；缺工具只请求最少材料，不自动切模型/OCR。
- [x] 将 `prompts.test.ts` 加入构建及完整测试清单，运行纯装配和 provider 目标回归。检查规则没有导入用户历史或提供可任意覆盖核心的入口。

## Task 3: 接入真实请求并保持会话与工具协议

**Files:** 修改 `extensions/becoder.beacon/src/provider.ts`、`src/contextTools.ts` 和 `test/{context,session,web,attachments,requestRecovery}.test.ts` 的受影响用例；仅必要时修改 `src/session.ts` 的接点，不改其持久格式与用户角色。`connections.ts` 的请求快照语义保持。

**Interfaces:** 保留 `createGenerator(...)`、`ContextAccess.describe/execute` 和 `ChatSession` 公开接口。每个请求先完成工具对象构造，然后用其真实 keys 调用 Task 2 的 `composeBeaconPrompt`；不得分别写另一套能力布尔判断来拼说明。`describe()` 返回来源/版本/目录及覆盖元数据，将通用行为规则由 prompts owner 维护。

- [x] 增加出站矩阵：四家 provider × 联网开关 × 工具支持，分别验证 core、注册集合、可选说明和能力降级。测试 `testModelConnection` 仍只发 `Reply with OK.`、无聊天/教学/工具材料，不走正式会话提示入口。
- [x] 增加真实 SDK 的模拟工具续轮断言：单请求 core 不重复累加；历史中已完成的工具结果进入上下文时不会重新执行该调用，运输恢复和暂停继续不重放已完成写入。新问题按需重新读取最新页面版本仍允许。保持 180000ms 总期限、现有重试分类、用户取消与错误正文过滤。
- [x] 增加用户原话更新和旧消息编辑/重答测试：完整原角色及工具调用 ID 关系保持，删除后缀不进入新请求；换服务继续使用现有 `replayProtocol` 过滤，不将其他服务的 reasoning/signature 转普通正文。
- [x] 接入统一入口，删除 `provider.ts` 的同职责内联 system 文本，缩减 `describe()` 的重复通用规则。必要工具 description/schema 保持现有协议细节，不能为了缩短而移除写入条件或错误恢复含义。
- [x] 使用现有上下文用例补齐 P01/P02/P08 的请求与取材断言；保留材料快照、页面 version、运行 revision、Blackout 隔离与 OJ 来源身份。为 P09/P10 构造恶意正文和撤销原话，固定测试仅证明编码与实际参数/调用，真实服从性留 Task 4。
- [x] 跑聚焦回归直到通过，再执行完整 Beacon 类型、构建、测试与 lint。若动到 OJ 或原生 owner 的修补，则分别补其回归，不只运行 Beacon 测试。

## Task 4: 对照评估、只读复核与交付

**Files:** 使用 Task 1 的 runner 和夹具；新建 `docs/beacon/prompt-evaluation-2026-11-21.md`（实际执行跨日则用实际日期，不预建空报告）；按最终事实更新扩展中英文 README、`docs/beacon/implementation-status.md` 与必要来源登记。

**Interfaces:** candidate 使用同一 fixture、model digest、能力与参数；只允许提示版本和已批准的装配实现变化。评估记录遵循[案例与完成定义](../../beacon/prompt-evaluation.md)，模型输出是观察数据，人读并按场景评议。

- [x] 用统一后的真实 generator 执行 candidate 的 30 次场景尝试。保留失败、取消和用量未知；digest/服务版本变化时另开分组，不能混作同条件对照。
- [ ] 逐例比较 baseline/candidate：P01/P02/P08/P09/P10 的 15 次候选场景无关键失败；其余 15 次符合明确要求。核对实际循环、变量和数学，不只检查出现“待验证”字样。对照无退化且改善至少一个实存问题；基线全好时只报防退化。未达成则针对具体失败调整提示并保留全部轮次，不能无限补采成功样本。
- [x] 主代理独立作最后语义复核，必要时用只读 reviewer 检查规则完整性、条件工具、源身份和评估结论；具体发现修正后重验受影响层。报告区分静态断言、模型行为和真实产品验收。
- [x] 将合成对照结论和实际证据根写入正式评估报告，README 只写最终实现行为，状态文档保留未完成项。保留实际 diff 和未验收事实，不把压缩、记忆或额外 OJ 适配标为交付。
- [x] 按下表完成最终必需序列后生成一次 staged Windows 应用交给负责人。若目标 `../VSCode-win32-x64` 存在用户数据或运行实例，先依据构建所有者与文件安全流程保护现存资产；不能直接重建并删除该树，也不能悄悄改变产品默认目录。
- [ ] 负责人在当前产品做短句换题、原结构纠错、原理追问、请求变化与旧稿判词验收。没有该结果时停在“候选已验证、等待体验验收”；不构建 Setup、不自动提交发布。

## 验证命令与证据纪律

下列命令是执行时的冻结候选清单；新增 entry 必须先由对应任务创建并预检。文档编写时仅核对现有脚本和路径，不运行产品验证。每轮将精确 cwd、命令、输入、外部 timeout、exit、失败类别和重跑关系记入 `tmp/beacon-prompt-eval/<run-id>/validation.md`。

| 检查 | 从仓库根执行的入口 | 外部上限与边界 |
| --- | --- | --- |
| Beacon 类型与构建 | `npm --prefix extensions/becoder.beacon run vscode:prepublish` | 类型、构建各按 120 秒控制；为测试生成当前 dist-test |
| 聚焦测试 | 例如 `node --test --test-name-pattern='turn keeps' extensions/becoder.beacon/dist-test/context.test.cjs`；新提示测试创建后使用 `node --test extensions/becoder.beacon/dist-test/prompts.test.cjs` | 120 秒；本次用例和现存文件先冻结，记录预期 TDD red |
| 完整 Beacon 回归 | `npm --prefix extensions/becoder.beacon test` | 120 秒；新测试须在 package 清单内 |
| Beacon lint | `npm --prefix extensions/becoder.beacon run lint` | 120 秒；实际普通文件及新增 entry，不能传删除项 |
| 生产 Webview | `npm --prefix extensions/becoder.beacon run test-render` | 120 秒；模拟宿主，不证明真实模型/桌面 |
| 本机对照 | `node extensions/becoder.beacon/dist-test/prompt-evaluation.cjs --phase baseline --model qwen3.5:4b --runs 3 --out tmp/beacon-prompt-eval/<run-id>/baseline`；candidate 使用同一根下 `/candidate` | 新入口在 Task 1 创建；每次生成 180000ms；长评估持续报告进展、支持取消，不在工具调用内阻塞整批 |
| OJ 所属检查 | `npm --prefix extensions/becoder.oj-connect run typecheck`、`npm --prefix extensions/becoder.oj-connect test` | 各 120 秒；Task 0 及任何影响其源码的修补后必跑 |
| 客户端类型 | `npm run typecheck-client` | 120 秒；不用 `npm run compile` |
| OI 编译 | `npm run compile-oi-extensions` | 120 秒，源码检查通过后 |
| staged 构建 | `npm run gulp vscode-win32-x64-min` | 300 秒；目标资产安全前置核对通过后，源检查 → OI → stage |
| 分层检查 | `npm run valid-layers-check` | 120 秒；仅实际修改原生层时纳入 |
| 文档结构 | `powershell -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1` | 10 秒；另查本地链接与语义 |
| 差异检查 | `git diff --check` | 10 秒；新未跟踪文档/源码另核对内容 |

本地服务不可用、缺 entry、语法错误属于相应外部/编排失败，不等于模型或源代码结果。任何非预期非零或超时先诊断并记录，修复后重跑最小受影响检查，最终证据对应最终候选。费用未知不填零；云端真实模型和账号操作需要另有实际授权。

## 自审与执行交接

统一设计第 1–2 节由 Task 0 核对现状与 owner；第 3–4 节由 Task 2/3/4 完成装配和教学回归；第 5–6 节由 Task 0/3 保留对象、权限和失败边界；第 7 节保留后续压缩接口，首轮不实现；第 8–9 节由 Task 1/4 提供评估和独立交付证据。

执行采用主代理整合提示入口与评估，子代理按独占文件范围处理输入候选修补与合成评估基础，最后独立只读复核。生产 provider 与提示接口由同一整合者维护。负责人已授权代码与本计划验证，未授权 Git 操作；完成后进入负责人体验验收。

## 2026-11-22 继续收敛教学质量

负责人明确要求继续排查失败、调整提示及工具说明、补齐强模型场景，API 费用不限制验证范围。延续已确认架构，不实现压缩、记忆、新权限或 UI。保留 `.2`/`.3` 及全部旧结果，当前候选为 `2026-11-22.4`；新证据根为本地 `tmp/beacon-prompt-eval/20261122-quality-02/`。Flash 完整三组和新追问共 96 场景、225 请求，另外 Pro 三场景诊断 9 次、12 请求，均已结束；当前全面教学质量门槛未过，实际结果见[第二轮报告](../../beacon/prompt-evaluation-2026-11-22.md)。

- [x] 冻结 `.2` 的 prompts/provider/contextTools 及已知依赖；核对失败的 OJ page 误用 runtime record、未初始化值确定性推算与 WA 过度推断。
- [x] 在四家实际出站矩阵中先验证缺失的操作/身份说明，观察预期失败；随后只强化既有 schema description、条件工具指导和证据推理规则，保持协议形状与权限不变。
- [x] 固定 P01–P10 合成夹具，`.2`/`.3` 各三次完整顺序对照；双方默认思考、8192 生成预算、每轮 180 秒，P10 只模拟网络。每阶段 30 次场景、最多 150 次实际请求，全部失败与未运行保留。能力与别名身份局限如实记录。
- [x] 完整读回答及工具协议，区分关键失败、解释错误与冗余，不以字符串存在或运输成功替代质量。基于 `.3` 失败另作 `.4` 完整 30 次复验，附加两个未见追问各三次；Pro 同提示 P05/P06/P07 各三次诊断单独留证，禁止无限补采成功样本。
- [x] 主代理及独立只读审查、受影响回归、最终 client/OI/staged 和文档检查；新 staged 前保护原候选全树及 data。不重跑不受本轮影响的层级检查，保留此前范围证据。
- [ ] 负责人在实际模型和当前产品体验验收；不得从本轮模型样本宣称全服务商保证或自动压缩已经交付。

## 2026-11-22 冻结提示后补齐 Pro 与迁移证据

负责人继续推进的授权延续。生产 `.4` 冻结，补齐 Pro 先前未覆盖七类并先冻结四个新变体，保持默认思考、8192 上限及 180 秒/轮；不改用户模型配置、不重建应用、不扩展压缩或记忆。证据根为 `tmp/beacon-prompt-eval/20261122-generalization-03/`，正式结论见[补齐及新变体报告](../../beacon/prompt-evaluation-pro-2026-11-22.md)。

- [x] P01/P02/P03/P04/P08/P09/P10 各三次，共 21 场景、60 请求；保留 P10 length 和未执行撤销轮。连同旧九次，Pro 十类已分批启动 30 次，29 次运输完成。
- [x] 新 U01–U04 各三次，原组 12 场景、55 请求。U02 结构化正文格式错误如实归因于输入，不归因于生产读取或模型完整材料理解；实际工具离线复现后独立纠正 U02 三次、12 请求，保留一次超时。没有覆盖原输入或按成功选择样本。
- [x] 逐份语义审查、独立核查关键证据、实际出站/计数/哈希/用量检查和文档验证；生产未变，仅运行受影响的评估及文档检查。
- [ ] 完整教学质量：Pro 的历史/最新混淆、解释事实错误和未完成回答仍使门槛未过；后续提示调整须围绕具体事实与未见迁移题对照，不以无限补采代替修复。
- [ ] 负责人真实产品体验验收。工程检查及已有 staged 不替代该项，压缩仍未启动。
