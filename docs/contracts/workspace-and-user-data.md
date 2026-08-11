# Workspace and User-Data Contract

## Workspace Assets

Workspace configuration is user project data and part of the BeCoder workspace ecosystem.

BeCoder must continue reading and protecting:

- `.vscode/settings.json`
- `.vscode/tasks.json`
- `.vscode/extensions.json`
- multi-root workspace and folder-level configuration
- user-created `.vscode/launch.json`, `c_cpp_properties.json`, and other `.vscode` files
- workspace `.clangd` and `.clang-format`
- `.git`, `.gitignore`, `.gitattributes`, and other version-control assets
- source, input, documentation, and user tools

Removing a product feature or schema does not authorize deleting, migrating, hiding, or rewriting its project files.

## System VS Code Isolation

BeCoder must not read, copy, migrate, modify, or clean:

- `%APPDATA%\Code`
- `%USERPROFILE%\.vscode\extensions`
- system VS Code settings, extensions, caches, state, or locale
- system clangd configuration or cache
- system compiler configuration discovered through registry or PATH

BeCoder settings, extensions, cache, locale, history, toolchains, and runtime state remain under the current installation directory.

## Explorer Visibility

A clean profile adds no BeCoder-managed `files.exclude`. Generated executables and dot-prefixed files/folders are visible by default.

The explicit hide action owns this complete set:

- `**/.*`
- `**/*.exe`
- `**/*.bin`
- `**/*.bin.dSYM`
- `**/*.dSYM`

Show All Files restores only values BeCoder changed. It preserves unrelated user exclusions and user edits made while the managed hide state was active. Workspace and folder settings remain read-only to this global action.

An exact ordinary item named `input` sorts above siblings in its Explorer folder under every supported sort direction and mode. No alternate spelling is pinned.

## User-Data Location

Program data remains under installation-local `data`, including user settings, extensions, history, caches, locale, and toolchains. Moving the complete installation moves this state without system migration.

## Profile Export/Import Boundary

Code OSS Profiles and the native `.code-profile` format are the only BeCoder configuration export/import authority. BeCoder does not provide a parallel `.becoder-backup` format, custom export/import commands, detached replacement helper, transaction journal, or startup recovery path.

The native Profiles UI controls the supported resource set, including settings, keybindings, tasks, snippets, UI state, and user extensions where present in the exported profile. A profile is configuration data, not a complete installation backup: it does not transfer the application, toolchains, source projects, arbitrary installation-local files, caches, logs, unsaved buffers, or secret storage.

Profile import writes only the current installation's profile data and installs allowed extensions through the ordinary extension-governance path. It must not inspect or modify system VS Code, another BeCoder installation, or user projects. Importing a profile whose name already exists requires the native replacement confirmation. One user action, focus-change auto-save, and other concurrent save requests must share one in-flight profile creation so that replacement and extension installation are not duplicated.

## Acceptance Boundary

Validate clean profiles, complete/partial hide sets, exact restoration, user edits, multi-root overrides, legacy migration, project asset preservation, system VS Code isolation, native `.code-profile` export/import, same-name replacement, single-flight creation under focus-change auto-save, extension-governance enforcement, and exclusion of secrets and source projects.
