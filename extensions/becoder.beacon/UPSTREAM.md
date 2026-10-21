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

Pinned npm sources and integrity hashes are in `package-lock.json`. `build.mjs` bundles the extension and generates `dist/ThirdPartyNotices.txt` from licenses of all bundled dependency packages, with exact package versions and source tarball URLs. React, AI SDK, its DeepSeek and OpenAI-compatible providers, React Markdown, KaTeX and their bundled transitive dependencies retain their own licenses.

No Codex or Trae proprietary code or assets are included.

The 2026-10-14 evidence and feedback review used these fixed references:

- OpenCode `81d57087a44c0ef2fe909e10b6bcfd8c1ddcfdef`, MIT, [core tool architecture](https://github.com/anomalyco/opencode/blob/81d57087a44c0ef2fe909e10b6bcfd8c1ddcfdef/packages/core/src/tool/AGENTS.md): catalog visibility and execution authority have different responsibilities. Beacon retains its existing host boundaries; personal-information network permission is prompt guidance by the project owner's decision.
- Graphify `fe085cedddde3a18554f8749b230bfe47f3dcce7`, Apache-2.0 with retained MIT components, [provenance and confidence explanation](https://github.com/Graphify-Labs/graphify/blob/fe085cedddde3a18554f8749b230bfe47f3dcce7/docs/how-it-works.md): identify source versions and hashes, distinguish captured facts from model inference. Beacon does not import its graph or confidence-score system.
- ECC `b92f181b3b748d1abbc2afd94af6aa7d8c8fca29`, MIT, [local observation hooks](https://github.com/affaan-m/ECC/blob/b92f181b3b748d1abbc2afd94af6aa7d8c8fca29/hooks/memory-persistence/README.md): use actual tool outcomes as feedback. Beacon uses its existing SDK protocol, producer events and activity UI.

These are design references. No code, dependencies or assets from these three projects are bundled by this change.

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

Some npm packages omit their repository license file. The notice generator uses the Vercel AI repository Apache-2.0 license for `@ai-sdk/provider-utils`, and `licenses/remark-math.txt` for `remark-math` (source: https://github.com/remarkjs/remark-math/blob/main/license, retrieved 2026-09-23).

All code languages share the incremental renderer using pinned root `vscode-textmate`, `vscode-oniguruma` and its WASM, with the default token rules under `extensions/becoder.one-monokai`. Build-time language discovery prefers the repository's bundled grammar contributions (including Better C++ Syntax, MagicPython and embedded/injection grammars); additional fence languages use the directly pinned `@shikijs/langs` grammar assets. Shiki rendering engines and themes are not dependencies of Beacon. Built-in grammar upstream notices, additional LaTeX licenses, @shikijs/langs and Better C++ Syntax/One Monokai licenses ship in ThirdPartyNotices. No semantic or user-theme customization is applied.

## DeepSeek provider mark

resources/deepseek.svg comes from LobeHub lobe-icons, MIT, Copyright (c) 2023 LobeHub. Source: https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/deepseek-color.svg (retrieved 2026-10-20). Full license is licenses/lobe-icons.txt and is included in bundled notices. The logo identifies the service and does not imply affiliation.
