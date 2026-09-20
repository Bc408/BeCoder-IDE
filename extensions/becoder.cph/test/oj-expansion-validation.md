# OJ expansion validation — 2026-09-20

Owner accepted the preceding CPH native-interaction build and authorized OJ expansion
with development/tests only; no Windows application or Setup build requested.

Preflight: existing tsc6/eslint/esbuild/jsdom, base/compiler configs and parser/test
inputs confirmed. New files follow the adjacent upstream parser conventions and
retain Competitive Companion MIT attribution. Commands ran from repository root
with an external 120000ms timeout; any nonzero result stops the sequence.
Generated parser JS and out-test files are test prerequisites, not application builds.

## parser-types

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/typescript/bin/tsc6","-p","extensions/becoder.cph/tsconfig.companion.json"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit: 0. Failure class: none. Timeout: no.

```text
(no diagnostics)
```

## parser-bundle

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js","--prefix","extensions/becoder.cph","run","compile-parsers"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit: 0. Failure class: none. Timeout: no.

```text

> cph@0.1.0 compile-parsers
> esbuild companion/entry.ts --bundle --platform=browser --format=iife --global-name=BeCoderCompanion --outfile=dist/problem-parser.js


  dist\problem-parser.js  34.7kb

Done in 21ms

```

## test-types

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/typescript/bin/tsc6","-p","extensions/becoder.cph/tsconfig.test.json"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit: 0. Failure class: none. Timeout: no.

```text
(no diagnostics)
```

## parser-import-tests

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["--test","extensions/becoder.cph/out-test/test/parser.test.js","extensions/becoder.cph/out-test/test/problem.test.js","extensions/becoder.cph/out-test/test/problemStore.test.js","extensions/becoder.cph/out-test/test/importController.test.js"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit: 0. Failure class: none. Timeout: no.

```text
✔ no workspace prompts without writing; picker cancellation does not import (1.7277ms)
✔ multi-root import uses the selected folder, single root needs no picker (62.3601ms)
✔ workspace change during selection rejects import (0.9065ms)
✔ rejects concurrent requests and window disposal cancels pending import (0.5104ms)
✔ bundled CF parser returns data without requiring extension APIs or network (121.7098ms)
✔ CSES live-page fixture extracts the actual example and limits (66.5958ms)
✔ HDU live-page fixture uses Others limits for C/C++ and ignores sample decorations (127.7845ms)
✔ AcWing upstream DOM contract extracts samples after the sample header (15.5977ms)
✔ LibreOJ upstream DOM contract preserves whitespace and empty-input EOF (15.1521ms)
✔ DMOJ upstream DOM contract handles code wrappers, limits and heading variants (30.2239ms)
✔ new parser routes include CSES examples, HDU contests and LibreOJ archive contests (83.211ms)
✔ new OJ parsers reject missing pages, incomplete samples and disguised hosts (196.4543ms)
✔ interactive and file-based CF tasks are rejected by import policy (27.6281ms)
✔ Luogu structured data parsing preserves Unicode and samples (11.4892ms)
✔ unsupported hosts and resource-fetch pages fail without local POST (18.2027ms)
✔ AtCoder Japanese sample sections produce one sample pair (10.9335ms)
✔ Lanqiao DOM parser extracts title, limits and paired samples (13.8745ms)
✔ NowCoder ACM parser extracts independent sample blocks (11.3682ms)
✔ SPOJ parser handles separately labelled sample blocks (12.6762ms)
✔ imports samples and discards page-provided local authority (2.3826ms)
✔ preserves sample spaces, intentional blank lines and empty EOF (0.2882ms)
✔ allows an empty sample list without manufacturing a passed case (0.2316ms)
✔ rejects unsupported input and test types (2.1573ms)
✔ rejects malformed and oversized data (7.7007ms)
✔ binds the import to the expected URL and rejects local URLs (0.7809ms)
✔ retains CPH line comparison rather than token comparison (0.4097ms)
✔ stderr debug is displayed independently, not judged as a runtime error (0.3251ms)
✔ execution failures cannot be hidden by matching stdout (0.3257ms)
✔ creates C++ source and CPH-compatible metadata inside selected workspace (41.1308ms)
✔ creates an upstream-style local problem without changing the existing source (28.5046ms)
✔ same URL preserves source and declined replacement preserves exact metadata (57.2434ms)
✔ different URLs reuse the CPH filename and replace metadata without overwriting source (45.9683ms)
✔ template initialization receives final source and sample IDs, and is skipped for existing files (85.1475ms)
✔ filename reuse rejects linked source files and preserves their target (17.0095ms)
✔ refuses changed metadata after confirmation without overwriting the edit (43.4795ms)
✔ rejects another importer during confirmation and unlocks afterwards (55.416ms)
✔ aborted confirmation retires the lock and preserves source and samples (47.2396ms)
✔ loads legacy CPH transport-less metadata without importing settings (19.1665ms)
✔ rejects redirected .cph junction without writing outside the workspace (8.1685ms)
✔ does not follow page path separators or Windows device names (0.4297ms)
✔ failed metadata publication preserves original data, removes only owned temporary file and releases lease (80.6577ms)
✔ old prototype lock file is not deleted and cannot block new imports (56.6879ms)
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1939.4318

```

## lint

```powershell
node -e 'const r=require(''child_process'').spawnSync(process.execPath,["node_modules/eslint/bin/eslint.js","--max-warnings","0","eslint.config.js","extensions/becoder.cph/companion/entry.ts","extensions/becoder.cph/test/parser.test.ts","extensions/becoder.cph/companion/src/parsers/problem/CSESProblemParser.ts","extensions/becoder.cph/companion/src/parsers/problem/HDOJProblemParser.ts","extensions/becoder.cph/companion/src/parsers/problem/AcWingProblemParser.ts","extensions/becoder.cph/companion/src/parsers/problem/LibreOJProblemParser.ts","extensions/becoder.cph/companion/src/parsers/problem/DMOJProblemParser.ts"],{stdio:''inherit'',timeout:120000,windowsHide:true});if(r.error)console.error(r.error);process.exit(r.status??124)'
```

Exit: 0. Failure class: none. Timeout: no.

```text
(no diagnostics)
```

## Evidence and read-only review

- Five new parser families: CSES, HDOJ, AcWing, LibreOJ, DMOJ; eleven in total.
- CSES/HDOJ captured live anonymously; assertions check actual title, samples and limits.
- AcWing requires login in this environment; DMOJ returned 403; LibreOJ raw HTML is
  an application shell. These three have upstream-derived synthetic DOM fixtures only.
- Checked URL pattern routing, rejected lookalike domains, no new resource fetch or
  external receiver, incomplete sample rejection, whitespace and empty EOF preservation.
- HDOJ uses Others limits and K/1024 for C/C++ instead of upstream Java limits.
- Existing import/store tests protect user source, metadata and unsupported task policy.
- Test fixtures excluded by test/** in .vscodeignore. Parser MIT license retained.
- No changes to compiler flags, CPH judge UI/session lifecycle, or browser transport.
- No application/Setup build, GUI run, dependency install, cleanup, Git commit or push.
- New sources are not yet in the previously accepted Windows build.

