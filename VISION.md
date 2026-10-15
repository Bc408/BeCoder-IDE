# BeCoder Vision

BeCoder is a self-contained Windows environment for OI, ICPC and everyday C/C++ competitive programming. It combines a prepared editor and toolchain with Beacon, an optional AI companion that helps users understand problems, code and results.

This document describes the product direction. It is not a frozen architecture, a stage checklist or a release-status record. Specific features and implementation choices can evolve with user feedback and the project owner's decisions.

The confirmed Beacon and BeCoder NoteBook design baseline is maintained in [docs/beacon](docs/beacon/README.md). Read its PRD, architecture, Notebook design and research agenda for work in those areas. Root and extension READMEs describe the current implementation, which does not yet implement all of that baseline. The project owner's latest direct decisions take precedence; desktop drafts preserve historical discussion rather than a competing set of current rules.

## Purpose

Make the path from reading a problem to writing, testing and understanding a solution easier. A beginner should be able to install BeCoder and run a first C/C++ program without separately configuring a compiler or language server. An experienced contestant should find a familiar, responsive environment with understandable input, output and errors.

BeCoder builds on Code - OSS while maintaining its own defaults, bundled resources, application data and distribution. It serves students, OI/ICPC participants and users who need a portable environment independent of a system Visual Studio Code installation.

## The Experience We Aim For

- **Ready to use:** editing, completion, diagnostics, compilation and sample testing work with the bundled environment.
- **Focused and familiar:** mature editor workflows remain useful; new features should reduce effort rather than add setup and competing controls.
- **Clear and responsive:** output appears promptly, ongoing work can be stopped, and failures explain what happened.
- **Respectful of user work:** source files, project settings and repositories belong to the user. Product maintenance should preserve them.
- **Self-contained environment and user-owned learning assets:** application settings, extensions and caches stay with the BeCoder installation. The confirmed design keeps persistent Beacon learning assets in the selected workspace's `.beaconWork`, and associated notebooks in the editor folder's separate `.notebook`. Optional services have explicit dependencies. Current data behavior remains documented in the READMEs until the design is implemented.

## Beacon's Role

Beacon is a programming tutor and long-term learning companion. Algorithm tutoring is a permanent core capability: naming, expression or role customization cannot remove it or the product-wide boundary against helping with explicit cheating. It can explain concepts and code, discuss algorithms and complexity, diagnose mistakes, and provide complete solutions during normal learning. Personality and language-style details remain open.

Model access is configured by the user, through a cloud service or a local model. Beacon being unavailable should not interrupt editing, compilation, running or sample testing.

The confirmed design permits authorized context reading and, on an explicit user request, limited writing of learning assets such as notebooks, handouts and diagrams. Beacon also manages its own conversations and workspace memory. It does not create or modify the student's C/C++ source files, autonomously execute or stop programs, log into accounts or submit solutions. Tutorial code in answers or notebooks is distinct from editing the student's source file. Known credential and private files remain excluded, sources and model limitations should be understandable, and internet access should be controllable.

Each window independently selects and remembers a Beacon workspace; recent workspace choices are shared. Selecting a workspace prepares and checks its `.beaconWork` asset directory. Without a usable workspace only `blackout` is available: explicit user materials and authorized content of editor pages currently open in that window, with no free local-file access, workspace-record or memory retrieval, learning-asset writing or local conversation persistence. All three modes may read currently open page content, including unsaved edits, without gaining permission to read its backing file, related files or hidden records. A valid selected workspace permits all three modes; manual `blackout` retains the selection but suspends workspace asset use. `spot` confines automatic file access and learning-asset writing to that root; `flood` extends allowed file locations while retaining the same asset kinds and persistent workspace ownership. A remembered but unavailable root remains selected and visible, with only `blackout` available until access is restored.

History and memory belong to the selected Beacon workspace. Windows using the same workspace share those assets, but a conversation can be open in only one window; another window only receives a notice. Busy windows refuse workspace switches; idle switches show the target history without moving conversations or automatically creating one. Temporary conversations do not automatically become saved conversations. Once a usable workspace is selected, BeCoder records helpful execution evidence as users operate Runner, CPH and Notebook inside that root, without waiting for a chat request or model availability. Runner and CPH retain their separate recent queues for eligible source files; Notebook execution evidence is separate and does not occupy those queues or change each input cell's single recent result. Conversation deletion leaves derived memory and independent learning assets intact; conversation archives retain their data. Conversations remain isolated, including in `flood`.

