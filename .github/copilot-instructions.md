# BeCoder Coding Agent Instructions

Read repository-root `AGENTS.md`, then `BECODER_HANDOFF.md`, `BECODER_PHILOSOPHY.md`, `BECODER_CURRENT.md`, `docs/contracts/README.md`, and every contract related to the task. `BECODER_PHILOSOPHY.md` owns stable product reasoning, `BECODER_CURRENT.md` owns live stage and validation facts, current contracts own domain behavior, and `AGENTS.md` owns repository workflow and authorization gates.

Do not infer BeCoder behavior from historical Visual Studio Code, Code - OSS, ShortestPath, or Portable product documentation. Preserve upstream architecture and required legal provenance where they remain relevant, but do not restore product capabilities that BeCoder has removed.

Before implementation, provide the understanding proof required by `AGENTS.md`. Before tests, follow the `Validation Command Preflight` in `AGENTS.md`, then check TypeScript compilation through the active build watch task when available or the owning typecheck/Gulp task. Never use `npm run compile` as TypeScript validation. Follow the Windows Setup-only build and handoff boundary in `AGENTS.md` and `BECODER_CURRENT.md`.
