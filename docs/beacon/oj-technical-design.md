# 四平台 OJ 材料获取候选方案

更新：2026-10-23。状态：后续版本需求与候选路线，专用适配和真实账号旅程仍待完成；不属于 v2.0.0 当前实现交付范围。本文不描述已可用的四站接入；当前共用页面/联网能力见[实现状态](implementation-status.md)。

需求以[PRD](prd.md)、[架构](architecture.md)和[Notebook 设计](notebook.md)为准。四站范围为洛谷、Codeforces、AtCoder、蓝桥云课题库，内置浏览器完整流程优先；该能力已由负责人安排为 v2.0.0 之后的开发事项；不能以手动粘贴代替已确认的专用适配目标。

## 路线与边界

保留现有当前页面读取，再增加宿主控制的四站只读适配。模型决定需要哪些本人同题材料，适配器负责固定路由、参数、实际 session、材料身份/版本和覆盖反馈。不采用通用浏览器 agent、自动登录/交题、整账号爬虫、Cookie 导出或额外 Python 运行依赖。

| 入口 | 范围 |
| --- | --- |
| 当前页面 | 三档可读本窗口实际打开且已加载的内容，包括个人提交页；不导航、翻页、点击触发补请求或读取隐藏记录。虚拟化代码仅取得部分时明确反馈 |
| 额外网络查询 | 依真实用户明确许可及其范围，复用已有适用许可；prompt 引导模型核对账号/平台/题目，缺失才问。宿主仍检查窗口/session、参数和本地隔离，不新增许可台账或审批门 |
| 会话材料 | 实际使用的提交代码/判题形成当前会话独立快照；不读取其他对话，不随来源页面变化改写旧事实 |

页面打开、站点登录、Flood、模型自写 tips/status/dream 都不生成网络个人信息查询许可。Blackout 不消费工作区许可记忆或自动查额外本人记录。用户撤销后模型按最新指令行动；这属于 prompt 约束与行为验证，不声称宿主拥有不存在的许可凭据系统。

浏览器 Global/Workspace session 是网站登录存储作用域，不是 Beacon 根。固定读取必须绑定调用窗口和实际 session；网络结果不直接插入活页面，不执行响应脚本或加载外部资源。模型不提供任意 JavaScript、请求头或网络地址。读取型 POST 与修改型 GET 需按实际语义辨别；登录、提交、运行及账号修改不开放。

## 四站待核实路线

下表来自 2026-10-12 的只读研究，只是后续验证起点。DOM、接口、反爬、账号条件和限速会变化，实施前刷新证据；没有操作真实账号或取得本人提交的验证结果。

| 平台 | 候选路线 | 必须补齐的证据 |
| --- | --- | --- |
| 洛谷 | 本人＋pid 的记录列表、指定记录详情；题目 parser 只复用题面/样例组织 | 当前身份、列表分页、完整源码、编译消息、子任务/逐点字段、比赛与访问限制；社区 schema 不是官方保证 |
| Codeforces | 当前 contest/handle 的同题列表与本人 submission 详情；公开 API 可补摘要 | 普通/gym/group 范围、实际源码/协议读取、pretests/final/重判语义及当前限速；普通学生不依赖 manager-only 源码能力，不默认扫完整账号 |
| AtCoder | contest 的 submissions/me 按 task 筛选并分页，再读指定详情 | 登录失效、真实空列表与模板变化、源码/单位/判题/可见逐点字段；参考项目详情方法已停用，不能当作可调用库 |
| 蓝桥云课题库 | `www.lanqiao.cn/problems/` 当前页面及授权后站点自身只读列表/详情 | 登录后的账号/题目/提交 ID、历史源码、判题和测试点覆盖、网页编辑器模型及读取协议；没有已确认接口，不能猜 `/api/...` |

蓝桥云课题库不混同考试系统、赛事作答、教师报告或付费评测接口。历史匿名请求只得到登录壳，HTTP 200 不能冒充题面/提交取得。会员及题目权限尊重用户真实可见范围，不绕过限制。

