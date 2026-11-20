# 蓝桥公开题库：阶段二真实会话采证

[开发入口](README.md) · [阶段一协议证据](lanqiao-protocol-evidence-2026-11-19.md) · [技术架构](architecture.md)

2026-11-19，Asia/Shanghai。源码基线仍为 `OJ_connect@ce98c93aceeee40bbf09220fd0a1a327dd8f5409`。负责人批准阶段二，手动完成独立会话登录，并按限定卡片在官网提交一次；本轮未修改产品源码、构建、提交或推送。

**结论：蓝桥公开题库的一条真实 C++ 正常提交链已取得证据，正式记录 `6afef328b965494e51a31037` 为 AC，5/5，通过官网详情回读源码与实际发送稿哈希核对。** 该结论属于官网协议采证，不是 OJ Connect 产品能力验收，也不证明原生 Session 提交路线已可用。

## 本轮范围与隔离

- 只研究公开题库的 C/C++ 编程练习。实际发送只覆盖 C++，未发送 C、CE、WA、比赛、云环境挑战或会员受限题。
- 用户手动登录、选择语言、粘贴代码并点击一次“提交检测”；代理只读取固定身份／题目／本题记录，并观察此次官网自然发出的请求，没有主动发送提交或报告 POST，也没有自动重试。
- 研究目录为 `tmp/lanqiao-stage2-20261119/`。独立 Electron 使用该目录的 `profile`、`sessions`、`logs`、`crashes`；后续 Edge 使用另一个 `edge-authenticated-profile`。实际路径已经核验，不读日常 Edge、BeCoder portable 或其他安装的数据。
- 账号只保留随机盐 HMAC；联系方式等只记字段类型。Cookie 只记名称、作用域及标志，不存值。源码正文不落研究日志，只记实际发送和官网回读的长度与 SHA-256；不读取隐藏测试输入输出。
- 原始网络 headers／完整 CDP／HAR 未落盘。提交与报告只记录请求头名称、业务字段名称及必要投影；`submission_url` query 仅记录键名，不记录值。

## 登录与传输：成功证据和失败证据分开

### 已观察的失败

独立 Electron 43.7.3 在访问蓝桥主站／Passport 时出现 `ERR_SSL_BAD_RECORD_MAC_ALERT`；尝试关闭 HTTP/2 曾到达登录地址，但用户观察持续转圈，不能算登录表单可用。随后 Electron 在 HTTP/1.1 以及限制 TLS 1.2 的尝试中仍出现该错误。

独立 Chromium、独立 Edge 的默认连接也复现相同错误；同机 Node 匿名 GET 两站页面返回 200。用户说明日常 Edge 页面正常、未使用代理。研究器解析到两域同一 IPv4 地址，Session 代理为 DIRECT；这些观察没有确立服务端、系统网络或 TLS 实现中的具体根因。

### 本轮有效采证环境

独立安装版 Edge 限定 TLS 1.2 后显示 Passport 登录表单，用户确认界面正常并手动登录。本人 `/api/v2/user/basic/` 返回 200。后续读取题面和本人记录也成功，独立浏览器正常关闭／重开后仍能读取账号；仅证明同一 profile 的短期重启保留，不是长期会话稳定性或完整退出验收。

题目页加载时，`assets.lanqiao.cn` 多个脚本仍发生 TLS 错误。为研究官网自然调用链，本轮对固定官网 `/lanqiao-fe/` 下的公开 script／stylesheet／font GET，使用无凭据 Node fetch 获取原始 body 再交付浏览器，逐份记录 SHA-256。没有修改 JS body；研究响应补设 content-type、no-store 与允许跨域的资源响应头。登录、源码提交、执行查询和报告 API 未被此路由改写或代发。

该措施是**研究环境的静态资源传输处理**，不是生产候选，不证明 BeCoder 原生内置网页登录已经解决。后续设计不能把限制整个应用 TLS 版本、全局拦截网页资源或依赖外部 Edge 作为已批准产品方案。最终试交研究进程启用了 Chromium sandbox；此前工具初始化尝试不作为本次运行环境的验收证据。

## 登录态、题面与语言

