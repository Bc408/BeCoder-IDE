# BeCoder Setup Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one Setup flow with a default native application mode and an opt-in fully Portable mode.

**Architecture:** Use an Inno Setup mode-selection task/page as the single source of truth. Native mode keeps Inno's generated uninstaller and uninstall registration; Portable mode evaluates `Uninstallable` and `CreateUninstallRegKey` to false and keeps the installation directory as the only product-owned installation state. Desktop shortcut selection remains available, with the native Inno Setup selected-by-default desktop task in both modes (project-owner revision on 2026-10-18).

**Tech Stack:** Inno Setup Pascal Script, PowerShell Setup verifier, Node test contracts, Markdown documentation.

**Spec:** The approved in-chat dual-mode Setup design from 2026-10-17.

## Global Constraints

- Native mode is the default Setup mode.
- Portable mode writes no uninstall registry entry and produces no `unins*` files.
- Native mode creates the Windows uninstall entry and removes it on uninstall.
- Both modes use the native selected-by-default desktop shortcut task; users may clear it.
- Portable mode remains movable as a complete directory and stores runtime data under the installation directory.
- User workspaces, `.beaconWork`, and `.notebook` outside the installation directory are never removed by Setup uninstall or replacement.
- Preserve existing path, ownership-marker, replacement, data-loss, language, and license behavior.

## Review Focus

- Mode selection must affect both generated uninstaller presence and uninstall registration, covered by Setup script contract assertions and direct two-mode Setup verification.
- Portable installation must leave monitored registry and shortcut snapshots unchanged, covered by the verifier's Portable pass.
- Native installation must retain the generated uninstaller and native uninstall entry, covered by the verifier's Native pass.
- Desktop shortcut defaults are identical in both modes, without scripted task selection; preserve the removable-media warning.
- Reinstall and moved-directory ownership protections must remain active in both modes, covered by the existing verifier scenarios rerun against each mode.

### Task 1: Setup mode contract

**Files:**
- Modify: `build/lib/test/oiExtensionBoundary.test.ts`
- Modify: `build/win32/becoder.iss`

- [ ] Add failing contract assertions for the mode task, scripted `Uninstallable` and `CreateUninstallRegKey`, and the native desktop shortcut task.
- [ ] Run the focused boundary test and confirm it fails because the current Setup has global uninstall disabled and no mode task.
- [ ] Implement the minimal Inno Setup mode task/functions and conditional directives.
- [ ] Rerun the focused boundary test and confirm it passes.

### Task 2: Setup verifier matrix

**Files:**
- Modify: `build/azure-pipelines/win32/verify-becoder-setup.ps1`

- [ ] Extend the verifier to invoke the Setup once in native mode and once in Portable mode using isolated roots.
- [ ] Assert native `unins*` and uninstall registration behavior.
- [ ] Assert Portable absence of `unins*`, unchanged monitored registry state, and no Portable shortcut when explicitly deselected.
- [ ] Preserve existing replacement, marker, path, junction, and cleanup checks for both modes.
- [ ] Run the verifier after a real Setup build and record exact results.

### Task 3: User documentation and localized copy

**Files:**
- Modify: `README.md`
- Modify: `build/win32/becoder.iss`

- [ ] Document the two Setup modes, their registry/uninstall behavior, shortcut defaults, and moveability boundary.
- [ ] Keep English and Simplified Chinese mode labels and shortcut warning synchronized.
- [ ] Review the documentation for contradictions with `VISION.md` and current Setup behavior.

### Task 4: Final validation

**Files:**
- Review: all changed files

- [ ] Run the owning boundary test.
- [ ] Run the Setup build and the direct Setup verifier with the final staged package.
- [ ] Run the required client/source checks invalidated by the final changes.
- [ ] Perform a read-only review of mode isolation, registry scope, shortcut defaults, replacement behavior, and documentation accuracy.
