/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';

interface IExtensionManifest {
	readonly name?: string;
	readonly publisher?: string;
	readonly categories?: readonly string[];
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly contributes?: {
		readonly grammars?: readonly {
			readonly path?: string;
			readonly scopeName?: string;
		}[];
		readonly themes?: readonly {
			readonly id?: string;
			readonly path?: string;
		}[];
		readonly configurationDefaults?: Record<string, Record<string, unknown>>;
		readonly configuration?: {
			readonly properties?: Record<string, unknown>;
		};
		readonly colors?: readonly { readonly id?: string }[];
		readonly commands?: readonly { readonly command?: string }[];
		readonly keybindings?: readonly unknown[];
		readonly menus?: Record<string, unknown>;
		readonly views?: Record<string, unknown>;
	};
}

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const extensionsRoot = path.join(repositoryRoot, 'extensions');

function readJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertSameLocalizationKeys(extensionFolder: string): void {
	const english = readJson<Record<string, string>>(path.join(extensionsRoot, extensionFolder, 'package.nls.json'));
	const chinese = readJson<Record<string, string>>(path.join(extensionsRoot, extensionFolder, 'package.nls.zh-cn.json'));
	assert.deepStrictEqual(Object.keys(chinese).sort(), Object.keys(english).sort(), `${extensionFolder} localization keys differ`);
}

function computeDirectoryFilesSha256(directoryPath: string, transform?: (relativePath: string, contents: Buffer) => Buffer): string {
	const files: string[] = [];
	const collectFiles = (directory: string): void => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				collectFiles(entryPath);
			} else if (entry.isFile()) {
				files.push(path.relative(directoryPath, entryPath).split(path.sep).join('/'));
			}
		}
	};
	collectFiles(directoryPath);
	files.sort();

	const manifest = files.map(relativePath => {
		const contents = fs.readFileSync(path.join(directoryPath, relativePath));
		const fileHash = createHash('sha256').update(transform?.(relativePath, contents) ?? contents).digest('hex');
		return `${relativePath}\t${fileHash}\n`;
	}).join('');
	return createHash('sha256').update(manifest, 'utf8').digest('hex');
}

