# Beacon 实现状态与验证边界

更新：2026-11-27。当前源码在Beacon_Next上接入负责人审定的产品上下文提示词2026-11-27.1，并新增自定义Responses供应商；应用源码版本2.2.0，本轮开发基线为19f715f1。本页分别维护源码、回归、模型观察、stage及负责人验收，不用设计或旧产物替代实际交付。

[统一入口](README.md) · [工具合同](tool-contract.md) · [底层设计](foundation-design.md)

2026-11-25提示优化[设计](../superpowers/specs/2026-11-25-beacon-prompt-quality-design.md)和[实施计划](../superpowers/plans/2026-11-25-beacon-prompt-quality.md)已获批准，负责人选择Native实施。导师核心精简、逐工具capabilities退出和readBeCoderInfo均已接入；system、工具说明及产品主题正文统一英文，回答跟随用户语言。[能力报告](evaluation/2026-11-25-prompt-quality-report.md)及[完整问答](evaluation/2026-11-25-prompt-quality-samples.md)保改善、退化和失败；整体教学质量未全面通过。

## 2026-11-27 自定义 Responses 供应商

负责人审定并授权[实施计划](../superpowers/plans/2026-11-27-beacon-custom-responses-provider.md)：第五项“自定义”固定使用OpenAI原生Responses，单连接、多模型，用户提供HTTP／HTTPS基础地址，密钥可选，手动添加ID及模型同步共存。默认地址为空；无合法保存地址不能同步、测试或发送。旧四家配置缺custom时补默认项，原有配置、密钥及选择不变。自定义推理使用服务默认，不提供思考模式／强度覆盖。

原生请求／流解析由精确锁定的@ai-sdk/openai4.0.71负责，与当前provider4.0.17／provider-utils5.0.45完全匹配，其他依赖不升级。自定义无密钥不回退环境变量、不发送Authorization；有密钥沿SecretStorage。store:false沿本地有效历史回放并保原生推理元数据，不依赖远端会话；可选工具参数通过Responses非strict模式保留，普通显式参数不按模型名称静默丢弃。九工具、队列、权限及压缩算法不变。

类型检查、扩展生产bundle、397项全套离线测试（其中27项自定义定向回归）及strict lint通过，零失败／跳过／取消。生产Webview回归覆盖自定义中英文、浅深色、360／900宽度、空密钥、手动模型／重复错误保草稿、模型ID不可改、同步失败恢复和原四家流程，并生成24张自定义截图；这些是模拟宿主的渲染结果。文档结构、当前改动文档本地链接及diff校验通过。

独立复审发现并修复一项P1：工具已完成但后续回答失败时，恢复投影曾丢失关联加密reasoning。新增直接继续／历史重载、无推理摘要及跨来源过滤的回归，保已完成工具所需元数据，排除失败正文和未配对思考，不重新执行工具；复审确认无剩余阻塞。工程验证阶段未调用真实模型服务，未作Setup验收。

随后按负责人要求完成客户端类型检查、OI扩展统一编译和新stage构建，均退出0；标准stage于2026-11-27 12:17:18（Asia/Shanghai）完成，用时161.638秒，应用入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。负责人随后明确确认“自定义服务商验收通过”，并授权本地提交和推送至对应云端分支。本次归档记录该验收结论，不将其扩大为其他模型、完整工具或教学效果的全面验收。

## 2026-11-27 产品上下文提示词接入

负责人逐项审定system取材原则、队列动态及共享run的latest含义、Notebook输入配对／执行捕获、Runner和CPH显式保存／编译稿、CPH配置路径及长文本截断取舍，授权统一接入并将应用源码版本更新为2.2.0。正文与中文语义见[接入记录](review/2026-11-27-product-context-prompts-installed.md)。Notebook内容从现场或语义文件返回时附同一条配对短释义；普通文本及失败不附。工具schema、权限、采集、执行与容量规则保持。

本轮类型检查、扩展生产bundle、24项定向回归、368项完整离线回归及strict lint通过。应用清单和根锁文件版本同步；API兼容号、扩展版本、第三方依赖及历史记录保持。本轮不运行新Beacon问答／模型API，不构建stage或Setup，不以当前源码推送代表新安装包、Release或模型效果通过；此前stage与访谈分别属于其原始版本。

## 2026-11-26 信息流提示词重构

负责人已批准IF-D1／IP-D1并选择Native实施。首层环境、九工具用途／参数、条件notes／具体失败、固定ID摘要及媒体／续答归属已接入；完整位置和中英文语义见[接入与验证记录](review/2026-11-26-prompt-information-flow-installed.md)。七主题、三队列、业务采集／执行owner、权限和容量算法保持。内部提示版本不进入模型正文，模型失败不携UI简码，原UI及旧历史保持兼容。

