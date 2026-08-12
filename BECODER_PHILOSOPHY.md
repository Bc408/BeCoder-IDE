# BeCoder Project Philosophy

This document is the stable product foundation for BeCoder. Every agent, contributor, and reviewer must understand it before interpreting requirements or changing the product. It describes what BeCoder is and how product decisions are made. It does not track active stages, commits, test counts, or release candidates.

## 1. Product Identity

BeCoder is a self-contained Windows editor for OI, ICPC, and everyday C/C++ competitive-programming work. Its source is derived from Code - OSS, but BeCoder owns its product behavior, defaults, distribution boundary, documentation, and user experience.

BeCoder is not intended to become a general-purpose IDE. It uses the mature editor and Workbench foundation where useful, then deliberately narrows the product around a fast, familiar, predictable contest workflow.

The target audience includes beginning competitive programmers. A fresh installation must be useful without requiring users to install a compiler, edit environment variables, understand language-server configuration, or complete an onboarding wizard.

## 2. Highest Principle

> In BeCoder, only the native terminal actively accommodates the user’s computer runtime environment. All other core functions should isolate system configurations as much as possible, using only the paths, configurations, and resources prepared by BeCoder itself. BeCoder should be all set after installing BeCoderSetup-x64.exe, with the first launch already in the best default state prepared for user to use; users can configure it themselves, but the product does not proactively require users to complete configuration first.

This produces four permanent principles:

1. **Independent**: core behavior must not depend on system VS Code, a system compiler, or user environment configuration.
2. **Self-contained**: program files, toolchains, settings, extensions, caches, and history belong to the current BeCoder directory.
3. **Ready by default**: the first useful state is the default state.
4. **User assets are protected**: project files and project configuration are never disposable implementation details.

## 3. Ownership Before Implementation

Every design must first identify who owns the environment, data, process, and visible result.

| Area | Authority |
| --- | --- |
| Native PowerShell | User system environment and arbitrary commands |
| BC Runner | BeCoder-owned compile/run state machine |
| Compile and run toolchain | BeCoder bundled GCC |
| Editor errors | BeCoder bundled GCC |
| Code intelligence | BeCoder bundled clangd |
| Immediate C/C++ coloring | Built-in TextMate/Better C++ Syntax grammar |
| Semantic refinement | Bundled clangd and BeCoder One Monokai |
| Settings, extensions, caches, history | Current BeCoder installation directory |
| Workspace `.vscode` and project configuration | User project |
| System VS Code data | Outside BeCoder's authority |

An implementation that crosses these boundaries is wrong even if its visible result appears convenient.

## 4. Familiar Experience, Strict Authority

BeCoder prefers familiar interaction over novel presentation. Familiarity does not imply shared authority.

Native PowerShell is the real system terminal. It receives the user's PATH, profiles, aliases, scripts, compilers, and arbitrary commands. BeCoder does not inject its bundled compiler into that environment.

The BC panel may look and edit like PowerShell, but it is not a shell. It accepts a closed BeCoder command grammar and directly owns its compiler and program processes. It never embeds PowerShell, CMD, a user profile, shell pipelines, scripts, or environment mutation.

The desired experience is:

- familiar rather than decorative;
- clean rather than empty;
- immediate rather than queued;
- explicit rather than stateful in surprising ways;
- restrained rather than feature-heavy;
- ready by default rather than configuration-first.

## 5. Immediate Response and No Hidden Queue

Core operations use one active request. If the owner is busy, a new request is rejected immediately. Requests are not queued and an old request is not retained to run later.

Cancellation must retire the active work completely before reuse. The next operation begins from a predictable state. This principle applies to Runner, GCC diagnostics, and other expensive language-service work.

## 6. Show a Complete Baseline First

Opening a source file must immediately produce complete readable coloring. Expensive semantic analysis may improve the result later, but it must not own first paint or repeatedly recolor the document.

The product uses immediate TextMate/Better C++ Syntax coloring followed by one bounded standard clangd semantic refinement. One Monokai owns the accepted semantic colors. Custom semantic-token persistence, restore, delta reconstruction, and repeated refresh pipelines are contrary to this design.

The same principle applies more broadly: a stable simple result is preferable to a delayed, partially visible, or repeatedly changing result.

## 7. Narrow Tools, Clear Responsibilities

clangd and GCC are complementary rather than competing authorities.

clangd owns code intelligence, one bounded semantic refinement, explicit Google-style formatting, and optional inlay-hint data. BeCoder owns the inlay-hint switch through `becoder.inlayHints.enabled`, which is off by default. clangd does not own visible diagnostics, warning presentation, inactive regions, broad code actions, or a general indexing product.

