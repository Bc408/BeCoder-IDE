# Beacon 工作区控件与草稿实现计划

> 执行方式：按 executing-plans 在当前获授权的工作树实施，独立文件所有权可并行，不自动 commit。

目标：实现已确认的相邻展开控件、对话草稿持久化、导航区分与最后关窗恢复。

设计依据：[完整方案](../../beacon/workspace-ui-draft-design.md)。2026-10-15 最新修订：允许自动淘汰不再被占用/引用的未发送主页草稿；保留最后恢复目标和活窗口的引用，不淘汰正式聊天内的草稿。

架构：复用 BeaconStore、对话 revision 和原生租约；草稿为对话字段，draftOnly 标识首次发送前阶段；工作区恢复引用由宿主维护，窗口关闭与扩展重载区分。React 使用宿主草稿快照，输入带目标 viewKey，防止迟到消息串对话。

约束：Blackout 不落盘，不复制临时内容进工作区；不加旧快照兼容，不引入依赖，不改学生源码/运行能力。保留前轮未提交修改。

## 任务 1：原生保存与恢复

- [x] 在 platform/beacon 及原生测试中验证草稿不进历史、单对话占用、最后关窗显式空白、占用保护与自动淘汰。
- [x] 扩展 IBeaconConversation 为可选 draft/text+attachments、draftOnly；用 getResume/setView 传递页面/主页引用。
- [x] 在 BeaconStore 既有安全文件入口保存引用，协调者保护活窗口引用并处理关闭排序；实际窗口生命周期接线区别 reload。
- [x] 运行拥有模块的类型检查/原生测试，失败修正后再接扩展。

## 任务 2：扩展对话与草稿

- [x] history.ts 增加草稿校验、读取与更新，metadata 合并保留未发送 active 对话；首次发送转正。
- [x] extension.ts 以宿主为草稿权威，首次输入/材料建实体，输入串行保存，导航前 flush；返回与清空分开，保存 homeId。
- [x] context.ts 接 getResume/setView；自动恢复占用静默回主页；根间/Blackout 分离草稿。
- [x] attachments.test.ts/vscodeMock.ts 接新接口并回归文字+附件恢复、发送与迟到输入、已有功能。

## 任务 3：呈现与动画

- [x] Workspace.tsx + workspace.css 实现 hover 向左、click 向下、顶部当前项与去重历史、Blackout/故障、完整路径提示、取消行移动与键盘退出。
- [x] App.tsx 相邻工作区/设置；输入同步宿主草稿，按钮状态随主页草稿，返回与清空消息分离；Settings.tsx 移除第二入口。
- [x] 三个浮层互斥；收敛旧工作区样式，不增加尾部覆盖层。
- [x] build/test-render 后查看深浅/窄栏/各状态截图，发现视觉或断言问题后修正并复验。

## 任务 4：最终检查与构建

- [x] Beacon build/test/typecheck/lint/test-render，native 相关测试、客户端 typecheck，文档检查及 diff。
- [x] 主agent另作只读审阅，检查权限/失败/占用/生命周期与现有功能回归。
- [x] OI 扩展编译、staged Windows 应用构建；本轮授权的效果检查在隔离环境完成，不调用真实账号或付费模型。
- [x] 记录每步真实命令/结果与未完成验收，不以构建成功代替 GUI/双窗口验收。

## 实施结果与验收边界

2026-10-15 已完成源码实施和本轮验证。扩展 142 项、原生 38 项测试通过；扩展与客户端类型检查、零警告 lint、分层、CSS、文档结构及 diff 检查通过；OI 扩展编译、最终 Windows staged build（90.05 秒）及绝对路径直接包校验（IncludeCompiler=true）通过。

已实际查看生产 Webview 深浅/窄栏截图，并在独立 Windows 桌面、独立 portable 数据的实际构建中验证：选根自动 Spot、隐藏草稿保存、取消根移入最近项、Blackout 隔离恢复、正常重启草稿/显式空白、关闭前保存，以及双窗口占用静默空白、独立输入、最后关闭恢复和旧主页草稿淘汰。未使用真实模型、账号或学生程序。反向关闭/崩溃/断电等完整矩阵及负责人视觉验收尚未完成，不将单元测试当作这些 GUI 验收。

构建曾因负责人运行输出目录失败 EBUSY，关闭后重新构建通过；包校验曾因相对路径触发枚举比较失败，改用解析后的绝对路径校验通过，未修改校验器或工具链。测试实例现已正常关闭；未作 Git 写入，未构建 Setup。
