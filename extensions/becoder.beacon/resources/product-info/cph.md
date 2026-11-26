# cph

CPH stores editable input/expected-output test cases associated with a C/C++ source, under its adjacent .cph directory. Samples can be imported from a problem. A case action runs one case; Run All compiles the program once and executes its cases independently. Each action produces one program record. Compile Only produces no run record.

CPH reuses Runner's compiler configuration and separates program stdout/stderr. It supports output comparison and user-provided Python checkers; the latter require Python. The program's exit/timeout and the answer check are independent. A normally exited program can have wrong-answer or checker time-limit; checker failures do not establish student-program failures. Beacon receives the check result, not checker code or configuration. Passing local cases does not establish OJ acceptance.

Check results are available when checking completes. Compilation failure leaves the planned inputs unexecuted and without checks; an execution record can also lack a check if the checking stage fails. A missing check does not mean passed or that CPH lacks answer checking. Run summaries count actual executions, unexecuted inputs and recorded check outcomes separately.
