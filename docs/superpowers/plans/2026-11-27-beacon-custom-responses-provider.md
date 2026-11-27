# Beacon Custom Responses Provider Implementation Plan

> **For agentic workers:** Use the approved conversation design below and task checkboxes. The owner explicitly authorized planning and implementation together; proceed without another approval gate. Independent write scopes may run in parallel, followed by an independent read-only integration review.

**Goal:** 在供应商菜单增加一组“自定义”连接，使用原生 Responses 协议并复用现有 Beacon 配置和对话体验。

**Architecture:** 在现有 ProviderId／Connections／Settings 流程增加 custom，独立保管其连接、密钥和模型。原生 Responses 的请求与流解析委托 AI SDK 的 OpenAI provider，Beacon 继续持有历史、工具、预算与压缩。不实现另一套聊天框架或协议解析器。

**Tech Stack:** TypeScript、React、AI SDK 7.0.111、与 provider v4 接口兼容且精确锁定的 @ai-sdk/openai、Node.js 离线测试、esbuild、Playwright 生产 Webview 渲染。

**Spec:** 2026-11-27本会话负责人已审定的范围：固定 Responses；一组自定义连接和多个模型；手动添加＋同步列表；可选密钥；HTTPS／HTTP（含公网与局域网）；服务默认推理参数。当前基线 Beacon_Next@19f715f16f5e9fc77105160fe785e67a09ba7498，应用版本2.2.0。

## Global Constraints

- 当前维护 checkout 实施，不自动创建／切换分支、提交、推送、清缓存、构建 stage／Setup 或启动 BeCoder；不调用真实模型或读取用户密钥。
- 原四家供应商的已有配置、密钥、生成参数、选中模型和请求协议保持；旧四家配置缺 custom 时只补默认 custom，其他损坏仍明确报错。
- custom 默认地址为空，必须显式保存合法 API 基础地址后才可同步、测试或发送；路径前缀由用户提供，不猜测／补写版本路径。
- custom 允许 http／https、可选密钥；空密钥不回退到环境密钥、不发占位密钥或 Authorization；有值沿用 SecretStorage，秘密不进入普通快照或日志。
- 单供应商同模型 ID 一份配置；手动添加不依赖列表服务，添加后默认启用但不自动选中聊天模型；原有明确关闭状态保持。
- 同步沿用现有候选确认／取消／版本验证／替换语义。原四家不增加手动添加入口。
- custom 不提供思考模式／强度设置，不发送推理控制参数；能力标识与工具／视觉权限仍沿现有机制。普通生成参数仅显式值覆盖默认。
- 采用本地完整历史回放，Responses 明确 store:false；不依赖 previous_response_id 或远端会话，不新增业务存储。保持原生推理续接所需的响应元数据。
- 保持九工具、三队列、三模式、业务采集、权限、压缩算法与当前提示词；连接改变只影响下一次请求。
- 中英文可见文案同步，菜单沿现有样式，中性图标不借用品牌标识。来源与许可证按实际新增依赖更新。

## Review Focus

1. 老用户没有 custom 字段时，四家设置和当前模型不能失效。
2. 关闭或更改地址／密钥与同步／测试竞态，迟到结果不得覆盖新状态。
3. 无密钥自建服务实际发出的全部请求不能含 Authorization 或环境凭据。
4. Responses 多步工具调用、推理元数据、失败及取消不得制造协议事实或重跑已完成工具。
5. 同步不可用时手动添加仍可独立完成；模型 ID 校验、重复 ID、首次启用与不自动选中同时成立。

## Task 1: 配置与宿主（独立切片）

Files: `extensions/becoder.beacon/src/connection.ts`、`modelConfiguration.ts`、`connections.ts`、`test/settings.test.ts`。

Interfaces: 新增 `ProviderId='custom'`，`providers.custom={name:'Custom',baseURL:'',model:''}`；导出 `requiresApiKey(provider: ProviderId): boolean` 统一凭据门。沿现有 saveModel 支持 custom 手动新增，无新增命令。

- [x] 先补旧四家配置缺custom、空地址、HTTP／HTTPS、空密钥、手动模型、重复ID、启用与选择、错误保存及同步／测试的回归，观察原实现失败。
- [x] 增加默认 custom 与兼容解析；只在配置层允许未配置的空地址，实际保存／网络入口严格验证。
- [x] 贯通设置、配置可用性、模型选择、测试与正式请求；自定义首次手动添加启用，尊重明确关闭；旧供应商不变。
- [x] 自定义思考设置由宿主拒绝非法覆盖，服务默认推理策略由Task 2实现。

