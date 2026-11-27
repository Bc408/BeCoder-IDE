# Beacon

BeCoder 内置的算法与编程学习助手。点击编辑器右上角 Beacon 按钮，或运行 **Beacon: 打开/关闭 Beacon 侧边栏**；聊天设置按钮、**Beacon: 打开设置**和扩展“功能”页打开同一个独立设置标签页。

本说明对应2026-11-27的当前源码；源码检查、模型观察、staged应用与负责人运行验收分别成立。[设计入口](../../docs/beacon/README.md)、[能力需求](../../docs/beacon/prd.md)和[实现状态](../../docs/beacon/implementation-status.md)分别维护，后续记忆／dream和完整视觉仍未交付。

当前接入负责人审定的18岁天才少女与算法竞赛导师人格：将BeCoder作为工位，傲娇、闲聊随性，教学直接简洁。system使用英文，回答跟随用户语言；人格效果待实际体验，不增加工具或操作权限。

## 模型连接与设置

支持 DeepSeek、百炼、Moonshot、Ollama 和“自定义”。每家只有一组连接和密钥配置，同一模型 ID 只有一份配置；不同服务商的地址、密钥、开关和同名模型相互独立。切换设置页供应商只改变正在查看的配置，不改变聊天模型；有未完成地址草稿、弹窗、发现或测试时不能切换。

Ollama 本地同步和测试无需密钥，代理服务可选填。回环地址下会额外只读查询已安装模型的 `/api/show` 元数据，不下载模型或修改服务配置。百炼使用账户提供的 API 地址，业务空间地址中的 WorkspaceId 由用户提供。

“自定义”固定使用 OpenAI 原生 Responses 协议。先保存服务的 API 基础地址（例如 `https://example.com/v1`，不含 `/responses`），再手动添加模型 ID 或同步服务列表；同步失败不妨碍手动添加。地址允许 HTTPS 和 HTTP，包含本机、局域网和公网；HTTP 明文传输请求及所填密钥。密钥可留空，留空时不发送鉴权头，也不使用环境密钥或占位密钥。首次添加模型默认启用供应商，明确关闭后不会自动开启；添加和测试不自动选择聊天模型。推理参数使用服务默认，不提供思考模式／强度设置；推理能力标识与普通参数仍可配置。对话由 Beacon 本地管理，以 `store:false` 发送完整有效历史，不依赖远端会话 ID。实际工具、图片和模型参数支持取决于服务，连接测试仅证明文本连通。

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

容量优先采用服务数值；缺失时使用上下文 32768、最大输入 24576、最大输出 8192 Token，并按已知上下文约束缺失项。用户可直接数字输入或恢复默认，没有容量快捷选项。模型输出上限与本次回复预算是不同设置；未指定回复预算且默认预留会占满总窗口时，本轮按3:1输入／输出比例预留，不改服务容量或显式设置。保留默认的采样参数不发送；实际回复预算随请求传入。

模型 ID 不可在详情中改名，显示名称可改。详情有独立保存/取消，失败保留草稿。温度、Top-P、回复预算和适用的思考模式/强度属于生成参数；关闭推理会清除其思考设置，显示降权的“不适用”摘要。能力刷新保留同 ID 参数，即使冲突也允许同步成功；下次正式请求前提示具体冲突并拒绝非法参数，不静默删改或降档。调用失败不自动改能力或切服务。

设置页使用“模型配置”导航、五项供应商选择、横向设置行和可折叠模型组。已添加模型无搜索，候选保留搜索；详情不提供模型类型、音视频、价格或无功能占位。下拉使用自定义菜单，图标动作复用现有图标系统，密钥显隐图标随显示状态切换。浅/深色、宽/窄窗口、长名称、错误、禁用态、焦点及弹窗滚动仍需按每次 UI 改动检查实际渲染。

### 连接测试与活动回复

测试固定点击时的连接、密钥和全部已添加模型，逐模型发出短文本请求，可能消耗服务额度；不带聊天、附件、工作区、Notebook 或工具，不写聊天历史。结果逐项显示，可取消余下测试；一次文本成功不证明工具、视觉、容量或推理。失败不回滚已保存密钥/模型，也不改变供应商启用或聊天选择。

重复/冲突操作立即拒绝，不排队或自动重试整批。关闭设置页取消未完成测试，迟到结果不能复活旧页面。活动回复始终使用开始时固定的连接、密钥、能力和参数；设置变化只影响下一次发送、继续或重答。

