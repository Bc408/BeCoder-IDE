# 蓝桥公开题库：阶段一协议证据

[开发入口](README.md) · [技术架构](architecture.md) · [早期调查](../oj-connect-feasibility.md)

日期：2026-11-19，Asia/Shanghai。源码快照：`OJ_connect@ce98c93aceeee40bbf09220fd0a1a327dd8f5409`，调查开始时工作区干净。负责人确认首期只接入公开题库的 C/C++ 编程练习，并批准阶段一只读调研。

本轮结论：**已有足够的当前官网源码及匿名响应证据，值得进入真实会话采证；尚未证明登录后提交可用，也未选定最终传输实现。** 蓝桥仍未接入产品。本文是研究记录，不是实施设计、实施授权或网站验收。

后续负责人已批准并完成[阶段二真实会话采证](lanqiao-authenticated-evidence-2026-11-19.md)：官网一次人工 C++ 提交取得 AC 和源码回读证据；该后续结果不改写本文阶段一的证据范围，Electron 登录及报告恢复语义仍有缺口。

## 本轮边界与证据分级

本轮直接读取官网公开 HTML、静态 JS 和匿名 GET 响应，没有打开用户浏览器 profile、登录、退出、提交源码或调用报告 POST。下载的 JS 仅作文本／AST 分析，没有加载执行。没有读取或保存账号 Cookie、token、密码、个人源码或隐藏测试数据；记录字段名不记录凭据值。

| 等级 | 本轮实际取得 | 能证明的范围 |
| --- | --- | --- |
| 仓库事实 | 当前四站接口、蓝桥占位、CPH parser 与测试源码 | 现有所有者和接入约束 |
| 当前官网源码 | `v7.52.21` 的主站、学习页、编辑器、提交、报告及详情消费者 | 当前前端预期的地址、字段与控制流 |
| 当前匿名响应 | 2026-11-19 19:39–19:53 的无凭据 GET | 这些请求当时的状态及公开数据 |
| 登录后真实会话 | 未进行 | 账号 schema、权限、Cookie 属性、编译参数及受理链路均待核实 |
| 产品运行／构建验收 | 未进行 | 本轮没有实现或构建蓝桥能力 |

2026-11-12 报告的官网资源为 `v7.52.19`；本轮由题库 HTML 和 runtime 路由重新发现 `v7.52.21`，未直接把旧版资源当作当前实现。官网内部接口不构成平台对第三方承诺稳定的开放 API。

## 当前匿名响应

基础地址由本次公开 HTML 的 `config.axios.browserBaseURL` 确认为 `https://www.lanqiao.cn/api/v2`。表中 API 路径相对此地址；页面路径相对 `https://www.lanqiao.cn`。

| GET 目标 | HTTP | 本轮观察 |
| --- | ---: | --- |
| 页面 `/problems/` | 200 | 公开题库 HTML，引用当前主站及题库脚本 |
| `/problems/pc/` | 200 | 根字段 `count,data,page,page_size`；默认第一页含 `contest_challenge` 场景实验 |
| `/problems/categories/` | 200 | 算法分类 `id:1`，场景实战分类 `id:2` |
| `/problems/pc/?first_category_id=1&page_size=20` | 200 | 当前页包含 `contest_oj`；`21725`“开学报道【算法赛】”为公开列表中的 `is_charge:false` 样本 |
| 页面 `/problems/21725/learning/` | 302 | 跳至 Passport 登录，backurl 为原题；没有跟随或进行登录 |
| `/problems/21725/new/` | 401 | `code:not_authenticated`，消息为“身份认证信息未提供。” |
| `/problems/21725/submissions/` | 401 | 同上，不能当作本人没有提交记录 |
| `/user/basic/` | 401 | 同上，不能凭存在基础设施 Cookie 推断已登录 |

另用历史样本 `1` 的学习页、详情和记录列表核对，分别为 302／401／401。认证切片独立复核 `/user/basic/` 与 legacy `/user/` 也均为 401。匿名记录列表没有提供可供本轮核验的正式提交 ID；没有猜测 ID 后尝试读取他人记录。

