# 洛谷接入协议证据

[实施计划](luogu-shared-workflow-plan.md) · [共同流程设计](shared-workflow-design.md)

日期：2026-11-12。本页分开记录源码参考、匿名读取与真实账号验证；旧插件或一次匿名读取不证明账号提交可用。

## 固定来源

- 用户提供的 `yltx.vscode-luogu-4.18.2.vsix`，SHA-256：`1dfd9a23ca8d7e117ad5041dd1b579fa1a9df469e1658e990d09771718b47b64`。
- 已查看上游 [api.ts](https://github.com/yltx/vscode-luogu/blob/master/src/utils/api.ts)。网页 master 用于交叉核对；实际迁入的 fetchResult 逻辑以用户 VSIX4.18.2 及其 SHA-256 固定来源，保留 MIT 声明。
- 匿名原题：[洛谷 P1001](https://www.luogu.com.cn/problem/P1001)。curl 实际获取 HTML，解析 `#lentille-context`；仅保存题目对象，不保存 Cookie／CSRF／认证上下文。
- 负责人已同意 P1001、由代理准备 C++ 解答、用户手动登录及一次测试提交。专用 Electron 协议窗口与产品会话分离，不能用该窗口通过证明 BeCoder 新扩展已验收。

## 证据表

| 操作 | 当前事实 | 证据与限制 |
| --- | --- | --- |
| 题面 | 官方 `/problem/P1001` 的 `#lentille-context`；`data.problem` 含 pid/name/content/acceptLanguages/samples/limits，`data.translations` 可选 | 匿名 HTML 实测，仅保留题目对象 |
| 正文／样例 | content 的 background/description/formatI/formatO/hint/locale；样例原始换行保留 | 匿名实测 |
| 限制／语言 | time 为毫秒数组，memory 按 KiB 转 MiB；官方 `/_lfe/config` 的 CodeLanguage 提供标签／扩展名／O2，RecordStatus 提供状态 | 配置匿名实测，记录字段账号实测 |
| 登录 | 根 user.uid/name/null；错误或缺失为 unknown | 账号窗口已确认 signed-in；不读取／导出 Cookie |
| 提交 | POST `/fe/api/problem/submit/P1001`，code/lang/enableO2/captcha；本次 lang27、enableO2=1 | 用户手动提交，观察器不记录验证码值 |
| 验证码 | 首次 HTTP403，errorMessage 精确“验证码错误”、没有 rid；人工完成后后续请求 HTTP200、rid309516436 | 当前账号实测；不能将超时／网络断开误当明确拒绝 |
| 正式记录 | `/record/309516436` 的 data.canViewCode/canViewStatus/record；record 含 id/status/score/time/memory/language/user/problem/sourceCode/detail | 当前账号刷新实测，status12、score100、time40、memory1064、language27；用户确认 AC |
| 判题详情 | detail.compileResult.message 与 judgeResult.subtasks[].testCases | VSIX4.18.2 对应字段参考；本次简单 AC 未覆盖编译错误与全部分组 |
| 更新 | 按上游 fetchResult 读取明确 ID 的 `_contentOnly=1`，选择 data／currentData；当前共同控制器定时刷新 | VSIX4.18.2 对应实现与私有 Electron fixture 验证，尚待新产品真实验收 |

## 实施 recipe 与验收边界

Task1 发送门禁已通过，允许按已核实字段实现洛谷适配。负责人指示“照着洛谷的插件的行为即可”：明确验证码拒绝后继续同一逻辑任务；网络失败／受理不明仅查询核对，已有正式 ID 只读该记录。同一逻辑任务不生成第二条已受理记录。

真实记录 R309516436 的提交源码 SHA-256 与准备文件不相同，不能写成准备解答已被逐字验证。专用窗口的成功只证明本次站点协议，不代替新 OJ Connect 统一旅程的负责人验收。

脱敏日志位于 `tmp/oj-connect-audit/shared-workflow/`：仅请求字段名、语言／O2、源码摘要、rid／状态及可读错误，不输出密码、Cookie、验证码值或请求头全集。