## Task 2: 原生 Responses 适配（主代理）

Files: `extensions/becoder.beacon/src/provider.ts`、`models.ts`、`protocol.ts`、`test/models.test.ts`、共享原生流测试fixture及跨供应商矩阵、扩展 `package.json`／`package-lock.json`、`UPSTREAM.md`。

Interfaces: 保 `ProviderAdapter.createModel/listModels`、`Generate`、`ProtocolRecorder` 和普通工具合同；custom 使用 OpenAI responses model，列表沿 `${baseURL}/models`。

- [x] 查询并精确锁定兼容的 @ai-sdk/openai；检查请求构造／模型识别／无鉴权策略和原生流事件。
- [x] 先写并运行mock Responses SSE回归：正确路径、模型ID、store:false、空／非空密钥、默认推理、显式普通参数、两步工具、元数据回放、失败／取消。
- [x] 实现最小适配，禁环境鉴权回退，沿原有fetch禁止带凭据重定向；不改其他四家请求。
- [x] 确认 SDK 的模型名分支不越权改变用户能力或丢失实际参数，按明确合同配置。

## Task 3: 设置与生产界面（独立切片）

Files: `extensions/becoder.beacon/webview/{ProviderIdentity,Settings,SettingsDialogs,ApiKeyControls,App}.tsx`、必要局部CSS、`test/render.mjs`。

Interfaces: 消费Task 1的custom及凭据helper；手动新增沿saveModel／ModelForm，不改宿主协议。已有模型ID只读；新增custom模型ID可输入。

- [x] 先补custom菜单／地址／可选密钥／手动添加／重复ID／无思考控件的生产渲染回归并观察失败。
- [x] 菜单末尾新增本地化“自定义”；空地址提示，支持不经密钥向导手动添加或同步。
- [x] 复用现有模型详情和启停／取消逻辑，自定义思考参数区域省略；显示名和模型ID添加流程清晰。
- [x] 检查中英文、浅深色、宽窄布局及错误／禁用态，保存截图供负责人审阅。

## Task 4: 集成、文档、复审与交付（主代理）

- [x] 更新当前用户说明、供应商架构／需求／实现状态；计划勾选反映真实验证，保留历史报告。
- [x] 预检并冻结命令，记录精确命令、输入、退出码／超时和重跑到本计划专用忽略目录；先最小回归，再扩展类型／bundle／全套离线测试／lint／生产渲染／文档与diff检查。
- [x] 独立只读复审三个切片的集成，处理具体缺陷后重跑失效检查；主代理另作最终只读核验。
- [x] 最终报告源码状态、验证数字与限制，明确未进行真实服务问答／stage／GUI验收，不用旧stage证明新源码。

## Validation Entry Points

- `npm --prefix extensions/becoder.beacon run typecheck`
- `npm --prefix extensions/becoder.beacon run build`
- `node --test --test-name-pattern="custom|Responses" extensions/becoder.beacon/dist-test/models.test.cjs extensions/becoder.beacon/dist-test/settings.test.cjs`
- `npm --prefix extensions/becoder.beacon test`
- `npm --prefix extensions/becoder.beacon run lint`
- `node extensions/becoder.beacon/test/render.mjs`
- 本技能文档结构校验、改动文档的本地链接检查、`git diff --check`。

No stage／Setup／model API／Git publication commands are part of this plan.

## Execution Result

2026-11-27：源码实施和独立复审完成。类型检查、扩展bundle、27项定向及397项全套离线回归、strict lint、完整生产Webview渲染通过。旧依赖199包保持，新增精确锁定@ai-sdk/openai4.0.71；初选较新版本的接口类型不兼容已撤换。独立复审的失败恢复加密reasoning丢失已通过RED→GREEN修复，并复核跨来源过滤与不重跑工具。文档结构／本地链接与diff收尾检查另记验证台账。未构建stage／Setup、启动桌面、调用真实模型或执行Git发布。

## Subsequent Stage and Owner Acceptance

2026-11-27：负责人追加授权构建全新stage。`npm run typecheck-client`、`npm run compile-oi-extensions`、`npm run gulp vscode-win32-x64-min`均退出0；stage于12:17:18（Asia/Shanghai）完成，用时161.638秒，入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。构建过程未启动应用、调用真实模型或执行Setup验证。负责人随后确认“自定义服务商验收通过”，授权本地commit并发布云端；对应分支为`Beacon_Next`。工程检查与负责人验收分别记录，具体提交和远端状态以Git记录为准。
