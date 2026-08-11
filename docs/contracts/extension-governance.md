# Extension Governance Contract

## Registry Boundary

The public Eclipse Open VSX Registry is BeCoder's only product-configured online extension registry.

- Support normal search, browse, install, update, and uninstall.
- Support user-supplied local VSIX installation.
- Do not configure, proxy, mirror, fall back to, or expose Microsoft Marketplace.
- Do not require a BeCoder account for registry use.
- Keep publisher, source, license, trust, compatibility, and security information visible where available.
- Do not automatically rebundle user-selected registry content into BeCoder.

Open VSX being open infrastructure does not prove every listed extension is open source or appropriate for BeCoder.

## Blacklist

`ms-vscode.cpptools` and `ms-vscode.cpptools-extension-pack` are prohibited. BeCoder must not bundle, download, install, update, enable, or run them through Open VSX, local VSIX, profile copy, existing-install, or resource paths.

## Protected Built-ins

The protected core IDs are:

- `becoder.becoder-setup`
- `becoder.runner`
- `becoder.gcc-diagnostics`
- `becoder.one-monokai`
- `llvm-vs-code-extensions.vscode-clangd`
- `adpyke.codesnap`
- `vscode.cpp`
- `ms-ceintl.vscode-language-pack-zh-hans`

Normal user, workspace, gallery, profile-copy, and update paths cannot replace these identities. Extension-development overrides remain available for source work.

CodeSnap and One Monokai are BeCoder-distributed core components, not extensions to remove and reinstall from Open VSX. Better C++ Syntax content belongs inside `vscode.cpp`, not a second extension.

## Removed Bundled Extensions

Keep the downloaded JS Debug extensions absent. Keep Mermaid as a built-in ordinary Markdown/Notebook component without Chat output integration.

Do not restore ShortestPath login, submission, network OJ services, GDB, AI, or removed product extension points through an installed extension.

## Seti File Icons

`vscode.vscode-theme-seti` is an ordinary built-in extension restored unchanged from Code OSS 1.130. Fresh profiles default to its `vs-seti` file-icon theme. An explicit user-selected file-icon theme remains authoritative, and Seti is not added to the protected-extension list.

Keep the other removed upstream color and file-icon themes absent. Preserve Seti's upstream manifest, icon font, theme data, localization, MIT provenance, third-party notices, and source-side dependency manifest. Source-only governance and development files excluded by the upstream `.vscodeignore` are not runtime package requirements.

## Simplified Chinese

The pinned 1.130 Simplified-Chinese pack is a protected built-in component. Fresh profiles default to `zh-cn`; English uses source messages. The protected pack does not appear as a normal gallery item and cannot be updated or replaced through Open VSX.

BeCoder-owned settings, commands, diagnostics, Setup, and toolchain surfaces remain coherent in English and Simplified Chinese. BC terminal protocol remains its accepted English contract.

## Licensing

Every bundled component requires exact identity/version or commit, source, modification status, SPDX license, copyright, license path, archive/tree hash where applicable, and corresponding-source location when required.

Project GPL licensing does not replace third-party licenses. Preserve `ThirdPartyNotices.txt`, bundled licenses, UCRT64 package/source inventories, clangd binary provenance, language-pack provenance, and component records.

## Source Ownership

- `product.json`
- extension gallery, allowed-extension, installation, enablement, deduplication, and profile-copy services under `src/vs/`
- `extensions/aadityanarayan.code-snap`
- `extensions/becoder.one-monokai`
- `extensions/MS-CEINTL.vscode-language-pack-zh-hans`
- `extensions/theme-seti`
- `build/lib/extensions.ts`
- package boundary tests and verifiers
- bundled-component and third-party notice inventories

## Acceptance Boundary

Validate Open VSX and local VSIX behavior, blacklist closure, protected identity closure across all install/update/enablement/copy paths, development overrides, gallery invisibility of protected components, bilingual behavior, retained Mermaid, removed JS Debug, the ordinary built-in Seti identity and runtime resources, fresh-profile `vs-seti` selection without overriding explicit user choice, package contents, and complete license/provenance records.
