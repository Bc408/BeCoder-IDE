/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { setTimeout as delay } from 'timers/promises';

export type RequestFailureKind = 'connection' | 'timeout' | 'rate-limit' | 'unavailable';
export interface RequestFailure { kind: RequestFailureKind; retries: number }
export interface RequestRetry { attempt: number; limit: number }
export interface RequestDiagnostic { requestId: string; kind: RequestFailureKind | 'recovered' | 'rejected'; code: string; attempt: number; elapsedMs: number }
export interface RecoveryOptions {
	progress?: (retry: RequestRetry | undefined) => void;
	diagnostic?: (event: RequestDiagnostic) => void;
	wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
	random?: () => number;
}
interface TransportFailure { kind: RequestFailureKind | 'rejected'; code: string; retryable: boolean }

export class RequestRejectedError extends Error {
	constructor(readonly code: string, cause?: unknown) { super('provider-request-rejected', { cause }); }
}

export class RequestRecoveryError extends Error {
	constructor(readonly failure: RequestFailure, readonly code: string, cause?: unknown) { super(failure.kind, { cause }); }
}

function parseErrorBody(value: unknown): unknown {
	if (typeof value !== 'string' || value.length > 16384) { return; }
	try { return JSON.parse(value); } catch { return; }
}

function providerFailure(status: number | undefined, ...values: unknown[]): TransportFailure | undefined {
	const kind = status === 429 ? 'rate-limit' : status === 408 ? 'timeout' : [409, 425].includes(status ?? 0) ? 'connection' : [500, 502, 503, 504, 520, 522, 524, 529].includes(status ?? 0) ? 'unavailable' : undefined;
	// A structured code may refine a temporary HTTP failure, never turn an
	// authentication, address or parameter rejection into a retryable request.
	if (status !== undefined && !kind) { return; }
	const codes = values.flatMap(value => {
		const root = value && typeof value === 'object' ? value as { error?: unknown; code?: unknown; type?: unknown } : undefined;
		const detail = root?.error && typeof root.error === 'object' ? root.error as { code?: unknown; type?: unknown } : undefined;
		return [detail?.code, detail?.type, root?.code, root?.type];
	}).filter((code): code is string => typeof code === 'string' && code.length <= 128).map(code => code.toLowerCase());
	for (const code of codes) {
		const rejected = ['insufficient_quota', 'quota_exceeded', 'billing_hard_limit', 'billing_hard_limit_reached', 'credits_exhausted'].includes(code) ? 'QUOTA_EXHAUSTED'
			: ['authentication_error', 'invalid_api_key', 'permission_denied'].includes(code) ? 'AUTHENTICATION'
				: ['context_length_exceeded', 'prompt_too_long', 'max_tokens_exceeded'].includes(code) ? 'CONTEXT_TOO_LARGE'
					: ['invalid_request_error', 'invalid_request'].includes(code) ? 'INVALID_REQUEST' : undefined;
		if (rejected) { return { kind: 'rejected', code: rejected, retryable: false }; }
	}
	if (codes.some(code => ['overloaded', 'overloaded_error', 'service_unavailable'].includes(code))) { return { kind: 'unavailable', code: 'PROVIDER_OVERLOADED', retryable: true }; }
	if (codes.some(code => ['rate_limit', 'rate_limit_error', 'rate_limit_exceeded', 'too_many_requests', 'resource_exhausted'].includes(code))) { return { kind: 'rate-limit', code: 'PROVIDER_RATE_LIMIT', retryable: true }; }
	return kind ? { kind, code: `HTTP_${status}`, retryable: true } : undefined;
}

