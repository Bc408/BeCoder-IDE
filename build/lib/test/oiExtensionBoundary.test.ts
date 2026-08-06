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

	test('owns One Monokai as a TextMate-only BeCoder theme', () => {
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
			false);

		const theme = readJson<{ semanticHighlighting?: boolean }>(
			path.join(extensionPath, 'themes', 'OneMonokai-color-theme.json'));
		assert.strictEqual(theme.semanticHighlighting, false);
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

	test('keeps clangd out of the visual coloring pipeline', () => {
		const extensionPath = path.join(extensionsRoot, 'llvm-vs-code-extensions.vscode-clangd');
		const manifest = readJson<IExtensionManifest>(path.join(extensionPath, 'package.json'));
		const properties = manifest.contributes?.configuration?.properties ?? {};
		assert.ok(!('clangd.semanticHighlighting' in properties));
		assert.ok(!('clangd.inactiveRegions.useBackgroundHighlight' in properties));
		assert.ok(!('clangd.inactiveRegions.opacity' in properties));
		assert.ok(!(manifest.contributes?.colors ?? []).some(color => color.id === 'clangd.inactiveRegions.background'));
		assert.ok(!(manifest.contributes?.commands ?? []).some(command => command.command === 'clangd.inlayHints.toggle'));

		for (const file of ['semantic-tokens-cache.ts', 'inactive-regions.ts', 'inlay-hints.ts']) {
			assert.ok(!fs.existsSync(path.join(extensionPath, 'src', file)));
		}
		const contextSource = fs.readFileSync(path.join(extensionPath, 'src', 'clangd-context.ts'), 'utf8');
		assert.match(contextSource, /registrationMethod === 'textDocument\/semanticTokens'/);
		assert.match(contextSource, /registrationMethod === 'textDocument\/inlayHint'/);
		assert.doesNotMatch(contextSource, /provideDocumentSemanticTokens/);
	});
});
