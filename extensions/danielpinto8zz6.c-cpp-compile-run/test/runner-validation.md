# Runner 输出流阶段性验收记录

日期：2026-09-18。分支：`codex/outStreamFix`。本记录对应未提交工作区构建，不代表 Release 发布或项目所有者验收。

## 产物与范围

- 暂存应用：`C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64\BeCoder.exe`。
- 普通 Run 改用 ConPTY，通过光标继承接续现有 BC 内容。
- `debugger.h` 输出恢复为 `cerr`；发行工具链 ZIP 和单份 PCH 已同步重建。
- ZIP SHA-256：`60805e87afb607e9fd16e82a2b0f740107003204ee1600da58337ac40c602adb`。
- 源码旁同名 EXE 的发布、正常结束清理及取消后保留行为不变。
- 此处为初次原型记录；`Run With Input` 后续已迁移到 ConPTY 输出并保留文件 stdin/EOF，见文末的新验收记录。
- CPH 不在本地产品黑名单内；后续 2026-09-19 检查确认远程清单报告导致禁用，修复及新构建证据见下节。没有内置 CPH 或浏览器联动。

## 验证台账

命令工作目录均为仓库根目录；下列命令省略重复的扩展目录前缀时，以本文件所在 `test` 目录为定位依据。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 工具链组装 | `pwsh -NoProfile -File build/win32/assemble-becoder-ucrt64.ps1` | 退出 0；签名包、C/C++ 标准及 debug stderr 检查通过，3233 文件 |
| 产品边界 | `node --test build/lib/test/oiExtensionBoundary.test.ts` | 退出 0；26/26 |
| Runner 编译与测试 | `node node_modules/typescript/bin/tsc6 -p extensions/danielpinto8zz6.c-cpp-compile-run/tsconfig.test.json`，然后 `node --test extensions/danielpinto8zz6.c-cpp-compile-run/out-test/test/*.test.js` | 最近一次源码检查退出 0；63/63 |
| 客户端类型检查 | `npm run typecheck-client` | 退出 0；约 11 秒，外部上限 120 秒 |
| OI 扩展编译 | `npm run compile-oi-extensions` | 退出 0；约 20 秒，外部上限 120 秒 |
| Windows 应用 | `npm run gulp vscode-win32-x64-min` | 退出 0；约 164 秒，外部上限 300 秒 |
| 包检查首次调用 | verifier 的 `PackagePath` 为相对路径 | 退出 1；清单自身未被排除，属于路径编排错误 |
| 包检查修正调用 | `& ./build/azure-pipelines/win32/verify-becoder-package.ps1 -PackagePath (Resolve-Path ../VSCode-win32-x64).Path -IncludeCompiler $true` | 退出 0；没有放宽校验或改动产物 |
| 包内 PCH 与双流 | `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerPtyProbe.cjs --gcc-packaged ../VSCode-win32-x64/data/toolchains/ucrt64/bin/g++.exe` | 退出 0；`-H` 确认 PCH 命中；stdout 不含 debug；默认同步和关闭同步两种回放通过 |

构建的精确时长与完整日志保存在 `.build/runner-validation/ledger.jsonl` 和同目录三个 `.log` 文件。

## 实际应用自动化检查

通过 CDP 操作新构建的 BeCoder，使用 `runnerGuiLaunch.cjs` 生成的独立测试项目；没有操作系统 VS Code。截图保存在 `.build/runner-validation/`。

- `first-run.png`：普通 Run 的 OUT0/i:0 至 OUT4/i:4 交错显示，调试内容为紫色，正常退出并清理 EXE。
- `interactive.png`：输入 21，显示 `x: 21` 和 `ANSWER=42`，没有双重回显；此前运行记录仍保留。
- `with-input.png`：从普通文件 `input` 读取 21，自动结束；可观察到此入口仍然存在双管道的相对顺序差异。
- `cancel.png`：静默程序运行中最大化、隐藏/显示面板，Ctrl+C 后恢复 BC 提示符；进程枚举确认测试程序已退出，取消后 EXE 按旧行为保留。
- `volume.png`：20000 组 cout/cerr 输出后显示 `VOLUME_DONE`，正常退出并清理 EXE；这不是无限输出背压或完整逐行审计的证明。

