## CPH native semantics implementation (2026-09-20)

Scope authorized by owner: C/C++ only, upstream missing-template and filename-reuse
semantics, clear unrelated-source association, autoShowJudge controls display only.
Browser/Companion source and transport were not changed. No staged build, Setup,
GUI acceptance, cleanup or Git publication was performed.

Preflight: package scripts, TypeScript configs and compiler, React/esbuild/jsdom,
VSCE, GCC, runner-input.exe and Python exist. Generated test/parser/webview inputs
are produced by the first two steps. Existing ordinary source files were enumerated
explicitly for ESLint. Each command below uses an external 120000ms timeout.
CSS and core Workbench layering are unchanged; stylelint and core layer checks
were not in this focused extension validation matrix.

### prepublish

Exact command (repository root, PowerShell):

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js","--prefix","extensions/becoder.cph","run","vscode:prepublish"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0. Passed.

```text

> cph@0.1.0 vscode:prepublish
> npm run compile && npm run compile-parsers && npm run compile-webview


> cph@0.1.0 compile
> node ../../node_modules/typescript/bin/tsc6 -p ./ && node ../../node_modules/typescript/bin/tsc6 -p tsconfig.webview.json


> cph@0.1.0 compile-parsers
> esbuild companion/entry.ts --bundle --platform=browser --format=iife --global-name=BeCoderCompanion --outfile=dist/problem-parser.js


  dist\problem-parser.js  23.8kb

Done in 45ms

> cph@0.1.0 compile-webview
> esbuild webview/App.tsx --bundle --platform=browser --format=iife --loader:.ttf=file --outfile=dist/judge.js


  dist\judge.js               1.1mb
  dist\codicon-ES367LOO.ttf  74.4kb
  dist\judge.css             12.2kb

Done in 109ms

```

### test-compile

Exact command (repository root, PowerShell):

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/typescript/bin/tsc6","-p","extensions/becoder.cph/tsconfig.test.json"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0. Passed.

```text

```

### tests

