# notebook

Notebook is an independent .bcnb learning document with C/C++, Markdown and input cells.

Each input cell uses the nearest preceding C/C++ code cell, ignoring intervening Markdown cells. Multiple inputs can use the same program until another C/C++ code cell appears. Running an input executes that program with the input's text.

Run All or Run Selection captures the selected inputs, their associated code and their positions at the start, including unsaved edits. Each associated code cell is compiled once for that action, and its inputs run in separate processes. Later edits or reordering affect subsequent runs, not the captured execution. A failed input does not stop the others; a compile failure skips that program's inputs; explicit cancellation stops the batch.

Every cell has a 1-based position in the whole notebook, including Markdown and inputs. Recorded codeCellNumber/inputCellNumber are positions at execution time. Later reordering changes current positions, not past records. Names can repeat. Distinct cells remain distinct when their source text matches; codeHash describes the code text, not a cell identity or an execution.

Live content reads include all numbered content cells of currently visible notebooks, including unsaved and untitled content. Multiple views of one document return one copy. Background tabs and execution results are excluded; run records contain captured execution facts.

Execution uses Runner and workspace trust, merges stdout/stderr, and gives each input a 2-second runtime limit and 256 KiB output limit. A reached limit stops execution. Each input retains its latest result in the user's document. A saved notebook runs in its own directory. Notebook has no automatic answer checking; a completed input is a process outcome.

The editor's linked-notebook action creates or opens a .bcnb under .notebook in the editor root, following the source's relative path and complete filename. Initial creation copies code once; later edits and moves are independent. Users can also create/save notebooks freely. Beacon currently cannot write or run them. Notebook is not Jupyter/ipynb/Python execution.
