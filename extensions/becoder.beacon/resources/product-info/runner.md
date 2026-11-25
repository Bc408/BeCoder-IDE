# Runner and the BC panel

Runner compiles and executes .c, .cc, .cpp and .cxx files with BeCoder's bundled GCC. The C/C++ editor's upper-right run action or F6 starts Run. It saves that source file before execution, runs in the source directory, and supports interactive terminal input and getch().

Run With Input starts from its editor action or Shift+F6. Its input must be an ordinary file named exactly input, with no extension, in the source file's directory. The file's raw bytes are captured before compilation and piped independently into the program. Input is not echoed; stdin closes when the bytes are exhausted. This differs from interactive Run.

stdout and stderr are merged through ConPTY. A bundled helper prepares the UTF-8 console. Ctrl+C cancels a running program. New run requests are rejected immediately while busy; there is no queue or deferred replay. Normal completion removes the adjacent executable; cancellation may leave it behind. Cleanup failures are reported.

BC is a dedicated pseudoterminal supporting run <source>, run <source> -WithInput, clear and help. System commands use the separate native PowerShell terminal. Runner's compiler setup does not change the system PATH or PowerShell profile. CPH and Notebook reuse Runner's compiler settings and execution API.

Interactive terminal echoes do not reliably reconstruct complete stdin. Run records preserve the available input, compiled source, output and exit or stop outcome; input that cannot be obtained reliably is unknown. A successful local run does not establish an accepted OJ verdict.