两次里程碑和最终独立复审已完成，发现的UI分类兼容问题及完成结果停止竞态均已修复。初次接入的类型检查、扩展build、365项全套离线回归及严格lint退出0，无fail／cancelled／skipped；完整结果见接入记录。初次接入阶段没有模型请求或stage验收；后续复审与构建见下段。既有60%摘要目标尚未传入生成器的差距保留。旧stage与访谈是各自版本的历史证据。

后续负责人授权独立code review、修复并构建新stage，见[复审记录](review/2026-11-26-prompt-information-flow-code-review.md)。已修复inspectFile不合法参数可能生成无法重开历史的P1，以及上下文验证失败被误报为确定变化的P2。修复后367项Beacon回归、类型／build／lint、客户端类型检查及OI统一编译通过。完整标准stage于2026-11-27 00:04:18退出0，用时160.982秒；首次Electron下载失败及校验一致的本地归档恢复分别留证。应用入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。未启动GUI，不以构建替代模型效果或真实流程验收。

## 2026-11-27 信息流提示词原生访谈

负责人授权启动完整隔离stage副本并登录洛谷，使用原生DeepSeek Flash完成真实Get／Import、CPH官方样例错答与复测、Runner编译失败／诊断／大输入、Notebook双程序与dirty调序、单次洛谷提交及提交后改稿、普通页面／产品知识和模式切换。生产代码、工具和提示固定；不用computer use，不伪造行为队列。详见[Beacon访谈原文](evaluation/2026-11-27-prompt-information-flow-interview.md)、[33轮完整问答](evaluation/2026-11-27-prompt-information-flow-interview-dialogue.md)与[核验报告](evaluation/2026-11-27-prompt-information-flow-interview-report.md)。

33轮中32轮完整结束：19主工作、3工作补问、8主访谈、3补核；W19服务连接错误保留，W19A另作续问。49次工具交换配对，47次非错误结果，2次readPage明确拒绝，均未返回目标正文；未见参数校验失败。最终队列2／9／1，含Runner5、CPH2、Notebook2及单次洛谷AC／100分／六点结果。约1.93MB输入生成的证据副本11,244字节，截断明确，聊天可继续；Blackout仍采集，切Spot不重跑即可读取原记录。

Beacon认可分层执行事实、代码身份、Notebook身份及即时截断释义；其编译源码来源建议仍待负责人把关。材料已具备时仍发生新Runner误用旧事件、Notebook末尾操作串位、版本哈希混同和隐藏测试覆盖外推。I03的产品知识因果时间倒置经F02修正，自述不是工程事实。W03未保存前提受自动保存影响，另以W03A取得真实dirty稿，原回合不充当dirty验收。未改生产实现、未新构建或提交推送；本轮不是随机对照，也未验收压缩、媒体、其他四站、保存失败／退出竞态或完整产品体验。

## 当前实现

| 范围 | 源码事实 |
| --- | --- |
| 九工具 | readCurrentCode、三个记录工具、fetchProblem、inspectFile、readPage、browseWeb及readBeCoderInfo；readMaterial及专用副本链退出；提示版本2026-11-27.1 |
| 产品知识 | 七固定主题随扩展发布，整篇返回version／topic／content；版本来自运行宿主IProductService，区别于扩展兼容号；三模式／无根可读，不读个人设置或扩大其他权限 |
| 提示分层 | system为导师原则及首层环境，工具定义交代用途／参数；结果短释义按实际条件随返回提供，新失败投影统一error对象，旧协议原样回放；产品事实按主题读取，不强制调用顺序 |
| 现场文档 | 调用时全部可见C/C++整稿和已加载BeCoder Notebook全本内容cells，含dirty／未命名／根外现场；同文档多视图合并，每个C/C++ cell独立codeHash；不读后台、磁盘替代稿或执行字段，不另存快照 |
| 用户行为上下文就绪 | 独立collectionPending覆盖适配／校验／发布，同根窗口共享；各模式的所有新回答入口在实际受理前复核，文案“正在保存用户行为上下文”；失败按动作通知，发布确认不明不误报未写入；执行退役和后续运行独立 |
| 新查询与投影 | 三记录支持latest和filePath；编译只回standard／optimization等教学事实，运行毫秒取整且开始时间到秒；完整代码hash在截断前计算；verdict按站点具名行且隐藏工程核验状态 |
| 业务记录 | 当前.beaconWork共享problem13／run30／verdict20，按现行去重／终态规则发布；只启用cache/context三个文件 |
| 题面 | problem仅存读题身份；fetchProblem按五站规范ID取题，与搜索开关互不影响；活动显示“已读取 fetchProblem”，普通browseWeb保持原文案 |
| 执行记录 | CPH仅编译不入队、仅保check；run无题目绑定／runtimeLimits／检查器实现；源码8192码点、输入／expected／各编译与程序stream独立4096、每error1024；截断为{text,truncated:true}；含ID紧凑JSON限32768 UTF-8字节，超限拒收；旧超大正文单条拒读 |
| Notebook | 点击时固定程序组、每代码块本次一次编译、input独立进程；失败继续，Stop结束批次，删除／调序不改计划，关闭仍取消；采集与执行解耦 |
| 模式与工作区 | 有效根在Blackout也采集，模型持久来源关闭；无根／异常不采集、不补采 |
| 历史与容量 | 完成工具交换保身份且不重演，代码／记录整读不二次裁剪；同模型同步摘要、有效前缀和一步一次恢复已接入 |
| 退出能力 | inspectContext操作并集、codesnap及editNotebook模型入口已退出；旧磁盘数据不自动迁移／删除，Notebook独立用户功能保留 |

