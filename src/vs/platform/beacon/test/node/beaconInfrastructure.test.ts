/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from '../../../../base/common/path.js';
import { tmpdir } from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BeaconStore, prepareBeaconWorkspace } from '../../node/beaconStore.js';
import { BeaconCoordinator } from '../../node/beaconCoordinator.js';
import { BeaconNotebookResources } from '../../node/beaconNotebookResources.js';
import { BeaconPages, type IBeaconPageSource } from '../../common/beaconPages.js';
import { readBeaconBrowserPage, type IBeaconLoadedBrowserPage } from '../../common/beaconBrowserPage.js';
import { restoreBeaconWindowSelection, type IBeaconConversation, type IBeaconWindowSelection } from '../../common/beaconContext.js';

async function fixture(run: (directory: string) => Promise<void>): Promise<void> {
	const directory = await fs.mkdtemp(path.join(tmpdir(), 'becoder-beacon-infrastructure-'));
	try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

const conversation = (id: string, text = 'original'): IBeaconConversation => ({ id, title: 'Title', updatedAt: 1, messages: [{ role: 'user', text }], error: '', workspace: [] });

suite('Beacon bounded context queues', function () {
	this.timeout(10000);
	ensureNoDisposablesAreLeakedInTestSuite();







	test('conversation deletion rejects a replaced ordinary conversation directory', async () => fixture(async root => {
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		await store.saveConversation(conversation('one'), 0); await fs.writeFile(path.join(root, '.beaconWork', 'conversations', 'one', 'code-snapshots.json'), 'legacy-body');
		const directory = path.join(root, '.beaconWork', 'conversations', 'one'), retired = path.join(root, '.beaconWork', 'conversations', 'old-one');
		const read = store.readConversation.bind(store); let replaced = false;
		store.readConversation = async id => {
			const value = await read(id);
			if (id === 'one' && !replaced) { replaced = true; await fs.rename(directory, retired); await fs.mkdir(directory); await fs.writeFile(path.join(directory, 'conversation.json'), JSON.stringify({ version: 1, revision: 1, data: conversation('one', 'replacement') })); await fs.writeFile(path.join(directory, 'code-snapshots.json'), 'replacement-owned-body'); }
			return value;
		};
		await assert.rejects(store.deleteConversation('one'), /changed/);
		assert.equal(await fs.readFile(path.join(directory, 'code-snapshots.json'), 'utf8'), 'replacement-owned-body');
		assert.ok((await fs.readFile(path.join(directory, 'conversation.json'), 'utf8')).includes('replacement'));
	}));
	test('failed materials removal restores its owned name so retry cleans the actual private body', async () => fixture(async root => {
		const binding = await prepareBeaconWorkspace(root, true), store = new BeaconStore(binding);
		await store.saveConversation(conversation('one'), 0);
		const directory = path.join(root, '.beaconWork', 'conversations', 'one', 'materials'); await fs.mkdir(directory); await fs.writeFile(path.join(directory, 'old.json'), 'private-body');
		const publication = { rename: fs.rename, unlink: fs.unlink, rm: async () => { throw Object.assign(new Error('blocked'), { code: 'EACCES' }); } };
		await assert.rejects(new BeaconStore(binding, publication).deleteConversation('one'), /blocked/);
		assert.equal(await fs.readFile(path.join(directory, 'old.json'), 'utf8'), 'private-body');
		await store.deleteConversation('one'); await assert.rejects(fs.stat(directory), /ENOENT/);
	}));

});

suite('Notebook resource occupancy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('different user blocks can run while rewrite rejects until every run retires', async () => fixture(async directory => {
		const file = path.join(directory, 'note.bcnb'); await fs.writeFile(file, '{}');
		const gate = new BeaconNotebookResources(); const first = await gate.begin(1, file, 'run'); const second = await gate.begin(1, file, 'run');
		await assert.rejects(gate.begin(2, file, 'edit'), /notebook-busy/); await gate.release(1, first);
		await assert.rejects(gate.begin(2, file, 'edit'), /notebook-busy/); await gate.release(1, second);
		const edit = await gate.begin(2, file, 'edit');
		await assert.rejects(gate.begin(1, file, 'run'), /notebook-busy/); await assert.rejects(gate.release(1, edit), /notebook-owner/);
		await gate.release(2, edit);
		await gate.report(2, [{ file, dirty: true }]); await assert.rejects(gate.begin(1, file, 'edit'), /other-window-dirty/); await gate.reset(2);
		const released = await gate.begin(1, file, 'edit'); await gate.reset(1); assert.equal(await gate.editing(file), false); await gate.release(1, released);
	}));
});

