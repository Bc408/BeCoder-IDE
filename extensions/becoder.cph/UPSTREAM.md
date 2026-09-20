# BeCoder CPH provenance

This component uses a current-window import command and is bundled with BeCoder.
Source tests and packaged owner acceptance are separate evidence.

- Competitive Programming Helper: https://github.com/agrawal-d/cph
- Pinned source: `187590eae3379bad8caaf7bd930d2987557a7966`
- License: GPL-3.0-or-later; see the repository root LICENSE.
- `src/judge.ts` adapts upstream's line comparison, removes output logging,
  and separates execution failures from answer comparison.

Parser source: Competitive Companion,
https://github.com/jmerle/competitive-companion,
`df90fabb52e8f566ea3382405e22d246af5d6a69`, MIT.

The original six HTML problem parser files under `companion/src/parsers/problem`
are copied unchanged from that commit. The five additional parsers listed below
are adapted from the same commit. `companion/LICENSE` preserves its MIT license.
The data-only builder, base parser and DOM utilities are adapted locally to
remove browser-extension messaging, Java template naming and unrelated Markdown
dependencies. Sample normalization preserves whitespace instead of applying
upstream's trimEnd. Additional-resource requests currently fail explicitly;
PDF/UVa support is pending, not claimed. `companion/entry.ts` dispatches parsers
against the current page and returns JSON only. The esbuild development dependency
bundles this at build time; it is not installed or run by end users.

No HTTP receiver, external Companion integration, automatic submission,
telemetry or remote messaging is part of this component.

`webview/CaseView.tsx` derives from CPH's sample card at the pinned commit.
Checker logs and output-diff rendering are ported from upstream;
the leaked global message listener is removed. BeCoder supplies the shell, CSP,
localization, lifecycle and separate-stream execution adapter. Sample edits are
saved automatically or when running. Passed cases containing stderr stay expanded.
No upstream submission, feedback, cat, telemetry or remote-message code is copied.

Visual baseline: owner-supplied CPH VSIX 2026.9.1789578855. Restored its app.css
rules for sample cards, fields, buttons, pass badge and fixed footer; removed
styles for excluded branches. Codicon font and selected CSS mappings come from
that same VSIX (font license in licenses/codicons.txt). Source path is tooltip-only;
footer exposes run/compile/stop/delete/settings actions. Default debug/compiler
behavior is frozen by owner acceptance and is not part of this visual change.

## Settings and checker port (2026-09-19)

The activity-bar SVG is upstream's `static/panel-view-icon.svg`, retained under
the existing local filename. The extension-list PNG icon is also copied from
upstream's `icon.png`. `importPreferences.ts` derives upstream filename
and template-variable behavior; `diffOutput.ts` and `webview/DiffView.tsx` port
the original token comparison and rendering, with a bounded large-output fallback.
Checker logs preserve upstream's expandable presentation.

The owner explicitly permits external Python for custom checkers. This exception
does not add Python solution languages or change the bundled GCC solution path.
The protocol is `python script input-file actual-output-file`; expected output
is ignored and exit code zero passes. The configured Python command uses the
user environment, with Windows `python3` mapped to `python` like upstream.
No Python installation, system setting changes or external HTTP listener occurs.
Temporary input/output files remain request-owned; timeout, cancellation, output
limits and process-tree retirement use the CPH lifecycle adapter.

Ported settings cover language selection (C/C++), template path/substitution,
filename rules and short site names, automatic view display, context retention,
timeout, successful compiler stderr visibility, runtime stderr policy, output
differences and the external Python command. Runtime stderr is ignored by default
to retain the accepted debug workflow. Source templates never overwrite existing
files; repeated imports retain the checker path.

Excluded settings follow existing boundaries: arbitrary save directories (the
selected workspace owns import), non-C/C++ solution languages and language-menu
choices, external C/C++ compiler commands/output switches, ONLINE_JUDGE injection,
submission compiler choices, remote service/live counts and first-run promotion.
C/C++ Args use upstream whitespace splitting, with explicit rejection of arguments
that override toolchain, output ownership or macro policy. Default compiler arguments
and debug behavior remain unchanged. No claim of unrestricted upstream parity is made.

## Entry-point alignment (2026-09-20)

The owner-supplied VSIX is also the behavioral reference for JSON testcase import,
the `Ctrl+Alt+B` run and `Ctrl+Alt+D` judge-focus shortcuts, local problems created
from an existing C/C++ source, and linked online problem titles. Submission commands,
buttons and shortcuts remain excluded. Local-problem creation writes only the CPH
metadata and never changes the existing source. JSON imports append string input/output
pairs and remain subject to BeCoder's metadata size and 100-testcase safety limits.

## Native C/C++ interaction alignment (2026-09-20)

Source initialization now follows CPH's default-language template branch. Template
variables include the final source path and the title after the problem-index
setting; the first cursor placeholder is removed and selected in the editor.
Missing templates report an error and leave an empty new source. Existing sources
are reused without template initialization, including filename collisions from a
different URL; their metadata is replaced while source bytes remain intact.
Same-URL replacement confirmation and workspace path/lease protections remain.

Judge events distinguish compilation, the active testcase and checker execution.
Each result is delivered before the next sample, and single reruns and automatic
saves retain other results. The run shortcut requests the current webview draft.
Automatic display is separate from editor association; unrelated files clear the
idle, saved judge. Empty judges offer local problem creation. New samples scroll
into view and opening checker controls focuses their path field.

Browser parsing, browser import transport, supported judges, compiler flags and
the existing separate-stream debug behavior are unchanged by this alignment.
The project owner accepted the built native-interaction change before the OJ expansion.

## OJ expansion (2026-09-20)

Added CSES, HDOJ, AcWing, LibreOJ and DMOJ problem parsers from the same pinned
Competitive Companion source. Changes: MIT attribution headers, explicit rejection
of incomplete sample pairs, and HDOJ Java/Others limits use the Others value for
BeCoder's C/C++ solutions (memory K converted to MiB with 1024).
The DMOJ parser retains upstream's explicit domain allowlist, including VNOI.
No arbitrary DMOJ/Hydro host discovery is added.

CSES and HDOJ have anonymous live-page fixtures. AcWing returned a login page,
DMOJ returned HTTP 403, and LibreOJ returned a JavaScript application shell.
Those three parsers have upstream DOM-contract fixtures, not live acceptance.
See test/fixtures/OJ-SOURCES.md for capture URLs and verification boundaries.

The transport, user sessions, resource-request prohibition, non-interactive
stdin/stdout import policy, C/C++ judging and compiler settings are unchanged.
CodeChef/PDF/resource-dependent parsers are not claimed as supported.
tsconfig.companion.json checks the parser dependency graph without emitting code;
strictNullChecks is disabled for the upstream DOM parser contracts, whose required
selectors throw on missing/login pages rather than producing local problems.
