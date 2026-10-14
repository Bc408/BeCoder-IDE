# 扩大检查半径：Notebook、Beacon 与相邻执行/存储审查

日期：2026-10-14。负责人直接授权清理、修复、隔离效果检查及完整应用构建。分支 `codex/BeCoder_Next`，HEAD `865c504d0795d7b64dc413756916e17ee36696c5`；保留既有未提交成果。

## 本轮理解与检查半径

延续独立 Notebook、原生编辑/输出/保存与 Beacon 受控辅助。按 serializer/edit owner → request-local Notebook tools → 会话绑定、记录消费 → Runner/CPH 存储及依赖/文档扩大。只有无消费者或已被当前设计取代的路线才删除；不拿原生成熟适配或真实用户资产读取当开发快照兼容。

保护三档资格、会话归属/隔离、完整备份、结果真实性、input 执行、取消/收尾、原生附件、公式与高亮。学生源码、日常安装、账号、付费模型、依赖安装、Setup 与 Git 写操作不在本轮范围。测试使用私有夹具、headless 浏览器及私有 Windows desktop；源码、应用包、代理效果与负责人验收分开。

## 已确认发现与实施计划

1. `NotebookTools` 的晚到 begin 在取消后的首次 release 返回 false 时仍删除句柄，导致后续清理无法释放原生只读占用。先写失败用例，失败后按已有自行纠错授权修复；只有真实释放成功才丢句柄。
2. `close()` 遇第一个释放故障就停止，其他独立笔记的占用也被留下。收尾尝试所有本请求句柄，失败句柄仍保留，错误仍反馈，不删除笔记或撤销编辑。
3. Notebook 材料预算按字符累计，却声明8MiB。改为UTF-8字节，保留按字符分页。中文回归先失败后通过。
4. 旧内嵌 inputs 的读分支现仅为独立 input 的 content 别名，没有产品消费者。移除 `inputs` part、schema 与现行文档叙述，普通正文/input、outputs/attempt 读取保留。
5. CPH transport-less `.prob` 支持来自既有产品，ConPTY 适配固定当前 node-pty；继续有用户路径/测试消费者，保留。原会话 save/drain 同时承担异步保存期间最新状态保护，不凭“合并”关键词删掉。

## 预检、冻结命令与停止规则

命令来自现有 package.json、AGENTS、现存 npm/TypeScript/esbuild/ESLint 与验证 helper。正式输入只含本轮现存普通文件；不删除生成目录或旧用户文件。

- Beacon `node build.mjs`、focused `node --test --test-name-pattern="late cancelled begin|cleanup continues|UTF-8 bytes" dist-test/context.test.cjs`。明确RED失败后停止其余验证，修复后进入GREEN。
- Beacon `npm run typecheck`、`npm run lint`、`npm test`、`npm run test-render`、`npm run test-attachments-render`；Notebook `npm run typecheck`、`node build.mjs`、`npm test`。
- 本轮 Notebook TS scoped ESLint；现行文档结构脚本及 scoped `git diff --check`。
- `node tmp/notebook-experience/build-validation.mjs expanded-client 120 run typecheck-client`，同helper `expanded-extensions 120 run compile-oi-extensions`，同helper `expanded-windows 300 run gulp vscode-win32-x64-min`；正式非零/超时停止后续，报告失败层与未执行项。
- 隔离 app 使用上轮已验证私有desktop launcher的软件绘制版本，不改产品GPU设置。查看Notebook运行/保存/重开、Beacon渲染；仅关闭核验过路径的测试PID。
- 直接包校验 `& .\build\azure-pipelines\win32\verify-becoder-package.ps1 -PackagePath 'C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64' -IncludeCompiler $true`，对照GUI副本与交付包对应host/UI/renderer SHA-256。

不重复产品brainstorming，不缩减首版能力。本轮没有新依赖、许可证或核心布局变更；若检查发现这些领域有实际缺陷再按证据扩大，而非事先作兼容框架。

## 实施与验证记录

- 三项 focused 回归先 exit 1（3失败）：晚到 begin 丢句柄、首次 release 故障阻断第二句柄、UTF-8 预算按字符通过。停止后修复并重建 Beacon，再以同一命令 exit 0（3通过）；不是以模拟成功代替故障复现。
- Beacon `node build.mjs`、`npm run typecheck`、`npm run lint`、`npm test` 均 exit 0；全套124通过、0跳过。`test-render` 与 `test-attachments-render` 均 exit 0，覆盖当前对话、公式、代码、历史/设置、附件及请求恢复界面。
- Notebook `npm run typecheck`、`node build.mjs`、`npm test`、editApi scoped ESLint 均 exit 0；29项通过、0跳过。现行文档结构校验与 scoped diff whitespace 检查 exit 0。
- 核心 `typecheck-client` exit 0，10.865s；OI `compile-oi-extensions` exit 0，40.034s；均未触发120s外部限时。日志及精确命令保存于 `tmp/notebook-experience/expanded-client.*`、`expanded-extensions.*`。
- 单独只读复核当前 serializer、content edits、资源占用、请求收尾、历史异步保存、Runner/CPH消费者与 manifests。Notebook只接受当前 version 2；未增加开发快照迁移。现有图片/输出metadata、协议adapter、CPH真实已发布数据读取保留。文档移除旧 inputs part/图片 handles，并把已删除 historyStore 的证据明确标为调研时源码；补正 PDF/page 材料已实现的状态。

## 隔离效果检查

仅更新自有测试 app 的 Beacon、Notebook 与 Runner dist/manifest，使用私有 Windows desktop，未切换用户桌面或启动日常安装。自有 `render-review.bcnb` 通过 input 运行，实际 completed/exitCode 0，compile 1673.3718ms/run 15.3657ms。状态栏 `OK | compile 1673 ms | run 15 ms` 只在输出；77与普通cerr默认色，debug紫色。原生保存、关闭重开后真实输出与公式仍可见；Beacon空白对话/工作区选择界面显示正常，未调用模型或保存聊天。截图 `tmp/notebook-ui/expanded-notebook.png`、`expanded-reopen.png`。

采用上轮与原生ipynb对照确认的软件绘制测试launcher，不修改产品GPU设置。本轮视觉证据适用于隔离软件绘制环境，普通桌面的GPU表现及负责人最终验收尚未确认。测试PID30532已核对自有可执行路径并终止其进程树。

探索搜索曾误用Windows路径glob及不存在的renderer路径，属于只读定位失误；随后按文件枚举与rg的glob参数修正，不作为验证通过或源码失败。调试连接未能稳定枚举侧栏子frame，故本轮实际应用对话仅核对空白界面；完整对话内容由headless正式渲染用例验证，不冒充本轮实际模型调用验收。

## 完整应用交付

- `npm run gulp vscode-win32-x64-min` exit 0，159.787s，300s限时未触发。精确日志 `tmp/notebook-experience/expanded-windows.log`，结果同名json；现有npm配置与fs.Stats弃用提示未改变构建结果，未改环境隐藏提示。
- 直接包校验 `verify-becoder-package.ps1 -PackagePath 'C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64' -IncludeCompiler $true` exit 0，包含简体中文语言包边界及编译器资源。
- SHA-256七份逐一一致：workbench、Notebook host/renderer、Beacon host/UI/syntax Worker、Runner host；本轮隔离效果对应交付包这些文件。没有将源码检查冒充模型/账号端到端验收。
- 完整应用入口 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。整个目录交付；未制作Setup、提交/推送Git、修改学生文件或日常安装。负责人正常桌面手动验收仍待进行。
