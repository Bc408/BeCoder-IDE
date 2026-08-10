# clangd Contract

## Purpose

BeCoder bundles clangd as a private, narrowly exposed code-intelligence service. It is not the visible diagnostic authority.

## Retained Capabilities

- completion;
- signature help;
- hover;
- definition;
- references;
- prepare rename and rename;
- standard semantic tokens for the bounded visual refinement;
- document formatting and range formatting.

clangd may preprocess includes and build AST/Sema internally because retained intelligence requires it. That internal work must not own first paint or create repeated visual refresh.

## Removed or Disabled Capabilities

- diagnostics and false-positive filters;
- inlay hints;
- inactive-region decorations;
- clang-tidy and broad code actions;
- workspace symbols and persistent background indexing;
- type hierarchy;
- AST and memory views;
- source/header switching;
- configuration-file UI and watchers;
- formatting on type;
- downloads, update checks, external executable paths, and public raw-client replacement;
- custom semantic-token persistence or reconstruction.

## Process and Configuration Isolation

- Start only the fixed executable under BeCoder's private toolchain.
- Use `--enable-config=false`.
- Do not generate, read, migrate, hide, rewrite, or delete project `.clangd` files.
- Ignore `compile_commands.json` and supply BeCoder-owned C17/C++20 arguments through the LSP boundary.
- Resolve bundled GCC-compatible target and include paths without user PATH or registry discovery.
- Use private PATH, temp, profile, app-data, HOME, and XDG roots for the child.
- Disable automatic header insertion.
- Current-translation-unit intelligence is required; complete large-project cross-file indexing is outside BeCoder's OI scope.

## Formatting

- Use clangd's embedded ClangFormat engine; do not ship `clang-format.exe`.
- Use Google fallback style.
- Support explicit Format Document and Format Selection.
- Keep format-on-type and format-on-save disabled by default.
- Do not generate `.clang-format`.
- Permit only a readable physical `.clang-format` inside the opened workspace to override the fallback.
- Reject `_clang-format`, escaping symlinks, ancestor/system/profile configuration, and parent inheritance outside the workspace.

## Source Ownership

- `extensions/llvm-vs-code-extensions.vscode-clangd`
- BeCoder toolchain path and isolation support under `extensions/becoder.setup`
- package-boundary tests and verifier

## Acceptance Boundary

Validate every retained LSP operation, Google fallback and workspace override, private process arguments/environment, ignored project `.clangd`, absent removed UI/settings, no automatic include insertion, and one bounded standard semantic refinement. clangd tests and package checks do not substitute for project-owner interaction acceptance.
