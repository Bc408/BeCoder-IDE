# Beacon

BeCoder's built-in conversation companion. Use the persistent Beacon button in the editor's upper-right toolbar, or **Beacon: Toggle Beacon Sidebar** in the command palette, to open or close the single-conversation chat in the right sidebar. The Beacon activity icon on the left opens the API Key configuration panel. The Beacon extension's Features tab also provides a configuration button. An empty value removes the saved key. The key is stored with BeCoder's SecretStorage and is never sent to the Webview.

Supports DeepSeek, Alibaba Cloud Bailian, Moonshot and Ollama through Vercel AI SDK. Choose a provider in the left Beacon panel, save its key, fetch models and select a chat model. Local Ollama needs no key. Settings > Extensions > Beacon also provides provider, per-provider base URL and model settings; credentials remain exclusively in SecretStorage. The composer shows the selected model and each new answer records its actual provider and model. It supports streaming multi-turn conversations, stopping, retrying interrupted/failed responses, copying answers, Markdown, code highlighting and math. No system prompt, workspace tools or automatic file context is sent. Messages typed into Beacon are sent to the selected service.

Chats are saved locally in BeCoder's extension workspace storage. Each workspace has its own history; reopening the same workspace restores its active chat. New chat keeps previous conversations. Use Chat history to search titles, resume, rename or delete a chat (deletion requires confirmation). One response runs at a time; stop it before switching or changing chats. Interrupted responses restore as stopped and can be retried. Partial output is checkpointed every 500 ms; completed turns and normal shutdown flush pending changes. Storage failures remain visible with a retry action. Unreadable history is preserved and blocks new sends until the window can load it again. Failed or stopped assistant responses remain visible but are excluded from subsequent model context. A request has a three-minute timeout and an 8192-token output cap; incomplete output is marked retryable.

Build from the repository root with `npm run compile-oi-extensions`. Beacon's own commands are `npm run typecheck`, `npm run build`, and `npm test` in this directory. Tests use a synthetic provider SSE responses and do not prove live account connectivity or Webview visual acceptance.

## 中文

点击编辑器右上角常驻的 Beacon 按钮，或运行 **Beacon: 打开/关闭 Beacon 侧边栏**，切换右侧单会话聊天界面。左侧活动栏的 Beacon 图标打开 API Key 配置面板，Beacon 扩展详情的“功能”页也提供配置入口。配置时留空可删除密钥。密钥通过 BeCoder SecretStorage 保存，不传入网页界面。

本版支持流式多轮对话、停止、重试、复制、代码高亮和公式。不添加 system prompt，不读取工作区文件。支持深度求索、阿里云百炼、月之暗面和 Ollama。左侧面板选择服务商、保存密钥、获取模型并选择聊天模型；本机 Ollama 无需密钥。“设置 > 扩展 > Beacon”同步提供服务商、各服务商地址和模型设置，密钥仅保存在 SecretStorage。输入框显示当前模型，每条新回答记录实际使用的服务商和模型。你输入的对话会发送给所选服务。聊天记录保存在 BeCoder 的工作区扩展存储中，不同工作区相互隔离；重启后恢复当前聊天。新聊天保留旧会话，历史页支持按标题搜索、继续、重命名和确认后删除。生成中需先停止才能切换；重启时中断的回答显示为已停止，可重试。未发送的草稿只在当前界面中保留。保存失败会提示重试，读取失败保留原有数据。
