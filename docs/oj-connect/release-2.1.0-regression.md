# 2.1.0 回归与交付记录

[审查](release-2.1.0-review.md) · [性能](release-2.1.0-performance.md) · [发行维护](../distribution.md)

日期：2026-11-20。基线 `dcab3f84` 加本轮未提交修复；测试日志根 `.superpowers/sdd/2026-11-20-v2.1.0-release-readiness/`。以下自动/合成结果不等于新官网实交或负责人 GUI 验收。

## 共同与站点回归

| 范围 | 当前证据 | 状态/限制 |
| --- | --- | --- |
| OJ-01/02/03 | 扩展 147 项：固定源码、并发、取消/迟到、receipt、关闭预览、继续查询；新增源文件缺失/面板失败/逆序读题/释放回归 | 通过；真实官网本轮未提交 |
| OJ-04 | 五站 native 及工作台：window/storage scope、账号/普通凭据轮换、原浏览器 Session、取消/释放 | 通过合成；未导出凭据/读取 Cookie 数据库 |
| OJ-05/07 | record/workflow、各站 protocol、生产 Webview：真实状态/缺字段/真实零、未知/停止、私有 I/O 不呈现 | 通过；不伪造站点未返回字段 |
| OJ-06 | compilerCatalogue/preferences/站点语言回归：匿名采证目录、当前目录校验、失效偏好、C/C++ | 通过；官网全部语言组合未逐项实交 |
| OJ-08/09/10 | sourceBinding/sourceStore/importController/CPH桥与工作台：目录、同源、脏稿、显式替换、导航/关闭 | 通过自动；真实本地编译运行验收单列 |
| OJ-11 | 内容/数学/缓存/共享策略；五站生产渲染、恶意内容和默认链接拦截；离线原生 parser 11 项 | 通过；样例空白/尾换行保留 |
| 洛谷 | native client+main fixture、共同 protocol/bridge：验证码续交、明确拒绝、不明不重发、推送/关闭/继续查询 | 通过合成 |
| AtCoder | 14 个 native快捷键场景：实际controller/adapter/bridge、单表单、正常验证、源码核验、回执后释放、Interval | 14/14 通过 |
| CF | protocol/transport/client/bridge 73 项和 native host | 通过；公开 Practice 边界/重复源码拒绝/不明只读保留 |
| 牛客 | protocol/bridge/client 36 项和 native host | 通过；现存 bundle import.meta warning 记为测试执行器提示，未改生产协议 |
| 蓝桥 | protocol/transport/client/bridge 29 项和 native Session fixture | 通过；source/report各一次、未发送report不得补发、正式身份/源码核验 |

## 浏览器/主页

| 范围 | 当前证据 | 状态/限制 |
| --- | --- | --- |
| BH-01/02/03 | browserHome/HomeActions/WelcomeFeature 及 lazy model 关闭/重试 | 工作台合计149项通过；启动恢复/标题栏/导航栏/＋语义保留 |
| BH-04/05/06 | Search/RecentFiles/HistoryFeature：实时配置、非法模板、原生文件创建/历史路由、旧异步结果 | 通过自动 |
| BH-07/08 | ProblemFeature/OjConnectFeature + Webview点击：主动作/箭头、禁用、取消、固定内置浏览器路由 | 通过；本轮未实际启动外部浏览器 |
| BH-09/10 | 会话权限/信任、工作台 owner/overlay、原生深浅外观 | main harness 36项通过（含题面11项）；权限真实交互/多屏缩放未穷尽 |
| BH-11 | 原生真实Session、localhost gzip/302/POST登录、显式download；离线parser禁止外网与file | 通过；不增加通用下载管理 |
| 渲染 | 五站中英/深浅/320、520、1000等既有render矩阵与实际图片 | 自动通过，主代理查看代表截图；非全部Windows DPI组合实测 |

## 发行门禁

| 检查 | 状态 |
| --- | --- |
| 扩展 typecheck/build/test/render | 通过；最终扩展147项及内容/数学/缓存/共享策略回归通过，五站生产render通过 |
| 共同 bridge/protocol/history/permissions | 136项通过 |
| 发行边界及许可/语言摘要 | 30项通过 |
| pure gate/真实 ASAR CLI | 2项通过 |
| core 类型、ESLint、layers | 通过；最终core类型exit0，OI编译exit0/54944ms；未以transpile替代类型检查 |
| 当前 stage、完整直接 package verifier | 2026-11-20 19:04:01 stage exit0/168182ms；19:05:10直接package verifier exit0/14052ms，IncludeCompiler=True，纯净/完整资产检查通过 |
| Setup 构建/元数据/哈希 | 2026-11-20 19:11:27 exit0/327384ms；172149626 bytes；File/ProductVersion=2.1.0，OriginalFilename为空；SHA256见下方 |
| 管理员干净环境直接 Setup verifier | 2026-11-20 19:12:36–19:20:18管理员执行原验证器exit0/461979ms；两份Portable/原生安装、逐文件SHA256、覆盖同意、外来目录/非法marker、路径/重解析点、原生重复安装拒绝、卸载/系统登记及快捷方式恢复通过；隔离树由验证器清理 |
| 本候选五站 C/C++ 实交的代理检查 | 本轮代理未重新执行全部组合；不以历史闭环/合成测试替代 |
| 负责人整体验收 | 2026-11-20 负责人明确确认本次 2.1.0 Setup“验收通过”；未提供逐语言/异常组合的新采证清单，不补造专项结果 |

本次交付已完成源码、stage、直接包与直接Setup验证，并获得负责人整体验收。上述代理未跑的官网组合仍保留原记录；整体验收不改写逐项采证事实。正式 Release 尚未发布，本轮未执行 commit、push、main合并或标签操作。

## 当前交付物

Setup：`.build/win32-x64/becoder-setup/BeCoderSetup-x64-2.1.0.exe`（仓库内），旁置 `.exe.sha256`；SHA-256 `5193d625e62a99235d7ac5948b1be07f15a4dbc32a6721dc168c9239ff7fc8c5`。源码为 `dcab3f84` 加当前未提交修复，非正式标签；本轮变更输入摘要 `271c1dfb33dfeab23535983fc79fc76e648eda096d78d766d57223c95a1d6e71`。

完整新 stage：`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64`。原已运行 stage 经边界检查后原目录重命名保存在 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64-pre-2.1.0-20261120`，未复制/读取账号数据库；不收入安装包。可选本轮测试缓存清理被自动审批拒绝，未执行，缓存也在载荷之外。

直接Setup证据为 `tmp/release-2.1.0-audit/setup-verification/{verification.log,result.json}`；本机原有D盘安装由负责人自行卸载，代理未删除其安装/登记以绕过保护。代理在验证后未启动已安装产品或运行用户程序；负责人的后续验收单列。Inno 编译器的既有“admin但使用用户区域”提示保留，由本次实际安装/快捷方式验证核对，不能写成零警告构建。