## 工作区、三档与草稿

每个窗口独立选择并记住 Beacon 根，最近列表共享。根准备好 `.beaconWork` 后才可用 Spot/Flood；无根或根不可用时仅 Blackout。工作区选择和历史只在主页显示，详情页不能切根。忙时切根/切档直接拒绝，任务结束后由用户重试。

| 档位 | 当前范围 |
| --- | --- |
| Blackout | 可用主动材料、获准页面、已加载上文和五站fetchProblem；临时聊天／草稿只在内存，Beacon不读持久来源。有效所选根的软件采集持续 |
| Spot | 菜单说明“只工作在当前Beacon工作区”；普通文件读取限所选根，当前没有模型资产写入工具 |
| Flood | 菜单说明“可自由访问本机文件”；扩大允许读取的文件位置，仍排除凭据、内部会话资产和其他受保护路径，不扩大执行权限 |

三档及无工作区均可按需读取当前可见C/C++和BeCoder Notebook的完整内容（含未保存、未命名与根外文档）、文件名和路径，不读后台标签。Notebook读取整本编号正文，排除运行结果；普通文本、网页和PDF文字沿原页面权限读取。OJ题面／判题功能页及Notebook执行字段不作备用取材入口；页面读权不允许从backing file补正文、导航或读取相关／隐藏文件。凭据过滤和其他会话隔离继续生效。主动添加外部单文件只提供该次快照，不授权目录或持续追读。

工作区聊天和草稿归 `.beaconWork` 中对应对话，同根窗口共享列表，同一对话只允许单窗口打开。空主页不创建记录；首次输入/附件可建立隐藏草稿，首次发送转为历史聊天。返回主页保留详情草稿，主页“新聊天”清空主页草稿。真正关窗发布最后关闭窗口的页面和输入状态，显式空白覆盖旧草稿，恢复遇占用静默回主页。

主动切档保留页面和文字/捕获附件，包括显式空白。Spot/Flood 共用身份；跨 Blackout/持久化类别后首次接受新问题才创建独立完整上下文快照，按版本清除被消费的来源草稿，不改来源消息。主动进入持久化模式并发送允许继承内容落盘，单纯选根不转存；返回来源类别且未发送时继续来源对话。[完整继承规则](../../docs/beacon/prd.md)已确认，局部验收和其他未验证场景见实现状态。

Runner、CPH、Notebook运行及必要清理期间，输入区保留暗淡禁用发送箭头，无工作区也适用。应采集记录的整理、校验和发布另由collectionPending禁用新请求，提示“正在保存用户行为上下文”；有效根三档均适用，同根窗口共享等待，无关根不互锁。主页／详情发送、快捷键、继续、重答及编辑旧问题均在实际受理前复核。只有真实Beacon回答显示暂停；文字和附件保留，恢复后由用户主动发送，不排队、自动补发或重试采集。证据保存不拖延执行退役、清理和下一次用户运行；远程OJ尚无终态时不额外禁聊。

应采集失败由原动作窗口右下角通知，同动作至多一次，结束保存等待；32KB拒收明确容量原因，发布确认不明会说明无法确认是否已保存，不自动重复追加或重跑。编译失败、错答或取消本身仍可正常形成记录；无工作区、根外和按规则不采集的动作不报保存失败。

## 用户行为与受控上下文

工作区决定软件采集，模式决定Beacon消费：必须已选择正常可用的Beacon根，Get Problem及Runner／CPH／Notebook／OJ用户行为材料才采集落盘。有效根下Blackout仍持续采集，Beacon不能列举或读取这些持久记录；无根或根异常不采集，不改投其他根、不后补。

九项模型工具为readCurrentCode、readProblemRecord、readRunRecord、readVerdictRecord、fetchProblem、inspectFile、readPage、browseWeb、readBeCoderInfo。三个记录工具支持latest和filePath筛选，代码带完整稿codeHash；运行结果只提供本次语言标准／优化设置、整数运行毫秒与开始时间。inspectFile文本按Unicode字符续读，Notebook坐标按所有单元格统一编号。工具按当前模式和模型能力开放，工具目录不代替正文读取，讨论对象由模型结合问题、对话和实际观测判断；没有“上轮对象”或宿主固定题目。

