/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import type { IBeaconContext, IBeaconPageRead } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { IBeaconRecordByKind, BeaconRecordKind, IBeaconCurrentCodeFile } from 'becoder-beacon';
import type { ProblemRef, ProblemDocument } from 'becoder-oj-connect';
import type { BeaconContextClient, BeaconPage } from './context';
import { isProtectedFilePath } from './fileTools';
import { contextToolNames, contextInputValid, type BeaconContextToolName, type BeaconToolInputs } from './contextToolContract';

export interface ContextSource { kind: 'page' | 'runtime'; id: string; origin?: string; version?: string; pageNumber?: number; revision?: number; producer?: 'runner' | 'cph' | 'notebook'; capturedAt: number; contentSha256: string; sourceSha256?: string; partial?: boolean; representation: string }
export interface ContextOutput { ok?: boolean; contents?: string; error?: string | { code: string; message: string }; source?: ContextSource; [key: string]: unknown }
export interface ContextAccess {
	execute(name: BeaconContextToolName, input: Record<string, unknown>, signal: AbortSignal): Promise<ContextOutput>;
	describe(signal: AbortSignal): Promise<string>;
	readonly names?: readonly BeaconContextToolName[];
	compactionView?(): ContextAccess | undefined;
}
export interface ContextSnapshot { key: string; raw: string; metadata: Record<string, unknown> }
export interface ContextToolOptions {
	privateSnapshots?: readonly ContextSnapshot[]; allowedPrivateKeys?: readonly string[]; capturePrivate?: (snapshot: ContextSnapshot) => void;
	authorizeLocal?: (path: string, signal: AbortSignal) => Promise<string>;
	resolveProblemId?: (oj: BeaconToolInputs['fetchProblem']['oj'], problemId: string) => Promise<ProblemRef>;
	readProblem?: (ref: ProblemRef, signal: AbortSignal, options?: { family?: 'c' | 'cpp' }) => Promise<ProblemDocument>;
}

/** Complete, already captured representations; never instructions or live reading grants. */
export function validContextSnapshots(value: unknown): value is ContextSnapshot[] {
	if (!Array.isArray(value) || value.length > 4096) { return false; }
	const keys = new Set<string>();
	try {
		for (const item of value as ContextSnapshot[]) {
			if (!item || typeof item.key !== 'string' || item.key.length > 4096 || !/^(page|material):.+/.test(item.key) || keys.has(item.key) || typeof item.raw !== 'string' || !item.metadata || typeof item.metadata !== 'object' || Array.isArray(item.metadata)) { return false; }
			keys.add(item.key);
			const source = item.metadata.source as ContextSource | undefined;
			if (!source || !['page', 'runtime'].includes(source.kind) || typeof source.id !== 'string' || !source.id || !Number.isFinite(source.capturedAt) || source.capturedAt < 0 || typeof source.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.contentSha256) || typeof source.representation !== 'string') { return false; }
			if (source.kind === 'runtime') {
				const document = JSON.parse(item.raw) as { code?: unknown; events?: unknown };
				if (!item.key.startsWith('material:') || item.key !== `material:${item.metadata.materialId}` || !Number.isSafeInteger(source.revision) || source.revision! < 1 || !document || typeof document.code !== 'string' || !Array.isArray(document.events)) { return false; }
			} else if (!item.key.startsWith('page:') || typeof source.version !== 'string') { return false; }
		}
		return Buffer.byteLength(JSON.stringify(value), 'utf8') <= 32 * 1024 * 1024;
	} catch { return false; }
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
const failure = (code: string, message: string): ContextOutput => ({ error: { code, message } });

