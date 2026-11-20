/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session } from 'electron';
// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, RecordRef } from 'becoder-oj-connect';
import { assertLanqiaoProblem, lanqiaoExecution, lanqiaoRecord } from './lanqiaoProtocol.js';

export type LanqiaoOperation = { kind: 'account' | 'catalogue-page' }
	| { kind: 'problem' | 'records'; problem: ProblemRef }
	| { kind: 'record'; record: RecordRef }
	| { kind: 'catalogue-asset'; url: string }
	| { kind: 'source'; problem: ProblemRef; source: string; language: 'c' | 'cpp' }
	| { kind: 'execute'; url: string; questionId: string }
	| { kind: 'report'; problem: ProblemRef; id: string };
export interface LanqiaoResponse { readonly status: number; readonly body: string }
export interface LanqiaoTransport { request(operation: LanqiaoOperation, signal: AbortSignal, beforeDispatch?: () => void): Promise<LanqiaoResponse> }
function target(operation: LanqiaoOperation): { url: string; method: 'GET' | 'POST'; body?: string } {
	const origin = 'https://www.lanqiao.cn';
	if (operation.kind === 'account') { return { url: origin + '/api/v2/user/basic/', method: 'GET' }; }
	if (operation.kind === 'catalogue-page') { return { url: origin + '/problems/', method: 'GET' }; }
	if (operation.kind === 'catalogue-asset') {
		if (typeof operation.url !== 'string' || !/^https:\/\/assets\.lanqiao\.cn\/lanqiao-fe\/v\d+\.\d+\.\d+\/dist\/[a-f0-9]{7}\.js$/.test(operation.url)) { throw new Error('lanqiao-asset-target'); }
		return { url: operation.url, method: 'GET' };
	}
	if (operation.kind === 'execute') { return { url: lanqiaoExecution(operation.url, operation.questionId).url, method: 'GET' }; }
	if (operation.kind === 'record') {
		const ref = lanqiaoRecord(operation.record.problem, operation.record.id);
		if (ref.url !== operation.record.url) { throw new Error('lanqiao-invalid-record'); }
		return { url: origin + '/api/v2/problems/' + ref.problem.nativeId + '/submissions/' + ref.id + '/', method: 'GET' };
	}
	if (operation.kind !== 'problem' && operation.kind !== 'records' && operation.kind !== 'source' && operation.kind !== 'report') { throw new Error('lanqiao-invalid-operation'); }
	assertLanqiaoProblem(operation.problem);
	const base = origin + '/api/v2/problems/' + operation.problem.nativeId + '/';
	if (operation.kind === 'problem') { return { url: base + 'new/', method: 'GET' }; }
	if (operation.kind === 'records') { return { url: base + 'submissions/', method: 'GET' }; }
	if (operation.kind === 'source') {
		if (operation.language !== 'c' && operation.language !== 'cpp' || typeof operation.source !== 'string' || !operation.source.trim() || Buffer.byteLength(operation.source) > 1024 * 1024) { throw new Error('lanqiao-invalid-source'); }
		return { url: base + 'submit/', method: 'POST', body: JSON.stringify({ language: operation.language, submit_content: operation.source, judge_client: 2, is_submit: true }) };
	}
	if (operation.kind === 'report') {
		lanqiaoRecord(operation.problem, operation.id);
		return { url: base + 'submit-report/', method: 'POST', body: JSON.stringify({ submission_id: operation.id, is_submit: true, problem_type: 6, judge_client: 2 }) };
	}
	throw new Error('lanqiao-invalid-operation');
}

/** Fixed native operations, one dispatch, no redirect following or network retries. */
export function createLanqiaoTransport(session: Session, factory?: typeof import('electron').net.request): LanqiaoTransport {
	return {
		async request(operation, signal, beforeDispatch) {
			signal.throwIfAborted();
			const endpoint = target(operation);
			const request = factory ?? (await import('electron')).net.request;
			signal.throwIfAborted();
			return new Promise<LanqiaoResponse>((resolve, reject) => {
				let req: Electron.ClientRequest, done = false;
				try { req = request({ url: endpoint.url, method: endpoint.method, session, useSessionCookies: true, redirect: 'manual', cache: 'no-store' }); }
				catch { reject(new Error('lanqiao-request-failed')); return; }
				const finish = (value?: LanqiaoResponse, error?: unknown) => {
					if (done) { return; } done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
					if (error !== undefined) { reject(error); } else { resolve(value!); }
					try { req.abort(); } catch { /* Result already settled. */ }
				};
				const abort = () => finish(undefined, new Error('lanqiao-request-cancelled'));
				const timer = setTimeout(() => finish(undefined, new Error('lanqiao-request-timeout')), 15000);
				signal.addEventListener('abort', abort, { once: true });
				req.on('redirect', status => finish({ status, body: '' }));
				req.on('error', () => finish(undefined, new Error('lanqiao-request-failed')));
				req.on('response', response => {
					const chunks: Buffer[] = []; let size = 0;
					response.on('error', () => finish(undefined, new Error('lanqiao-response-failed')));
					response.on('data', (chunk: Buffer) => { if (done) { return; } size += chunk.length; if (size > 4 * 1024 * 1024) { finish(undefined, new Error('lanqiao-response-too-large')); } else { chunks.push(chunk); } });
					response.on('end', () => finish({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
				});
				try {
					req.setHeader('Accept', endpoint.method === 'POST' ? 'application/json' : '*/*');
					if (endpoint.body !== undefined) { req.setHeader('Content-Type', 'application/json'); req.setHeader('Origin', 'https://www.lanqiao.cn'); }
					signal.throwIfAborted(); beforeDispatch?.(); req.end(endpoint.body);
				} catch (error) { finish(undefined, error); }
			});
		}
	};
}