## 2026-11-26整套提示词接入

负责人审阅[英文全文与中文语义](review/2026-11-26-overall-prompt-refresh-candidate.md)并确认七处修改后，授权整套接入。导师核心补充BeCoder学习环境，围绕题面／代码／反馈和版本对应组织讲解；readProblemRecord明确用户看题行为，fetchProblem自身说明读取题面用途；Notebook概览说明Jupyter式交互及Code - OSS原生编辑器基础。七主题、宿主目录、摘要与继续包装通过既有入口接入，生产文案使用英文，中文只用于文档审阅。

九工具名称、参数结构、结果字段、权限、采集、队列、压缩算法与预算均保持现行合同；本次没有新增工具、hook、快照或模型写入／执行能力。本文中的前轮stage和访谈均不代表2026-11-26.3的交付或效果；本版尚未作模型对照、stage构建、实例启动或负责人实际体验验收。

本轮Beacon独立typecheck、扩展生产bundle及完整342项回归通过，无失败／跳过，strict lint通过。首轮完整回归的1项失败来自旧描述断言，已按审定文本更新并完整重跑；原有现场范围、工具配对、模式与文件权限、摘要及续答行为继续由现有测试覆盖。工程验证不等同于模型输出质量提升。

## 2026-11-26硬能力工程审查

负责人授权对整个Beacon的硬能力作code review与bug修复，18项具体问题及原触发见[审查报告](evaluation/2026-11-26-hard-capability-review-report.md)。本轮修复应用退出发布等待、历史路径缺失校验、Runner目标固定／通知／编译取消、CPH启动前取消、四类业务采集异常通知、页面续读及dirty文档身份与最终改版校验、搜索不完整表达、过期view请求拒绝，以及小窗口默认输出预算和压缩图片／参数承接。

非重复回归941项通过、1项PCH缓存依赖跳过；标准Node入口、类型、分层、相关lint和headless Webview结果另列。独立复审未发现阻塞问题；最终OI统一编译和标准stage退出0，stage用时168.31秒，具体边界见报告。未运行新的真实实例、五站账号流程或模型访谈，不代表原有教学质量问题已消除。

## 2026-11-26上下文就绪与可见Notebook

[设计](../superpowers/specs/2026-11-26-beacon-context-availability-and-visible-notebook-design.md)已获批准，负责人授权[实施计划](../superpowers/plans/2026-11-26-beacon-context-availability-and-visible-notebook.md)后接着实现。源码已接通三队列保存门禁、四类业务通知、Notebook现场内容和源头文档身份去重。独立审查提出的异步登记空窗和旧问题编辑草稿丢失均已修复并回归；本轮交付详见[报告](evaluation/2026-11-26-context-availability-and-visible-notebook-report.md)，新stage已按本轮最终源码构建，旧stage仅作历史证据。

回归明确覆盖延迟发布后执行退役、同根多窗口／无关根、关闭与重载、Blackout、旧队列保留、发布确认不明、草稿保存边界的新任务、拒绝请求不重放、同文档分屏及相同正文不同文件／cell。编译成功后程序尚未启动即取消的记录保not-run／cancelled原因，实际启动后停止仍为cancelled；目录摘要据实际状态表达，不把未执行输入说成已执行。

