# 洛谷会话与交互修复记录

日期：2026-11-15。依据[已确认设计](../superpowers/specs/2026-11-15-oj-connect-luogu-session-design.md)，实施任务见[计划](../superpowers/plans/2026-11-15-oj-connect-luogu-session.md)。本文区分源码、合成验证与真实运行，不将历史提交的 AC 当作新构建验收。

## 最新实现：原生 Session 替换网页承载

负责人反馈上一版提交仍不可用后，明确批准按上游源码替换传输。当前洛谷固定 HTTP 操作由 `luoguSessionClient.ts` 使用内置浏览器同一持久 Electron Session 发出；不再创建 `/ranking` 网页、注入洛谷脚本或轮询 DOM。下文“稳定承载页”和旧测试数量属于先前构建记录。

CSRF 管理器迁入上游4.20.0源码；提交保持其字段、rid 和按“验证码错误”继续原 payload 的规则，不再限定403。验证码复用上游图片面板与输入框，留空刷新；扩展不接收 Cookie。HTTP 每请求6秒超时，人工输入单独可取消；准备句柄不再因选择语言／输入验证码超过2分钟失效。配置和 CSRF 请求共享，取消某个等待者不取消其他任务；明确拒绝、未发出和未知受理分别保留。推送连接按上游方式使用同 Session 登录信息，凭据仅存在主进程，不导出给扩展。

原生43.7.3 Electron 的私有拦截会话测试覆盖无网页提交、400验证码错误／错码续交、源码及语言一致、明确拒绝、丢失回执不重发、307不重放、取消不晚发、推送到终态、未完成记录重开及首次HTTP读取期间关闭不晚建连接。扩展删除旧洛谷网页脚本与相应DOM测试，新增实际注入包断言禁止旧洛谷提交入口；AtCoder网页行为测试保留。测试日志、失败及重跑见 `tmp/oj-connect-audit/shared-workflow/native-luogu-*`。

新生产client在既有独立协议profile进行真实只读验证，无任何网页窗口：登录摘要526ms、P1001题面348ms、既有记录AC读取242ms。这些是单次GET观测，没有真实提交或产品端到端性能结论。报告为 `tmp/oj-connect-audit/native-luogu-read-report.json`。本次stage的快捷键、验证码、正式新ID与结果仍待负责人验收。

测试过程保留失败证据：初次类型检查暴露迁移类型和Web空实现接口缺失，须修正后重跑；Electron测试扩展推送用例后，首次退出0但缺少完成标记，属于测试生命周期失效，不能计为通过；补齐窗口关闭处理后发现fixture缺少WJ/Judging配置，修正后得到完整通过标记。后续构建结果单独记录，不以这些中间检查证明最终包。

### 原生链路最终检查与交付边界

当前原生版本：扩展66项、扩展边界29项、核心UI5项／Bridge6项通过；真实Electron私有Session传输、原生宿主隔离与验证码、AtCoder快捷键合成回归通过。最终client类型检查、定向ESLint、分层检查及OI扩展编译退出码均为0。最终类型检查曾发现测试mock的返回类型与缺少return，修正并重跑通过；首次核心UI测试漏mock事件，修正并重跑通过。所有失败日志保留。

最终命令记录为 `native-luogu-final-typecheck2`、`native-luogu-final-lint`、`native-luogu-final-layers`、`native-luogu-final-oi`、`native-luogu-final-browser3`、`native-luogu-core-bridge`、`native-luogu-electron-final2`、`native-luogu-host-final`、`native-luogu-atcoder-host-final`、`native-luogu-atcoder-shortcut-final`。测试不使用旧bundle证明新源码。

交付阶段只构建Windows stage；构建退出码以 `tmp/oj-connect-audit/shared-workflow/native-luogu-stage.json` 为准，Portable保留／恢复以同目录 `native-luogu-portable-*.log` 为准。构建前保留原Portable数据，构建后恢复；不自动启动产品，不制作Setup。新版本仍须手动聚焦P1001.cpp，按Ctrl+Alt+S，必要时输入图片验证码，核对新rid及评测结果；不继承旧版本真实提交验收。

## 先前网页承载版本记录

- 洛谷使用稳定的同站持久会话承载，普通看题、提交和记录读取不再依赖目标题目／记录页加载。原网页中明确的登录／验证码交互仍可显示。
- 普通题面读取异常不再无条件展开官网；正式 rid 立即返回，不等待记录页导航。扩展仍固定按键时的源码、语言和目标，受理不明不重交。
- 按上游4.20.0内容接口、CSRF管理及推送流程裁剪适配；配置共享请求缓存，取消某个读取不取消其他等待者。账号代际改变使相关缓存失效。
- 初次记录读取后等待 WebSocket welcome/status_push；终态补取正式详情。关闭、取消、首次 HTTP 读取期间释放和立即重试均有对应生命周期保护。
- 独立图标／账号侧栏提供双站登录、退出和刷新。普通持久浏览器新增标签、导航完成和账号 Cookie 变化触发合并刷新；Cookie 变化本身不证明登录或直接清空任务。临时隔离标签不充当共享账号来源。
- AtCoder 原提交事务保留，账号摘要改为新鲜读取；新增按官网表单核对的退出操作。未接入三站不提供假入口。

