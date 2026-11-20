# 蓝桥真实产品会话验证

[开发入口](README.md) · [接入设计](../superpowers/specs/2026-11-19-lanqiao-public-practice-design.md) · [阶段二官网实交](lanqiao-authenticated-evidence-2026-11-19.md)

2026-11-19，Asia/Shanghai。负责人已确认设计并批准先推进隔离的原生登录与读取验证，随后在本次真实产品开发窗口中手动完成登录。本轮未修改产品源码、构建、发送新解答、调用 report、提交或推送。

**当前结论：默认安全配置下，真实产品 Global BrowserSession 的三源匿名原生 GET、匿名登录表单、用户人工登录及本人固定材料读取均取得成功证据。** 这没有证明蓝桥原生发送或完整产品接入；精确执行地址及实施计划门槛继续分列。

## 运行入口与证据绑定

源码基线 `OJ_connect@ce98c93aceeee40bbf09220fd0a1a327dd8f5409`，产品源码工作区无改动。使用现有 `node_modules/electron/dist/electron.exe` 加载仓库根的真实 `out/main.js`，并设置开发入口环境；不是另建研究 BrowserWindow，也没有复制浏览器 profile。

正式读取使用 Electron 43.7.3／Chromium 150.0.7871.250。按仓库 `build/next/index.ts` 的真实转译参数，在内存中重转译关键源码并与现有输出逐字节比较：首次读取前 13 份匹配；补查产品 debugger 所有权后扩为 14 份，全部匹配。没有向 `out` 或其他生成目录写入。此绑定只覆盖所列关键路径，不声称整个已有 stage 是当前 HEAD 的可重现构建。

选择开发入口的原因：现有 stage 的 `product.json.commit` 是前一构建时点，且改名 packaged BeCoder 会按安装规则覆盖 portable 根。不能只凭 EXE 哈希、命令行参数或过期构建 manifest 断言当前应用代码与隔离状态。

研究根为 `tmp/lanqiao-native-20261119/`。新建 portable/shared/extensions/logs/crashes，启动后核验实际 appPath、userData、sessionData、defaultSession storagePath；通过真实 Open Integrated Browser 创建无 URL 的 Global 浏览器，再核验实际 BrowserSession storagePath 与真实 WebContents 的 Session 身份。全部通过后才触站。后续页面与登录复用刚核验的同一研究 profile；没有读取日常 BeCoder、外部 Edge 或其他安装的数据。

保留默认 UA、TLS、代理、证书和 sandbox；没有禁用工作区信任或复制 Cookie，没有使用阶段二的外部 Edge／静态资源转交。进程实际参数未发现 TLS、HTTP2、代理、证书或 no-sandbox 覆盖。取得的是产品已经注册的 BrowserSession；未用 `fromPartition` 或模拟服务补造研究 Session。

## 匿名原生读取

原生 GET 采用与当前产品传输一致的 `net.request` 和真实 Session，`useSessionCookies:true`、`redirect:manual`、`cache:no-store`。该 profile 当时未登录。固定三项各发一次，没有自动重定向、POST 或重试。

| 目标 | HTTP | 耗时 | 结果 |
| --- | ---: | ---: | --- |
| 主站 `/problems/` | 200 | 719 ms | 76259 字节 |
| Passport `/login/` | 200 | 510 ms | 3880 字节 |
| 已采证静态 `5639385.js` | 200 | 274 ms | 732301 字节，SHA-256 与阶段一相同 |

三源实际 `resolveProxy` 均为 DIRECT；主站／Passport DNS 本轮解析为同一 IPv4，assets 解析为多地址。没有取得实际协商 TLS／ALPN，不能据此断言先前错误的根因或声称修复了 TLS。成功仅代表本次固定样本，未测 p95 或长期稳定率。

## 真实匿名首屏与人工登录

真实 WebContentsView 先只加载 `about:blank` 使 renderer 就绪，再导航官网 Passport。`page-prepared` 的有效地址为 `https://passport.lanqiao.cn/login/`，readyState complete，可见密码输入框 1 个。匿名截图人工核对为完整密码／短信登录页，具手机号或邮箱、密码和登录按钮；没有凭任意输入框与“登录”文字判定成功。

此导航的 18 条自然请求均观测到 HTTP 200，包含一条阿里验证码初始化 POST；它由官网脚本自然产生，属于已确认的匿名导航边界，不是受控 GET 或提交动作。自然请求仅保存 method、origin、安全路径／脱敏标记、resourceType、status 或错误码；不保存 raw headers、query 值或 body。

随后重开同一研究 profile，将真实内置登录页交给负责人，负责人回复“已登录”。登录前即移除网络观察器；未记录输入凭据或认证过程。该重开导航最后四条自然请求没有保留状态，不把它与前一次合称两次 18/18 成功。登录成功由本人 basic GET 200 另行确认，不由表单消失或 Cookie 存在推断。

## 同 Session 固定读取与关联

以下均是使用刚登录的真实 BrowserSession 发出的固定原生 GET；没有通过 Playwright 的 Node-side APIRequestContext 代发。

