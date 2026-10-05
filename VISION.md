# BeCoder Vision

BeCoder is a self-contained Windows environment for OI, ICPC and everyday C/C++ competitive programming. It combines a prepared editor and toolchain with Beacon, an optional AI companion that helps users understand problems, code and results.

This document describes the product direction. It is not a frozen architecture, a stage checklist or a release-status record. Specific features and implementation choices can evolve with user feedback and the project owner's decisions.

## Purpose

Make the path from reading a problem to writing, testing and understanding a solution easier. A beginner should be able to install BeCoder and run a first C/C++ program without separately configuring a compiler or language server. An experienced contestant should find a familiar, responsive environment with understandable input, output and errors.

BeCoder builds on Code - OSS while maintaining its own defaults, bundled resources, application data and distribution. It serves students, OI/ICPC participants and users who need a portable environment independent of a system Visual Studio Code installation.

## The Experience We Aim For

- **Ready to use:** editing, completion, diagnostics, compilation and sample testing work with the bundled environment.
- **Focused and familiar:** mature editor workflows remain useful; new features should reduce effort rather than add setup and competing controls.
- **Clear and responsive:** output appears promptly, ongoing work can be stopped, and failures explain what happened.
- **Respectful of user work:** source files, project settings and repositories belong to the user. Product maintenance should preserve them.
- **Self-contained:** application settings, extensions, caches and conversation history stay with the BeCoder installation. Optional services have explicit dependencies.

## Beacon's Role

Beacon is a read-only programming tutor. It can explain concepts and code, discuss algorithms and complexity, help diagnose mistakes, and provide complete solutions when the user asks. The user decides how to use the answer.

Model access is configured by the user, through a cloud service or a local model. Beacon being unavailable should not interrupt editing, compilation, running or sample testing.

Beacon's tools read authorized information; they do not modify project files, execute commands or submit solutions. File permissions distinguish no local access, the open workspace and the computer. Known credential and private files remain excluded. Inputs, sources and model limitations should be understandable, and internet access should be controllable.

The near-term aim is to connect the existing conversation experience with the user's actual problem, code, samples and observed results. Training records, personal preferences and knowledge retrieval may add value later; their scope should be chosen when the preceding experience is useful and their data behavior is clear.

## How the Parts Fit Together

| Part | Main responsibility |
| --- | --- |
| Editor and bundled language services | Code editing, immediate coloring, GCC diagnostics and clangd code intelligence |
| Runner and BC panel | BeCoder's compile-and-run workflow, program input/output and cancellation |
| Native terminal | User-directed system commands and the user's environment |
| Integrated browser and PDF viewer | Reading problem material; the browser also supports explicit problem import |
| CPH | Imported samples and local sample judging, sharing Runner's compilation policy |
| Beacon | Conversations, model settings, authorized read-only context and explanations |
| Installation data | Product settings, extensions, caches and local history |
| User workspace and online judge | The user's files, account, submissions and final judge results |

These responsibilities help guide changes without prescribing a particular module layout. Prefer extending an existing owner and a small interface when that is enough. Use shared logic where behavior is actually shared, rather than building a framework for possible future features.

## Distribution and Scope

The core C/C++ workflow uses bundled GCC and clangd. Native terminal commands, optional Python checkers and model services retain their explicit external dependencies. BeCoder is distributed as a complete Windows application directory that can be moved as a unit; its setup and data behavior should stay easy to understand.

Open VSX and local VSIX installation provide extension choices. Bundled components and third-party extensions retain their own licenses and responsibilities. Product-specific features do not need to recreate every upstream IDE capability; general-purpose MCP, debugging, Git UI and remote development are outside the current product focus.

## Choosing the Next Step

Start from a concrete user problem, inspect the current implementation, and prefer a complete, simple improvement. Keep current behavior and future ideas distinct. Learn from Code - OSS, Cherry Studio, Captain Who and Codex where their solutions fit, without inheriting their entire product architecture.

Successful source checks, a built application and a useful experience are different milestones. Product decisions should consider actual behavior and user feedback as well as engineering evidence.
