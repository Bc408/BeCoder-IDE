---
name: develop-becoder
description: Repository-local workflow for planning, implementing, reviewing, validating, building, accepting, archiving, and handing off BeCoder work. Use whenever working in the BeCoder repository, including continuing a stage, inspecting requirements, changing code or documentation, running checks, building or packaging, reviewing a change, preparing project-owner acceptance, archiving a feature, or transferring work to a new conversation.
---

# Develop BeCoder

Use the repository's authoritative documents to reconstruct product context before acting. Keep this skill procedural: never substitute its text for current BeCoder product contracts.

## Orient

1. Locate the repository root containing `AGENTS.md`.
2. Read `AGENTS.md` completely.
3. Read `BECODER_HANDOFF.md` completely.
4. Read `BECODER_PHILOSOPHY.md` completely.
5. Read `BECODER_CURRENT.md` completely.
6. Read `docs/contracts/README.md` and every contract related to the request.
7. Read archive records only when historical evidence is needed.
8. Inspect the current branch, baseline, worktree, and relevant source before relying on a recorded snapshot.

After changing the documentation architecture, run `scripts/validate-project-docs.ps1` from this skill and perform a semantic read-only review. The script checks structure only.

Do not infer current behavior from archive text, an old package, a reference project, or this skill. Use the authority order in `BECODER_HANDOFF.md`.

## Prove Understanding

Before proposing or starting implementation for a new stage or nontrivial task, report:

- product understanding;
- relevant ownership boundaries;
- current repository and stage facts;
- requested change and its owner;
- explicitly protected or out-of-scope behavior;
- validation and project-owner acceptance boundary.

Base every item on current documents and repository evidence. If current sources of truth conflict, stop before implementation and present the conflict to the project owner.

Direct implementation authorization does not waive this understanding proof.

## Classify Authorization

Treat requests according to their actual scope:

- **Explain, inspect, review, diagnose, or plan**: perform read-only work and report evidence. Do not implement.
- **Change or build**: implement only the requested scope and its direct verification.
- **Build only**: do not clean, rewrite dependencies, alter environment, launch GUI acceptance, commit, or push.
- **Archive or back up**: require explicit project-owner acceptance and explicit Git authorization.

A roadmap, stage name, or request for a proposal is not implementation authorization. The project owner's latest explicit decision overrides an older plan.

## Plan Before Editing

For substantial work, define:

1. user-visible behavior;
2. owning modules and data/process authorities;
3. required retained behavior;
4. explicit forbidden behavior;
5. cancellation, concurrency, failure, restart, and cleanup boundaries;
6. localization, build, package, and license impact;
7. focused tests and broader regression gates;
8. project-owner runtime acceptance;
9. out-of-scope follow-up.

Wait for plan approval unless the user directly requested implementation.

## Inspect by Dependency Graph

Read beyond the visible entry point. Follow UI and command registration, services and state machines, process/IPC ownership, extension contributions, settings and context keys, localization, build entries, package manifests, tests, and verifiers.

Classify removal by actual consumers and product paths. Do not delete by keyword or because a generic component was once called by a removed feature. Preserve user project assets and unrelated worktree changes.

## Implement Narrowly

- Follow existing repository patterns and focused ownership boundaries.
- Keep unrelated refactors and metadata churn out of scope.
- Preserve user changes in a dirty worktree.
- Do not edit generated output or dependency directories directly.
- Do not modify system VS Code, user environment variables, external references, or project assets.
- Keep visible English and Simplified-Chinese surfaces synchronized unless a current contract deliberately fixes protocol text in one language.
- Maintain bundled-component provenance, licenses, notices, and corresponding-source records when affected.
- Update `BECODER_CURRENT.md` and current contracts when implementation changes live truth; do not rewrite archives to hide historical facts.
- Before adding a file, inspect at least two nearby files in the same ownership area for the local copyright header, import style, naming, and test conventions.
- When changing path ownership, installation, publication, deletion, replacement, recovery, or race-sensitive filesystem behavior, read [references/filesystem-safety-review.md](references/filesystem-safety-review.md) before editing and again before review.

