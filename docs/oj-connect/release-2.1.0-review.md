# 2.1.0 核心链路审查与修复

[检查规划](../superpowers/plans/2026-11-20-v2.1.0-release-readiness.md) · [回归](release-2.1.0-regression.md) · [性能](release-2.1.0-performance.md) · [发行维护](../distribution.md)

日期：2026-11-20。基线 `OJ_connect@dcab3f8427a6325d86e65afb877eea01b671766e`，以下修复尚未提交；负责人已批准本轮修复、干净 Setup 与必要生成物清理，未授权 Git/Release 发布或真实官网交题。保留五站协议、题型范围、一次发送、原 Session、源码/样例及显式外跳边界。

## 确认发现与最小修复

| ID/级别 | 复现及影响 | 修复/回归 |
| --- | --- | --- |
| OJ-R1/P1 | 受理不明后原源码删除/改名；正式回执已经确认，但先展示源码失败导致记录未开、待查询项提前清掉 | 正式记录展示不依赖源码存活；确认回执保存到本次 attempt，面板打开失败可重开，不能再次发代码或丢失正式记录；`pendingQuery.test.ts` 两项失败→通过 |
| OJ-R2/P2 | 同源码连续读题、旧响应晚回覆盖新题面及 CPH 数据；扩展释放后仍可开页 | 每源码只保留当前读题 AbortController，覆盖/释放时作废旧读；发布前检查取消；两项失败→通过。不同源码互不取消，提交状态机不改 |
| BH-R1/P2 | favicon 逆序响应写错当前图标与网页历史；失败 Promise 永久留缓存；2048 个合法独特 SVG 保留 2048 项 | 更新代次、页面与释放 guard；失败仅删除仍属本请求的缓存；最多 32 项；真实监听器回归覆盖旧回包、导航/释放、恢复、复用和上限 |
| BH-R2/P2 | native 创建中关标签，迟到模型使已关闭 input 复活；首次 resolve 失败后无法重试 | 原 input 在 scope/native await 前后核对存活与拥有者；失效且无替代 owner 才销毁 native；input 丢弃/释放晚到模型并 finally 清 promise；onWillDispose 一次订阅；三个失败→通过 |
| LIC-01/P1 | 清单含 Acorn，verifier 精确集合遗漏；用途仅写牛客 | 保留精确集合，加 Acorn 8.16.0/MIT/许可路径及 ASAR 实际版本校验，更新牛客/CF/蓝桥用途 |
| LIC-02/P1 | 中文包源码与压缩摘要、清单和验证器三者漂移 | 在文案冻结后按原排序/逐文件哈希算法重算源码 91 文件及 JSON 确定性压缩；边界测试和真实 stage 另核对 |
| LIC-03/P1 | 纸飞机和 CF 图形许可未进入组件表达，官网标识仅有来源记录 | 补 CC-BY-4.0/CC0-1.0 映射。负责人明确保留四项官网标识；来源、技术改动、商标及缺单独许可文件如实记于 UPSTREAM，不推断新授权，不改外观 |
| LIC-04/P1 | 包检查未要求 worker、WASM、五站图标及完整 grammar/font；根产品/Chromium 声明未直接要求 | 增加非空路径；最终构建生成的 grammar/font 文件集与字节逐项对账，保留完整许可证与 notices |
| PKG-01/P1 | 已运行 stage 的 data 含 user-data/shared-data/extensions/argv，Setup 递归收录 | 在 Setup 构建与包 verifier 增加只读纯净门禁，拒绝额外根文件/目录、运行数据与个人源码；不自动删除；新 stage 不启动产品 |
| REV-01/P1 | 新 verifier 初版误按 node_modules/acorn 寻址；实际 ASAR 根为 acorn | 最终 reviewer 找到；增加实际 ASAR 打包→CLI 读取回归，失败→通过；仅改内部路径 |
| REV-02/P2 | 新门禁初版只拒绝未知目录，根普通文件可被递归打包 | reviewer 找到；按本 Electron/产品实际根文件清单收紧，debug.log 失败→通过；未知载荷报错，不自动删 |

审查由三个独立只读所有者调查、主代理顺序修复并自审，最后独立 reviewer 复核最终差异。具体测试与产物结果在回归表，不将源码探针或旧版本验收当新包验收。

## 文案与来源

浏览器按钮恢复已批准的固定英文 `Get Problem`/`Import to CPH`，中文 tooltip 保留动作说明。OJ 文档明确五站核心已闭环、C 实交/异常组合证据各记，不再将蓝桥整体写为未验收候选；浏览器导入动作区分 Get 与 Companion CPH。评测英文判词和 hover、无数据省略及真实零值保留不变。

官网站点图形的负责人保留决定不是开源代码许可证明；不以 SPDX 替代完整条款，不删除原版权或 corresponding-source 记录。本轮没有新增生产依赖、清空开发依赖/缓存、降低 TLS/sandbox、改发送协议或引入自动重试。

## 检查证据与交付边界

精确命令、输入摘要、退出码和失败重跑保存在 `.superpowers/sdd/2026-11-20-v2.1.0-release-readiness/validation.jsonl`；脱敏截图/本地测量在 `tmp/release-2.1.0-audit/`。失败尝试包括新测试 fixture DTO/mock、main harness 路径/资源根、缺 leak tracker 与上述两项新 verifier 问题，均已在原层修正；不拿这些失败作为旧核心不可用的结论。

最初检查时当前进程非管理员且本机有 BeCoder 原生登记与快捷方式；负责人随后自行卸载 D 盘 BeCoder，复检三项均不存在。Setup 直接安装验证保留管理员及全套环境保护，只在验证器自己的隔离目录进行，不由代理删除日常安装来绕过。最终构建、载荷和安装检查均通过；2026-11-20 负责人随后确认本次 Setup 验收通过。各层证据与范围分别见[回归文档](release-2.1.0-regression.md)，不将整体验收扩写成全部官网组合的独立采证。
