# BeCoder Handoff Entry

This file is the navigation entry for a new BeCoder conversation. It intentionally does not duplicate the complete product philosophy, live state, contracts, or archive.

## 1. Mandatory Reading Order

Before analyzing a new stage or changing the project, read these files completely in order:

1. `AGENTS.md`
2. `BECODER_PHILOSOPHY.md`
3. `BECODER_CURRENT.md`
4. `docs/contracts/README.md`
5. every contract related to the requested work
6. `docs/archive/README.md` and specific archive records only when historical evidence is needed

Do not begin from `docs/archive/stage4-development-record.md`. It is a historical snapshot of the former monolithic handoff, not a current source of truth.

## 2. Authority Order

When documents conflict, use this authority order:

1. the project owner's latest explicit decision;
2. `BECODER_PHILOSOPHY.md` for stable product reasoning;
3. `BECODER_CURRENT.md` for current branch, stage, validation, blockers, and next action;
4. the relevant current document under `docs/contracts/` for domain behavior;
5. `AGENTS.md` for repository workflow and authorization gates;
6. archive records as historical evidence only.

Do not silently choose an archive statement over a current contract. If a current document is internally inconsistent, stop before implementation, show the conflict, and ask the project owner to resolve it.

## 3. Required Understanding Proof

Before proposing or starting implementation for a new stage or nontrivial task, report:

```text
Product understanding:
Relevant ownership boundaries:
Current repository and stage facts:
Requested change and its owner:
Explicitly protected or out-of-scope behavior:
Validation and project-owner acceptance boundary:
```

The report must be based on the files above and current repository inspection. A generic statement that the files were read is not sufficient. Direct implementation authorization does not waive this understanding proof.

## 4. Current State

`BECODER_CURRENT.md` is the single owner of the active branch, baseline, stage, worktree summary, validation evidence, release candidate, blockers, next action, acceptance, and Git authorization. Read it completely and verify drift-prone facts against the repository before acting. Do not copy a dynamic status summary into this file.

## 5. Implementation Authorization

A request to inspect, explain, review, diagnose, plan, or refine requirements does not authorize source changes.

Implementation starts only after the project owner explicitly approves the plan or directly requests the change. Build, cleanup, commit, push, PR, release, system-environment mutation, and GUI automation each require the scope or authorization described in `AGENTS.md` and `BECODER_CURRENT.md`.

## 6. Completion Boundary

Keep these states distinct:

- **Planned**: accepted requirement, implementation not started.
- **In progress**: source or document work started, delivery incomplete.
- **Source validated**: implementation and relevant source checks pass.
- **Built**: staged application, package verification, Setup build, and direct Setup verification pass.
- **User accepted**: project owner completes required GUI/runtime acceptance.
- **Archived**: accepted result is recorded in current state and archive.

Source presence is not product delivery. Build success is not GUI/runtime acceptance. User acceptance is required before archive. Explicit authorization is required before commit or push.

## 7. Documentation Maintenance

- Keep stable reasoning only in `BECODER_PHILOSOPHY.md`.
- Keep live branch, stage, tests, candidates, blockers, and next actions only in `BECODER_CURRENT.md`.
- Keep current domain behavior in `docs/contracts/`.
- Keep historical checkpoints and old evidence in `docs/archive/`.
- Follow `docs/DOCUMENTATION_RULES.md` when changing documentation ownership or status.
- Update this entry only when reading order, authority, or the compact handoff summary changes.
- Do not copy detailed requirements back into this file.

The former monolithic handoff is preserved at `docs/archive/stage4-development-record.md` so no historical evidence was discarded during this restructuring.