| 对象 | 本轮真实事实 | 不能扩张成的结论 |
| --- | --- | --- |
| 当前身份 | 同一独立会话 GET basic 200；返回主站 `id`、独立 `user_sso_id` 等，敏感字段仅记录类型 | 两种 ID 等价、Cookie 存在即登录 |
| 同进程账号关联 | 最终试交前后 HMAC 相同 | 重启后重新生成盐的不同 HMAC 代表换号；正式记录已显式返回 owner |
| Cookie | `lqtoken` 位于 `.lanqiao.cn`、Path `/`，本次为持久 Cookie、HttpOnly=false、Secure=false、SameSite=Lax；另见基础设施与统计 Cookie | 已证实最小凭据集合、所有 Cookie 都是认证必需、已经验证撤销／轮换 |
| 候选 21725 | 详情 200，`contest_oj`、`in_contest:false`，题面无输入；本人记录列表为空 | 单靠站点列表类型就能确定所有题型 |
| 实交 254 | 官网 A+B 示例题，公开列表标为免费；详情 200，`contest_oj`、`in_contest:false`，普通标准输入输出 | 覆盖全部公开算法题或填空／交互模式 |
| 题面 schema | `question_stem` 是 Markdown 字符串；C／C++ 对应 `limit_details` 为 1 秒、256 MB | MB 的二进制／十进制换算已验证 |
| 语言 | 用户按卡片选择官网 `C++（g++17）`；实际请求 `language:cpp`，正式列表与详情也为 `cpp` | 实际 `-std`、编译器版本、O2／msys2 或 C 提交已经验证 |

真实题面 254 含多段示范代码和一组 `1 2` → `3` 样例。现有 CPH 蓝桥 parser 扫描整页所有 `pre > code` 并按奇偶配对，不能直接作为新题面结构化样例提取方案；必须按真实语义区分示例代码与样例输入输出。本轮没有改 parser 或宣称其通过真实兼容验收。

## 单次提交与正式记录

本次题目为 254 — A+B 问题【OJ 示例题目】，C++ token `cpp`，`is_submit:true`。提交前本题本人记录列表为 HTTP 200、零条。用户在被监听的原标签完成一次提交，反馈官网显示通过。

| 时间（2026-11-19，+08:00） | 事实 |
| --- | --- |
| 20:53:26 | 本题本人记录列表 200，results 为空 |
| 20:59:34 | 最终研究进程 basic 200，建立本次进程账号 HMAC 基线 |
| 21:00:09 | 题目页 254 已加载；尚无源码 POST，账号已确认，资源失败列表为空 |
| 21:01:28.281 | 观察到一次源码 POST `/api/v2/problems/254/submit/` |
| 21:01:28.576 | 该 POST 返回 HTTP 200，响应含 `submission_url` 和 `judge_client`；从 opcenter 回执取得 `6afef328b965494e51a31037` |
| 21:01:32.018 | 官网执行 GET 返回 200，`data.execute_status:2` |
| 21:01:32.015／32.301 | 官网自然发送 submit-report POST，同一 submission_id、`problem_type:6`、`is_submit:true`；报告状态 AC、5 个点全部通过 |
| 21:02:51 | 本题本人记录列表 200，唯一新条目为同一 ID，语言 cpp、通过率 100 |
| 21:03:08 | 正式详情 GET 200，ID／problem_id 254／语言 cpp／AC 一致，源码回读哈希匹配实际发送稿 |
| 21:03:30 | basic 再次 200，同一进程的账号 HMAC 与提交前一致 |

执行响应与 report 请求的宿主异步观测回调存在几毫秒交错；表中时间是观察时钟，不用这一交错推翻官网静态代码的执行后取报告顺序。完整点击到首绘、p95 或长期可靠率本轮没有测量。

### 本次实际字段

- 源码 POST 字段为 `language,submit_content,judge_client,is_submit`，没有 `contest_id`、`input_sample` 或 `problem_list_id`。
- 回执来源是 `https://opcenter.lanqiao.cn`，query 键为 `is_submit,judge_client`；正式标识是本次观察到的 24 位小写十六进制字符串。它不是十进制数字；不能由一条样本推断今后都固定为这一形状。
- 官网随后调用 `/api/v2/problems/254/submit-report/`，请求字段为 `submission_id,is_submit,problem_type,judge_client`。没有源码字段，不是第二次源码发送；它依然是 POST，其服务端副作用不能被称只读查询。
- 报告有 `is_done,is_passed,status,score,runtime,memory,submit_content,pass_rate,test_cases` 等；详情有 `content,submission_id,problem_id,language,status,elapsed_time,memory,pass_sample`。源码请求／报告字段为 `submit_content`，详情字段为 `content`。
- 详情实值为 `status:AC`、`is_passed:true`、`pass_rate:100`、`elapsed_time:25`、`memory:1672`、`pass_sample:"5 / 5"`。官网静态界面将时间标为 ms、内存标为 kb；内存换算基数尚未另行证实。
- 报告的五个测试点分别使用 `status,millisecond,memory,submit_at,result`。本轮只保留通过布尔值、耗时及内存，不保留 result 中可能包含的输出或任何隐藏测试内容。

### 源码与身份核对的证据强度

实际发送稿为 163 UTF-8 字节，换行规范化后的 SHA-256：

`b5ccf93fc6d33aba05fa1295eff8925d84bf99bb5e6eb87dd292480bf4473612`

