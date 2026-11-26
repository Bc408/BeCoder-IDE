# cph

CPH saves editable test-case definitions in .cph/*.prob beside the associated C/C++ source. Each case has input and expected output; samples can be imported from a problem. Saved definitions describe the configured cases, independently of the captured inputs and results in historical run records. Editing or saving cases does not execute them. Execution working directories contain temporary files and are separate from this saved configuration.

A case action runs one case. Run All compiles the program once and executes its cases independently. Each action produces one program record; Compile Only produces none. CPH reuses Runner's compiler configuration and records program stdout and stderr separately.

CPH compares output and supports user-provided Python checkers, which require Python. Student-process outcomes and answer checks are independent. A normally exited program can receive wrong-answer or a checker time-limit. Beacon's run records contain the check result, not checker code or configuration. Passing local cases does not establish OJ acceptance.

Checks are available when checking completes. Compilation failure leaves inputs unexecuted; a failed checking stage can leave no check. Missing check data is not a passed result. Run summaries distinguish compilation, executed and unexecuted inputs, and recorded checks.
