# BeCoder PDF 阅读器

受保护的内置扩展，使用 Mozilla PDF.js 只读打开本地 PDF 题面。支持翻页、缩放、搜索、文本选择、旋转、缩略图、目录及同目录 PDF 链接。保留已有注释的显示，关闭注释编辑、打印、下载、附件和图层面板、内嵌 PDF 脚本及外部自动提示。

设置 `pdf.defaultZoomValue` 控制初始缩放，`pdf.sidebarViewOnLoad` 控制初始侧栏（关闭、缩略图或目录）。工具栏悬停说明复用 BeCoder 主题提示层。

## Beacon 材料

选中文字后可通过“询问 Beacon”加入可查看、可移除的草稿，由用户发送。捕获的是已加载文本层的选区，不重读磁盘，不包含整页图片，不执行 OCR。

Beacon 还可列出本窗口已打开的 PDF，在文档加载后按从 1 开始的物理页码请求文字；复用阅读器现有 Worker，不重新打开背后的文件。隐藏但未关闭的标签保留阅读器状态，关闭或重载使旧请求失效。页面读取仍遵循 [Beacon 页面与文件权限边界](../../docs/beacon/architecture.md)。

文字提取没有 OCR 或图片理解，复杂排版、公式与扫描页可能缺失。以上描述当前源码能力；菜单、焦点及新应用端到端验证边界见[实现状态](../../docs/beacon/implementation-status.md)，不据此宣称完整 GUI 验收。

## 开发与来源

在仓库根目录运行 `npm run compile-oi-extensions` 构建扩展及悬停资源；其余验证见[开发指南](../../docs/development.md)。

派生自 [Mathematic PDF Viewer 0.2.5](https://github.com/mathematic-inc/vscode-pdf/tree/768efbaf615b39813d08df68217994f9b5495f0e)，按 Apache-2.0 分发。修改及组件来源见[组件清单](../../resources/oi-defaults/BUNDLED-COMPONENTS.json)和[第三方声明](../../ThirdPartyNotices.txt)。