## 真实只读证据

实际 Electron 为43.7.3，与当前仓库依赖一致，先前概述中的42不是本次运行版本。

专用旧协议 profile 中，原生 session.fetch 在目标题目页加载前与离开后均能读取题目／配置／指定记录，且与网页账号一致。随后直接从 /ranking 承载页的隔离世界调用本次构建的生产站点脚本：P1001题面538ms、准备547ms、记录R309516436终态读取282ms。/ranking 上 WebSocket 正式 join_result 为597ms，真实 welcome.record 含数字状态12。均为单次观测，不是分位数或提交性能基准。

没有真实提交、退出或 Cookie 导出；记录源码未写入探针日志。真实评测中的 status_push、侧栏登录／退出双向一致和新产品快捷键端到端时延仍待负责人验收。

证据位于 tmp/oj-connect-audit/session-redesign：transport-report.json、production-read-report.json、atcoder-logout-inspection.json，保留可复用探针。

## 验证与审查

扩展全套71项测试已通过；站点17项、适配器取消、侧栏操作及核心会话／回执／宿主取消均有覆盖。两站渲染10截图检查通过。核心类型检查、分层检查及scoped TypeScript ESLint通过；后续源修改按影响重跑。

独立审查指出并修正：Cookie删除与同值重加被去重、无条件Cookie失效、普通浏览器未自动观察、临时会话误用、首次读取取消后晚建连接、共享配置取消串扰、记录取消与立即重试竞态、空URL观察器崩溃。主代理负责跨层整合。

失败记录没有抹除：新增测试缺少返回值曾导致类型检查失败，修正后重跑；原生测试第一次使用旧bridge bundle，重建后通过；最初把既有Electron CommonJS夹具纳入“禁止新增JavaScript”规则失败，随后TS严格lint与CJS兼容lint分开运行。CJS仅对不兼容的新增JS和产品本地化规则作显式命令级关闭，其他规则保留，未修改仓库lint配置。

精确命令、退出码与耗时在 tmp/oj-connect-audit/shared-workflow/session-*.json、final-session-*.json；RED/GREEN与探针证据另存session-redesign。打包和新构建验收状态以本次最终交付记录补充为准。没有Git提交／推送、Setup或日常D盘应用修改。

## 本次交付

### 负责人截图反馈后的修正

截图对应日志明确报告活动栏容器 `becoder.ojConnect` 非法：容器 ID 只允许字母、数字、下划线及连字符。账号视图因此回退资源管理器。已改为 `becoder-oj-connect`，并加入 BeCoder 默认固定图标集合；账号视图自身 ID 保持原值，不重置用户布局。

对照上游4.20.0 `features/submit.ts`、`utils/api.ts` 和 `workspaceUtils.ts`，上游提交提示不会持续占用验证码交互入口。OJ Connect 的 Notification 提交进度却会触发原生浏览器的通知遮挡保护，使浏览器验证码不能直接操作。已改为专用状态栏项，点击该项或执行“停止提交”命令可取消；结束时释放状态栏项，没有更改浏览器自身遮挡保护或验证码受理后的续交规则。

原通用提示隐藏了 `oj-connect-operation-timeout`、`oj-connect-page-changed` 等具体原因，现显示原始错误码，保留“受理不明不重交”。旧日志没有保存本次失败的具体错误码，因此通知交互冲突已确认，但不能据此断言截图中的全部提交失败都已归因。新 stage 的真实提交仍须负责人验收。

本轮扩展74项、边界29项、核心类型检查及定向lint通过。精确构建及数据恢复结果见 `tmp/oj-connect-audit/shared-workflow/submit-ui-*.json`；计划与失败分类见同目录 `submit-ui-validation-plan.md`。本轮只交付stage，不制作Setup或启动新产品验收。

### 上一版构建证据

Windows staged构建188.77秒成功，含编译器的直接包验证15.06秒通过，原Portable数据已恢复。候选程序为 C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe；未启动新产品进行真实交题或退出，不继承旧提交验收。最终扩展71项、边界29项、核心UI5项/Bridge6项/取消4项与双站合成事务通过。

保留的既有局限：关闭尚未完成的记录面板会释放宿主记录路由，再从最近记录重开可能显示宿主已关闭；正式ID和官网链接仍保留，不会自动重交。这与保持面板打开时的推送、停止后继续查询不同，尚未在本轮改造，后续需单独补齐恢复路由并验证。