Exact command (repository root, PowerShell):

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["--test","extensions/becoder.cph/out-test/test/*.test.js"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0. Passed.

```text
✔ real bundled GCC and pipe helper preserve EOF, stderr, exit125, timeout and cleanup (10353.0803ms)
✔ extension command binds imports to trusted local workspace and disposes registrations (286.3903ms)
✔ judge streams individual results, preserves other results through saves, and forwards shortcut drafts (116.7701ms)
✔ no workspace prompts without writing; picker cancellation does not import (6.0737ms)
✔ multi-root import uses the selected folder, single root needs no picker (115.1783ms)
✔ workspace change during selection rejects import (1.8057ms)
✔ rejects concurrent requests and window disposal cancels pending import (0.9506ms)
✔ upstream naming and template substitutions respect selected preferences (7.5072ms)
✔ template initializes only new source and checker survives edits and repeat import (153.1295ms)
✔ upstream difference tokens and bounded large-output fallback (10.1382ms)
✔ display truncation is explicit and leaves captured output unchanged (1.8946ms)
✔ sample edits persist exact bytes and reopen; stale sessions cannot overwrite (141.5927ms)
✔ single sample run saves source first and cannot choose a different path (67.4236ms)
✔ run owner rejects concurrent edits and cancellation during source-save prevents execution (72.5896ms)
✔ zero samples, malformed edits and duplicate IDs never start the compiler (71.8188ms)
✔ VSCE inventory includes runtime and sources but excludes development dependencies (4311.4605ms)
✔ build and provenance are registered without external Companion reception (8.1238ms)
✔ bundled CF parser returns data without requiring extension APIs or network (139.6881ms)
✔ interactive and file-based CF tasks are rejected by import policy (59.4543ms)
✔ Luogu structured data parsing preserves Unicode and samples (19.7735ms)
✔ unsupported hosts and resource-fetch pages fail without local POST (27.6117ms)
✔ AtCoder Japanese sample sections produce one sample pair (22.4627ms)
✔ Lanqiao DOM parser extracts title, limits and paired samples (18.2028ms)
✔ NowCoder ACM parser extracts independent sample blocks (16.9645ms)
✔ SPOJ parser handles separately labelled sample blocks (25.588ms)
✔ imports samples and discards page-provided local authority (5.7397ms)
✔ preserves sample spaces, intentional blank lines and empty EOF (0.73ms)
✔ allows an empty sample list without manufacturing a passed case (0.4778ms)
✔ rejects unsupported input and test types (3.8538ms)
✔ rejects malformed and oversized data (10.3735ms)
✔ binds the import to the expected URL and rejects local URLs (0.6308ms)
✔ retains CPH line comparison rather than token comparison (0.3893ms)
✔ stderr debug is displayed independently, not judged as a runtime error (0.389ms)
✔ execution failures cannot be hidden by matching stdout (0.4271ms)
✔ creates C++ source and CPH-compatible metadata inside selected workspace (74.0482ms)
✔ creates an upstream-style local problem without changing the existing source (43.0788ms)
✔ same URL preserves source and declined replacement preserves exact metadata (92.4308ms)
✔ different URLs reuse the CPH filename and replace metadata without overwriting source (66.2581ms)
✔ template initialization receives final source and sample IDs, and is skipped for existing files (89.1775ms)
✔ filename reuse rejects linked source files and preserves their target (26.5463ms)
✔ refuses changed metadata after confirmation without overwriting the edit (49.7925ms)
✔ rejects another importer during confirmation and unlocks afterwards (74.1449ms)
✔ aborted confirmation retires the lock and preserves source and samples (58.5161ms)
✔ loads legacy CPH transport-less metadata without importing settings (24.3918ms)
✔ rejects redirected .cph junction without writing outside the workspace (12.0759ms)
✔ does not follow page path separators or Windows device names (0.6053ms)
✔ failed metadata publication preserves original data, removes only owned temporary file and releases lease (101.281ms)
✔ old prototype lock file is not deleted and cannot block new imports (31.7194ms)
✔ checker controls retain upstream path, hidden expected output and expandable logs (322.3799ms)
✔ CPH cards display escaped output, save/add/run/stop messages, and retain edits on failure (708.9915ms)
✔ web problems link to their source, JSON imports append cases, and single runs mark only one card (247.5079ms)
✔ workspace occupancy rejects concurrent acquisition and releases idempotently (14.1554ms)
✔ kernel releases workspace occupancy after owner termination without deleting a file (197.1255ms)
ℹ tests 55
ℹ suites 0
ℹ pass 55
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30852.3466

```

### eslint

Exact command (repository root, PowerShell):

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/eslint/bin/eslint.js","--max-warnings","0","extensions/becoder.cph/src/extension.ts","extensions/becoder.cph/src/importPreferences.ts","extensions/becoder.cph/src/problemStore.ts","extensions/becoder.cph/src/judgeSession.ts","extensions/becoder.cph/src/execution.ts","extensions/becoder.cph/src/judgeView.ts","extensions/becoder.cph/webview/App.tsx","extensions/becoder.cph/webview/CaseView.tsx","extensions/becoder.cph/webview/types.ts","extensions/becoder.cph/test/extension.test.ts","extensions/becoder.cph/test/problemStore.test.ts","extensions/becoder.cph/test/importPreferences.test.ts","extensions/becoder.cph/test/execution.test.ts","extensions/becoder.cph/test/webview.test.ts"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 1. Failure class: source/lint-policy mismatch. Formal ESLint started and failed; stop rule applied. No automatic fix or retry. Final read-only closeout review is not completed.

```text

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\execution.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\extension.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\importPreferences.ts
  7:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\judgeSession.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\judgeView.ts
   6:1  error    incorrect header                       header/header
  14:1  warning  './problemStore' import is duplicated  no-duplicate-imports

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\src\problemStore.ts
    6:1   error    incorrect header                header/header
  232:92  warning  Unsafe usage of ThrowStatement  no-unsafe-finally
  299:93  warning  Unsafe usage of ThrowStatement  no-unsafe-finally
  340:74  warning  Unsafe usage of ThrowStatement  no-unsafe-finally

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\test\execution.test.ts
   6:1  error    incorrect header                                                 header/header
  92:2  warning  'cancellationExecutor' is never reassigned. Use 'const' instead  prefer-const

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\test\extension.test.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\test\importPreferences.test.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\test\problemStore.test.ts
  6:1  error  incorrect header  header/header

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\test\webview.test.ts
    6:1   error    incorrect header                                                                                        header/header
   60:19  warning  Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety  local/code-no-any-casts
  106:17  warning  Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety  local/code-no-any-casts

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\webview\App.tsx
    2:1    error    header should be a block comment                         header/header
  120:25   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  121:18   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  122:80   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  123:23   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  124:48   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  124:99   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  127:48   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  127:70   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  128:39   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  130:19   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  131:20   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  132:24   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  132:153  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  132:173  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  132:231  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  133:24   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  133:169  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  134:30   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  134:46   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  134:71   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  134:92   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  136:37   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  136:134  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  137:26   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  137:140  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  138:23   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  138:172  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  144:19   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  144:46   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  144:83   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  150:24   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  150:44   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  151:19   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  152:43   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  152:68   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  152:82   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  153:23   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  154:19   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  157:19   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  159:22   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  162:36   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  171:38   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  173:43   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  187:43   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  193:47   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  200:50   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  251:51   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  266:46   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  267:48   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  268:45   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  269:51   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  275:54   warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\webview\CaseView.tsx
    2:1   error    header should be a block comment                         header/header
    6:1   warning  'react' import is duplicated                             no-duplicate-imports
  155:28  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  156:32  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  157:37  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  160:49  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  161:50  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  167:49  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  168:50  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  175:41  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  181:45  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  193:45  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  197:32  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  201:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  205:45  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  206:46  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  212:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  216:45  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  217:46  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  223:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  229:41  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  230:42  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  237:36  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  240:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  249:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  263:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  272:39  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  279:40  warning  Expected '!==' and instead saw '!='                      eqeqeq
  280:40  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  283:43  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  292:43  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  294:57  warning  Expected { after 'if' condition                          curly
  304:47  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  312:40  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  315:43  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  358:47  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings
  380:47  warning  Only use double-quoted strings for externalized strings  local/code-no-unexternalized-strings

C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\extensions\becoder.cph\webview\types.ts
  2:1    error    header should be a block comment  header/header
  7:155  warning  Expected a semicolon              @stylistic/ts/member-delimiter-style

✖ 110 problems (14 errors, 96 warnings)
  14 errors and 2 warnings potentially fixable with the `--fix` option.


```

Required continuation: resolve applicable GPL/upstream lint policy without replacing
third-party license provenance, address genuine warnings, then rerun affected compile,
test and lint checks. Previous passes describe this worktree only; future source fixes
invalidate affected evidence. No runtime acceptance is claimed.

## Authorized continuation and final source checks (2026-09-20)

Owner explicitly requested continuation after the previous ESLint stop.
Preflight reconfirmed the existing commands, configs, dependencies and input files.
Frozen sequence: focused ESLint (including eslint.config.js), extension prepublish,
test compilation, complete CPH tests. Root cwd; each child has a 120000ms external
timeout. No validation rule was disabled to bypass a finding. A scoped header rule
requires copyright attribution and GPL-3.0-or-later for CPH-owned block headers.
JSX attribute quoting, duplicate imports, casts and control-flow warnings were fixed.
Temporary cleanup remains identity-checked and fails visibly on replacement.

The first continuation matrix passed 55 tests. A separate read-only review then
found that the single-case button set running locally before compilation, potentially
leaving the card spinning after compilation failed. Removed that optimistic state;
executor events now own it. Added the compilation-failure UI regression and reran
the complete matrix below. These final results supersede the intermediate passes.

### Final eslint

Exact command:

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/eslint/bin/eslint.js","--max-warnings","0","eslint.config.js","extensions/becoder.cph/src/extension.ts","extensions/becoder.cph/src/importPreferences.ts","extensions/becoder.cph/src/problemStore.ts","extensions/becoder.cph/src/judgeSession.ts","extensions/becoder.cph/src/execution.ts","extensions/becoder.cph/src/judgeView.ts","extensions/becoder.cph/webview/App.tsx","extensions/becoder.cph/webview/CaseView.tsx","extensions/becoder.cph/webview/types.ts","extensions/becoder.cph/test/extension.test.ts","extensions/becoder.cph/test/problemStore.test.ts","extensions/becoder.cph/test/importPreferences.test.ts","extensions/becoder.cph/test/execution.test.ts","extensions/becoder.cph/test/webview.test.ts"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0; timeout: no; failure class: none.

```text
(no diagnostics)
```

### Final prepublish

Exact command:

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js","--prefix","extensions/becoder.cph","run","vscode:prepublish"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0; timeout: no; failure class: none.

```text

> cph@0.1.0 vscode:prepublish
> npm run compile && npm run compile-parsers && npm run compile-webview


> cph@0.1.0 compile
> node ../../node_modules/typescript/bin/tsc6 -p ./ && node ../../node_modules/typescript/bin/tsc6 -p tsconfig.webview.json


> cph@0.1.0 compile-parsers
> esbuild companion/entry.ts --bundle --platform=browser --format=iife --global-name=BeCoderCompanion --outfile=dist/problem-parser.js


  dist\problem-parser.js  23.8kb

Done in 21ms

> cph@0.1.0 compile-webview
> esbuild webview/App.tsx --bundle --platform=browser --format=iife --loader:.ttf=file --outfile=dist/judge.js


  dist\judge.js               1.1mb
  dist\codicon-ES367LOO.ttf  74.4kb
  dist\judge.css             12.2kb

Done in 76ms

```

### Final test-compile

Exact command:

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/typescript/bin/tsc6","-p","extensions/becoder.cph/tsconfig.test.json"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0; timeout: no; failure class: none.

```text
(no diagnostics)
```

### Final tests

Exact command:

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["--test","extensions/becoder.cph/out-test/test/*.test.js"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit code: 0; timeout: no; failure class: none.

```text
✔ external Python checker receives input and actual output, reports logs and cleans sessions (17812.0649ms)
✔ compiler flags preserve stream and macro policy for C and C++ (0.9037ms)
✔ real bundled GCC and pipe helper preserve EOF, stderr, exit125, timeout and cleanup (9967.4359ms)
✔ extension command binds imports to trusted local workspace and disposes registrations (269.3834ms)
✔ judge streams individual results, preserves other results through saves, and forwards shortcut drafts (94.2616ms)
✔ no workspace prompts without writing; picker cancellation does not import (4.0801ms)
✔ multi-root import uses the selected folder, single root needs no picker (107.2762ms)
✔ workspace change during selection rejects import (1.3313ms)
✔ rejects concurrent requests and window disposal cancels pending import (0.6395ms)
✔ upstream naming and template substitutions respect selected preferences (4.5844ms)
✔ template initializes only new source and checker survives edits and repeat import (152ms)
✔ upstream difference tokens and bounded large-output fallback (9.5467ms)
✔ display truncation is explicit and leaves captured output unchanged (1.5019ms)
✔ sample edits persist exact bytes and reopen; stale sessions cannot overwrite (135.3795ms)
✔ single sample run saves source first and cannot choose a different path (66.5036ms)
✔ run owner rejects concurrent edits and cancellation during source-save prevents execution (58.5281ms)
✔ zero samples, malformed edits and duplicate IDs never start the compiler (64.7072ms)
✔ VSCE inventory includes runtime and sources but excludes development dependencies (3312.5225ms)
✔ build and provenance are registered without external Companion reception (7.0736ms)
✔ bundled CF parser returns data without requiring extension APIs or network (120.6717ms)
✔ interactive and file-based CF tasks are rejected by import policy (48.866ms)
✔ Luogu structured data parsing preserves Unicode and samples (18.4575ms)
✔ unsupported hosts and resource-fetch pages fail without local POST (36.8619ms)
✔ AtCoder Japanese sample sections produce one sample pair (23.3806ms)
✔ Lanqiao DOM parser extracts title, limits and paired samples (18.1035ms)
✔ NowCoder ACM parser extracts independent sample blocks (17.2384ms)
✔ SPOJ parser handles separately labelled sample blocks (29.473ms)
✔ imports samples and discards page-provided local authority (3.6638ms)
✔ preserves sample spaces, intentional blank lines and empty EOF (0.4269ms)
✔ allows an empty sample list without manufacturing a passed case (0.4619ms)
✔ rejects unsupported input and test types (2.1896ms)
✔ rejects malformed and oversized data (10.4102ms)
✔ binds the import to the expected URL and rejects local URLs (0.8374ms)
✔ retains CPH line comparison rather than token comparison (0.4165ms)
✔ stderr debug is displayed independently, not judged as a runtime error (0.3189ms)
✔ execution failures cannot be hidden by matching stdout (0.298ms)
✔ creates C++ source and CPH-compatible metadata inside selected workspace (65.2854ms)
✔ creates an upstream-style local problem without changing the existing source (37.2422ms)
✔ same URL preserves source and declined replacement preserves exact metadata (80.4509ms)
✔ different URLs reuse the CPH filename and replace metadata without overwriting source (57.0136ms)
✔ template initialization receives final source and sample IDs, and is skipped for existing files (72.1766ms)
✔ filename reuse rejects linked source files and preserves their target (18.6762ms)
✔ refuses changed metadata after confirmation without overwriting the edit (43.1648ms)
✔ rejects another importer during confirmation and unlocks afterwards (59.5137ms)
✔ aborted confirmation retires the lock and preserves source and samples (49.4023ms)
✔ loads legacy CPH transport-less metadata without importing settings (18.7492ms)
✔ rejects redirected .cph junction without writing outside the workspace (9.4566ms)
✔ does not follow page path separators or Windows device names (0.4677ms)
✔ failed metadata publication preserves original data, removes only owned temporary file and releases lease (85.6941ms)
✔ old prototype lock file is not deleted and cannot block new imports (54.2062ms)
✔ checker controls retain upstream path, hidden expected output and expandable logs (335.3289ms)
✔ CPH cards display escaped output, save/add/run/stop messages, and retain edits on failure (704.8784ms)
✔ web problems link to their source, JSON imports append cases, and single runs mark only one card (267.6579ms)
✔ workspace occupancy rejects concurrent acquisition and releases idempotently (9.5779ms)
✔ kernel releases workspace occupancy after owner termination without deleting a file (137.9812ms)
ℹ tests 55
ℹ suites 0
ℹ pass 55
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27941.0946

```

Read-only review: checked approved template/collision semantics, retained C/C++
boundaries, event/result ownership, compile-failure reset, file identity and lease
cleanup, localization and GPL attribution. Existing busy/unsaved-edit guards remain:
association changes apply to an idle, saved judge. No browser/parser source or
compiler flags were changed. CPH tests include real bundled GCC/helper and Python
checker execution; this is not GUI acceptance or staged-package validation.
No staged application build, Setup, GUI launch, cache cleanup, commit or push.

