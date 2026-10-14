# Code-OSS 1.140 升级完整性审查

2026-10-14。负责人直接授权扩大审查、清理与修复、完整应用构建及自行纠错。分支 `codex/BeCoder_Next`，HEAD `865c504d0795d7b64dc413756916e17ee36696c5`；保留前序未提交成果，不操作 Git 写入或日常安装。

## 目标与证据

本轮审查已有升级，不重新覆盖仓库。当前 README、product extensionApiVersion、组件清单为1.140.0，Electron为43.7.3；升级提交 `5077410e`。本地只读参考 `../vscode-1.140.0` 的 HEAD 核验为 `07f806f999227108933c2e30515b26eecc1fda74`，Microsoft MIT许可证。官方发布说明 https://code.visualstudio.com/updates/v1_140 。旧 tmp 修复脚本仅用作找出冲突接点，不执行其命令，不视其台账为本轮验证。

## 检查与实施顺序

- [x] 沿升级冲突的 dependency graph 检查 Windows生命周期/native窗口、现代布局、扩展API/data channel、浏览器、终端与构建裁剪。
- [x] 核对可执行产品边界与语言包/许可证；较低engines版本是最低API兼容声明，不凭1.130字样删除实际资源。
- [x] 对无消费者的升级残留窄清理；潜在bug须以调用链或失败用例确认，不为迎合版本号重写成熟组件。
- [x] 先focused失败回归，再修复与GREEN；单独只读复核功能、失败边界、本地化及现有成果。
- [x] 通过所属检查及完整构建，交付完整应用目录；源码、包资源与负责人运行验收区分。

保护编辑、GCC/clangd、Runner/CPH、浏览器/PDF、原生Notebook、Beacon权限及学习资产。既有产品排除Copilot/Chat/Agents/MCP不因升级重新引入。没有模型/账号操作、Setup、依赖安装、系统设置修改或学生文件改写。

## 命令预检及冻结验证序列

已核对Node v24.17.0、现有TS/ESLint模块、相关test及helper路径。Node直接执行本仓build测试TS是现有台账/脚本的真实入口，无需安装工具。

1. `node --test build/lib/test/nodePty.test.ts build/lib/test/electronLocales.test.ts build/lib/test/oiExtensionBoundary.test.ts`：root，120s，源码/包装策略baseline；失败停止。
2. 新增窄回归使用同一boundary test的 `--test-name-pattern`，先RED；明确失败后按本轮自行纠错授权修复，不静默继续后续步骤。
3. scoped ESLint、本轮docs结构/diff检查；完整上述boundary序列再执行。若API/产品行为修改，再执行所属真实行为测试。
4. `node tmp/notebook-experience/build-validation.mjs upgrade-review-client 120 run typecheck-client`；同helper `upgrade-review-extensions 120 run compile-oi-extensions`。
5. `node tmp/notebook-experience/build-validation.mjs upgrade-review-windows 300 run gulp vscode-win32-x64-min`。
6. 直接 `& .\build\azure-pipelines\win32\verify-becoder-package.ps1 -PackagePath 'C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64' -IncludeCompiler $true`。

复核语言包后，序列3补入 `node build/azure-pipelines/win32/verify-becoder-language-pack.ts extensions/MS-CEINTL.vscode-language-pack-zh-hans/translations/main.i18n.json`，root下scoped ESLint覆盖七份本轮TS（build test、npm dirs、window common/electron-main、windowImpl、nativeHost、windowActions）。序列4前补入 `node tmp/notebook-experience/build-validation.mjs upgrade-review-layers 120 run valid-layers-check`。六个layer配置、layersChecker、language verifier与修改后PS语法均已预检；没有样式修改，不执行无关stylelint。

## 发现、修复与保留依据

