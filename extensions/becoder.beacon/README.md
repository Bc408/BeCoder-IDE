# Beacon

BeCoder's built-in conversation companion. Open **Beacon: Open Beacon** from the command palette or the Beacon view in the secondary sidebar. Configure a DeepSeek API key with the gear button; an empty value removes it. The key is stored with BeCoder's SecretStorage and is never sent to the Webview.

The first version uses DeepSeek V4 Flash through Vercel AI SDK. It supports streaming multi-turn conversations, stopping, retrying interrupted/failed responses, copying answers, Markdown, code highlighting and math. No system prompt, workspace tools or automatic file context is sent. Messages typed into Beacon are sent to DeepSeek.

Conversations live in the current extension host's memory. Hiding the view keeps the conversation; reloading or closing the window clears it. New conversation clears the history after active work finishes. Failed or stopped assistant responses remain visible but are excluded from subsequent model context. A request has a three-minute timeout and an 8192-token output cap; incomplete output is marked retryable.

Build from the repository root with `npm run compile-oi-extensions`. Beacon's own commands are `npm run typecheck`, `npm run build`, and `npm test` in this directory. Tests use a synthetic DeepSeek SSE response and do not prove live account connectivity or Webview visual acceptance.

## 中文

在命令面板运行 **Beacon: 打开 Beacon**，或打开右侧 Beacon 视图。点击齿轮设置 DeepSeek API Key，留空可删除密钥。密钥通过 BeCoder SecretStorage 保存，不传入网页界面。

本版支持流式多轮对话、停止、重试、复制、代码高亮和公式。不添加 system prompt，不读取工作区文件。你输入的对话会发送给 DeepSeek。会话仅在当前窗口内存中保留，重载或关闭窗口后清空。