| 时间（2026-11-19，+08:00） | 操作 | 结果 |
| --- | --- | --- |
| 22:22:53 | `/api/v2/user/basic/` | 200，具有主站 ID 与独立 SSO ID，仅保留同进程随机盐 HMAC |
| 22:23:22 | 254 题详情 | 200，id 254、contest_oj、in_contest false、Markdown 为字符串 |
| 22:23:48 | 254 本人提交列表 | 200，返回已知正式 ID `6afef328b965494e51a31037`、cpp、通过率100 |
| 22:24:21 | 同 ID 正式详情 | 200，题号254、cpp、AC、5 / 5、25 ms、1672 kb；本轮未取得 test_cases 数组 |
| 22:24:57 | basic 再读 | 200，与读取前同进程账号 HMAC一致 |

详情源码为 163 UTF-8 字节，CRLF→LF 后 SHA-256 为 `b5ccf93fc6d33aba05fa1295eff8925d84bf99bb5e6eb87dd292480bf4473612`，与阶段二实际发送稿一致。没有保存源码正文、隐藏输入输出或原始报告。阶段二未见显式 owner，本轮未另行保留该字段存在性；账号关联来自同 Session 的本人身份、本人列表与前后身份一致，不宣称 owner 逐字段核验。

题目限制投影出现 `limits:[]` 是工具瑕疵：过滤器用了提交 token `c/cpp`，官网限制表实际语言标签为 `C/C++`。原始结果保留，不反向修改；不能据此说官网没有限制，也不能把阶段二取得的1秒／256MB冒充本轮新取得的数据。

## 失败尝试与解释边界

原始失败全部保留在研究目录，未当作通过证据：

1. `first`：基础隔离通过，Playwright 主进程 evaluate 的动态 import callback 缺失，exit 1，网站 GET 为零。改为通过 Node 内置 module loader 读取产品已缓存 ESM，且仍要求真实注册表／WebContents 身份一致。
2. `first-corrected`：三次原生 GET 全部成功；页面导航前重复 attach 产品已经拥有的 debugger，exit 1。原日志标为 runtime-probe，语义上是采证编排失败，不是官网或产品传输失败。
3. `page`：安装观察器时达到180秒整轮上限，官网 loadURL 尚未执行，没有首屏结论。
4. `page-prepared`：只读调查发现空白 WebContents 的 renderer PID 为0；先初始化 about:blank 后PID变为15176，观察器与官网首屏随即成功。这支持观察器准备缺失的解释，不证明旧 TLS 错误原因。

计划最初限制两次完整进程；上述编排修订增加了实际启动次数，不能缩写成只有“两轮”。受控三源 GET 仍总计三次；页面与人工认证的自然请求另计，不混入受控 GET 数量。

## 尚未证明与下一门槛

- 蓝桥原生 source/report 发送、全部失败判词、实际 C 提交、report 副作用与幂等性仍未验证；官网一次 AC 和本轮旧记录读取不授权新交题。
- 本轮仅覆盖源码开发宿主及同进程身份稳定，不证明已安装版、Setup、长期会话、退出撤销或认证后跨进程持久化。
- 精确执行 pathname 尚待从既有证据补齐；不能猜路径、扩大到整个 opcenter API 或为补证自动提交。
- 原生读取与首屏门槛已取得证据。负责人后续允许正式开发文档现在落盘；[实施计划](../superpowers/plans/2026-11-19-lanqiao-public-practice.md)已将剩余精确执行地址和当前目录获取契约列为产品实施前置任务，仍须计划审阅批准；产品源码、四站协议与CPH核心未改。

后续曾对原研究进程作一次已审阅的定点执行地址恢复，返回 `SAFE_PROJECTION_UNAVAILABLE`、exit 1，没有取得真实pathname。仅能确认投影没有成功，不能推断路径不存在、Set为空或官网变化；合成测试不是官网证据。未发网站请求，没有新提交或report；临时inspector关闭及原进程恢复已另行复核。该失败保留在研究目录，不能因进入规划自动重试或猜路径。

临时卡片、入口、原始失败、有效路径、哈希与事件均位于忽略研究目录。`login` 实例已由固定 close 动作正常关闭，profile保留，不退出账号或删除数据。

本轮冻结的检查与结果保存在该目录的 `validation-plan.json`／`validation-ledger.json`：

- `node tmp/lanqiao-native-20261119/verify-native.mjs`：核对14份绑定、有效路径、三次原生GET、匿名表单投影、5次身份／材料读取与既有源码哈希。
- `node tmp/lanqiao-stage2-20261119/verify-evidence.mjs`：复核前期一次源码／report与五份文档的本地链接、末尾换行及空白。
- 仓库文档结构验证与 `git diff --check -- docs/oj-connect/README.md`；新增文档空白由前述证据脚本覆盖。

这些检查不替代人工截图核对、真实登录与原生请求结果。源码构建或旧 stage 不用于替代本轮运行证据；最终文档修改后重跑适用检查。
