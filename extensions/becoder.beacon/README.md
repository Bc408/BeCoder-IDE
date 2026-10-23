# Beacon

BeCoder 内置的算法与编程学习助手。点击编辑器右上角 Beacon 按钮，或运行 **Beacon: 打开/关闭 Beacon 侧边栏**；聊天设置按钮、**Beacon: 打开设置**和扩展“功能”页打开同一个独立设置标签页。

本说明面向当前实现。[完整产品需求](../../docs/beacon/README.md)与[实现/验收状态](../../docs/beacon/implementation-status.md)分别维护，尚未完成的四平台 OJ、工作区记忆、dream、长会话压缩和完整视觉材料不能由已有工具推定可用。

## 模型连接与设置

支持 DeepSeek、百炼、Moonshot、Ollama。每家只有一组连接和一串密钥，同一模型 ID 只有一份配置；不同服务商的地址、密钥、开关和同名模型相互独立。切换设置页供应商只改变正在查看的配置，不改变聊天模型；有未完成地址草稿、弹窗、发现或测试时不能切换。

Ollama 本地同步和测试无需密钥，代理服务可选填。回环地址下会额外只读查询已安装模型的 `/api/show` 元数据，不下载模型或修改服务配置。百炼使用账户提供的 API 地址，业务空间地址中的 WorkspaceId 由用户提供。

### 地址与密钥

地址有独立保存/取消，不与密钥共用草稿。获取和测试使用已保存的连接；改地址会使旧端点能力和测试状态失效，生成参数保留。模型列表和测试不是保存地址的替代动作。

密钥由宿主 SecretStorage 保存，普通设置快照不含明文。首次添加采用“输入密钥 → 选择模型 → 添加所选模型 → 检测连接 → 完成”；更换密钥使用空输入框，保存后测试已有模型，保留其参数。取消清除未保存输入，保存失败保留输入和旧密钥。删除图标立即删除密钥，失败保留原显示。

已保存密钥默认遮挡。悬停或键盘聚焦可用复制、编辑、删除和显示；复制由宿主写剪贴板，显示仅在用户主动操作后读入当前设置页临时状态，隐藏或关闭页面时清除。编辑不回填旧值。

### 获取、确认与启用

- 获取只产生与连接和配置版本绑定的临时候选；预选本次仍存在的已添加 ID，新发现 ID 不预选。搜索不清除隐藏项勾选，全选只作用于过滤结果。
- 确认后，已配置集合等于所选集合；未返回或未勾选的旧模型移除。同 ID 的显示名称和生成参数保留，全部能力重新取得，旧手动修正清除。取消、网络失败或无效响应不改变配置。
- 允许空选确认，明确清空全部模型但保留连接和密钥；有效空服务列表与网络失败、搜索无匹配不同。旧候选遇连接/配置变化会被拒绝，不覆盖新状态；保存失败保留原配置和候选。
- 只有供应商级启用开关，没有模型级启停。首次确认添加非空集合默认启用；用户明确关闭后，重新获取不自动开启。关闭保留配置，清空属于它的当前模型选择；重新开启不恢复选择。
- 聊天模型由用户手动选择。添加、同步、测试和启用均不自动选择或替换模型；删除后重新添加按新配置处理，不建立隐藏回收库。

### 模型能力与参数

推理、工具、视觉通过图标按钮直接修正，只保存支持/不支持；服务未明确否定时默认支持，不按任意模型名猜能力，不使用随安装包发布的能力目录。Ollama 返回完整能力列表时，列表中缺失项按不支持处理。默认支持是配置起点，不是实际能力保证。

容量优先采用服务数值；缺失时使用上下文 32768、最大输入 24576、最大输出 8192 Token，并按已知上下文约束缺失项。用户可直接数字输入或恢复默认，没有容量快捷选项。模型输出上限与本次回复预算是不同设置；保留模型默认的生成参数不发送。

