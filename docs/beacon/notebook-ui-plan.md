# Notebook 视觉、类型入口与内置能力

2026-10-14。负责人明确授权实现、自己查看实际效果后继续修正，并要求干净应用构建。分支仍为 `codex/BeCoder_Next`，HEAD `865c504d0795d7b64dc413756916e17ee36696c5`；保留前序未提交改动，不操作 Git。

## 范围与归属

`.bcnb` 独立类型入口仅 C、C++、Markdown、input。input 注册 `becoder-input`，显示名 input；编辑区只保留正文、类型标签及原生运行/停止入口。执行状态和 compile/run 时间由下方输出的英文标题负责，不保留原生勾号/总耗时与额外 28px 状态行的重复显示。输出流仍合并 stdout/cerr，debug ANSI 由既有 Microsoft renderer 实现，不分区或给 cerr 强制颜色。

公式和 Mermaid 由已有 Markdown 数学/图示 renderer 提供，代码/CSS/字体均随包，不新增 TeX/Python/其他运行环境；它们在 Markdown 内工作，不宣称完整 LaTeX 文档编译。Markdown 图片附件只保留原生粘贴/渲染，不增专用按钮或新实现。普通编辑器与 ipynb 不缩减语言支持。模型 Notebook 内容工具同步新 input 标识；不保留旧 plaintext input 或旧开发数据迁移。

原生插入栏新增 input，绑定点击位置；`.bcnb` 独立布局把工具栏居中放入块间空隙，支持原生左右/居中设置。语言转换同步角色、清除该块旧执行结果；选择当前语言不清空结果。仍不自动执行、不写学生源文件、不操作账号或付费模型。

## 开发与验证记录

TDD：英文标题测试打包最初因缺失 formatBeCoderRunHeading 失败；支持范围测试最初未拒绝 Python/旧 plaintext 而失败。各自实现后通过。开发打包失败后曾误继续执行上一版测试产物，该旧产物不计本批结果。

第一轮正式 `node tmp/notebook-experience/build-validation.mjs ui-types 120 run typecheck-client` exit 1：状态栏相对导入路径少一层，input 插入参数需要实际 NotebookViewModel；停止后续序列，修正后 `ui-types-fixed` exit 0；最后 `ui-types-final` exit 0，8.031 秒。

`ui-extensions-final` 执行 `npm run compile-oi-extensions`，120 秒外部限时，exit 0、27.950 秒。Notebook 完整 test 26/26、Beacon 完整 test 120/120，均 exit 0、无跳过。所属 scoped lint exit 0。第一次应用构建 `ui-windows` exit 0、115.597 秒；该构建尚未含随后发现的插入栏偏移修正，不能作为最终候选。

## 实际界面反思

Windows 原生截图接口连续超时；第一次启动的 portable 路由没有按传入 user-data-dir 分离，且可见窗口打扰负责人。随后停止该实例，改在 `tmp/notebook-ui/app` 使用独立应用与自有 data，排除原 user-data。测试副本第一次遗漏随包 data/toolchains，出现 clangd/编译器缺失提示；仅复制包自有工具链/标记后重新加载，提示消失，不以该缺失误判产品源码。

后续使用已安装 Playwright 连接隔离实例的 localhost Electron CDP，后台检查 DOM/截图，不激活 Windows 窗口，不安装浏览器。专用 visual.bcnb 的实际 input 运行结果为 `OK | compile 735 ms | run 8 ms`，程序流 `776` 和紫色 debug `88: 88`；正文无勾号或总耗时。类型列表实际只有 input、Markdown、C、C++。Markdown 实际出现 KaTeX 数学 DOM 和 Mermaid SVG，并取得可见截图；资源来自内置扩展，没有远程数学/图示服务。