readBeCoderInfo按overview、problems、runner、cph、notebook、oj-connect、beacon七个固定主题读取随包产品说明和实际运行的BeCoder发行版本。它在三模式及无工作区可用，不读取个人设置，不增加执行或写入权限；省略主题读概览，也可直接读具体主题。

三个队列在当前`.beaconWork`跨对话共享：problem保13条，只存五站用户Get Problem／Import的oj、problemId、代码路径和查看时间；同题同路径删除旧项，以新ID与时间入尾，不保存题面。run为Runner／CPH／Notebook共30条，一份实际编译程序及其多组input形成一条终态记录，不去重；无题目绑定、运行限制配置或检查器细节，CPH只保check结果。verdict保20条完整最终OJ结果，同站同题可靠提交代码完全相同替换旧结果；缺提交代码仍保存但不去重。CPH仅编译不形成run，测试请求编译失败会记录。

readCurrentCode({})读取调用当下全部可见C/C++及BeCoder Notebook，含完整dirty、根外及未命名内容，未命名路径为null；files以kind:code／notebook区分。笔记从已加载owner取得全本Markdown、C/C++和input，全部cells从1编号，每个C/C++代码格独立codeHash，不含outputs／attempt／executionSummary，不读后台、不落快照或回退磁盘JSON。读取前按文档身份合并分屏，宿主目录与正文一致；不同文件同正文、多个未命名文档及同笔记相同代码格分别保留。跨轮调用仍读当前内容，不删除历史中的合法重读。发送、继续、重答不自动读取，重放不执行。

三记录工具空参列全部保留目录、带ID或latest读取完整记录，可按filePath筛选；同回答首次成功读取固定同一事实，不额外复制为私有材料。run目录分别说明真实编译结果、已执行／未执行输入和已有check；Runner／Notebook无自动判题，CPH检查完成时才有check，缺失不表示通过或产品不支持检查。run源码保留前8192字符，输入、期望及每个编译／程序输出字段各4096字符，每处错误各1024字符；发生截断明确标记。字段独立处理后，单条记录JSON超过32KB则不入队并提示，不影响实际运行；该限额不作用于现场笔记正文。旧超大记录正文拒读，但目录和其他记录继续可用。

fetchProblem是五站正式题面入口，按oj＋规范problemId联网复用OJ Connect解析，与聊天搜索开关互不影响；结果只进入上下文，不新增缓存或回写用户行为。其他导入题目可由inspectFile读取对应.cph元数据，再在搜索开启时用browseWeb获取网页。readPage按页面id读取调用时的获准普通页面及现有PDF正文，C/C++与Notebook现场内容走readCurrentCode，执行／测评不走页面旁路；版本校验由宿主负责，不再提供专用页面材料副本或readMaterial。评测源码mismatch由结果页面和通知报告，该次不入队；其他终态照常承接，模型不接收工程核验字段。

完整代码和记录不按模型剩余额度二次截短或分页；工具交换闭合后由下一请求预算检查触发既定同步压缩，仍不能容纳则明确失败，不重执行成功工具。新队列位于cache/context/{problem,run,verdict}.json；旧队列和旧快照原文件不自动迁移或删除，旧完成协议仍是历史事实，无隐藏执行别名。

执行／测评事实仅消费持久凭证，所有档位不以功能页面作备用来源。Notebook自动文件读取和搜索先由Notebook owner提供内容投影，排除outputs、attempt和executionSummary；损坏或owner不可用时不回退原JSON。用户主动材料、独立Notebook真实输出和完整备份保留。哈希只证明相应表示的身份，不证明正确性、完整覆盖或当前代码已验证。

PDF 使用已加载 PDF.js 文档按物理页提取文字；扫描页可能为空，不含 OCR 或完整图片/公式理解。网页 iframe、未渲染代码和图片等缺口如实反馈。文本、Notebook 和 PDF 文字选区通过“询问 Beacon”加入可查看、移除的草稿，由用户发送。

本轮移除模型editNotebook写入口；Notebook独立编辑、完整备份、保存和原生运行保留。运行全部在点击时固定代码及input，同代码块本批只编译一次，input各用独立进程；不同代码块不按正文合并。单input运行失败继续，编译失败跳过该程序剩余input，用户停止结束整个批次。采集失败不控制执行或清理。见[Notebook扩展](../becoder.notebook/README.md)。