本轮源码回归877项通过、1项CPH依赖用户生成PCH缓存而跳过（各拥有者及精确命令见报告）；客户端类型、OI扩展编译、分层和相关lint通过。旧问题编辑改为匹配view／消息ID／编辑版本的实际受理确认后关闭，拒绝时保稿，不自动重发。未进行新的真实站点账号流程、原生GUI验收或模型访谈；源码／headless Webview测试不证明教学回复质量已改善。本轮标准 `npm run gulp vscode-win32-x64-min` 于2026-11-26 11:30:30（Asia/Shanghai）退出0，用时171.99秒。产物入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。这是未加入访谈插桩的新stage，未启动实例，未作Setup或原生GUI验收。

## 2026-11-26工具清洗

[设计](../superpowers/specs/2026-11-26-beacon-tool-information-design.md)与[计划](../superpowers/plans/2026-11-26-beacon-tool-information.md)已实施，详见[交付报告](evaluation/2026-11-26-tool-information-report.md)与[模型原答](evaluation/2026-11-26-tool-information-samples.md)。最终回归798项通过、1项依赖用户生成PCH缓存而跳过；类型、OI编译、分层及相关lint检查边界均在报告中列明。复审发现的四项问题已修复并回归。

最终DeepSeek固定8场景10回合完成，26/26工具执行无错误、10/10取得预标必要事实；合成来源和模拟编辑器边界不代表生产成功率，仍有状态／check混说、来源错称、机制臆测及冗长回答。完整原始答复及首批失败均保留。

标准stage于2026-11-26 01:24:12（Asia/Shanghai）构建成功，退出0，167.32秒。当次交付`D:/BeaconLab/20261126-tool-information`的完整生产副本与独立访谈副本，包含全部内置扩展和工具链，未导入旧聊天／队列／登录态；当次仅作离线准备。后续负责人授权启动后的实际结果如下，原离线报告仍保留当时边界。

## 2026-11-26第二轮原生访谈

已在独立app-interview原生实例由负责人登录洛谷，完成P2249拿题／CPH错答及三组复测／Runner编译失败与恢复及约1.99MB输入／Notebook新旧程序对照／dirty改稿。10工作回合、8主访谈和2补核共20份回答完整结束；32次工具结果配对，0执行错误。空结果计入工具成功，不代表32次有价值取材或答案全部正确。真实队列problem1、run7、verdict0；没有线上提交。

详见[反馈核验报告](evaluation/2026-11-26-native-harness-interview-report.md)与[完整原答](evaluation/2026-11-26-native-harness-interview-dialogue.md)。大输入证据副本11,160字节并标截断，之后可以继续聊天；不证明旧巨大聊天恢复或长历史压缩。重复可见代码、合流输出误读、未尝试入口的错误自述和超证据推论继续保留。CPH首次复测命令返回却没有新记录，重开owner后产生新运行；外部修改配置／面板转发的实验边界未进一步归因，不称为队列延迟或正常按钮缺陷。

仅修实验driver的内部命令过滤检查，生产工具／提示／stage未改；原生配置、Spot根与登录已在本实例完成，profile已有本轮聊天与记录。stage及生产app保持原样，未做Setup、完整GUI、其他四站、模式切换或全功能验收。

## 2026-11-25已有验证

run容量修复已获负责人批准并实施，见[修复报告](evaluation/2026-11-25-run-record-limits-report.md)和[模型原文](evaluation/2026-11-25-run-record-limits-samples.md)。原生55、Runner127、Beacon280、Notebook38项通过；CPH86项通过、1项依赖用户生成PCH缓存跳过。修正后的DeepSeek固定三场景6回合均可完成及继续；是生产Provider／工具／Store的有限复测，不是原生GUI或整体教学验收。新stage构建结果以本轮checks.jsonl为准，不能拿下面前轮stage替代。旧聊天内已保存巨大交换的容量恢复仍未修改。

