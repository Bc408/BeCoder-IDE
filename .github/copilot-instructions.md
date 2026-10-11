# BeCoder Coding Agent Instructions

Read repository-root `AGENTS.md`, then `VISION.md`, and follow every current product requirement supplied by the project owner. `VISION.md` owns stable product reasoning, and `AGENTS.md` owns repository workflow and authorization gates. Do not assume that deleted historical stage, handoff, or contract documents remain authoritative.

For Beacon and BeCoder NoteBook, continue with [the repository design baseline](../docs/beacon/README.md) and its linked documents. They own confirmed future behavior; root and extension READMEs describe the current implementation. Do not treat a current implementation gap as a reversal of the approved design, or treat a design document as proof of implementation. Desktop copies are historical snapshots.

Do not infer BeCoder behavior from historical Visual Studio Code, Code - OSS, ShortestPath, or portable-product documentation. Preserve upstream architecture and required legal provenance where they remain relevant, but do not restore product capabilities that BeCoder has removed.

Before implementation, provide the understanding proof required by `AGENTS.md`. Before tests, follow the Validation Command Preflight in `AGENTS.md`, then check TypeScript compilation through the active build watch task when available or the owning typecheck/Gulp task. Never use `npm run compile` as TypeScript validation. Follow the Windows Setup-only build and handoff boundary in `AGENTS.md`.
