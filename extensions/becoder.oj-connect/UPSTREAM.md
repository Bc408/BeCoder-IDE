# 来源与修改

OJ Connect 的共同模型、控制器、目录识别、适配器、网页脚本和测试由 BeCoder 编写。共同 Webview 从 vscode-luogu 原组件裁剪迁入，见下表。AtCoder 题号 helper 从本仓库已有核心代码迁移，保留 Microsoft MIT 声明。

最新对齐基准为完整克隆的 vscode-luogu v4.20.0 / `987ca974b5419230a07b59a195ec44026e16f6f4`，`luogu-api-docs` 子模块固定 `b7119385f9482528e71c736ed606241ef302019a`。最初协议调查使用负责人提供的 4.18.2 VSIX；本轮按完整项目的 4.20.0 保留范围复核。核心交题按 submitCode 的请求字段、rid 回执和验证码续交行为接入；评测读取迁入 fetchResult 的 `_contentOnly=1` 路径及 data/currentData 选择。实际请求改用内置浏览器 session，原 MIT 声明保留于 ThirdPartyNotices.txt。保留范围内的题面、评测组件和部分图标直接复用上游；社交、比赛管理、题库、专栏及独立账号存储没有迁入。协议证据见 [审查记录](../../docs/oj-connect/luogu-protocol-evidence.md)。

内容渲染核心现由 `../becoder.shared/content/parser.ts` 统一维护。洛谷 AST 转换提取自 `@luogu-saver-next/markdown-renderer` 1.0.3（Copyright 2026 Federico2903，MIT，完整许可为共享目录的 LICENSE.luogu-markdown.txt），保留数学保护、合并表格、指令、提示块、标题及安全嵌入行为。`src/markdown.ts` 是薄适配，`MarkdownService` 保留上游 4.20.0 的有界缓存／并发去重；固定 `renderContent` 消息传安全 HAST，不再传回高亮 HTML 并二次解析。

AtCoder 原始 HTML 直接经同一 HAST 清洗／KaTeX 管线，不转成 Markdown。作者样式在生成可信公式样式之前清洗；重复属性由解析器处理。样例、CPH 和提交源码仍由原业务所有者保留。代码中的尾部换行和空白精确保留。

代码展示共用 `../becoder.shared/browser/content` 的增量 TextMate／Oniguruma Worker，固定 BeCoder One Monokai 配色。构建优先内置语法，附加语言使用 @shikijs/langs 资源，语法和 WASM 只从本地按需加载。移除 Shiki 渲染引擎、highlight.js 与 DOMPurify 重复路径；作者内容的清洗边界继续由共享管线维护。字体及数学引擎统一固定 KaTeX 0.18.10。

实际打包版本和 SPDX 声明由构建汇总宿主、renderer 与 Webview 的真实依赖，按最近 node_modules 目录及 name/version 区分嵌套版本，生成 `dist/dependencies.json`；完整许可证和归属在 ThirdPartyNotices.txt。未随 npm 包提供的 remark-math/retext 许可从其官方仓库 license 补齐。esbuild、jsdom 与类型包仅用于开发；npm 依赖版本由本扩展及仓库根 package-lock.json 固定；内置语法和主题使用本仓库源码。

题面标题锚点复用 Lucide `pin` SVG，来源固定为 `lucide-icons/lucide` 的 `f6571da835fb5c9766dbceb295b8eecefa0791cb`（`icons/pin.svg`），保留 Copyright (c) 2026 Lucide Icons and Contributors 与 ISC 全文于共享目录的 `LICENSE.lucide.txt`，并收入本扩展 ThirdPartyNotices.txt。复制按钮图形为 BeCoder 本地 SVG；没有为此引入图标运行时依赖。

主体为 GPL-3.0-or-later；对应源码包括本扩展和本仓库 browserView 宿主实现。标准 VS Code 不提供这些私有业务接口。

## 直接复用的前端源码（初次迁入 2026-11-14，本轮对齐 2026-11-15）

最新题面／评测对齐额外迁入4.20.0的 `components/index.tsx` 中Tag、Spinner、`views/viewProblem/cphIcon.tsx` 的操作图标，以及`record/data.ts` 的官网测试点分组合并。难度名称／颜色、标签类别palette与限制格式来自上游shared.ts、color.ts、stringUtils.ts；题面元数据由各站提供可选文字及颜色。纸飞机直接使用上游锁定的 `@fortawesome/free-solid-svg-icons` 7.1.0 中 `faPaperPlane` 的原始 SVG 路径与 viewBox，替换原本地简化图形；提交按钮与 `resources/oj-connect.svg` 保持相同形状，原生活动栏和浏览器题目操作共用该资源，不增加图标运行时依赖。原图形归 Fonticons, Inc. 所有，适用 CC BY 4.0，来源和许可见 ThirdPartyNotices.txt。之前裁剪“标签／图标”的描述属于本轮批准前范围。完整剩余差距见 [界面对齐审查](../../docs/oj-connect/luogu-420-ui-gap-review-2026-11-15.md)。

