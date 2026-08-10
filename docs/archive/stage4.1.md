# Stage 4.1 clangd and Formatting Archive

Status: **Archived and project-owner accepted on 2026-08-07.**

- Reduced bundled clangd to approved code intelligence and explicit formatting.
- Removed clangd diagnostics, inlay hints, inactive regions, code-action surfaces, indexing UI, configuration UI, downloads, and external executable replacement.
- Stopped generating, reading, hiding, migrating, rewriting, or deleting workspace `.clangd`.
- Added Google fallback formatting through clangd's embedded ClangFormat without shipping `clang-format.exe`.
- Allowed only a physical workspace-contained `.clang-format` override.
- Stage 4.3 later added only the standard semantic-token provider for bounded visual refinement.
- Backup branch: `origin/stage4.1`.

Detailed validation and historical source ownership are preserved in `stage4-development-record.md`.