/** Read only a bounded error-body copy; broken or slow bodies retain the HTTP policy. */
async function responseFailure(response: Response, signal: AbortSignal): Promise<TransportFailure | undefined> {
	const fallback = providerFailure(response.status);
	if (!fallback) { return; }
	const reader = response.clone().body?.getReader();
	if (!reader) { return fallback; }
	const cancel = () => { void reader.cancel().catch(() => {}); };
	const timer = setTimeout(cancel, 1000);
	signal.addEventListener('abort', cancel, { once: true });
	try {
		const decoder = new TextDecoder();
		let body = ''; let bytes = 0;
		while (true) {
			signal.throwIfAborted();
			const part = await reader.read();
			if (part.done) { return providerFailure(response.status, parseErrorBody(body + decoder.decode())) ?? fallback; }
			bytes += part.value.byteLength;
			if (bytes > 16384) { return fallback; }
			body += decoder.decode(part.value, { stream: true });
		}
	} catch { return fallback; }
	finally {
		clearTimeout(timer); signal.removeEventListener('abort', cancel);
		// A tee's cancel promise can wait for the original body; do not await it.
		cancel(); reader.releaseLock();
	}
}

function transportFailure(error: unknown): TransportFailure | undefined {
	const seen = new Set<unknown>();
	let current = error;
	let genericNetwork = false;
	for (let depth = 0; depth < 8 && current && typeof current === 'object' && !seen.has(current); depth++) {
		seen.add(current);
		if (current instanceof RequestRecoveryError) { return { kind: current.failure.kind, code: current.code, retryable: false }; }
		if (current instanceof RequestRejectedError) { return { kind: 'rejected', code: current.code, retryable: false }; }
		const details = current as { code?: string; name?: string; message?: string; statusCode?: number; responseBody?: string; data?: unknown; cause?: unknown };
		const provider = providerFailure(details.statusCode, details.data, parseErrorBody(details.responseBody), details);
		if (provider) { return provider; }
		if (details.statusCode !== undefined && details.statusCode >= 400) { return; }
		if (details.name === 'TimeoutError') { return { kind: 'timeout', code: 'TIMEOUT', retryable: true }; }
		if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(details.code ?? '')) { return { kind: 'timeout', code: details.code!, retryable: true }; }
		if (['ECONNRESET', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(details.code ?? '')) { return { kind: 'connection', code: details.code!, retryable: true }; }
		if (details.code) { return ['ECONNREFUSED', 'ENOTFOUND'].includes(details.code) ? { kind: 'connection', code: details.code, retryable: false } : undefined; }
		genericNetwork ||= details.name === 'TypeError' && ['fetch failed', 'failed to fetch'].includes(details.message?.toLowerCase() ?? '');
		current = details.cause;
	}
	return genericNetwork ? { kind: 'connection', code: 'NETWORK', retryable: true } : undefined;
}

function retryDelay(headers: Headers | undefined): number | undefined {
	const value = headers?.get('retry-after')?.trim();
	if (value) {
		if (/^\d+$/.test(value)) { return Math.min(Number(value) * 1000, Number.MAX_SAFE_INTEGER); }
		const date = Number.isNaN(Number(value)) ? Date.parse(value) : NaN;
		if (Number.isFinite(date)) { return Math.max(0, date - Date.now()); }
	}
	for (const name of ['retry-after-ms', 'x-ms-retry-after-ms']) {
		const precise = headers?.get(name)?.trim();
		if (precise && /^\d+$/.test(precise)) { return Math.min(Number(precise), Number.MAX_SAFE_INTEGER); }
	}
	return;
}

/** One response-wide retry budget. Never replay committed output or a completed tool step. */
export class RequestRecovery {
	private retries = 0;
	private waited = 0;
	private committed = false;
	private recovering = false;
	private lastFailureCode: string | undefined;
	private readonly startedAt = Date.now();
	private readonly requestId = randomUUID();
	constructor(private readonly request: typeof fetch, private readonly signal: AbortSignal, private readonly options: RecoveryOptions = {}) { }