模型 ID 不可在详情中改名，显示名称可改。详情有独立保存/取消，失败保留草稿。温度、Top-P、回复预算和适用的思考模式/强度属于生成参数；关闭推理会清除其思考设置，显示降权的“不适用”摘要。能力刷新保留同 ID 参数，即使冲突也允许同步成功；下次正式请求前提示具体冲突并拒绝非法参数，不静默删改或降档。调用失败不自动改能力或切服务。

设置页使用“模型配置”导航、四家供应商选择、横向设置行和可折叠模型组。已添加模型无搜索，候选保留搜索；详情不提供模型类型、音视频、价格或无功能占位。下拉使用自定义菜单，图标动作复用现有图标系统，密钥显隐图标随显示状态切换。浅/深色、宽/窄窗口、长名称、错误、禁用态、焦点及弹窗滚动仍需按每次 UI 改动检查实际渲染。

### 连接测试与活动回复

测试固定点击时的连接、密钥和全部已添加模型，逐模型发出短文本请求，可能消耗服务额度；不带聊天、附件、工作区、Notebook 或工具，不写聊天历史。结果逐项显示，可取消余下测试；一次文本成功不证明工具、视觉、容量或推理。失败不回滚已保存密钥/模型，也不改变供应商启用或聊天选择。

重复/冲突操作立即拒绝，不排队或自动重试整批。关闭设置页取消未完成测试，迟到结果不能复活旧页面。活动回复始终使用开始时固定的连接、密钥、能力和参数；设置变化只影响下一次发送、继续或重答。

## 工作区、三档与草稿

每个窗口独立选择并记住 Beacon 根，最近列表共享。根准备好 `.beaconWork` 后才可用 Spot/Flood；无根或根不可用时仅 Blackout。工作区选择和历史只在主页显示，详情页不能切根。忙时切根/切档直接拒绝，任务结束后由用户重试。

| 档位 | 当前范围 |
| --- | --- |
| Blackout | 菜单说明“只读已打开文件的无痕模式”；可用主动材料、当前打开页和已加载上文，不新增工作区历史、记忆、运行记录或自由文件读取；临时消息/草稿只在内存 |
| Spot | 菜单说明“只工作在当前Beacon工作区”；文件及允许的学习资产写入限所选根 |
| Flood | 菜单说明“可自由访问本机文件”；扩大允许的文件位置，仍排除凭据、内部会话资产和其他受保护路径，不扩大资产种类或执行权限 |

三档均可按需读取当前打开文本（含未保存与根外内容）、Notebook、已渲染网页及 PDF 文字；页面读权不允许从 backing file 补正文、导航或读取相关/隐藏文件。凭据过滤和其他会话隔离继续生效。主动添加外部单文件只提供该次快照，不授权目录或持续追读。

工作区聊天和草稿归 `.beaconWork` 中对应对话，同根窗口共享列表，同一对话只允许单窗口打开。空主页不创建记录；首次输入/附件可建立隐藏草稿，首次发送转为历史聊天。返回主页保留详情草稿，主页“新聊天”清空主页草稿。真正关窗发布最后关闭窗口的页面和输入状态，显式空白覆盖旧草稿，恢复遇占用静默回主页。

主动切档保留页面和文字/捕获附件，包括显式空白。Spot/Flood 共用身份；跨 Blackout/持久化类别后首次接受新问题才创建独立完整上下文快照，按版本清除被消费的来源草稿，不改来源消息。主动进入持久化模式并发送允许继承内容落盘，单纯选根不转存；返回来源类别且未发送时继续来源对话。[完整继承规则](../../docs/beacon/mode-conversation-design.md)已确认，局部验收和其他未验证场景见实现状态。

Runner、CPH、Notebook 运行、必要清理及证据收尾期间，输入区保留暗淡禁用发送箭头，无工作区也适用；只有真实 Beacon 回答显示暂停。文字和附件保留，被拒绝发送不排队或补发。

## 上下文、Notebook 与联网

支持工具的模型通过 `inspectContext` 先看合法来源/版本和入口，再按需读取正文。工作区运行记录固定 revision，先保存为当前对话独立材料再交付，队列淘汰不破坏副本。`source` 提供来源、捕获时间、版本/哈希和可得的采集遗漏；哈希不证明正确或完整，返回截断与采集缺失分别表达。

