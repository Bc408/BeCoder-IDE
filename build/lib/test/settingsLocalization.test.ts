/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { suite, test } from 'node:test';

interface ISettingProperty {
	title?: string;
	description?: string;
	markdownDescription?: string;
	enum?: (string | number)[];
	enumItemLabels?: string[];
	enumDescriptions?: string[];
	markdownEnumDescriptions?: string[];
}

interface IConfiguration {
	title?: string;
	properties: Record<string, ISettingProperty>;
}

interface IManifest {
	name: string;
	publisher: string;
	displayName?: string;
	contributes?: { configuration?: IConfiguration | IConfiguration[] };
}

type Messages = Record<string, string | { message: string }>;

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const extensionsRoot = path.join(repositoryRoot, 'extensions');
const languagePackRoot = path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans');
const packaging = fs.readFileSync(path.join(repositoryRoot, 'build/lib/extensions.ts'), 'utf8');

function readJson<T>(file: string): T {
	return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function packagingSet(name: string): Set<string> {
	const declaration = new RegExp(`(?:export )?const ${name} = (?:new Set\\()?\\[([\\s\\S]*?)\\]\\)?;`).exec(packaging);
	assert.ok(declaration, `Missing production packaging list: ${name}`);
	return new Set([...declaration[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
}

const excluded = new Set([...packagingSet('excludedForOIDistribution'), ...packagingSet('excludedExtensions')]);
const product = readJson<{ builtInExtensions: { name: string }[] }>(path.join(repositoryRoot, 'product.json'));
const extensionConfigurations = fs.readdirSync(extensionsRoot, { withFileTypes: true })
	.filter(entry => entry.isDirectory() && !excluded.has(entry.name) && !product.builtInExtensions.some(extension => extension.name === entry.name))
	.filter(entry => fs.existsSync(path.join(extensionsRoot, entry.name, 'package.json')))
	.map(entry => ({ folder: entry.name, manifest: readJson<IManifest>(path.join(extensionsRoot, entry.name, 'package.json')) }))
	.filter(extension => extension.manifest.contributes?.configuration);

function configurations(manifest: IManifest): IConfiguration[] {
	const value = manifest.contributes?.configuration;
	return value ? Array.isArray(value) ? value : [value] : [];
}

const pack = readJson<{ contributes: { localizations: { translations: { id: string; path: string }[] }[] } }>(path.join(languagePackRoot, 'package.json'));
const translations = new Map(pack.contributes.localizations[0].translations.map(translation => [translation.id, path.resolve(languagePackRoot, translation.path)]));

function messages(folder: string, manifest: IManifest, locale: 'en' | 'zh-cn'): { primary: Messages; fallback: Messages } {
	const fallback = readJson<Messages>(path.join(extensionsRoot, folder, 'package.nls.json'));
	if (locale === 'en') { return { primary: fallback, fallback }; }
	const translation = translations.get(`${manifest.publisher}.${manifest.name}`);
	if (translation) { return { primary: readJson<{ contents: { package: Messages } }>(translation).contents.package, fallback }; }
	return { primary: readJson<Messages>(path.join(extensionsRoot, folder, 'package.nls.zh-cn.json')), fallback };
}

// Exercise the production token replacement, including its language-pack-first
// fallback to English. The scanner chooses these bundles; no global merge is added.
const require = createRequire(path.join(extensionsRoot, 'becoder.beacon/package.json'));
const { build } = require('esbuild') as { build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }> };
const bundled = await build({ entryPoints: [path.join(repositoryRoot, 'src/vs/platform/extensionManagement/common/extensionNls.ts')], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { localizeManifest } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')) as { localizeManifest(logger: { warn(message: string): void; error(message: string): void }, manifest: IManifest, primary: Messages, fallback: Messages): IManifest };

function localized(folder: string, manifest: IManifest, locale: 'en' | 'zh-cn'): IManifest {
	const bundle = messages(folder, manifest, locale);
	return localizeManifest({ warn: message => assert.fail(message), error: message => assert.fail(message) }, structuredClone(manifest), bundle.primary, bundle.fallback);
}

suite('Bundled settings localization', () => {
	test('covers the actual Windows extension payload without restoring excluded features', () => {
		assert.deepStrictEqual(extensionConfigurations.map(({ folder, manifest }) => [folder, configurations(manifest).reduce((count, configuration) => count + Object.keys(configuration.properties).length, 0)]), [
			['aadityanarayan.code-snap', 11], ['becoder.beacon', 2], ['becoder.cph', 17], ['becoder.notebook', 1], ['becoder.oj-connect', 14], ['becoder.setup', 4], ['danielpinto8zz6.c-cpp-compile-run', 4], ['ipynb', 2], ['json-language-features', 9], ['markdown-language-features', 42], ['markdown-math', 2], ['mathematic.vscode-pdf', 2], ['mermaid-markdown-features', 8]
		]);
		assert.strictEqual(extensionConfigurations.flatMap(({ manifest }) => configurations(manifest).flatMap(configuration => Object.keys(configuration.properties))).length, 118);
	});

	for (const locale of ['en', 'zh-cn'] as const) {
		test(`all 118 ${locale} settings have explicit resolved titles`, () => {
			const missing: string[] = [];
			for (const { folder, manifest } of extensionConfigurations) {
				for (const configuration of configurations(localized(folder, manifest, locale))) {
					for (const [key, property] of Object.entries(configuration.properties)) {
						if (!property.title || /%[\w.-]+%/.test(property.title) || (locale === 'zh-cn' ? !/[\u3400-\u9fff]/.test(property.title) : /[\u3400-\u9fff]/.test(property.title))) { missing.push(key); }
					}
				}
			}
			assert.deepStrictEqual(missing, [], `Missing ${locale} setting labels`);
		});

		test(`${locale} descriptions and enum labels resolve with their owning title bundle`, () => {
			for (const { folder, manifest } of extensionConfigurations) {
				for (const configuration of configurations(localized(folder, manifest, locale))) {
					if (configuration.title) {
						assert.doesNotMatch(configuration.title, /%[\w.-]+%/, `${folder} category`);
					}
					for (const [key, property] of Object.entries(configuration.properties)) {
						for (const text of [property.description, property.markdownDescription, ...(property.enumItemLabels ?? []), ...(property.enumDescriptions ?? []), ...(property.markdownEnumDescriptions ?? [])]) {
							if (text) { assert.doesNotMatch(text, /%[\w.-]+%/, `${key} ${locale}`); }
						}
						if (property.enum && !key.startsWith('becoder.runner.')) {
							assert.strictEqual(property.enumItemLabels?.length, property.enum.length, `${key} needs visible enum labels`);
							for (const label of property.enumItemLabels ?? []) {
								if (locale === 'zh-cn') {
									assert.ok(/[\u3400-\u9fff]/.test(label) || /^(?:C|C\+\+|VS Code|English|\d+%)$/.test(label), `${key} has an untranslated enum label: ${label}`);
								} else {
									assert.doesNotMatch(label, /[\u3400-\u9fff]/, `${key} has a Chinese label in English`);
								}
							}
						}
					}
				}
			}
		});
	}

	test('language-pack titles are present instead of silently falling back to English', () => {
		for (const { folder, manifest } of extensionConfigurations) {
			if (!translations.has(`${manifest.publisher}.${manifest.name}`)) { continue; }
			const bundle = messages(folder, manifest, 'zh-cn');
			for (const configuration of configurations(manifest)) {
				for (const [key, property] of Object.entries(configuration.properties)) {
					assert.match(property.title ?? '', /^%[\w.-]+%$/, key);
					assert.ok(bundle.primary[property.title!.slice(1, -1)], `${key} is absent from the installed language pack`);
				}
			}
		}
	});

	test('missing language-pack keys still fall back to English and changing locale starts from original tokens', () => {
		const extension = extensionConfigurations.find(extension => extension.folder === 'ipynb')!;
		const english = localized(extension.folder, extension.manifest, 'en');
		const chinese = localized(extension.folder, extension.manifest, 'zh-cn');
		assert.notDeepStrictEqual(configurations(chinese), configurations(english));
		assert.deepStrictEqual(localized(extension.folder, extension.manifest, 'en'), english);
		const fallback = messages(extension.folder, extension.manifest, 'en').fallback;
		assert.deepStrictEqual(localizeManifest({ warn: message => assert.fail(message), error: message => assert.fail(message) }, structuredClone(extension.manifest), {}, fallback), english);
	});
});
