# OJ Connect 渲染调查与共享内容方案

日期：2026-11-16。实施依据为[内容渲染性能优化、能力统一与去冗余设计](../superpowers/specs/2026-11-16-content-rendering-optimization-design.md)。固定默认 One Monokai，不引入主题同步；本文分别记录源码、生产页面测量和桌面验收边界。

## 追加审查（2026-11-16）

负责人确认上一版 OJ Connect 代码高亮视觉已过关。本轮保护该效果，审查 OJ 流程及共享渲染，处理可证实的冗余和缺陷。开始修改前，按负责人要求以 `df2807f3` 保存原样本地快照；仓库 pre-commit 报告 191 项 hygiene 问题，本次跳过 hook 经负责人明确同意，失败日志保留，未推送。后续修正尚未再次提交。

### 审查结论与实际修改

- **已修正 P2：复制失败无提示。** 样例／编译输出旧自定义元素在 clipboard 拒绝后静默返回，题面却显示失败提示。现在薄 React 容器调用同一 `installCodeCopyButtons`，删除每块额外 React root、自定义元素、重复图标及对应 CSS；空白与末尾换行仍由 code 原文复制。新增拒绝／成功重试回归先 RED 后 GREEN。
- **清除死通路。** `CommandBrowserHost` 只实现现行 `AtCoderHost`，删除无扩展生产调用的 `submit/revealResult` facade。核心实验入口、真实提交协议、验证码规则及账号未动。
- **去除高亮重复工作。** `patch()` 统一拆行、扫描稳定前缀及尺寸预算；Worker 不再单独拆行预检，full-view `update()` 调用同一算法，不再让 patch 路径先复制全部 token 行再截后缀。预算新增确定性 RED→GREEN；继续状态与超时规则保留。
- **保留有作用的边界。** 纯解析器、Worker、DOM 展示、消费者业务容器；提交控制器、平台协议、跨进程响应校验、缓存去重及 SourceBinding 各有真实职责，不因去冗余重新揉合。Toolkit 未消费控件已由 tree shaking 移除，不扩展为无关整理。

独立只读审查与主审未发现可证实的重复交题、认证失败无限重发或共享渲染阻塞缺陷；这不等于真实站点全面验收。未引入新认证、主题同步、增量 Markdown 框架、额外缓存服务或第二套引擎。

### 验证与交付边界

预检命令和输入记录在 `tmp/oj-connect-audit/render-optimization/review-checks.json`；最终类型、单元、语言／数学、生产页面、lint、client、OI 编译结果以 `review-final-*` 日志及 `review-validation-ledger.md` 为准。OJ 复制修正的 RED→GREEN 与 36 张截图见 `oj-review-*`。本轮只使用本地固定材料，无真实账号、交题或数据迁移。源码与截图回归不替代桌面验收；stage 若构建，结果以独立 `review-stage-app.json` 为准，不预先宣称成功。

此前 191 项 root hygiene 不因本轮 focused lint 通过而算作解决，也未扩大规则隐藏；今后提交仍需按实际 hook 结果处理。

当轮 OJ 与共享内容验证 exit 0：OJ 扩展类型、OJ 74 项及 3 组共享回归、260 种语言、OJ 两站点 36 张页面截图、受影响 TS lint、client 类型和 OI 编译。CSS exit 0，保留既有 design-token 建议。OI 重建后补跑 OJ 页面，避免用旧 Worker 验证当轮源码。已查看洛谷空样例复制与编译输出截图。

## 上一轮 stage 记录（保留当时事实）

### 当时的 stage 候选：性能优化、能力统一与去冗余

OJ 已接入 `becoder.shared/content` 的 Markdown／安全 HAST 管线，以及 `becoder.shared/browser/content` 的代码展示。洛谷保留带 MIT 归属的上游方言，AtCoder 原生 HTML 直接进入内容树；没有新增全局服务、跨扩展运行依赖或第二套高亮引擎。

已移除 OJ 的 Shiki／highlight.js 双引擎、DOMPurify 二次处理。Worker 入口由 9,118,314 字节降至约 106.8 KiB；267 个本地语法资源与 WASM 仍完整分发，该数字不是总包体积缩减。

本次继续消除具体重复工作：无数学起始标记时直接返回原文；代码先用单个原文尾部 Text 展示，再把完成着色的行分批提升为 DOM；保留稳定前缀行；相邻相同颜色／字体 token 合并。源码和末尾换行始终为复制权威，预算与资源失败保留原文。

### 最终验证与交付边界

