# BeCoder C/C++ Intelligence

This built-in extension connects BeCoder to its private bundled clangd. It is
part of the product and is not configured or updated through the extension
marketplace.

The exposed language features are limited to:

- completion and signature help;
- hover, definition, and references;
- prepare rename and rename;
- standard inlay hints when explicitly enabled in BeCoder IDE Features;
- Format Document and Format Selection.

BeCoder supplies C17 and C++20 compile commands directly over LSP. Workspace
`.clangd` and `compile_commands.json` files are not read. Completion never adds
include directives.

Visible C/C++ diagnostics belong to BeCoder's bundled GCC diagnostic service,
not clangd. TextMate owns immediate syntax coloring, followed by one standard
semantic-token refinement. This extension does not provide clang-tidy actions,
background workspace indexing, or code actions.

Formatting uses clangd's embedded ClangFormat engine with Google as the
fallback style. A physical `.clang-format` inside the opened workspace may
override that fallback. BeCoder does not create or rewrite formatting files.