suite('Beacon currently open pages', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('loaded browser reads check owner, loading and navigation without exposing network methods', async () => {
		let changed = () => { }; let reads = 0; let disposed = 0;
		const page: IBeaconLoadedBrowserPage = {
			ownerWindowId: 1, url: () => 'https://oj.example/verdict', loading: () => false, closed: () => false,
			watchChange: listener => { changed = listener; return { dispose: () => { disposed++; } }; }, read: async script => { reads++; assert.ok(script.includes('innerText')); assert.equal(script.includes('fetch('), false); return 'opened verdict'; }
		};
		await assert.rejects(readBeaconBrowserPage(page, 2, page.url()), /owner/);
		await assert.rejects(readBeaconBrowserPage({ ...page, loading: () => true }, 1, page.url()), /changed/);
		assert.equal(reads, 0);
		assert.equal(await readBeaconBrowserPage(page, 1, page.url()), 'opened verdict');
		await assert.rejects(readBeaconBrowserPage({ ...page, read: async () => { changed(); return 'do not deliver'; } }, 1, page.url()), /changed/);
		assert.equal(disposed, 2);
	});
	test('loaded browser timeout and invalid results release navigation observation', async () => {
		let disposed = 0;
		const page: IBeaconLoadedBrowserPage = { ownerWindowId: 1, url: () => 'url', loading: () => false, closed: () => false, watchChange: () => ({ dispose: () => { disposed++; } }), read: async () => ({ hidden: 'unusable' }) };
		await assert.rejects(readBeaconBrowserPage(page, 1, 'url'), /too-large/);
		await assert.rejects(readBeaconBrowserPage({ ...page, read: () => new Promise(() => { }) }, 1, 'url', 1), /timeout/);
		assert.equal(disposed, 2);
	});
	test('reads dirty root-external page bytes and never substitutes an unavailable provider', async () => {
		let opened: IBeaconPageSource[] = [{ key: {}, kind: 'text', title: 'main.cpp', uri: 'file:///outside/main.cpp', dirty: true, version: '2', read: async () => 'dirty V2' }];
		const pages = new BeaconPages(() => opened);
		const listed = pages.list();
		assert.equal(listed.length, 1);
		assert.equal((await pages.read(listed[0].id, '2', 0, 5)).contents, 'dirty');
		assert.equal((await pages.read(listed[0].id, '2', 0, 5)).nextOffset, 5);
		await assert.rejects(pages.read(listed[0].id, '1'), /page-changed/);
		opened = [];
		await assert.rejects(pages.read(listed[0].id, '2'), /page-closed/);
	});
	test('rejects closure and navigation during an asynchronous page read', async () => {
		let finish!: (text: string) => void;
		let opened: IBeaconPageSource[] = [{ key: {}, kind: 'browser', title: 'OJ verdict', version: 'url-1', read: () => new Promise(resolve => { finish = resolve; }) }];
		const pages = new BeaconPages(() => opened);
		const page = pages.list()[0];
		const reading = pages.read(page.id, page.version);
		opened = []; finish('private verdict');
		await assert.rejects(reading, /page-closed/);
		opened = [{ key: {}, kind: 'browser', title: 'OJ', version: 'url-1', read: () => new Promise(resolve => { finish = resolve; }) }];
		const next = pages.list()[0]; const changed = pages.read(next.id, next.version);
		opened = [{ ...opened[0], version: 'url-2' }]; finish('old verdict');
		await assert.rejects(changed, /page-changed/);
	});
});