公开列表只提供目录元数据。`is_charge:false`、C/C++ 标签、`contest_oj` 或题名中的比赛字样，均不足以独立证明题目采用本期支持的标准输入输出提交模式；实际题型还需读取详情和正常官网界面核实。`21725` 只是后续选题候选，本轮没有看到其完整题面，也没有准备或提交解答。

## 固定源码材料与定位

以下 JS 均来自 `https://assets.lanqiao.cn/lanqiao-fe/v7.52.21/dist/`。哈希标识本轮字节，不保证 URL 今后返回相同内容。定位偏移是从零起始的 JavaScript UTF-16 code unit，不是 UTF-8 字节或源文件行号。

| 文件 | 角色／模块 | SHA-256 |
| --- | --- | --- |
| `ee65c7a.js` | webpack runtime，学习／详情 chunk map | `300577d4b6289bcc5655a5380b6f5f9f8182bda1ba30fbc03fd40ff40546adcf` |
| `5639385.js` | 主站配置、URL 表、auth2、HTTP 包装；主要 module205／629 | `09b97e2f15e1919cb2abf0fc573cdc7090e0e9881bf89aca8227ebcbc1692c78` |
| `811e1ef.js` | universal-header，module216 | `fdcb0077141c9210ce4f0954ee830a5f219b3f3c089d75265bc648216b0f912b` |
| `ac34609.js` | 公开学习路由，chunk385／module8657 | `13f1ff98d79a26f22491e0cf6e65a91f6400cf5854ef1ad27c3cf9744cf305eb` |
| `b3233fc.js` | CourseLearning、题面与提交，chunk113／module2336 | `e20972a029e06017ea35c965d46683baf7e7dd95e71cf7d17a2dd4bfc96cfb5c` |
| `87ae9c7.js` | 语言、编辑器、测试点、轮询，module2487／2469／2420 | `70119a66f7c1b73d99e5c734c27dba93c07b60ddfbc08cfd29dd23156249a910` |
| `7e09ece.js` | 正式记录详情路由，chunk386／module8670 | `674cdfffae7ca1632394c1e423b168ed28c557eb64f44067e217180efc5cae7c` |

### 登录与账号

- 公开题库头部的正常登录入口指向 `https://passport.lanqiao.cn/login/`；主站也保留 Passport iframe 登录弹窗。`5639385.js` 的 module205 在偏移 111453 附近生成弹窗，112357 附近校验 Passport message origin 后关闭并刷新。没有将这些 UI 通知当成已验证账号身份。
- 主站普通请求有浏览器 Cookie 会话的源码证据：module205@232941 的 Axios hook 对相对地址／同 baseURL 请求默认设 `withCredentials:true`；module323@362416 的 js-cookie helper 读取 `lqtoken`；auth2 使用 `/user/basic/`。universal-header module216 还有默认自动读取 basic 的独立路径，故不能写成“没有 lqtoken 就绝不读取身份”。
- module629@556054 的 basic 消费者及头部使用 `id,name,avatar_url,level,member_type` 等字段。`user_sso_id` 与主站 `id` 在埋点中分别使用，不应混作同一个账号标识；登录后的真实结构仍待取得。
- 已读普通流程没有发现 Authorization/Bearer 注入的调用证据；Nuxt Axios 的 `setToken` 只是库能力。query `api_auth` 到 `API-Auth` 是独立条件分支，不作为普通网页登录方案，不构造该值。
- SDK 清理逻辑出现 `_SESSIONKEY`、`_LQUSERTYPE`、`lqtoken`、`JSESSIONID`，只能证明字段名及清理逻辑，不能认定全部都是题库必需凭据。实际 Cookie 的 Domain／Path／Secure／SameSite／HttpOnly、过期、轮换和注销后行为尚未验证。
- Axios 依赖存在默认 `XSRF-TOKEN`／`X-XSRF-TOKEN` 能力，没有证据证明本轮服务端实际发行或要求这组字段。`potential_security_risk` 是源码中的另一种身份读取失败，不能一律归类成退出。
- 当前主站 `/login` 对应的 chunk327／module8599 只重定向课程页；后续人工登录应从当前 Passport 正常入口进入，而非恢复 legacy 密码接口。

