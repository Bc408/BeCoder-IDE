# BeCoder Validation Protocol

Read this reference only when planning or executing source, package, Setup, or documentation validation. It defines execution discipline, not product behavior or current stage status.

## 1. Separate Preflight From Formal Validation

Preflight proves that a planned check can reach its intended target. Formal validation evaluates that target.

A preflight must establish:

- the command comes from `AGENTS.md`, an applicable `package.json` script, or a tool entry point that exists;
- required Node modules, configuration files, and input files exist;
- the command is valid for the active Windows shell;
- file enumeration excludes deleted paths, directories, and missing files from content checks;
- the expected working directory, timeout, and side effects are known;
- the check does not clean, rewrite, build, launch, or mutate anything outside its authorization.

Do not treat a successful preflight as a passing source check.

## 2. Discover Commands From Evidence

Use this precedence:

1. an exact command required by `AGENTS.md` or the current authorized plan;
2. a repository-owned `package.json` script;
3. a tool shim under `node_modules\.bin`;
4. an internal dependency path only when the repository itself uses and pins it.

Do not infer that a familiar package exposes a familiar path or module name. Check the filesystem and package metadata first. A missing TypeScript entry point or YAML module is an orchestration finding, not a TypeScript or YAML result.

## 3. Enumerate Inputs Deliberately

Classify changed paths before selecting validation inputs:

- added, modified, renamed, copied, and untracked files may contain current content;
- deleted files have no content to parse;
- directories are not parser inputs;
- generated and dependency paths remain outside direct editing and changed-content checks unless the owning command explicitly validates them.

Before passing a path to a parser or linter, confirm it is an existing ordinary file. Keep deletion-policy checks separate from content checks.

## 4. Treat PowerShell As a Programming Language

Avoid complex ad hoc one-line PowerShell. Check nontrivial commands for:

- variable interpolation followed by `:` or another identifier character;
- nested quoting and here-string boundaries;
- pipeline exit-code propagation;
- UTF-8 input and output;
- spaces, non-ASCII characters, drive letters, and long Windows paths;
- accidental wildcard expansion;
- commands that start a target before preflight is complete.

Prefer explicit format expressions such as `('{0}: {1}' -f $file, $message)` over ambiguous interpolation. Shell parsing success is not target validation success.

## 5. Inspect Local Conventions Before Validation

Before adding or reviewing a file, inspect at least two nearby files in the same ownership area. Confirm:

- the applicable copyright and license header;
- Node import conventions such as `node:path` versus `path`;
- tabs, quotes, names, and test structure;
- localization and disposable-registration patterns;
- layering and module-boundary expectations.

This local-pattern pass occurs before lint so obvious repository-convention mistakes do not consume a full validation round.

## 6. Freeze a Validation Plan

Before formal execution, record for every check:

```text
Check:
Exact command:
Working directory:
Command source:
Inputs:
Required tools/modules:
Expected mutations:
Timeout:
Failure stops:
```

Do not invent replacement commands during formal execution. If the plan is invalid, report the orchestration failure under the active stop rule and return to preflight only after authorization permits continuation.

## 7. Maintain a Validation Ledger

Record results as they occur:

```text
Check:
Preflight result:
Formal exit code:
Observed output:
Failure class:
Checks invalidated by later edits:
Required rerun:
```

Use these failure classes:

- **orchestration**: missing command, missing dependency, invalid shell, wrong working directory, or invalid input enumeration;
- **source**: compiler, type checker, linter, or source test reports a real finding;
- **package**: staged package or Setup content violates its verifier;
- **runtime**: the built product behaves incorrectly during authorized runtime validation;
- **external**: network, disk, permissions, or another environment outside the validated target prevents completion.

Never convert an orchestration failure into a source diagnosis. Never describe an unstarted or interrupted check as passed.

## 8. Rerun by Impact, Close With the Full Matrix

After a fix, rerun the smallest owning check first. Mark earlier evidence stale when the fix can affect it.

Examples:

- a header-only fix invalidates lint for that file;
- an import change invalidates lint and the owning type check;
- process or filesystem logic invalidates focused tests, type checks, boundary tests, and later package/runtime checks;
- build or packaging changes invalidate package and Setup evidence.

Once focused reruns pass, execute the required final validation matrix against the final worktree before independent review or build authorization.

## 9. Preserve the Stop Rule

When a formal validator starts and returns nonzero or times out, stop the remaining formal sequence and report:

- the exact command and working directory;
- the original output;
- whether the target actually started;
- the failure class;
- which checks remain unexecuted;
- why build or acceptance readiness cannot yet be claimed.

Do not retry automatically, silently change tools, continue to packaging, or reuse older evidence as current proof.

## 10. Lessons From Repeated Failures

- A nonexistent TypeScript internal path says nothing about TypeScript correctness.
- A deleted JSON file says nothing about JSON validity.
- Invalid PowerShell interpolation says nothing about the script being inspected.
- A missing YAML module says nothing about workflow YAML syntax.
- A race-sensitive test based on timestamps may test filesystem clock behavior rather than the intended ownership invariant.

The process goal is not to avoid every failure. It is to make each failure occur at the correct layer, carry truthful evidence, and cost only one validation round.
