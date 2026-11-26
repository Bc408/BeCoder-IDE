/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import type { IBeaconContext, IBeaconPageRead } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { IBeaconRecordByKind, BeaconRecordKind, IBeaconCurrentCodeFile } from 'becoder-beacon';
import type { ProblemRef, ProblemDocument } from 'becoder-oj-connect';
import type { BeaconContextClient, BeaconPage } from './context';
import { isProtectedFilePath } from './fileTools';
import { contextToolNames, contextInputValid, type BeaconContextToolName, type BeaconToolInputs } from './contextToolContract';
import type { BeCoderInfoReader } from './productInfo';
import { availableVerdict, codeHash, projectRecord, recordDirectory } from './recordProjection';
import { checkRunRecordSize } from '../../../src/vs/platform/beacon/common/beaconRunRecord';

export interface ContextSource { kind: 'page' | 'runtime'; id: string; origin?: string; version?: string; pageNumber?: number; revision?: number; producer?: 'runner' | 'cph' | 'notebook'; capturedAt: number; contentSha256: string; sourceSha256?: string; partial?: boolean; representation: string }
export interface ContextOutput { ok?: boolean; contents?: string; error?: string | { code: string; message: string }; source?: ContextSource; [key: string]: unknown }
export interface ContextAccess {
	execute(name: BeaconContextToolName, input: Record<string, unknown>, signal: AbortSignal): Promise<ContextOutput>;
	describe(signal: AbortSignal): Promise<string>;
	readonly names?: readonly BeaconContextToolName[];
	compactionView?(): ContextAccess | undefined;
	fixedRecordIds?(): Readonly<Partial<Record<'readProblemRecord' | 'readRunRecord' | 'readVerdictRecord', readonly string[]>>>;
}
export interface ContextToolOptions {
	readBeCoderInfo?: BeCoderInfoReader;
	authorizeLocal?: (path: string, signal: AbortSignal) => Promise<string>;
	resolveProblemId?: (oj: BeaconToolInputs['fetchProblem']['oj'], problemId: string) => Promise<ProblemRef>;
	readProblem?: (ref: ProblemRef, signal: AbortSignal, options?: { family?: 'c' | 'cpp' }) => Promise<ProblemDocument>;
}

// Apply to the complete representation before pagination, including decoded bytes.
export function redactContext(text: string): string {
	// Keep string delimiters and following code; escaped HTTP line endings delimit header values too.
	return text.replace(/(["'])((?:\\[^\r\n]|(?!\1)[^\\\r\n])*)\1/g, (literal, quote: string, value: string) => {
		const filtered = value.replace(/(^|\\r\\n|\\n)([ \t]*(?:set-cookie|cookie)[ \t]*:[ \t]*)([\s\S]*?)(?=\\r\\n|\\n|$)/gi, '$1$2[redacted]');
		return filtered === value ? literal : quote + filtered + quote;
	})
		.replace(/((["'])(?:set-cookie|cookie)\2[ \t]*:[ \t]*)(["'])((?:\\[^\r\n]|(?!\3)[^\\\r\n])*)\3/gi, (_literal, prefix: string, _keyQuote: string, quote: string) => prefix + quote + '[redacted]' + quote)
		.replace(/^([ \t]*(?:(\/\/|\/\*|\*)[ \t]*)?(?:set-cookie|cookie)[ \t]*:[ \t]*)((?:(?!\\r\\n|\\n)[^\r\n])*)/gim, (_line, prefix: string, comment: string | undefined, value: string) => {
			const end = comment === '/*' || comment === '*' ? /[ \t]*\*\//.exec(value)?.index : undefined;
			return prefix + '[redacted]' + (end === undefined ? '' : value.slice(end));
		})
		.replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted private key]')
		.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
		.replace(/(\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
		.replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization)["']?\s*[:=]\s*["']?)([^\s"'&,;\\]+)/gi, '$1[redacted]');
}

export function redactValues(value: unknown): unknown {
	if (typeof value === 'string') { return redactContext(value); }
	if (Array.isArray(value)) { return value.map(redactValues); }
	if (value && typeof value === 'object') { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|set-cookie)$/i.test(key) ? '[redacted]' : redactValues(item)])); }
	return value;
}

const recordKinds: Partial<Record<BeaconContextToolName, BeaconRecordKind>> = { readProblemRecord: 'problem', readRunRecord: 'run', readVerdictRecord: 'verdict' };

