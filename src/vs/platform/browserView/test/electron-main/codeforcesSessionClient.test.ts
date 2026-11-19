/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CodeforcesSessionClient } from '../../electron-main/codeforcesSessionClient.js';
import { cfProblem, cfForm, cfHeader, cfList, cfRow } from './codeforcesFixtures.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Fixture clients are disposed by teardown.
suite('Codeforces Session ownership and confirmation', () => {
	const clients: CodeforcesSessionClient[] = [];
	const signal = () => new AbortController().signal;
	const payload = { source: 'int main(){}\r\n', languageId: '89', fileName: '4_a.cpp' };
	teardown(() => { clients.splice(0).forEach(client => client.dispose()); });
	function fixture(traceFailure = false) {
		const traces: { event: string; details: Record<string, string | number | boolean> }[] = [];
		let posted = 0, sourceReads = 0, owner = 'fixture', after = '', before = '', status = 302, location = 'https://codeforces.com/contest/4/my', responseBody = '', recordSource = payload.source.replace(/\r\n/g, '\n'), formHtml = cfForm, changed!: () => void;
		let onGet: ((url: string) => Promise<void>) | undefined, challenge = false, lostReceipt = false, readFailure = false, nextPage = '', contestRows: string | undefined;
		const listPages = new Map<number, string>();
		let protocol: Record<string, unknown> = {};
		const client = new CodeforcesSessionClient({
			trace: (event, details) => { traces.push({ event, details }); if (traceFailure) { throw new Error('diagnostic sink unavailable'); } },
			onSessionChange: listener => { changed = listener; return { dispose() { } }; }, getSigningCookie: async () => 'fixture-cookie',
			fetch: async (url, init) => {
				await onGet?.(url);
				if (url === 'https://codeforces.com/') { return challenge ? new Response('Just a moment', { status: 403 }) : new Response(cfHeader.replaceAll('fixture</a>', owner + '</a>').replaceAll('/profile/fixture', '/profile/' + owner)); }
				if (url.includes('/submit?')) { return new Response(formHtml); }
				if (url.includes('/my')) {
					const page = Number(/\/page\/(\d+)$/.exec(url)?.[1] ?? 1);
					return new Response((posted && listPages.get(page) || cfList(posted ? after : before, posted ? nextPage : '', contestRows)).replaceAll('/profile/fixture', '/profile/' + owner));
				}
				if (url.endsWith('/data/submitSource')) { sourceReads++; if (readFailure) { throw new Error('offline'); } assert.strictEqual(new URLSearchParams(String(init.body)).has('source'), false); const id = new URLSearchParams(String(init.body)).get('submissionId'); return Response.json({ waiting: 'false', compilationError: 'false', source: recordSource, verdict: '<b>Accepted</b>', href: '/contest/4/submission/' + id, ...protocol }); }
				throw new Error('unexpected fixed request');
			},
			post: async (_url, init) => { posted++; assert.strictEqual(new URLSearchParams(init.body).get('source'), payload.source); after ||= cfRow('21'); if (lostReceipt) { throw new Error('network'); } return { status, location, body: responseBody }; }
		}); clients.push(client);
		return { client, traces, posts: () => posted, reads: () => sourceReads, result: (value: Record<string, unknown>) => { protocol = value; }, owner: (value: string) => { owner = value; }, form: (value: string) => { formHtml = value; }, list: (value: string, prior = '') => { after = value; before = prior; }, contest: (value: string) => { contestRows = value; }, source: (value: string) => { recordSource = value; }, receipt: (code: number, url = location, body = '') => { status = code; location = url; responseBody = body; }, changed: () => changed(), hold: (callback: (url: string) => Promise<void>) => { onGet = callback; }, challenge: (value: boolean) => { challenge = value; }, loseReceipt: () => { lostReceipt = true; }, failRead: (value: boolean) => { readFailure = value; }, pages: (value: string) => { nextPage = value; }, page: (page: number, html: string) => { listPages.set(page, html); } };
	}
	const pendingRow = cfRow('21').replace('<td>Accepted</td>', '<td waiting="true">Running on test 1</td>').replace('15 ms', '0 ms').replace('256 KB', '0 KB');
	const terminalRow = cfRow('21').replace('15 ms', '937 ms').replace('256 KB', '16 KB');
	test('retains testcase peak memory through cached and fresh record reads without resending', async () => {
		const f = fixture(); f.list(terminalRow.replace('16 KB', '0 KB'));
		f.result({ 'verdict#1': 'OK', 'memoryConsumed#1': 20480, 'verdict#2': 'OK', 'memoryConsumed#2': 4096 });
		const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'testcase-memory', signal());
		if (outcome.kind !== 'record') { assert.fail('formal receipt required'); }
		for (let read = 0; read < 2; read++) {
			const value = await f.client.readRecord(outcome.record, signal());
			assert.strictEqual(value.memory, '20480 B'); assert.strictEqual(value.time, '937 ms');
			assert.strictEqual(value.sourceVerification, 'matched'); assert.strictEqual(f.posts(), 1);
		}
	});
	test('retains testcase peak memory when the terminal list stays pending or its refresh fails', async () => {
		for (const offline of [false, true]) {
			const f = fixture(); f.list(pendingRow);
			f.result({ 'verdict#1': 'OK', 'memoryConsumed#1': 20480 });
			const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'stale-memory', signal());
			if (outcome.kind !== 'record') { assert.fail('formal receipt required'); }
			let lists = 0; f.hold(async url => { if (url.endsWith('/my') && ++lists === 2 && offline) { throw new Error('offline'); } });
			const value = await f.client.readRecord(outcome.record, signal());
			assert.strictEqual(value.memory, '20480 B'); assert.strictEqual(value.time, undefined);
			assert.strictEqual(lists, 2); assert.strictEqual(f.posts(), 1);
		}
	});
	test('refreshes the initial confirmed result resources from the newly read terminal list', async () => {
		const f = fixture(); f.list(pendingRow);
		const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'initial-resources', signal());
		assert.strictEqual(outcome.kind, 'record'); if (outcome.kind !== 'record') { return; }
		f.list(terminalRow);
		const value = await f.client.readRecord(outcome.record, signal());
		assert.strictEqual(value.time, '937 ms'); assert.strictEqual(value.memory, '16 KB');
		assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 1);
	});
	test('rereads the same record list once when the detail reaches terminal after a waiting list', async () => {
		const f = fixture(); f.list(pendingRow); f.result({ waiting: 'true', verdict: 'Running on test 1' });
		const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'terminal-resources', signal());
		assert.strictEqual(outcome.kind, 'record'); if (outcome.kind !== 'record') { return; }
		assert.strictEqual((await f.client.readRecord(outcome.record, signal())).phase, 'judging');
		f.result({ waiting: 'false', verdict: 'Accepted' }); let listReads = 0;
		f.hold(async url => { if (url.endsWith('/my')) { listReads++; } if (url.endsWith('/data/submitSource')) { f.list(terminalRow); } });
		const value = await f.client.readRecord(outcome.record, signal());
		assert.strictEqual(value.phase, 'finished'); assert.strictEqual(value.time, '937 ms'); assert.strictEqual(value.memory, '16 KB');
		assert.strictEqual(listReads, 2); assert.strictEqual(f.posts(), 1); assert.strictEqual(value.sourceVerification, 'matched');
	});
	test('preserves the final verdict and omits resources when the final list remains stale or fails', async () => {
		for (const offline of [false, true]) {
			const f = fixture(); f.list(pendingRow);
			const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'missing-resources', signal());
			assert.strictEqual(outcome.kind, 'record'); if (outcome.kind !== 'record') { return; }
			let lists = 0; f.hold(async url => { if (url.endsWith('/my') && ++lists === 2 && offline) { throw new Error('offline'); } });
			const value = await f.client.readRecord(outcome.record, signal());
			assert.strictEqual(value.phase, 'finished'); assert.strictEqual(value.time, undefined); assert.strictEqual(value.memory, undefined);
			assert.strictEqual(f.posts(), 1); assert.ok(lists <= 2, 'resource reads cannot loop');
		}
	});
	test('resource refresh cannot swallow cancellation or account changes', async () => {
		for (const cause of ['caller', 'session', 'identity', 'logout'] as const) {
			const f = fixture(); f.list(pendingRow);
			const form = await f.client.prepare(cfProblem, signal()), outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'resource-boundary', signal());
			if (outcome.kind !== 'record') { assert.fail('formal receipt required'); }
			const controller = new AbortController(); let lists = 0;
			f.hold(async url => {
				if (!url.endsWith('/my') || ++lists !== 2) { return; }
				if (cause === 'caller') { controller.abort(); }
				else if (cause === 'session') { f.changed(); }
				else if (cause === 'identity') { f.owner('other'); }
				else { f.page(1, cfList(pendingRow).replace(cfHeader, '<div id="header"><a href="/enter">Enter</a><a href="/register">Register</a></div>')); }
			});
			await assert.rejects(f.client.readRecord(outcome.record, controller.signal));
			assert.strictEqual(f.posts(), 1); assert.strictEqual(lists, 2);
		}
	});
	const duplicateError = '<span class="error for__source">You have submitted exactly the same code before</span>';
	const duplicateBody = cfForm.replace('<textarea name="source"></textarea>', '<textarea name="source">int main(){}</textarea>' + duplicateError);
	test('an explicit duplicate rejection ends the attempt without selecting an old AC or offering reconciliation', async () => {
		const f = fixture(); f.list(cfRow('20'), cfRow('20')); f.receipt(200, '', duplicateBody);
		const form = await f.client.prepare(cfProblem, signal());
		assert.deepStrictEqual(await f.client.submit(cfProblem, payload, form.ownerKey, 'duplicate', signal()), { kind: 'rejected', reason: 'codeforces-duplicate-source' });
		assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 0);
		await assert.rejects(f.client.reconcile('duplicate', signal()), /attempt-unowned/);
		const diagnostic = f.traces.find(value => value.event === 'submit-response');
		assert.deepStrictEqual(diagnostic?.details, { status: 200, category: 'duplicate-source' });
		assert.ok(!JSON.stringify(f.traces).includes('int main'));
		f.receipt(302, 'https://codeforces.com/contest/4/my');
		const next = await f.client.prepare(cfProblem, signal());
		f.list(cfRow('21'));
		assert.strictEqual((await f.client.submit(cfProblem, payload, next.ownerKey, 'next', signal())).kind, 'record', 'rejection releases the sending lock');
		assert.strictEqual(f.posts(), 2);
	});
	test('unknown, incomplete, foreign or quoted duplicate errors stay unconfirmed and never resend', async () => {
		for (const [status, body] of [
			[403, duplicateBody], [200, cfForm], [200, duplicateBody.replace('</html>', '')],
			[200, duplicateBody.replace('/profile/fixture', '/profile/other')],
			[200, duplicateBody.replace('/contest/4/submit?', '/contest/5/submit?')],
			[200, duplicateBody.replace('value="A" selected', 'value="B" selected')],
			[200, cfForm.replace('<textarea name="source"></textarea>', '<textarea name="source">' + duplicateError + '</textarea>')],
			[200, cfForm.replace('</body>', duplicateError + '</body>')],
			[200, duplicateBody.replace('You have submitted exactly the same code before', 'Unknown error')]
		] as const) {
			const f = fixture(); f.receipt(status, '', body);
			const form = await f.client.prepare(cfProblem, signal());
			assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'unknown', signal())).kind, 'unconfirmed');
			assert.strictEqual((await f.client.reconcile('unknown', signal())).kind, 'record');
			assert.strictEqual(f.posts(), 1);
		}
	});
	for (const cause of ['session', 'dispose', 'caller'] as const) {
		test('reports ' + cause + ' cancellation separately while preparation GETs are pending', async () => {
			const f = fixture(), controller = new AbortController();
			let entered = 0, start!: () => void, release!: () => void;
			const started = new Promise<void>(resolve => { start = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
			f.hold(async () => { if (++entered === 2) { start(); } await held; });
			const pending = f.client.prepare(cfProblem, controller.signal);
			const expected = cause === 'session' ? 'codeforces-session-changed' : cause === 'dispose' ? 'codeforces-session-stopped' : 'codeforces-operation-cancelled';
			const rejected = assert.rejects(pending, { message: expected });
			await started;
			if (cause === 'session') { f.changed(); } else if (cause === 'dispose') { f.client.dispose(); } else { controller.abort(new Error('private caller details')); }
			try {
				await rejected;
				const failures = f.traces.filter(value => value.event === 'operation-failed');
				assert.deepStrictEqual(failures.map(value => value.details.phase).sort(), ['submission-list', 'submit-form']);
				assert.ok(failures.every(value => value.details.reason === expected));
				assert.strictEqual(f.posts(), 0);
				assert.ok(!JSON.stringify(f.traces).includes('private caller details'));
			} finally { release(); }
		});
	}
	test('a failing diagnostic sink cannot change submission, invalidation or disposal', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }), f = fixture(true);
		let release!: () => void;
		try {
			const form = await f.client.prepare(cfProblem, signal());
			assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'trace-failure', signal())).kind, 'record');
			assert.strictEqual(f.posts(), 1);
			let entered = 0, start!: () => void;
			const started = new Promise<void>(resolve => { start = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
			f.hold(async () => { if (++entered === 2) { start(); } await held; });
			const rejected = assert.rejects(f.client.prepare(cfProblem, signal()), { message: 'codeforces-session-changed' });
			await started; f.changed(); await rejected;
			assert.strictEqual(clock.countTimers(), 0);
			assert.doesNotThrow(() => f.client.dispose());
		} finally { release?.(); try { f.client.dispose(); } finally { clock.restore(); } }
	});
	test('reports a bounded network timeout instead of a user cancellation', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }), f = fixture();
		let release!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		f.hold(async () => held);
		try {
			let settled = false;
			const rejected = assert.rejects(f.client.prepare(cfProblem, signal()), { message: 'codeforces-request-timeout' }).then(() => { settled = true; });
			await clock.tickAsync(14999); assert.strictEqual(settled, false);
			await clock.tickAsync(1); await rejected;
			assert.strictEqual(f.posts(), 0);
			assert.ok(f.traces.some(value => value.event === 'operation-failed' && value.details.reason === 'codeforces-request-timeout'));
		} finally { release(); clock.restore(); }
	});
	test('traces the native request phases without source, account or form secrets', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal());
		assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'trace', signal())).kind, 'record');
		const phases = new Set(f.traces.filter(value => value.event === 'operation-start').map(value => value.details.phase));
		assert.deepStrictEqual([...phases].sort(), ['account', 'source-post', 'submission-list', 'submission-source', 'submit-form']);
		const serialized = JSON.stringify(f.traces);
		for (const secret of [payload.source.trim(), 'fixture-cookie', 'fixture-csrf', 'fixture-ftaa', 'fixture-bfaa', '/profile/fixture', 'csrf_token=']) { assert.ok(!serialized.includes(secret), 'native diagnostics must omit credentials and source'); }
		assert.ok(f.traces.filter(value => value.event === 'operation-complete').every(value => typeof value.details.elapsedMs === 'number'));
	});
	test('prepares, reconciles and reads results when CF also renders contest history', async () => {
		const f = fixture(); f.contest(cfRow('20')); f.list(cfRow('21'));
		const prepared = await f.client.prepare(cfProblem, signal()); f.loseReceipt();
		assert.strictEqual((await f.client.submit(cfProblem, payload, prepared.ownerKey, 'two-tables', signal())).kind, 'unconfirmed');
		const outcome = await f.client.reconcile('two-tables', signal());
		assert.strictEqual(outcome.kind, 'record'); assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 1);
		if (outcome.kind === 'record') {
			assert.strictEqual(outcome.record.id, '21');
			assert.strictEqual((await f.client.readRecord(outcome.record, signal())).sourceVerification, 'matched');
		}
	});
	test('confirms GCC 14 msys2 submissions instead of leaving an accepted source unconfirmed', async () => {
		const f = fixture();
		f.form(cfForm.replace('GNU G++20 13.2 (64 bit, winlibs)', 'GNU G++23 14.2 (64 bit, msys2)'));
		f.list(cfRow('21', 'C++23 (GCC 14-64, msys2)'));
		const prepared = await f.client.prepare(cfProblem, signal());
		const result = await f.client.submit(cfProblem, payload, prepared.ownerKey, 'msys2', signal());
		assert.strictEqual(result.kind, 'record');
		assert.strictEqual(f.posts(), 1);
		assert.strictEqual(f.reads(), 1);
		if (result.kind === 'record') { assert.strictEqual((await f.client.readRecord(result.record, signal())).sourceVerification, 'matched'); }
	});
	test('old contest history cannot hide another exact source match on the next practice page', async () => {
		const f = fixture(); f.contest(cfRow('20'));
		f.page(1, cfList(cfRow('23'), '<a href="/contest/4/my/page/2">2</a>', cfRow('20')));
		f.page(2, cfList(cfRow('22'), '', cfRow('20')));
		const form = await f.client.prepare(cfProblem, signal());
		assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'two-table-ambiguity', signal())).kind, 'unconfirmed');
		assert.strictEqual(f.reads(), 2, 'both new matching submissions must be checked');
		assert.strictEqual(f.posts(), 1);
	});
	test('finds the unique new receipt beyond an independently old contest table', async () => {
		const f = fixture(); f.contest(cfRow('20'));
		f.page(1, cfList(cfRow('23').replace('/problem/A', '/problem/B'), '<a href="/contest/4/my/page/2">2</a>', cfRow('20')));
		f.page(2, cfList(cfRow('22'), '', cfRow('20')));
		const form = await f.client.prepare(cfProblem, signal());
		const outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'two-table-next-page', signal());
		assert.strictEqual(outcome.kind, 'record');
		if (outcome.kind === 'record') { assert.strictEqual(outcome.record.id, '22'); }
		assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 1);
	});
	test('stops at the source boundary once every table has reached old history', async () => {
		const f = fixture(); f.contest(cfRow('20'));
		f.page(1, cfList(cfRow('23') + cfRow('19'), '<a href="/contest/4/my/page/2">2</a>', cfRow('20')));
		f.hold(async url => { assert.ok(!url.endsWith('/page/2'), 'older pages do not need another request'); });
		const form = await f.client.prepare(cfProblem, signal());
		const outcome = await f.client.submit(cfProblem, payload, form.ownerKey, 'two-table-boundary', signal());
		assert.strictEqual(outcome.kind, 'record');
		if (outcome.kind === 'record') { assert.strictEqual(outcome.record.id, '23'); }
		assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 1);
	});
	test('accepts genuine empty history, confirms exact CRLF source and reuses initial result', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal());
		const result = await f.client.submit(cfProblem, payload, form.ownerKey, 'one', signal());
		assert.strictEqual(result.kind, 'record'); assert.strictEqual(f.posts(), 1); assert.strictEqual(f.reads(), 1);
		if (result.kind === 'record') { const snapshot = await f.client.readRecord(result.record, signal()); assert.strictEqual(snapshot.rawStatus, 'Accepted'); assert.strictEqual(snapshot.sourceVerification, 'matched'); assert.strictEqual(snapshot.owner, undefined); assert.strictEqual(snapshot.codeLength, undefined); assert.strictEqual(f.reads(), 1); }
		assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'again', signal())).kind, 'not-sent'); assert.strictEqual(f.posts(), 1);
	});
	test('excludes old records and never selects one of multiple exact same-source candidates', async () => {
		const f = fixture(); f.list(cfRow('23') + cfRow('22') + cfRow('20'), cfRow('20'));
		const form = await f.client.prepare(cfProblem, signal()), result = await f.client.submit(cfProblem, payload, form.ownerKey, 'ambiguous', signal());
		assert.strictEqual(result.kind, 'unconfirmed'); assert.strictEqual(f.reads(), 2);
		const again = await f.client.reconcile('ambiguous', signal()); assert.strictEqual(again.kind, 'unconfirmed'); assert.strictEqual(f.posts(), 1);
	});
	test('source mismatch and unknown redirect cannot report record or trigger resend', async () => {
		for (const mode of ['source', '307', '308', 'foreign']) {
			const f = fixture(); if (mode === 'source') { f.source('int main() {}\n'); } else { f.receipt(mode === 'foreign' ? 302 : Number(mode), mode === 'foreign' ? 'https://evil.invalid/' : undefined); }
			const form = await f.client.prepare(cfProblem, signal()); assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, mode, signal())).kind, 'unconfirmed'); assert.strictEqual(f.posts(), 1);
		}
	});
	test('account change, cancellation and late preparation never dispatch', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal()); f.owner('other');
		assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'changed', signal())).kind, 'not-sent'); assert.strictEqual(f.posts(), 0);
		const g = fixture(), controller = new AbortController(); let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
		g.hold(async () => held); const pending = g.client.prepare(cfProblem, controller.signal); controller.abort(); release(); await assert.rejects(pending); assert.strictEqual(g.posts(), 0);
	});
	test('retains identity on challenges and invalidates explicit session changes', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal()); f.challenge(true); assert.strictEqual((await f.client.login(signal())).state, 'unknown'); f.challenge(false);
		assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'after-challenge', signal())).kind, 'record');
		const again = await f.client.prepare(cfProblem, signal()); f.changed();
		assert.strictEqual((await f.client.submit(cfProblem, payload, again.ownerKey, 'changed', signal())).kind, 'not-sent'); assert.strictEqual(f.posts(), 1);
	});
	test('lost receipt or failed confirmation can only be reconciled through reads', async () => {
		for (const mode of ['receipt', 'read']) {
			const f = fixture(), form = await f.client.prepare(cfProblem, signal()); if (mode === 'receipt') { f.loseReceipt(); } else { f.failRead(true); }
			assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, mode, signal())).kind, 'unconfirmed'); f.failRead(false);
			assert.strictEqual((await f.client.reconcile(mode, signal())).kind, 'record'); assert.strictEqual(f.posts(), 1);
		}
	});
	test('bounded pagination never chooses a candidate while unseen rows remain', async () => {
		const f = fixture(); f.list(cfRow('21')); f.pages('<a href="/contest/4/my/page/9">9</a>');
		const form = await f.client.prepare(cfProblem, signal()); assert.strictEqual((await f.client.submit(cfProblem, payload, form.ownerKey, 'pages', signal())).kind, 'unconfirmed'); assert.strictEqual(f.reads(), 0); assert.strictEqual(f.posts(), 1);
	});
	test('current account is verified before returning even a cached initial result', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal()), result = await f.client.submit(cfProblem, payload, form.ownerKey, 'cached', signal());
		assert.strictEqual(result.kind, 'record'); f.owner('other');
		if (result.kind === 'record') { await assert.rejects(f.client.readRecord(result.record, signal()), /session/); }
	});
	test('later results retain official metadata and use refreshed terminal resources', async () => {
		const f = fixture(), form = await f.client.prepare(cfProblem, signal()), result = await f.client.submit(cfProblem, payload, form.ownerKey, 'metadata', signal());
		if (result.kind !== 'record') { assert.fail('formal receipt required'); }
		await f.client.readRecord(result.record, signal()); f.list(cfRow('21').replace('15 ms', '31 ms'));
		const snapshot = await f.client.readRecord(result.record, signal()); assert.strictEqual(snapshot.problemTitle, 'Watermelon'); assert.strictEqual(snapshot.submittedAt, 'Nov/18/2026 12:00'); assert.strictEqual(snapshot.time, '31 ms');
	});
	test('bounded record history never permanently prevents further submissions', async () => {
		const f = fixture();
		for (let n = 30; n < 96; n++) {
			f.list(cfRow(String(n - 1)), cfRow(String(n - 1)));
			const form = await f.client.prepare(cfProblem, signal()); f.list(cfRow(String(n)), cfRow(String(n - 1)));
			const result = await f.client.submit(cfProblem, payload, form.ownerKey, String(n), signal()); assert.strictEqual(result.kind, 'record', 'submission ' + n);
			if (result.kind === 'record') { f.client.releaseRecord(result.record); }
		}
		assert.strictEqual(f.posts(), 66);
	});
});
