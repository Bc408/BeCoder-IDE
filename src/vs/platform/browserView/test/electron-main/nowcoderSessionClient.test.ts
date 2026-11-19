/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NowcoderSessionClient } from '../../electron-main/nowcoderSessionClient.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Fixture clients are disposed by teardown.
suite('Nowcoder native session', () => {
	const problem = { site: 'nowcoder' as const, nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
	const payload = { source: 'int main(){}\n', fileName: '18204.cpp', languageId: '2' };
	const page = `<script>window.pageInfo={questionId:'235780',problemId:'18204',tagId:'4',codeJudgeType:'0',subTagId:'0',doneQuestionId:'18204'};</script><script src="//static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js"></script><div class="terminal-topic-title">A+B</div><div class="subject-describe">Sum.</div>`;
	const env = `({1:function(){var g=[{id:'2',lang:'C++',suffix:'cpp'}],x=[];window.location.host.includes('ac.nowcoder.com')&&(x=['2'],g[0].lang='C++23');}})`;
	const clients: NowcoderSessionClient[] = [];
	teardown(() => { clients.splice(0).forEach(client => client.dispose()); });
	function fixture() {
		let posts = 0, mode = 'ok', changed!: () => void, pageContent = page, account: string | undefined = '123', accountReads = 0, identityChanges = 0;
		const reads: string[] = [];
		let languageResponse: (init: RequestInit) => Promise<Response> = async () => new Response(env);
		let accountResponse: (() => Promise<Response>) | undefined;
		const client = new NowcoderSessionClient({
			onIdentityChange: () => { identityChanges++; },
			onSessionChange: listener => { changed = listener; return { dispose() { } }; }, fetch: async (url, init) => {
				reads.push(url);
				if (url.includes('global/pc')) { accountReads++; return accountResponse ? accountResponse() : Response.json(account ? { code: 0, data: { userId: account } } : { code: 999 }); }
				if (url.endsWith('/env.js')) { return languageResponse(init); }
				if (url === problem.url) { return new Response(pageContent); }
				if (url.includes('/submit_cd')) {
					posts++; assert.strictEqual(init.redirect, 'manual');
					const body = new URLSearchParams(String(init.body)); assert.strictEqual(body.get('content'), payload.source); assert.strictEqual(body.get('doneQuestionId'), '18204');
					if (mode === 'network') { throw new Error('connection lost'); }
					if (mode === 'redirect') { return new Response('', { status: 307, headers: { Location: problem.url } }); }
					if (mode === 'captcha') { return Response.json({ code: 1125, msg: 'verification' }); }
					return Response.json({ code: 0, data: { submissionId: 12345 } });
				}
				return Response.json({ code: 0, id: 12345, status: 5 });
			}
		}); clients.push(client);
		return { client, reads, posts: () => posts, accountReads: () => accountReads, identityChanges: () => identityChanges, account: (value: string | undefined) => { account = value; }, accountReply: (response: typeof accountResponse) => { accountResponse = response; }, changed: () => changed(), mode: (value: string) => { mode = value; }, languages: (response: typeof languageResponse) => { languageResponse = response; }, page: (content: string) => { pageContent = content; } };
	}
	test('problem reads return the actual language catalogue without account lookup or preparing a submission', async () => {
		const f = fixture(), signal = new AbortController().signal;
		const document = await f.client.readProblem(problem, signal);
		assert.deepStrictEqual(Reflect.get(document, 'languages'), [{ id: '2', label: 'C++23', family: 'cpp' }]);
		assert.strictEqual(document.title, 'A+B');
		assert.deepStrictEqual(f.reads, [problem.url, 'https://static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js']);
		assert.strictEqual((await f.client.submit(problem, payload, '123', 'without-prepare', signal)).kind, 'not-sent');
		assert.strictEqual(f.posts(), 0);
	});
	test('an unavailable or changed language resource keeps the statement and reports the missing catalogue', async () => {
		for (const response of [async () => { throw new Error('network unavailable'); }, async () => new Response('unexpected language resource')]) {
			const f = fixture(); f.languages(response);
			const document = await f.client.readProblem(problem, new AbortController().signal);
			assert.strictEqual(document.title, 'A+B');
			assert.strictEqual(Reflect.get(document, 'languages'), undefined);
			assert.strictEqual(Reflect.get(document, 'languageError'), 'unavailable');
			assert.strictEqual(f.posts(), 0);
		}
	});
	test('missing or ambiguous language resource entries retain the statement but cannot prepare or send', async () => {
		const script = '<script src="//static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js"></script>';
		for (const content of [page.replace(script, ''), page + script]) {
			const f = fixture(), signal = new AbortController().signal; f.page(content);
			const document = await f.client.readProblem(problem, signal);
			assert.strictEqual(document.title, 'A+B');
			assert.strictEqual(Reflect.get(document, 'languages'), undefined);
			assert.strictEqual(Reflect.get(document, 'languageError'), 'unavailable');
			assert.deepStrictEqual(f.reads, [problem.url], 'do not guess a language resource URL');
			await assert.rejects(f.client.prepare(problem, signal), /nowcoder-language-config-missing/);
			assert.strictEqual((await f.client.submit(problem, payload, '123', 'missing-catalogue', signal)).kind, 'not-sent');
			assert.strictEqual(f.posts(), 0);
			assert.strictEqual(f.reads.some(url => url.endsWith('/env.js')), false);
		}
	});
	test('language catalogue failure cannot hide caller cancellation, session changes or disposal', async () => {
		for (const stop of ['cancel', 'session', 'dispose']) {
			const f = fixture(), controller = new AbortController();
			let entered!: () => void, finish!: () => void;
			const started = new Promise<void>(resolve => { entered = resolve; });
			f.languages(async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); throw new Error('late catalogue failure'); });
			const reading = f.client.readProblem(problem, controller.signal);
			const rejected = assert.rejects(reading, stop === 'cancel' ? /caller cancelled/ : /session-changed/);
			await started;
			if (stop === 'cancel') { controller.abort(new Error('caller cancelled')); }
			else if (stop === 'session') { f.client.invalidate(); }
			else { f.client.dispose(); }
			finish(); await rejected;
			assert.strictEqual(f.posts(), 0);
		}
	});
	test('a late successful catalogue cannot revive a changed session', async () => {
		const f = fixture();
		f.languages(async () => { f.client.invalidate(); return new Response(env); });
		await assert.rejects(f.client.readProblem(problem, new AbortController().signal), /session-changed/);
	});
	test('once-only receipt permits result reads after send resources release', async () => {
		const f = fixture(), signal = new AbortController().signal;
		assert.strictEqual((await f.client.login(signal)).profileUrl, 'https://ac.nowcoder.com/acm/contest/profile/123');
		const form = await f.client.prepare(problem, signal);
		const result = await f.client.submit(problem, payload, form.ownerKey, 'attempt', signal);
		assert.strictEqual(result.kind, 'record'); assert.strictEqual(f.posts(), 1);
		assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'again', signal)).kind, 'not-sent');
		assert.strictEqual(f.posts(), 1);
		if (result.kind === 'record') {
			const snapshot = await f.client.readRecord(result.record, signal);
			assert.strictEqual(snapshot.rawStatus, 'AC');
			assert.strictEqual(snapshot.language, 'C++23');
			assert.strictEqual(snapshot.owner, '123');
			assert.strictEqual(snapshot.source, payload.source);
			assert.strictEqual(Reflect.get(snapshot, 'codeLength'), undefined, 'do not substitute a local byte count for the official record length');
			assert.strictEqual(Reflect.get(snapshot, 'problemTitle'), 'A+B');
			assert.strictEqual(snapshot.sourceVerification, 'not-checked', 'a submitted snapshot is not an independently verified server source');
		}
	});
	test('unknown acceptance and redirect never cause a second POST; explicit verification rejection is not sent', async () => {
		for (const mode of ['network', 'redirect', 'captcha']) {
			const f = fixture(), signal = new AbortController().signal; f.mode(mode);
			const form = await f.client.prepare(problem, signal);
			assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'one', signal)).kind, mode === 'captcha' ? 'not-sent' : 'unconfirmed');
			assert.strictEqual(f.posts(), 1);
		}
	});
	test('changed account invalidates prepared and accepted identities', async () => {
		const f = fixture(), signal = new AbortController().signal, form = await f.client.prepare(problem, signal);
		f.account('124'); f.changed(); await f.client.login(signal);
		assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'one', signal)).kind, 'not-sent'); assert.strictEqual(f.posts(), 0);
	});
	test('same-account cookie changes preserve a prepared submission and coalesce identity checks', async () => {
		const f = fixture(), signal = new AbortController().signal, form = await f.client.prepare(problem, signal), before = f.accountReads();
		f.changed(); f.changed(); f.changed();
		assert.strictEqual((await f.client.login(signal)).label, '123');
		assert.strictEqual(f.accountReads() - before, 1);
		assert.strictEqual(f.identityChanges(), 0);
		assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'same-owner', signal)).kind, 'record');
		assert.strictEqual(f.posts(), 1);
	});
	test('send and record reads detect identity changes even without a cookie notification', async () => {
		const f = fixture(), signal = new AbortController().signal, form = await f.client.prepare(problem, signal);
		f.account('124');
		assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'new-owner', signal)).kind, 'not-sent');
		assert.strictEqual(f.posts(), 0);
		const next = await f.client.prepare(problem, signal), sent = await f.client.submit(problem, payload, next.ownerKey, 'accepted', signal);
		assert.strictEqual(sent.kind, 'record');
		if (sent.kind === 'record') {
			f.account(undefined);
			await assert.rejects(f.client.readRecord(sent.record, signal), /session-changed|record-unowned/);
			assert.strictEqual(f.identityChanges(), 2);
		}
	});
	test('a cancelled caller cannot abort a shared identity check or revive a result after invalidation', async () => {
		const f = fixture(), cancelled = new AbortController();
		let finish!: (response: Response) => void;
		f.accountReply(() => new Promise<Response>(resolve => { finish = resolve; }));
		const first = f.client.login(cancelled.signal), second = f.client.login(new AbortController().signal);
		const rejected = assert.rejects(first, /caller cancelled/);
		await Promise.resolve();
		cancelled.abort(new Error('caller cancelled'));
		finish(Response.json({ code: 0, data: { userId: 123 } }));
		await rejected;
		assert.strictEqual((await second).label, '123');
		assert.strictEqual(f.accountReads(), 1);
		const stale = f.client.login(new AbortController().signal), staleRejected = assert.rejects(stale, /session-changed/);
		await Promise.resolve();
		f.client.invalidate();
		finish(Response.json({ code: 0, data: { userId: 123 } }));
		await staleRejected;
		f.accountReply(undefined); f.account('124');
		assert.strictEqual((await f.client.login(new AbortController().signal)).label, '124');
		assert.strictEqual(f.identityChanges(), 0, 'late old identity must not become the baseline');
	});
	test('a cookie event during the account response cannot recursively start another identity check', async () => {
		const f = fixture();
		f.accountReply(async () => { if (f.accountReads() === 1) { f.changed(); } return Response.json({ code: 0, data: { userId: 123 } }); });
		assert.strictEqual((await f.client.login(new AbortController().signal)).label, '123');
		assert.strictEqual(f.accountReads(), 2, 'a changed cookie requires one bounded confirmation of the latest credentials');
		assert.strictEqual(f.identityChanges(), 0);
	});
	test('an old credential response cannot authorize sending or reading a record after a cookie change', async () => {
		for (const operation of ['send', 'record']) {
			const f = fixture(), signal = new AbortController().signal, form = await f.client.prepare(problem, signal);
			const accepted = operation === 'record' ? await f.client.submit(problem, payload, form.ownerKey, 'accepted', signal) : undefined;
			let entered!: () => void, finish!: (response: Response) => void;
			const started = new Promise<void>(resolve => { entered = resolve; });
			f.accountReply(() => { entered(); return new Promise<Response>(resolve => { finish = resolve; }); });
			const oldIdentity = f.client.login(signal);
			await started;
			f.accountReply(undefined); f.account('124'); f.changed();
			const before = f.accountReads();
			const reading = operation === 'record' && accepted?.kind === 'record' ? f.client.readRecord(accepted.record, signal) : undefined;
			const rejected = reading ? assert.rejects(reading, /session-changed|record-unowned/) : undefined;
			const sending = operation === 'send' ? f.client.submit(problem, payload, form.ownerKey, 'changed-credentials', signal) : undefined;
			finish(Response.json({ code: 0, data: { userId: 123 } }));
			assert.strictEqual((await oldIdentity).label, '124', 'the shared lookup must confirm the latest cookie revision');
			assert.strictEqual(f.accountReads() - before, 1);
			if (sending) { assert.strictEqual((await sending).kind, 'not-sent'); }
			await rejected;
			assert.strictEqual(f.posts(), operation === 'record' ? 1 : 0);
			assert.strictEqual(f.reads.some(url => url.includes('/nccommon/status')), false, 'do not read the old record through new credentials');
		}
	});
	test('credentials changing on every identity response stop after one follow-up without a refresh loop', async () => {
		const f = fixture();
		f.accountReply(async () => { f.changed(); return Response.json({ code: 0, data: { userId: 123 } }); });
		await assert.rejects(f.client.login(new AbortController().signal), /nowcoder-account-unstable/);
		assert.strictEqual(f.accountReads(), 2);
		assert.strictEqual(f.posts(), 0);
	});

});
