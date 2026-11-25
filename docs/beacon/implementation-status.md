# Beacon 实现状态与验证边界

更新：2026-11-25。本轮提交保存提示词、产品知识及其评测与审阅材料；变更起点为`Beacon_Next@5dfd3eee3f892a221bd0af894559babea55cfa3a`（前轮产品功能基线dadbec9d）。本页集中维护源码、验证和缺口；源码、模型观察、stage和负责人体验验收分别成立。

[统一入口](README.md) · [工具合同](tool-contract.md) · [底层设计](foundation-design.md)

本轮[设计](../superpowers/specs/2026-11-25-beacon-prompt-quality-design.md)和[实施计划](../superpowers/plans/2026-11-25-beacon-prompt-quality.md)已获批准，负责人选择Native实施。导师核心精简、逐工具capabilities退出和readBeCoderInfo均已接入；system、工具说明及产品主题正文统一英文，回答跟随用户语言。[能力报告](evaluation/2026-11-25-prompt-quality-report.md)及[完整问答](evaluation/2026-11-25-prompt-quality-samples.md)保改善、退化和失败；整体教学质量未全面通过。

## 当前实现

| 范围 | 源码事实 |
| --- | --- |
| 十工具 | readCurrentCode、三个记录工具、fetchProblem、inspectFile、readPage、readMaterial、browseWeb及readBeCoderInfo已接入Provider；提示版本2026-11-25.3 |
| 产品知识 | 七固定主题随扩展发布，整篇返回version／topic／content；版本来自运行宿主IProductService，区别于扩展兼容号；三模式／无根可读，不读个人设置或扩大其他权限 |
| 提示分层 | system仅保导师原则及宿主元数据；用途／参数／结果语义在工具定义，产品事实按需读取；不强制调用顺序，教学范例只在评测 |
| 现场代码 | 读取调用时全部可见C/C++分屏整稿，含dirty／未命名页；无后台标签读取或独立快照存储 |
| 业务记录 | 当前.beaconWork共享problem13／run30／verdict20，按现行去重／终态规则发布；只启用cache/context三个文件 |
| 题面 | problem仅存读题身份；fetchProblem按五站规范ID取题，与搜索开关互不影响；活动显示“已读取 fetchProblem”，普通browseWeb保持原文案 |
| 执行记录 | CPH仅编译不入队、仅保check；run无题目绑定／runtimeLimits／检查器实现，编译与程序输出总计8192 UTF-8正文字节 |
| Notebook | 点击时固定程序组、每代码块本次一次编译、input独立进程；失败继续，Stop结束批次，删除／调序不改计划，关闭仍取消；采集与执行解耦 |
| 模式与工作区 | 有效根在Blackout也采集，模型持久来源关闭；无根／异常不采集、不补采 |
| 历史与容量 | 完成工具交换保身份且不重演，代码／记录整读不二次裁剪；同模型同步摘要、有效前缀和一步一次恢复已接入 |
| 退出能力 | inspectContext操作并集、codesnap及editNotebook模型入口已退出；旧磁盘数据不自动迁移／删除，Notebook独立用户功能保留 |

## 本轮验证

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

- **模型理解和教学尚不稳定。** 前轮检查器状态／反事实失败在最终有限复测未复现，但不代表消除；二分与64位范围、空队列外推、静态sourceVerification解释及无关扩展仍错。见[本轮报告](evaluation/2026-11-25-prompt-quality-report.md)与[前轮报告](evaluation/2026-11-24-context-tools-rebuild-report.md)。工具机械成功不等于有价值取材或正确回答；暂停该项纯提示叠加，保留全部明显失败供负责人把关。
- **压缩保留瓶颈与实现差距。** 同步摘要已有实现；前轮3次成功及本轮有限复测不推翻复杂长对话中的结构化摘要失败与语义连续性问题。执行层已拒绝整理阶段列目录／首次读取，但schema仍复用普通可选ID形态，未限定已固定ID。预算已计算60%目标，尚未传给摘要生成；当前发布只检查严格缩短、低于90%和硬容量。设计目标继续保留，不能写成全部完成或全场景稳定。
- **Runner交互输入存在缺口。** 不能可靠还原的stdin为null并标gaps，合流输出或回显不当完整输入。
- **执行观察类型仍可收窄。** metadata／event／outcome含unknown，当前依赖适配与运行校验；尚不是计划曾建议的有限类型联合。
- **后续能力仍保留。** 资产写入、tips/status、dream、完整视觉、本人同题历史增强及完整工具可视化未由本轮工具底座交付；CPH检查器代码沉淀、对拍检查器和随机生成器另行设计。
- **负责人体验待验收。** 按真实拿题→CPH单点／全部→dirty改稿→Runner／Notebook→OJ→Beacon验证材料依据、失败提示和模式裁切；本轮产品使用指引与教学质量也需负责人审阅，不由自动测试代替。

## 历史证据

[前轮重构报告](evaluation/2026-11-24-context-tools-rebuild-report.md)和[问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md)保留样本、失败和构建过程；[基础报告](evaluation/2026-11-23-context-foundation-report.md)、[旧工具专项报告](evaluation/2026-11-23-tool-information-flow-report.md)及[结论](evaluation/2026-11-23-tool-information-flow-conclusions.md)只代表旧实现。旧快照合同、执行计划和回迁过程可按[来源索引](sources.md)从固定Git版本追溯，不再作为当前工作待办。