## 材料契约

- 题目标识保留平台、题目、contest/group/gym 等必要上下文；相同题名或字母不能证明同题。
- 提交标识保留所有者、时间、语言、代码完整性/哈希，区分当前网页编辑稿与已提交代码。登录账号和提交所有者分别核实，未知时如实说明。
- 判题保留原始状态、阶段、分数、原单位及可得的编译/子任务/逐点事实。缺失、失败和数值零不混淆；历史 AC 不证明当前编辑稿通过，pretests 不冒充最终系统测试。
- 每份材料带来源入口、读取时点/版本、覆盖/截断/缺失和可继续位置。分页按提交 ID 去重，说明并发提交或重判可能影响覆盖，不承诺原子全历史快照。
- 按需充分获取同题相关材料，不人为固定最近两条/十条。单次分页和返回预算是工程限制，不能变成产品总条数缩水。较宽响应仅在宿主筛同题项，不保存或发送无关源码。
- 凭据、Cookie、CSRF、授权头和会话 token 不进入模型/日志。固定请求处理重定向、登录壳、验证码和权限拒绝，不能将失败解释为“没有提交”。

取得材料不会自动整理笔记。只有用户明确请求，才综合当前会话与合法材料整理 Notebook；真实缺失可说明，不编造当时想法或成功经历。

## 保留的研究来源

这些是 2026-10-12 固定的参考证据，不是对当前站点或依赖版本的在线核验；没有复制外部业务源码入产品。

| 来源 | 可参考部分与限制 |
| --- | --- |
| [Competitive Companion 洛谷 parser](https://github.com/jmerle/competitive-companion/blob/df90fabb52e8f566ea3382405e22d246af5d6a69/src/parsers/problem/LuoguProblemParser.ts)、[蓝桥 parser](https://github.com/jmerle/competitive-companion/blob/df90fabb52e8f566ea3382405e22d246af5d6a69/src/parsers/problem/LanqiaoProblemParser.ts)、[MIT](https://github.com/jmerle/competitive-companion/blob/df90fabb52e8f566ea3382405e22d246af5d6a69/LICENSE) | URL 分派和样例保真；不能由题目 parser 推断提交详情能力 |
| [online-judge-tools AtCoder](https://github.com/online-judge-tools/api-client/blob/615c345f169e2603e0b907287559a4535fc3c6f9/onlinejudge/service/atcoder.py)、[MIT](https://github.com/online-judge-tools/api-client/blob/615c345f169e2603e0b907287559a4535fc3c6f9/LICENSE) | 本人/题目筛选与分页组织；固定版本详情方法停用，不引入其登录/提交能力 |
| [洛谷社区记录说明](https://github.com/0f-0b/luogu-api-docs/blob/7f5e6431ec2e21fb0e2ecbeed2d451c9ed3393e5/records.md)、[Unlicense](https://github.com/0f-0b/luogu-api-docs/blob/7f5e6431ec2e21fb0e2ecbeed2d451c9ed3393e5/UNLICENSE) | 字段/协议线索，非官方稳定接口 |
| [Codeforces API](https://codeforces.com/apiHelp)、[AtCoder FAQ](https://atcoder.jp/faq?lang=en)、[蓝桥题库](https://www.lanqiao.cn/problems/) | 后续刷新官方限制与用户流程的入口；旧观察不证明当前登录后可得性 |

## 验证顺序

先在明确授权的用户旅程中取得脱敏的当前列表/详情/失败响应，再编写小适配器及固定 fixture。每站分别覆盖正确/失效身份、同题分页、完整/缺失源码、判题中/重判、单位、取消、导航/session 变化和敏感过滤。模拟响应通过后，再验证实际内置浏览器与模型能否充分理解材料，并完成 Notebook 复习流程。

不同站点可以返回不同真实字段，但四站完整目标范围保持。若平台确实缺失核心材料，报告实际证据和替代体验供负责人决定，不把登录壳、第三方摘要或旧接口示例说成已完成接入。