export class ContextTools implements ContextAccess {
	private readonly fixed = new Map<string, IBeaconRecordByKind[BeaconRecordKind]>();
	private readonly pending = new Map<string, Promise<IBeaconRecordByKind[BeaconRecordKind]>>();
	private readonly materials = new Map<string, ContextSnapshot>();
	private compacting = false;
	constructor(private readonly client: BeaconContextClient, private readonly scope: IBeaconContext, private readonly protectedRoots: string[] = [], private readonly options: ContextToolOptions = {}) {
		if (validContextSnapshots(options.privateSnapshots ?? [])) {
			for (const snapshot of options.privateSnapshots ?? []) { if (options.allowedPrivateKeys?.includes(snapshot.key) && snapshot.metadata.source && (snapshot.metadata.source as ContextSource).kind === 'page') { this.materials.set(snapshot.key, structuredClone(snapshot)); } }
		}
	}
	get names(): readonly BeaconContextToolName[] {
		if (this.compacting) { return this.scope.usable && this.scope.mode !== 'blackout' ? ['readProblemRecord', 'readRunRecord', 'readVerdictRecord', 'readMaterial'] : []; }
		return contextToolNames.filter(name => !recordKinds[name] && name !== 'readMaterial' || this.scope.usable && this.scope.mode !== 'blackout');
	}
	compactionView(): ContextAccess {
		const view = new ContextTools(this.client, this.scope, this.protectedRoots, this.options); view.compacting = true;
		for (const [key, value] of this.fixed) { view.fixed.set(key, structuredClone(value)); }
		for (const [key, value] of this.materials) { view.materials.set(key, structuredClone(value)); }
		return view;
	}
	private call<T>(operation: string, input: object, signal: AbortSignal): Promise<T> { return this.client.scopedCall(this.scope, operation, input, signal); }
	private allowedMetadata(page: BeaconPage): boolean {
		if (['oj-problem', 'oj-record', 'notebook', 'unsupported'].includes(page.kind)) { return false; }
		if (page.uri?.startsWith('file:')) {
			const file = fileURLToPath(page.uri);
			const normalized = file.replace(/\\/g, '/').toLowerCase();
			if (normalized.split('/').includes('.beaconwork') || isProtectedFilePath(file) || this.protectedRoots.some(root => { const base = root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase(); return normalized === base || normalized.startsWith(base + '/'); })) { return false; }
		}
		return true;
	}
	private allowedPage(page: BeaconPage): boolean { return this.allowedMetadata(page) && !(page.kind === 'text' && ['c', 'cpp'].includes(page.languageId ?? '')); }
	async describe(signal: AbortSignal): Promise<string> {
		const pages = (await this.call<BeaconPage[]>('pages', {}, signal)).filter(page => this.allowedMetadata(page));
		return JSON.stringify(redactValues({ pages, materials: this.scope.mode === 'blackout' ? [] : [...this.materials.values()].map(item => ({ id: item.key, ...item.metadata, source: undefined })) }));
	}
	async execute(name: BeaconContextToolName, input: Record<string, unknown>, signal: AbortSignal): Promise<ContextOutput> {
		signal.throwIfAborted();
		if (!contextToolNames.includes(name) || !contextInputValid(name, input)) { return failure('invalid_arguments', 'Use only the parameters declared for this tool.'); }
		if (!this.names.includes(name)) { return failure('unavailable', 'This source is unavailable in the current Beacon mode.'); }
		try {
			const kind = recordKinds[name];
			if (kind) {
				if (!this.scope.usable || this.scope.mode === 'blackout') { return failure('unavailable', 'Persistent records are unavailable in this mode.'); }
				if (input.id === undefined) {
					if (this.compacting) { return failure('unavailable', 'Compaction cannot acquire a new record directory.'); }
					const records = await this.call<IBeaconRecordByKind[BeaconRecordKind][]>('listRecords', { kind }, signal);
					return { records: records.slice().reverse().map(record => this.directory(kind, record)) };
				}
				const key = `${kind}:${input.id}`;
				if (!this.fixed.has(key)) {
					if (this.compacting) { return failure('unavailable', 'Compaction can read only records already fixed in this answer.'); }
					let pending = this.pending.get(key);
					if (!pending) {
						pending = this.call<IBeaconRecordByKind[BeaconRecordKind]>('readRecord', { kind, id: input.id }, signal).then(record => { if (record?.id !== input.id) { throw new Error('beacon-record-not-found'); } const fixed = redactValues(record) as IBeaconRecordByKind[BeaconRecordKind]; this.fixed.set(key, fixed); return fixed; }); this.pending.set(key, pending);
					}
					try { await pending; } finally { this.pending.delete(key); }
				}
				await this.call('context', {}, signal);
				return { record: structuredClone(this.fixed.get(key)) };
			}
			if (name === 'readCurrentCode') {
				if (this.compacting) { return failure('unavailable', 'Compaction cannot read live code.'); }
				const files = await this.call<IBeaconCurrentCodeFile[]>('visibleCurrentCode', {}, signal);
				return { files: redactValues(files) };
			}
			if (name === 'fetchProblem') {
				if (this.compacting || !this.options.resolveProblemId || !this.options.readProblem) { return failure('unavailable', 'Problem fetching is unavailable.'); }
				const request = input as unknown as BeaconToolInputs['fetchProblem'];
				const ref = await this.options.resolveProblemId(request.oj, request.problemId);
				const document = await this.options.readProblem(ref, signal);
				signal.throwIfAborted(); await this.call('context', {}, signal);
				return redactValues({ problem: request, document: { title: document.title, bodies: document.bodies, samples: document.samples, limits: document.limits, interactive: document.interactive, ...(document.difficulty ? { difficulty: document.difficulty } : {}), ...(document.tags ? { tags: document.tags } : {}) }, retrievedAt: new Date().toISOString() }) as ContextOutput;
			}
			if (name === 'readMaterial') {
				if (!this.scope.usable || this.scope.mode === 'blackout') { return failure('unavailable', 'Persistent material is unavailable.'); }
				const snapshot = this.materials.get(String(input.id));
				if (!snapshot) { return failure('not_found', 'The material is not available to this conversation.'); }
				await this.call('context', {}, signal); return this.text(snapshot.raw, input, { ...snapshot.metadata, snapshotKey: snapshot.key });
			}
			if (name === 'readPage') {
				if (this.compacting) { return failure('unavailable', 'Compaction cannot read a new page.'); }
				const page = (await this.call<BeaconPage[]>('pages', {}, signal)).find(page => page.id === input.id);
				if (!page) { return failure('not_found', 'This page is no longer open.'); }
				if (!this.allowedPage(page)) { return failure('unavailable', 'Use the dedicated code, problem or record tool for this source.'); }
				if (page.reason) { throw new Error(page.reason); }
				if (page.version !== input.version) { return failure('read_failed', 'The page changed; use its current listed version.'); }
				if (page.kind === 'pdf' ? !input.pageNumber || !page.pageCount || Number(input.pageNumber) > page.pageCount : input.pageNumber !== undefined) { return failure('invalid_arguments', 'Use a valid physical PDF page number only for PDF pages.'); }
				const key = `page:${page.id}:${page.version}:${input.pageNumber ?? ''}`;
				const existing = this.materials.get(key);
				if (existing) { return this.text(existing.raw, input, { ...existing.metadata, snapshotKey: key }); }
				const captured = await this.call<IBeaconPageRead>('page', input, signal);
				const current = (await this.call<BeaconPage[]>('pages', {}, signal)).find(value => value.id === page.id);
				if (!current || current.version !== page.version || current.uri !== page.uri || !this.allowedPage(current)) { return failure('read_failed', 'The page changed or closed during reading.'); }
				const source: ContextSource = { kind: 'page', id: page.id, origin: page.uri, version: page.version, ...(input.pageNumber ? { pageNumber: Number(input.pageNumber) } : {}), capturedAt: Date.now(), contentSha256: createHash('sha256').update(captured.contents).digest('hex'), representation: page.kind === 'pdf' ? 'PDF.js text extraction, no OCR' : 'authorized loaded page text' };
				const snapshot = { key, raw: captured.contents, metadata: { ...page, ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}), source } };
				this.materials.set(key, snapshot);
				if (this.scope.mode !== 'blackout') { this.options.capturePrivate?.(snapshot); }
				return this.text(captured.contents, input, { ...snapshot.metadata, snapshotKey: key });
			}
			return failure('invalid_arguments', 'Unknown context tool.');
		} catch (error) {
			signal.throwIfAborted();
			const message = error instanceof Error ? error.message : '';
			return failure(/not-found|evicted|missing/.test(message) ? 'not_found' : /invalid-problem|invalid-data/.test(message) ? 'invalid_arguments' : /login|auth/.test(message) ? 'login_required' : /network|timeout|fetch/.test(message) ? 'network_error' : /parse/.test(message) ? 'parse_error' : /workspace|context-changed|protected|owner/.test(message) ? 'unavailable' : 'read_failed', 'The requested source could not be read. Do not infer its contents.');
		}
	}
	private text(raw: string, input: Record<string, unknown>, metadata: Record<string, unknown>): ContextOutput {
		const contents = redactContext(raw), offset = Number(input.offset ?? 0), end = Math.min(contents.length, offset + Number(input.limit ?? 32768));
		return redactValues({ ok: true, ...metadata, contents: contents.slice(offset, end), redacted: raw !== contents, offset, totalCharacters: contents.length, truncated: offset > 0 || end < contents.length, ...(end < contents.length ? { nextOffset: end } : {}) }) as ContextOutput;
	}
	private directory(kind: BeaconRecordKind, record: IBeaconRecordByKind[BeaconRecordKind]): unknown {
		if (kind === 'problem') { return redactValues(record); }
		if (kind === 'verdict') { const value = record as IBeaconRecordByKind['verdict']; return redactValues({ id: value.id, problem: value.problem, filePath: value.filePath, observedAt: value.observedAt, result: { rawStatus: value.result.rawStatus, ...(value.result.score !== undefined ? { score: value.result.score } : {}) } }); }
		const value = record as IBeaconRecordByKind['run'];
		const checks = value.runs.filter(item => item.check !== undefined), passed = checks.filter(item => item.check === 'passed').length;
		return redactValues({ id: value.id, source: value.source, operation: value.operation, startedAt: value.startedAt, endedAt: value.endedAt, status: value.status, program: { filePath: value.program.filePath, ...(value.program.codeBlockNumber ? { codeBlockNumber: value.program.codeBlockNumber } : {}) }, summary: `Compile: ${value.compile.status}; ${value.runs.length} input(s); ${checks.length ? `${passed}/${checks.length} checks passed` : 'no answer checking'}.` });
	}
}
