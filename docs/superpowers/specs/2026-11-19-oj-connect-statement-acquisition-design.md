# OJ Connect 单文档题面读取设计修订

2026-11-19。依据[真实隔离诊断](../../oj-connect/statement-performance-2026-11-19.md)，负责人要求“继续推进，直到达成收敛条件”，授权在原保护范围内连续实施与验证；本修订把此前未定的取文接口具体化，不重复设置审批等待。前两阶段已实现功能保持，源码仍为 OJ_connect / 4e886464 加未提交修改。

## 方案和取舍

采用“当前持久 Session 一次原生 GET → 一次性离线本地解析 → 原 ProblemDocument”。AtCoder 免去官网导航及串行二次 GET；CF 免去官网导航，继续复用既有 CPH 样例／限制和 OJ 结构整理，不重写题目语义。

另外两条方案不采用：workbench 直接解析原始整页会引入 Trusted Types／CSP 与资源加载边界；jsdom 生产化增加重量和许可打包闭包。短命本地 WebContentsView 无需依赖，只加载固定无资源壳，隔离且可用真实 Electron 证明远程 HTML 不执行或联网。每请求创建、finally 关闭，不建页面池、队列或预热。

## 拥有者和固定接口

- 扩展现有 readProblem 命令保持，AtCoder／CF 增加 requestId 和取消桥；先注册取消，返回后检查 signal，拒绝迟到结果。Luogu／Nowcoder 不变。
- workbench 新路由 `readOjStatement(windowId, scope, problem, requestId)`；owner 来自当前窗口，scope 来自现有 resolveStorageScope，前后校验生命周期与 scope。不创建、导航、停止或复用任何用户题页。普通内置浏览器导入与 Import to CPH 路由不变。
- main 快捷键通过现有 ojSession(windowId, scope) 取得 Global／Workspace Session，不导出 Cookie、不使用提交 client。浏览器 Get 在 owner／当前题号校验后保持原网页 BrowserSession（包括临时会话），不把 scope 换成别的 Session，并监听本次网页关闭／导航以取消对应 requestId。固定 transport 只接 ProblemRef 与 AbortSignal，不接受任意 URL/method/header/body。请求登记至 ojReads，取消早于登记使用有界 tombstone；窗口关闭、停用、timeout 走原 cancelOjOperations。无自动重试、无失败后切传输或导航。
- AtCoder URL 必须精确为 `https://atcoder.jp/contests/{contest}/tasks/{task}` 且 nativeId 一致；CF 精确为 `https://codeforces.com/contest/{contest}/problem/{INDEX}`。拒绝 query/hash/credentials/其他站及路径。范围仍为当前支持的题源。
- GET 使用 Electron net.request、原 Session cookies、manual redirect、no-store、无 body。只接受 200 text/html（可带 UTF-8 charset），同站登录重定向报既有 login-required；其他重定向、403/挑战、非 HTML、坏状态均明确失败。传输最多 8 MiB UTF-8 bytes，15 秒限时，业务 ProblemDocument JSON 仍独立限 8 MiB。旧 AtCoder 原始 HTML 限制曾是 UTF-16 code units，新传输字节上限更严格，此处明确收紧以保证有界输入；普通竞赛题无预期影响，边界有回归。

## 解析执行边界

main 读取固定 CPH／OJ bundle。每次新建 sandbox、contextIsolation、无 Node、无 preload、无 webview 的 WebContentsView，不附加窗口。专用固定非持久 Session 拒绝全部网络、权限、下载、弹窗和非固定壳导航，无真实账户。只加载固定 CSP `default-src 'none'` 壳；原始 HTML 仅 JSON 参数交给 DOMParser，节点绝不附加 live DOM，禁止 loadURL/html、document.write/srcdoc。固定 bundle 内逻辑执行，不执行 HTML 内脚本。

AtCoder 抽出 parseAtCoderProblem(problem, html)，继续原 DOMParser 的双语、公式、样例 textContent 原字节／空白、说明索引、notes、限制与标题逻辑。CF CPH 新增固定 raw-HTML 导出而不改 parser 或 registry；OJ recipe 接受输入 Document，所有 document.createElement/TreeWalker 与 locale 来自该文档。样例与限制仍来自同一份 HTML 的 CPH，原始美元公式和 math/tex 处理保持。

读取 bundle、创建、load、执行、返回均受 AbortSignal 和本地 10 秒解析限时；任一分支关闭 contents 并解除监听。不将 UUID 当权限，不向扩展返回 HTML。读取前后题号、窗口／Session／存储范围均校验。

## 收敛与交付

1. 题面结构／样例／公式与旧语义夹具一致，AtCoder 双语和 CF 真样例保留；原四站回归通过。
2. 原始 HTML 的脚本、事件、iframe、img、CSS、file、meta refresh 不能执行或取资源；取消／关闭／scope 改变拒绝迟到结果，零源码 POST。
3. 相同两题、三轮每站的真正隔离产品对照，成功中位数首次至少改善 25%，保留最慢、失败和范围；遇验证停止该轮，不用补成功掩盖失败。网络不足以支持结论时明确未收敛。
4. AtCoder 不再使用“官网 DOM-ready 后又校验 loading 再派发”的读取路径，保留等价 owner/session 校验，覆盖 bundle 读取或本地派发前取消边界。不能删 guard 继续用旧页。
5. 对照完成撤下全部临时诊断，重跑最终拥有者类型／内容／渲染／native／workbench／client／OI／lint／layers 检查，独立审查无阻断。最终隔离实例确认显示真实正文、没有诊断消息。
6. 生成一次使用已有缓存的最终 stage 供负责人验收；不做 Setup、真实交题、commit/push。stage 构建不替代负责人验收。

误用的 `C:/Users/Bc/Desktop/data` 已获负责人明确清理授权，独立元数据／路径／进程核对后仅删除该整棵本次生成树，清理记录在本轮忽略审计目录；不清其他缓存、stage 或用户数据。
