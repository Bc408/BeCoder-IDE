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

## Export/Import Boundary

The approved design uses a versioned `.becoder-backup` archive with path validation, hashes, count/size limits, protected/blacklisted extension checks, transactional replacement, journaling, rollback, startup recovery, and installation-specific mutex ownership.

The intended export includes:

- user settings;
- keybindings;
- snippets;
- user-installed extensions;
- recent-project metadata;
- generic workspace state;
- local file history;
- sanitized `zh-cn` or `en` locale.

It excludes:

- application and toolchains;
- protected built-ins;
- caches and logs;
- credentials, tokens, and secret storage;
- unsaved buffers/backups;
- process state;
- source projects;
- unrelated `argv.json` fields.

Backups inside the current installation root are rejected. Import never writes user projects or system VS Code directories. End-to-end delivery requires clear bilingual settings controls and separate project-owner runtime acceptance.

## Acceptance Boundary

Validate clean profiles, complete/partial hide sets, exact restoration, user edits, multi-root overrides, legacy migration, project asset preservation, system VS Code isolation, archive traversal and link rejection, extension conflicts, integrity limits, interruption, rollback, startup recovery, locale-only transfer, and complete exclusion of secrets and source projects.
