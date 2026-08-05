# Repository Guidelines

## Project Structure & Module Organization

BeCoder is a Code - OSS fork for OI/ICPC workflows. Core TypeScript lives in `src/vs/`: utilities in `base/`, services in `platform/`, editor code in `editor/`, and desktop UI in `workbench/`. Bundled extensions live in `extensions/`. Build tooling is under `build/` and `scripts/`; tests are colocated in `src/vs/**/test/` or grouped under `test/`. Assets belong in `resources/`. Do not edit generated `out/` or `.build/` files.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm ci` installs pinned dependencies.
- `npm run typecheck-client` checks core TypeScript.
- `npm run compile-oi-extensions` builds bundled OI extensions.
- `./scripts/code.sh --locale zh-cn --user-data-dir ./tmp/becoder-dev` launches an isolated development instance.
- `npm run test-node -- --run <test-file>` runs a focused Node test.
- `./scripts/test.sh --glob '**/feature*.test.js'` runs focused Electron tests.
- `npm run test-browser-no-install` runs browser tests.
- `npm run gulp vscode-darwin-arm64-min` or `npm run gulp vscode-win32-x64-min` creates platform packages.

Before tests, follow `.github/copilot-instructions.md`: use the build watch task when available, otherwise the typecheck or extension gulp task. Do not use `npm run compile` for TypeScript validation.

### BeCoder Build Workflow

- The standard Windows validation sequence is `npm run typecheck-client`, `npm run compile-oi-extensions`, then `npm run gulp vscode-win32-x64-min`.
- The Codex command runner timeout is external to npm and Gulp. Use a 120-second timeout for type checking and OI extension compilation, and a 300-second (5-minute) timeout for the Windows portable Gulp build.
- A non-zero exit code or an external timeout is a failed step. Stop the workflow and report the command and output; do not retry automatically or continue to packaging and runtime checks.
- A build-only request authorizes only the requested build and its direct validation. Do not clean caches, delete artifacts, initialize Git, stage files, commit, push, or change user environment variables unless explicitly requested.
- After a successful Windows package build, the BeCoder package verifier may be run against the produced package with `-IncludeCompiler $true`. Runtime GUI verification is a separate step and must not be claimed from a successful Gulp build alone.
- `node_modules/`, `.build/`, `out/`, `out-build/`, and `out-vscode-min/` are local dependencies or generated build data. They are ignored by Git and must not be added to the repository or removed during a normal build.
- The bundled archives under `resources/oi-defaults/toolchains/` are intentional release assets. They are tracked with Git LFS and must be preserved; do not replace them with extracted toolchain directories in the source tree.

## Coding Style & Naming Conventions

Use tabs, single quotes for non-localized strings, braces for control flow, and `async`/`await`. Use PascalCase for types and enum values; camelCase for functions and variables. Localize visible text through `vs/nls`, preserve copyright headers, and register disposables immediately. Run `npm run eslint`, `npm run stylelint`, and `npm run valid-layers-check` where relevant.

## Testing Guidelines

Place tests beside the owning component as `*.test.ts`; integration cases use `*.integrationTest.ts`. Follow existing `suite`/`test` patterns and prefer a clear `assert.deepStrictEqual`. Add regression coverage for fixes; run coverage with `./scripts/test.sh --coverage`.

## Agent Workflow for Difficult Tasks

For difficult tasks, create a plan before development. After implementation, start an independent review agent/thread that must not modify code. It should validate requirement completeness, logical correctness, edge cases, code quality, test coverage, and actual runtime results, then return a concrete fix list to the primary agent. The primary agent must address the findings and ask the same reviewer to verify again. Repeat until validation passes or the remaining blocker is clearly documented.

## Clarification Before Assumptions

Do not guess when requirements or externally controlled behavior are unclear. Ask the user before implementing assumptions about website DOM, browser flows, account/session behavior, submission or result formats, expected UI behavior, or any other detail that cannot be verified from the repository or supplied evidence. Clearly state the missing information and wait for the user's direction when it materially affects the implementation.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects, for example `fix(build): match root Windows locale paths`. Keep commits scoped. Pull requests should explain behavior and validation, link issues, and include screenshots for UI changes. Call out packaging impact and bundled-extension or license changes.
