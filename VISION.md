# BeCoder Vision

BeCoder is a self-contained Windows editor for OI, ICPC, and everyday C/C++ competitive-programming work. This document defines the stable product vision behind BeCoder: who it serves, what experience it promises, which responsibilities it owns, and how product decisions should be made.

It does not track versions, development stages, implementation status, test results, or release candidates.

## Mission

BeCoder exists to give competitive programmers a focused environment in which they can install one application and begin coding immediately.

The editor, compiler, code intelligence, diagnostics, and run environment should already be prepared. Users should not need to install a compiler, edit environment variables, understand language-server configuration, or complete an onboarding wizard before writing and running their first program.

BeCoder is derived from Code - OSS and uses its mature editor and Workbench foundations where they support this mission. BeCoder remains an independent product and owns its behavior, defaults, distribution boundary, documentation, and user experience.

## Who BeCoder Serves

BeCoder is designed for:

- students beginning competitive programming;
- OI and ICPC participants who want a predictable C/C++ workflow;
- programmers who value a focused editor over a general-purpose IDE;
- users who need a portable, self-contained environment that does not depend on an existing Visual Studio Code or compiler installation.

Beginner-friendly does not mean hiding every technical fact. BeCoder should reduce unnecessary setup while keeping compilation, generated artifacts, errors, input, output, and failure states understandable.

## Product Promise

> Install BeCoder, open a C or C++ file, and begin working in a prepared environment. Except for the native terminal and explicitly configured optional Python checkers, BeCoder's core functions should depend on BeCoder-owned paths, configurations, processes, and resources rather than the user's system development environment.

This promise is built on four permanent principles:

1. **Independent**: Core behavior does not depend on system Visual Studio Code, a system compiler, or preconfigured development tools.
2. **Self-contained**: BeCoder's application data, toolchains, settings, extensions, caches, and history belong to the current BeCoder installation.
3. **Ready by default**: The first useful state is the default state. Configuration remains available, but BeCoder does not require configuration before use.
4. **Protect user work**: Source files, input files, workspace configuration, repositories, and other project assets belong to the user and are never disposable implementation details.

## Desired Experience

BeCoder should feel:

- familiar rather than novel for its own sake;
- focused rather than feature-heavy;
- clean rather than empty;
- immediate rather than queued;
- explicit rather than surprisingly stateful;
- predictable rather than dependent on hidden system configuration.

A stable, complete baseline is preferable to a delayed or repeatedly changing result. Opening a source file should immediately provide readable syntax coloring. Bounded semantic analysis may refine that result, but it should not own the first usable presentation.

Core operations use one active request. If an owner is busy, a conflicting request should be rejected rather than silently queued. Cancellation must retire active work before the same owner is reused.

## Clear Ownership

Every feature must identify who owns its environment, data, process, and visible result.

| Area | Product authority |
| --- | --- |
| Native PowerShell | The user's system environment and arbitrary commands |
| BC panel | BeCoder's closed compile-and-run interaction |
| Compile and run toolchain | BeCoder's bundled GCC |
| Beacon conversations and model connection | Built-in Beacon extension |
| Sample tests and local judging | Bundled CPH, using Runner's shared compilation policy |
| Visible editor errors | BeCoder's bundled GCC diagnostics |
| Code intelligence | BeCoder's bundled clangd |
| Immediate C/C++ coloring | Built-in TextMate and Better C++ Syntax grammar |
| Semantic refinement | Bundled clangd and BeCoder One Monokai |
| Settings, extensions, caches, and history | The current BeCoder installation |
| Workspace files and project configuration | The user project |
| System Visual Studio Code data | Outside BeCoder's authority |

An implementation that crosses these boundaries is incorrect even when its visible result appears convenient.

## Focused Tools

BeCoder's tools have narrow, complementary responsibilities.

### Native terminal

Native PowerShell is the real system terminal. It receives the user's PATH, profiles, aliases, scripts, compilers, and arbitrary commands. BeCoder does not inject its bundled compiler into that environment.

### BC panel and Runner

The BC panel may look and edit like a terminal, but it is not a shell. It accepts a closed BeCoder command grammar and directly owns compiler and program processes. It does not embed PowerShell, CMD, user profiles, shell pipelines, scripts, or environment mutation.

Runner owns explicit compilation, warnings, linking, execution, program input, program output, cancellation, and the lifecycle of artifacts produced by the active request.

### CPH and online judges

The integrated browser owns website navigation and the current page used for explicit problem import. Bundled CPH owns imported sample metadata, local sample execution, separate standard output/error presentation and request-private artifacts. Runner remains the authority for C/C++ compilation policy and the private toolchain. Optional custom Python checkers use a user-configured system interpreter; ordinary sample testing requires no external Python installation.

