/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BeaconPages, type IBeaconPageSource } from '../../common/beaconPages.js';

const code = (uri: string, extra: Partial<IBeaconPageSource> = {}): IBeaconPageSource => ({ key: {}, kind: 'text', title: 'main.cpp', uri, version: '1', languageId: 'cpp', visible: true, read: async () => 'same code', ...extra });

suite('Beacon visible document identities', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('merges visible and active views before reading, without merging equal contents or untitled URIs', async () => {
		let reads = 0;
		const first = code('file:///C:/outside/main.cpp', { visible: false, read: async () => { reads++; return 'same code'; } });
		let opened = [first, { ...first, key: {}, visible: true, active: true }, code('file:///C:/outside/other.cpp'), code('untitled:Untitled-1'), code('untitled:Untitled-2')];
		const pages = new BeaconPages(() => opened);
		const listing = pages.list();
		assert.strictEqual(listing.length, 4);
		assert.strictEqual(listing[0].active, true);
		assert.strictEqual(Reflect.get(listing[0], 'visible'), true);
		assert.strictEqual((await pages.readVisibleCurrentCode()).length, 4);
		assert.strictEqual(reads, 1);
		opened = opened.slice(1);
		pages.forget(first.key);
		assert.strictEqual(pages.list()[0].id, listing[0].id);
		assert.strictEqual((await pages.readVisibleCurrentCode()).length, 4);
	});

	test('reads all Notebook content cells but never background or unknown owners', async () => {
		let reads = 0;
		const notebook: IBeaconPageSource = { ...code('untitled:Notebook-1'), kind: 'notebook', dirty: true, languageId: undefined, readNotebook: async () => { reads++; return [{ cellNumber: 1, kind: 'markdown', language: 'markdown', source: 'notes' }, { cellNumber: 2, kind: 'code', language: 'cpp', source: 'same' }, { cellNumber: 3, kind: 'input', language: 'becoder-input', source: '1', name: 'case' }, { cellNumber: 4, kind: 'code', language: 'cpp', source: 'same' }]; } };
		const opened: IBeaconPageSource[] = [notebook, { ...notebook, key: {} }, { ...notebook, key: {}, uri: 'file:///C:/background.bcnb', visible: false }, { ...code('file:///C:/unknown.bcnb'), kind: 'unsupported' }];
		const pages = new BeaconPages(() => opened);
		const files = await pages.readVisibleCurrentCode();
		assert.strictEqual(files.length, 1);
		assert.strictEqual(files[0].kind, 'notebook');
		assert.strictEqual(files[0].filePath, null);
		assert.strictEqual(files[0].isDirty, true);
		assert.deepStrictEqual(Reflect.get(files[0], 'cells').map((cell: { cellNumber: number }) => cell.cellNumber), [1, 2, 3, 4]);
		assert.strictEqual(reads, 1);
		const listed = pages.list().find(page => page.kind === 'notebook')!;
		await assert.rejects(pages.read(listed.id, listed.version), /notebook-content-owner/);
	});

	test('rejects stale content, closure, and a changed visible document set', async () => {
		for (const change of ['version', 'close', 'visible-set'] as const) {
			let finish!: (value: string) => void;
			let opened = [code('file:///C:/main.cpp', { read: () => new Promise(resolve => { finish = resolve; }) })];
			const pages = new BeaconPages(() => opened);
			const reading = pages.readVisibleCurrentCode();
			if (change === 'version') { opened = [{ ...opened[0], version: '2' }]; }
			if (change === 'close') { opened = []; }
			if (change === 'visible-set') { opened = [...opened, code('untitled:Untitled-2')]; }
			finish('old');
			await assert.rejects(reading, /page-changed/);
		}
	});

	test('different browser tabs retain their own page identity even with equal URLs', () => {
		const first = { ...code('https://example.com/'), kind: 'browser' as const };
		assert.strictEqual(new BeaconPages(() => [first, { ...first, key: {} }]).list().length, 2);
	});

	test('distinct untitled URIs remain distinct even if their names differ only in case', async () => {
		const pages = new BeaconPages(() => [code('untitled:Notes'), code('untitled:notes')]);
		assert.strictEqual(pages.list().length, 2);
		assert.strictEqual((await pages.readVisibleCurrentCode()).length, 2);
	});
});
