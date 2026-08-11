# BeCoder Current State

This is the live development status for BeCoder. Update it whenever the active branch, stage, validation state, release candidate, blocker, or next action changes. Stable product reasoning belongs in `BECODER_PHILOSOPHY.md`; detailed behavior belongs in `docs/contracts/`; historical evidence belongs in `docs/archive/`.

## 1. Repository State

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Release branch: `main`
- Active development branch: `codex/stage4.9.5`
- Stage 4.7 parent commit: `928aec1` (`feat(stage4.6): remove terminal suggestions and source control`)
- Stage 4.7 archival commit: `e7b5d6d` (`feat(stage4.7): archive self-contained Windows distribution`)
- Latest completed remote backup: `origin/codex/stage4.7`
- Current `main`: `c028603`
- Stable historical runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference is outside the repository and must not be modified.

The accepted Stage 4.7 source, tests, build policy, legal records, and project documentation were archived in `e7b5d6d` and backed up to `origin/codex/stage4.7`. Local generated data under `.build/` and `extensions/becoder.setup/out-test-review/` is not part of that commit and must not be staged, committed, or removed without separate authorization.

## 2. Stage Status

**Stage 4.7 was project-owner accepted, archived, and backed up on 2026-08-10.**

**Stage 4.9.x is in progress.** Stage 4.9.1 was project-owner accepted and archived on 2026-08-11. Its focused result restores the upstream Code OSS 1.130 Seti file-icon theme as an ordinary built-in and selects `vs-seti` for fresh profiles while preserving an explicit user-selected file-icon theme. Stage 4.9.5 is an uncommitted working candidate and has not been project-owner accepted. Its current corrections prevent BeCoder's unavailable Microsoft-proprietary extension signature verifier from blocking normal Open VSX installation by default, remove the rejected `.becoder-backup` implementation in favor of native Code OSS Profiles, and serialize concurrent native profile creation triggered by BeCoder's focus-change auto-save default. Source validation passed on 2026-08-11; the current source has not been rebuilt or runtime accepted. Stage 4.8 was rejected; its dirty worktree was deliberately discarded before this series began.

## 3. Accepted Stage 4.7 Result

Stage 4.7 delivered:

- Setup-only Windows distribution and workflows;
- allowlisted expanded GCC and clangd staging;
- removal of first-run extraction, readiness markers, repair, and retry paths;
- directory-local installation identity using `.becoder-installation.json` schema 2 and a UUID;
- no shortcuts, uninstaller, installer identity reuse, previous-directory memory, or intended registry writes;
- canonical ASCII installation roots no longer than 70 characters, with reparse-point refusal;
- independent installation-local IPC and taskbar identity;
- display-language startup synchronization after protected extension registration;
- Explorer visibility ownership for dot-prefixed files and executable artifacts;
- Runner executable publication, cleanup, cancellation, and terminal-observability closeout;
- product repository, workflow, legal, and bundled-component metadata corrections;
- strengthened package and Setup verification, including true `.lnk` snapshots and broader zero-registry checks;
- the now-retired Stage 4.8 export/import transaction and startup-recovery foundation, which the current Stage 4.9.5 worktree removes in favor of native Code OSS Profiles;
- restructured project knowledge with current contracts, historical archives, a mandatory handoff entry, and the repository-local `develop-becoder` Skill.

The only accepted Windows artifact is the Setup executable recorded in the prepared `docs/archive/stage4.7.md` checkpoint. There is no Portable ZIP release and no first-launch toolchain extraction workflow.

## 4. Final Stage 4.7 Evidence

The final accepted source and verifier boundary passed:

- Setup extension tests: 33/33;
- Runner tests: 54/54;
- final build-script tests: 225/225;
- final Stage 4.5/4.6/4.7 boundary suite: 19/19;
- focused Setup shortcut-snapshot regression: 1/1;
- `npm run typecheck-client`;
- build TypeScript checking with `tsc --project build/tsconfig.json --noEmit`;
- `npm run valid-layers-check`;
- JSON/JSONC, workflow YAML, and PowerShell AST parsing;
- targeted ESLint with only the 28 warnings already present in the committed boundary-test baseline;
- `npm run precommit`;
- repository documentation structure validation;
- `git diff --check`, with line-ending conversion warnings only.

The same independent read-only reviewer completed all required correction loops. The final review of source, packaging, silent Setup rejection, and true-shortcut snapshot behavior reported no blocking or non-blocking finding.

The authorized final build and verification sequence passed on 2026-08-10:

1. `npm run typecheck-client`;
2. `npm run compile-oi-extensions`;
3. `npm run gulp vscode-win32-x64-min`;
4. direct staged-package verification with `-IncludeCompiler $true`;
5. `npm run gulp -- vscode-win32-x64-becoder-setup`;
6. complete direct Setup verification from the beginning, exit code 0.

