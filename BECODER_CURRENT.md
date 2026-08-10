# BeCoder Current State

This is the live development status for BeCoder. Update it whenever the active branch, stage, validation state, release candidate, blocker, or next action changes. Stable product reasoning belongs in `BECODER_PHILOSOPHY.md`; detailed behavior belongs in `docs/contracts/`; historical evidence belongs in `docs/archive/`.

## 1. Repository State

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Release branch: `main`
- Active development branch: `codex/stage4.7`
- Stage 4.7 parent commit: `928aec1` (`feat(stage4.6): remove terminal suggestions and source control`)
- Stage 4.7 archival commit: `e7b5d6d` (`feat(stage4.7): archive self-contained Windows distribution`)
- Latest completed remote backup: `origin/codex/stage4.7`
- Current `main`: `c028603`
- Stable historical runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference is outside the repository and must not be modified.

The accepted Stage 4.7 source, tests, build policy, legal records, and project documentation were archived in `e7b5d6d` and backed up to `origin/codex/stage4.7`. Local generated data under `.build/` and `extensions/becoder.setup/out-test-review/` is not part of that commit and must not be staged, committed, or removed without separate authorization.

## 2. Stage Status

**Stage 4.7 was project-owner accepted, archived, and backed up on 2026-08-10.**

**Stage 4.8 is in progress.** Its implementation foundation exists, but its user-facing delivery is not accepted or archived. Starting or changing Stage 4.8 still requires a new scoped plan and explicit project-owner authorization.

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
- the Stage 4.8 export/import transaction and startup-recovery foundation, without claiming Stage 4.8 delivery;
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

## 5. Stage 4.8 Entry

The source already contains protected commands, `.becoder-backup` archive/import machinery, transaction journaling, detached replacement, startup recovery, integrity checks, and package boundaries.

Stage 4.8 must begin by reviewing that foundation again, then:

- expose clear English and Simplified-Chinese controls under BeCoder IDE Features;
- verify settings, extensions, history, locale, exclusion, integrity, rollback, and startup-recovery boundaries;
- confirm secrets, source projects, system VS Code, and unrelated installations remain outside authority;
- perform complete end-to-end project-owner runtime acceptance;
- update current state and archive only after that acceptance.

Stage 4.8 is not authorized by the Stage 4.7 archive or backup request.

## 6. Known Remaining Work

- Stage 4.8 export/import requires discoverable settings UX and end-to-end runtime acceptance.
- Inherited component documentation and non-document GitHub triage metadata may receive a separately scoped audit; do not perform keyword-driven deletion.
- The accepted source and history are backed up to `origin/codex/stage4.7`; no PR, Release, tag, or public binary publication was created or implied.
- Generated validation data under `.build/si` and `extensions/becoder.setup/out-test-review/` remains local and outside Git.

## 7. Archived Checkpoints

The latest completed archived checkpoint is Stage 4.7 at `e7b5d6d`, backed up to `origin/codex/stage4.7`.

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

- Do not treat the Stage 4.8 foundation as accepted product delivery.
- Do not modify or launch the accepted Stage 4.7 artifact without new authorization.
- Do not commit, push, open a PR, publish a release, or create a tag without explicit authorization for that action.
- Do not modify system VS Code, user environment variables, external reference packages, or user project assets.
- Do not stage, commit, or clean generated dependency, build, test-output, or validation directories unless explicitly authorized.
