# BeCoder Runner

BeCoder Runner is the built-in C and C++ Run surface for BeCoder.

It provides two editor actions:

- **Run** compiles the active source with BeCoder's bundled compiler and starts it in the source directory.
- **Run With Input** uses an ordinary same-directory file named exactly `input` as standard input.

Both actions display program stdout and stderr through ConPTY. Run With Input
captures `input` before compilation and supplies those bytes through a separate
stdin pipe, without terminal echo, closing the pipe at EOF. Its Windows input
helper is compiled during application packaging and ships ready to run; it is
never compiled on first launch. Executables are still published beside their
source files and use the existing completion/cancellation cleanup policy.
Both actions use the packaged native helper to initialize UTF-8 console input
and output before starting the program. Run keeps console stdin for interactive
input and `getch()`. Runner uses the bundled ConPTY host so UTF-8 console reads
also work on Windows 10; native PowerShell settings are unaffected.
Executable cleanup is independent of temporary build-directory cleanup. Cleanup
failures identify the retained artifact; BeCoder Runner Trace records the failing
stage and available filesystem error code. Cancellation still preserves the exe.

Concurrent Run requests are rejected immediately and are never queued or replayed.
The final `Executable Program Removed` message is published in the same synchronous
completion step that releases Runner, after applicable evidence and activity cleanup.

The BC panel is a BeCoder-owned pseudoterminal. It is not PowerShell and does not execute arbitrary shell commands. Its accepted command set is `run <source>`, `run <source> -WithInput`, `clear`, and `help`.

The bundled compiler, child environment, command parser, process cancellation, and command history are private to BeCoder Runner. Native PowerShell remains a separate terminal with the user's normal system environment.

This extension is derived from C/C++ Compile Run by Daniel Pinto and remains distributed under GPL-3.0. See [LICENSE](LICENSE).
