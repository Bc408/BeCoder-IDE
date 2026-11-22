# Beacon component provenance

Beacon host, session, provider, application shell and styling are BeCoder code (MIT).

Product hover descriptions use BeCoder's framework-independent module under
`../becoder.shared/browser` (MIT). Its compact typography and theme parameters
match Code - OSS 1.140 workbench hovers; the previous code-toolbar pseudo-element
tooltip is replaced. The full helper license is shipped in `dist/HoverLicense.txt`.

`src/requestRecovery.ts` independently implements structured provider-error classification
and category-specific retry delays with reference to Captain Who's `provider_error.rs`
and `transport.rs` at commit `1c66395882e17a8023315e2dd4ec9fd4d1c2688e`
(https://github.com/Tiga001/Captain_Who). No Captain Who
transport, stream rollback or provider cooldown service is imported.

`webview/elements.tsx` adapts selected Conversation and MessageResponse components from Vercel AI Elements, retrieved 2026-09-23:

- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/conversation.tsx
- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx
- Copyright 2023 Vercel, Inc.; Apache-2.0 (full notice in `licenses/ai-elements.txt`).

Modifications: replaced Tailwind/shadcn styling and buttons with the BeCoder Webview theme, localized scroll control, omitted downloads, message branches and Mermaid; retained StickToBottom and replaced Streamdown's renderer composition with the shared unified/remark/rehype content pipeline. The composer is a BeCoder textarea with IME handling, not the upstream rich composer.

Pinned npm sources and integrity hashes are in `package-lock.json`. `build.mjs` bundles the extension and generates `dist/ThirdPartyNotices.txt` from licenses of all bundled dependency packages, with exact package versions and source tarball URLs. React, AI SDK, its DeepSeek and OpenAI-compatible providers, unified/remark/rehype, KaTeX and their bundled transitive dependencies retain their own licenses.

No Codex or Trae proprietary code or assets are included.

`webview/ImagePreview.tsx` and the clipboard paste route independently implement
the image overlay and explicit-input behavior observed in Captain Who's
`ImagePreview.tsx` and `ChatComposer.tsx` at commit
`1c66395882e17a8023315e2dd4ec9fd4d1c2688e` (https://github.com/Tiga001/Captain_Who).
No Captain Who storage, Electron service or dependency is imported.

Chat activity behavior and streaming code snapshots reference Captain Who at commit
`4fabf0b2a24ed1a92cafa9988a49d8abae507332` (https://github.com/Tiga001/Captain_Who).
The text shimmer and typing indicator CSS in `webview/beacon.css` adapt
`ChatConversationPage.agent.css` and `ConversationScrollToBottomButton.css` under Apache-2.0.
The original license is in `licenses/captain-who.txt`; modifications map colors to VS Code
theme tokens and keep Beacon's control placement. `ResponseActivity.tsx` adapts the referenced
activity presentation. The shared parser retains Luogu renderer MIT provenance in
LICENSE.luogu-markdown.txt. `CodeBlock.tsx` adapts Captain Who's
code-card layout, wrapping/copy controls and stable streaming-highlight behavior while using
BeCoder's shared incremental TextMate Worker. No Electron/Rust services are imported.

Beacon uses its own entry into the shared content pipeline, retaining its sanitization,
streaming math and code presentation rules. Current behavior is documented in [README.md](README.md);
the [Beacon design entry](../../docs/beacon/README.md) separates requirements from implementation gaps.

Some npm packages omit their repository license file. The notice generator uses the Vercel AI repository Apache-2.0 license for `@ai-sdk/provider-utils`, and `licenses/remark-math.txt` for `remark-math` (source: https://github.com/remarkjs/remark-math/blob/main/license, retrieved 2026-09-23).

Bundled syntax resources come from the pinned root `vscode-textmate`, `vscode-oniguruma` and its WASM, repository language grammars (including Better C++ Syntax, MagicPython and embedded/injection grammars), and the directly pinned `@shikijs/langs` grammar assets. Shiki rendering engines and themes are not dependencies. Built-in grammar upstream notices, additional LaTeX licenses, @shikijs/langs and Better C++ Syntax/One Monokai licenses ship in ThirdPartyNotices.

## DeepSeek provider mark

resources/deepseek.svg comes from LobeHub lobe-icons, MIT, Copyright (c) 2023 LobeHub. Source: https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/deepseek-color.svg (retrieved 2026-10-20). Full license is licenses/lobe-icons.txt and is included in bundled notices. The logo identifies the service and does not imply affiliation.

## Additional provider marks

`resources/bailian-color.svg`, `resources/moonshot.svg` and `resources/ollama.svg` are unmodified LobeHub lobe-icons assets from commit `453719ea68e6d480d0109a598c5a4cf80cda6a84` (retrieved 2026-10-23). Source directory: https://github.com/lobehub/lobe-icons/tree/453719ea68e6d480d0109a598c5a4cf80cda6a84/packages/static-svg/icons . The MIT license is retained in `licenses/lobe-icons.txt` and bundled by `build.mjs`. These marks identify Alibaba Cloud Bailian, Moonshot and Ollama; they do not imply affiliation or trademark ownership. Monochrome marks receive a white CSS backing for visibility in both themes; SVG geometry is unchanged.
