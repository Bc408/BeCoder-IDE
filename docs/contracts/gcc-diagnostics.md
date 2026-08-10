# Bundled GCC Editor Diagnostics Contract

## Authority

Bundled GCC is the sole authority for visible C/C++ syntax, preprocessing, and type errors in the editor.

```text
latest in-memory document
  -> BeCoder-private source mirror
  -> bundled gcc/g++ -fsyntax-only
  -> structured GCC JSON
  -> error/fatal error filter
  -> Problems and native red markers
```

## Compiler Policy

- Use bundled `gcc` with C17 and bundled `g++` with C++20.
- Use `-fsyntax-only`, `-O2`, explicit language, `-DDEBUG`, UTF-8 input/output charsets, structured JSON, no diagnostic color, same-directory `-iquote`, and private-to-source path mapping.
- `-O2` remains required by the bundled PCH.
- Never resolve a compiler through shell, PATH, registry, workspace setting, or download.
- Scrub compiler-affecting environment variables.
- Keep request mirrors and temporary roots under BeCoder-private storage, not the project.

## Visible Result

- Publish only structured `error` and `fatal error` records as errors.
- Do not publish GCC warnings to Problems, markers, badges, or counters.
- Attach notes only as related information to a published error.
- Use native marker services for red squiggles, Problems, file/folder counts, and overview-ruler markers.
- Do not force-open Problems or create a terminal.
- Warning-only content is error-clean.

## Coordination

- Use a short debounce and one global active compiler process.
- The latest eligible document replaces pending work; there is no FIFO queue or retained history.
- A replacement request cannot start until the canceled process has actually closed.
- Preserve last accepted markers during debounce and compilation.
- Atomically replace markers only with a valid matching latest result.
- Canceled, stale, malformed, timed-out, overflowed, or failed requests do not clear accepted markers.
- Run may cancel lower-priority diagnostics, but the processes and cancellation state remain separate.

## Mapping and Project Protection

- Diagnose the latest in-memory text of saved file-backed C/C++ source documents.
- Preserve same-directory quoted includes.
- Map only the private mirror back to the original document.
- Keep real included-header paths intact.
- Do not map disk byte columns against a dirty open header buffer.
- Clear owned markers when a document closes or becomes ineligible.

## Source Ownership

- `extensions/becoder.gcc-diagnostics`
- toolchain readiness reference in `extensions/becoder.setup`
- packaged compiler-location reference in Runner compiler ownership

## Acceptance Boundary

Cover valid C17 and C++20, concepts, `bits/stdc++.h`, `debugger.h`, missing includes, undeclared names, type and syntax errors, relative includes, UTF-8 columns, notes, warning filtering, stale cancellation, process failure, timeout, output limits, header lifecycle, and package compiler ownership. Runner warning output is outside this contract.