Workspace input drafts include text and captured attachments, persist with their conversation, and reuse the same single-window ownership. First input may create a draft conversation hidden from history; the first send promotes it to a regular chat. Returning home preserves the detail draft, while New chat on home clears the home draft. Blackout drafts stay in memory. The workspace's default restart target follows the last closed window's page and input state, including an explicitly empty input; an occupied automatic restore target silently falls back to home. These latest confirmed rules and the proposed lifecycle connections are described in [the workspace UI and draft design](docs/beacon/workspace-ui-draft-design.md), not yet implementation evidence.

The next technical work should connect the conversation experience with the user's actual code, samples and observed results, using sufficient authorized context and distinguishing execution snapshots from current unsaved edits. Behavior evidence is prepared and persisted before requests; Beacon explains the current situation and authorized reading entrances, letting the model read what it needs. Currently open pages, including personal OJ submission and verdict pages, may be read in all modes with the user's presumed awareness; credential filtering and conversation isolation still apply. Further network queries for personal information require explicit user permission, beyond just contest or OJ scenarios. This rule is guided by the model prompt; it does not introduce a host-side permission ledger, approval gate or query-intent classifier. User permission and limits may be remembered in `teach tips`, but model-authored memory cannot create or expand authorization. The approved memory direction is lightweight workspace memory: the main model simply appends to `teach tips` and `student status`; users review and directly edit the text to judge memory quality. User-triggered `dream` consolidates status with readable archives. BeCoder NoteBook is an independent document capability; Beacon-assisted problem notes are one entry point. Its four complete user flows, four-platform OJ evidence and simple model-written tips additions are confirmed first-version requirements, not generic ideas to postpone. Other version scope and implementation details remain open in the formal documents.

## How the Parts Fit Together

| Part | Main responsibility |
| --- | --- |
| Editor and bundled language services | Code editing, immediate coloring, GCC diagnostics and clangd code intelligence |
| Runner and BC panel | BeCoder's compile-and-run workflow, program input/output and cancellation |
| Native terminal | User-directed system commands and the user's environment |
| Integrated browser and PDF viewer | Reading problem material; the browser also supports explicit problem import |
| CPH | Imported samples and local sample judging, sharing Runner's compilation policy |
| Beacon | Conversations, model settings, authorized context, explanations, workspace memory and explicitly requested learning-asset assistance |
| BeCoder NoteBook | Independent editable learning documents and user-initiated input-cell execution of the preceding C/C++ program; path-based source association with independent content |
| Selected Beacon workspace | `.beaconWork` assets and valid workspace ownership under the confirmed design, independent of editor folder selection |
| Editor folder's `.notebook` | Associated `.bcnb` documents, separate from `.beaconWork`; no automatic source rename/move/content synchronization |
| Installation data | Product settings, extensions and caches; current implementation history remains described in the READMEs |
| User workspace and online judge | The user's files, account, submissions and final judge results |

These responsibilities help guide changes without prescribing a particular module layout. Prefer extending an existing owner and a small interface when that is enough. Use shared logic where behavior is actually shared, rather than building a framework for possible future features.

## Distribution and Scope

The core C/C++ workflow uses bundled GCC and clangd. Native terminal commands, optional Python checkers and model services retain their explicit external dependencies. BeCoder is distributed as a complete Windows application directory that can be moved as a unit; its setup and data behavior should stay easy to understand.

Open VSX and local VSIX installation provide extension choices. Bundled components and third-party extensions retain their own licenses and responsibilities. Product-specific features do not need to recreate every upstream IDE capability; general-purpose MCP, debugging, Git UI and remote development are outside the current product focus.

## Choosing the Next Step

Start from a concrete user problem, inspect the current implementation, and prefer a complete, simple improvement. Keep current behavior and future ideas distinct. Learn from Code - OSS, Cherry Studio, Captain Who and Codex where their solutions fit, without inheriting their entire product architecture.

Successful source checks, a built application and a useful experience are different milestones. Product decisions should consider actual behavior and user feedback as well as engineering evidence.