文件工具只读；Beacon 不改学生 C/C++ 文件、不自主运行/停止、登录或交题。额外联网查询个人信息依据真实用户许可和范围，由 prompt 引导；页面内容、登录状态、Flood 或模型自写记忆不生成许可，没有额外宿主许可台账或审批门。

## 对话与连接恢复

每次正式请求固定带入精简算法导师核心，与联网开关、工具支持和Notebook无关。system、工具用途／参数说明和产品主题正文统一英文，回答跟随用户语言。工具说明按本次实际可用能力加入，system不重复逐工具能力清单；产品主题按需读取，不强制先查概览。用户原话保留原角色，网页及工具结果作为材料。教学示例和好坏回答只在评测侧；[本轮模型对照](../../docs/beacon/evaluation/2026-11-25-prompt-quality-report.md)与[验证边界](../../docs/beacon/implementation-status.md)区分确定性装配、模型观察和负责人教学验收。

支持流式多轮、代码高亮/复制/换行、公式、默认折叠思考、活动提示和滚动跟随。正文与 OJ Connect 共用内容解析和增量代码展示，代码使用固定 One Monokai 配色；新增原文先显示，语法资源从本地按需加载，流式解析与动画分离。暂停保留已输出内容；继续以已有上下文发起新请求接到同一回答；重新回答按原问题重建后续分支。已完成工具结果进入会话协议，后续不重复冒充新读取。

尚未交付文字、思考或工具活动时，临时网络/限流/过载可自动恢复，整轮至多两次重试、累计等待不超过 10 秒，保留原模型和三分钟期限；停止取消请求及等待。鉴权、余额、参数、证书等错误不自动重试；已输出内容或完成工具不自动重放。最终故障保留手动重试。连接诊断仅记服务商/随机请求标识、分类、次数与耗时，不记提示词、图片、密钥、地址或响应正文。

每次实际模型步骤均检查最终规则、工具定义、消息及媒体预算：`B=min(I,C−O)`，90%主动整理。已确认设计目标为60%；当前已计算该目标，尚未用于引导摘要生成，发布只检查严格缩短、低于90%及硬容量，差距见实现状态。同一模型同步生成摘要投影，保留原始聊天与完整工具协议；候选保存确认后才使用。覆盖前缀被编辑时摘要失效，尾部修改或追加不自动废弃合法前缀。同一普通待发步骤最多整理修复一次，普通和整理共用20步及原期限，整理不递归、不改变业务队列。无法可靠估算图片token时保留图片并标明未知，不静默丢图或换模型。

回答失败保留实际完成的工具调用／结果；失败正文不投影给后续模型。停止保留已接收文字及兼容思考，拒绝迟到正文；不补造未完成工具结果。切换供应商、端点或模型后过滤私有思考字段，业务JSON保留。

自定义Responses按原生input、instructions和工具定义检查最终请求。加密推理回放保留完整载荷，计量仅保协议包络并标明未知，不按密文字节当作文本token；原生图片／文件同样保持媒体身份。普通正文和工具结果仍受容量限制，不自动提高模型容量或丢弃材料。

## 开发与验证

仓库根执行 `npm run compile-oi-extensions`。本目录可执行 `npm run typecheck`、`npm run build`、`npm test`；正式检查按 [AGENTS.md](../../AGENTS.md)预检。模拟 SSE/宿主测试不证明真实账号连通、模型效果或桌面验收；生产渲染也不代替负责人验收。第三方来源见 [UPSTREAM.md](UPSTREAM.md)。

## English

Beacon is BeCoder's programming tutor. Its owner-approved persona is an 18-year-old genius girl and competitive programming tutor who treats BeCoder as her workstation: tsundere, relaxed in casual conversation, and direct and concise when teaching. The system prompt is English; replies follow the user's language. Persona quality awaits actual experience and grants no additional tools or operational permissions.

Open it from the upper-right editor button or **Beacon: Toggle Beacon Sidebar**; **Beacon: Open Settings** opens its separate settings editor. DeepSeek, Bailian, Moonshot, Ollama and Custom use isolated provider records, one connection/key configuration per provider, temporary model discovery with explicit confirmation, provider-level enable switches and user-selected chat models. Custom uses native OpenAI Responses with an explicit HTTP/HTTPS API base URL, optional credentials, manual model IDs or model discovery, and service-default reasoning. Empty custom credentials never fall back to environment keys. Local Ollama does not require a key. Saved keys remain in SecretStorage; explicit reveal is temporary. Tests send small text requests to all added models and may consume provider credits.