### 题面与题型

公开学习路由 `ac34609.js`@3720 对 CourseLearning 传入 `is-contest:true`；`b3233fc.js`@485130 初始化 `setIsContest(true)`。**这是官网内部模型分支名，不等于用户正在参加比赛。** 实际赛事上下文另有 query `contest_id`、`isProblemContest`、`in_contest` 等，首期公开练习不能静默带入赛事目标。

| 来源分支 | 静态消费字段 | 限制 |
| --- | --- | --- |
| 公开 problems 题面 | 有 challenge 时取 `challenge.document`，否则取 `question_stem`；`limit_details[{language,max_runtime_seconds,max_runtime_memory_mb}]` | 具体题目返回的可空性、样例结构、公式和类型仍需登录读取 |
| 课程 online_judge lab | `problem_info.content/max_runtime/max_run_memory/granular_run_limit` | 不属于本期课程接入，不将它与公开题面混称新旧 schema |

题面格式化定位为 `b3233fc.js`@149837、@77897 和 @73566／@77376。限制的秒／MB 来自字段名及官网显示；内存换算基数、不同 C/C++ 限制及原始样例空白仍需真实材料核对。不能把整页所有代码块按奇偶配对后就认定为样例。

### C/C++ 选项

`87ae9c7.js` module2487@10844 的前端目录为：

| 当前官网标签 | 原生提交 token | 静态事实 |
| --- | --- | --- |
| `C++（g++17）` | `cpp` | 未恢复历史语言时的前端默认项 |
| `C（gcc8.3.0）` | `c` | 独立 C 选项 |

官网组件挂载时优先恢复 `localStorage.OJ_LANGUAGE`，没有历史值才选 `cpp`；该组件未提供额外标准选择字段。这只能证明前端标签与 token，不能证明服务端编译器、`-std`、O2、msys2 或所有题目都使用同一环境。本轮没有取得 C++20／C17／O2／msys2 组合可选的证据；不得把标签改写成满足偏好的选项。登录后先核对当前实际目录，再决定如何应用现有默认选择策略；不能从 gcc 版本推断 C 标准。

### 源码发送、执行与报告

当前标准源码分支的静态调用顺序是：

1. `pollSubmitFnReqBody` 构造请求体时通过 `monacoEditor.getValue()` 读取源码到 `submit_content`，包含 `language`、`judge_client:2`，可选 `contest_id` 和非空的 `input_sample`。定位 `b3233fc.js`@384609；这不证明官网具备 OJ Connect 的文档身份／快照冻结机制。
2. `submitProblem(isSubmit=false)` POST `/problems/{id}/submit/`，另加 `is_submit` 和可选 `problem_list_id`；“调试”传 false，“提交检测”传 true。定位 @386593。本期交题必须核实正式提交语义，不能用调试结果代替。
3. 封装 `ok` 后读取 `data.submission_url`。源码将两种 opcenter API 前缀改写成 `/opcenter` 再请求；公开 problems 分支以 `data.data.execute_status >= 2` 作为执行轮询的停止条件。该布尔值不是 Accepted 判定；本轮没有真实 `submission_url` 实例。
4. 执行轮询结束后，去除原 URL 的 query，并用允许字母、数字、下划线和连字符的末段规则提取 `submission_id`。此规则不能证明实际 ID 一定是 UUID，也不能直接套正整数规则。
5. **随后再次 POST** `/problems/{id}/submit-report/`，字段含 `submission_id,is_submit,problem_type:6,judge_client:2` 和可选 `contest_id`。定位 @387428／@387518。该请求不是只读 GET；其服务器副作用、是否落库／记成绩及必要性均未验证，本轮没有调用。

官网执行轮询工具为 `87ae9c7.js` module2420，调用侧位于 `b3233fc.js`@390135／@390482；它按传入 status 结束，使用初始 3 秒及后续有上限的退避间隔。传入的 `300000` 在该调用形态下不是已证实的墙钟总超时，不能据此报告固定五分钟超时或直接迁入产品。

