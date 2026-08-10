# Stage 4.7 Self-Contained Windows Distribution Archive

Status: **Project-owner accepted on 2026-08-10; archival commit and remote backup pending.**

## Accepted Scope

- Replaced the old Portable ZIP and first-launch extraction model with one Setup-only Windows artifact containing the application, expanded GCC, expanded clangd, built-ins, licenses, and private `data`.
- Added allowlisted GCC and clangd staging with package manifests, provenance, required headers, PCH, diagnostics support, and direct package verification.
- Added schema-2 directory-local installation identity, installation-local IPC and taskbar identity, complete same-directory replacement, multi-install isolation, and movable-directory behavior.
- Enforced canonical ASCII installation roots no longer than 70 characters and rejected linked, reparse, foreign, and invalidly marked targets in interactive and silent installation.
- Preserved the zero-system-integration contract: no shortcuts, registry writes, uninstaller, associations, PATH changes, protocols, services, tasks, startup entries, system VS Code access, or project mutation.
- Removed first-run extraction, readiness markers, repair, retry, redetection, and obsolete platform resource scripts.
- Closed Runner publication, cleanup, cancellation, immediate-rerun, and terminal-observability races with deterministic tests.
- Synchronized startup language selection after protected extension registration and finalized Explorer ownership for dot-prefixed files and generated executables.
- Corrected product workflows, repository metadata, public support links, bundled-component records, licenses, and third-party notices.
- Introduced the Stage 4.8 export/import transaction and startup-recovery foundation without treating its settings UX or runtime delivery as accepted Stage 4.7 behavior.
- Reorganized project knowledge into stable philosophy, live state, current contracts, historical archives, project-owner guidance, and the repository-local `develop-becoder` Skill.

## Source And Review Evidence

The final accepted worktree passed:

- Setup extension tests: 33/33;
- Runner tests: 54/54;
- build-script tests: 225/225 after the final Setup-verifier regression;
- final Stage 4.5/4.6/4.7 boundary suite: 19/19;
- focused Setup shortcut-snapshot regression: 1/1;
- client and build TypeScript checks;
- layer validation, current JSON/JSONC parsing, workflow YAML parsing, and PowerShell AST parsing;
- targeted ESLint with only the 28 warnings already present in the committed boundary-test baseline;
- precommit, documentation structure validation, and `git diff --check` with line-ending conversion warnings only.

Independent read-only review completed the required correction loops for installation-local data binding, startup recovery gating, Runner executable identity and publication races, canonical/reparse path enforcement, silent path rejection, and shortcut snapshots. The final reviewer conclusion contained no blocking or non-blocking finding.

## Build And Package Evidence

The final sequence completed successfully on 2026-08-10:

1. `npm run typecheck-client`;
2. `npm run compile-oi-extensions`;
3. `npm run gulp vscode-win32-x64-min`;
4. `verify-becoder-package.ps1` against `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64` with `-IncludeCompiler $true`;
5. `npm run gulp -- vscode-win32-x64-becoder-setup`;
6. `verify-becoder-setup.ps1` from the beginning, exit code 0 in 1035.2 seconds.

The direct Setup verifier covered two independent installations, non-ASCII and overlength refusal, Unicode and overlength junction/reparse refusal, payload size and SHA-256 equality, replacement consent and data deletion, foreign-directory and invalid-marker refusal, directory movement, external-file protection, true `.lnk` path-and-content snapshots, monitored integration registry snapshots, BeCoder-named registry snapshots, and manual deletion isolation.

Final accepted artifact:

```text
C:\Users\Bc\Desktop\BeCoder\BeCoder_new\.build\win32-x64\becoder-setup\BeCoderSetup-x64-1.130.0.exe
Size: 186,421,251 bytes
SHA-256: A146006748E7258508A82E147746AC7F812D457DFE2C1D1497FE970066F985BF
```

The project owner explicitly confirmed Stage 4.7 GUI/runtime and installation acceptance on 2026-08-10. Automated Setup verification and project-owner acceptance remain distinct evidence even though both passed.

## Remaining Boundary

- Stage 4.8 must make export/import discoverable through clear bilingual settings controls, re-review the existing foundation, and complete separate end-to-end runtime acceptance.
- The Stage 4.7 archive does not publish a binary, merge `main`, or create a PR, Release, or tag.
- Generated `.build/si` validation data and `extensions/becoder.setup/out-test-review/` output remain local and are not part of the Git archive.
- Repository-wide ESLint retains inherited third-party/generated baseline findings and was not reported as passing.

The planned archival commit subject is `feat(stage4.7): archive self-contained Windows distribution`; the pending plain backup target is `origin/codex/stage4.7`.