/** Exact owner codes only; arbitrary exception prose is never a classifier. */
function sourceFailure(error: unknown): ContextOutput {
	const code = error instanceof Error ? error.message : '';
	const messages: Record<string, string> = {
		'beacon-context-changed': 'The workspace, mode or conversation changed during this request. This read is no longer valid.',
		'beacon-conversation-owner': 'This request does not belong to the current conversation.',
		'beacon-notebook-content-owner': 'This document has no available supported loaded Notebook content representation.',
		'beacon-code-unavailable': 'No readable displayed code is available for this call.',
		'beacon-page-closed': 'This page is closed. Its contents were not read.',
		'beacon-page-changed': 'The page changed during reading. Read its current version if needed.',
		'beacon-page-provider-unavailable': 'The open page has no available content provider.',
		'beacon-page-not-ready': 'The open page is not ready to be read.',
		'beacon-protected-page': 'This page is outside the permitted reading scope.',
		'beacon-workspace-unavailable': 'No usable Beacon workspace is available for this source.',
		'beacon-record-not-found': 'The requested record is not available.',
		'beacon-record-evicted': 'The requested record has been evicted from the recent queue.',
		'beacon-material-missing': 'The requested material is not available.',
		'beacon-page-timeout': 'The page read timed out.',
		'beacon-page-too-large': 'The page exceeds the reading capacity.',
		'beacon-context-budget': 'The reading budget for this answer has been reached.',
		'beacon-invalid-context-input': 'The requested context parameters are invalid.',
		'beacon-verdict-source-mismatch': 'The recorded submission source did not match; this verdict is unavailable.',
		'notebook-content-unavailable': 'The loaded Notebook content is unavailable.',
		'notebook-execution-part-unavailable': 'Notebook execution results must be read from retained run records.',
		'beacon-persisted-evidence-required': 'This source is available only through its retained activity records.',
		'oj-connect-invalid-problem': 'The OJ or canonical problem ID is invalid.',
		'oj-connect-invalid-host-response': 'OJ Connect returned an unreadable statement response.',
		'atcoder-login-required': 'Reading this AtCoder problem requires the user to sign in on the website.',
		'nowcoder-login-required': 'Reading this Nowcoder problem requires the user to sign in on the website.',
		'lanqiao-login-required': 'Reading this Lanqiao problem requires the user to sign in on the website.',
		'codeforces-login-required': 'Reading this Codeforces problem requires the user to sign in on the website.',
		'codeforces-request-timeout': 'The Codeforces problem request timed out.',
		'oj-statement-target': 'The canonical problem target is invalid.',
		'oj-statement-timeout': 'The official problem statement request timed out.',
		'oj-statement-parse-timeout': 'The official problem statement parser timed out.',
		'oj-statement-request-failed': 'The official problem statement request failed.',
		'oj-statement-response-body-read': 'The official problem response body could not be read.',
		'oj-statement-response-type': 'The official problem response has an unsupported content type.',
		'oj-statement-response-unavailable': 'The official problem response is unavailable.',
		'oj-statement-redirect-unavailable': 'The official problem request was redirected to an unavailable target.',
		'oj-connect-response-too-large': 'The official problem response exceeds the reading capacity.'
	};
	if (code === 'beacon-run-record-too-large') { return failure('too_large', 'This run record exceeds 32 KB and cannot be read. Other records remain available.'); }
	return Object.hasOwn(messages, code) ? failure(code, messages[code]) : failure('read_failed', 'The requested source could not be read. Do not infer its contents.');
}
const failure = (code: string, message: string): ContextOutput => ({ error: { code, message } });