Bundled GCC owns visible syntax, preprocessing, and type errors. Runner owns real compilation, warnings, linking, execution, and program output. Background diagnostics and explicit Run are separate processes and must not share cancellation or terminal state.

## 8. Protect Projects, Isolate Products

System VS Code settings, extensions, caches, locale state, clangd configuration, and user data are outside BeCoder. BeCoder must neither read nor modify them.

Workspace `.vscode`, `.clangd`, `.clang-format`, `.git`, `.gitignore`, `.gitattributes`, source files, and input files belong to the user project. A removed BeCoder feature does not grant permission to delete or rewrite the project files that once served it.

BeCoder may ignore a project asset for a specific feature while still preserving the asset for the user, another extension, or another editor.

## 9. Beginner-Friendly Means Understandable

Reducing setup cost does not mean hiding every technical fact. Beginning programmers benefit from seeing what compilation produces and from receiving direct, truthful feedback.

BeCoder therefore favors visible generated executables by default, a discoverable exact `input` file, clear compiler errors, and reversible user-invoked hiding. It avoids ineffective hints, unexplained badges, and decorative warnings that do not represent an actionable problem.

## 10. Remove Product Capabilities, Not Keywords

A component is removed because it provides a product capability that BeCoder rejects, not because its source contains a word such as `ai`, `chat`, `agent`, `debug`, or `attach`.

Removal decisions must follow actual registrations, consumers, services, APIs, commands, settings, build entries, and packaged resources. Generic Workbench infrastructure remains when it has an ordinary non-target consumer, even if a removed feature once called it.

BeCoder removes its own AI, Chat, Agent, language-model, MCP, Debug, GDB, and Source Control product paths while retaining ordinary Authentication, Browser View, Markdown/Mermaid, HTML conversion, Quick Access, Tasks, Diff, terminal, editor, and extension infrastructure.

The objective is a zero product-dependency graph, not a zero keyword count or maximum deletion count.

## 11. Extension Governance

Open VSX is BeCoder's only product-configured online extension registry. Local VSIX installation remains available. BeCoder does not proxy, mirror, fall back to, or expose Microsoft Marketplace.

Protected built-in extensions are BeCoder product components, not replaceable gallery dependencies. Blacklisted extensions remain unavailable through every normal installation, update, enablement, and local-VSIX path.

User-installed extensions remain third-party content under their own licenses and trust boundaries.

## 12. Directory Product, Not System Integration

BeCoder's Windows Setup places one complete BeCoder directory at a user-selected location. The installed directory remains movable, including to a removable drive. Setup creates no Windows integration by default. It may create one current-user desktop shortcut only when the user explicitly selects that unchecked option; the installer warns against selecting it for removable-storage installations.

BeCoder does not need registry state, an uninstaller, Start-menu entries, file associations, PATH changes, App Paths, protocols, services, background tasks, or startup entries. Closing BeCoder and deleting its directory is the complete uninstall model; an explicitly created desktop shortcut remains a separate user-owned link that can be deleted directly.

Reinstalling the same authenticated directory is a complete replacement. Any data-preservation mechanism must be explicit and user-invoked rather than hidden installer behavior. 

## 13. Truthful Artifact Lifecycle

Generated executables are reproducible contest artifacts, not durable user data. Runner may replace and clean only artifacts owned by the current request.

Every workspace executable deletion outside normal overwrite preparation must occur while the BC terminal can truthfully report it. Cleanup failure is reported as failure and leaves the file. Cancellation or terminal closure must not cause an invisible later deletion.

The governing rule is not "delete as much as possible". It is "delete only owned artifacts, at a valid time, with truthful observable state."

## 14. Decision Rules for Agents

Before proposing or changing BeCoder, an agent must:

1. distinguish current product requirements from historical records and future plans;
2. identify ownership of environment, data, process, and UI;
3. inspect actual registrations, consumers, build entries, and package paths;
4. preserve generic infrastructure with ordinary consumers;
5. avoid treating implemented source as accepted product delivery;
6. avoid treating a successful build as GUI/runtime acceptance;
7. avoid designing speculative compatibility for an unapproved future;
8. protect system VS Code, user environment, and project assets;
9. follow the current product contract when it supersedes an archive;
10. ask before making an assumption that materially changes product behavior.

## 15. Compact Definition

BeCoder is a self-contained, strongly isolated, ready-by-default competitive-programming editor. It uses Code - OSS as a mature editor foundation while deliberately narrowing the product around bundled GCC, bundled clangd, a dedicated Runner, protected project assets, and a familiar, fast, clean, predictable C/C++ workflow.