实际扩展日志位于暂存应用 `data/user-data/logs/20260918T211747/window1/exthost/becoder.runner/`。自动化实例已关闭，测试项目与证据保留供复查。

## 验收重点和剩余限制

请使用自己的竞赛代码确认输出顺序、空行/颜色、交互输入、取消后再次运行及多标签切换的使用体验。

当前具备阶段性反馈条件；没有构建 Setup，没有提交、推送或发布。

- PTY 的 Windows 就绪适配依赖 node-pty `1.2.0-beta.13` 内部结构，升级依赖时必须复审。
- 无限输出的渲染背压尚未实现；此次有限压力用例通过不替代该保障。
- 复杂全屏终端程序、特殊控制序列、系统版本矩阵尚未完成回归。
- 本条为历史限制，后续 `Run With Input` 完成记录见文末。

## 2026-09-19：CPH 启用修复与新构建

根因是产品配置的 Eclipse publish-extensions 控制清单在 `malicious` 中包含 `divyanshuagrawal.competitive-programming-helper`。旧应用日志实际记录安装成功；截图提示来自安装后的禁用和问题报告。

增加产品配置 `extensionControlManifestExemptions`，目前只列 CPH 的完整 ID。新鲜清单和旧启用缓存使用相同策略；发布者级报告不被豁免，本地 `extensionBlacklist` 优先。以后内置 CPH 时可移除此例外并应用产品限制。该例外是项目所有者授权的产品决策，不代表对 CPH 安全性的独立审计。

- 类型检查此前因遗漏构造参数成员声明失败，修复后经授权重跑通过（约 8.6 秒）。
- `node --test build/lib/test/extensionControlManifestPolicy.test.ts build/lib/test/oiExtensionBoundary.test.ts`：30/30 通过。
- `npm run compile-oi-extensions`：退出 0，约 14.4 秒。
- `npm run gulp vscode-win32-x64-min`：退出 0，约 110 秒，外部上限 300 秒。
- 绝对路径调用包验证器，`IncludeCompiler=True`：通过。
- 旧应用整体保存在 `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64-before-cph-20260918`；复制后文件数及总大小一致。用户设置、扩展及缓存恢复到新应用，新工具链不被旧数据覆盖。
- 新包实际加载已有 CPH `2026.9.1789578855`：日志记录激活、命令注册；扩展详情出现 Disable 按钮且无问题报告提示；CPH Judge 侧栏成功打开。
- 证据：`.build/runner-validation/cph-details.yml`、`cph-enabled.png`、`cph-commands.yml`、`cph-panel.yml`、`cph-panel.png`；运行日志在新包 `data/user-data/logs/20260919T113750/`。
- 观察到 Open VSX 的 CPH latest 查询返回 404；市场可用性未由本次产品例外修复。没有卸载重装用户扩展，没有宣称 CPH 内置 GCC 判题已集成。
- 自动化窗口已关闭；未创建 Setup、提交或发布。

## 2026-09-19：Run With Input 完成与验收候选

新入口仍在编译前读取严格名为 `input` 的普通文件，写入当前请求的私有快照。预编译的 `dist/runner-input.exe` 在 ConPTY 内直接启动用户程序：stdin 为独立管道，stdout/stderr 为同一控制台；关闭写端产生真实 EOF，无键盘模拟或输入回显。

助手仅在应用打包时由内置 GCC 编译，采用静态运行库链接；客户端不会生成或编译助手。助手源文件在 `native/runnerInput.cpp`，构建入口为 `build/win32/build-runner-input-helper.mjs`。构建期间自动使用刚暂存的 GCC 编译并装入 Runner 扩展。独立命名管道携带启动/错误/退出状态，状态不混入程序输出。Job Object 负责子孙进程回收。原有源码旁 EXE 发布、正常结束清理及取消后保留行为未改。

验证：

