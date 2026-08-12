# Settings

BeCoder uses its private bundled clangd executable and fixed command-line arguments. The clangd extension does not expose settings for selecting another executable or supplying workspace command-line flags.

The user-facing inlay-hint switch is `becoder.inlayHints.enabled` under BeCoder IDE Features and is off by default. Formatting uses Google style as its fallback. A `.clang-format` or `_clang-format` file inside the opened workspace may override that formatting style; BeCoder does not create or rewrite either file.
