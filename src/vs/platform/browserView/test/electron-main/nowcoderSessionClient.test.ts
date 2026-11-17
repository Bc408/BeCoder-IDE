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
		let posts = 0, mode = 'ok', changed!: () => void;
		const client = new NowcoderSessionClient({
			onSessionChange: listener => { changed = listener; return { dispose() { } }; }, fetch: async (url, init) => {
				if (url.includes('global/pc')) { return Response.json({ code: 0, data: { userId: 123 } }); }
				if (url.endsWith('/env.js')) { return new Response(env); }
				if (url === problem.url) { return new Response(page); }
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
		return { client, posts: () => posts, changed: () => changed(), mode: (value: string) => { mode = value; } };
	}
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
		f.changed(); assert.strictEqual((await f.client.submit(problem, payload, form.ownerKey, 'one', signal)).kind, 'not-sent'); assert.strictEqual(f.posts(), 0);
	});

});