	commit(): void { this.committed = true; }
	private progress(retry?: RequestRetry): void {
		try { this.options.progress?.(retry); } catch { /* Observers cannot change a provider outcome. */ }
	}
	private diagnose(kind: RequestDiagnostic['kind'], code: string): void {
		try { this.options.diagnostic?.({ requestId: this.requestId, kind, code, attempt: this.retries + 1, elapsedMs: Date.now() - this.startedAt }); } catch { /* A closed output channel must not fail a request. */ }
	}
	wrap(error: unknown): unknown {
		const failure = transportFailure(error);
		if (!failure || (this.signal.aborted && this.signal.reason?.name !== 'TimeoutError')) { return error; }
		if (this.lastFailureCode !== failure.code) { this.diagnose(failure.kind, failure.code); this.lastFailureCode = failure.code; }
		if (failure.kind === 'rejected') { return error instanceof RequestRejectedError ? error : new RequestRejectedError(failure.code, error); }
		return new RequestRecoveryError({ kind: failure.kind, retries: this.retries }, failure.code, error);
	}
	private async pause(failure: TransportFailure, headers: Headers | undefined, signal: AbortSignal, replayable = true): Promise<boolean> {
		const base = (failure.kind === 'rate-limit' ? 2000 : failure.kind === 'unavailable' ? 1000 : 350) * 2 ** this.retries;
		const milliseconds = retryDelay(headers) ?? base + Math.floor(base / 4 * (this.options.random ?? Math.random)());
		if (this.committed || !failure.retryable || this.retries >= 2 || this.waited + milliseconds > 10000 || !replayable) { return false; }
		signal.throwIfAborted();
		this.retries++; this.waited += milliseconds; this.recovering = true;
		this.progress({ attempt: this.retries, limit: 2 });
		await (this.options.wait ?? (async (time, abort) => { await delay(time, undefined, { signal: abort }); }))(milliseconds, signal);
		signal.throwIfAborted();
		return true;
	}
	async retryStream(error: unknown): Promise<boolean> {
		if (this.signal.aborted) { return false; }
		const failure = transportFailure(error);
		if (!failure || !failure.retryable) { return false; }
		this.lastFailureCode = failure.code; this.diagnose(failure.kind, failure.code);
		const headers = (error as { responseHeaders?: Record<string, string> }).responseHeaders;
		return this.pause(failure, headers ? new Headers(headers) : undefined, this.signal);
	}

	readonly fetch: typeof fetch = async (input, init) => {
		const signal = init?.signal ? AbortSignal.any([this.signal, init.signal]) : this.signal;
		while (true) {
			signal.throwIfAborted();
			let response: Response | undefined;
			let error: unknown;
			let failure: TransportFailure | undefined;
			try {
				response = await this.request(input, { ...init, signal });
				failure = await responseFailure(response, signal);
				signal.throwIfAborted();
				if (!failure) {
					if (response.ok && this.recovering) { this.diagnose('recovered', 'HTTP_OK'); }
					if (!response.ok) { this.diagnose('rejected', `HTTP_${response.status}`); }
					this.recovering = false; this.lastFailureCode = undefined;
					this.progress(); return response;
				}
			} catch (caught) {
				if (signal.aborted) { await response?.body?.cancel().catch(() => {}); throw caught; }
				error = caught; failure = transportFailure(caught);
				if (!failure) { this.diagnose('rejected', 'OTHER'); throw caught; }
			}
			if (!failure) { throw error; }
			this.lastFailureCode = failure.code;
			this.diagnose(failure.kind, failure.code);
			// Close rejected HTTP bodies before another request can reuse the connection.
			await response?.body?.cancel().catch(() => {});
			if (failure.kind === 'rejected') { throw new RequestRejectedError(failure.code, error); }
			if (!await this.pause(failure, response?.headers, signal, typeof init?.body === 'string')) {
				throw new RequestRecoveryError({ kind: failure.kind, retries: this.retries }, failure.code, error);
			}
		}
	};
}