验证码交互从 4.20.0 `src/utils/workspaceUtils.ts` 的 `askForCaptcha` 迁入 `src/views/luoguCaptcha.ts`：保留图片面板、输入框、留空刷新和取消。图片由原生浏览器同一 Session 的固定地址获取，扩展只收到图片数据；增加任务取消时关闭面板和输入框，避免已取消的提交继续等待人工输入。

固定 [v4.20.0 / 987ca974b5419230a07b59a195ec44026e16f6f4](https://github.com/yltx/vscode-luogu/tree/987ca974b5419230a07b59a195ec44026e16f6f4)。这是源码迁入，不是照截图重画；原版权为 Copyright (c) 2018 引领天下，MIT 全文已保留。

| 原文件（webview/ 下） | OJ Connect 文件（webview/ 下） | 必要修改 |
| --- | --- | --- |
| views/viewProblem/app.tsx、app.css | luogu/problem.tsx、problem.css | 保留标题、控件、限制、正文、配对样例和提示顺序；接共同数据，裁掉题解、比赛导航、标签编辑与附件管理等未纳入能力，保留只读标签 |
| views/viewProblem/submissionControls.tsx、submissionControls.css | luogu/submissionControls.tsx、submissionControls.css | 保留文件名、语言和待提交禁用状态；按 ID 接同一宿主动作及站点语言偏好 |
| views/record/app.tsx、app.css | luogu/record.tsx、record.css | 保留信息行、子任务、测试点卡片与悬浮详情、编译区；接共同记录数据，删除测试数据下载及洛谷专属 command 链接 |
| components/uiToolkit.tsx、uiToolkit.css | luogu/uiToolkit.tsx、uiToolkit.css | 直接复用原生 React 控件；仅本地 import、属性写法及版权头适配 |
| copyablePreElement.tsx | luogu/copyablePre.tsx | 复用可复制 pre 的挂载、复制反馈、卸载；使用本地 SVG 复制图标和本地化无障碍文案，精确读取 code 文本 |
| webviewRequest.ts | request.ts | 复用 UUID 请求／回复 Promise；收窄为已验证的面板动作 |
| components/time.tsx、src/utils/shared.ts 的 formatTime | luogu/time.tsx | 保留原日期排版；共同字符串日期无法解析时原样显示 |
| common.css | luogu/common.css | 保留公共排版；两页 CSS 加作用域以共同打包 |

Webview 使用同一 React 18 系列运行时（固定 react/react-dom 18.3.1），并静态打包 scheduler；其许可证与实际版本列入 ThirdPartyNotices.txt 和构建生成的 dependencies.json。未迁入上游 axios、WS、独立 Cookie 存储或整套外围依赖。HTML／Markdown 仍经既有清洗器再呈现，这是对外部内容的必要隔离。BeCoder 的入口、宿主动作白名单、源文件／样例保护和浏览器会话边界仍由原所有者维护。


### 4.20.0 渲染迁入（2026-11-15）

| 上游 | 本地 | 修改 |
| --- | --- | --- |
| src/utils/markdown.ts | src/markdown.ts | 薄适配共享安全 HAST；共享核心保留上游方言与作者样式隔离 |
| src/utils/markdownService.ts | src/markdownService.ts | 保留按需加载、SHA256 缓存、有界淘汰、并发去重和 clear 语义；加载入口适配本产品 CommonJS 分包 |
| webview/markdownViewer/codeCopy.ts | webview/luogu/codeCopy.ts | 保留复制／失败／卸载生命周期，改用本地 SVG 复制图标和本地化无障碍文案 |
| resources/markdown.css、markdownViewer/markdown.css | webview/luogu/markdown.css、styles.css | 保留提示块、表格及右上角复制控件样式；代码色板由共享固定主题替代 |

4.20.0 的题解工具条和关注犇犇优化属于已移除能力，未迁入。原有题面、样例、提交控件和评测卡片仍来自先前迁入的原组件；按完整 4.20.0 比对保留核心结构，不用版本升级重新引入外围入口。


### 整体复审补充（2026-11-15）

完整阅读上游 src88、webview55个实现／测试／样式文件后，额外直接迁入 shared.ts 的完整 RecordStatus 表（webview/luogu/record.tsx）以及 C/C++ 默认语言项（当时位于 src/adapters/luogu/protocol.ts，现统一归入核心 src/vs/platform/browserView/common/luoguProtocol.ts）。默认项仅在网站实际允许的选项中优先，已选语言偏好保持有效。移除自写的 C++20 默认猜测和不完整颜色正则；原 MIT 声明继续适用。

uiToolkit、复制组件、请求通信、Time 的核心已经来自上游；不能只凭旧 provenance 版本头断言其逻辑重写。正文 DTO、浏览器会话、显式同源码 CPH 与跨站原始状态字符串属于必要适配。评测更新仍为2秒间隔查询，上游 status_push 生命周期尚未迁入，不能宣称性能完全对齐。

### 会话修复补充（2026-11-15）

前节“两秒查询”是前一轮修复前状态。前一轮 `site-scripts/luogu.ts` 曾按4.20.0 utils/api.ts、csrfTokenManager.ts、utils/websocket.ts 和 features/record.ts 裁剪内容请求与推送，但仍依赖网页标签及 DOM 验证码。本轮已移除该脚本与注入导出，生产注入包只保留 AtCoder 的网页读取／退出及读取取消操作。

当前原生实现位于 `src/vs/platform/browserView/electron-main/luoguSessionClient.ts`：按上游固定内容接口、提交字段、验证码错误续交和记录推送协议适配；`luoguCsrfTokenManager.ts` 直接迁入4.20.0 的依赖注入式 CSRF manager，保留缓存、过期、并发去重、会话刷新和生命周期。网络由内置浏览器持久 Session 拥有，验证码交互由本扩展 `src/views/luoguCaptcha.ts` 迁入上游 `askForCaptcha`；凭据不离开原生宿主。原插件的独立 Cookie 存储、Axios/ws 依赖及外围功能不迁入。MIT 来源声明和完整原许可继续保留于 ThirdPartyNotices.txt。

前一轮经过真实只读内容请求与握手、合成推送／取消验证；这些证据不等同于本轮原生传输已通过真实交题验收。本轮源码检查、stage 构建与项目负责人真实端到端验收分别记录，不以合成测试声称提交体验已经验收。

### 验证码 P0 传输候选（2026-11-15）

负责人确认同机同网的原版插件可正确通过验证码。诊断表明当前图片与 POST 使用相同会话、凭据未变化、每轮只取一次图片，但服务器仍重复拒绝。上游 `api.ts` 的 Axios 显式 `proxy:false`；旧 Session.fetch 则使用浏览器代理。当前 `luoguSessionTransport.ts` 以 Node HTTPS `agent:false` 对齐固定 HTTP 操作的直连方式，凭据仍逐次从浏览器 Session 读取，保持当前浏览器 User-Agent 以单独测试传输差异。没有迁入独立 Cookie 存储或新增 Axios 依赖。退出仍经 Session.fetch 清理浏览器会话；AtCoder 不变。真实只读与合成请求测试不代表验证码 P0 已获真实提交验收。

## 牛客 ACM 原生协议（2026-11-17）

使用已采证的官网 `/nccommon/submit_cd` 与 `/nccommon/status`，并复用本扩展现有控制器和洛谷组件。未复制牛客 VSIX 或网站 bundle 代码。官网 JavaScript 只作为运行时数据来源，不能因官方 VSIX 是 MIT 就推断网站源码许可。原生主进程显式依赖 Acorn 8.16.0（MIT），仅提取语法树字面量，拒绝动态表达式；不执行远程代码、不随包分发采证脚本或网站 bundle。其许可见根 ThirdPartyNotices.txt 与 licenses/MIT-Acorn.txt。

## 蓝桥公开练习原生协议（2026-11-20）

本站适配、固定 Session 请求和单次 source/report 编排由 BeCoder 实现，官网静态资源仅用于核实和提取当前目录字面量。复用已有 Acorn 8.16.0（MIT），不执行官网脚本，不分发官网 bundle、研究脚本、账号或研究 profile，没有新增生产依赖。共同界面继续使用上述洛谷来源组件；图标来源不变。协议与当前实现证据见根 docs/oj-connect/lanqiao-runtime-contract.md 及 lanqiao-implementation-2026-11-20.md。

## 平台标识（2026-11-17）

resources/atcoder.png、lanqiao.png 保留各平台官网 favicon，仅转换为 PNG；nowcoder.png 使用牛客官网的 500×500 分享标识。luogu.svg 使用洛谷官网的小标识，保留原路径与三色，仅收紧画布留白。codeforces.svg 采用 Simple Icons 的 CC0-1.0 矢量路径，将三柱拆分并恢复原 favicon 的黄／蓝／红配色，完整许可见 ThirdPartyNotices.txt。上述素材只用于标识站点；名称、图形及商标权归各自平台所有，不将其宣称为本项目原创或适用本项目源码 GPL 授权；不表示平台为 BeCoder 背书。

来源：https://img.atcoder.jp/assets/favicon.png 、https://static.shiyanlou.com/lanqiao/frontend/static/favicon.ico 、https://static.nowcoder.com/fe/common/share-logo.png 、https://fecdn.luogu.com.cn/columba/static.325908fec383795b.logo-single-color.svg 、https://github.com/simple-icons/simple-icons/blob/521c96fd04b0ea93034db8715eda5a4de27a58bb/icons/codeforces.svg 。

2026-11-20 发布检查中，负责人明确决定保留这四项官网标识，继续仅用于识别对应站点，外观不改。项目未收录四站单独出具的再分发许可文件；来源链接、技术转换与商标归属不等同于新增授权声明，也不将图形归入 GPL/MIT。该资产处置决定与代码及其他开源图标的许可记录分别保留。

本轮侧栏改为轻量 WebviewView，仅名称导航；依据负责人仅在官网手动退出的要求，已删除旧的程序化退出命令、服务接口、原生客户端退出方法及 AtCoder 注入退出脚本。上文关于退出的描述保留各历史阶段背景，不代表当前仍暴露这些能力。