新 stage 按 `typecheck-client`、`compile-oi-extensions`、`gulp vscode-win32-x64-min` 顺序构建，stage 命令上限 300s。源码与页面矩阵见 `tmp/oj-connect-audit/render-optimization/stage-checks.json`，每次退出码见 `tmp/oj-connect-audit/shared-workflow/render-validation-ledger.md`；构建实际结果以交付时 `render-stage-app.json` 为准。本段在构建前写入，不预先宣称构建成功。

当轮 `render-stage-*` 的 OJ 与共享内容验证已通过：OJ 74 项及 3 组解析／缓存／策略，260 种 fence 语言、双站页面、OJ 扩展类型、受影响 lint、client 类型和 OI 编译。已查看洛谷深色窄屏、AtCoder 浅色窄屏截图。完整 root hygiene 的既有 OJ JS header／allowlist 问题未扩大规则掩盖；此前 CSS exit 0 的 token 建议保留。

生产页面是 loopback Chromium 与模拟宿主；实际桌面 Webview 资源通道、IPC、两站点五轮性能及负责人视觉／交题验收仍待完成。本次仅交付 stage 候选，不新增 Setup、真实提交、commit／push、账号迁移或清理。

## 早期实施记录（历史时段）

### 源码验证与验收边界

- OJ：74 项测试及 3 组共同解析／缓存／策略回归。OJ owning 类型、生产构建、相关 TS lint、共享源码 lint、CSS、client 类型、OI 编译和分层检查均有通过记录。
- OJ 与共享内容生产页面：260 种 fence 语言；OJ 36 张截图，覆盖两平台、布局、多语言、样例、精确复制、恶意内容。已查看实际生成截图。
- root 全量 hygiene 仍非全绿：旧 OJ `build-webview.mjs`／`test/render.mjs` 的 header 与 JS allowlist 基线问题未通过，未扩大 allowlist 或绕过新检查。CSS 检查 exit 0 仍含既有设计 token 建议。
- 未构建新 stage／Setup，未作真实账户提交、安装应用验收或负责人验收。现有 loopback 页面使用生产 bundle 与相同 CSP，但不能代替桌面 Webview 资源通道、宿主 IPC 和真实应用性能。OJ 两站点真实 Webview 的五轮前后数据也未补齐。

正式检查与所有失败／重跑的命令、退出码、分类见 `tmp/oj-connect-audit/shared-workflow/render-validation-ledger.md`，原始 JSON／log 同目录保留。

以下“基线”部分保留实施前观察及数据，不能用作当前源码说明。

## 结论与边界

OJ 内容渲染可复用解析、AST 转换、内容清洗、数学和代码节点、内容组件，并保留洛谷方言。题目头部、样例／CPH／提交仍由 OJ 业务容器拥有。

高亮引擎选择须比较覆盖范围、冷启动和长代码实测，先削减重复解析和全量更新。共享源码不等于跨 Webview 共用 Worker，也不需要建立新的跨进程全局渲染服务。

## 实施前基线与确定问题

### OJ Connect

- `src/markdown.ts`：洛谷 Markdown → 上游 `@luogu-saver-next/markdown-renderer@1.0.3`（Shiki / KaTeX）→ HAST → 自定义转换 → HTML；此前另用 remark / parse5 清空作者 style。源码中的“without parsing Markdown here”注释已不能准确描述整个路径，后续实施时应一并校正。
- `webview/content.ts`：网站 HTML → DOMPurify → KaTeX / highlight.js；未由 Shiki 处理的洛谷 fence 也走 hljs 补充。Shiki 的 GitHub 与 hljs 的 Tomorrow 配色不同，语言范围也不同。
- 实际语言探测：Haskell、OCaml、Julia、Pascal 均未被预载 Shiki 的15种语言及 hljs/common 覆盖；C#/Kotlin/Lua 走 hljs，C++/Python 走 Shiki。缺主题文件不是根因，构建已引入 hljs 主题。
- 既有 `MarkdownService` 已有32项／8 MiB缓存及并发去重。热命中极快；继续堆一层缓存不能解决首次打开。
- 相比上游，额外的全 Markdown 安全预解析、输出 HTML 再解析／遍历／序列化增加成本；当前 walker 还进入所有高亮 token。保留安全边界是要求，具体遍历是否必要需要用等价安全回归证明后才能删。
- 面板状态包含完整正文，但 Content 的 effect 已按内容串去重，不能误称每次选语言都重做高亮。
- `pre` 与 `code` 均有滚动容器。截图中的小箭头在 DPR1/1.25/1.5/2、12–16px本地几何测试未复现，根因仍未证实。

## 本地实测

OJ：Node24.17，当前源码与固定上游4.20.0，依赖及打包条件相同；各3个独立进程，热场景各4次取中位。未包含网络、真实宿主IPC、页面绘制。

