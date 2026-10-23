# BeCoder 文档

[项目首页](../README.md) · [English](../README.en.md)

## 使用 BeCoder

| 文档 | 内容 |
| --- | --- |
| [使用指南](getting-started.md) | 安装、题目导入、编译与运行、布局、数据和卸载 |
| [Beacon](../extensions/becoder.beacon/README.md) | 服务商、模型、对话、文件档位与联网 |
| [NoteBook](../extensions/becoder.notebook/README.md) | 笔记、源码关联、input 单元与执行 |
| [Runner 编译配置](../extensions/danielpinto8zz6.c-cpp-compile-run/docs/COMPILER_SETUP.md) | 内置工具链、语言标准、参数和 gch |
| [题目解析覆盖](../extensions/becoder.cph/test/fixtures/OJ-SOURCES.md) | 支持站点、样例证据与解析限制 |
| [PDF 阅读器](../extensions/mathematic.vscode-pdf/README.md) | 阅读功能与只读边界 |

## 开发与维护

- [开发指南](development.md)：工程入口、检查和构建。
- [发行与安装维护](distribution.md)：安装模式、数据所有权与打包约束。
- [产品方向](../VISION.md)：目的与模块职责。
- [仓库工作规则](../AGENTS.md)：开发授权、验证与交付边界。
- [许可与来源](../licenses/README.md)：主产品、内置组件与对应源码。
- [安全问题](../SECURITY.md)：报告方式。

## Beacon 与 NoteBook 正式需求

[正式文档入口](beacon/README.md)维护已确认的产品要求；[实现状态](beacon/implementation-status.md)维护当前覆盖范围和剩余工作。功能说明写已实现行为，正式设计保留尚未完成的需求，技术研究只说明候选路径与证据时点。

已完成的临时实施计划不作为现行规则保留；历史变更可通过 Git 查询。上游模块文档、变更日志和许可证保留各自的归属，不作为 BeCoder 功能清单。
