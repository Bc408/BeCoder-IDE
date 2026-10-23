# BeCoder Runner

BeCoder 内置的 C/C++ 编译运行扩展，支持 `.c`、`.cc`、`.cpp`、`.cxx` 文件。

## 使用

| 操作 | 快捷键 | 行为 |
| --- | --- | --- |
| Run（运行） | F6 | 保存当前源码，用内置 GCC 编译，在源码目录运行；支持终端交互输入及 `getch()` |
| Run With Input（使用输入运行） | Shift+F6 | 使用源码同目录、名称严格为 `input` 的普通文件作为标准输入 |

Run With Input 在编译前捕获 `input`，经独立管道输入原始字节，不回显，读完关闭 stdin。两种运行均通过随包原生 helper 初始化 UTF-8 控制台，并用 ConPTY 显示 stdout/stderr；helper 在打包时编译，不在首次启动时编译。运行中可按 Ctrl+C 取消。新的运行请求在忙时立即拒绝，不排队或重放。

程序的 `.exe` 发布到源码旁，正常完成后清理，取消时保留。可执行文件和临时构建目录分别清理；失败会指出保留的产物，详细阶段和可用的文件系统错误码见“BeCoder Runner Trace”输出。最终 `Executable Program Removed` 与 Runner 释放在同一步完成，发生在适用的证据及活动清理之后。

## BC 面板与编译设置

BC 是 Runner 的专用伪终端，只接受：

```text
run <source>
run <source> -WithInput
clear
help
```

系统命令请使用独立的原生 PowerShell。Runner 的编译器选择、子进程环境、历史及取消机制由扩展维护，不修改系统 PATH 或 PowerShell 配置。CPH 和 Notebook 复用其编译 API；语言标准、参数及可选 gch 缓存见[编译配置](docs/COMPILER_SETUP.md)。

本扩展派生自 Daniel Pinto 的 C/C++ Compile Run，按 GPL-3.0 分发，见 [LICENSE](LICENSE)。安全问题见[项目安全政策](../../SECURITY.md)。