`problem_type:7` 是独立云环境挑战路径，源码常量明名 `PROBLEM_TYPE_CHALLENGE_CODE:7`，要求运行中环境，发送内容不包含 `submit_content`。它不是本期标准源码分支，也不是已证实的填空类型。尚未确证填空模式，不据此推断线上不存在填空题。

### 正式记录与展示字段

| 材料 | 当前静态字段与语义 | 后续核实重点 |
| --- | --- | --- |
| 执行响应 | `submission_url`、`execute_status` | URL／ID 与本次账号、题目、语言、源码如何关联；执行结束与正式结果区别 |
| submit-report 报告 | `submit_content,test_cases,is_passed,pass_rate,score,runtime,memory,message,error_msg` 等 | 实际 schema、是否全部可选、报告 POST 副作用及失败后的恢复方式 |
| 记录详情 | `content,problem_name,created_at,language,is_passed,pass_rate,elapsed_time,memory,pass_sample,status,error_info.error_msg,contest_id` | 正式 ID、owner／problem 证据和源码回读；不把报告字段名直接用到详情 |
| 报告测试点 | `status,millisecond,memory,submit_at,result` | 通过布尔值、英文判词映射、缺失字段、内存单位；无输入输出展示需求 |

详情路由是 `/problems/{id}/submissions/{sid}/`，API 地址为 `/api/v2/problems/{id}/submissions/{sid}/`；后者仅有当前源码定义，没有对任意 sid 发请求。详情由 `7e09ece.js` module8670 消费，显示源码字段是 `content`，不是请求中的 `submit_content`。

官网显示 `elapsed_time`／`runtime`／`millisecond` 为 ms、`memory` 为 kb。`elapsed_minutes` 是解题分钟，不是程序运行耗时；`pass_rate` 是百分比，不应自动当比赛分数。当前详情未消费 `test_cases` 数组，不能保证重新打开一条详情能取得报告中的逐点信息。完整状态枚举、编译错误结构、零值与缺失、内存换算基数均待登录样本核实。

详情源码存在失败测试数据下载动作，本期不采集、不接入该动作；共同记录页只展示实际判题信息，不展示测试输入、输出或答案。

## 仓库接入约束

| 当前所有者 | 需要后续设计明确的接点 |
| --- | --- |
| `SiteId`／Adapter／入口 | SiteId 已有蓝桥，但 Adapter 联合、注册、纯 URL resolver 和登录命令只接四站；占位不是已接入 |
| `domain.ts`／偏好 | 语言目录强制数字或数字加 `:o2`，与 `c/cpp` 不兼容；记录要求正整数且没有蓝桥 URL 分支。按蓝桥真实字段新增本站规则，不放宽四站已有规则 |
| `problemResolver.ts` | 目录外自动猜测目前只排除牛客／CF；新增纯数字蓝桥识别时必须避免把任意 `123.cpp` 自动归到蓝桥 |
| 浏览器宿主 | 快捷键与提交沿用 Global／Workspace 持久会话约束；浏览器 Get／CPH 保留原页面 Session 行为，含现有临时会话路径，不因接入蓝桥收窄四站。蓝桥是否另有限制需阶段二证实；窗口、账户变化和取消由原所有者掌握，凭据留宿主，不新增任意 URL／脚本或 storage 读取接口 |
| `SourceBinding`／提交控制器 | 原文档／文件身份、当前未保存快照、并发立即拒绝、一次发送和受理不明只核对保持；正式记录只能由本次有效回执确认 |
| CPH parser | 现有 `.course-name`、运行限制邻元素和整页 `pre > code` 奇偶配对是假设，只有合成测试；需用真实题面验证，不能据其存在宣称蓝桥 Get Problem 可用 |
| 共同 UI／内容管线 | 继续使用洛谷题面／记录组件、安全渲染、英文判题术语、可选资源字段与显式同源码 CPH；不新增蓝桥独立页面或外围功能 |

