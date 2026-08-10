# Setup-Only Distribution Contract

## Release Product

The only Windows release artifact is:

```text
BeCoderSetup-x64-<version>.exe
```

Do not publish or advertise a Portable ZIP. A transient unpacked application directory is a build implementation detail, not a product release.

## Setup Responsibility

Setup places one complete self-contained BeCoder directory at a user-selected location. It installs the application, audited expanded GCC, expanded clangd, private `data`, required built-ins, notices, manifests, and diagnostics support.

Setup performs no runtime toolchain extraction. Ordinary startup performs a fast non-destructive installed-toolchain health check. Explicit diagnostics may verify the full retained tree, hashes, and executable versions.

When the installation is missing, corrupt, or outside the supported path boundary, runtime offers only `Get BeCoder Setup` and `Open Diagnostics` with equivalent Simplified-Chinese labels. It does not download, extract, retry, redetect, or repair the toolchain.

## Zero System Integration

Setup is per-user and requires no administrator privileges. It creates:

- no desktop or Start-menu shortcut;
- no uninstaller, uninstall helper, or uninstall registration;
- no registry entry of any kind;
- no file association or default application;
- no Explorer context-menu command;
- no PATH change, command registration, or App Paths entry;
- no URL protocol;
- no service, updater, scheduled task, background task, or startup entry;
- no system VS Code migration or access;
- no project configuration.

After closing BeCoder, deleting the complete directory is the complete uninstall.

## Installation Identity

`.becoder-installation.json` at the installation root uses schema version 2, `product: "BeCoder"`, and a directory-local UUID `installationId`.

- A new empty directory receives a new ID.
- Replacing the same authenticated directory retains its ID while deleting and recreating all BeCoder-owned content and data.
- A nonempty directory without a valid marker is rejected.
- Ownership is never inferred from a directory name or executable alone.
- Replacement never enumerates or affects another installation.
- The marker contains no absolute path and moves with the directory.

The installation-local `data` path owns main IPC, so repeated launches of one installation merge while different installations can run simultaneously. AppUserModelID derives from the directory-local ID without registry state.

## Path Boundary

GCC 14.1.0 imposes a current product boundary: the canonical installation root must contain only ASCII characters and be no longer than 70 characters. Spaces are supported. Apply the same rule to interactive and silent installation.

## Replacement and Data Loss

Reinstall is complete replacement, not a hidden data-preserving upgrade. Interactive replacement warns that program files, toolchains, settings, extensions, history, caches, and other BeCoder data will be deleted and recommends explicit export. Silent replacement requires `/BECODERALLOWDATALOSS=1`.

The warning does not prove that a usable export/import workflow is available. That workflow requires clear settings controls and separate runtime acceptance before it can be treated as delivered.

## Toolchain Payload

Build GCC from an explicit allowlist and retain C17, C++20, `bits/stdc++.h`, PBDS, ranges, filesystem, threads, UTF-8, `stdc++.h.gch`, `debugger.h`, Runner, GCC diagnostics, and retained clangd operations.

Candidate removals require dependency and execution evidence. Correctness, offline independence, source/license compliance, and measurable behavior take priority over a size target.

## Source Ownership

- `build/lib/becoderToolchain.ts`
- `build/gulpfile.vscode.win32.ts`
- `build/win32/becoder.iss`
- `src/vs/code/node/beCoderInstallation.ts`
- `src/vs/code/electron-main/app.ts`
- `src/vs/code/electron-main/main.ts`
- `extensions/becoder.setup`
- package and Setup verifiers

## Acceptance Boundary

Automated verification covers payload identity, two independent installation directories, replacement, ownership refusal, external project protection, offline toolchains, prohibited integration surfaces, and before/after Setup registry snapshots. User and common Desktop and Start-menu checks snapshot ordinary `.lnk` files by full path and content hash: unchanged pre-existing shortcuts are allowed, while a shortcut created, removed, or changed by Setup fails verification.

Project-owner runtime acceptance separately covers ordinary launch zero-registry behavior, same-install merging, cross-install concurrency, directory movement, drive-letter change, removable-drive use, language startup, toolchains, Runner, clangd, diagnostics, and manual directory deletion. Build or Setup verification alone is not runtime proof.
