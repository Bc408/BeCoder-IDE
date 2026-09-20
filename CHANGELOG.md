# BeCoder release notes

## 1.2.0 — 2026-09-20

Compared with main `9096ac3ed1ff93cb8222854ecc597c7ee256b8f8` (1.1.0), checked on 2026-09-20. The project owner accepted the locally built and verified Setup on 2026-09-20 and authorized main and v1.2.0 publication.

### feat

- Bundle a protected BeCoder CPH extension for C/C++ sample testing: editable samples, JSON import, individual/all-case execution, compile/stop controls, output differences, optional Python checkers, source templates and localized UI.
- Import the current integrated-browser problem page into the current trusted workspace. Preserve existing source contents and place a newly created source editor group to the left of the problem browser.
- Include eleven parser families: Codeforces, AtCoder, Luogu, Lanqiao, NowCoder, SPOJ, CSES, HDOJ, AcWing, LibreOJ and DMOJ. Explicit archive/DMOJ domains bring the Welcome-page preset table to sixteen entries; arbitrary instances and resource-dependent problems remain excluded.
- Add configurable Welcome-page OJ shortcuts under Settings → Extensions → BeCoder IDE Features. Six sites are visible by default; custom HTTP/HTTPS entries and display order are configurable without restarting.
- Share Runner's compiler selection, standards, flags and private child environment with CPH. Legacy CPH C/C++ Args settings remain visible as deprecated and ignored, without rewriting user settings.

### fix

- Present BC program stdout/stderr through ConPTY, preserving console output behavior without independently merging two JavaScript pipe callbacks. Preserve real program buffering semantics.
- Feed Run With Input from a pre-compilation snapshot through a dedicated stdin pipe with real EOF and no input echo. Ship the native input helper prebuilt; preserve cancellation and process-tree retirement.
- Keep CPH stdout separate for comparison and stderr separate for debug display; stderr is ignored for verdicts by default. Retain private per-request execution artifacts and cleanup.
- Restore GCC 16 diagnostics using SARIF and correctly map Unicode display columns to editor UTF-16 positions.
- Support bundled debug output across C++11/14/17/20/23, using the C++20 PCH when compatible and textual headers otherwise.

### docs / build

- Document the Welcome → OJ → import samples → CPH → manually copy source and submit workflow in both languages. Local sample success is not an online judge verdict; BeCoder debug helpers are not guaranteed on OJ compilers.
- Retain CPH/Competitive Companion source provenance and GPL/MIT license texts; record Codicons CC-BY-4.0 and all bundled React UI dependency notices.
- Remove obsolete one-off development transcripts from source test directories while retaining reusable tests, probes, parser fixture provenance and upstream modification history.

### Verification boundaries

- Website availability and browser-rendered DOM compatibility are separate from parser fixture tests. In particular, AcWing, LibreOJ and DMOJ have DOM-contract fixtures, not complete live-browser acceptance; see `extensions/becoder.cph/test/fixtures/OJ-SOURCES.md`.
- CPH supports non-interactive stdin/stdout C/C++ tasks, not automatic submission, a security sandbox or OJ-equivalent memory-limit enforcement. Optional Python checkers use the user's interpreter.
- Final source checks, application/package verification and Setup verification must correspond to the final worktree. GUI acceptance remains the project owner's separate step. Commit, main publication, tag and Release upload require explicit authorization.

## 1.2.0 更新摘要

- 内置受保护的 CPH：样例编辑与 JSON 导入、单例/全部评测、编译/停止、输出差异、自定义 Python 检查器、模板和中英文界面。
- 打通欢迎页 OJ 入口、内置浏览器看题、导入样例、左侧编写源码、CPH 本地测试，再由用户复制源码到网站提交的流程。
- 欢迎页预置 16 个站点入口，默认显示 6 个；在“扩展 → BeCoder IDE 功能”中管理自定义 URL 与显示顺序。
- BC 使用 ConPTY 协调输出；文件输入采用快照和独立 stdin 管道。CPH 保留 stdout 判题与 stderr 调试的分离语义。
- Runner 与 CPH 共用编译策略；修复 GCC 16 SARIF 诊断及 Unicode 定位，完善多 C++ 标准下的调试头兼容。
- 补齐第三方许可证、来源与使用说明，清理一次性开发记录。源码检查、应用与 Setup 构建、包与安装验证已通过，项目所有者已完成人工验收并授权正式发布。
