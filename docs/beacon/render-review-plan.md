# Notebook 与 Beacon 渲染清理及验证台账

日期：2026-10-14。负责人授权审查、删除冗余、修复相关缺陷、隔离观察及完整应用构建。当前分支 `codex/BeCoder_Next`，HEAD `865c504d0795d7b64dc413756916e17ee36696c5`；保留既有未提交工作。

## 范围与保留行为

沿 serializer、原生 Notebook 输出/Markdown renderer、Beacon React Markdown/公式/语法 Worker、构建依赖、测试与当前文档追踪消费者。删除必须有无消费者或被当前实现取代的证据；不按关键词删除安全过滤、原生撤销、协议重放或真正使用的语法资源。

保留 C/C++、Markdown、独立 input、合并 ANSI 输出、英文阶段与时间、附件原生保存/备份、公式及 Mermaid；Beacon 保留代码语言、高亮、公式、流式阅读、附件、配置、当前会话隔离及模式资格。不运行学生代码、不调用模型、不操作账号、不安装依赖、不写 Git、不构建 Setup。测试使用私有夹具、headless 浏览器及私有 Windows desktop，不能触碰日常安装的 profile。

## 源码审查发现

- `rehype-katex` 无生产或测试 import；现行公式由 `MathFormula` 直接调用 KaTeX。删除声明、独占锁依赖及过时 notice 分支。
- 构建只使用 Shiki 的语法清单，不使用其渲染引擎。改为直接使用已锁定的 `@shikijs/langs` 语法资产，保留语言别名、显示名及全部已有语法；继续优先使用 BeCoder 内置语法。删除不再需要的引擎及主题依赖，不删现有 node_modules。
- `test/render.mjs` 仍使用旧权限文案、三档任意选择和 activeId 草稿协议；更正为当前宿主的 viewKey、canSend 与工作区资格，不向产品添加测试快照兼容。
- `implementation-status.md` 与候选 Notebook 设计仍有内嵌 inputs、小型输入 webview、分区 stdout/stderr 等被替代的叙述。现行设计改为独立 input 与合并输出；历史验证记录明确时点，不作为当前入口。
- 流式公式补闭合扫描没有排除缩进代码，可能给代码/后续正文追加假的 `$`；回归先观察失败再修复。

## 预检与冻结命令

已确认各 package.json、build.mjs、现有 Playwright、esbuild、ESLint、tsc6、npm CLI、构建超时 helper 和包校验脚本存在。内容检查只接本轮仍存在普通文件；依赖清理仅修改 manifest/lock，不运行安装。

1. `node build.mjs`（各扩展目录）：生成对应 host/renderer 与测试 bundle；之后运行所属 `npm test`。
2. `node --test --test-name-pattern="streaming math preserves indented code" dist-test/session.test.cjs`（Beacon）：明确 RED；失败后停止验证序列，按本次自行纠错授权修复再开始 GREEN。
3. Beacon `npm run typecheck`、`npm run lint`、`npm test`；Notebook `npm run typecheck`、`npm test`；Beacon `npm run test-render`、`npm run test-attachments-render`、`node test/math-render.mjs`、`node test/syntax-render.mjs`。浏览器均 headless，本地 HTTP 资源，无外部模型。
4. `node tmp/notebook-experience/build-validation.mjs review-client 120 run typecheck-client`；同 helper `review-extensions 120 run compile-oi-extensions`；同 helper `review-windows 300 run gulp vscode-win32-x64-min`。超时或非零停止剩余验证并说明。
5. 直接包检查：`& .\build\azure-pipelines\win32\verify-becoder-package.ps1 -PackagePath 'C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64' -IncludeCompiler $true`。
6. 文档结构 `.agents/skills/develop-becoder/scripts/validate-project-docs.ps1`，本轮路径的 scoped `git diff --check`。私有窗口查看 Notebook、Beacon 实际 webview，关闭自身测试进程后交付应用。

每步记录实际 exit code、失败层及被后续编辑失效的证据。源码、网页测试、私有应用运行、完整包与负责人验收分别成立。

## 本轮清理及自审结论

- Notebook 的 `mergeOutput?: boolean` 是旧分离输出路线的开关；唯一产品调用恒传 true，旧测试仍使用默认 false。删除开关及备用 stdout/stderr 结果字段，Notebook 恒合并程序输出；helper 自身诊断仍单列 `helperStderr`，编译 stdout/stderr 仍保留真实来源。CPH/普通 Runner 的 helper 分离能力继续有消费者，没有删除。
- Beacon 旧 `ConnectionState.models` 无消费者，宿主始终发空数组；当前模型入口使用 `choices` 和独立设置文档。移除废字段，不增加旧配置读取。
- 锁文件按当前声明及实际依赖/optional/peer 解析路径求可达闭包，删除 26 个无消费者条目，版本与 integrity 原样保留。manifest 直接声明现有 `@shikijs/langs@3.23.0`；当前本地 node_modules 未卸载、未安装或重写。production build 的 notice 继续覆盖实际打包模块与语法资产。
- 保留的代码不是快照兼容：全局私有目录排除保护旧记录隐私；会话 SDK protocol 重放保证工具与暂停/继续；Notebook ID/角色 metadata 执行原生稳定身份/执行资格；ANSI 状态处理支持拆包。无证据表明这些能力可删除。
- 清理 Notebook 技术设计、体验计划、实现状态、工程蓝图及调研导航中的当前旧 input、图片句柄、历史迁入要求；历史失败/通过记录保留时点，删除已撤回实现的导航和未来承诺。正式核心需求与已实现/待验证的区别保持。

## 验证记录