suite('Beacon workspace preparation and assets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('deleting a conversation removes its exclusive materials without deleting independent assets', async () => fixture(async root => {
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		await store.saveConversation(conversation('chat'), 0);
		const legacy = path.join(root, '.beaconWork', 'conversations', 'chat', 'materials'); await fs.mkdir(legacy); await fs.writeFile(path.join(legacy, 'runner-run-1.json'), 'legacy-body');
		const conversationRoot = path.join(root, '.beaconWork', 'conversations', 'chat');
		const independentAsset = path.join(root, '.beaconWork', 'independent.txt');
		await fs.writeFile(independentAsset, 'keep');
		await fs.access(path.join(conversationRoot, 'materials', 'runner-run-1.json'));
		await store.deleteConversation('chat');
		await assert.rejects(fs.access(path.join(conversationRoot, 'conversation.json')), { code: 'ENOENT' });
		await assert.rejects(fs.access(path.join(conversationRoot, 'materials')), { code: 'ENOENT' });
		assert.equal(await fs.readFile(independentAsset, 'utf8'), 'keep');
	}));
	test('a cleanup failure retains the original publication error and saved conversation', async () => fixture(async root => {
		const binding = await prepareBeaconWorkspace(root, true);
		const original = new BeaconStore(binding);
		await original.saveConversation(conversation('one'), 0);
		const publicationError = new Error('publication failed');
		const cleanupError = new Error('cleanup failed');
		const store = new BeaconStore(binding, {
			rename: async () => { throw publicationError; },
			unlink: async () => { throw cleanupError; }
		});
		await assert.rejects(store.saveConversation({ ...conversation('one'), title: 'unsaved-title' }, 1), error => error instanceof AggregateError && error.cause === publicationError && error.errors[0] === publicationError && error.errors[1] === cleanupError);
		assert.equal((await original.readConversation('one'))?.data.title, 'Title');
		assert.equal((await original.readConversation('one'))?.revision, 1);
	}));


	test('a lost binding is unavailable rather than an empty history', async () => fixture(async root => {
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		await fs.rename(path.join(root, '.beaconWork'), path.join(root, 'moved-assets'));
		await assert.rejects(store.listHistory());
		await assert.rejects(store.readConversation('one'));
	}));
	test('Windows capitalization does not make an ordinary asset directory invalid', async () => fixture(async root => {
		await fs.mkdir(path.join(root, '.BEACONWORK'));
		const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
		await store.saveConversation(conversation('one'), 0);
		assert.equal((await store.readConversation('one'))?.data.id, 'one');
	}));
	test('prepares an independent asset directory without changing project content', async () => fixture(async root => {
		await fs.writeFile(path.join(root, 'main.cpp'), 'original-source');
		const binding = await prepareBeaconWorkspace(root, true);
		assert.equal(binding.path, root);
		assert.equal((await fs.readdir(root)).includes('.beaconWork'), true);
		assert.equal((await fs.lstat(path.join(root, '.beaconWork'))).isDirectory(), true);
		assert.equal(await fs.readFile(path.join(root, 'main.cpp'), 'utf8'), 'original-source');
	}));

	test('preserves a conflicting ordinary file', async () => fixture(async root => {
		await fs.writeFile(path.join(root, '.beaconWork'), 'user-content');
		await assert.rejects(prepareBeaconWorkspace(root, true));
		assert.equal(await fs.readFile(path.join(root, '.beaconWork'), 'utf8'), 'user-content');
	}));

	test('rejects a redirected asset directory without writing into its target', async () => fixture(async parent => {
		const root = path.join(parent, 'root');
		const outside = path.join(parent, 'outside');
		await fs.mkdir(root); await fs.mkdir(outside);
		await fs.symlink(outside, path.join(root, '.beaconWork'), 'junction');
		await assert.rejects(prepareBeaconWorkspace(root, true));
		assert.deepEqual(await fs.readdir(outside), []);
	}));

	test('restoring an unprepared root does not silently create assets', async () => fixture(async root => {
		await assert.rejects(prepareBeaconWorkspace(root, false));
		assert.deepEqual(await fs.readdir(root), []);
	}));

	test('saves complete conversation data and rejects stale replacement', async () => fixture(async root => {
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		const first = await store.saveConversation(conversation('one'), 0);
		assert.equal(first.revision, 1);
		await store.saveConversation(conversation('one', 'latest'), 1);
		await assert.rejects(store.saveConversation(conversation('one', 'stale'), 1), /conflict/);
		assert.deepEqual((await store.readConversation('one'))?.data.messages, [{ role: 'user', text: 'latest' }]);
	}));

	test('rejects a redirected conversation directory and escaping identifiers', async () => fixture(async parent => {
		const root = path.join(parent, 'root'); const outside = path.join(parent, 'outside');
		await fs.mkdir(root); await fs.mkdir(outside);
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		await fs.symlink(outside, path.join(root, '.beaconWork', 'conversations'), 'junction');
		await assert.rejects(store.saveConversation(conversation('one'), 0));
		await assert.rejects(store.readConversation('../outside'));
		assert.deepEqual(await fs.readdir(outside), []);
	}));

	test('workspace replacement invalidates an existing binding', async () => fixture(async parent => {
		const root = path.join(parent, 'root'); await fs.mkdir(root);
		const store = new BeaconStore(await prepareBeaconWorkspace(root, true));
		await fs.rename(path.join(root, '.beaconWork'), path.join(root, 'old-assets'));
		await fs.mkdir(path.join(root, '.beaconWork'));
		await assert.rejects(store.saveConversation(conversation('one'), 0), /changed|unavailable/);
		assert.deepEqual(await fs.readdir(path.join(root, '.beaconWork')), []);
	}));
});

