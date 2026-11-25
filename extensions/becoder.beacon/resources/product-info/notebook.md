# BeCoder Notebook

Notebook is a standalone .bcnb learning document, independent of Beacon, model setup and .beaconWork. The home page, new-file list and Create: New BeCoder Notebook command create an unsaved notebook. Users edit it directly and choose where to save it. Existing .bcnb and .bcnb-backup documents also open independently.

Cells support C, C++, Markdown and separate input blocks. An input block's run action executes the nearest preceding C/C++ block, capturing the latest code and input, including unsaved edits. Program blocks do not share state or concatenate. Execution neither saves the whole notebook nor modifies the original C/C++ source file.

Run All and Run Selection fix the code and input associations for that batch. Each code block is compiled once per batch; each input runs in a separate process. Failure of one input does not stop the others. A compilation failure skips that block's inputs and continues with other programs. Explicit cancellation stops the whole batch; closing the notebook cancels it. Code-block indices count only C/C++ blocks, starting at 1; historical indices describe the position at execution time.

Execution reuses Runner's compilation API and requires an available Runner and workspace trust. A saved notebook uses its own directory as the program working directory; an unsaved notebook uses an open folder determined at execution time. stdout and stderr are merged. Each program execution has a 2-second limit and retains up to 256 KiB of output; each input keeps its own latest result.

The C/C++ editor's upper-right area offers a linked-notebook action. The .bcnb is under .notebook in the editor root, following the source's relative path and complete filename. Initial creation copies the current code; thereafter source and notebook are independent. Renaming, moving or deleting the source does not alter the notebook. Notebook is not a Jupyter, ipynb or Python execution environment. Beacon's current model tools cannot create or rewrite notebooks; users can still edit and run them independently.
