/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
// eslint-disable-next-line local/code-import-patterns -- Electron-only integration reads the shipped manifest fixtures.
import fs from 'fs';
// eslint-disable-next-line local/code-import-patterns -- Resolve source resources from the isolated Electron output root.
import path from 'path';
import { FileAccess } from '../../../../../base/common/network.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationNode, IConfigurationRegistry, Extensions, parseScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { localizeManifest, ITranslations } from '../../../../../platform/extensionManagement/common/extensionNls.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogger } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DefaultSettings } from '../../../../services/preferences/common/preferencesModels.js';
import { SettingsTreeGroupElement, SettingsTreeSettingElement } from '../../../preferences/browser/settingsTreeModels.js';

suite('BeCoder shipped setting labels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const root = path.resolve(FileAccess.asFileUri('vs/base/common/network.js').fsPath, '../../../../..');
	const folders = ['aadityanarayan.code-snap', 'becoder.beacon', 'becoder.cph', 'becoder.notebook', 'becoder.oj-connect', 'becoder.setup', 'danielpinto8zz6.c-cpp-compile-run', 'ipynb', 'json-language-features', 'markdown-language-features', 'markdown-math', 'mathematic.vscode-pdf', 'mermaid-markdown-features'];
	const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
	const languagePack = path.join(root, 'extensions/MS-CEINTL.vscode-language-pack-zh-hans');
	const pack = readJson<{ contributes: { localizations: { translations: { id: string; path: string }[] }[] } }>(path.join(languagePack, 'package.json'));
	const translations = new Map(pack.contributes.localizations[0].translations.map(item => [item.id, path.join(languagePack, item.path)]));

	for (const [round, locale] of ['en', 'zh-cn', 'en'].entries()) {
		test(`all 118 settings reach the display model in ${locale}, round ${round + 1}`, () => {
			const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
			const nodes: IConfigurationNode[] = [];
			for (const folder of folders) {
				const directory = path.join(root, 'extensions', folder);
				const raw = readJson<IExtensionManifest>(path.join(directory, 'package.json'));
				const fallback = readJson<ITranslations>(path.join(directory, 'package.nls.json'));
				const translation = translations.get(`${raw.publisher}.${raw.name}`);
				const messages = locale === 'en' ? fallback : translation ? readJson<{ contents: { package: ITranslations } }>(translation).contents.package : readJson<ITranslations>(path.join(directory, 'package.nls.zh-cn.json'));
				const localized = localizeManifest(new NullLogger(), raw, messages, fallback);
				const configurations = localized.contributes!.configuration as IConfigurationNode | IConfigurationNode[];
				for (const node of Array.isArray(configurations) ? configurations : [configurations]) {
					node.id ??= `${localized.publisher}.${localized.name}`;
					node.title ??= localized.displayName;
					node.extensionInfo = { id: `${localized.publisher}.${localized.name}` };
					for (const property of Object.values(node.properties!)) {
						property.scope = parseScope(String(property.scope ?? 'window'));
						// Mirror configurationExtensionPoint's legacy tag adaptation.
						if (property.tags?.some(tag => tag.toLowerCase() === 'onexp')) { property.experiment = { mode: 'startup' }; }
					}
					nodes.push(node);
				}
			}
			registry.registerConfigurations(nodes);
			store.add(toDisposable(() => registry.deregisterConfigurations(nodes)));
			const configuration = new TestConfigurationService();
			const model = store.add(new DefaultSettings([], ConfigurationTarget.USER, configuration));
			const settings = new Map(model.getRegisteredGroups().flatMap(group => group.sections).flatMap(section => section.settings).map(setting => [setting.key, setting]));
			let checked = 0;
			for (const node of nodes) {
				const group = store.add(new SettingsTreeGroupElement(node.id!, undefined, node.title!, 0, false));
				for (const [key, property] of Object.entries(node.properties!)) {
					const setting = settings.get(key)!;
					assert.ok(setting, key);
					const element = store.add(new SettingsTreeSettingElement(setting, group, ConfigurationTarget.USER_LOCAL, true, undefined, {} as never, {} as never, {} as never, configuration as never));
					assert.strictEqual(element.displayLabel, property.title, key);
					assert.strictEqual(element.displayCategory, node.title, key);
					assert.strictEqual(/[\u3400-\u9fff]/.test(element.displayLabel), locale === 'zh-cn', key);
					assert.deepStrictEqual(setting.value, property.default, key);
					checked++;
				}
			}
			assert.strictEqual(checked, 118);
		});
	}
});