## Preflight Validation

Before formal validation, read [references/validation-protocol.md](references/validation-protocol.md) and complete its command-discovery and preflight phases.

- Resolve commands from repository-owned scripts and real tool entry points rather than memory or guessed dependency paths.
- Confirm required modules, configuration files, and every content input exist.
- Distinguish deleted paths from content-bearing changed files.
- Check nontrivial PowerShell parsing, interpolation, quoting, encoding, and Windows paths before using the command as a formal check.
- Freeze the planned command list and maintain a validation ledger throughout execution.

An invocation, dependency, shell, or input-enumeration failure is an orchestration failure, not evidence about source correctness. Report it accurately and follow the active stop rule; do not silently substitute another command or count the failed invocation as a completed check.

## Validate in Layers

Run the smallest owning checks first and broaden in proportion to risk. Follow exact commands, timeouts, and stop rules in `AGENTS.md` and `BECODER_CURRENT.md`.

Typical order:

1. focused module tests and type checks;
2. extension production bundle or owning build check;
3. boundary, manifest, localization, and package-policy tests;
4. client typecheck;
5. bundled OI extension compilation;
6. relevant layering, lint, precommit, parser, and diff checks;
7. staged Windows application build;
8. direct package verification;
9. Setup build;
10. direct Setup verification.

Stop on a nonzero exit or external timeout. Do not automatically retry or continue to packaging. Never use `npm run compile` as TypeScript validation.

After a source fix, rerun the smallest checks invalidated by that fix. Before declaring source validation complete, rerun the final required matrix so its evidence corresponds to the final worktree rather than an earlier intermediate state.

## Run the Review Loop

Do not start a sub-agent or review thread unless the project owner explicitly requests one. By default, the primary agent performs a separate read-only review pass covering requirement completeness, logic, edge cases, ordinary-feature regressions, code quality, tests, localization, build/package boundaries, and actual runtime evidence.

When the project owner explicitly requests an independent reviewer, the reviewer must not modify files. Fix concrete findings, then ask the same reviewer to verify again. Continue until no blocking finding remains or the blocker is explicitly documented.

Do not describe a primary-agent review as independent agent approval, and do not describe an earlier focused review as approval of later closeout changes.

## Separate Build From Acceptance

Keep these facts distinct:

- source validation does not prove package contents;
- a staged build does not prove Setup behavior;
- Setup verification does not prove GUI/runtime behavior;
- an old artifact does not validate newer source;
- agent-run checks do not replace project-owner acceptance unless explicitly requested.

After authorized source, package, and Setup verification, stop and hand the artifact and exact check results to the project owner. Do not launch or claim runtime acceptance without authorization.

After the specifically requested build succeeds, stop by default. Do not automatically run another verifier, build Setup, launch the product, review, update documentation, inspect additional state, clean files, or perform Git operations unless the same project-owner request explicitly authorizes those follow-up actions.

## Archive and Back Up

Archive only after project-owner acceptance.

1. Update `BECODER_CURRENT.md` with final status, evidence, remaining risks, and next action.
2. Add or update the appropriate `docs/archive/` record without changing historical truth.
3. Confirm current contracts reflect the accepted behavior.
4. Re-read the documentation for contradictions.
5. Commit and push only after explicit authorization.

For a plain cloud backup, create only the scoped commit and requested branch push. Do not add a PR, release, or unrelated publishing workflow.

## Hand Off

Before transferring to a new conversation:

- remove only explicitly authorized, unquestionably generated junk;
- preserve dependencies, release assets, user changes, and current artifacts unless told otherwise;
- ensure `BECODER_CURRENT.md` contains the exact branch, baseline, worktree state, completed checks, pending checks, blockers, and next action;
- ensure `BECODER_HANDOFF.md` still points to the correct reading order;
- distinguish implementation evidence, current candidate evidence, and project-owner acceptance;
- report any unresolved contradiction rather than asking the next agent to guess.