| 检查 | 最终结果 | 失败及纠错边界 |
| --- | --- | --- |
| Beacon production build/typecheck/lint | exit 0 | 无诊断；锁清理不需下载依赖 |
| Beacon `npm test` | exit 0，121/121，无跳过 | 新增缩进代码公式回归先 exit 1（`echo $HOME` 多出 `$`），修复扫描范围后 GREEN |
| Notebook build/typecheck/test | exit 0，29/29，无跳过 | 保留保存、备份、input 编辑、输出清除及原生错误反馈覆盖 |
| Runner `npm test` | exit 0，93/93，无跳过 | 仅本测试进程设置现有私有 toolchain/helper 环境；不改变用户全局环境 |
| Runner Notebook 执行回归 | exit 0，9/9，真实 GCC/helper | 去掉显式 mergeOutput 的 RED 先复现旧分离默认值；改为恒合并后覆盖 C EOF、本地 include/cwd、debug、退出125、取消、9 MiB 截断 |
| scoped ESLint | exit 0 | 三个本轮 Notebook/Runner TS 普通文件；Beacon lint 覆盖所属 src/webview/test/build |
| Beacon `npm run test-render` | exit 0 | 旧添加文件“不存在”断言先 exit 1；更新当前入口断言；不添加产品兼容分支 |
| Beacon `npm run test-attachments-render` | exit 0 | 初次 fixture 缺 canSend，先 exit 1；补当前宿主字段。其后已有 math 命令曾继续启动，未严格遵守停止顺序，单独记录；后续采用逐步退出码门禁 |
| Beacon `node test/math-render.mjs` | exit 0 | 5 类逐字符公式：红色错误节点0、临时保留不稳定帧0；最终非法公式普通文本 |
| Beacon `node test/syntax-render.mjs` | exit 0 | 当前260个语法入口；7类实时流，纯文本闪回/高度回退均0 |
| actual `node test/webview-syntax.mjs 9350` | exit 0 | 私有应用实际 Webview；C++ 124帧、围栏22帧、Python95帧、Shell55帧、JS70帧，闪回/高度回退/围栏泄漏均0 |
| client 120s / OI 120s | exit 0 | helper 精确命令与日志 `tmp/notebook-experience/review-client.*`（5.849s）、`review-extensions.*`（23.06s） |

实际 Runner 回归命令：先 `node node_modules/typescript/bin/tsc6 -p extensions/danielpinto8zz6.c-cpp-compile-run/tsconfig.test.json`；focused `node --test extensions/danielpinto8zz6.c-cpp-compile-run/out-test/test/notebookProcess.test.js`；全套 `npm --prefix extensions/danielpinto8zz6.c-cpp-compile-run test`。compiler 为自有应用 `tmp/notebook-ui/app/data/toolchains/ucrt64/bin/g++.exe`，helper 为已核对的 `tmp/notebook-experience/runner-input.exe`，所有运行源码均为测试夹具。

## 实际效果与限制

私有应用副本只替换三份扩展当前 dist/manifest，核心与此前完整包一致；最终包再比对 host/renderer/UI/Worker，保证源码语义一致。未运行学生文件、调用模型、保存聊天或操作账号。

`render-review.bcnb` 实际运行成功：compile 651.481ms/run 6.9903ms，标题 `OK | compile 651 ms | run 7 ms`；普通 `77`、`cerr stays plain` 默认色，debug `88: 88` 紫色，输入编辑区无重复勾号/耗时。原生保存并重开保留真实结果。公式及 Mermaid 可见，截图 `tmp/notebook-ui/review-before.png`、`review-notebook.png`。Beacon 实际公式/代码阅读截图 `review-beacon.png`，plain code 的 `$HOME` 保持原文；未配置发送维持禁用。

GUI 定位曾因编辑器使用 NBSP 而等普通空格文本超时；随后重新观察真实 DOM/坐标执行，不算源代码故障。另发现私有桌面 GPU 绘制下侧栏切换导致 Notebook iframe 暂时空白：renderer DOM 与位置均正确，滚动重绘恢复；原生 ipynb 同样复现。临时 compositor 层探针不能稳定修复。仅给自有测试 launcher 加 `--disable-gpu` 后，ipynb/bcnb 重开与侧栏切换均正常（`review-software-resize.png`、`review-software-notebook.png`）。这是环境对照，尚不能断言正常桌面的 GPU 行为；不改产品 GPU 设置、不添加强制刷新/模拟滚动补丁，负责人正常桌面验收仍需注意此项。所有测试 PID/可执行路径核验后仅终止自身进程树，未切换用户桌面。

## 最终交付

- `npm run gulp vscode-win32-x64-min`：exit 0，95.065s，300s外部限时未触发。Electron下载曾 ECONNRESET，Gulp自身重试后完成；没有代理重启失败的验证命令。既有 npm配置/fs.Stats 弃用提示仍在，没有改用户环境来隐藏提示。
- 直接 `verify-becoder-package.ps1 -IncludeCompiler $true`：exit 0，含中文语言包边界与编译器完整包校验。
- 文档结构脚本及本轮 scoped `git diff --check`：exit 0。
- SHA-256逐一对照：GUI副本和最终包的 workbench、Notebook host/renderer、Beacon host/UI/syntax Worker、Runner host七份文件完全一致；GUI证据对应最终交付的语义。原生 helper 来自最终构建，源码未改变其合并实现，编译资产由包校验检查。
- 最终应用：`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。保留完整应用目录；未制作Setup、未提交/推送Git、未操作日常安装或学生资产。负责人正常桌面验收仍待进行，特别区分私有桌面GPU对照与普通桌面的实际表现。
