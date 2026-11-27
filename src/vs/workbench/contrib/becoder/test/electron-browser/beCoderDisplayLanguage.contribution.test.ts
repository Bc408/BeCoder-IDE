/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Language } from '../../../../../base/common/platform.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguagePackItem } from '../../../../../platform/languagePacks/common/languagePacks.js';
import { BeCoderDisplayLanguageContribution, BeCoderDisplayLanguageController, BeCoderDisplayLanguageSetting, findBeCoderLanguagePack, isBeCoderDisplayLanguage, toBeCoderDisplayLanguage } from '../../electron-browser/beCoderDisplayLanguage.contribution.js';

function languageFixture(store: Pick<DisposableStore, 'add'>, runtime: 'en' | 'zh-cn', local?: string, application?: string, applicationProfile = false) {
	const changed = store.add(new Emitter<IConfigurationChangeEvent>());
	const runtimeLanguage = sinon.stub(Language, 'value').returns(runtime);
	store.add({ dispose: () => runtimeLanguage.restore() });
	const writes: { value: unknown; target: ConfigurationTarget }[] = [];
	const applied: string[] = [];
	const restartDecisions: boolean[] = [];
	let accepted = true;
	let writeGate: DeferredPromise<void> | undefined;
	let applyGate: DeferredPromise<boolean> | undefined;
	const value = () => (applicationProfile ? application : local) ?? 'zh-cn';
	const fire = () => changed.fire({ source: ConfigurationTarget.USER_LOCAL, affectedKeys: new Set([BeCoderDisplayLanguageSetting]), change: { keys: [BeCoderDisplayLanguageSetting], overrides: [] }, affectsConfiguration: key => key === BeCoderDisplayLanguageSetting });
	store.add(new BeCoderDisplayLanguageContribution({
		onDidChangeConfiguration: changed.event,
		inspect: () => ({ defaultValue: 'zh-cn', userLocalValue: local, applicationValue: application, value: value() }),
		getValue: () => value(),
		updateValue: async (_key: string, next: unknown, target: ConfigurationTarget) => {
			writes.push({ value: next, target });
			const gate = writeGate; writeGate = undefined;
			if (gate) { await gate.p; }
			if (applicationProfile) { application = next as string | undefined; } else { local = next as string | undefined; }
			fire();
		},
	} as never, {
		whenInstalledExtensionsRegistered: async () => { }, extensions: [{ identifier: { value: 'becoder.becoder-setup' } }],
	} as never, {
		getInstalledLanguages: async () => [{ id: 'en', label: 'English' }, { id: 'zh-cn', label: '简体中文', extensionId: 'ms-ceintl.vscode-language-pack-zh-hans' }],
	} as never, {
		setLocale: async (pack: ILanguagePackItem, _skipDialog: boolean, shouldRestart: () => boolean) => {
			applied.push(pack.id!);
			const gate = applyGate; applyGate = undefined;
			const result = gate ? await gate.p : accepted;
			restartDecisions.push(shouldRestart());
			return result;
		},
	} as never, {} as never, {} as never));
	return {
		writes, applied, restartDecisions, value,
		get local() { return local; }, get application() { return application; },
		setAccepted(next: boolean) { accepted = next; },
		pauseNextWrite() { const gate = new DeferredPromise<void>(); writeGate = gate; return gate; },
		pauseNextApply() { const gate = new DeferredPromise<boolean>(); applyGate = gate; return gate; },
		configure(next: string) { if (applicationProfile) { application = next; } else { local = next; } fire(); },
		async settled() { for (let index = 0; index < 30; index++) { await Promise.resolve(); } },
	};
}

