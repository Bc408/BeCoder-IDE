# Obtaining and associating problems

The embedded browser opens OJ problem pages and supports website login and browsing. The main action of its OJ Connect split button is Get Problem; the adjacent menu also offers Import to CPH.

Get Problem parses a supported problem page, creates or opens its source file in an OJ-specific subdirectory of the editor workspace, and opens a separate statement page. The statement includes the title, body, input/output descriptions, samples and limits available from the OJ. This action does not initialize CPH automatically. Existing source code and unsaved edits are preserved.

Import to CPH imports local sample tests through the problem parser and associates them with a source file. Supported five-OJ problems use the same OJ directory and naming convention and reuse the same source file. Other problem sources retain CPH's own import support. The CPH icon on a statement page can also associate its structured samples with that page's source file. Replacing existing samples requires confirmation.

The five OJ Connect integrations are Luogu, Codeforces, AtCoder, Nowcoder ACM and public Lanqiao practice. CPH's broader import support does not extend OJ Connect statement or submission support. Creating a source file requires a usable open editor workspace. With a supported C/C++ source file focused, Ctrl+Alt+P opens its statement; identification depends on the OJ-specific filename and path format.

Statement retrieval, sample import and the user's problem-viewing record are distinct objects. Recent problem records contain only problem identity (OJ and problem ID), associated code path and actual retrieval time; they do not store statement text. The statement and live code are independent. A file association does not prove that a run or submission used the current draft.
