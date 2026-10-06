# Beacon component provenance

Beacon host, session, provider, application shell and styling are BeCoder code (MIT).

Product hover descriptions use BeCoder's framework-independent module under
`../becoder.shared/browser` (MIT). Its compact typography and theme parameters
match Code - OSS 1.140 workbench hovers; the previous code-toolbar pseudo-element
tooltip is replaced. The full helper license is shipped in `dist/HoverLicense.txt`.

`src/requestRecovery.ts` independently implements structured provider-error classification
and category-specific retry delays with reference to Captain Who's `provider_error.rs`
and `transport.rs` at commit `1c66395882e17a8023315e2dd4ec9fd4d1c2688e`
(https://github.com/Tiga001/Captain_Who). Beacon retains its response-wide retry/wait
budgets, cancellation, SDK transport and output/tool commit boundary. No Captain Who
transport, stream rollback or provider cooldown service is imported.

`webview/elements.tsx` adapts selected Conversation and MessageResponse components from Vercel AI Elements, retrieved 2026-09-23:

- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/conversation.tsx
- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx
- Copyright 2023 Vercel, Inc.; Apache-2.0 (full notice in `licenses/ai-elements.txt`).

Modifications: replaced Tailwind/shadcn styling and buttons with the BeCoder Webview theme, localized scroll control, omitted downloads, message branches and Mermaid; retained StickToBottom and replaced Streamdown's renderer composition with the Captain Who-style React Markdown plugin pipeline. The composer is a BeCoder textarea with IME handling, not the upstream rich composer.

Pinned npm sources and integrity hashes are in `package-lock.json`. `build.mjs` bundles the extension and generates `dist/ThirdPartyNotices.txt` from licenses of all bundled dependency packages, with exact package versions and source tarball URLs. React, AI SDK, its DeepSeek and OpenAI-compatible providers, React Markdown, Shiki, KaTeX and their bundled transitive dependencies retain their own licenses.

No Codex or Trae proprietary code or assets are included.

`webview/ImagePreview.tsx` and the clipboard paste route independently implement
the image overlay and explicit-input behavior observed in Captain Who's
`ImagePreview.tsx` and `ChatComposer.tsx` at commit
`1c66395882e17a8023315e2dd4ec9fd4d1c2688e` (https://github.com/Tiga001/Captain_Who).
Beacon uses its existing captured attachments, native dialog focus handling and
BeCoder editor routing; no Captain Who storage, Electron service or dependency is imported.

Chat activity behavior and streaming code snapshots reference Captain Who at commit
`4fabf0b2a24ed1a92cafa9988a49d8abae507332` (https://github.com/Tiga001/Captain_Who).
The text shimmer and typing indicator CSS in `webview/beacon.css` adapt
`ChatConversationPage.agent.css` and `ConversationScrollToBottomButton.css` under Apache-2.0.
The original license is in `licenses/captain-who.txt`; modifications map colors to VS Code
theme tokens and keep Beacon's control placement. `ResponseActivity.tsx` implements the observed
activity lifecycle. `elements.tsx` uses `react-markdown`, `remark-gfm`, `remark-math`,
`remark-breaks` and KaTeX for the rendering pipeline. Formula slots retain their last valid
KaTeX result while an appended command or group is incomplete; invalid final expressions
remain ordinary readable text. `CodeBlock.tsx` adapts Captain Who's
code-card layout, wrapping/copy controls and stable streaming-highlight behavior while using
Beacon's shared incremental TextMate Worker. No Electron/Rust services are imported.

Some npm packages omit their repository license file. The notice generator uses the Vercel AI repository Apache-2.0 license for `@ai-sdk/provider-utils`, and `licenses/remark-math.txt` for `remark-math` / `rehype-katex` (source: https://github.com/remarkjs/remark-math/blob/main/license, retrieved 2026-09-23).

All code languages share the incremental renderer using pinned root `vscode-textmate`, `vscode-oniguruma` and its WASM, with the default token rules under `extensions/becoder.one-monokai`. Build-time language discovery prefers the repository's bundled grammar contributions (including Better C++ Syntax, MagicPython and embedded/injection grammars); other previously supported languages use pinned `@shikijs/langs` assets. The old Shiki rendering engine, timers and whole-block highlight cache are removed from the Webview. Built-in grammar upstream notices, additional LaTeX licenses, @shikijs/langs and Better C++ Syntax/One Monokai licenses ship in ThirdPartyNotices. No semantic or user-theme customization is applied.