| 场景 | OJ当前 | 上游4.20.0 |
| --- | ---: | ---: |
| 模块加载 | 215ms | 191ms |
| 加载后的首次渲染 | 507ms | 469ms |
| 热渲染：100个小代码块 | 206ms | 151ms |
| 热渲染：30.5k字符／1500行代码 | 558ms | 464ms |
| 服务缓存命中 | 0.0145ms | 0.0133ms |

30.5k字符代码生成约690k字符HTML，后续IPC／DOM成本仍需单独测量；不能把上表总差值归因到某一个函数。原版冷启动本来就较重，照搬整条管线无法自动解决性能问题。

## 建议的统一管线

```text
Markdown ── 基础解析＋少量方言转换 ──┐
                                    ├─ 共同AST/HAST → 作者内容清洗
网站HTML ── HTML解析／站点内容适配 ──┘
    → 代码／数学语义节点 → 共同内容组件 → OJ题面
```

优先评估复用已有 `extensions/becoder.shared` 的内容渲染模块及构建资产；OJ 保留自身业务容器和 React 18 构建／类型验证，不引入跨扩展运行依赖或插件注册框架。

共同核心可包含：基础Markdown/GFM、数学语义与KaTeX、作者内容清洗机制、URL校验、语言别名／grammar／主题、高亮、代码块／复制、静态内容缓存。作者内容先清洗，再生成可信数学／高亮样式，目标是消除当前重复整文解析，同时保持作者style不能覆盖产品UI。缓存键包括方言、策略与影响输出的主题版本；不再加重复缓存。

差异作为明确适配保留：

| 输入／消费者 | 需保留的行为 |
| --- | --- |
| 洛谷 | directives、callout、合并表格、题面图片、受限raw HTML、相对网址、嵌入转链接 |
| AtCoder原生HTML | 直接进入共同HAST，保留题面／数学／样例语义，不转回Markdown |

上游渲染器现有公开接口只返回HTML，没有AST／代码节点钩子；需评估带来源声明的最小源码提取或对应源码改造，不能继续叠一轮HTML解析来假装统一。

## 性能优化与迁移顺序

1. 固定代表性内容与当前截图：多语言、洛谷表格／指令、多行公式、未知语言、长单行、1/10个代码块、100/1000/3000行、深浅主题、精确复制。分别计时解析、高亮、传输、DOM提交及绘制，补上真实Webview测量。
2. 以同一基础解析／HAST管线接入 OJ静态题面；复用上游已验证的方言与数学处理，合并重复预处理和输出往返。保持样例原文，不把源码复制绑定到着色DOM。
3. 迁入共同数学／代码内容组件。对 TextMate、Shiki 等候选比较覆盖、主题与性能，再保留一条主路径。grammar按需加载、未知语言立即纯文本展示；避免每个代码块挂Monaco，避免长期保留多套fallback链。

这是建议路线而非性能承诺。验收应比较冷开／热开、语言切换、长代码、复制空白、主题、窄侧栏、公式和恶意内容；共享后的路径必须实际更简洁且指标改善，不能只减少依赖名而增加转换层。

## 前一轮源码收尾与验证边界

本轮主要实施洛谷验证码失败上限／提示、复制按钮图标。第3次已输入答案被明确拒绝后停止，不再弹下一张图；首次挑战、留空刷新、取消不计数；无正式回执且受理不明仍不重发。提示用户在内置浏览器手动提交，不新做交互认证，不自动打开／代交。

复制控件覆盖题面代码、样例和编译输出，共用同一叠页图标与28px角落按钮；保留键盘标签、成功反馈、原文空白。空样例亦需容纳按钮，避免按钮自己制造滚动条。此处局部尺寸修正不等于已定位截图中所有滚动箭头。

最终源码回归另复现既有文件身份保护缺陷：Windows 文件ID大于Number安全整数范围，相邻不同ID可被舍入为同值，导致源码替换／目录替换检测失效。已按高风险修复边界将 SourceBinding 与 SourceStore 的 stat/lstat/fstat 身份比较统一为 BigIntStats，链接数仍要求1n；不改变导入路径、清理或用户源码写入规则。新增确定性2^53／2^53+1回归先失败再通过，完整扩展74项通过；原先偶发失败不能继续当作测试噪声。

源码测试、合成Electron和本地页面验证分别成立；该前置收尾未构建stage，未作新账号／网站提交，也未修改Markdown／高亮实现；后续实施以开头的结果和本轮验证记录为准。

临时证据：`tmp/oj-connect-audit/render-research-20261116/{REPORT.md,bench.json,languages.json,geometry.json}`；本轮正式检查与失败／重跑保存在 `shared-workflow/bounded-*.{json,log}` 和 `bounded-captcha-validation.md`。