Model capabilities are boolean and default to supported unless explicitly denied; missing capacities use editable defaults of 32768 context, 24576 input and 8192 output tokens. These defaults do not verify a model's actual abilities. Confirmation replaces membership/capabilities, clears manual capability corrections and retains same-ID names/generation settings. Invalid retained parameters block the next request; active replies keep their original configuration snapshot.

Custom Responses capacity checks include the native input, instructions and tool definitions. Encrypted reasoning is replayed intact; measurement retains its envelope and marks its token contribution as unknown rather than treating ciphertext bytes as text tokens. Native image and file payloads retain their media identity. Ordinary text and tool results remain subject to capacity checks; model capacities are not raised automatically and material is not silently discarded.

Each window selects an independent Beacon workspace. Blackout keeps temporary chat in memory and can use supplied material, authorized pages, loaded conversation and fetchProblem; persistent-source reads are unavailable. All modes, including without a root, can read complete visible C/C++ documents and BeCoder notebooks, including unsaved, untitled and root-external content. Background tabs and execution fields are excluded. Spot confines ordinary file reads to the selected root; Flood broadens allowed file locations while preserving credential and conversation restrictions. There is no model asset writer. fetchProblem is independent of the search switch; browseWeb follows it. Mode changes preserve the composer and create independent inherited snapshots on the first accepted cross-category send. Execution and required cleanup retain their sending gate; independent collectionPending blocks every new request while required activity facts are prepared and published, with “Saving user activity context” (正在保存用户行为上下文). This saving gate applies in every mode and is shared by windows on the same healthy root. It does not delay execution cleanup or the next user run. A save failure produces at most one notification per action in the originating window and ends the wait; drafts remain, with no queued send, replay or automatic collection retry. Uncertain publication is reported as unconfirmed. Waiting for a remote judgment alone adds no saving gate. Open-page access never grants backing-file or hidden-record access.

Message Markdown and incremental code rendering share the OJ Connect content core. Code uses fixed One Monokai colors; source appears before local grammar loading and syntax coloring. Streaming parsing is separate from text animation.

The model has nine read-only tools: readCurrentCode, readProblemRecord, readRunRecord, readVerdictRecord, fetchProblem, inspectFile, readPage, browseWeb and readBeCoderInfo. The last tool reads one of seven bundled product topics and the running application's release version in any mode, including without a workspace; it does not inspect personal settings. Production system text, tool descriptions and product knowledge are English; replies follow the user's language. There is no model Notebook writer. Native Notebook editing, backups and running remain available. A healthy selected root collects user activity in all modes; Blackout cannot consume persistent sources. Shared queues retain13 problem identities,30 combined Runner/CPH/Notebook program runs and20 final OJ verdicts. Problem identity plus file path deduplicates viewing; reliable identical submitted code deduplicates verdicts within one OJ/problem. Runs are not deduplicated. Code reads return complete current visible C/C++ and Notebook content without a snapshot store. Supported statements use the OJ parser independently of web search and are not persisted. Full record results enter ordinary same-model compaction without dynamic truncation. Native Notebook batches compile each program once and run each input independently. Automatic Notebook context excludes execution fields; original outputs/backups remain host owned.

The model chooses the discussed problem and code from the user's question, conversation and tool observations. There is no host discussion-object picker, pin or last-object badge. Live reads cover all visible C/C++ documents and BeCoder notebooks at call time, including unsaved text and untitled drafts. Notebook cells retain their whole-document 1-based positions and each C/C++ code cell has its own hash. Source identity merges multiple views before reads and in host metadata; distinct documents and cells remain separate even with identical text. No execution output enters live content. Runner/Notebook do not automatically check answers; CPH provides checks when checking completes. Run summaries separate compilation, executed/unexecuted inputs and available checks. The current model performs synchronous input compaction with explicit capacity checks, a single repair per pending ordinary step and 20 shared model steps. A discovered context window is used when an input limit is not separately supplied; the unrelated default input ceiling is not retained. Only confirmed summary saves become projections; raw history and completed tool pairs remain intact. Unknown image estimates retain the image. Memory/dream and full visual support remain future work. See [implementation status](../../docs/beacon/implementation-status.md) for validation and owner-acceptance boundaries.
