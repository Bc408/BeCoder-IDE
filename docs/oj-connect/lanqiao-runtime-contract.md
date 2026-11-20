# 蓝桥运行时契约（任务 0）

更新：2026-11-20。状态：**任务0必要契约已补齐，进入已批准的产品实现。** 当前目录来自无凭据静态读取；执行路径来自负责人本次人工提交的真实页面资源与同ID正式记录核对。本文不代表蓝桥已经接入，不授权下一次真实交题。

## 已冻结的目录发现契约

当前公开 `/problems/` 页面声明同一版本目录下的 runtime、主应用和学习页异步 chunk。已用无凭据 `GET` 读取页面、runtime、主应用和已解析的学习页语言 chunk；所有请求均手动禁止重定向、没有 Cookie、没有执行官网脚本、没有访问题目 API，也没有保存请求头或响应中的个人数据。

- 当前采证版本根：`https://assets.lanqiao.cn/lanqiao-fe/v7.52.21/dist/`。
- 主应用路由 `/problems/:id/learning` 对应 `problems-id-learning`，其异步 chunk 编号为 `85`。
- runtime 的 chunk map 将 `85` 解析为 `87ae9c7.js`；因此本轮目录来源为当前页面声明的同版本官方静态资源，而不是硬编码数组或题目 API。
- 语言模块 `2487` 的无参数 `availableLanguages` 返回当前页面目录。它当前有七项，其中 C/C++ 两项为：`C++（g++17）` → `cpp`，`C（gcc8.3.0）` → `c`。
- 可追溯静态位置：`87ae9c7.js`（SHA-256 `70119a66f7c1b73d99e5c734c27dba93c07b60ddfbc08cfd29dd23156249a910`）`availableLanguages` 字符偏移约 `11037`（UTF-16 code unit）／`11363`（UTF-8 byte）；组件 props 只含 `isContest` 与 `panelTheme`，没有题目 ID 或语言目录 API。`b3233fc.js`（SHA-256 `e20972a029e06017ea35c965d46683baf7e7dd95e71cf7d17a2dd4bfc96cfb5c`）父组件只把 `panel-theme/is-contest` 传入，并把选择值原样写入提交请求的 `language` 字段。
- 产品只允许从受限的静态资源来源提取这两个 C/C++ 目录项；未知 HTML、runtime map、chunk 结构、标签、token 或额外脚本版本立即失败，不执行页面 JavaScript，不把 `limit_details` 当作编译器目录。

这项证据证明“当前官网前端显示可选的 C/C++ 项”，不证明每道题的服务端语言许可、实际编译参数、C++ 标准、O2 或 msys2。题目详情的 `limit_details` 只用于 C/C++ 资源限制，提交前仍需以当前题目实际目录和权限核对。

## 已冻结的题型边界

题目读取必须确认公开详情、当前账号可访问、非运行中赛事上下文、非云环境挑战、非交互／output-only／课程 lab。`type: contest_oj` 与 `in_contest:false` 是当前已采样普通题的事实组合，但不能单独证明所有题目都属于首期支持范围；`contest_id`、`vm_config`、challenge／lab 字段和题面输入输出语义仍需逐题核对。学习路由内部传入 `is-contest:true` 是官网页面分支名，不能用它推断正在参赛。可由现有证据支持的本地拒绝条件包括：详情读取失败或关键字段缺失；`in_contest:true`；赛事 query／path（如 `contest_id`、`problem_plan_id`、`/contests/`、`/oj-contest/`、`/challenges/`）；明确的 challenge、云环境、课程 lab、考试、交互或 output-only 语义。没有负样本实交证据时，这些是产品保守边界，不宣称服务端已返回拒绝。

## 已冻结的执行地址

已有真实样本只保留：

- 回执 origin：`https://opcenter.lanqiao.cn`；query 键：`is_submit`、`judge_client`；
- 正式记录页：`https://www.lanqiao.cn/problems/254/submissions/6afef328b965494e51a31037/`；
- 执行状态曾返回 `execute_status:2`，正式记录 ID 为 `6afef328b965494e51a31037`。

正式记录页不能反推出源码提交回执的 `submission_url` pathname。此前定点 inspector 恢复返回 `SAFE_PROJECTION_UNAVAILABLE`，没有取得路径；后续负责人按新卡片人工提交一次，才由当前真实页面资源与正式详情取得[执行路径补证](lanqiao-execution-evidence-2026-11-20.md)。原始失败与恢复方式单列，不反向补填HTTP码。

固定地址为 `https://opcenter.lanqiao.cn/api/v1/evaluation/questions/{questionId}/submissions/{submissionId}/?is_submit=true&judge_client=2`。questionId为当前真实详情的正整数 `question_id`，不能用problem ID代替；submissionId为本次source回执的24位小写hex。拒绝凭据/端口/fragment/重复或未知query、额外路径、不同questionId/ID、重定向。生产只采用此opcenter直连，不按同域放行整个API，也不自动改走 `/opcenter`。

其余固定操作：主站basic GET `/api/v2/user/basic/`；题面GET `/api/v2/problems/{id}/new/`；本人列表GET `/api/v2/problems/{id}/submissions/`；正式详情GET `/api/v2/problems/{id}/submissions/{sid}/`。source POST `/api/v2/problems/{id}/submit/`仅含`language,submit_content,judge_client:2,is_submit:true`；report POST `/api/v2/problems/{id}/submit-report/`仅含`submission_id,is_submit:true,problem_type:6,judge_client:2`。两项POST各一次，未决/取消后只GET，报告缺失不补发。执行`data.execute_status>=2`仅停止执行查询，不代表AC；初始3秒后有界退避，总跟踪约120秒，单请求15秒/4MiB。账号用basic主站id；不同SSO字段不互换，403/网络错误为unknown。

## 证据与限制

静态目录提取的脚本与输出保存在本地忽略的 SDD 工作区；真实产品登录、固定读取和一次官网 C++ AC 的范围与限制见[真实产品会话验证](lanqiao-native-session-evidence-2026-11-19.md)及[阶段二官网实交](lanqiao-authenticated-evidence-2026-11-19.md)。执行 pathname 的后续补证以上述2026-11-20记录为准；这些历史读取证据不授权额外真实提交。