源码接点可从 [Adapter](../../extensions/becoder.oj-connect/src/adapters/adapter.ts)、[领域校验](../../extensions/becoder.oj-connect/src/domain.ts)、[偏好](../../extensions/becoder.oj-connect/src/preferences.ts)、[识题](../../extensions/becoder.oj-connect/src/problemResolver.ts)、[宿主](../../src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts)和 [CPH parser](../../extensions/becoder.cph/companion/src/parsers/problem/LanqiaoProblemParser.ts)进入。

## 阶段二真实会话采证方案（尚未执行）

1. **准备隔离环境。** 使用明确的独立用户数据／浏览器存储，先核对生效路径；不复用日常 profile，不覆盖已有 portable 数据。本轮不为此构建或启动产品。
2. **用户完成正常登录。** 打开当前 Passport 官网入口，由用户处理账号和认证；只记录必要 Cookie 结构及本人 basic 的脱敏字段，凭据值保持宿主内。确认账号切换／范围变化后的旧响应不会授权新操作；具体退出实验留待其授权步骤。
3. **先完成只读核验。** 打开一题账号有权访问的免费普通编程题，读取真实 `problemNew`、题型、C/C++ 实际目录、题面／样例／限制及本人已有记录。先确定单题身份、正文 schema、权限和官方源码可读性；不列举全账号历史，不下载隐藏测试数据。
4. **形成具体单次试交卡片。** 根据完整题面确定题目、确切语言 token、源码及哈希、次数上限和停止条件。默认由用户在官网手动提交一次，观察正常请求／执行／报告／正式记录；代理发送需另有针对该卡片的明确授权。禁止使用不透明网站 action 偷发、自动重试或靠旧 AC 认领回执。
5. **观察正式链路。** 核对 `submission_url`、真实 ID、报告调用及最终详情属于同一账号／题目／语言／源码；能回读源码才标为 matched。确认 report POST 的必要性和恢复语义，不能仅凭它返回数据便当成无副作用查询。受理不明只查询，缺少唯一证据则停止。
6. **输出选型建议。** 比较同一 Session 的固定受限请求与确需网页执行的事务，说明凭据、跨 opcenter 域、CSRF 和会话生命周期。只在真实证据足够后形成接入设计，再进入实施计划；本阶段不预定二者之一。

阶段二停止条件：登录／权限无法确认、题型超出范围、语言目录不匹配、回执不能唯一关联、报告作用不明或会话身份变化。先保留最后真实证据，不自动重交、不切换备用发送路线。网络故障、防重、账号切换和迟到响应优先用后续合成回归验证，不能为补材料不断增加真实提交。

## 本轮检查与限制

原始公开页面／JS、匿名响应和研究脚本位于忽略目录 `tmp/lanqiao-stage1-20261119/`；它们不是产品依赖或发布资产，不整体复制官网代码。主要 GET 台账记录地址、方法、无凭据标记、时间、状态、字节数、SHA-256，不记录 Set-Cookie 值。认证切片额外三次匿名 GET 单列于临时 `auth-findings.md`。

本轮检查记录于忽略目录的 `validation-plan.json`／`validation-ledger.json`：

- `node tmp/lanqiao-stage1-20261119/verify-evidence.mjs`：主台账 92 条请求全部为无凭据 GET，85 次 200、2 次 302、5 次预期 401；逐份字节数与 SHA-256 一致，20 个源码锚点及两份文档本地链接／空白检查通过。认证切片额外三次 GET 单列，不冒充已由该脚本核验的原始材料。
- `& .\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1 -RepositoryRoot .`：仓库文档结构检查通过；该脚本不证明协议语义或产品可用。
- `git diff --check -- docs/oj-connect/README.md`：通过；新增报告的空白与本地链接另由上述证据检查覆盖。
- 独立仓库边界审阅发现“浏览器 Get 与快捷键持久会话约束混写”一项，已区分；认证及提交采证者复核未发现阻断性协议误述，并已收窄官网默认语言及读取源码的表述。最后修改后重跑适用文档检查。

没有运行产品测试、typecheck、OI 编译或 stage；这些不用于本轮只读研究的通过声明。未提交或推送。
