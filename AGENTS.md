# Repository Guidelines

## Project Structure & Module Organization

BeCoder is a Code - OSS fork for OI/ICPC workflows. Core TypeScript lives in `src/vs/`: utilities in `base/`, services in `platform/`, editor code in `editor/`, and desktop UI in `workbench/`. Bundled extensions live in `extensions/`. Build tooling is under `build/` and `scripts/`; tests are colocated in `src/vs/**/test/` or grouped under `test/`. Assets belong in `resources/`. Do not edit generated `out/` or `.build/` files.

## Mandatory Project Orientation

After reading this file completely, and before analyzing a new stage or making a nontrivial change, read `VISION.md` completely. Then inspect the current source and the project owner's latest requirements relevant to the task. Do not assume that deleted historical stage, handoff, or contract documents remain authoritative.

For Beacon or BeCoder NoteBook work, then read `docs/beacon/README.md` and the relevant formal PRD, architecture, Notebook design, and research agenda it links. These repository-owned documents contain the confirmed design baseline. The default root `README.md` is Simplified Chinese, with `README.en.md` as the English entry point. Root and extension READMEs describe the current implementation; differences from the baseline are implementation gaps, not permission to discard confirmed requirements. Desktop drafts are historical references, not a competing source of current rules. The project owner's latest direct decisions take precedence.

For Beacon frontend work, follow the project owner's latest confirmed visual and interaction requirements, inspect the current owning controls, and inspect rendered screenshots before handing off changes. Current model-settings behavior is documented in `extensions/becoder.beacon/README.md`; the formal Beacon documents retain requirements and implementation gaps. Do not treat deleted visual drafts or historical implementation plans as current authority.

