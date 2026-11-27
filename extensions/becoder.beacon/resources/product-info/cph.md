# cph

CPH stores test-case definitions in a .cph directory beside the associated source file. For <directory>/<filename>, the metadata path is <directory>/.cph/.<filename>_<path-hash>.prob. The filename includes the source extension. The hash is derived from the source path, not its code contents; srcPath inside the metadata identifies the associated source.

These files contain the saved test inputs and expected outputs. Historical run records contain the code, inputs and results captured for their executions. The workingDirectory in a run record belongs to that execution and is separate from the saved test-case directory. Samples can be imported from a problem. Editing or saving cases does not execute them.

A case action runs one case. Run All compiles the program once and executes its cases independently. Each action produces one program record; Compile Only produces none. CPH reuses Runner's compiler configuration and records program stdout and stderr separately.

CPH explicitly saves the associated source document before compilation, even when editor auto-save is off. If saving fails, the action does not proceed. Compilation uses a captured copy of the main source file; all test cases in that action use the resulting program. The run record describes that captured version and the test data used for that action.

CPH compares output and supports user-provided Python checkers, which require Python. Student-process outcomes and answer checks are independent. A normally exited program can receive wrong-answer or a checker time-limit. Beacon's run records contain the check result, not checker code or configuration. Passing local cases does not establish OJ acceptance.

Checks are available when checking completes. Compilation failure leaves inputs unexecuted; a failed checking stage can leave no check. Missing check data is not a passed result. Run summaries distinguish compilation, executed and unexecuted inputs, and recorded checks.
