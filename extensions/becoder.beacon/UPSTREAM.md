# Beacon component provenance

Beacon host, session, provider, application shell and styling are BeCoder code (MIT).

`webview/elements.tsx` adapts selected Conversation and MessageResponse components from Vercel AI Elements, retrieved 2026-09-23:

- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/conversation.tsx
- https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx
- Copyright 2023 Vercel, Inc.; Apache-2.0 (full notice in `licenses/ai-elements.txt`).

Modifications: replaced Tailwind/shadcn styling and buttons with the BeCoder Webview theme, localized scroll control, omitted downloads, message branches and Mermaid; retained StickToBottom and Streamdown composition. The composer is a BeCoder textarea with IME handling, not the upstream rich composer.

Pinned npm sources and integrity hashes are in `package-lock.json`. `build.mjs` bundles the extension and generates `dist/ThirdPartyNotices.txt` from licenses of all bundled dependency packages, with exact package versions and source tarball URLs. React, AI SDK, its DeepSeek and OpenAI-compatible providers, Streamdown, Shiki, KaTeX and their bundled transitive dependencies retain their own licenses.

No Codex or Trae proprietary code or assets are included.

Some npm packages omit their repository license file. The notice generator uses the Vercel AI repository Apache-2.0 license for `@ai-sdk/provider-utils`, and `licenses/remark-math.txt` for `remark-math` / `rehype-katex` (source: https://github.com/remarkjs/remark-math/blob/main/license, retrieved 2026-09-23).
