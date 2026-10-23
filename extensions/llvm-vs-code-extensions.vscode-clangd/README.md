# BeCoder C/C++ 智能服务

连接 BeCoder 私有随包 clangd 的内置扩展，随产品维护，不通过扩展市场单独配置或更新。

提供补全、签名帮助、悬停、定义、引用、重命名、文档/选区格式化，以及可主动开启的标准内联提示。内联提示设置为 `becoder.inlayHints.enabled`，位于 BeCoder IDE 功能，默认关闭。

BeCoder 直接通过 LSP 提供 C17/C++20 编译命令，不读取工作区 `.clangd` 或 `compile_commands.json`，不开放另选 clangd 路径或工作区启动参数。补全不自动添加 include。可见 C/C++ 诊断由独立的 GCC 诊断扩展负责；TextMate 即时着色后叠加标准语义着色。本扩展不提供 clang-tidy 操作、后台工作区索引或代码操作。

格式化复用 clangd 的 ClangFormat，以 Google 为默认样式。只有打开工作区内、真实路径不越界且不使用 `InheritParentConfig` 的 `.clang-format` 可覆盖默认值；`_clang-format` 不作为覆盖入口。扩展不创建或改写格式配置。

维护命令和测试宿主限制见[开发说明](DEVELOPING.md)，来源及许可记录保持在本扩展与项目组件清单中。
