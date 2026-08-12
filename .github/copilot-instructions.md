# BeCoder Coding Agent Instructions

Read repository-root `AGENTS.md`, then `BECODER_PHILOSOPHY.md`, and follow every current product requirement supplied by the project owner. `BECODER_PHILOSOPHY.md` owns stable product reasoning, and `AGENTS.md` owns repository workflow and authorization gates. Do not assume that deleted historical stage, handoff, or contract documents remain authoritative.

Do not infer BeCoder behavior from historical Visual Studio Code, Code - OSS, ShortestPath, or portable-product documentation. Preserve upstream architecture and required legal provenance where they remain relevant, but do not restore product capabilities that BeCoder has removed.

Before implementation, provide the understanding proof required by `AGENTS.md`. Before tests, follow the Validation Command Preflight in `AGENTS.md`, then check TypeScript compilation through the active build watch task when available or the owning typecheck/Gulp task. Never use `npm run compile` as TypeScript validation. Follow the Windows Setup-only build and handoff boundary in `AGENTS.md`.