Before proposing or starting implementation for a new stage or nontrivial change, provide an understanding proof covering the product purpose, relevant ownership boundaries, current repository/stage facts, requested change, protected/out-of-scope behavior, and validation/project-owner acceptance boundary. This requirement also applies when the user directly authorizes implementation. Wait for explicit plan approval before editing unless the user directly requested implementation.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm ci` installs pinned dependencies.
- `npm run typecheck-client` checks core TypeScript.
- `npm run compile-oi-extensions` builds bundled OI extensions.
- `./scripts/code.sh --locale zh-cn --user-data-dir ./tmp/becoder-dev` launches an isolated development instance.
- `npm run test-node -- --run <test-file>` runs a focused Node test.
- `./scripts/test.sh --glob '**/feature*.test.js'` runs focused Electron tests.
- `npm run test-browser-no-install` runs browser tests.
- `npm run gulp vscode-win32-x64-min` creates the staged Windows application used to build the BeCoder Setup.

Before tests, use the build watch task when available; otherwise run the owning typecheck or extension Gulp task. Do not use `npm run compile` for TypeScript validation. `.github/copilot-instructions.md` is a short BeCoder entry point and must not override this file, `VISION.md` or the project owner's latest explicit requirements.

### BeCoder Build Workflow

- The standard Windows validation sequence is `npm run typecheck-client`, `npm run compile-oi-extensions`, then `npm run gulp vscode-win32-x64-min`.
- The Codex command runner timeout is external to npm and Gulp. Use a 120-second timeout for type checking and OI extension compilation, and a 300-second (5-minute) timeout for the staged Windows application build.
- A non-zero exit code or an external timeout is a failed attempt. Record the exact command, output, and failure class. During project-owner-authorized development, diagnose and correct failures within the authorized scope, then rerun the smallest affected check before resuming the validation sequence. Do not treat a failed or stale attempt as passing evidence, and do not claim package or runtime acceptance until the required final checks succeed.
- A build-only request authorizes only the requested build and its direct validation. Do not clean caches, delete artifacts, initialize Git, stage files, commit, push, or change user environment variables unless explicitly requested.
- When package verification is explicitly in scope, run the direct package verifier with `-IncludeCompiler $true` after the staged build. Build and directly verify Setup when release packaging is requested. A staged-build-only request stops after that build; it does not implicitly authorize these later steps. Runtime GUI verification is separate and must not be claimed from a successful Gulp or Setup build alone.
- After the requested build succeeds, stop by default. Do not automatically run package verification, build or verify Setup, launch the GUI, review, update documentation, inspect further state, clean files, or perform Git operations unless the same user request explicitly authorizes those follow-up actions.
- After the requested source checks, staged application build, package verification, Setup build, and Setup verification succeed, stop and hand the Setup artifact to the user for manual acceptance. Do not launch the installed product, run Run/Run With Input, or claim runtime acceptance unless the user explicitly requests agent-run verification in a later instruction.
- `node_modules/`, `.build/`, `out/`, `out-build/`, and `out-vscode-min/` are local dependencies or generated build data. They are ignored by Git and must not be added to the repository or removed during a normal build.
- The bundled archives under `resources/oi-defaults/toolchains/` are intentional release assets. They are tracked with Git LFS and must be preserved; do not replace them with extracted toolchain directories in the source tree.

### Atomic Visual Fast Path

For project-owner-authorized atomic visual tasks, default to the lightweight delivery path: inspect only the owning UI/resource route, make the smallest requested change, run only checks required to keep the build valid, build the staged Windows application once, and hand it to the project owner for visual acceptance. Do not expand into unrelated tests, broad review, package or Setup work, documentation updates beyond an explicitly requested workflow/status note, cleanup, or Git operations. If the task proves difficult or crosses its frozen boundary, report that before continuing and wait for explicit authorization.

### Validation Command Preflight

Before formal validation, perform a read-only preflight of the complete command list:

- Derive command entry points from this file, the relevant `package.json` scripts, or executables that actually exist. Prefer npm scripts and `node_modules\.bin`; do not guess dependency-internal paths.
- Confirm every executable, Node module, project file, configuration file, and input path before invoking the target validator.
- Classify changed paths by Git status. Content parsers and linters must receive only existing ordinary files; deleted paths and directories require separate treatment.
- Avoid complex ad hoc PowerShell one-liners. When shell logic is unavoidable, check its parsing, interpolation, quoting, encoding, and Windows-path behavior before formal validation.
- Before adding a file, inspect at least two nearby files in the same ownership area for the correct copyright header, import style, naming, and test conventions.
- Freeze the command list after preflight and keep a validation ledger containing the exact command, inputs, exit code, failure class, affected later checks, and required reruns.

A missing entry point or dependency, invalid shell syntax, or incorrect input enumeration is a validation-orchestration failure, not a source result. It must not be reported as a source failure or a passing check. Once a formal validator actually starts, record any non-zero exit code or external timeout, diagnose it at the correct layer, and repair or revise the validation plan within the authorized scope before rerunning. Do not improvise a replacement command silently or use earlier evidence as proof for changed code.

## Coding Style & Naming Conventions

Use tabs, single quotes for non-localized strings, braces for control flow, and `async`/`await`. Use PascalCase for types and enum values; camelCase for functions and variables. Localize visible text through `vs/nls`, preserve copyright headers, and register disposables immediately. Run `npm run eslint`, `npm run stylelint`, and `npm run valid-layers-check` where relevant.

## Testing Guidelines

Place tests beside the owning component as `*.test.ts`; integration cases use `*.integrationTest.ts`. Follow existing `suite`/`test` patterns and prefer a clear `assert.deepStrictEqual`. Add regression coverage for fixes; run coverage with `./scripts/test.sh --coverage`.

## Agent Workflow for Difficult Tasks

For difficult tasks, create a plan before development. The primary agent may use sub-agents for independent investigation, implementation, or review when doing so improves correctness or speed. Coordinate shared-worktree changes so that only one agent writes a given ownership area at a time. Review agents remain read-only unless the task explicitly assigns them an implementation slice. The primary agent performs a final read-only review covering requirement completeness, logical correctness, edge cases, code quality, test coverage, and actual runtime results, then addresses concrete findings and revalidates affected checks.

## Clarification Before Assumptions

Do not guess when requirements or externally controlled behavior are unclear. Ask the user before implementing assumptions about website DOM, browser flows, account/session behavior, submission or result formats, expected UI behavior, or any other detail that cannot be verified from the repository or supplied evidence. Clearly state the missing information and wait for the user's direction when it materially affects the implementation.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects, for example `fix(build): match root Windows locale paths`. Keep commits scoped. Pull requests should explain behavior and validation, link issues, and include screenshots for UI changes. Call out packaging impact and bundled-extension or license changes.