suite('Beacon window context and conversation ownership', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('an absent or retired acquisition scope never backfills into a selected root', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			const source = path.join(root, 'main.cpp'); await fs.writeFile(source, 'V1');
			const absent = await service.captureCollectionScope(1);
			await service.selectWorkspace(1, root);
			assert.equal(await service.beginActivity(1, source, absent), undefined);
			const old = await service.captureCollectionScope(1);
			await service.clearWorkspace(1); await service.selectWorkspace(1, root);
			await assert.rejects(service.beginActivity(1, source, old), /changed/);
		} finally { await service.dispose(); }
	}));




	function coordinator(changed: (id: number) => void = () => { }) {
		const selections = new Map<number, IBeaconWindowSelection>([[1, { slot: 'window-one', mode: 'spot' }], [2, { slot: 'window-two', mode: 'spot' }]]);
		let recent: string[] = [];
		const service = new BeaconCoordinator({
			getSelection: id => selections.get(id),
			saveSelection: (id, value) => { selections.set(id, value); },
			getRecent: () => recent,
			saveRecent: value => { recent = value; },
			changed
		});
		return { service, selections };
	}
	test('Notebook writes obey scope, deny root-external Spot, protect assets and release on window retirement', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			const file = path.join(root, 'note.bcnb'); await fs.writeFile(file, '{}');
			await assert.rejects(service.beginNotebookEdit(1, file, await service.getContext(1)), /workspace/);
			const scope = await service.selectWorkspace(1, root); const handle = await service.beginNotebookEdit(1, file, scope);
			assert.equal((await service.getContext(1)).busy, true); await assert.rejects(service.selectWorkspace(1, root), /busy/);
			assert.deepEqual(await service.notebookReadonly(2, [file]), [true]); await assert.rejects(service.verifyNotebookEdit(2, handle), /owner/);
			await service.setMode(1, 'flood'); await assert.rejects(service.verifyNotebookEdit(1, handle), /changed/); await service.endNotebookResource(1, handle);
			await service.setMode(1, 'spot');
			const outside = path.join(root, 'outside'); await fs.mkdir(outside); const outsideFile = path.join(outside, 'other.bcnb'); await fs.writeFile(outsideFile, '{}');
			const sub = path.join(root, 'sub'); await fs.mkdir(sub); const selected = await service.selectWorkspace(1, sub);
			await assert.rejects(service.beginNotebookEdit(1, outsideFile, selected), /outside-workspace/);
			const next = await service.setMode(1, 'flood'); const second = await service.beginNotebookEdit(1, outsideFile, next);
			await service.closeWindow(1); assert.deepEqual(await service.notebookReadonly(2, [outsideFile]), [false]); await service.endNotebookResource(1, second);
			const cpp = path.join(root, 'student.cpp'); await fs.writeFile(cpp, 'student'); await assert.rejects(service.beginNotebookEdit(1, cpp, await service.getContext(1)), /invalid-target/);
			const linked = path.join(sub, 'linked.bcnb'); await fs.link(cpp, linked); await assert.rejects(service.beginNotebookEdit(1, linked, await service.getContext(1)), /invalid-target/); assert.equal(await fs.readFile(cpp, 'utf8'), 'student');
			const asset = path.join(sub, '.beaconWork', 'bad.bcnb'); await fs.writeFile(asset, '{}'); await assert.rejects(service.beginNotebookEdit(1, asset, await service.getContext(1)), /invalid-target/);
		} finally { await service.dispose(); }
	}));

	test('new Notebook targets are scoped, occupied without a file, and never overwrite an existing file', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			const scope = await service.selectWorkspace(1, root);
			const file = path.join(root, 'new.bcnb');
			const begin = service.beginNotebookCreate.bind(service);
			const handle = await begin(1, file, scope);
			await assert.rejects(fs.stat(file), /ENOENT/);
			assert.equal((await service.getContext(1)).busy, true);
			await service.verifyNotebookEdit(1, handle);
			await assert.rejects(begin(1, file, scope), /busy/);
			await fs.writeFile(file, 'external writer', { flag: 'wx' });
			await assert.rejects(service.verifyNotebookEdit(1, handle), /exists/);
			await service.endNotebookResource(1, handle);
			assert.equal(await fs.readFile(file, 'utf8'), 'external writer');
			await assert.rejects(begin(1, file, scope), /exists/);
			await assert.rejects(begin(1, path.join(root, 'student.cpp'), scope), /invalid-target/);
			await assert.rejects(begin(1, path.join(root, 'student.cpp:note.bcnb'), scope), /invalid-target/);
			await assert.rejects(begin(1, path.join(root, '.beaconWork', 'new.bcnb'), scope), /invalid-target/);
			const sub = path.join(root, 'sub'); await fs.mkdir(sub); const selected = await service.selectWorkspace(1, sub);
			await assert.rejects(begin(1, path.join(root, 'outside.bcnb'), selected), /outside-workspace/);
			const flood = await service.setMode(1, 'flood'); const other = await begin(1, path.join(root, 'outside.bcnb'), flood);
			await service.setMode(1, 'spot'); await assert.rejects(service.verifyNotebookEdit(1, other), /changed/);
			await service.closeWindow(1); assert.deepEqual(await service.notebookReadonly(2, [path.join(root, 'outside.bcnb')]), [false]);
		} finally { await service.dispose(); }
	}));

	test('Notebook creation rejects redirected and replaced ancestors but permits its new association directories', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			const scope = await service.selectWorkspace(1, root);
			const directory = path.join(root, 'notes'); await fs.mkdir(directory);
			const redirected = path.join(root, 'alias'); await fs.symlink(directory, redirected, 'junction');
			await assert.rejects(service.beginNotebookCreate(1, path.join(redirected, 'note.bcnb'), scope), /redirected-parent/);
			const handle = await service.beginNotebookCreate(1, path.join(directory, 'new.bcnb'), scope);
			await fs.rename(directory, path.join(root, 'original-notes')); await fs.mkdir(directory);
			await assert.rejects(service.verifyNotebookEdit(1, handle), /parent-changed/); await service.endNotebookResource(1, handle);
			const associated = path.join(root, '.notebook', 'contest', 'A.cpp.bcnb'); const claim = await service.beginNotebookCreate(1, associated, scope);
			await fs.mkdir(path.dirname(associated), { recursive: true }); await service.verifyNotebookEdit(1, claim); await service.endNotebookResource(1, claim);
		} finally { await service.dispose(); }
	}));



	test('open-page metadata checks preserve conversation isolation through directory aliases', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.openConversation(1, 'one', true);
			const own = path.join(root, '.beaconWork', 'conversations', 'one');
			await assert.rejects(service.checkPageAccess(1, path.join(own, 'conversation.json')), /protected-page/);
			await service.openConversation(1, 'two', true);
			const alias = path.join(root, 'alias'); await fs.symlink(own, alias, 'junction');
			await assert.rejects(service.checkPageAccess(1, path.join(alias, 'conversation.json')), /protected-page/);
			await fs.rename(path.join(own, 'conversation.json'), path.join(own, 'saved.json'));
			await assert.rejects(service.checkPageAccess(1, path.join(alias, 'conversation.json')), /protected-page/);
			await assert.rejects(service.checkPageAccess(1, path.join(root, '.env')), /protected-page/);
			await service.checkPageAccess(1, path.join(root, 'unsaved.cpp'));
		} finally { await service.dispose(); }
	}));

	test('the window consumer observes both busy entry and retirement', async () => {
		const snapshots: Promise<boolean>[] = [];
		const { service } = coordinator(id => { if (id === 1) { snapshots.push(service.getContext(id).then(state => state.busy)); } });
		try {
			service.setBusy(1, true); await Promise.all(snapshots);
			service.setBusy(1, false); await Promise.all(snapshots);
			assert.deepEqual(await Promise.all(snapshots), [true, false]);
		} finally { await service.dispose(); }
	});

	test('isolates roots between windows while sharing recent choices', async () => fixture(async parent => {
		const a = path.join(parent, 'a'); const b = path.join(parent, 'b'); await fs.mkdir(a); await fs.mkdir(b);
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, a); await service.selectWorkspace(2, b);
			assert.equal((await service.getContext(1)).root, a);
			assert.equal((await service.getContext(2)).root, b);
			assert.deepEqual((await service.getContext(1)).recent, [b, a]);
		} finally { await service.dispose(); }
	}));
	test('runtime occupancy is independent of persistence, window ownership and Beacon own busy', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			const first = await service.beginRuntimeActivity(1); const second = await service.beginRuntimeActivity(1);
			assert.equal((await service.getContext(1)).runtimeBusy, true);
			assert.equal((await service.getContext(2)).runtimeBusy, false);
			await assert.rejects(service.selectWorkspace(1, root), /busy/);
			await service.endRuntimeActivity(2, first);
			await service.endRuntimeActivity(1, first);
			assert.equal((await service.getContext(1)).runtimeBusy, true);
			await service.endRuntimeActivity(1, second);
			service.setBusy(1, true);
			assert.equal((await service.getContext(1)).runtimeBusy, false);
			assert.equal((await service.getContext(1)).busy, true);
			service.setBusy(1, false); await service.selectWorkspace(1, root); await service.setMode(1, 'blackout');
			const blackout = await service.beginRuntimeActivity(1);
			assert.equal((await service.getContext(1)).runtimeBusy, true);
			await service.resetWindow(1);
			const replacement = await service.beginRuntimeActivity(1);
			await service.endRuntimeActivity(1, blackout);
			assert.equal((await service.getContext(1)).runtimeBusy, true);
			await service.endRuntimeActivity(1, replacement);
			assert.equal((await service.getContext(1)).runtimeBusy, false);
		} finally { await service.dispose(); }
	}));
	test('related tasks keep the root busy until every handle finishes; foreign files do not', async () => fixture(async parent => {
		const a = path.join(parent, 'a'); const b = path.join(parent, 'b'); await fs.mkdir(a); await fs.mkdir(b);
		const inside = path.join(a, 'source.txt'); const outside = path.join(b, 'source.txt'); await fs.writeFile(inside, 'source'); await fs.writeFile(outside, 'outside');
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, a);
			assert.equal(await service.beginActivity(1, outside, await service.captureCollectionScope(1)), undefined);
			const first = await service.beginActivity(1, inside, await service.captureCollectionScope(1)); const second = await service.beginActivity(1, inside, await service.captureCollectionScope(1));
			await assert.rejects(service.selectWorkspace(1, b), /busy/);
			await service.endActivity(1, first!);
			await assert.rejects(service.selectWorkspace(1, b), /busy/);
			await service.endActivity(1, second!); await service.selectWorkspace(1, b);
			assert.equal((await service.getContext(1)).root, b);
		} finally { await service.dispose(); }
	}));

	test('keeps a valid selected root while Blackout releases its active conversation', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			assert.equal((await service.getContext(1)).mode, 'blackout');
			await assert.rejects(service.setMode(1, 'flood'));
			await service.selectWorkspace(1, root);
			assert.equal((await service.getContext(1)).mode, 'spot');
			await service.openConversation(1, 'one', true);
			const blackedOut = await service.setMode(1, 'blackout');
			assert.equal(blackedOut.root, root);
			assert.equal(blackedOut.usable, true);
			assert.equal(blackedOut.mode, 'blackout');
			assert.equal(blackedOut.activeId, undefined);
			await assert.rejects(service.openConversation(1, 'one'), /workspace/);
			await service.selectWorkspace(2, root);
			await service.openConversation(2, 'one');
			await service.releaseConversation(2);
			await service.setMode(1, 'flood');
			await fs.rename(path.join(root, '.beaconWork'), path.join(root, 'unavailable'));
			const state = await service.getContext(1);
			assert.equal(state.root, root); assert.equal(state.mode, 'blackout'); assert.equal(state.usable, false);
			await fs.rename(path.join(root, 'unavailable'), path.join(root, '.beaconWork'));
			assert.equal((await service.getContext(1)).mode, 'flood');
		} finally { await service.dispose(); }
	}));

	test('explicit mode handoff retains ownership and only consumes the matching source draft in Blackout', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			const opened = await service.openConversation(1, 'source', true);
			const saved = await service.saveConversation(1, { ...conversation('source'), draft: { text: 'pending', attachments: [{ contents: 'captured' }] } }, opened.revision);
			const blackout = await service.setMode(1, 'blackout', true);
			assert.equal(blackout.activeId, 'source');
			assert.equal((await service.setMode(1, 'blackout', true)).activeId, 'source');
			await assert.rejects(service.openConversation(2, 'source'), /conversation-open/);
			await assert.rejects(service.openConversation(1, 'source'), /workspace/);
			await assert.rejects(service.saveConversation(1, saved.data, saved.revision), /workspace/);
			await assert.rejects(service.listHistory(1), /workspace/);
			await assert.rejects(service.listRecords(1, 'run', blackout), /workspace/);
			await assert.rejects(service.readRecord(1, 'run', 'missing', blackout), /workspace/);
			await assert.rejects(service.consumeDraft(2, 'source', saved.revision), /owner/);
			await assert.rejects(service.consumeDraft(1, 'other', saved.revision), /owner/);
			await assert.rejects(service.consumeDraft(1, 'source', saved.revision - 1), /conflict/);
			const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
			assert.deepEqual((await store.readConversation('source'))?.data, saved.data);
			service.setBusy(1, true);
			await service.consumeDraft(1, 'source', saved.revision);
			const consumed = await store.readConversation('source');
			assert.deepEqual(consumed?.data, { ...saved.data, draft: { text: '', attachments: [] } });
			assert.equal(consumed?.revision, saved.revision + 1);
			assert.equal((await service.getContext(1)).activeId, 'source');
			await assert.rejects(service.openConversation(2, 'source'), /conversation-open/);
			await assert.rejects(service.consumeDraft(1, 'source', saved.revision), /conflict/);
			service.setBusy(1, false);
			await service.resetWindow(1);
			await service.openConversation(2, 'source');
		} finally { await service.dispose(); }
	}));

	test('draft consumption rejects a replaced workspace instead of clearing its conversation', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root);
			const source = await service.openConversation(1, 'source', true);
			await service.setMode(1, 'blackout', true);
			await fs.rename(path.join(root, '.beaconWork'), path.join(root, 'original'));
			const replacement = new BeaconStore(await prepareBeaconWorkspace(root, true));
			await replacement.saveConversation({ ...conversation('source'), draft: { text: 'replacement', attachments: [] } }, 0);
			await assert.rejects(service.consumeDraft(1, 'source', source.revision), /workspace/);
			assert.equal((await replacement.readConversation('source'))?.data.draft?.text, 'replacement');
		} finally { await service.dispose(); }
	}));

	test('keeps manual Blackout across roots and moves a cleared root to recents without duplicates', async () => fixture(async parent => {
		const first = path.join(parent, 'first'); const second = path.join(parent, 'second');
		await fs.mkdir(first); await fs.mkdir(second);
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, first);
			await service.setMode(1, 'blackout');
			const switched = await service.selectWorkspace(1, second);
			assert.equal(switched.root, second);
			assert.equal(switched.mode, 'blackout');
			assert.equal(switched.workspaceState, 'blackout');
			const cleared = await service.clearWorkspace(1);
			assert.equal(cleared.root, undefined);
			assert.equal(cleared.mode, 'blackout');
			assert.equal(cleared.workspaceState, 'none');
			assert.deepEqual(cleared.recent, [second, first]);
			await service.removeRecentWorkspace(1, first);
			assert.deepEqual((await service.getContext(1)).recent, [second]);
		} finally { await service.dispose(); }
	}));

	test('rejects busy switches and does not move a conversation on idle switch', async () => fixture(async parent => {
		const a = path.join(parent, 'a'); const b = path.join(parent, 'b'); await fs.mkdir(a); await fs.mkdir(b);
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, a);
			await service.openConversation(1, 'one', true);
			await service.saveConversation(1, conversation('one'), 1);
			service.setBusy(1, true);
			await assert.rejects(service.selectWorkspace(1, b), /busy/);
			assert.equal((await service.getContext(1)).root, a);
			service.setBusy(1, false); await service.selectWorkspace(1, b);
			assert.equal((await service.getContext(1)).activeId, undefined);
			assert.deepEqual(await service.listHistory(1), []);
			const original = new BeaconStore(await prepareBeaconWorkspace(a, false));
			assert.equal((await original.readConversation('one'))?.data.title, 'Title');
		} finally { await service.dispose(); }
	}));

	test('one conversation has one window owner but other conversations stay usable', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			await service.openConversation(1, 'one', true);
			await assert.rejects(service.openConversation(2, 'one'), /conversation-open/);
			await service.openConversation(2, 'two', true);
			await assert.rejects(service.saveConversation(2, conversation('one'), 1), /owner/);
			await service.releaseConversation(1);
			await service.openConversation(2, 'one');
			assert.equal((await service.getContext(2)).activeId, 'one');
		} finally { await service.dispose(); }
	}));

	test('draft conversations stay out of history and promote using the same identity', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root);
			service.setBusy(1, true);
			const draft = await service.openConversation(1, 'draft', true);
			await assert.rejects(service.openConversation(1, 'second-draft', true), /beacon-busy/);
			service.setBusy(1, false);
			assert.equal(draft.data.draftOnly, true);
			await service.saveConversation(1, { ...draft.data, draft: { text: 'pending', attachments: [{ contents: 'snapshot' }] } }, draft.revision);
			assert.deepEqual(await service.listHistory(1), []);
			await assert.rejects(service.openConversation(2, 'draft'), /unavailable/);
			await service.saveConversation(1, { ...conversation('draft'), draftOnly: false }, 2);
			assert.equal((await service.listHistory(1))[0].id, 'draft');
		} finally { await service.dispose(); }
	}));

	test('a deleted released home reference cannot prevent saving the current view', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			await service.openConversation(1, 'home', true);
			await service.openConversation(1, 'detail', true);
			await service.setView(1, { screen: 'conversation', id: 'detail', homeId: 'home' });
			await service.deleteConversation(2, 'home');
			await service.setView(1, { screen: 'conversation', id: 'detail', homeId: 'home' });
			assert.deepEqual(await service.getResume(1), { screen: 'conversation', id: 'detail', homeId: undefined });
		} finally { await service.dispose(); }
	}));

	test('only actual closes publish the last closed view including explicit empty home', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			await service.openConversation(1, 'draft', true);
			await service.setView(1, { screen: 'home', homeId: 'draft' });
			await service.resetWindow(1);
			assert.equal(await service.getResume(2), undefined);
			await service.setView(1, { screen: 'home', homeId: 'draft' });
			await service.closeWindow(1, true);
			assert.deepEqual(await service.getResume(2), { screen: 'home', homeId: 'draft' });
			await service.setView(2, { screen: 'home' });
			await service.closeWindow(2, true);
			await service.selectWorkspace(1, root);
			assert.deepEqual(await service.getResume(1), { screen: 'home' });
			const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
			assert.equal(await store.readConversation('draft'), undefined);
		} finally { await service.dispose(); }
	}));

	test('close order wins over delayed completion and protects live and sent conversation drafts', async () => fixture(async root => {
		const { service } = coordinator();
		const saveResume = BeaconStore.prototype.saveResume;
		let unblock!: () => void; let entered!: () => void;
		const blocked = new Promise<void>(resolve => { unblock = resolve; });
		const saving = new Promise<void>(resolve => { entered = resolve; });
		let publications = 0;
		BeaconStore.prototype.saveResume = async function (view) {
			if (++publications === 1) { entered(); await blocked; }
			await saveResume.call(this, view);
		};
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			await service.openConversation(1, 'first', true); await service.setView(1, { screen: 'home', homeId: 'first' });
			await service.openConversation(2, 'second', true); await service.setView(2, { screen: 'home', homeId: 'second' });
			const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
			await store.saveConversation({ ...conversation('sent'), draft: { text: 'keep', attachments: [] } }, 0);
			const first = service.closeWindow(1, true); const second = service.closeWindow(2, true);
			await saving; assert.equal(publications, 1); unblock();
			await Promise.all([first, second]);
			await service.selectWorkspace(1, root);
			assert.deepEqual(await service.getResume(1), { screen: 'home', homeId: 'second' });
			assert.equal(await store.readConversation('first'), undefined);
			assert.ok(await store.readConversation('second'));
			assert.equal((await store.readConversation('sent'))?.data.draft?.text, 'keep');
			await service.openConversation(2, 'live', true);
			await service.setView(1, { screen: 'home' }); await service.closeWindow(1, true);
			assert.ok(await store.readConversation('live'));
			await service.setMode(2, 'blackout'); await service.closeWindow(2, true);
			assert.deepEqual(await store.readResume(), { screen: 'home' });
		} finally { unblock(); BeaconStore.prototype.saveResume = saveResume; await service.dispose(); }
	}));

	test('window closure releases conversation occupancy', async () => fixture(async root => {
		const { service } = coordinator();
		try {
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			await service.openConversation(1, 'one', true);
			await service.closeWindow(1); await service.openConversation(2, 'one');
			assert.equal((await service.getContext(2)).activeId, 'one');
		} finally { await service.dispose(); }
	}));

	test('restores per-window metadata while rejecting malformed saved selections', () => {
		assert.deepEqual(restoreBeaconWindowSelection({ slot: 'window-one', root: 'C:\\learning', mode: 'flood' }), { slot: 'window-one', root: 'C:\\learning', mode: 'flood' });
		assert.equal(restoreBeaconWindowSelection({ slot: '../escape', root: 'C:\\learning', mode: 'flood' }), undefined);
		assert.equal(restoreBeaconWindowSelection({ slot: 'window-one', root: 4, mode: 'flood' }), undefined);
	});
});
