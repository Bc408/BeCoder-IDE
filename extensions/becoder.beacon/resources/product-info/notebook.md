# notebook

Notebook is an independent .bcnb learning document with C/C++, Markdown and input cells. An input runs the nearest preceding C/C++ cell. Run All/Selection fixes the code and input associations when clicked, compiles each program once, and runs its inputs in separate processes. A failed input does not stop the others; a compile failure skips that program's inputs; explicit cancellation stops the batch.

Every cell has a 1-based position in the whole notebook, including Markdown and inputs. Recorded codeCellNumber/inputCellNumber describe positions at execution time; later reordering does not update past records. Input names can repeat. Content reads include numbered cell text, not execution results.

readCurrentCode reads the whole content of each currently visible BeCoder notebook at call time, including unsaved edits and untitled documents. All Markdown, C/C++ and input cells retain their whole-notebook positions; each C/C++ code cell has its own codeHash. Multiple visible views of one document return one copy; distinct documents and distinct cells remain separate even when their text matches. Background tabs are excluded. Execution results remain in run records, separate from live content.

Execution uses Runner and workspace trust, merges stdout/stderr, and gives each input a 2-second runtime limit and 256 KiB output limit. A reached limit stops execution. Each input retains its latest result in the user's document. A saved notebook runs in its own directory.

Notebook executes without automatic answer checking. A completed input is a process outcome, not a correctness verdict; compilation failure leaves its associated inputs unexecuted.

The editor's linked-notebook action creates or opens a .bcnb under .notebook in the editor root, following the source's relative path and complete filename. Initial creation copies code once; later edits and moves are independent. Users can also create/save notebooks freely. Beacon currently cannot write or run them. Notebook is not Jupyter/ipynb/Python execution.
