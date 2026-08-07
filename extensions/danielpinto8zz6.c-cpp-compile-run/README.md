# BeCoder Runner

BeCoder Runner is the built-in C and C++ Run surface for BeCoder.

It provides two editor actions:

- **Run** compiles the active source with BeCoder's bundled compiler and starts it in the source directory.
- **Run With Input** uses an ordinary same-directory file named exactly `input` as standard input.

The BC panel is a BeCoder-owned pseudoterminal. It is not PowerShell and does not execute arbitrary shell commands. Its accepted command set is `run <source>`, `run <source> -WithInput`, `clear`, and `help`.

The bundled compiler, child environment, command parser, process cancellation, and command history are private to BeCoder Runner. Native PowerShell remains a separate terminal with the user's normal system environment.

This extension is derived from C/C++ Compile Run by Daniel Pinto and remains distributed under GPL-3.0. See [LICENSE](LICENSE).
