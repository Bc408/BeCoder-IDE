# Stage 4.3 Runner and Visual Closeout Archive

Status: **Archived and project-owner accepted on 2026-08-08.**

- Replaced the shell/script Runner path with a BeCoder-owned pseudoterminal and direct child processes.
- Established the closed BC command grammar, one active request, no queue, process-local history, exact `input`, and Runner-only cancellation.
- Added PowerShell-like prompt colors, uppercase drive display, OSC 633 command decorations, framed lifecycle messages, Runtime Error presentation, and accepted Ctrl+C behavior.
- Preserved immediate TextMate coloring and added one bounded standard clangd semantic refinement under One Monokai.
- Corrected GCC diagnostics namespace isolation for the bundled debugger header.
- Pinned an exact ordinary `input` item above Explorer siblings and removed hot-path terminal/result polling.
- Backup branch: `origin/stage4.3`.

Current executable publication and cleanup behavior is owned by `docs/contracts/runner.md`. Detailed Stage 4.3 evidence remains in `stage4-development-record.md`.
