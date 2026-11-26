# runner

Runner compiles and runs C/C++ with bundled GCC. The editor run action or F6 saves the source and runs it in its directory. Run With Input (Shift+F6) captures the bytes of a file named input, without an extension, beside the source and pipes them to stdin; stdin closes at the end. Interactive Run supports terminal input and getch(). Terminal echoes do not reconstruct reliable stdin.

Runner executes without automatic answer checking. Normal process completion describes execution, not answer correctness; planned inputs left unstarted after a compilation failure or cancellation have not executed.

Local compilation uses the selected language standard and O2, defines DEBUG and enables Wall diagnostics. C++ additionally includes bits/stdc++.h and BeCoder's bits/debugger.h. The debugger header supplies debug(x) and dout helpers that write to stderr. These local additions are not automatically included in source submitted to an OJ. The owner-provided submission snippet is:

```cpp
#ifndef DEBUG
#define debug
#endif
```


The lower-left gear menu's Generate gch Cache action (生成 gch 缓存) creates an optional C++ precompiled-header cache for the current compiler settings. It can reduce C++ compilation work; it does not improve the submitted algorithm or program runtime. A missing or incompatible cache falls back to ordinary header compilation. Keep BeCoder open during generation; after changing C++ settings the user can generate it again.

Runner and Notebook merge program stdout/stderr; CPH keeps them separate. Compile diagnostics are distinct from program output. Run durations describe the respective executor's measured elapsed time, not pure CPU time or an OJ measurement: Runner/CPH include their execution and teardown boundary; normal Notebook runs use the helper's student-process elapsed time. Compilation duration is separate in the native UI.

Ctrl+C cancels Runner. Busy requests are rejected, not queued. BC run <source> and run <source> -WithInput use this same Runner; general shell commands belong to the separate native terminal.