报告和正式详情回读均与此归一化哈希一致，三处原始长度也均为 163 字节；未宣称未经换行规范化的逐字节比较。准备文件 `tmp/lanqiao-stage2-20261119/254.cpp` 为 164 字节，原始哈希是 `c6aa7b39931b42b85a30ccb4fb525771e989e2bfba35672c2d62dcffe60dadd6`；仅去掉文件末尾一个 LF 后的哈希与实际发送稿一致，不为此差异重交。

账号证据为同一浏览器 Cookie 会话、本人列表、提交前后同进程身份一致；详情没有显式 owner 字段，因此没有“官网详情 owner 与本人 ID 逐字段相等”的证据。题目、原始 ID、语言和实际发送源码则由回执及详情分别核对。

## 研究器限制与未验证项

两项日志瑕疵已识别，不能反向改写原始材料：

1. report 事件的业务 `status:AC` 覆盖了该事件原先的 HTTP status，故本轮没有独立保留其 HTTP 码；源码提交和执行查询的 HTTP 200、后续详情 GET 200 均独立保留。不能据最终 AC 补填 report HTTP 200。
2. report 本身没有 language 字段，研究器当时写出的 `languageMatchesObservedSend:false` 是缺字段比较的结果，不是语言冲突证据；正式列表／详情中的 `cpp` 才是实际语言核对，详情比较为 true。

此外，尚未验证：

- 正常默认配置的 Electron 登录、跨进程持久 Session 的原生源码发送，以及不依赖研究静态资源处理的产品页面旅程。
- report POST 是结果整形、记录持久化、练习统计还是兼有；未调用 report 时记录是否存在；回包丢失后能否安全恢复或重取报告。本轮只观察正常官网动作，不额外 POST 探测副作用。
- 全部阶段、CE／WA／未知结果、编译诊断、限流、重复源码、CSRF 的实际服务器要求、账号撤销／切换、权限失效和超时边界。
- C 编译器、C++20／C17 基准的可达性、真实编译参数，以及每题语言限制差异。当前目录只有较旧标签，不能伪造更高标准。
- 正式详情响应没有逐点 `test_cases`；仅在本次报告取得逐点数据。重开记录是否可安全重新取得逐点信息尚未证明。

## 下一阶段建议与门槛

共同 UI、SourceBinding、CPH、偏好和四站提交链继续由原所有者维护。基于本次证据，建议下一阶段先讨论蓝桥专属的受限 Session 请求设计，明确两项前置问题，再决定实施：

1. **人工登录的产品可行性。** 原生浏览器必须能在标准安全边界内完成官网正常登录；研究用 Edge 与静态资源处理不能成为交付证明，也不允许自动导出日常浏览器凭据。
2. **源码发送与报告的事务边界。** 一次源码发送取得执行标识后，如何形成正式记录、何时请求 report、report 失败如何保留身份及继续查询，需要先取得足够证据或规定明确的保守行为；不能套用 CF／牛客直接 ID 回执的全部语义。

若固定 Session 请求仍需实际验证，应先形成包含题目、语言、确切源码、次数和停止条件的新卡片，由用户决定是否执行；本次一次人工提交不授权后续自动实交。CE／WA 和故障边界优先用已采证结构的合成回归补齐，不为增加覆盖连续制造真实记录。

蓝桥记录 ID、`c/cpp` 语言 token、题型、样例及单位规则应按站点局部扩展。既有四站的校验、一次发送、不明受理只查询和浏览器 Get 的原 Session 行为保持。先完成设计及实施计划对齐，不因本次 AC 直接开始产品实现。

## 材料与检查边界

临时目录保留 `edge-events.jsonl`、有效隔离 marker、匿名传输对照、源码试交卡片和研究器；包含登录态的私有 profile 不纳入 Git、fixture 或发布包。阶段一官网固定脚本及哈希继续见前文档。

本轮检查仅针对原始事件关联、哈希、公开静态 body 采证、文档一致性及本地链接，计划与结果保存在临时目录的 `validation-plan.json`／`validation-ledger.json`：

- `node tmp/lanqiao-stage2-20261119/verify-evidence.mjs`：通过。核对一次源码 POST、一次官网 report POST、同一执行／正式 ID、空列表到唯一新条目、归一化源码哈希、详情语言和同进程账号一致；57 份有阶段一同名采集材料的公开静态响应体哈希一致；三份文档的本地链接与空白检查通过。
- `& .\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1 -RepositoryRoot .`：通过，仅证明文档结构。
- `git diff --check -- docs/oj-connect/README.md`：通过；新增两份报告的空白检查由证据核验覆盖。
- 独立只读语义复核未发现阻断项，确认没有把单次官网采证扩大为产品验收或实施授权。最终文档修改后重跑适用检查。

产品源码没有变化，不运行源码构建或用旧 stage 声称新能力通过。网络正常、长期稳定率和产品验收均不由这些检查证明。研究会话及资料留在本轮忽略目录，不删除登录数据，不提交或推送。
