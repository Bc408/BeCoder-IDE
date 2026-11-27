# runner

Runner compiles and runs C/C++ with bundled GCC. The editor run action or F6 runs the program in the source directory.

Runner explicitly saves unsaved changes in the target source document before compilation, even when editor auto-save is off. If saving fails, the run does not proceed. Compilation uses a captured copy of the main source file, and the run record describes that captured version. Later editor changes do not alter the recorded execution.

Run With Input (Shift+F6) captures the bytes of a file named input, without an extension, beside the source and pipes them to stdin; stdin closes at the end. Interactive Run supports terminal input and getch(). Terminal echoes do not reconstruct reliable stdin.

Runner executes without automatic answer checking. Normal completion describes the process, not answer correctness. Inputs left unstarted after compilation failure or cancellation have not executed.

Local compilation uses the selected language standard and O2, defines DEBUG and enables Wall diagnostics. C++ additionally includes bits/stdc++.h and BeCoder's bits/debugger.h. The debugger header supplies debug(x) and dout helpers that write to stderr. These local additions are not automatically included in source submitted to an OJ. The owner-provided submission snippet is:

```cpp
#ifndef DEBUG
#define debug
#endif
```

The lower-left gear menu's Generate gch Cache action (生成 gch 缓存) creates an optional C++ precompiled-header cache for the current compiler settings. It can reduce compilation work; it does not improve algorithm complexity or program runtime. A missing or incompatible cache falls back to ordinary header compilation. BeCoder remains open during generation; the cache can be generated again after C++ settings change.

Runner and Notebook merge program stdout/stderr; CPH keeps them separate. Compile diagnostics are separate from program output. A merged record does not separate program streams. Run durations are executor-specific elapsed measurements, not pure CPU time, a timing breakdown or an OJ measurement. Runner/CPH include execution and teardown; normal Notebook runs use the helper's student-process elapsed time. The native UI displays compilation time separately.

Ctrl+C cancels Runner. Busy requests are rejected, not queued. BC run <source> and run <source> -WithInput use this same Runner; general shell commands belong to the separate native terminal.
