# BeCoder Documentation Rules

## Purpose

Keep one owner for each kind of project truth so a new agent does not reconstruct current behavior from duplicated or historical prose.

## Authority and Ownership

| Information | Single owner |
| --- | --- |
| Stable product identity and decision philosophy | `BECODER_PHILOSOPHY.md` |
| Active branch, stage, validation, candidate, blockers, and next action | `BECODER_CURRENT.md` |
| Domain behavior and ownership | `docs/contracts/*.md` |
| Repository workflow and authorization | `AGENTS.md` |
| Detailed AI execution procedures and conditional review guidance | `.agents/skills/develop-becoder/` |
| Human authorization, acceptance, and AI-collaboration guidance | `docs/project-owner/*.md` |
| New-conversation reading and authority order | `BECODER_HANDOFF.md` |
| Accepted historical evidence | `docs/archive/*.md` |
| Public product, contribution, and security guidance | README, CONTRIBUTING, and SECURITY documents when completed |

Do not duplicate a full current contract into the handoff, current-state document, skill, README, or archive.

Documents under `docs/project-owner/` are written for people. Keep them easy to discover from the public README, but do not add them to agent orientation, the mandatory handoff reading order, the contract index, or normal AI context. They guide authorization and acceptance decisions; they do not define product behavior or current status.

## Status Vocabulary

- **Planned**: accepted requirement, implementation not started.
- **In progress**: implementation or document work started, delivery incomplete.
- **Source validated**: implementation and relevant source checks pass.
- **Built**: staged application, package verification, Setup build, and direct Setup verification pass.
- **User accepted**: project owner completed required GUI/runtime acceptance.
- **Archived**: accepted result has a permanent historical record.

Only `BECODER_CURRENT.md` owns the active status. Archive files record the status at their checkpoint.

## Update Rules

- Change philosophy only for an explicitly approved long-term product decision.
- Change current state whenever branch, stage, validation, candidate, blocker, next action, or authorization changes.
- Change a contract whenever accepted current domain behavior changes.
- Add an archive record only after project-owner acceptance.
- Preserve superseded historical facts; add a superseding note rather than rewriting history.
- Keep old package paths, sizes, hashes, and test counts in archives, not current contracts.
- Keep project-specific acceptance goals out of the reusable workflow skill.
- Keep product contracts out of the workflow skill; require the skill to read them.
- Keep reusable AI execution detail in the workflow skill or its conditional references rather than duplicating it across entry documents.
- Keep human prompting, authorization, and acceptance guidance under `docs/project-owner/` rather than in the agent's mandatory context.
- Keep command experiments, failed invocation transcripts, and validation trial logs out of philosophy, current state, product contracts, and archives. Record only durable rules or the final evidence required by the owning document.

## Review Checklist

1. Every required authority file exists.
2. `BECODER_HANDOFF.md` links the mandatory reading order.
3. `docs/contracts/README.md` lists every current contract.
4. `docs/archive/README.md` lists every checkpoint archive.
5. The former monolithic handoff is clearly marked historical.
6. Exactly one active stage is identified in `BECODER_CURRENT.md`.
7. No archive is presented as a current release candidate.
8. No build is described as project-owner runtime acceptance.
9. Planned product work is not described as delivered.
10. README, contribution, security, Issue, PR, and agent entry documents do not route users to upstream product support as if it were BeCoder support.

Run the read-only structural check after documentation architecture changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\develop-becoder\scripts\validate-project-docs.ps1
```

The script checks structure and obvious status drift. It does not replace human or independent-agent review of meaning.
