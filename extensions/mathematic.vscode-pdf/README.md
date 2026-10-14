# BeCoder PDF Viewer

This protected built-in extension opens local PDF problem statements in a read-only editor powered by Mozilla PDF.js.

Beacon can now list these open documents and request text from a specified physical page using the existing context tool, after PDF.js finishes loading the document. It uses the viewer's existing worker rather than reopening the backing file. Reload and closure invalidate requests; open hidden tabs retain their viewer state. Text extraction has no OCR or image understanding and may lose complex layout or formula structure. This is source implementation, pending new-application GUI acceptance.

Beacon 现可列出本窗口已打开 PDF，并在 PDF.js 完成文档加载后，通过既有上下文工具按物理页码读取文字。复用阅读器 Worker，不沿路径重新读文件；关闭/重载使旧请求失效，隐藏但已打开标签保留阅读器状态。没有 OCR 或图片理解，复杂排版与公式结构可能缺失。本段说明源码实现，仍待新应用 GUI 验收。

It retains page navigation, zoom, search, text selection, rotation, thumbnails, outlines, and links to other PDF files in the same directory. Printing, downloading, annotations, attachments, layers, embedded PDF scripting, and automatic external prompts are disabled.

Current source adds an explicit Ask Beacon context-menu entry for selected PDF text. The PDF owner freezes text-layer selection, checks the loaded panel version and returns it to a removable Beacon draft; the user sends it. Capture does not reread the PDF file, perform OCR or include whole pages/images. Closed or reloading panels invalidate late results. Native menu/focus behavior still requires application acceptance.

Toolbar descriptions use the same compact, theme-aware hover layer as Beacon and CPH. Document annotations retain PDF.js behavior. Build the local hover assets with `npm run compile-oi-extensions` from the BeCoder repository root.

The extension is derived from [Mathematic PDF Viewer 0.2.5](https://github.com/mathematic-inc/vscode-pdf/tree/768efbaf615b39813d08df68217994f9b5495f0e). BeCoder modifications are described in the bundled component inventory and third-party notices.
