# 来源与修改

OJ Connect 的共同模型、控制器、目录识别、适配器、网页脚本和测试由 BeCoder 编写。共同 Webview 从 vscode-luogu 原组件裁剪迁入，见下表。AtCoder 题号 helper 从本仓库已有核心代码迁移，保留 Microsoft MIT 声明。

最新对齐基准为完整克隆的 vscode-luogu v4.20.0 / `987ca974b5419230a07b59a195ec44026e16f6f4`，`luogu-api-docs` 子模块固定 `b7119385f9482528e71c736ed606241ef302019a`。最初协议调查使用负责人提供的 4.18.2 VSIX；本轮按完整项目的 4.20.0 保留范围复核。核心交题按 submitCode 的请求字段、rid 回执和验证码续交行为接入；评测读取迁入 fetchResult 的 `_contentOnly=1` 路径及 data/currentData 选择。实际请求改用内置浏览器 session，原 MIT 声明保留于 ThirdPartyNotices.txt。没有复制图标或迁入社交、比赛管理、题库、专栏及独立账号存储。协议证据见 [审查记录](../../docs/oj-connect/luogu-protocol-evidence.md)。

Markdown 直接复用 4.20.0 的 `src/utils/markdown.ts`、`markdownService.ts`、`webview/markdownViewer/codeCopy.ts` 与 `resources/markdown.css`。使用同一 `@luogu-saver-next/markdown-renderer` 1.0.3（Shiki、remark／rehype），扩展宿主按需渲染并复用其有界缓存／并发去重，Webview 通过固定 `renderMarkdown` 消息读取结果。实际运行入口和 renderer 分别静态打包为 `out/extension.js` 与 `out/markdown.js`，不依赖产品中的 node_modules。

AtCoder 原始 HTML 保留 DOMPurify 3.4.17（选择 Apache-2.0）和 KaTeX 0.18.10；不作为 Markdown 重解析。KaTeX 的 scoped override 统一为 0.18.10，使字体与两条渲染链匹配并避开旧子依赖公告。本轮 npm audit 为 0 vulnerabilities。Highlight.js 11.9.0 继续处理 HTML 与上游 Shiki 未高亮的已知代码语言（例如 PHP），使用原 Base16 明暗主题；Shiki 采用上游 Github 明暗主题。

源码、原始样例及 CPH 文本不经过题面渲染器。正文复制按上游 4.20.0 读取显示代码文本；Shiki 可能移除代码块末尾的换行。公式内转义美元符号的个别输入仍有上游相同行为，不新增自制解析补丁。

必要隔离：进入上游前按 Markdown AST 定位原始 HTML，再用 parse5 源码位置将作者 style 属性置空（保留空的首属性，使重复属性不能重新生效）；不修改代码字面量或公式／Shiki 生成样式。上游 sanitization、HTTPS 链接约束、嵌入转原站链接及宿主 CSP 共同保留既有边界。没有导入上游账号 Cookie 存储、图标或已裁掉的外围入口。

实际打包版本和 SPDX 声明由构建汇总宿主、renderer 与 Webview 的真实依赖，按最近 node_modules 目录及 name/version 区分嵌套版本，生成 `dist/dependencies.json`；完整许可证和归属在 ThirdPartyNotices.txt。未随 npm 包提供的 remark-math/retext 许可从其官方仓库 license 补齐。esbuild、jsdom 与类型包仅用于开发；所有版本由本扩展 package-lock.json 固定。

主体为 GPL-3.0-or-later；对应源码包括本扩展和本仓库 browserView 宿主实现。标准 VS Code 不提供这些私有业务接口。

## 直接复用的前端源码（初次迁入 2026-11-14，本轮对齐 2026-11-15）

最新题面／评测对齐额外迁入4.20.0的 `components/index.tsx` 中Tag、Spinner、`views/viewProblem/cphIcon.tsx` 的操作图标，以及`record/data.ts` 的官网测试点分组合并。难度名称／颜色、标签类别palette与限制格式来自上游shared.ts、color.ts、stringUtils.ts；题面元数据由各站提供可选文字及颜色。纸飞机为本地简单矢量，不增加Font Awesome依赖。之前裁剪“标签／图标”的描述属于本轮批准前范围。完整剩余差距见 [界面对齐审查](../../docs/oj-connect/luogu-420-ui-gap-review-2026-11-15.md)。

验证码交互从 4.20.0 `src/utils/workspaceUtils.ts` 的 `askForCaptcha` 迁入 `src/views/luoguCaptcha.ts`：保留图片面板、输入框、留空刷新和取消。图片由原生浏览器同一 Session 的固定地址获取，扩展只收到图片数据；增加任务取消时关闭面板和输入框，避免已取消的提交继续等待人工输入。