DOM 测量发现首次增加 gap 仍不能解决插入栏重叠：代码框底部 y=443，toolbar 顶部 y=432.5，重叠 10.5px。原生公式扣除了整个 gap，所以增加间距被抵消。已修正为仅 `.bcnb` 在 reserved gap 内居中；普通 Notebook 保持原公式。修改后需重新构建、测量并验证实际插入行为。

最终构建/包检查/布局复验结果待补充。截图、夹具、日志在 tmp/notebook-ui 与 tmp/notebook-experience，不作为产品资源入包。根/扩展文档与源码事实同步，不把代理验证当作负责人已验收。

## 最终修正与复验

2026-10-14 后台 CDP 复验：类型 QuickPick 只有 input（becoder-input）、Markdown、C、C++；点击第二块的原生 `+ input` 后保存，真实文件的四块依次为 cpp、旧 input、新空 input、Markdown，证实插入归点击位置。工具栏已居中落在输出与下一文本块的空隙，截图 after.png。Markdown 渲染的公式与 Mermaid 可见，截图 math-diagram.png。

字体计算发现 Webview 不提供 --monaco-monospace-font，原渲染实际回退到 Segoe UI；改用原生已注入 --vscode-editor-font-family（Consolas/Courier New/monospace）后截图确认等宽输出。旧构建 ui-final-windows（106.245 秒）及 ui-delivery-windows（102.518 秒）只是迭代候选，不作为交付。最后额外保证错误处理时即使更新状态输出失败，也调用原生 execution.end，避免界面忙碌状态悬挂。

内容工具类型转换新回归先因旧 input 结果留在程序块而失败，修正为仅原类型不变时保留既有实际结果；原对象不被修改。最终 Notebook 27/27、Beacon 120/120、无跳过；完整 14 文件 scoped ESLint exit 0，随后字体/结束保护所属 lint、Notebook 类型检查均 exit 0。核心最终 ui-final-types exit 0、6.850 秒；最后 OI 编译 ui-close-extensions exit 0、26.869 秒。最终应用与包验证结果随后补充，不以旧候选替代。

本批包验证命令冻结为：`build\azure-pipelines\win32\verify-becoder-package.ps1 -PackagePath C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64 -IncludeCompiler $true`。入口和候选目录已定位，命令参数来自脚本；直接检查包内编译器、内置扩展、资源/许可证及发布政策，不打 Setup、不清缓存、不操作 Git。

## 交付候选

`node tmp/notebook-experience/build-validation.mjs ui-close-windows 300 run gulp vscode-win32-x64-min` 最终 exit 0、101.971 秒；`ui-close-extensions` exit 0、26.869 秒。上述包验证 exit 0，包含编译器和中文语言包边界。npm 既有配置提示与 Node fs.Stats 弃用提示仍在日志，不是零警告声明；无构建错误或超时。最终 27/27 Notebook、120/120 Beacon 均通过。

从这一包刷新独立应用目录后重新运行测试 input，原生保存的真实结果为 completed/exitCode 0，compile 718.4225 ms、run 8.0016 ms，标题实际 `OK | compile 718 ms | run 8 ms`；截图 final.png。编辑区保持干净，输出等宽/默认色与 debug 紫色正确。该轮自动化曾在虚拟列表/非当前块的可访问性定位上等待超时；重新观察实际可见按钮后按真实位置点击成功，不把定位超时计作源代码失败或运行通过。最终原生块间工具栏位置与插入行为、受限类型菜单、公式/Mermaid 可见渲染已检查。只验证专用夹具正常运行和明确 UI 范围，不能宣称所有异常/长运行、主题/DPI 或完整 Beacon 首版均已验收。

产物为 `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64\BeCoder.exe`。验证结束关闭本任务的隔离实例，保留夹具/截图/日志及依赖；不改系统设置、不替换 D:\mythings\BeCoder、不打 Setup、不做 Git 写操作。

## 2026-10-14：新建入口、图标、输入文案与缓存命名

