# Beacon 实现状态与验证边界

更新：2026-11-25。当前功能基线为 `Beacon_Next@dadbec9ddb183513a0838ef4e66f4afe9eda6e34`，已提交并同步到origin/Beacon_Next。本页集中维护源码、验证和缺口；文档清洗不构成新增产品测试或负责人验收。

[统一入口](README.md) · [工具合同](tool-contract.md) · [底层设计](foundation-design.md)

## 当前实现

| 范围 | 源码事实 |
| --- | --- |
| 九工具 | readCurrentCode、三个记录工具、fetchProblem、inspectFile、readPage、readMaterial、browseWeb已接入Provider；提示版本2026-11-24.1 |
| 现场代码 | 读取调用时全部可见C/C++分屏整稿，含dirty／未命名页；无后台标签读取或独立快照存储 |
| 业务记录 | 当前.beaconWork共享problem13／run30／verdict20，按现行去重／终态规则发布；只启用cache/context三个文件 |
| 题面 | problem仅存读题身份；fetchProblem按五站规范ID取题，与搜索开关互不影响；活动显示“已读取 fetchProblem”，普通browseWeb保持原文案 |
| 执行记录 | CPH仅编译不入队、仅保check；run无题目绑定／runtimeLimits／检查器实现，编译与程序输出总计8192 UTF-8正文字节 |
| Notebook | 点击时固定程序组、每代码块本次一次编译、input独立进程；失败继续，Stop结束批次，删除／调序不改计划，关闭仍取消；采集与执行解耦 |
| 模式与工作区 | 有效根在Blackout也采集，模型持久来源关闭；无根／异常不采集、不补采 |
| 历史与容量 | 完成工具交换保身份且不重演，代码／记录整读不二次裁剪；同模型同步摘要、有效前缀和一步一次恢复已接入 |
| 退出能力 | inspectContext操作并集、codesnap及editNotebook模型入口已退出；旧磁盘数据不自动迁移／删除，Notebook独立用户功能保留 |

## 已有验证

以下为功能基线已有证据，不是本次文档整理重新运行所得。

| 层次 | 已验证内容与限制 |
| --- | --- |
| 自动回归 | 747项，无跳过：Beacon264、Runner123、CPH87、Notebook38、OJ171、原生Beacon51、Notebook浏览器13；复审后完成相关重跑 |
| 类型／构建／分层 | 客户端及各拥有者类型检查、OI统一编译、分层、Beacon独立lint通过；整仓ESLint有既有／生成文件失败，变更源码差分新增为0，不能称整仓lint通过 |
| 有限模型观察 | 2026-11-24 DeepSeek Flash有效36回合；工具执行74/74成功、66/74非空，31/31需新来源回合取得非空证据；人工核心语义32/36。合成网站／编辑器边界，不是生产成功概率 |
| 最新stage | 2026-11-25 10:44:03（Asia/Shanghai），完整 `npm run gulp vscode-win32-x64-min` 退出0，210.26秒；此前typecheck与OI编译通过。构建后的提交钩子仅作格式修正，语法树核对和受影响类型检查通过 |
| 桌面／发布 | 未做本次真实五站账号流程、安装版／GUI验收或Setup；Git云端备份不是Release |

stage启动文件：`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。早前完整stage超时及min-ci恢复仍保留在[能力报告](evaluation/2026-11-24-context-tools-rebuild-report.md)，不覆盖最新完整构建成绩。本机命令／失败台账为 `.superpowers/sdd/2026-11-24-beacon-context-tools-rebuild/checks.jsonl`。

## 已知缺口与待验收

- **模型理解和教学尚不稳定。** 有检查器time-limit与学生程序正常退出混淆、反事实执行推导及64位范围错误；另有过度取材、内部字段搬运、无关扩展。工具机械成功不等于有价值取材或正确回答，见[报告与样本](evaluation/2026-11-24-context-tools-rebuild-report.md)。readPage／readMaterial未在这批云观察中被调用，只有离线覆盖。
- **压缩保留瓶颈与实现差距。** 同步摘要已有实现；本轮3次成功不推翻前轮复杂长对话中的结构化摘要失败与语义连续性问题。执行层已拒绝整理阶段列目录／首次读取，但schema仍复用普通可选ID形态，未限定已固定ID。预算已计算60%目标，尚未传给摘要生成；当前发布只检查严格缩短、低于90%和硬容量。设计目标继续保留，不能写成全部完成或全场景稳定。
- **Runner交互输入存在缺口。** 不能可靠还原的stdin为null并标gaps，合流输出或回显不当完整输入。
- **执行观察类型仍可收窄。** metadata／event／outcome含unknown，当前依赖适配与运行校验；尚不是计划曾建议的有限类型联合。
- **后续能力仍保留。** 资产写入、tips/status、dream、完整视觉、本人同题历史增强及完整工具可视化未由本轮工具底座交付；CPH检查器代码沉淀、对拍检查器和随机生成器另行设计。
- **负责人体验待验收。** 按真实拿题→CPH单点／全部→dirty改稿→Runner／Notebook→OJ→Beacon验证材料依据、失败提示和模式裁切。提示词优化专项尚未实施。

## 历史证据

[最新报告](evaluation/2026-11-24-context-tools-rebuild-report.md)和[问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md)保留样本、失败和构建过程；[前轮基础报告](evaluation/2026-11-23-context-foundation-report.md)、[旧工具专项报告](evaluation/2026-11-23-tool-information-flow-report.md)及[结论](evaluation/2026-11-23-tool-information-flow-conclusions.md)只代表旧实现。旧快照合同、执行计划和回迁过程可按[来源索引](sources.md)从固定Git版本追溯，不再作为当前工作待办。
