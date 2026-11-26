# Beacon 用户行为上下文就绪与可见 Notebook 实施计划

> **For agentic workers:** Use superpowers:executing-plans with bounded parallel implementation slices. Track completed steps and validation evidence in this plan and its own ignored workspace.

**Goal:** 应采集事实可读之前禁用 Beacon 新请求，补齐保存失败通知，并让可见 Notebook 与 C/C++ 代码平权、按文档身份去重。

**Architecture:** 执行 owner 提供真实事实，Coordinator 管理与根绑定的采集生命周期，Store 原子发布；发送入口消费独立 collectionPending。已加载 Notebook owner 提供内容投影，现场文档在读取前按真实身份合并；LLM 继续自主选材。

**Tech Stack:** TypeScript、Code - OSS services/IPC、VS Code bundled extensions、React、Node test/Mocha、Gulp Windows stage。

**Spec:** [已审阅设计](../specs/2026-11-26-beacon-context-availability-and-visible-notebook-design.md)。负责人于2026-11-26授权本计划编写并接着实施；本轮不需再次等待计划确认。

## Global Constraints

- 基于 Beacon_Next@950befec 加当前维护工作树，保留已有92项未提交内容；在当前 checkout 实施，不重置、不自动提交或推送。
- 工作区决定采集资格，模式决定持久消费；有效根 Blackout 继续采集并参与保存门禁；无根／根外不制造失败。
- 保存提示严格为“正在保存用户行为上下文”／“Saving user activity context”；保存不拖延执行退役或后续运行，无操作队列、重放或自动发送。
- problem13／run30／verdict20及既有容量／去重规则不变；collectionPending 不进入模型、持久记录或 scope epoch。
- readCurrentCode 参数仍为 {}；files 区分 kind:code/notebook；Notebook 全部内容 cell 从1编号，每个C/C++ cell独立codeHash，排除执行字段。
- 同文档多视图合并，不合并不同文件同内容、不同未命名文档、同笔记相同代码cell；不全局删除协议正文。
- 英文工具与产品事实同步；不增加工具、快照库、源码写入、执行权或强制取材顺序。
- 交付最终 stage；不启动产品、不进行线上提交或新的模型访谈，不构建 Setup。

## Review Focus

1. 运行退役到发布完成无发送空窗；adapt/validate/write各失败均释放门禁且仅通知一次。
2. 同根窗口共享 pending、无关根不互锁；切根／关闭／晚到结果不改投且无永久禁用。
3. 所有发送入口和异步草稿保存后的实际受理均复核，不覆盖新草稿、不自动补发。
4. 可见根外及untitled Notebook无需磁盘授权，后台／未知owner／执行结果不能借新入口被读取。
5. 同文档分屏关闭一份后仍可读，元数据与正文去重一致；跨轮合法读取和历史工具配对完整保留。

## Task 1: 原生采集生命周期和发布可见性（主代理）

Files: src/vs/platform/beacon/node/beaconCoordinator.ts、common/beaconContextTypes.ts、beaconContext.ts、electron-main service、workbench command bridge；对应原生 tests。

Interfaces: IBeaconContext.collectionPending:boolean；必要的采集生命周期登记由原生拥有者管理，scope沿既有IBeaconCollectionScope；成功只认Store发布结果。

- [x] 审查三队列及四业务入口，记录正常动作的开始、完成、拒收及通知所有者。
- [x] 用显式barrier写失败回归：运行已退役但发布未完成、适配／校验／发布失败、同根窗口、无关根、切根／关闭。
- [x] 实现与根身份绑定的pending生命周期；登记覆盖适配，发布任务独立于执行清理；保既有scope校验及错误语义。
- [x] 运行最小原生回归；失败分类及精确命令记录本计划台账。

## Task 2: 业务接线、失败通知和发送门禁（主代理）

Files: Runner beaconEvidence/compile-run-manager、CPH execution/judgeView、Notebook extension、OJ Connect extension/capture；Beacon context.ts、extension.ts、webview App及本地化、对应tests。

Consumes: Task1 collectionPending及生命周期接点。Produces: 用户可见禁用和通知；业务结果与执行退役保持独立。

- [x] 先写延迟发布／失败保草稿／重答继续编辑等请求入口回归，再实施。
- [x] 将应采集动作衔接至登记与结束；无采集资格不弹错误，业务失败照常形成记录；32KB、适配／I/O失败明示，已发布确认不明不误称未写入。
- [x] 所有UI入口与实际send前refresh复核pending；显示精确文案，不改responseBusy/Pause语义。
- [x] 验证运行清理、立即再运行、停止、无根、Blackout和失败后下一次采集。

## Task 3: 可见 Notebook 和文档身份去重（独立实施切片）

Files: src/typings/becoder-beacon.d.ts、platform/common/beaconPages.ts、workbench beaconPages.ts及必要Notebook内容owner；extensions/becoder.beacon/src/contextTools.ts、必要Notebook内容投影与对应tests。此切片不编辑Task1/2的采集与发送代码。

Interfaces: files为code/notebook联合；code含code/codeHash，notebook含编号cells；共享Notebook内容投影与inspectFile语义一致；loaded owner直接取现场，无磁盘fallback。

- [x] 先写dirty/untitled/根外/后台、全本cells及无outputs、hash、同文档分屏和不同同文稿回归并观察失败。
- [x] 实现已加载BeCoder Notebook内容读取与版本一致性；不按扩展名冒充owner，不开放readPage旁路。
- [x] 源头合并文档身份，汇总visible/active，目录与正文一致；普通跨轮调用保持新观察。
- [x] 运行拥有者测试和类型检查，报告改动路径及真实失败/通过。

## Task 4: 运行摘要与产品事实（独立实施切片）

Files: extensions/becoder.beacon/src/recordProjection.ts、contextToolContract.ts集中工具描述、resources/product-info、对应toolInformation/productInfo tests。集中合同仅修改本轮两条工具用途说明，普通／压缩装配共用，不编辑Task3的contextTools。

- [x] 先写编译失败输入未执行、CPH有／无check、Runner/Notebook不判题摘要回归。
- [x] 用实际runs.status/check确定已执行与未执行数量；产品事实和两条工具说明按设计最小更新，不教模型固定工作流。
- [x] 运行聚焦摘要／产品知识回归与Beacon拥有者类型检查。

## Task 5: 集成审查、文档和最终验证（主代理）

- [x] 主代理审查各切片并验证接口；另派只读review，优先检查五项Review Focus，修复具体问题并重跑受影响检查。
- [x] 更新现行PRD／合同／架构／底层／实现状态／使用说明和英文prompt中文对照；保留原访谈证据。
- [x] 预检并冻结精确命令，写本计划独立workspace的validation ledger；测试入口必须来自现有package/scripts。
- [x] 最终运行拥有者类型／生产bundle和聚焦测试、client typecheck（120秒）、OI compile（120秒）、相关lint／layers／docs／diff；任何失败分类记录并修复重跑。
- [x] 所有必需检查通过后运行 npm run gulp vscode-win32-x64-min（外部300秒），成功后交付绝对路径及真实验证边界，不启动应用。

## 证据与恢复

本计划台账位于 .superpowers/sdd/2026-11-26-beacon-context-availability-and-visible-notebook/。任务完成行、命令、退出码、失败分类、工程裁决随工作写入。已有未提交工作不属于本轮新增；不以历史测试或stage替代新验证。文档／源码／构建／真实运行分别成立。
