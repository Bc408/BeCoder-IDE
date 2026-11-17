/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ILuoguSourcePayload, SubmissionOutcome, RecordRef, RecordSnapshot } from 'becoder-oj-connect';
import { assertLuoguProblem } from '../common/luoguBridge.js';
import { luoguLanguages, luoguLogin, parseLuoguProblem, parseLuoguRecord } from '../common/luoguProtocol.js';
import { createHash } from 'crypto';
import CsrfTokenManager from './luoguCsrfTokenManager.js';

export interface LuoguSessionPorts {
	trace?(event: string, details: Record<string, string | number | boolean>): void;
	synchronizeSession?(): Promise<void>;
	createSocket?(): Promise<WebSocket>;
	fetch(url: string, init: RequestInit): Promise<Response>;
	askCaptcha(requestId: string, signal: AbortSignal): Promise<string | undefined>;
	onSessionChange(listener: () => void): { dispose(): void };
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('luogu-invalid-response'); }
	return value as Record<string, unknown>;
}
function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new Error('luogu-operation-cancelled'));
		signal.addEventListener('abort', abort, { once: true });
		void pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
	});
}
const origin = 'https://www.luogu.com.cn';

/** Fixed Luogu operations in the browser's persistent Session, independent of WebContents. */
export class LuoguSessionClient {
	private generation = 0;
	private disposed = false;
	private readonly requests = new Set<AbortController>();
	private readonly changes = new Set<() => void>();
	private readonly listener: { dispose(): void };
	private readonly csrf: CsrfTokenManager;
	private config: Promise<unknown> | undefined;
	private tags: { loadedAt: number; pending: Promise<unknown> } | undefined;
	private readonly prepared = new Map<string, { ownerKey: string; generation: number; languages: readonly { id: string }[] }>();
	private readonly recordGenerations = new Map<string, { released: boolean }>();
	private readonly tracks = new Map<string, ReturnType<LuoguSessionClient['createTrack']>>();
	constructor(private readonly ports: LuoguSessionPorts) {
		this.listener = ports.onSessionChange(() => this.invalidate());
		this.csrf = new CsrfTokenManager({
			fetchToken: async () => {
				const html = await this.request('/ranking', {}, value => value.text());
				const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
				for (const tag of tags) {
					if (!/\bname\s*=\s*['"]csrf-token['"]/i.test(tag)) { continue; }
					const token = /\bcontent\s*=\s*(['"])(.*?)\1/i.exec(tag)?.[2];
					if (token) { return token.replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
				}
				throw new Error('luogu-csrf-unavailable');
			},
			onDidChangeSessions: listener => { this.changes.add(listener); return { dispose: () => this.changes.delete(listener) }; },
			reportError: () => undefined, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), now: Date.now,
			setInterval: (listener, ms) => setInterval(listener, ms), clearInterval
		});
		this.csrf.start();
	}
	invalidate(): void {
		this.generation++; for (const state of this.recordGenerations.values()) { state.released = true; } this.recordGenerations.clear(); this.config = undefined; this.prepared.clear();
		for (const track of this.tracks.values()) { track.dispose(new Error('luogu-session-changed')); }
		this.tracks.clear(); for (const listener of this.changes) { listener(); }
	}
	dispose(): void { this.disposed = true; this.generation++; for (const state of this.recordGenerations.values()) { state.released = true; } this.recordGenerations.clear(); for (const controller of this.requests) { controller.abort(); } this.requests.clear(); this.listener.dispose(); this.csrf.dispose(); for (const track of this.tracks.values()) { track.dispose(new Error('luogu-session-stopped')); } this.tracks.clear(); }
	private async request<T>(path: string, init: RequestInit, consume: (response: Response) => Promise<T>, onDispatch?: () => void): Promise<T> {
		if (this.disposed) { throw new Error('luogu-session-stopped'); }
		const controller = new AbortController(), outer = init.signal; this.requests.add(controller);
		const abort = () => controller.abort(outer?.reason);
		outer?.addEventListener('abort', abort, { once: true });
		if (outer?.aborted) { abort(); }
		const timer = setTimeout(() => controller.abort(new Error('luogu-request-timeout')), 6000);
		try {
			controller.signal.throwIfAborted();
			onDispatch?.();
			const response = await this.ports.fetch(origin + path, {
				...init, redirect: 'manual', credentials: 'include', signal: controller.signal,
				headers: { Referer: origin + '/', 'X-Requested-With': 'XMLHttpRequest', ...init.headers }
			});
			return await consume(response);
		} finally { this.requests.delete(controller); clearTimeout(timer); outer?.removeEventListener('abort', abort); }
	}
	private async context(url: string, signal: AbortSignal): Promise<Record<string, unknown>> {
		const parsed = new URL(url, origin); if (parsed.origin !== origin) { throw new Error('luogu-invalid-route'); }
		parsed.searchParams.set('_contentOnly', '1');
		return this.request(parsed.pathname + parsed.search, { signal, cache: 'no-store', headers: { 'x-lentille-request': 'content-only' } }, async response => {
			if (!response.ok) { throw new Error('luogu-read-http-' + response.status); }
			const text = await response.text(); if (text.length > 8 * 1024 * 1024) { throw new Error('luogu-response-too-large'); }
			return object(JSON.parse(text));
		});
	}
	private configuration(): Promise<unknown> {
		if (!this.config) {
			const pending = this.request('/_lfe/config', {}, async response => {
				if (!response.ok) { throw new Error('luogu-config-http-' + response.status); }
				const text = await response.text(); if (text.length > 8 * 1024 * 1024) { throw new Error('luogu-response-too-large'); } return JSON.parse(text);
			});
			this.config = pending; void pending.catch(() => { if (this.config === pending) { this.config = undefined; } });
		}
		return this.config;
	}
	private tagConfiguration(): Promise<unknown> {
		// Upstream tagManager shares a 24-hour cache of the public fixed endpoint.
		if (!this.tags || Date.now() - this.tags.loadedAt >= 24 * 60 * 60 * 1000) {
			const pending = this.request('/_lfe/tags/zh-CN', {}, async response => {
				if (!response.ok) { throw new Error('luogu-tags-http-' + response.status); }
				const text = await response.text(); if (text.length > 8 * 1024 * 1024) { throw new Error('luogu-response-too-large'); }
				return JSON.parse(text);
			});
			this.tags = { loadedAt: Date.now(), pending };
			void pending.catch(() => { if (this.tags?.pending === pending) { this.tags = undefined; } });
		}
		return this.tags.pending;
	}
	async prepare(problem: ProblemRef, signal: AbortSignal) {
		assertLuoguProblem(problem); signal.throwIfAborted();
		const current = this.generation, context = await this.context(problem.url, signal);
		const user = context.user ? object(context.user) : undefined;
		if (!user || !Number.isSafeInteger(user.uid) || Number(user.uid) <= 0) { throw new Error('Sign in to Luogu in the browser.'); }
		const languages = luoguLanguages(context, await cancellable(this.configuration(), signal));
		if (current !== this.generation) { throw new Error('luogu-session-changed'); }
		const ownerKey = String(user.uid); this.prepared.set(problem.url, { ownerKey, generation: current, languages });
		return { ownerKey, languages, hasDraft: false };
	}
	async readProblem(problem: ProblemRef, signal: AbortSignal) {
		assertLuoguProblem(problem); const context = await this.context(problem.url, signal);
		const data = object(context.data ?? context.currentData), ids = object(data.problem).tags;
		const [config, tags] = await Promise.all([
			cancellable(this.configuration(), signal),
			Array.isArray(ids) && ids.length ? cancellable(this.tagConfiguration().catch(() => undefined), signal) : undefined
		]);
		signal.throwIfAborted();
		return { ...parseLuoguProblem(problem, context, tags), languages: luoguLanguages(context, config) };
	}
	async login(signal: AbortSignal) { return luoguLogin(await this.context('/ranking', signal)); }
	async captcha(signal: AbortSignal): Promise<string> {
		this.ports.trace?.('captcha-image-request', { generation: this.generation });
		return this.request('/api/verify/captcha', { signal, cache: 'no-store' }, async response => {
			this.ports.trace?.('captcha-image-response', { status: response.status, generation: this.generation });
			if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) { throw new Error('luogu-captcha-unavailable'); }
			const data = await response.arrayBuffer(); if (data.byteLength > 1024 * 1024) { throw new Error('luogu-captcha-too-large'); }
			this.ports.trace?.('captcha-image-ready', { bytes: data.byteLength, imageHash: createHash('sha256').update(Buffer.from(data)).digest('hex').slice(0, 16) });
			return Buffer.from(data).toString('base64');
		});
	}
	// Adapted from v4.20.0 api.ts submitCode, with a bounded captcha loop for unsupported verification.
	async submit(problem: ProblemRef, payload: ILuoguSourcePayload, ownerKey: string, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		assertLuoguProblem(problem);
		if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || Buffer.byteLength(payload.source) > 1024 * 1024 || !/^\d+(?::o2)?$/.test(payload.languageId)) { throw new Error('luogu-invalid-payload'); }
		let uncertain = false, captcha: string | undefined;
		let captchaFailures = 0;
		const failed = (reason: string): SubmissionOutcome => uncertain ? { kind: 'unconfirmed', problem, attemptId: requestId, message: reason } : { kind: 'not-sent', reason };
		try {
			const prepared = this.prepared.get(problem.url), current = this.generation;
			if (!prepared || prepared.ownerKey !== ownerKey || prepared.generation !== current || !prepared.languages.some(language => language.id === payload.languageId)) { throw new Error('luogu-session-changed'); }
			const [lang, optimization] = payload.languageId.split(':');
			for (; ;) {
				const token = await cancellable(this.csrf.getToken(), signal);
				if (this.ports.synchronizeSession) { await cancellable(this.ports.synchronizeSession(), signal); }
				signal.throwIfAborted();
				if (current !== this.generation) { throw new Error('luogu-session-changed'); }
				const endpoint = '/fe/api/problem/submit/' + problem.nativeId.split('@')[0] + new URL(problem.url).search;
				this.ports.trace?.('submit-dispatch', { requestId, generation: this.generation, hasCaptcha: captcha !== undefined, captchaLength: captcha?.length ?? 0 });
				const result = await this.request(endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ code: payload.source, lang: Number(lang), enableO2: +(optimization === 'o2'), captcha }) }, async response => {
					if (response.status >= 300 && response.status < 400) {
						const target = new URL(response.headers.get('location') ?? '/', origin);
						return { response, body: target.origin === origin && target.pathname.startsWith('/auth/login') ? { errorMessage: 'Sign in to Luogu in the browser.' } : {} };
					}
					const text = await response.text(); if (text.length > 8 * 1024 * 1024) { throw new Error('luogu-response-too-large'); }
					const body = object(JSON.parse(text)); return { response, body };
				}, () => { uncertain = true; });
				const { response, body } = result;
				this.ports.trace?.('submit-response', { requestId, status: response.status, category: body.errorMessage === '\u9a8c\u8bc1\u7801\u9519\u8bef' ? 'captcha-rejected' : typeof body.errorMessage === 'string' ? 'other-rejection' : body.rid !== undefined ? 'record' : 'unknown', generation: this.generation });
				if (response.ok && Number.isSafeInteger(body.rid) && Number(body.rid) > 0) { const id = String(body.rid); return { kind: 'record', record: { problem, id, url: origin + '/record/' + id } }; }
				uncertain = false;
				if (body.errorMessage === '\u9a8c\u8bc1\u7801\u9519\u8bef' && body.rid === undefined) {
					if (captcha !== undefined && ++captchaFailures >= 3) { return failed('luogu-browser-verification-required'); }
					captcha = await this.ports.askCaptcha(requestId, signal);
					if (captcha === undefined) { return failed('Verification cancelled. No submission was accepted.'); }
					continue;
				}
				if (typeof body.errorMessage === 'string') { return failed(body.errorMessage); }
				uncertain = true; return failed('Luogu did not return a confirmed record.');
			}
		} catch (error) { return failed(error instanceof Error ? error.message : String(error)); }
	}
	async inspectReceipt(problem: ProblemRef, url: string, signal: AbortSignal) {
		assertLuoguProblem(problem);
		const match = /^https:\/\/www\.luogu\.com\.cn\/record\/([1-9]\d*)$/.exec(url);
		if (!match) { throw new Error('luogu-invalid-record'); }
		const context = await this.context(url, signal), data = object(context.data ?? context.currentData), record = object(data.record);
		if (String(record.id) !== match[1] || object(record.problem).pid !== problem.nativeId.split('@')[0] || data.canViewCode === false || typeof record.sourceCode !== 'string') { throw new Error('luogu-record-unverified'); }
		const contest = record.contest && typeof record.contest === 'object' ? String(object(record.contest).id) : undefined;
		if (contest !== problem.nativeId.split('@')[1] || typeof record.submitTime !== 'number' || !Number.isFinite(record.submitTime)) { throw new Error('luogu-record-context'); }
		return { record: { problem, id: match[1], url }, sourceHash: createHash('sha256').update(record.sourceCode.replace(/\r\n/g, '\n')).digest('hex'), ownerKey: String(object(record.user).uid), submitTime: record.submitTime };
	}
	async readRecord(ref: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		assertLuoguProblem(ref.problem);
		if (!/^[1-9]\d*$/.test(ref.id) || ref.url !== origin + '/record/' + ref.id) { throw new Error('luogu-invalid-record'); }
		const epoch = this.generation;
		let state = this.recordGenerations.get(ref.url);
		if (!state) { state = { released: false }; this.recordGenerations.set(ref.url, state); }
		let track = this.tracks.get(ref.url);
		let context: Record<string, unknown>;
		if (track) {
			try { context = await track.next(signal); }
			catch (error) {
				if (track.failed && this.tracks.get(ref.url) === track) { this.tracks.delete(ref.url); }
				throw error;
			}
		} else { context = await this.context(ref.url, signal); }
		const config = await cancellable(this.configuration(), signal);
		signal.throwIfAborted();
		if (state.released || epoch !== this.generation) { throw new Error('luogu-record-released'); }
		const snapshot = parseLuoguRecord(ref, context, config);
		if (snapshot.phase === 'queued' || snapshot.phase === 'judging') {
			if (!track) {
				const socket = await this.ports.createSocket?.();
				if (!socket) { throw new Error('luogu-session-socket-unavailable'); }
				if (state.released || epoch !== this.generation || signal.aborted) { socket.close(); throw new Error('luogu-record-released'); }
				track = this.createTrack(ref, context, socket); this.tracks.set(ref.url, track);
			}
		} else if (track) {
			this.releaseRecord(ref);
			if (snapshot.phase === 'finished') { return parseLuoguRecord(ref, await this.context(ref.url, signal), config); }
		}
		return snapshot;
	}
	releaseRecord(ref: RecordRef): void {
		const state = this.recordGenerations.get(ref.url); if (state) { state.released = true; this.recordGenerations.delete(ref.url); }
		this.tracks.get(ref.url)?.dispose(new Error('luogu-record-released')); this.tracks.delete(ref.url);
	}
	private createTrack(ref: RecordRef, initial: Record<string, unknown>, socket: WebSocket) {
		let context = initial, joined = false, failure: Error | undefined;
		let pending: { resolve(value: Record<string, unknown>): void; reject(error: Error): void } | undefined;
		let queued: Record<string, unknown> | undefined;
		const dispose = (error: Error) => { if (failure) { return; } failure = error; clearTimeout(timer); pending?.reject(error); pending = undefined; socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); };
		const timer = setTimeout(() => dispose(new Error('luogu-push-timeout')), 6000);
		const push = (raw: unknown) => {
			const record = { ...object(raw) };
			for (const key of ['memory', 'time', 'score']) { if (typeof record[key] === 'string' && String(record[key]).trim() && Number.isFinite(Number(record[key]))) { record[key] = Number(record[key]); } }
			if (!Number.isSafeInteger(record.status) || record.id !== undefined && String(record.id) !== ref.id) { throw new Error('luogu-push-invalid-record'); }
			const data = object(context.data ?? context.currentData); context = { ...context, data: { ...data, record: { ...object(data.record), ...record } } };
			if (pending) { const waiter = pending; pending = undefined; waiter.resolve(context); } else { queued = context; }
		};
		socket.onopen = () => socket.send(JSON.stringify({ type: 'join_channel', channel: 'record.track', channel_param: ref.id }));
		socket.onmessage = event => { try { const value = object(JSON.parse(String(event.data))); if (value._ws_type === 'join_result' && !joined) { joined = true; clearTimeout(timer); push(object(value.welcome_message).record); } else if (joined && value._ws_type === 'server_broadcast' && value.type === 'status_push') { push(value.record); } } catch { dispose(new Error('luogu-push-invalid-response')); } };
		socket.onerror = () => dispose(new Error('luogu-push-failed')); socket.onclose = () => dispose(new Error('luogu-push-closed'));
		return {
			get failed() { return failure !== undefined; },
			dispose, next: async (signal: AbortSignal): Promise<Record<string, unknown>> => {
				signal.throwIfAborted(); if (queued) { const value = queued; queued = undefined; return value; } if (failure) { throw failure; } if (pending) { throw new Error('luogu-record-busy'); }
				return new Promise((resolve, reject) => { const abort = () => { pending = undefined; reject(new Error('luogu-record-cancelled')); }; signal.addEventListener('abort', abort, { once: true }); pending = { resolve: value => { signal.removeEventListener('abort', abort); resolve(value); }, reject: error => { signal.removeEventListener('abort', abort); reject(error); } }; });
			}
		};
	}
}