suite('BeCoder display language', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a default Chinese startup does not create a configured override', async () => {
		const f = languageFixture(store, 'zh-cn'); await f.settled();
		assert.deepStrictEqual(f.writes, []);
		assert.strictEqual(f.local, undefined);
		assert.strictEqual(f.value(), 'zh-cn');
	});

	test('startup removes an old explicitly stored default Chinese value', async () => {
		const f = languageFixture(store, 'zh-cn', 'zh-cn'); await f.settled();
		assert.deepStrictEqual(f.writes, [{ value: undefined, target: ConfigurationTarget.USER_LOCAL }]);
		assert.strictEqual(f.local, undefined);
	});

	test('application-scope defaults are normalized in the shared profile target', async () => {
		const f = languageFixture(store, 'zh-cn', undefined, 'zh-cn', true); await f.settled();
		assert.strictEqual(f.application, undefined);
		assert.deepStrictEqual(f.writes, [{ value: undefined, target: ConfigurationTarget.USER_LOCAL }]);
	});

	test('English startup retains a real override even when another profile has an ignored matching value', async () => {
		const f = languageFixture(store, 'en', 'en', undefined, true); await f.settled();
		assert.strictEqual(f.application, 'en');
		assert.deepStrictEqual(f.writes, [{ value: 'en', target: ConfigurationTarget.USER_LOCAL }]);
	});

	test('selecting Chinese after English removes its override even when restart is deferred', async () => {
		const f = languageFixture(store, 'en', 'en'); await f.settled();
		f.configure('zh-cn'); await f.settled();
		assert.deepStrictEqual(f.applied, ['zh-cn']);
		assert.strictEqual(f.local, undefined);
		f.configure('en'); await f.settled();
		assert.deepStrictEqual(f.applied, ['zh-cn', 'en']);
		assert.strictEqual(f.local, 'en');
	});

	test('failed language changes restore a non-default English selection', async () => {
		const f = languageFixture(store, 'en', 'en'); await f.settled();
		f.setAccepted(false); f.configure('zh-cn'); await f.settled();
		assert.strictEqual(f.local, 'en');
		assert.deepStrictEqual(f.applied, ['zh-cn']);
	});

	test('failed English changes restore default Chinese without an override', async () => {
		const f = languageFixture(store, 'zh-cn'); await f.settled();
		f.setAccepted(false); f.configure('en'); await f.settled();
		assert.strictEqual(f.local, undefined);
		assert.strictEqual(f.value(), 'zh-cn');
	});

	test('a newer user choice during default cleanup is retained and the old locale is not applied', async () => {
		const f = languageFixture(store, 'en', 'en'); await f.settled();
		const cleanup = f.pauseNextWrite();
		f.configure('zh-cn'); await f.settled();
		f.configure('en'); await f.settled();
		await cleanup.complete(); await f.settled();
		assert.strictEqual(f.local, 'en');
		assert.deepStrictEqual(f.applied, []);
	});

	test('a superseded locale cannot restart while the newest selection is pending', async () => {
		const f = languageFixture(store, 'en', 'en'); await f.settled();
		const applying = f.pauseNextApply();
		f.configure('zh-cn'); await f.settled();
		f.configure('en'); await f.settled();
		await applying.complete(true); await f.settled();
		assert.deepStrictEqual(f.applied, ['zh-cn', 'en']);
		assert.deepStrictEqual(f.restartDecisions, [false, true]);
		assert.strictEqual(f.local, 'en');
	});

	test('a newer user choice during failed-change rollback is not lost', async () => {
		const f = languageFixture(store, 'zh-cn'); await f.settled();
		const applying = f.pauseNextApply();
		f.configure('en'); await f.settled();
		const rollback = f.pauseNextWrite();
		await applying.complete(false); await f.settled();
		f.configure('en'); await f.settled();
		await rollback.complete(); await f.settled();
		assert.strictEqual(f.local, 'en');
		assert.deepStrictEqual(f.applied, ['en', 'en']);
	});

	test('an idle request for the current language does not block the next change', async () => {
		const applied: string[] = [];
		const controller = new BeCoderDisplayLanguageController('zh-cn', async language => { applied.push(language); return true; }, async () => { });
		await controller.request('zh-cn'); await controller.request('zh-cn');
		await controller.request('en'); await controller.whenIdle();
		assert.deepStrictEqual(applied, ['en']);
		assert.strictEqual(controller.selected, 'en');
	});

	test('normalizes supported display languages', () => {
		assert.strictEqual(toBeCoderDisplayLanguage('zh-CN'), 'zh-cn');
		assert.strictEqual(toBeCoderDisplayLanguage('zh-Hans'), 'zh-cn');
		assert.strictEqual(toBeCoderDisplayLanguage('en-US'), 'en');
		assert.strictEqual(isBeCoderDisplayLanguage('zh-cn'), true);
		assert.strictEqual(isBeCoderDisplayLanguage('en'), true);
		assert.strictEqual(isBeCoderDisplayLanguage('de'), false);
	});

	test('accepts Simplified Chinese only from the protected bundled language pack', () => {
		const languages: ILanguagePackItem[] = [
			{ label: 'Missing ID' },
			{ id: 'zh-cn', label: 'Untrusted Chinese', extensionId: 'example.language-pack-zh-hans' },
			{ id: 'ZH-CN', label: 'Bundled Chinese', extensionId: 'MS-CEINTL.VSCODE-LANGUAGE-PACK-ZH-HANS' },
		];

		assert.strictEqual(findBeCoderLanguagePack(languages, 'zh-cn'), languages[2]);
	});

	test('uses the built-in English messages without an extension', () => {
		const english: ILanguagePackItem = { id: 'en', label: 'English' };
		assert.strictEqual(findBeCoderLanguagePack([english], 'en'), english);
	});

	test('restores the selected language when applying a setting fails', async () => {
		const settingUpdates: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async () => false,
			async language => { settingUpdates.push(language); },
		);

		await controller.request('zh-cn');

		assert.strictEqual(controller.selected, 'en');
		assert.deepStrictEqual(settingUpdates, ['en']);
	});

	test('keeps one active change and applies only the latest pending language', async () => {
		const firstChange = new DeferredPromise<boolean>();
		const appliedLanguages: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				appliedLanguages.push(language);
				return language === 'zh-cn' ? firstChange.p : true;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		firstChange.complete(true);
		await processing;

		assert.strictEqual(controller.selected, 'en');
		assert.deepStrictEqual(appliedLanguages, ['zh-cn', 'en']);
	});

	test('drops superseded pending language changes', async () => {
		const firstChange = new DeferredPromise<boolean>();
		const appliedLanguages: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				appliedLanguages.push(language);
				return firstChange.p;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		controller.request('zh-cn');
		firstChange.complete(true);
		await processing;

		assert.strictEqual(controller.selected, 'zh-cn');
		assert.deepStrictEqual(appliedLanguages, ['zh-cn']);
	});

	test('does not restart for a superseded active language change', async () => {
		const firstChange = new DeferredPromise<void>();
		const restartDecisions: boolean[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				if (language === 'zh-cn') {
					await firstChange.p;
				}
				restartDecisions.push(controller.isLatestRequest(language));
				return true;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		firstChange.complete();
		await processing;

		assert.deepStrictEqual(restartDecisions, [false, true]);
		assert.strictEqual(controller.selected, 'en');
	});
});
