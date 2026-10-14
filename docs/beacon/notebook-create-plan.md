# Beacon 新建 Notebook 实施计划

> 使用 executing-plans 由主代理执行；负责人已要求继续开发，按 AGENTS.md 不启动子代理，不进行 Git 写操作。

**目标：** 用户明确请求时，Beacon 能直接生成指定新笔记，也能按已打开编辑器根创建源码关联笔记，不再要求用户预先手建空文件。

**依据：** [Notebook 正式设计](notebook.md)第 2、4、5、6 节及负责人最新决定。已有笔记改写、独立 input、原生保存与附件方案保持。

**方案：** 在现有 `editNotebook` 增加一次性 `create` 操作，接收完整 cells 与 path 或 sourcePath。Notebook 扩展解析编辑器根和关联目标、验证内容；原生窗口桥检查打开文件夹，主进程复用现有资源租约并校验不存在的目标、scope 和祖先身份。最后以原生 WorkspaceEdit.createFile 的 contents 创建，不覆盖已有文件，成功后打开文档。生成期间不创建空笔记；首次创建不产生备份。

## 边界与验收

- 新建必须有编辑器打开文件夹；源码关联仍按源码所属根，父级已有 `.notebook` 时按正式规则提示打开父级，不自动改根。
- spot 仅根内，flood 保持学习资产种类限制，blackout 没有创建能力；学生源文件、备份、私密目录及 `.beaconWork` 不能成为创建目标。
- 文件已存在或其他窗口占用时反馈冲突，不自动覆盖、改名或另建。新内容禁止伪造 outputs/attempt；不运行代码、不登录或交题。
- 取消在提交原生创建前检查；进入原生文件阶段后按实际状态反馈，不自建回滚/删除。失败不删除可能已创建的文档。
- 无依赖或许可证变化；本轮只做源码检查，Windows/Setup、真实模型、GUI 验收另行授权。

## 任务与验证台账

- [x] 主进程缺失目标授权、租约与版本复核；在 beaconInfrastructure.test.ts 覆盖根外、现有文件、链接、scope 变化、窗口退出与创建后释放。
- [x] Notebook create 内容映射、目标解析与原生提交；在 model.test.ts 覆盖没有结果的新文档、关联定位和父子目录，隔离临时文件验证。
- [x] Beacon schema/prompt/request-local工具接线；在 context.test.ts 覆盖无句柄创建、blackout、预取消与原生失败反馈。
- [x] 类型、生产扩展、所属测试、全客户端、scoped ESLint、层级、文档与 diff 检查；主代理另作只读复核。

预检命令来源为 AGENTS.md、所属 package.json 和已存在的本仓工具。核心夹具复用既有 esbuild fresh-source/已编译依赖路线，只导入当前存在的 infrastructure suite，删除的旧兼容测试不作为输入。开发 RED 是预期的缺失功能断言；正式失败停止后续检查，纠错轮次单独记录。精确命令和退出码在实际运行后填入，不把计划当验证结果。

## 实际验证记录

所有命令 cwd 为仓库根。预检确认 TypeScript/esbuild、配置、现存普通源码、核心已编译不变依赖、test-node harness 与层级检查七个入口存在。`build-create-tests.mjs` 是旧核心夹具编排的当前副本，排除已删除兼容测试，不改 out。无样式、manifest 或许可证变化。

| 精确命令 | 结果 |
| --- | --- |
| `node tmp/beacon-context-dev/build-create-tests.mjs` | exit 0，编译当前核心源码与 suite |
| `npm run test-node -- --run tmp/beacon-context-dev/core-create.test.js` | 开发 RED：缺少 create 入口；修正后 34/34。后续 Windows 命名流反例预期失败，补目标检查后最终 34/34 |
| `node tmp/beacon-context-dev/run-client-tests.mjs context` | 开发 RED：create 被旧句柄门槛拒绝；修正后通过。自审释放失败反例先失败，再补请求收尾后 19/19 |
| `npm --prefix extensions/becoder.notebook run build` | 开发 RED 夹具缺少导出时产生对应 esbuild 警告；实现后 exit 0，无诊断 |
| `node --test --test-name-pattern='new Notebook' extensions/becoder.notebook/dist-test/model.test.cjs` | 开发 RED exit 1，缺少创建 owner；实现后完整 suite 通过 |
| `node --test --test-name-pattern='creation resolves' extensions/becoder.notebook/dist-test/model.test.cjs` | 开发 RED exit 1，缺少目标解析；实现后完整 suite 通过 |
| `npm --prefix extensions/becoder.notebook run typecheck` | 最终 exit 0 |
| `npm --prefix extensions/becoder.notebook test` | 最终 exit 0，24/24 |
| `npm --prefix extensions/becoder.beacon test` | 最终 exit 0，116/116，14 suites |
| `node tmp/notebook-experience/build-validation.mjs create-typecheck 120 run typecheck-client` | exit 1，TS2502：新测试的 scope 类型标注自引用；源测试类型错误，停止后续正式序列，没有继续构建 |
| `node tmp/notebook-experience/build-validation.mjs create-typecheck-closeout 120 run typecheck-client` | 修正类型标注后最终 exit 0，11.008 秒；中间 r2/final 也通过，最后目标检查更新使其过时 |
| `node tmp/notebook-experience/build-validation.mjs create-extensions 120 run compile-oi-extensions` | exit 0，42.271 秒；随后仅核心目标检查改变，不影响扩展产物 |
| `node tmp/notebook-experience/build-validation.mjs create-layers-closeout 120 run valid-layers-check` | 最终 exit 0，75.215 秒；前一轮通过后核心目标检查有更新，已按影响复跑 |
| `.\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1` | exit 0；语义另由主代理复核，不把结构检查当功能验收 |
| `git diff --check -- README.md README_cn.md docs/beacon/implementation-status.md docs/beacon/notebook-create-plan.md extensions/becoder.notebook extensions/becoder.beacon/README.md extensions/becoder.beacon/src/notebookTools.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/test/context.test.ts src/vs/platform/beacon src/vs/workbench/contrib/becoder/electron-browser/beCoderNotebook.contribution.ts` | exit 0；未跟踪新文件另由所属 lint/类型/文档检查覆盖，未声称 diff 能检查它们 |

scoped ESLint 精确输入（12 个普通文件，最终 exit 0，零诊断；核心最后检查后已在收尾复跑）：

```powershell
node node_modules/eslint/bin/eslint.js src/vs/platform/beacon/common/beaconContext.ts src/vs/platform/beacon/electron-main/beaconContextMainService.ts src/vs/platform/beacon/node/beaconCoordinator.ts src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts src/vs/workbench/contrib/becoder/electron-browser/beCoderNotebook.contribution.ts extensions/becoder.notebook/src/model.ts extensions/becoder.notebook/src/editOwner.ts extensions/becoder.notebook/src/editApi.ts extensions/becoder.notebook/test/model.test.ts extensions/becoder.beacon/src/notebookTools.ts extensions/becoder.beacon/src/provider.ts extensions/becoder.beacon/test/context.test.ts
```

主代理单独复核创建/备份分工、所有写路径、学生文件保护、未保存工作副本、祖先更换、取消、原生失败和释放失败；真实租约与临时目录用于权限测试，Native port 与模拟 SSE 用于创建生命周期/SDK协议。不把注入 port 或字节往返当作 GUI/原生文件撤销/真实模型教学质量验收。系统/用户数据未清理，依赖未安装，应用/Setup未构建，HEAD未改动。