固定 [v4.20.0 / 987ca974b5419230a07b59a195ec44026e16f6f4](https://github.com/yltx/vscode-luogu/tree/987ca974b5419230a07b59a195ec44026e16f6f4)。这是源码迁入，不是照截图重画；原版权为 Copyright (c) 2018 引领天下，MIT 全文已保留。

| 原文件（webview/ 下） | OJ Connect 文件（webview/ 下） | 必要修改 |
| --- | --- | --- |
| views/viewProblem/app.tsx、app.css | luogu/problem.tsx、problem.css | 保留标题、控件、限制、正文、配对样例和提示顺序；接共同数据，裁掉题解、比赛导航、标签与附件管理等未纳入能力 |
| views/viewProblem/submissionControls.tsx、submissionControls.css | luogu/submissionControls.tsx、submissionControls.css | 保留文件名、语言和待提交禁用状态；按 ID 接同一宿主动作及站点语言偏好 |
| views/record/app.tsx、app.css | luogu/record.tsx、record.css | 保留信息行、子任务、测试点卡片与悬浮详情、编译区；接共同记录数据，删除测试数据下载及洛谷专属 command 链接 |
| components/uiToolkit.tsx、uiToolkit.css | luogu/uiToolkit.tsx、uiToolkit.css | 直接复用原生 React 控件；仅本地 import、属性写法及版权头适配 |
| copyablePreElement.tsx | luogu/copyablePre.tsx | 复用可复制 pre 的挂载、复制反馈、卸载；用本地化文字代替额外图标包，精确读取 code 文本 |
| webviewRequest.ts | request.ts | 复用 UUID 请求／回复 Promise；收窄为已验证的面板动作 |
| components/time.tsx、src/utils/shared.ts 的 formatTime | luogu/time.tsx | 保留原日期排版；共同字符串日期无法解析时原样显示 |
| common.css | luogu/common.css | 保留公共排版；两页 CSS 加作用域以共同打包 |

Webview 使用同一 React 18 系列运行时（固定 react/react-dom 18.3.1），并静态打包 scheduler；其许可证与实际版本列入 ThirdPartyNotices.txt 和构建生成的 dependencies.json。未迁入上游 axios、WS、独立 Cookie 存储或整套外围依赖。HTML／Markdown 仍经既有清洗器再呈现，这是对外部内容的必要隔离。BeCoder 的入口、宿主动作白名单、源文件／样例保护和浏览器会话边界仍由原所有者维护。


### 4.20.0 渲染迁入（2026-11-15）

| 上游 | 本地 | 修改 |
| --- | --- | --- |
| src/utils/markdown.ts | src/markdown.ts | 保留渲染及嵌入／提示块适配，增加原始作者 style 隔离、HTTPS 约束及 TS6 类型适配 |
| src/utils/markdownService.ts | src/markdownService.ts | 保留按需加载、SHA256 缓存、有界淘汰、并发去重和 clear 语义；加载入口适配本产品 CommonJS 分包 |
| webview/markdownViewer/codeCopy.ts | webview/luogu/codeCopy.ts | 保留复制／失败／卸载生命周期，以既有本地化文字替代额外图标包 |
| resources/markdown.css、markdownViewer/markdown.css | webview/luogu/markdown.css、styles.css | 保留 Shiki 明暗主题、提示块、表格及右上角复制控件样式，适配宿主实时主题属性 |

4.20.0 的题解工具条和关注犇犇优化属于已移除能力，未迁入。原有题面、样例、提交控件和评测卡片仍来自先前迁入的原组件；按完整 4.20.0 比对保留核心结构，不用版本升级重新引入外围入口。


### 整体复审补充（2026-11-15）

完整阅读上游 src88、webview55个实现／测试／样式文件后，额外直接迁入 shared.ts 的完整 RecordStatus 表（webview/luogu/record.tsx）以及 C/C++ 默认语言项（src/adapters/luogu/protocol.ts）。默认项仅在网站实际允许的选项中优先，已选语言偏好保持有效。移除自写的 C++20 默认猜测和不完整颜色正则；原 MIT 声明继续适用。

uiToolkit、复制组件、请求通信、Time 的核心已经来自上游；不能只凭旧 provenance 版本头断言其逻辑重写。正文 DTO、浏览器会话、显式同源码 CPH 与跨站原始状态字符串属于必要适配。评测更新仍为2秒间隔查询，上游 status_push 生命周期尚未迁入，不能宣称性能完全对齐。

### 会话修复补充（2026-11-15）

前节“两秒查询”是前一轮修复前状态。前一轮 `site-scripts/luogu.ts` 曾按4.20.0 utils/api.ts、csrfTokenManager.ts、utils/websocket.ts 和 features/record.ts 裁剪内容请求与推送，但仍依赖网页标签及 DOM 验证码。本轮已移除该脚本与注入导出，生产注入包只保留 AtCoder 的网页读取／退出及读取取消操作。

当前原生实现位于 `src/vs/platform/browserView/electron-main/luoguSessionClient.ts`：按上游固定内容接口、提交字段、验证码错误续交和记录推送协议适配；`luoguCsrfTokenManager.ts` 直接迁入4.20.0 的依赖注入式 CSRF manager，保留缓存、过期、并发去重、会话刷新和生命周期。网络由内置浏览器持久 Session 拥有，验证码交互由本扩展 `src/views/luoguCaptcha.ts` 迁入上游 `askForCaptcha`；凭据不离开原生宿主。原插件的独立 Cookie 存储、Axios/ws 依赖及外围功能不迁入。MIT 来源声明和完整原许可继续保留于 ThirdPartyNotices.txt。

前一轮经过真实只读内容请求与握手、合成推送／取消验证；这些证据不等同于本轮原生传输已通过真实交题验收。本轮源码检查、stage 构建与项目负责人真实端到端验收分别记录，不以合成测试声称提交体验已经验收。

### 验证码 P0 传输候选（2026-11-15）

负责人确认同机同网的原版插件可正确通过验证码。诊断表明当前图片与 POST 使用相同会话、凭据未变化、每轮只取一次图片，但服务器仍重复拒绝。上游 `api.ts` 的 Axios 显式 `proxy:false`；旧 Session.fetch 则使用浏览器代理。当前 `luoguSessionTransport.ts` 以 Node HTTPS `agent:false` 对齐固定 HTTP 操作的直连方式，凭据仍逐次从浏览器 Session 读取，保持当前浏览器 User-Agent 以单独测试传输差异。没有迁入独立 Cookie 存储或新增 Axios 依赖。退出仍经 Session.fetch 清理浏览器会话；AtCoder 不变。真实只读与合成请求测试不代表验证码 P0 已获真实提交验收。