- Beacon typecheck／build／strict lint通过，完整279项无跳过；客户端类型／转译、真实Electron版本桥2项（含guard）、原生队列／基础设施51项及完整分层通过。
- 最终DeepSeek Flash固定对照两臂各80有效回合全部完成。候选工具配对155/155，无错误结果143/155，必要新五站题面8/8；去掉故意损坏产品资源的2回合，预标必需新来源40/40取得正文。它是合成边界覆盖，**不是生产成功率或正确回答概率**。
- 产品指引与AtCoder规范题号有改善；D02／D03无关读取增加、回答字符中位数从652.5增至936，二分不变量、整数边界和证据外推仍错。readPage／readMaterial本批没有云调用。不能说整体教学质量已优化达标。
- HT02校准前两臂各2回合在本地容量门前失败；原证据保留。校准后候选2、基线4次实际摘要请求，四轮轨迹均完成；简化前缀不代表复杂历史全稳。
- 本轮完整标准stage于2026-11-25 16:38:17（Asia/Shanghai）退出0，161.63秒；16:38:40专项核验确认2.1.1、Beacon bundle及七主题与最终源码一致。首次Electron下载503失败与本机归档恢复见[交付记录](evaluation/2026-11-25-prompt-quality-report.md#7-交付与可复现材料)。该次构建未做Setup、GUI或真实网站账号流程。

## 前轮已有验证

以下为功能基线已有证据，不是本次文档整理重新运行所得。

| 层次 | 已验证内容与限制 |
| --- | --- |
| 自动回归 | 747项，无跳过：Beacon264、Runner123、CPH87、Notebook38、OJ171、原生Beacon51、Notebook浏览器13；复审后完成相关重跑 |
| 类型／构建／分层 | 客户端及各拥有者类型检查、OI统一编译、分层、Beacon独立lint通过；整仓ESLint有既有／生成文件失败，变更源码差分新增为0，不能称整仓lint通过 |
| 有限模型观察 | 2026-11-24 DeepSeek Flash有效36回合；工具执行74/74成功、66/74非空，31/31需新来源回合取得非空证据；人工核心语义32/36。合成网站／编辑器边界，不是生产成功概率 |
| 前轮stage | 2026-11-25 10:44:03（Asia/Shanghai），完整 `npm run gulp vscode-win32-x64-min` 退出0，210.26秒；此前typecheck与OI编译通过。仅证明前轮源码，不证明本轮提示或主题资源 |
| 桌面／发布 | 未做本次真实五站账号流程、安装版／GUI验收或Setup；Git云端备份不是Release |

stage目标入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`；本轮实际交付状态以新报告为准。前轮完整stage超时、min-ci恢复和最终完整构建保留在[前轮能力报告](evaluation/2026-11-24-context-tools-rebuild-report.md)，台账为`.superpowers/sdd/2026-11-24-beacon-context-tools-rebuild/checks.jsonl`，不证明本轮源码。

## 已知缺口与待验收

- **模型理解和教学尚不稳定。** 本轮仍有状态／check混说、来源错称、机制臆测和无关扩展，见[工具清洗报告](evaluation/2026-11-26-tool-information-report.md)。前轮二分与64位范围、空队列外推等缺陷未由本轮定向测试证明消除，见[提示质量报告](evaluation/2026-11-25-prompt-quality-report.md)与[前轮报告](evaluation/2026-11-24-context-tools-rebuild-report.md)。工具机械成功不等于有价值取材或正确回答；保留全部明显失败供负责人把关。
- **压缩保留瓶颈与实现差距。** 同步摘要已有实现；前轮3次成功及本轮有限复测不推翻复杂长对话中的结构化摘要失败与语义连续性问题。本轮执行层与声明均按真实kind＋固定ID收紧，无fixed时无工具，已补齐此前普通可选ID schema的差距。预算已计算60%目标，尚未传给摘要生成；当前发布只检查严格缩短、低于90%和硬容量。设计目标继续保留，不能写成全部完成或全场景稳定。
- **Runner交互输入存在缺口。** 不能可靠还原的stdin为null并标gaps，合流输出或回显不当完整输入。
- **执行观察类型仍可收窄。** metadata／event／outcome含unknown，当前依赖适配与运行校验；尚不是计划曾建议的有限类型联合。
- **后续能力仍保留。** 资产写入、tips/status、dream、完整视觉、本人同题历史增强及完整工具可视化未由本轮工具底座交付；CPH检查器代码沉淀、对拍检查器和随机生成器另行设计。
- **负责人体验待验收。** 按真实拿题→CPH单点／全部→dirty改稿→Runner／Notebook→OJ→Beacon验证材料依据、失败提示和模式裁切；本轮产品使用指引与教学质量也需负责人审阅，不由自动测试代替。

## 历史证据

[前轮重构报告](evaluation/2026-11-24-context-tools-rebuild-report.md)和[问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md)保留样本、失败和构建过程；[基础报告](evaluation/2026-11-23-context-foundation-report.md)、[旧工具专项报告](evaluation/2026-11-23-tool-information-flow-report.md)及[结论](evaluation/2026-11-23-tool-information-flow-conclusions.md)只代表旧实现。旧快照合同、执行计划和回迁过程可按[来源索引](sources.md)从固定Git版本追溯，不再作为当前工作待办。