- Runner 类型编译成功；`node --test extensions/danielpinto8zz6.c-cpp-compile-run/out-test/test/*.test.js`：66/66。
- 产品边界和 CPH 策略：30/30。
- `runnerInputProbe.cjs <helper.exe> <g++.exe>`：空文件、无尾换行、中文/CRLF、NUL/Ctrl-Z、4MB 输入、提前退出、程序返回 125、阻塞输入时取消、子孙进程取消、启动失败共 10 项通过，宿主自然退出。原型助手与最终包内助手分别通过。
- `runnerWithInputIntegration.cjs <helper.exe> <g++.exe>`：实际 RunnerExecutor 测试通过；编译期间更改原始 input 不影响快照，EOF 和显示顺序正确，正常退出清理、取消保留、取消后再运行及请求目录清理正确。
- `npm run typecheck-client`：退出 0，约 7.6 秒。
- `npm run compile-oi-extensions`：退出 0，约 12.5 秒。
- `npm run gulp vscode-win32-x64-min`：退出 0，约 107 秒；助手在此流程内编译。
- 包验证 `IncludeCompiler=True`：通过，包含新助手文件检查。
- 实际窗口：工具栏 Run With Input 及 BC `run withInput.cpp -WithInput` 均成功；显示 OUT=21、紫色 x:21、AFTER=42、EOF_DONE，无输入回显；连续运行记录保留。
- 实际窗口：文件模式运行中最大化、隐藏/显示面板、Ctrl+C 均正常；枚举未见测试程序/助手残留；非零退出 7 正确展示为 runtime-error；随后普通 Run 回归成功。

失败与修正记录：最初回放断言将 ConPTY 填充到行尾的空格误算为内容，改为比较去除行尾填充后的行文本；取消可产生正常的取消退出报告或控制管道断开，测试改为接受两者但严格检查进程回收；原生测试夹具在发行 DEBUG PCH 下引入多余 Windows COM 声明而冲突，夹具使用 WIN32_LEAN_AND_MEAN 后通过，未改产品编译参数。

截图：`.build/runner-validation/withinput-ordered.png`、`withinput-exit.png`、`withinput-final.png`。实际项目：`.build/runner-validation/gui-project-6k8qLL`。精确构建日志仍记录在 `ledger.jsonl`。

验收产物：`C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64\BeCoder.exe`。上一版完整备份：`C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64-before-withinput-20260919`。

自动化窗口已关闭，等待项目所有者验收；未构建 Setup、提交或发布。ConPTY 遵循程序实际写入与刷新顺序，不能替任意用户程序刷新其自行保留的缓冲；此前关于无限输出背压的限制仍存在。

## 2026-09-19：BC 多余空行修复

旧包副本实际复现：`Run With Input` 命令后及偶发结束提示前多一空行。根因是 `writeProcessOutput` 把仅含 ConPTY 光标查询、颜色、标题等 VT 控制序列的块误判为未换行，随后 `ensureLineBoundary` 补出多余换行。

加入跨块的终端输出行尾跟踪，仅改变是否需要补换行的判断；原始 VT 输出不被删改。测试覆盖拆分 CSI/OSC、尾随颜色重置、真实连续空行，以及确实缺失末尾换行时补齐行边界。

- Runner 类型检查及 67 项测试通过。
- 将真实 Runner/助手集成回放改为经过实际 `BcTerminal`，逐行断言命令、运行提示、程序输出、完成提示之间没有额外空行；快照/EOF/取消/再运行通过。
- 客户端类型检查约 7 秒、扩展编译约 13 秒、Windows 构建约 102 秒，均退出 0；包验证通过。
- 新旧应用实际窗口对照：`.build/runner-validation/newline-before.png`、`newline-after.png`。新包首次和连续运行已确认多余空行消失。
- 上一版及用户数据保存于 `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64-before-newline-20260919`；独立复现副本为同级 `VSCode-win32-x64-newline-probe`。
- 新验收程序仍为 `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64\BeCoder.exe`。自动化实例关闭，未制作 Setup 或发布。
