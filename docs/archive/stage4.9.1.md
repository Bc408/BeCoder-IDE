# Stage 4.9.1 Seti File Icons Archive

Status: **Project-owner accepted and archived with a local Git backup on `codex/stage4.9.1` on 2026-08-11.**

## Accepted Scope

- Restored the complete unmodified Code OSS 1.130 `extensions/theme-seti` source.
- Bundled `vscode.vscode-theme-seti` as an ordinary built-in extension by removing only `theme-seti` from the OI distribution exclusion list.
- Selected `vs-seti` through the existing BeCoder configuration defaults while preserving an explicit user-selected file-icon theme.
- Retained the pinned Simplified-Chinese pack's existing Seti translation registration.
- Recorded the upstream MIT license, `seti-ui` third-party notice, and source-side `cgmanifest.json` provenance.
- Kept every other removed theme and all rejected Stage 4.8 behavior unchanged.

## Build Evidence

The focused staged Windows build completed successfully on 2026-08-11:

1. `npm run typecheck-client`: exit code 0 in 5.8 seconds;
2. `npm run compile-oi-extensions`: exit code 0 in 9.1 seconds;
3. `npm run gulp vscode-win32-x64-min`: exit code 0 in 84.6 seconds.

The staged application was written to `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`.

Under the approved fast visual delivery mode, this atomic task added and ran no tests. Direct package verification, Setup construction, Setup verification, and agent-run GUI acceptance were not performed. The project owner explicitly accepted the Stage 4.9.1 result for archive on 2026-08-11.

## Remaining Boundary

- Stage 4.9.1 does not restore any other Code OSS theme or any rejected Stage 4.8 feature.
- Later Stage 4.9.x work uses the local Code OSS 1.130 tree as its read-only migration reference and requires a separately authorized atomic scope.
- This checkpoint is backed up locally only. It was not pushed, merged, published, tagged, or released.
