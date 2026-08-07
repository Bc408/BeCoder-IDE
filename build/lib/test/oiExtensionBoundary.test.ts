/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

suite('OI extension boundary', () => {
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