export class ContextTools implements ContextAccess {
	private readonly fixed = new Map<string, IBeaconRecordByKind[BeaconRecordKind]>();
	private readonly pending = new Map<string, Promise<IBeaconRecordByKind[BeaconRecordKind]>>();
	private compacting = false;
	constructor(private readonly client: BeaconContextClient, private readonly scope: IBeaconContext, private readonly protectedRoots: string[] = [], private readonly options: ContextToolOptions = {}) { }
	get names(): readonly BeaconContextToolName[] {
		if (this.compacting) { return contextToolNames.filter(name => Object.hasOwn(this.fixedRecordIds(), name)); }
		return contextToolNames.filter(name => name === 'readBeCoderInfo' ? !!this.options.readBeCoderInfo : !recordKinds[name] || this.scope.usable && this.scope.mode !== 'blackout');
	}
	compactionView(): ContextAccess {
		const view = new ContextTools(this.client, this.scope, this.protectedRoots, this.options); view.compacting = true;
		for (const [key, value] of this.fixed) { view.fixed.set(key, structuredClone(value)); }
		return view;
	}
	fixedRecordIds(): Readonly<Partial<Record<'readProblemRecord' | 'readRunRecord' | 'readVerdictRecord', readonly string[]>>> {
		if (!this.compacting || !this.scope.usable || this.scope.mode === 'blackout') { return {}; }
		return Object.fromEntries(Object.entries(recordKinds).flatMap(([name, kind]) => {
			const ids = [...this.fixed.keys()].filter(key => key.startsWith(kind + ':')).map(key => key.slice(kind.length + 1));
			return ids.length ? [[name, ids]] : [];
		}));
	}
	private call<T>(operation: string, input: object, signal: AbortSignal): Promise<T> { return this.client.scopedCall(this.scope, operation, input, signal); }
	private allowedMetadata(page: BeaconPage): boolean {
		if (['oj-problem', 'oj-record', 'unsupported'].includes(page.kind)) { return false; }
		if (page.uri?.startsWith('file:')) {
			const file = fileURLToPath(page.uri);
			const normalized = file.replace(/\\/g, '/').toLowerCase();
			if (normalized.split('/').includes('.beaconwork') || isProtectedFilePath(file) || this.protectedRoots.some(root => { const base = root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase(); return normalized === base || normalized.startsWith(base + '/'); })) { return false; }
		}
		return true;
	}
	private allowedPage(page: BeaconPage): boolean { return this.allowedMetadata(page) && page.kind !== 'notebook' && !(page.kind === 'text' && ['c', 'cpp'].includes(page.languageId ?? '')); }
	async describe(signal: AbortSignal): Promise<string> {
		const pages = (await this.call<BeaconPage[]>('pages', {}, signal)).filter(page => this.allowedMetadata(page));
		return JSON.stringify(redactValues({ beaconMode: this.scope.mode, beaconWorkspace: this.scope.root ? { path: this.scope.root, activityCollectionEligible: this.scope.usable } : null, pages }));
	}
	async execute(name: BeaconContextToolName, input: Record<string, unknown>, signal: AbortSignal): Promise<ContextOutput> {
		signal.throwIfAborted();
		if (!contextToolNames.includes(name) || !contextInputValid(name, input)) { return failure('invalid_arguments', 'Use only the parameters declared for this tool.'); }
		if (!this.names.includes(name)) { return failure('unavailable', 'This source is unavailable in the current Beacon mode.'); }
		if (name === 'readBeCoderInfo') {
			try { return { ...await this.options.readBeCoderInfo!(input.topic as BeaconToolInputs['readBeCoderInfo']['topic'] ?? 'overview', signal) }; }
			catch { signal.throwIfAborted(); return failure('read_failed', 'The bundled BeCoder product information could not be read.'); }
		}
		try {
			const kind = recordKinds[name];
			if (kind) {
				if (!this.scope.usable || this.scope.mode === 'blackout') { return failure('unavailable', 'Persistent records are unavailable in this mode.'); }
				let selected: IBeaconRecordByKind[BeaconRecordKind] | undefined;
				if (input.id === undefined) {
					if (this.compacting) { return failure('unavailable', 'Compaction can read only records already fixed by ID.'); }
					const pathKey = (value: string) => path.win32.resolve(this.scope.root!, value).toLowerCase();
					if (input.filePath !== undefined && (/[\0<>"|?*]/.test(String(input.filePath)) || /^[a-z]+:\/\//i.test(String(input.filePath)))) { return failure('invalid_arguments', 'Use a recorded local file path.'); }
					const records = (await this.call<IBeaconRecordByKind[BeaconRecordKind][]>('listRecords', { kind }, signal))
						.filter(record => kind !== 'verdict' || availableVerdict(record as IBeaconRecordByKind['verdict']))
						.filter(record => input.filePath === undefined || (() => { const file = kind === 'run' ? (record as IBeaconRecordByKind['run']).program.filePath : (record as IBeaconRecordByKind['problem' | 'verdict']).filePath; return file !== null && pathKey(file) === pathKey(String(input.filePath)); })());
					if (!input.latest) { return { records: records.slice().reverse().map(record => redactValues(recordDirectory(kind, record))) }; }
					selected = records.at(-1);
					if (!selected) { return failure('not_found', 'No matching recent record is available.'); }
					input = { id: selected.id };
				}
				const key = `${kind}:${input.id}`;
				if (!this.fixed.has(key)) {
					if (this.compacting) { return failure('unavailable', 'Compaction can read only records already fixed in this answer.'); }
					let pending = this.pending.get(key);
					if (!pending) {
						pending = (selected ? Promise.resolve(selected) : this.call<IBeaconRecordByKind[BeaconRecordKind]>('readRecord', { kind, id: input.id }, signal)).then(record => { if (record?.id !== input.id) { throw new Error('beacon-record-not-found'); } if (kind === 'run') { checkRunRecordSize(record as IBeaconRecordByKind['run']); } if (kind === 'verdict' && !availableVerdict(record as IBeaconRecordByKind['verdict'])) { throw new Error('beacon-verdict-source-mismatch'); } this.fixed.set(key, structuredClone(record)); return record; }); this.pending.set(key, pending);
					}
					try { await pending; } finally { this.pending.delete(key); }
				}
				await this.call('context', {}, signal);
				return { record: redactValues(projectRecord(kind, this.fixed.get(key)!)) };
			}
			if (name === 'readCurrentCode') {
				if (this.compacting) { return failure('unavailable', 'Compaction cannot read live code.'); }
				const files = await this.call<IBeaconCurrentCodeFile[]>('visibleCurrentCode', {}, signal);
				return { files: redactValues(files.map(file => {
					const base = { fileName: file.fileName, filePath: file.filePath, isDirty: file.isDirty };
					if (file.kind !== 'notebook') { return { ...base, kind: 'code', code: file.code, codeHash: codeHash(file.code) }; }
					return { ...base, kind: 'notebook', cells: file.cells.map(cell => {
						const { cellNumber, kind, language, source, id, name, attachments } = cell;
						return { cellNumber, kind, language, source, ...(id === undefined ? {} : { id }), ...(kind === 'input' && name !== undefined ? { name } : {}), ...(attachments === undefined ? {} : { attachments }), ...(kind === 'code' && ['c', 'cpp'].includes(language) ? { codeHash: codeHash(source) } : {}) };
					}) };
				})) };
			}
			if (name === 'fetchProblem') {
				if (this.compacting || !this.options.resolveProblemId || !this.options.readProblem) { return failure('unavailable', 'Problem fetching is unavailable.'); }
				const request = input as unknown as BeaconToolInputs['fetchProblem'];
				const ref = await this.options.resolveProblemId(request.oj, request.problemId);
				const document = await this.options.readProblem(ref, signal);
				signal.throwIfAborted(); await this.call('context', {}, signal);
				return redactValues({ problem: request, document: { title: document.title, bodies: document.bodies, samples: document.samples, limits: document.limits, interactive: document.interactive, ...(document.difficulty ? { difficulty: document.difficulty } : {}), ...(document.tags ? { tags: document.tags } : {}) }, retrievedAt: new Date().toISOString() }) as ContextOutput;
			}
			if (name === 'readPage') {
				if (this.compacting) { return failure('unavailable', 'Compaction cannot read a new page.'); }
				const page = (await this.call<BeaconPage[]>('pages', {}, signal)).find(page => page.id === input.id);
				if (!page) { return failure('not_found', 'This page is no longer open.'); }
				if (!this.allowedPage(page)) { return failure('unavailable', 'Use the dedicated code, problem or record tool for this source.'); }
				if (page.reason) { throw new Error(page.reason); }
				if (page.kind === 'pdf' ? !input.pageNumber || !page.pageCount || Number(input.pageNumber) > page.pageCount : input.pageNumber !== undefined) { return failure('invalid_arguments', 'Use a valid physical PDF page number only for PDF pages.'); }
				const captured = await this.call<IBeaconPageRead>('page', { ...input, version: page.version }, signal);
				const current = (await this.call<BeaconPage[]>('pages', {}, signal)).find(value => value.id === page.id);
				if (!current) { return sourceFailure(new Error('beacon-page-closed')); }
				if (current.version !== page.version || current.uri !== page.uri || !this.allowedPage(current)) { return sourceFailure(new Error('beacon-page-changed')); }
				const source: ContextSource = { kind: 'page', id: page.id, origin: page.uri, version: page.version, ...(input.pageNumber ? { pageNumber: Number(input.pageNumber) } : {}), capturedAt: Date.now(), contentSha256: createHash('sha256').update(captured.contents).digest('hex'), representation: page.kind === 'pdf' ? 'PDF.js text extraction, no OCR' : 'authorized loaded page text' };
				return this.text(captured.contents, input, { ...page, ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}), source });
			}
			return failure('invalid_arguments', 'Unknown context tool.');
		} catch (error) {
			signal.throwIfAborted();
			return sourceFailure(error);
		}
	}
	private text(raw: string, input: Record<string, unknown>, metadata: Record<string, unknown>): ContextOutput {
		const contents = redactContext(raw), characters = Array.from(contents), offset = Number(input.offset ?? 0), end = Math.min(characters.length, offset + Number(input.limit ?? 32768));
		return { ok: true, ...redactValues(metadata) as Record<string, unknown>, contents: characters.slice(offset, end).join(''), offsetUnit: 'character', redacted: raw !== contents, offset, totalCharacters: characters.length, truncated: offset > 0 || end < characters.length, ...(end < characters.length ? { nextOffset: end } : {}) };
	}
}
