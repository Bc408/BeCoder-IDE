# CPH local tests

CPH associates local test cases with one C/C++ source file. Test data includes input and expected output. Import to CPH in the embedded browser and the CPH button on a statement page import problem samples; users can also edit and add cases. Associations and test configuration are saved in the .cph directory beside the source file.

The CPH sidebar shows the associated source and test cases. Ctrl+Alt+D focuses the panel; Ctrl+Alt+B runs tests. Each case has its own run action; Run All executes multiple cases for the program. One Run All action shares a single compilation, then executes each input independently. Compile Only is a separate action and does not execute tests.

CPH reuses Runner's bundled C/C++ compiler and compiler settings, rather than legacy CPH compiler-argument settings. Program stdout and stderr are displayed separately. Checking includes existing output comparisons and user-provided Python special-judge scripts. Python is used only for the checker and requires an available local Python environment; the student C/C++ program still uses the bundled compiler.

The process outcome describes the student program's completion, exit, timeout and similar states; check describes answer checking. A normal program exit and a checker timeout can occur together. A checker error does not establish a student-process error. Recorded check results do not include the checker implementation. Run All can contain multiple inputs; one single-case action and one Run All action each produce one program-run record.

Passing all local samples establishes only those cases and checks, not online OJ acceptance. CPH can import more problem sources than the five OJs with full OJ Connect support.
