# BC Runner Contract

## Purpose

BC Runner is BeCoder's dedicated Run and Run With Input surface. It provides a familiar PowerShell-like transcript and editing experience without becoming a shell or accepting the user's system environment.

## Command Grammar

The accepted commands are closed:

- `run <source>`
- `run <source> -WithInput`
- `clear`
- `help`

Buttons and typed commands enter the same parser and state machine. Arbitrary commands, scripts, pipelines, redirection syntax, environment operations, PATH lookup, PowerShell, CMD, and user profiles are rejected.

The prompt has the form `BC D:\c++>`. Windows drive letters are displayed uppercase. The prompt uses terminal-default gray, accepted command names use bright yellow, source arguments use bright white, and `-WithInput` uses the default foreground.

## Request Model

- Keep one active request.
- Reject a new request immediately while compile, execution, or cancellation remains active.
- Do not queue requests or retain a latest pending request.
- Save the focused C/C++ source before Run.
- Resolve only the BeCoder-bundled compiler.
- Spawn compiler and program directly with `shell: false`.
- Use the source directory as program working directory.
- Keep compiler, program, diagnostic worker, clangd, and native PowerShell process state independent.

## Run With Input

Accept only an ordinary file named exactly `input` in the source file's directory. Reject missing input, directories, alternate names, extensions, and files from another directory. Redirect this file to stdin through the same lifecycle as ordinary Run.

## History and Editing

- `Up` and `Down` browse accepted executed BC commands.
- History stores command text only and lives for the current BeCoder process.
- Trashing and reopening the panel clears the transcript but preserves in-process history.
- Restarting BeCoder clears history.
- `Esc` clears or cancels line editing; it does not cancel a running request.
- Rejected illegal or busy commands do not enter history.

## Output Protocol

Use `===== <Message> =====` frames.

- Successful spawn: green `===== Compilation Successful, Running =====`.
- Exit code zero: green `===== Run Complete =====`.
- Nonzero exit: red `===== Runtime Error (exit code N) =====`.
- Verified executable deletion: green `===== Executable Program Removed =====`.

Compiler diagnostics, stdout, stderr, and user input remain original content. Do not translate or rewrite them. BC lifecycle protocol remains English under both product languages.

The four flow failures are exact two-line yellow blocks and must reset color afterward:

```text
===== Unable to Start =====
Old .exe is in use, run cancelled, close it and retry
```

```text
===== Compilation Failed =====
No executable remains, build artifacts removed
```

```text
===== Executable Creation Failed =====
New .exe creation failed, build artifacts removed, no stale executable will run
```

```text
===== Cleanup Failed =====
Could not remove .exe, close the related process and retry
```

## Executable Lifecycle

- Silently remove the current source's old target before compilation as ordinary overwrite preparation.
- If the old target cannot be removed, emit only `Unable to Start` and do not spawn GCC.
- Compile in a private ASCII session directory.
- Publish through request-owned staging beside the target.
- Compilation or publication failure must leave no old or partially published target and no request-owned executable artifacts.
- Do not restore an old executable after failure.
- After normal completion, Runtime Error, or non-cancellation launch failure, remove the newly published target while the owning BC terminal can synchronously verify and report the deletion.
- If required cleanup fails, emit `Cleanup Failed` and preserve the file.
- `Ctrl+C`, panel trash/closure, and BeCoder shutdown preserve an already published target because deletion can no longer be truthfully reported.
- Runner never traverses or deletes another workspace executable, source, input file, or user tool.

There is no executable-retention or cleanup-delay setting.

## Cancellation

Active-command `Ctrl+C` cancels only the Runner compiler/program tree, waits for retirement, completes the terminal command with a nonzero status decoration, and returns directly to the prompt. It emits no synthetic `^C`, cancellation prose, Runtime Error, or executable-removal line.

## Performance

The approximate target from compiler spawn to program spawn is no more than two seconds on the accepted environment. Measure panel readiness, save, compile, process start, runtime, and cleanup separately. Do not weaken isolation or skip required compilation to meet the target.

## Source Ownership

- `extensions/danielpinto8zz6.c-cpp-compile-run/src/bcTerminal.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/compile-run-manager.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/compiler.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerProcess.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerPresentation.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/terminalVisuals.ts`

## Acceptance Boundary

Source tests must cover parser agreement, command history, busy rejection, cancellation retirement, exact input validation, private environment, output framing, terminal closure, all publication and cleanup failures, and protection of unrelated files. Package success does not replace project-owner interaction and transcript acceptance.