负责人直接要求补齐四项，本轮不扩展类型、模型执行权或图片能力。对照安装版 1.2.0 的 ipynb manifest：新建入口使用 file/newFile、notebook 分组与 shortTitle；命令面板由 commands 原生提供。复用同一机制，保留先打开文件夹的正式规则；空 bcnb 首次打开初始化为 Markdown 空块，非旧格式迁移。Seti 深浅主题复用 notebook 图标；input 按界面语言显示，状态行仍为英文。

缓存源文件采用笔记名-code序号，序号只数 C/C++ 块；名称去除 Windows 非法字符并限定长度，每次 mkdtemp 的 bcnb-随机目录独立。编译使用该目录与相对源文件参数，原目录通过已有 -iquote 提供本地头文件；运行仍使用笔记目录。证据保留实际源码路径、字节、编译参数、编译及运行 cwd。没有改写诊断文本或添加源码包装。保留原有 Job、取消、文件身份核验和清理。

验证预检：Node/npm CLI、TypeScript、ESLint、Notebook build/test、Runner tsconfig.test、staged GCC 与 runner-input.exe 已核对存在。冻结检查：Notebook build + test；Runner tsc6 -p tsconfig.test.json + node --test out-test/test/notebookProcess.test.js（进程内配置已存在的 GCC/helper）；六个本轮 TS 文件 ESLint；五份 JSON 解析；client typecheck 120 秒、OI extensions 120 秒、Windows staged build 300 秒。使用已有 build-validation.mjs 保存命令、退出码和超时信息。随后对自有隔离样例做后台界面验证及直接包校验。

RED：代码序号测试 undefined != 2；命名测试 program.cpp != 动态规划-code2.cpp；空文件测试 JSON 解析失败，均复现对应缺口。修正后 Notebook 29/29、Runner 9/9（真实 GCC、无跳过）、六文件 ESLint、JSON 解析通过。后续构建与界面证据另记，不提前视为验收完成。

后续验证记录：client typecheck 退出 0（7.130 秒），OI extensions 退出 0（24.172 秒），首次 Windows build 退出 0（97.783 秒）。隔离界面确认原生新建列表包含 BeCoder Notebook/Jupyter Notebook，选择后打开 Untitled-1.bcnb；中文顶栏、块间入口、语言标识为“输入”，悬停名“添加输入单元格”；资源管理器及标签显示 Notebook 图标；empty.bcnb 打开空白 Markdown。自有动态规划.bcnb 实际 CE，状态 CE | compile 469 ms，诊断 .\动态规划-code1.cpp:5:9，输入块正文保持干净；Ctrl+S 保存实际结果。截图位于 tmp/notebook-ui/new-file-entrance.png、cache-diagnostics.png、input-localized.png、empty-new-file.png。

测试启动先因提前释放私有桌面句柄而无 CDP，修正为宿主持有句柄至测试进程退出；旧测试配置缓存扩展清单，已将自有测试 profile 移到同一自有安装下的备份并使用全新 profile，未触及日常安装或用户配置。私有 Windows desktop 独立、未切换用户桌面。后台 Playwright role locator 因原生 Notebook 虚拟化不可见超时，随后按已观察的按钮坐标操作成功；不计超时为产品失败。最终测试进程与子进程按 PID/实际可执行路径核验后关闭。

包校验第一次因 powershell -File 将布尔参数传为字符串而未启动（编排失败）；修正为当前 PowerShell 直接调用后发现语言包摘要仍为旧值（实际校验失败），停止并核对来源。新增两条内置中文翻译需要同步组件清单的源码摘要、压缩后的打包摘要及验证器固定摘要。逐文件比对源码与打包内容，JSON 对象一致、非 JSON 字节一致，且从源码独立计算压缩后摘要与实际包相等。同步 provenance 并重新构建；未删减完整性检查，未改依赖或许可证。第二轮结果待最终记录。

