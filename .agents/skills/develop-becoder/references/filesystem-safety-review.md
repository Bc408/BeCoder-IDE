# Filesystem Safety Review

Read this reference only when changing installation paths, user-data roots, executable publication, deletion, replacement, import/export, recovery, junctions, symbolic links, reparse points, or race-sensitive filesystem behavior.

## 1. Establish Ownership Before Use

- Bind BeCoder-owned roots before processing external command-line or environment overrides.
- Do not allow an untrusted argument to redirect product-owned data, toolchains, recovery state, or cleanup.
- Identify which process owns each path and when that ownership begins and ends.
- Treat user projects, system VS Code data, and another BeCoder installation as external protected assets.

## 2. Validate Before Loading or Launching

- Validate transaction journals, helper paths, configuration, and authenticated roots before loading or starting a recovery helper.
- Do not make validation depend on an untrusted helper that has not itself passed the trust boundary.
- Reject malformed, oversized, linked, escaping, or foreign state before ordinary services open it.

## 3. Distinguish Names From File Identity

A path string is not durable ownership evidence.

- Another process may replace a file between compile, hash, rename, launch, or cleanup.
- Recheck staging and destination identity at every publication boundary.
- Use content hashes, file identity, authenticated markers, or another explicit invariant when correctness depends on the same object remaining present.
- Never perform a compensating delete by pathname after ownership may have transferred to another file.

## 4. Review Publication And Cleanup As One State Machine

For each transition, define:

```text
Owned input:
Expected destination state:
Verification before mutation:
Mutation:
Verification after mutation:
Failure cleanup owner:
Observable result:
Cancellation result:
```

Compilation failure, publication failure, launch failure, runtime failure, cancellation, terminal closure, and shutdown may require different cleanup behavior. Do not share one broad catch-and-delete path without proving ownership in every branch.

## 5. Canonicalize Through Existing Ancestors

Lexical normalization alone cannot detect filesystem redirection.

- Inspect the nearest existing ancestor when the final target does not yet exist.
- Reject symbolic links, junctions, mount points, and other reparse points that cross the authorized boundary.
- Apply path-length, character-set, drive, and ownership rules to the canonical destination.
- Recheck after directory creation when an attacker or concurrent process could change ancestry.

## 6. Make Race Tests Deterministic

Do not prove a race-sensitive invariant using only modification times or short delays.

- Filesystem timestamp resolution and rename behavior differ across platforms and volumes.
- Use explicit barriers, injected hooks, controlled replacement points, file identity, hashes, or deterministic mock ownership.
- Test replacement before publication, replacement after rename, cancellation during each phase, cleanup failure, and immediate rerun.
- Ensure tests can distinguish the intended old file, request-owned staging file, published file, and an unrelated replacement.

## 7. Protect Failure Paths

- A failed cleanup must not trigger a second blind deletion.
- Failure reporting must match what was actually removed or preserved.
- Recovery must prefer a blocked startup over opening mixed or partially replaced state.
- Rollback and committed cleanup need explicit ownership and idempotence.
- Retrying after cancellation must begin only after the previous process and ownership state have retired.

## 8. Independent Review Questions

Ask the reviewer:

1. Can an external argument redirect a BeCoder-owned root before it is bound?
2. Can a linked or replaced ancestor bypass a lexical path check?
3. Can a file be replaced between identity verification and mutation?
4. Can a failure path delete a newer unrelated file at the same name?
5. Does recovery validate its state before loading helpers or opening databases?
6. Are cancellation and immediate rerun serialized through actual process retirement?
7. Do tests use deterministic ownership evidence rather than timing assumptions?
8. Does every deletion have one current owner and a truthful observable result?

The objective is not maximum rejection or deletion. It is preserving authority across every filesystem state transition.
