# BeCoder Product Contracts

These documents define current product behavior by ownership area. They are normative for their domain and supersede conflicting historical archive text.

Read order for a task:

1. repository-root `AGENTS.md`;
2. repository-root `BECODER_HANDOFF.md`;
3. repository-root `BECODER_PHILOSOPHY.md`;
4. repository-root `BECODER_CURRENT.md`;
5. every contract related to the task;
6. archive records only when historical evidence is needed.

Contracts:

- `runner.md`: BC panel, process state, output, cancellation, and executable lifecycle.
- `native-powershell.md`: system-terminal ownership and isolation.
- `cpp-visual-system.md`: immediate coloring, One Monokai, and bounded semantic refinement.
- `clangd.md`: retained code intelligence and Google formatting.
- `gcc-diagnostics.md`: editor error authority and background compiler coordination.
- `extension-governance.md`: Open VSX, local VSIX, protected identities, and blacklists.
- `setup-distribution.md`: Setup-only, directory identity, toolchains, and zero-system-integration boundary.
- `workspace-and-user-data.md`: project assets, system VS Code isolation, Explorer visibility, and native Profiles boundary.
- `product-removal-boundary.md`: AI/Debug/GDB/SCM removal and generic infrastructure retention.

Each contract records current intent. Stage labels, commit hashes, test counts, and candidate paths belong in `BECODER_CURRENT.md` or `docs/archive/`.
