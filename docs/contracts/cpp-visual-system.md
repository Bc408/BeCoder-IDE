# C/C++ Visual System Contract

## Architecture

The accepted visual path is:

```text
open file
  -> immediate built-in TextMate/Better C++ Syntax coloring
  -> one bounded standard clangd semantic refinement
  -> BeCoder One Monokai semantic colors
```

## Immediate First Paint

- `extensions/cpp` owns the single `source.cpp` grammar.
- Better C++ Syntax content is vendored into that built-in language extension.
- Do not bundle a second Better C++ Syntax extension or duplicate grammar owner.
- Complete readable coloring must appear immediately, including `bits/stdc++.h` files.
- clangd preparation must not block, blank, or partially color the editor.

## Theme

- `becoder.one-monokai` is a protected built-in system extension.
- It is the fresh-profile default but is not forced after the user selects another theme.
- User/workspace extensions cannot replace the protected identity in normal packaged use.
- Preserve the upstream MIT license and copyright notice.
- Keep theme colors in the extension rather than hard-coding them into Workbench.

## Semantic Refinement

- Enable standard semantic highlighting for C, C++, and CUDA C++ unless the user explicitly overrides it.
- Register only the standard language-client semantic-token provider.
- Do not restore custom persistence, fingerprinting, delta reconstruction, cross-session cache, invalidation, or a second BeCoder token pipeline.
- Material semantic colors are limited to functions/methods/macros, types/classes/interfaces/enums/type parameters/concepts, parameters, variables/properties, and selected standard-library variables.
- Keywords, operators, brackets, numbers, strings, and comments remain governed by TextMate/One Monokai.
- Target one stable refinement within approximately two seconds on the accepted environment, without repeated broad visual churn.

## Unicode Defaults

BeCoder defaults to:

- `editor.unicodeHighlight.nonBasicASCII: false`
- `editor.unicodeHighlight.ambiguousCharacters: false`
- `editor.unicodeHighlight.invisibleCharacters: true`

These are product defaults, not migrations. Explicit user values win. System VS Code settings are never read or changed.

## Source Ownership

- `extensions/cpp`
- `extensions/becoder.one-monokai`
- standard semantic-token registration in `extensions/llvm-vs-code-extensions.vscode-clangd`

## Acceptance Boundary

Use templates, macros, lambdas, structured bindings, concepts, STL types, `bits/stdc++.h`, `debugger.h`, C17, large files, clean profiles, theme switching, and restart persistence. Compare first paint separately from semantic readiness.
