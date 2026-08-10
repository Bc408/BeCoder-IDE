# Native PowerShell Contract

## Purpose

Native PowerShell is the only BeCoder surface that intentionally accepts the user's normal system environment and arbitrary commands.

## Required Behavior

- Preserve the user's PATH, profiles, aliases, scripts, command history, PSReadLine behavior, shell integration, command detection, and decorations.
- Permit ordinary CLI programs, including user-installed compilers and Git.
- Keep the terminal visually and semantically recognizable as native PowerShell.
- Keep ordinary terminal creation and lifecycle independent from BC Runner.

## Forbidden Behavior

- Do not force BeCoder's bundled GCC or clangd into native PowerShell.
- Do not modify user or system environment variables.
- Do not route BC Runner commands through PowerShell.
- Do not couple PowerShell `Ctrl+C` or terminal state to Runner, clangd, or GCC diagnostics.
- Do not restore the removed terminal initial suggestion hint or Workbench Terminal Suggest overlay.

## Isolation Meaning

Native PowerShell receiving the system environment is intentional. It is not permission for other BeCoder components to discover compilers, settings, extensions, or configuration through PATH, registry, profiles, or system VS Code data.

## Acceptance Boundary

Validate normal profiles, aliases, scripts, Git, history, shell integration, and arbitrary commands while proving bundled toolchains remain absent unless the user intentionally invokes their explicit paths.
