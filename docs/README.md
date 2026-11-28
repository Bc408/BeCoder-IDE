# BeCoder 文档

[项目首页](../README.md) · [English](../README.en.md)

## 使用 BeCoder

| 文档 | 内容 |
| --- | --- |
| [使用指南](getting-started.md) | 安装、题目导入、编译与运行、布局、数据和卸载 |
| [OJ Connect](../extensions/becoder.oj-connect/README.md) | 五站看题、编译器选择、主动提交、评测与同源码 CPH |
| [NoteBook](../extensions/becoder.notebook/README.md) | 笔记、源码关联、input 单元与执行 |
| [Beacon](../extensions/becoder.beacon/README.md) | 当前模型配置、对话、工作区／模式与上下文能力 |
| [Runner 编译配置](../extensions/danielpinto8zz6.c-cpp-compile-run/docs/COMPILER_SETUP.md) | 内置工具链、语言标准、参数和 gch |
| [CPH 题目解析覆盖](../extensions/becoder.cph/test/fixtures/OJ-SOURCES.md) | 样例导入站点、解析证据与限制；不代表交题范围 |
| [PDF 阅读器](../extensions/mathematic.vscode-pdf/README.md) | 阅读功能与只读边界 |

## 开发与维护

- [开发指南](development.md)：工程入口、检查和构建。
- [内置浏览器导航白闪（需求已撤回）](browser-navigation-flash-withdrawn-2026-11-28.md)：因内核维护成本撤回，保留调查结论与证据；问题未修复，不列为待办。
- [设置本地化修复](settings-localization-review-2026-11-27.md)：默认语言覆盖、118项随包配置标题与中英文切换的源码和组件验证边界。
- [工具栏与 Notebook 调整](toolbar-notebook-ui-review-2026-11-27.md)：原生分体运行按钮、OJ 纸飞机、Markdown 入口与账户默认可见性的验证。
- [Beacon 需求与架构入口](beacon/README.md)：完整能力、架构、九工具合同、三个业务队列与同步压缩；[实现状态](beacon/implementation-status.md)单列源码差距与验收边界。
- [OJ Connect 产品与开发入口](oj-connect/README.md)：已确认的快捷键刷题流程、目录规则、内置扩展方向和当前实现状态；[技术架构](oj-connect/architecture.md)说明职责与迁移验收。
- [OJ 接入技术可行性审查](oj-connect-feasibility.md)：候选路线、源码接点、证据范围和真实账号验证缺口；不代表已实现。
- [AtCoder MVP 过程与验收](oj-connect-basic-flow.md)：早期核心侧增量、失败修正与真实旅程证据，按各节时点阅读。
- [发行与安装维护](distribution.md)：安装模式、数据所有权与打包约束。
- [2.1.0 交付与验收](oj-connect/release-2.1.0-regression.md)：源码、stage、包与 Setup 检查已通过，负责人已确认本次 Setup 验收通过；正式 Release 尚未发布。[执行审查](oj-connect/release-2.1.0-review.md)、[性能复核](oj-connect/release-2.1.0-performance.md)及[原检查规划](superpowers/plans/2026-11-20-v2.1.0-release-readiness.md)保留各层证据。
- [产品方向](../VISION.md)：目的与模块职责。
- [仓库工作规则](../AGENTS.md)：开发授权、验证与交付边界。
- [许可与来源](../licenses/README.md)：主产品、内置组件与对应源码。
- [安全问题](../SECURITY.md)：报告方式。

已完成的临时实施计划不作为现行规则保留；历史变更可通过 Git 查询。上游模块文档、变更日志和许可证保留各自的归属，不作为 BeCoder 功能清单。