suite('OI extension boundary', () => {
	test('uses only Open VSX and protects the complete BeCoder core set', () => {
		const productPath = path.join(repositoryRoot, 'product.json');
		const productText = fs.readFileSync(productPath, 'utf8');
		const product = JSON.parse(productText) as {
			extensionsGallery?: Record<string, string>;
			extensionBlacklist?: readonly string[];
			protectedExtensions?: readonly string[];
			builtInExtensions?: readonly { name?: string }[];
			linkProtectionTrustedDomains?: readonly string[];
		};
		assert.deepStrictEqual(product.extensionsGallery, {
			serviceUrl: 'https://open-vsx.org/vscode/gallery',
			itemUrl: 'https://open-vsx.org/vscode/item',
			latestUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
			controlUrl: 'https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json'
		});
		assert.deepStrictEqual(product.extensionBlacklist, [
			'ms-vscode.cpptools',
			'ms-vscode.cpptools-extension-pack'
		]);
		assert.deepStrictEqual(product.protectedExtensions, [
			'becoder.becoder-setup',
			'becoder.runner',
			'becoder.gcc-diagnostics',
			'becoder.one-monokai',
			'llvm-vs-code-extensions.vscode-clangd',
			'adpyke.codesnap',
			'vscode.cpp',
			'ms-ceintl.vscode-language-pack-zh-hans'
		]);
		assert.deepStrictEqual(product.linkProtectionTrustedDomains, ['https://open-vsx.org']);
		assert.deepStrictEqual(product.builtInExtensions, []);
		for (const endpoint of ['marketplace.visualstudio.com', 'marketplace.vsallin.net', 'vscode-unpkg.net', 'az764295.vo.msecnd.net']) {
			assert.ok(!productText.includes(endpoint), `Microsoft Marketplace endpoint remains in product.json: ${endpoint}`);
		}

		const extensionBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'lib', 'extensions.ts'), 'utf8');
		assert.match(extensionBuildSource, /excludedForOIDistribution[\s\S]*'mermaid-markdown-features'/);
		const packageBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.ts'), 'utf8');
		assert.match(packageBuildSource, /const beCoderOnboarding = gulp\.src\(\[[\s\S]*'resources\/oi-defaults\/\*\*',[\s\S]*'!resources\/oi-defaults\/portable-data\/\*\*'[\s\S]*\], \{ base: '\.' \}\);/);
		assert.match(packageBuildSource, /const beCoderRecipeDotfiles = gulp\.src\('resources\/oi-defaults\/toolchains\/ucrt64-sources\/recipes\/\*\*\/\.gitignore', \{ base: '\.', dot: true \}\);/);

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /defaultChatAgentExtensionId = this\.productService\.defaultChatAgent\?\.extensionId/);
		assert.match(gallerySource, /if \(defaultChatAgent\) \{[\s\S]*deprecated\[defaultChatAgent\.extensionId\.toLowerCase\(\)\]/);
		assert.match(gallerySource, /countMatchingProtectedExtensions[\s\S]*createFilteredExtensionPager/);
		assert.match(gallerySource, /private async getVersions[\s\S]*isProtectedExtensionId\(extensionIdentifier\.id/);
		assert.match(gallerySource, /private async getAsset[\s\S]*Gallery resources are unavailable for protected BeCoder extension/);

		const extensionManagementSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'node', 'extensionManagementService.ts'), 'utf8');
		assert.match(extensionManagementSource, /installExtensionsFromProfile[\s\S]*allowedExtensionsService\.isAllowed\(extension\)[\s\S]*addExtensionsToProfile/);
	});

	test('pins bundled component licenses and toolchain provenance', () => {
		const inventory = readJson<{
			components?: readonly {
				id?: string;
				version?: string;
				source?: string;
				modificationStatus?: string;
				spdxIdentifier?: string;
				copyrightNotice?: string;
				archive?: string;
				sha256?: string;
				contentSha256?: string;
				packagedContentSha256?: string;
				licensePath?: string;
				archiveLicenseEntry?: string;
				packageInventory?: string;
				correspondingSource?: string;
			}[];
		}>(path.join(repositoryRoot, 'resources', 'oi-defaults', 'BUNDLED-COMPONENTS.json'));
		const components = inventory.components ?? [];
		assert.deepStrictEqual(components.map(component => component.id), [
			'code-oss',
			'becoder.runner',
			'becoder.becoder-setup',
			'becoder.gcc-diagnostics',
			'llvm-vs-code-extensions.vscode-clangd',
			'adpyke.codesnap',
			'becoder.one-monokai',
			'vscode.cpp',
			'ms-ceintl.vscode-language-pack-zh-hans',
			'clangd-windows',
			'becoder-ucrt64'
		]);
		for (const component of components) {
			assert.ok(component.id && component.version && component.source);
			assert.ok(component.modificationStatus && component.spdxIdentifier && component.copyrightNotice, `Incomplete redistribution metadata for ${component.id}`);
			if (component.licensePath) {
				const licensePath = path.join(repositoryRoot, component.licensePath);
				const licenseStat = fs.statSync(licensePath);
				assert.ok(licenseStat.isDirectory() ? fs.readdirSync(licensePath).length > 0 : licenseStat.size > 0, `Missing license for ${component.id}`);
			}
		}
		const clangd = components.find(component => component.id === 'clangd-windows');
		assert.strictEqual(clangd?.sha256, 'ce54f16e0b4fd76d450eeda9664420b195360b73febcfe40e661108fa57f2ce1');
		assert.strictEqual(clangd?.archiveLicenseEntry, 'clangd_22.1.6/LICENSE.TXT');
		const ucrt64 = components.find(component => component.id === 'becoder-ucrt64');
		assert.strictEqual(ucrt64?.sha256, '730e8169f9984dbe0f1c952a110b16616350a26bdc693e7b7ff9e5f59fba70b2');
		assert.strictEqual(ucrt64?.packageInventory, 'resources/oi-defaults/toolchains/ucrt64-packages.json');
		assert.ok(ucrt64?.correspondingSource);
		const languagePack = components.find(component => component.id === 'ms-ceintl.vscode-language-pack-zh-hans');
		assert.strictEqual(languagePack?.version, '1.130.2026072017');
		assert.strictEqual(languagePack?.sha256, '265536b3db2bdcc01e764679da8fb6d7ceaa7a7f3bb35c8b53dd0db51e8707f0');
		assert.strictEqual(languagePack?.contentSha256, 'b673f15a9e308edca466da2b3fce216b13a855a852cdfa91288b2c0d7b5ace1e');
		assert.strictEqual(computeDirectoryFilesSha256(path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans')), languagePack?.contentSha256);
		assert.strictEqual(languagePack?.packagedContentSha256, 'a9fabbecb50d14fb17abb91dd8905c7ba4e459247d910ad79da537fe5a914426');
		assert.strictEqual(computeDirectoryFilesSha256(
			path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans'),
			(relativePath, contents) => relativePath.endsWith('.json') ? Buffer.from(JSON.stringify(JSON.parse(contents.toString('utf8')))) : contents,
		), languagePack?.packagedContentSha256);
		const gitAttributes = fs.readFileSync(path.join(repositoryRoot, '.gitattributes'), 'utf8');
		assert.match(gitAttributes, /^extensions\/MS-CEINTL\.vscode-language-pack-zh-hans\/\*\* -text whitespace=-trailing-space$/m);
		const languagePackManifest = readJson<{ version?: string; engines?: { vscode?: string } }>(path.join(repositoryRoot, 'extensions', 'MS-CEINTL.vscode-language-pack-zh-hans', 'package.json'));
		assert.strictEqual(languagePackManifest.version, languagePack?.version);
		assert.strictEqual(languagePackManifest.engines?.vscode, '^1.130.0');

		const packages = readJson<{
			archiveSha256?: string;
			licenseFilesRoot?: string;
			recipeFilesRoot?: string;
			evidence?: { retainedLicenseFileCount?: number; retainedRecipeFileCount?: number };
			packages?: readonly { name?: string; version?: string; license?: string; recipe?: string }[];
			auxiliaryPackageSources?: readonly { name?: string; version?: string; license?: string; recipe?: string }[];
			licenseMappings?: Record<string, readonly string[]>;
			recipes?: Record<string, { commit?: string; pkgbuildSha256?: string; filesSha256?: string }>;
			unownedArchiveEntries?: readonly string[];
		}>(path.join(repositoryRoot, 'resources', 'oi-defaults', 'toolchains', 'ucrt64-packages.json'));
		assert.strictEqual(packages.archiveSha256, ucrt64?.sha256);
		assert.strictEqual(packages.licenseFilesRoot, 'resources/oi-defaults/toolchains/ucrt64-licenses');
		const retainedLicenseFiles = fs.readdirSync(path.join(repositoryRoot, packages.licenseFilesRoot), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
		assert.strictEqual(retainedLicenseFiles.length, packages.evidence?.retainedLicenseFileCount);
		assert.ok(retainedLicenseFiles.length >= 63);
		assert.strictEqual(packages.recipeFilesRoot, 'resources/oi-defaults/toolchains/ucrt64-sources/recipes');
		const retainedRecipeFiles = fs.readdirSync(path.join(repositoryRoot, packages.recipeFilesRoot), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
		assert.strictEqual(retainedRecipeFiles.length, packages.evidence?.retainedRecipeFileCount);
		assert.ok(retainedRecipeFiles.length >= 290);
		assert.strictEqual(packages.packages?.length, 36);
		assert.strictEqual(packages.auxiliaryPackageSources?.length, 2);
		assert.strictEqual(new Set(packages.packages?.map(pkg => pkg.name)).size, 36);
		const recipeRoot = path.join(repositoryRoot, packages.recipeFilesRoot);
		const recipeDirectoryNames = fs.readdirSync(recipeRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
		assert.deepStrictEqual(recipeDirectoryNames, Object.keys(packages.recipes ?? {}).sort());
		for (const [recipeName, recipe] of Object.entries(packages.recipes ?? {})) {
			assert.match(recipe.filesSha256 ?? '', /^[0-9a-f]{64}$/);
			assert.strictEqual(computeDirectoryFilesSha256(path.join(recipeRoot, recipeName)), recipe.filesSha256, `Retained recipe files changed for ${recipeName}`);
		}
		for (const pkg of [...(packages.packages ?? []), ...(packages.auxiliaryPackageSources ?? [])]) {
			assert.ok(pkg.name && pkg.version && pkg.license && pkg.recipe);
			const recipe = packages.recipes?.[pkg.recipe];
			assert.match(recipe?.commit ?? '', /^[0-9a-f]{40}$/);
			assert.match(recipe?.pkgbuildSha256 ?? '', /^[0-9a-f]{64}$/);
			const pkgbuildPath = path.join(recipeRoot, pkg.recipe, 'PKGBUILD');
			assert.strictEqual(createHash('sha256').update(fs.readFileSync(pkgbuildPath)).digest('hex'), recipe?.pkgbuildSha256);
			const licensePaths = packages.licenseMappings?.[pkg.name];
			assert.ok(licensePaths?.length, `Missing license mapping for ${pkg.name}`);
			for (const relativeLicensePath of licensePaths) {
				assert.ok(fs.statSync(path.join(repositoryRoot, packages.licenseFilesRoot, relativeLicensePath)).size > 0, `Missing mapped license for ${pkg.name}: ${relativeLicensePath}`);
			}
		}
		assert.ok(packages.unownedArchiveEntries?.includes('include/c++/14.1.0/x86_64-w64-mingw32/bits/debugger.h'));
		assert.ok(packages.unownedArchiveEntries?.includes('include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h.gch'));

		const notices = fs.readFileSync(path.join(repositoryRoot, 'ThirdPartyNotices.txt'), 'utf8');
		assert.match(notices, /BeCoder Runner 0\.3\.0/);
		assert.match(notices, /CodeSnap 1\.3\.4[\s\S]*Copyright \(c\) 2019 Adrien Pyke/);
		assert.match(notices, /clangd 22\.1\.6 Windows binary bundle/);
		assert.match(notices, /BeCoder UCRT64 GCC 14\.1\.0 bundle/);
	});

	test('bundles protected Simplified Chinese and keeps BeCoder UI bilingual', () => {
		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8');
		assert.match(mainSource, /resolveUserLocale\(args\['locale'\], argvConfig\.locale, 'zh-cn'\)/);

		const nlsSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'base', 'node', 'nls.ts'), 'utf8');
		assert.match(nlsSource, /MS-CEINTL\.vscode-language-pack-zh-hans/);
		assert.match(nlsSource, /languagePacks\['zh-cn'\] = builtInPack/);

		const setupManifest = readJson<{
			contributes?: { configuration?: { properties?: Record<string, { default?: unknown; enum?: unknown; scope?: unknown; order?: unknown }> } };
		}>(path.join(extensionsRoot, 'becoder.setup', 'package.json'));
		const displayLanguage = setupManifest.contributes?.configuration?.properties?.['becoder.displayLanguage'];
		assert.deepStrictEqual(displayLanguage?.enum, ['zh-cn', 'en']);
		assert.strictEqual(displayLanguage?.default, 'zh-cn');
		assert.strictEqual(displayLanguage?.scope, 'application');
		assert.strictEqual(displayLanguage?.order, 0);

		for (const extensionFolder of ['becoder.setup', 'danielpinto8zz6.c-cpp-compile-run', 'becoder.gcc-diagnostics']) {
			assertSameLocalizationKeys(extensionFolder);
		}

		const setupSettingsSource = fs.readFileSync(path.join(extensionsRoot, 'becoder.setup', 'src', 'simpleSettings.ts'), 'utf8');
		assert.match(setupSettingsSource, /@ext:becoder\.becoder-setup/);
		const displayLanguageSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'becoder', 'electron-browser', 'beCoderDisplayLanguage.contribution.ts'), 'utf8');
		assert.match(displayLanguageSource, /ConfigurationTarget\.USER_LOCAL/);
		assert.match(displayLanguageSource, /BeCoderSimplifiedChineseLanguagePackId/);
		assert.match(displayLanguageSource, /setLocale\(languagePack, false, \(\) => this\.controller\.isLatestRequest\(language\)\)/);

		const localeServiceSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'localization', 'electron-browser', 'localeService.ts'), 'utf8');
		assert.match(localeServiceSource, /cancelButton: localize\('later', "Later"\)/);
		assert.ok(localeServiceSource.indexOf('writeLocaleValue(locale)') < localeServiceSource.indexOf('showRestartDialog(languagePackItem.label)'));

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /isProtectedExtensionId\(extensionIdentifier\.id, this\.productService\.protectedExtensions\)/);
	});

	test('keeps a single C++ TextMate grammar owner', () => {
		const contributors: Array<{ extension: string; grammarPath: string | undefined }> = [];

		for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const manifestPath = path.join(extensionsRoot, entry.name, 'package.json');
			if (!fs.existsSync(manifestPath)) {
				continue;
			}
			const manifest = readJson<IExtensionManifest>(manifestPath);
			for (const grammar of manifest.contributes?.grammars ?? []) {
				if (grammar.scopeName === 'source.cpp') {
					contributors.push({ extension: entry.name, grammarPath: grammar.path });
				}
			}
		}

		assert.deepStrictEqual(contributors, [
			{ extension: 'cpp', grammarPath: './syntaxes/cpp.tmLanguage.json' }
		]);
	});

	test('pins the selected Better C++ Syntax grammar snapshot', () => {
		const expectedVersion = 'https://github.com/jeff-hykin/better-cpp-syntax/commit/071dd6ecc9eda347bd84c8aa0e0b557396cb6a40';
		for (const file of ['cpp.tmLanguage.json', 'cpp.embedded.macro.tmLanguage.json']) {
			const grammar = readJson<{ version?: string }>(path.join(extensionsRoot, 'cpp', 'syntaxes', file));
			assert.strictEqual(grammar.version, expectedVersion);
		}

		const manifest = readJson<{ registrations?: Array<{ component?: { git?: { name?: string; commitHash?: string } }; license?: string }> }>(
			path.join(extensionsRoot, 'cpp', 'cgmanifest.json'));
		const registration = manifest.registrations?.find(entry => entry.component?.git?.name === 'jeff-hykin/better-cpp-syntax');
		assert.strictEqual(registration?.component?.git?.commitHash, '071dd6ecc9eda347bd84c8aa0e0b557396cb6a40');
		assert.strictEqual(registration?.license, 'MIT');
	});

	test('owns One Monokai with bounded C/C++ semantic refinement', () => {
		const extensionPath = path.join(extensionsRoot, 'becoder.one-monokai');
		const manifest = readJson<IExtensionManifest>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.one-monokai');
		assert.deepStrictEqual(manifest.contributes?.themes, [{
			id: 'BeCoder One Monokai',
			label: 'BeCoder One Monokai',
			uiTheme: 'vs-dark',
			path: './themes/OneMonokai-color-theme.json'
		}]);
		assert.strictEqual(
			manifest.contributes?.configurationDefaults?.['[c][cpp][cuda-cpp]']?.['editor.semanticHighlighting.enabled'],
			true);

		const theme = readJson<{
			semanticHighlighting?: boolean;
			semanticTokenColors?: Record<string, unknown>;
		}>(
			path.join(extensionPath, 'themes', 'OneMonokai-color-theme.json'));
		assert.strictEqual(theme.semanticHighlighting, true);
		assert.strictEqual(theme.semanticTokenColors?.['function:cpp'], '#98c379');
		assert.strictEqual(theme.semanticTokenColors?.['type:cpp'], '#61afef');
		assert.deepStrictEqual(theme.semanticTokenColors?.['parameter:cpp'], {
			foreground: '#d19a66',
			fontStyle: 'italic'
		});
		assert.strictEqual(theme.semanticTokenColors?.['variable:cpp'], '#abb2bf');
		assert.strictEqual(theme.semanticTokenColors?.['variable.defaultLibrary:cpp'], '#61afef');
		for (const forbiddenType of ['keyword', 'operator', 'number', 'string', 'comment']) {
			assert.ok(!Object.keys(theme.semanticTokenColors ?? {}).some(selector => selector.startsWith(`${forbiddenType}:`)));
		}
		assert.ok(fs.statSync(path.join(extensionPath, 'LICENSE')).size > 0);

		const themeServiceSource = fs.readFileSync(
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'themes', 'common', 'workbenchThemeService.ts'), 'utf8');
		assert.match(themeServiceSource, /COLOR_THEME_DARK = 'BeCoder One Monokai'/);
		const product = readJson<{ onboardingThemes?: Array<{ id?: string; themeId?: string }> }>(
			path.join(repositoryRoot, 'product.json'));
		assert.ok(product.onboardingThemes?.some(theme =>
			theme.id === 'becoder-one-monokai' && theme.themeId === 'BeCoder One Monokai'));
		const onboardingSource = fs.readFileSync(
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeOnboarding', 'browser', 'onboardingVariationA.ts'), 'utf8');
		assert.match(onboardingSource, /selectedThemeId = 'becoder-one-monokai'/);
	});

	test('keeps clangd inside the approved Stage 4.1 capability boundary', () => {
		const extensionPath = path.join(extensionsRoot, 'llvm-vs-code-extensions.vscode-clangd');
		const manifest = readJson<IExtensionManifest>(path.join(extensionPath, 'package.json'));
		const properties = manifest.contributes?.configuration?.properties ?? {};
		assert.deepStrictEqual(properties, {});
		assert.deepStrictEqual(manifest.contributes?.commands ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.colors ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.keybindings ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.menus ?? {}, {});
		assert.deepStrictEqual(manifest.contributes?.views ?? {}, {});
		assert.ok(!manifest.categories?.includes('Linters'));
		assert.ok(!('@clangd/install' in (manifest.dependencies ?? {})));
		assert.ok(!('clang-format' in (manifest.devDependencies ?? {})));
		assert.deepStrictEqual(
			manifest.contributes?.configurationDefaults?.['[c][cpp][cuda-cpp][objective-c][objective-cpp]'],
			{
				'editor.defaultFormatter': 'llvm-vs-code-extensions.vscode-clangd',
				'editor.formatOnSave': false,
				'editor.formatOnType': false
			});

		for (const file of [
			'ast.ts',
			'config-file-watcher.ts',
			'config.ts',
			'file-status.ts',
			'inactive-regions.ts',
			'inlay-hints.ts',
			'memory-usage.ts',
			'open-config.ts',
			'semantic-tokens-cache.ts',
			'switch-source-header.ts',
			'type-hierarchy.ts'
		]) {
			assert.ok(!fs.existsSync(path.join(extensionPath, 'src', file)));
		}
		const contextSource = fs.readFileSync(path.join(extensionPath, 'src', 'clangd-context.ts'), 'utf8');
		assert.match(contextSource, /approvedTextDocumentFeatureMethods/);
		assert.match(contextSource, /approvedStaticFeatureNames/);
		assert.match(contextSource, /compilationDatabaseChanges/);
		assert.match(contextSource, /configureManagedDocumentBeforeOpen/);
		assert.match(contextSource, /handleDiagnostics: \(uri, _diagnostics, next\) => next\(uri, \[\]\)/);
		assert.doesNotMatch(contextSource, /provideDocumentSemanticTokens/);
		const formattingSource = fs.readFileSync(path.join(extensionPath, 'src', 'formatting.ts'), 'utf8');
		assert.match(formattingSource, /return `0:\$\{path\.sep\}`/);
		assert.doesNotMatch(formattingSource, /writeFile|mkdir/);
		const toolchainSource = fs.readFileSync(path.join(extensionPath, 'src', 'becoder-toolchain.ts'), 'utf8');
		assert.match(toolchainSource, /'-std=c17'/);
		assert.match(toolchainSource, /'-std=c\+\+20'/);
		for (const apiFile of [
			path.join(extensionPath, 'src', 'api.ts'),
			path.join(extensionPath, 'api', 'vscode-clangd.d.ts'),
			path.join(extensionPath, 'api', 'package.json')
		]) {
			assert.ok(!fs.existsSync(apiFile));
		}
		const readme = fs.readFileSync(path.join(extensionPath, 'README.md'), 'utf8');
		assert.match(readme, /Visible C\/C\+\+ diagnostics belong to BeCoder's bundled GCC/);
		assert.doesNotMatch(readme, /download it|compile_commands\.json file|Format on Type/);
		const lockfile = readJson<{ packages?: Record<string, unknown> }>(
			path.join(extensionPath, 'package-lock.json'));
		assert.ok(!('node_modules/@clangd/install' in (lockfile.packages ?? {})));
		assert.ok(!('node_modules/clang-format' in (lockfile.packages ?? {})));
		const compatibilityDependencies = (lockfile as { dependencies?: Record<string, unknown> }).dependencies ?? {};
		assert.ok(!('@clangd/install' in compatibilityDependencies));
		assert.ok(!('clang-format' in compatibilityDependencies));
		const vscodeIgnore = fs.readFileSync(path.join(extensionPath, '.vscodeignore'), 'utf8');
		assert.doesNotMatch(vscodeIgnore, /!\*\.png|!doc-assets/);

		const setupSource = fs.readFileSync(path.join(extensionsRoot, 'becoder.setup', 'src', 'extension.ts'), 'utf8');
		assert.doesNotMatch(setupSource, /createDefaultClangdConfig|createDefaultClangFormatConfig|migrateWorkspaceClangdConfig/);
		assert.doesNotMatch(setupSource, /function configureClangd/);
		assert.match(setupSource, /removeLegacyClangdSettings/);
		assert.doesNotMatch(setupSource, /editor\.unicodeHighlight/);
		const setupManifest = readJson<{
			contributes?: { configurationDefaults?: Record<string, unknown> };
		}>(path.join(extensionsRoot, 'becoder.setup', 'package.json'));
		assert.deepStrictEqual(setupManifest.contributes?.configurationDefaults, {
			'editor.unicodeHighlight.nonBasicASCII': false,
			'editor.unicodeHighlight.ambiguousCharacters': false,
			'editor.unicodeHighlight.invisibleCharacters': true
		});
		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.doesNotMatch(mainSource, /createBeCoderClangdConfig|createBeCoderClangFormatConfig/);
		assert.doesNotMatch(mainSource, /'clangd\.(?:path|arguments|fallbackFlags|enable)'/);
		const firstRunSource = fs.readFileSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'first-run.html'), 'utf8');
		assert.doesNotMatch(firstRunSource, /create \.clangd|创建 \.clangd|clangdVariableTypeHints/);
	});

	test('owns Stage 4.2 diagnostics in a private bundled GCC extension', () => {
		const extensionPath = path.join(extensionsRoot, 'becoder.gcc-diagnostics');
		const manifest = readJson<{
			name?: string;
			publisher?: string;
			main?: string;
			extensionDependencies?: readonly string[];
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.gcc-diagnostics');
		assert.strictEqual(manifest.main, './out/extension.js');
		assert.deepStrictEqual(manifest.extensionDependencies, ['becoder.becoder-setup']);

		const runnerSource = fs.readFileSync(path.join(extensionPath, 'src', 'compilerRunner.ts'), 'utf8');
		for (const argument of [
			"'-fsyntax-only'",
			"'-O2'",
			"'-x'",
			"'-std=c17'",
			"'-std=c++20'",
			"'-DDEBUGER_H'",
			"'-I'",
			"'-fdiagnostics-format=json'",
			"'-fdiagnostics-color=never'",
			"'-iquote'"
		]) {
			assert.ok(runnerSource.includes(argument), `Missing GCC diagnostics argument ${argument}`);
		}
		assert.doesNotMatch(runnerSource, /['"]-(?:Wall|Werror|pedantic)['"]/);
		assert.ok(fs.existsSync(path.join(extensionPath, 'resources', 'diagnostic-include', 'bits', 'debugger.h')));
		assert.match(runnerSource, /spawn\(compilerPath/);
		assert.match(runnerSource, /shell: false/);

		const extensionSource = fs.readFileSync(path.join(extensionPath, 'src', 'extension.ts'), 'utf8');
		assert.match(extensionSource, /createDiagnosticCollection\(diagnosticSource\)/);
		assert.match(extensionSource, /DiagnosticSeverity\.Error/);
		assert.doesNotMatch(extensionSource, /createTerminal|showErrorMessage|showWarningMessage|showInformationMessage/);
	});

	test('owns Stage 4.3 Runner as a shell-free BC pseudoterminal', () => {
		const extensionPath = path.join(extensionsRoot, 'danielpinto8zz6.c-cpp-compile-run');
		const manifest = readJson<{
			name?: string;
			publisher?: string;
			extensionDependencies?: readonly string[];
			capabilities?: { untrustedWorkspaces?: { supported?: boolean } };
			contributes?: {
				commands?: readonly { command?: string }[];
				menus?: Record<string, readonly { command?: string }[]>;
			};
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.runner');
		assert.deepStrictEqual(manifest.extensionDependencies, ['becoder.becoder-setup']);
		assert.strictEqual(manifest.capabilities?.untrustedWorkspaces?.supported, false);
		assert.deepStrictEqual(manifest.contributes?.commands?.map(command => command.command), [
			'becoder.runner.openPanel',
			'becoder.runner.run',
			'becoder.runner.runWithInput'
		]);
		assert.deepStrictEqual(manifest.contributes?.menus?.['editor/title']?.map(item => item.command), [
			'becoder.runner.run',
			'becoder.runner.runWithInput'
		]);

		const terminalSource = fs.readFileSync(path.join(extensionPath, 'src', 'bcTerminal.ts'), 'utf8');
		assert.match(terminalSource, /implements vscode\.Pseudoterminal/);
		assert.match(terminalSource, /osc633CommandFinished/);
		assert.match(terminalSource, /renderBcCommand/);
		const managerSource = fs.readFileSync(path.join(extensionPath, 'src', 'compile-run-manager.ts'), 'utf8');
		assert.match(managerSource, /createTerminal\(\{[\s\S]*pty: pseudoterminal/);
		assert.match(managerSource, /panelReadyMs = await pseudoterminal\.waitForOpen\(panelStartedAt\)/);
		assert.match(managerSource, /request\.exitCode = 1;[\s\S]*await this\.executor\.cancel\(\)/);
		assert.doesNotMatch(managerSource, /sendText|createTerminal\([^\{]/);
		const processSource = fs.readFileSync(path.join(extensionPath, 'src', 'runnerProcess.ts'), 'utf8');
		assert.match(processSource, /shell: false/);
		for (const argument of ['-O2', '-Wall', '-DDEBUG', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always']) {
			assert.ok(processSource.includes(argument), `Missing Runner compiler argument ${argument}`);
		}
		assert.doesNotMatch(processSource, /powershell(?:\.exe)?|cmd(?:\.exe)?/i);
		assert.match(processSource, /'runtime-error'/);
		assert.match(processSource, /new Osc633Filter\(\)/);
		assert.match(fs.readFileSync(path.join(extensionPath, 'src', 'terminalVisuals.ts'), 'utf8'), /===== \$\{message\} =====/);
		for (const obsoleteFile of [
			'resources/becoder-runner.ps1',
			'resources/runner-init.ps1',
			'resources/run.cmd'
		]) {
			assert.ok(!fs.existsSync(path.join(extensionPath, obsoleteFile)));
		}

		const explorerSource = fs.readFileSync(path.join(
			repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'files', 'browser', 'views', 'explorerViewer.ts'), 'utf8');
		assert.ok(explorerSource.indexOf('comparePinnedInput(statA, statB)') < explorerSource.indexOf('const reverse ='));
		assert.match(explorerSource, /stat\.name === 'input' && !stat\.isDirectory && !stat\.isSymbolicLink && !stat\.isUnknown/);
	});
});