最终：第二轮 Windows build 退出 0（96.679 秒）；直接包校验 IncludeCompiler=True 退出 0，中文语言包边界与确定性摘要检查通过。逐一 SHA-256 比对 GUI 测试副本与最终包的 workbench、Notebook host/renderer、Runner host、中文翻译五份文件完全一致；第二次构建变更仅为组件来源摘要接线，不以旧不同源码的界面证据冒充最终验证。未作 Setup、Git 写操作、安装依赖或账号操作。最终应用：C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe；负责人视觉验收仍待进行。

## 2026-10-14：来源文案、设置入口与紧凑间距

负责人录屏 17.05 秒及截图显示折叠/展开块间空隙明显。本轮直接实施范围为新建列表“.bcnb 支持”来源文案、设置分类/入口和紧凑布局。源码根因是前轮 NotebookOptions 单独使用 48px gap、33px toolbar 和居中 offset；原生 Jupyter 通常 gap/height 为 18px（隐藏 cell toolbar 等配置下原生策略另有 12/20/0px），本轮删除特例，使用同一原生算法，不另发明间距参数。

设置复用扩展 configuration 与原生 Settings editor：.bcnb 支持分类只提供已有图片附件粘贴开关（resource/default true），并链接 compactView/insertToolbarLocation/cellToolbarLocation；Notebook overflow 的设置命令直达 @ext:becoder.notebook。没有新增图片流程、独立配置页面或兼容行为。

预检已核对 Node/npm CLI、tsc6、ESLint、Notebook build、Playwright 与三份 JSON 文件，Notebook 原生布局设置键存在。冻结检查：两份本轮 TS ESLint；Notebook build/test；client typecheck 120s；OI extensions 120s；Windows staged build 300s；自有应用/配置/私有 Windows desktop 展开与折叠、插入栏、原生新建/设置界面验证；直接 IncludeCompiler 包校验。精确命令/退出码在 tmp/notebook-experience/compact-*.json 与 log 记录，截图使用自有样例，不操作日常安装或用户笔记。

结果：两份本轮 TS ESLint、三份 JSON 解析、Notebook build/test 29/29、client typecheck（7.249s）、OI extensions（23.325s）、Windows staged build（92.643s）退出码均为 0。最后移除 NotebookOptions 的额外空行，使该文件完全回到上游/HEAD，未改变已构建的语义。IncludeCompiler=True 直接包校验退出 0（含中文语言包完整性）。没有新增语言包译文，不需要重新固定语言包摘要；英文/中文扩展 nls 同步。

GUI：相同内容/字体/窗口下，bcnb 与 ipynb 展开的三个 editor rect 顶部均为 141/473/565px、高度 280/40/40px；折叠程序后标题行顶部 141px、高度 29px，后两块 editor 顶部 199/291px、高度 40px，两种文件完全一致。bcnb 悬停插入栏显示代码/Markdown/输入，实际点击输入后原生插入空块（单元格 2/4），自有样例已保存。原生新建列表显示 BeCoder Notebook 与来源 .bcnb 支持；命令面板 BeCoder Notebook: 设置 实际打开 @ext:becoder.notebook，分类 .bcnb 支持；开关改变只写入自有测试 profile，compactView 链接实际跳转 @id:notebook.compactView。Notebook overflow 设置贡献由 manifest 核对，其 OS 原生菜单不以 CDP 文本冒充完整验证。

截图：tmp/notebook-ui/compact-expanded.png、compact-collapsed.png、jupyter-spacing-reference.png、bcnb-support-new-file.png、bcnb-settings.png。测试使用私有 Windows desktop 和自有应用/样例/新 profile；自有旧测试 profile 仅移至同一自有目录备份，未删除。最终 PID 与可执行路径核验后终止其进程树，没有启动日常安装或操作用户录屏中的笔记。没有 Setup、Git 写操作或依赖安装；最终应用 C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe，负责人验收待进行。