Welcome-page shortcuts are user-configurable navigation entries, not a guarantee of parser support. Online accounts, submission forms, compiler selection and final judge verdicts belong to the website. Users copy their source into the website to submit; BeCoder does not own automatic submission.

### GCC diagnostics

Bundled GCC owns visible syntax, preprocessing, and type errors in the editor. Background diagnostics and explicit Run are separate operations and do not share cancellation or terminal state.

### clangd

Bundled clangd owns code intelligence, one bounded semantic refinement, explicit Google-style formatting, and optional inlay-hint data. BeCoder owns whether inlay hints are shown. clangd does not own visible diagnostics, warning presentation, inactive-region presentation, broad code actions, or a general indexing product.

## Project and Artifact Safety

System Visual Studio Code settings, extensions, caches, locale state, clangd configuration, and user data are outside BeCoder's authority. BeCoder neither reads nor modifies them as part of its core product behavior.

Workspace assets such as `.vscode`, `.clangd`, `.clang-format`, `.git`, `.gitignore`, `.gitattributes`, source files, and input files belong to the user. Removing a BeCoder feature does not grant permission to delete or rewrite project assets previously associated with it.

Generated executables are reproducible contest artifacts, not durable user data. Runner may replace or clean only artifacts owned by the current request. Cleanup outside normal overwrite preparation must remain visible and truthful. A failed cleanup is reported as a failure and leaves the file in place.

The governing rule is not to delete as much as possible. It is to delete only owned artifacts, at a valid time, with an observable result.

## Deliberate Product Scope

BeCoder is not intended to become a general-purpose IDE. Capabilities are included when they support the focused competitive-programming workflow and removed when they create product paths BeCoder does not intend to own.

Beacon is BeCoder's built-in AI companion for competitive programming. It owns its conversation UI, workspace-scoped conversation history and explicitly configured model connection in an isolated extension. Its domain tools and teaching behavior are BeCoder-owned; it does not restore the removed upstream AI/Chat service graph. Model access is optional and uses a user-provided provider credential.

BeCoder does not provide general-purpose MCP, Debug, GDB, Source Control, or remote-development product paths. Generic editor and Workbench infrastructure remains when it has ordinary non-target consumers.

Removal decisions must follow registrations, consumers, services, APIs, commands, settings, build entries, and packaged resources. A component is not removed merely because its source contains a word associated with an excluded capability.

The goal is a zero product-dependency graph for excluded capabilities, not a zero keyword count or maximum deletion count.

## Extension Governance

Open VSX is BeCoder's only product-configured online extension registry. Local VSIX installation remains available. BeCoder does not proxy, mirror, fall back to, or expose Microsoft Marketplace.

Protected built-in extensions are BeCoder product components rather than replaceable gallery dependencies. Blacklisted extensions remain unavailable through normal installation, update, enablement, and local-VSIX paths.

User-installed extensions remain third-party content under their own licenses, behavior, compatibility, and trust boundaries.

## Directory-Based Distribution

BeCoder is distributed as one complete Windows application directory. Its Setup installs that directory at a user-selected location, and the directory can be moved as a unit, including to removable storage.

Setup creates no Windows integration by default. It may create one current-user desktop shortcut only when explicitly selected. BeCoder does not require registry state, an uninstaller, Start-menu entries, file associations, PATH changes, App Paths, protocols, services, background tasks, or startup entries.

Closing BeCoder and deleting its complete directory is the uninstall model. A desktop shortcut explicitly created by the user remains a separate user-owned file.

Reinstalling into the same authenticated BeCoder directory is a complete replacement. Data preservation must be explicit and user-invoked rather than hidden installer behavior.

## Decision Principles

Product and engineering decisions should:

1. begin with the user outcome and the authority that owns it;
2. distinguish stable product requirements from historical implementation records;
3. inspect actual consumers, registrations, processes, package entries, and data paths;
4. preserve mature Code - OSS behavior when it fits BeCoder's purpose;
5. keep BeCoder-specific changes narrow and intentional;
6. protect the user's environment, project files, configuration, and data;
7. prefer complete simple behavior over partial complex behavior;
8. reject hidden queues, invisible cleanup, and ambiguous process ownership;
9. preserve generic infrastructure that still serves ordinary product behavior;
10. treat source implementation, successful builds, package verification, and user acceptance as separate kinds of evidence;
11. avoid speculative compatibility for unapproved capabilities;
12. document unresolved product choices instead of silently guessing.

## Compact Definition

BeCoder is a self-contained, strongly isolated, ready-by-default Windows editor for competitive programming. It builds on Code - OSS while deliberately focusing the product around bundled GCC, bundled clangd, a dedicated Runner, protected user projects, and a familiar, fast, clean, and predictable C/C++ workflow.