PDF 使用已加载 PDF.js 文档按物理页提取文字；扫描页可能为空，不含 OCR 或完整图片/公式理解。网页 iframe、未渲染代码和图片等缺口如实反馈。文本、Notebook 和 PDF 文字选区通过“询问 Beacon”加入可查看、移除的草稿，由用户发送。

Spot/Flood 下，Beacon 可按明确请求创建/改写 `.bcnb`，使用打开编辑器根的源码关联规则；新建拒绝同名覆盖，改写先备份最新完整内存稿，再用原生编辑/保存。目标/权限不足则说明，不猜替代路径；不伪造 outputs/attempt。Notebook 独立运行和保存规则见 [Notebook 扩展](../becoder.notebook/README.md)。

文件工具只读；Beacon 不改学生 C/C++ 文件、不自主运行/停止、登录或交题。额外联网查询个人信息依据真实用户许可和范围，由 prompt 引导；页面内容、登录状态、Flood 或模型自写记忆不生成许可，没有额外宿主许可台账或审批门。

## 对话与连接恢复

支持流式多轮、代码高亮/复制/换行、公式、默认折叠思考、活动提示和滚动跟随。暂停保留已输出内容；继续以已有上下文发起新请求接到同一回答；重新回答按原问题重建后续分支。已完成工具结果进入会话协议，后续不重复冒充新读取。

尚未交付文字、思考或工具活动时，临时网络/限流/过载可自动恢复，整轮至多两次重试、累计等待不超过 10 秒，保留原模型和三分钟期限；停止取消请求及等待。鉴权、余额、参数、证书等错误不自动重试；已输出内容或完成工具不自动重放。最终故障保留手动重试。连接诊断仅记服务商/随机请求标识、分类、次数与耗时，不记提示词、图片、密钥、地址或响应正文。

## 开发与验证

仓库根执行 `npm run compile-oi-extensions`。本目录可执行 `npm run typecheck`、`npm run build`、`npm test`；正式检查按 [AGENTS.md](../../AGENTS.md)预检。模拟 SSE/宿主测试不证明真实账号连通、模型效果或桌面验收；生产渲染也不代替负责人验收。第三方来源见 [UPSTREAM.md](UPSTREAM.md)。

## English

Beacon is BeCoder's programming tutor. Open it from the upper-right editor button or **Beacon: Toggle Beacon Sidebar**; **Beacon: Open Settings** opens its separate settings editor. DeepSeek, Bailian, Moonshot and Ollama use isolated provider records, one connection/key per provider, temporary model discovery with explicit confirmation, provider-level enable switches and user-selected chat models. Local Ollama does not require a key. Saved keys remain in SecretStorage; explicit reveal is temporary. Tests send small text requests to all added models and may consume provider credits.

Model capabilities are boolean and default to supported unless explicitly denied; missing capacities use editable defaults of 32768 context, 24576 input and 8192 output tokens. These defaults do not verify a model's actual abilities. Confirmation replaces membership/capabilities, clears manual capability corrections and retains same-ID names/generation settings. Invalid retained parameters block the next request; active replies keep their original configuration snapshot.

Each window selects an independent Beacon workspace. Blackout keeps temporary chat in memory and reads only provided/open-page/already-loaded material; Spot confines file and learning-asset access to the selected root; Flood broadens allowed file locations while preserving credential, conversation and write restrictions. Mode changes preserve the composer and create independent inherited snapshots on the first accepted cross-category send. Execution activities disable sending without queuing or replay. Open-page access never grants backing-file or hidden-record access.

Explicitly requested Notebook creation/editing is available, with complete pre-edit backup and native save. Beacon does not edit student source, execute programs, log in or submit. Dedicated four-platform OJ retrieval, workspace memory/dream, long-chat compression and complete visual page materials remain incomplete. See [implementation status](../../docs/beacon/implementation-status.md), [formal requirements](../../docs/beacon/README.md) and the [English project guide](../../README.en.md). Tests and older builds do not establish current live-model or runtime acceptance.