1. baseline test exit 1：29项中28通过，语言包内容清单已是前序修改后的17a597…，test仍硬编码更旧f540e1…；同样packaged hash旧值也残留。删除两个重复快照常量断言，保留原VSIX归档hash、计算源资源/实际打包JSON资源hash与组件清单的双重比对，以及包校验的明确pin。校验强度没有退化为只看元数据。
2. `build/npm/dirs.ts` 有27个无package.json的已删除扩展入口，包括Copilot、Debug及Remote测试路径。删除这些无消费者候选；实际扩展、开发测试工具以及可选 `.build/distro/npm` 仍保留。没有执行npm安装或删除目录。
3. upstream window iconPath专供isSessionsWindow；本产品移除Sessions后只剩常量undefined、永不执行分支、字段及native/renderer跨进程链。整条移除，window picker继续从filename/workspace得到原有图标与dirty/关闭操作。source policy focused先exit1，清理后exit0；延伸到renderer链先exit1再exit0。
4. 语言包仍有81个完全没有TS/TSX/JS/MJS/MTS源码owner的旧模块，包括旧InteractiveSession、Remote/Browser自动化及已迁移路径。新增资源归属回归先exit1；只删这些模块，不改其余模块值。删除清单与哈希计算helper保存在 `tmp/notebook-experience/upgrade-language-pruned.json` 及同目录review.cjs。同步组件修改声明/source content hash `8435eb0aaeb22e3b21baf12a632f34ee8783277d772ef90740f7c9e7342ecc6f`、package hash `fd0f4673efb956ca2b469363037e573bf34239ecb59f218335cf1c97efe00905` 与包验证pin；VSIX版本、原归档hash及MIT许可证不变。

独立只读复核保留依据：GlobalCompositeBar的getHeight/onDidChange被现代Activitybar的高度与重布局消费者使用；data channel/linkPresentation服务、mainThread、extHost及API注册被Markdown编辑器消费；没有按“来自Agents升级”删通用服务。Electron43.7.3由.npmrc、electronVersion与checksums选用；本地Electron类型checksum复用是真实下载缓存，并非旧版本API兼容。普通认证、Proxy、ipynb、Mermaid、GCC/clangd/Runner保护边界通过现有policy检查。静态全源搜索中readonly message的undefined默认与upstream相同，未把普通默认值误判为死分支。

## 验证台账

- 原baseline31之前：29项28通过/1失败；focused两种残留与renderer延伸分别RED后GREEN。最终 `node --test …nodePty …electronLocales …oiExtensionBoundary`：31/31通过，exit0、0跳过。
- language verifier、七文件scoped ESLint、docs结构与scoped diff：exit0。PowerShell包validator源码parse预检通过。
- `valid-layers-check`首次exit1，31.215s：window/electron-main的URI导入在清理字段后unused；停止后续步骤并删除导入、scoped lint exit0，再启动 `upgrade-review-layers-rerun`。不能把首次lint通过当所有TS层已经通过。
- layers重跑exit0，38.808s；核心typecheck-client exit0，5.5s；compile-oi-extensions exit0，23.272s。最终31项boundary再次exit0，七文件scoped lint再次exit0。日志及外部限时结果在 `tmp/notebook-experience/upgrade-review-*.log/json`。
- 对比前序自有隔离应用的原语言资源：81个模块减少；所有保留模块的键值内容差异为0。检查前确认文件存在，以AsHashtable解析空模块键，不以文本排版差异当翻译变化。
- 探索曾对不存在的becoder入口试读、PowerShell语言包JSON空键解析未用AsHashtable；均为只读定位/解析失误，随后文件枚举及AsHashtable修正，不计入正式验证，也不把错误输出中的0项统计当事实。

本轮不是重做整个1.140迁移，也不是已经逐行证明所有Code-OSS代码无bug；审查半径和固定源码如上。没有新增依赖、恢复已排除的上游产品或修改工作区/学生数据。

## 最终交付与接受边界

- `npm run gulp vscode-win32-x64-min`：exit0，125.895s，300s外部限时未触发。当前已有npm配置及fs.Stats弃用提示保留，不改变系统环境隐藏提示。
- `verify-becoder-package.ps1 -IncludeCompiler $true`：exit0，校验更新后的简体中文资源/组件哈希及完整编译器包，Runner helper由本次构建产生。
- 文档结构与本轮scoped diff check再次exit0；本轮没有CSS修改或额外全源改写。
- 应用 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`，保留整个应用目录使用。未启动GUI；本轮通过的是源码、分层与发行资源检查，负责人正常桌面运行验收仍待进行。
- 本轮保留既有dirty成果，未安装依赖、制作Setup、修改用户数据、提交/推送Git。实际1.140功能保留不等同于重新引入上游所有AI/Remote产品，本轮也不宣称Beacon剩余首版功能已全部完成。

检查非零/超时停止并注明源/编排/外部/包层；不删除缓存或自动重启失败构建。最终应用运行验收由负责人进行，本轮未授权额外GUI步骤，不启动日常安装。