The final Setup verifier covered two independent installations, non-ASCII and overlength refusal, junction/reparse refusal, payload hashes, replacement and data-loss authorization, foreign directories, invalid markers, directory movement, true `.lnk` before/after snapshots, registry snapshots, external-file protection, and cleanup isolation. The project owner then explicitly confirmed Stage 4.7 acceptance on 2026-08-10.

Repository-wide ESLint still has inherited third-party/generated CodeSnap, clangd, Mermaid, and older-extension baseline findings. It was not a Stage 4.7 acceptance gate and must not be reported as passing.

## 5. Stage 4.9.1 Entry

The branch was reset to the accepted Stage 4.7 content at `88371c0`, and all non-ignored Stage 4.8 worktree changes were discarded. The Stage 4.9.1 source implementation now:

- restores the complete upstream Code OSS 1.130 `extensions/theme-seti` source;
- removes only `theme-seti` from the OI distribution exclusion list;
- selects `vs-seti` through the existing BeCoder fresh-profile configuration defaults, with explicit user choice remaining authoritative;
- retains the pinned Simplified-Chinese pack's existing Seti translation mapping;
- records Seti as an unmodified ordinary built-in with its MIT and `seti-ui` provenance;
- leaves every other removed theme and rejected Stage 4.8 feature unchanged.

The accepted Stage 4.9.1 staged Windows build completed on 2026-08-11:

1. `npm run typecheck-client`: exit code 0 in 5.8 seconds;
2. `npm run compile-oi-extensions`: exit code 0 in 9.1 seconds;
3. `npm run gulp vscode-win32-x64-min`: exit code 0 in 84.6 seconds.

The staged application is at `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The project owner accepted this atomic Seti delivery for archive. Direct package verification, Setup construction, Setup verification, and agent-run GUI acceptance were not performed and are not implied by the staged build.

## 6. Known Remaining Work

- Build the current Stage 4.9.5 working candidate when separately authorized, then have the project owner verify normal Open VSX installation, the retained explicit signature-verification setting, native `.code-profile` export/import, one same-name replacement confirmation, and one extension-install sequence per import. Current source evidence does not prove runtime acceptance.
- After the current Stage 4.9.5 candidate is accepted or rejected, wait for the project owner to define and authorize the next atomic Stage 4.9.x task.
- Stage 4.9.1 intentionally added and ran no tests under the approved fast visual delivery mode.
- Inherited component documentation and non-document GitHub triage metadata may receive a separately scoped audit; do not perform keyword-driven deletion.
- The accepted source and history are backed up to `origin/codex/stage4.7`; no PR, Release, tag, or public binary publication was created or implied.
- Generated validation data under `.build/si` and `extensions/becoder.setup/out-test-review/` remains local and outside Git.

## 7. Archived Checkpoints

The latest completed archived checkpoint is Stage 4.9.1 on `codex/stage4.9.1`, with a local Git backup only. The latest remote backup remains Stage 4.7 at `origin/codex/stage4.7`.

Archived and project-owner accepted areas include:

- Stage 4 visual system and One Monokai;
- Stage 4.1 clangd intelligence and Google formatting;
- Stage 4.2 GCC editor error diagnostics;
- Stage 4.3 Runner baseline, visual refinement, diagnostics correction, performance, and Explorer `input` ordering;
- Stage 4.4 Open VSX and extension governance;
- Stage 4.4.1 protected Simplified Chinese and bilingual product UI;
- Stage 4.5 AI/Chat/Agent/MCP and Debug/GDB product removal with generic infrastructure retention;
- Stage 4.6 terminal-suggestion, Source Control, and `cpu-features` cleanup.

Historical details belong under `docs/archive/` and must not override current philosophy or contracts.

## 8. Current Stop Rules

- Do not restore any rejected Stage 4.8 feature; each Stage 4.9.x task requires its own atomic scope.
- Do not restore `.becoder-backup`, its custom commands, detached helper, transaction journal, startup recovery, or package requirements. Native Code OSS Profiles are the sole configuration export/import authority.
- Do not start a sub-agent or review thread unless the project owner explicitly requests one.
- After a requested build succeeds, stop by default and perform no follow-up action unless that same request explicitly authorizes it.
- Do not treat the Stage 4.9.1 staged build as direct package verification, Setup verification, or agent-run GUI acceptance.
- Do not modify or launch the accepted Stage 4.7 artifact without new authorization.
- Do not commit, push, open a PR, publish a release, or create a tag without explicit authorization for that action.
- Do not modify system VS Code, user environment variables, external reference packages, or user project assets.
- Do not stage, commit, or clean generated dependency, build, test-output, or validation directories unless explicitly authorized.
