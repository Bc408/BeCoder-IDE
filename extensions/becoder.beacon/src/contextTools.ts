/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { IBeaconContext, IBeaconPageRead, IBeaconConsumedRecord } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { BeaconContextClient, BeaconPage } from './context';
import { isProtectedFilePath } from './fileTools';
import type { IBeaconCodeObservation, IBeaconCodeSnapshot, IBeaconCodeSave } from 'becoder-beacon';
import type { IBeaconRecordRef, IBeaconRecentRecord, IBeaconRecentItem, IBeaconProblemHint, BeaconRecentProducer } from 'becoder-beacon';
import type { ProblemRef, ProblemResolution, ProblemDocument } from 'becoder-oj-connect';
import { contextInputIssues, contextOperations } from './contextToolContract';

export interface ContextInput { operation: 'overview' | 'pages' | 'page' | 'records' | 'record' | 'material' | 'currentCode' | 'codeSnapshots' | 'codeSnapshot' | 'problemHints' | 'problem'; id?: string; version?: string; pageNumber?: number; producer?: BeaconRecentProducer; revision?: number; part?: 'all' | 'code' | 'events' | 'compile' | 'input' | 'output' | 'expected' | 'actual' | 'verdict'; offset?: number; limit?: number; sourceUri?: string; problem?: ProblemRef; refresh?: boolean; locale?: string; sectionIndex?: number; sampleIndex?: number; blockId?: string; inputId?: string; stream?: string }
export interface ContextSource {
	kind: 'page' | 'runtime';
	id: string;
	origin?: string;
	version?: string;
	pageNumber?: number;
	revision?: number;
	producer?: 'runner' | 'cph' | 'notebook';
	capturedAt: number;
	/** Hash of the complete captured reading representation before redaction or paging. */
	contentSha256: string;
	/** Source identity, separate from the reading representation. Runtime uses compiler bytes; text and verified OJ pages use CRLF-normalized text. */
	sourceSha256?: string;
	/** Known omissions in captured source or events; absent when complete coverage is not established. */
	partial?: boolean;
	representation: string;
}
export interface ContextOutput { ok: boolean; contents?: string; error?: string; source?: ContextSource; [key: string]: unknown }
export interface ContextAccess { execute(input: ContextInput, signal: AbortSignal): Promise<ContextOutput>; describe(signal: AbortSignal): Promise<string>; readonly operations?: readonly string[]; compactionView?(): ContextAccess | undefined; setResultBudget?(bytes: number): void }
export interface ContextSnapshot { key: string; raw: string; metadata: Record<string, unknown> }
export interface ContextToolOptions {
	privateSnapshots?: readonly ContextSnapshot[];
	allowedPrivateKeys?: readonly string[];
	capturePrivate?: (snapshot: ContextSnapshot) => void;
	authorizeLocal?: (path: string, signal: AbortSignal) => Promise<string>;
	resolveProblem?: (sourceUri: string) => Promise<ProblemResolution>;
	readAssociation?: (sourceUri: string) => Promise<{ sourceUri: string; url: string; revision: string } | undefined>;
	resolveUrl?: (url: string) => Promise<ProblemRef | undefined>;
	readProblem?: (ref: ProblemRef, signal: AbortSignal, options?: { family?: 'c' | 'cpp' }) => Promise<ProblemDocument>;
}

function sameSourceUri(left: string | undefined, right: string): boolean {
	if (!left) { return false; }
	const identity = (uri: string) => { const value = uri.startsWith('file:') ? path.normalize(fileURLToPath(uri)) : uri; return process.platform === 'win32' ? value.toLowerCase() : value; };
	try { return identity(left) === identity(right); } catch { return false; }
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

function decodeRuntimeValue(value: unknown): unknown {
		if (Array.isArray(value)) { return value.map(decodeRuntimeValue); }
		if (!value || typeof value !== 'object') { return value; }
		return Object.fromEntries(Object.entries(value).map(([key, item]) => {
			if (key === 'sourceSnapshot' && item && typeof item === 'object') {
				const metadata = { ...item } as Record<string, unknown>;
				delete metadata.bytesBase64;
				return [key, decodeRuntimeValue({ ...metadata, bytesRepresentation: 'Captured main text is available in the code part; retained bytes belong to this bounded shared record, pinned only for this answer' })];
			}
			return key === 'bytesBase64' && typeof item === 'string'
				? ['decodedBytes', { text: Buffer.from(item, 'base64').toString('utf8'), representation: 'UTF-8 with replacement; retained bytes belong to the bounded shared record', byteLength: Buffer.from(item, 'base64').length }]
				: [key, decodeRuntimeValue(item)];
		}));
}

function runtimeDocument(record: IBeaconConsumedRecord): Record<string, unknown> {
	// Adjacent chunks belong to one observed stream. Join before decoding/filtering
	// so split UTF-8 characters and credential assignments do not bypass filtering.
	const events: unknown[] = [];
	for (const raw of record.events) {
		const event = structuredClone(raw) as { type?: string; phase?: string; stream?: string; index?: number; text?: string; bytesBase64?: string; chunks?: number };
		const previous = events.at(-1) as typeof event | undefined;
		if (event?.type === 'stream' && previous?.type === 'stream' && ['phase', 'stream', 'index'].every(key => event[key as keyof typeof event] === previous[key as keyof typeof event])) {
			if (typeof event.bytesBase64 === 'string' && typeof previous.bytesBase64 === 'string') { previous.bytesBase64 = Buffer.concat([Buffer.from(previous.bytesBase64, 'base64'), Buffer.from(event.bytesBase64, 'base64')]).toString('base64'); previous.chunks = (previous.chunks ?? 1) + 1; continue; }
			if (typeof event.text === 'string' && typeof previous.text === 'string') { previous.text += event.text; previous.chunks = (previous.chunks ?? 1) + 1; continue; }
		}
		events.push(event);
	}
	return decodeRuntimeValue({ ...record, events }) as Record<string, unknown>;
}

const explanations: Record<string, string> = {
	'beacon-context-changed': 'Workspace, mode or conversation changed. Start again in the current context.',
	'beacon-record-changed': 'This running record advanced. List records again and request its current revision.',
	'beacon-record-evicted': 'This bounded record or code snapshot was evicted. Supplied fragments may remain in the effective conversation, but do not assume its full body is still available.',
	'beacon-page-closed': 'The page is no longer open. Do not fall back to its backing file.',
	'beacon-page-changed': 'The page changed. List pages again and request the current version.',
	'beacon-page-provider-unavailable': 'This open page has no readable loaded provider yet. Do not resolve or read its backing file.',
	'beacon-page-not-ready': 'The open PDF is still loading. Wait for its native viewer to finish; do not reopen or fetch its backing file.',
	'beacon-protected-page': 'This credential page or isolated Beacon asset is excluded.',
	'beacon-conversation-owner': 'This material is not owned by the active conversation.',
	'beacon-workspace-unavailable': 'No usable Beacon workspace is available for runtime records.',
	'beacon-material-missing': 'This conversation has not consumed that material.',
	'beacon-invalid-context-input': 'Use a listed page id and version, or record producer, id and positive revision. Ranges use character offsets and limits from 1 to 131072.',
	'beacon-context-budget': 'The context result budget for this response is exhausted.',
	'beacon-page-timeout': 'Reading the loaded page timed out.',
	'beacon-page-too-large': 'This page exceeds the transport capacity.'
};

export class ContextTools implements ContextAccess {
	get operations(): readonly string[] { return this.scope.usable && this.scope.mode !== 'blackout' ? contextOperations : ['overview', 'pages', 'page', 'currentCode', 'problemHints', 'problem']; }
	compactionView(): ContextAccess | undefined {
		if (!this.scope.usable || this.scope.mode === 'blackout') { return undefined; }
		return { operations: ['codeSnapshots', 'codeSnapshot', 'record', 'material'], describe: async () => JSON.stringify({ fixed: [...this.shared.keys()], private: [...this.privateKeys] }), execute: async (input, signal) => {
			if (!['codeSnapshots', 'codeSnapshot', 'record', 'material'].includes(input.operation) || input.operation === 'record' && !this.shared.has(JSON.stringify({ producer: input.producer, id: input.id, revision: input.revision }))) { return { ok: false, code: 'beacon-part-unavailable', error: 'Compaction can read only retained code and already fixed records.' }; }
			return this.execute(input.operation === 'codeSnapshots' ? input : { ...input, limit: Math.min(input.limit ?? 8192, 8192) }, signal);
		} };
	}
	private used = 0;
	private readonly snapshots = new Map<string, { raw: string; metadata: Record<string, unknown> }>();
	private readonly shared = new Map<string, IBeaconRecentRecord>();
	private readonly sharedReads = new Map<string, Promise<IBeaconRecentRecord>>();
	private sharedBytes = 0;
	private resultRemaining = Number.POSITIVE_INFINITY;
	setResultBudget(bytes: number): void { this.resultRemaining = Math.max(0, Math.floor(bytes)); }
	private readonly privateKeys = new Set<string>();
	constructor(private readonly client: BeaconContextClient, private readonly scope: IBeaconContext, private readonly protectedRoots: string[] = [], private readonly options: ContextToolOptions = {}) {
		const snapshots = options.privateSnapshots ?? [];
		for (const key of options.allowedPrivateKeys ?? snapshots.map(snapshot => snapshot.key)) { this.privateKeys.add(key); }
		if (!validContextSnapshots(snapshots)) { throw new Error('beacon-invalid-context-snapshot'); }
		if (scope.mode !== 'blackout') { for (const { key, raw, metadata } of structuredClone(snapshots)) { if (!options.allowedPrivateKeys || options.allowedPrivateKeys.includes(key)) { this.snapshots.set(key, { raw, metadata }); } } }
	}
	private captureSnapshot(key: string, snapshot: { raw: string; metadata: Record<string, unknown> }): void {
		const captured = { key, ...snapshot };
		if (!validContextSnapshots([...this.snapshots].map(([key, value]) => ({ key, ...value })).concat(captured))) { throw new Error('beacon-context-budget'); }
		this.options.capturePrivate?.(structuredClone(captured));
		this.snapshots.set(key, snapshot);
		this.privateKeys.add(key);
	}
	private call<T>(operation: string, input: object, signal: AbortSignal): Promise<T> { return this.client.scopedCall(this.scope, operation, input, signal); }
	private sliceCode(observation: IBeaconCodeObservation | IBeaconCodeSnapshot, input: ContextInput, save?: IBeaconCodeSave): ContextOutput {
		const text = redactContext(observation.contents), offset = input.offset ?? 0, end = Math.min(text.length, offset + (input.limit ?? 32768));
		const snapshotId = save?.state === 'saved' ? save.id : (observation as IBeaconCodeSnapshot).id;
		const continuation = snapshotId ? { operation: 'codeSnapshot', id: snapshotId, offset: end, limit: input.limit ?? 32768 } : { operation: 'currentCode', id: observation.pageId, version: observation.version, offset: end, limit: input.limit ?? 32768 };
		return { ok: true, fileName: observation.fileName, filePath: observation.filePath, pageId: observation.pageId, version: observation.version, observedAt: observation.observedAt, sourceUri: observation.sourceUri, contentSha256: observation.contentSha256, contents: text.slice(offset, end), offset, totalCharacters: text.length, redacted: text !== observation.contents, truncated: offset > 0 || end < text.length, ...(end < text.length ? { nextOffset: end, continuation } : {}), ...(save ? { snapshotSave: save, ...(save.state === 'saved' ? { snapshotId: save.id } : {}) } : { snapshotId, capturedAt: (observation as IBeaconCodeSnapshot).capturedAt }) };
	}
	private async currentCode(input: ContextInput, signal: AbortSignal): Promise<ContextOutput> {
		const continuation = (input.offset ?? 0) > 0;
		if (continuation && (!input.id || !input.version)) { throw new Error('beacon-invalid-context-input'); }
		const read = await this.call<Omit<IBeaconCodeObservation, 'contentSha256'>>('currentCode', { ...(input.id ? { id: input.id } : {}), ...(continuation ? { expectedVersion: input.version } : {}) }, signal);
		if (!read || typeof read.contents !== 'string' || !['c', 'cpp'].includes(read.languageId)) { throw new Error('beacon-code-unavailable'); }
		if (!this.pageAllowed({ id: read.pageId, kind: 'text', title: read.fileName, uri: read.sourceUri, version: read.version })) { throw new Error('beacon-protected-page'); }
		const observation = { ...read, contentSha256: createHash('sha256').update(read.contents, 'utf8').digest('hex') };
		let save: IBeaconCodeSave = { state: 'disabled', reason: 'blackout' };
		if (!continuation && this.scope.mode !== 'blackout') {
			try { save = await this.call<IBeaconCodeSave>('saveCodeRead', { observation }, signal); }
			catch (error) {
				signal.throwIfAborted();
				await this.call('context', {}, signal);
				if (error instanceof Error && /^beacon-(?:context-changed|workspace-(?:unavailable|changed)|window-closed|conversation-owner|missing-conversation)$/.test(error.message)) { throw error; }
				save = { state: 'not-saved', reason: 'save-failed' };
			}
		}
		return this.sliceCode(observation, input, continuation ? undefined : save);
	}
	private pageAllowed(page: BeaconPage): boolean {
		if (!page.uri?.startsWith('file:')) { return true; }
		try {
			const file = fileURLToPath(page.uri);
			return !file.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork') && !isProtectedFilePath(file) && !this.protectedRoots.some(root => { const relative = path.relative(root, file); return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)); });
		} catch { return false; }
	}
	private async pages(signal: AbortSignal): Promise<BeaconPage[]> {
		return (await this.call<BeaconPage[]>('pages', {}, signal)).filter(page => !['notebook', 'oj-problem', 'oj-record'].includes(page.kind)).map(page => this.pageAllowed(page) ? page : { ...page, reason: 'beacon-protected-page' });
	}
	private recordsEnabled(): void { if (!this.scope.usable || this.scope.mode === 'blackout') { throw new Error('beacon-workspace-unavailable'); } if (!this.scope.activeId) { throw new Error('beacon-conversation-owner'); } }
	private async records(producer: ContextInput['producer'], signal: AbortSignal): Promise<IBeaconRecentItem[]> {
		this.recordsEnabled();
		if (producer && !['runner', 'cph', 'notebook', 'problem', 'oj'].includes(producer)) { throw new Error('beacon-invalid-context-input'); }
		const result: IBeaconRecentItem[] = [];
		for (const owner of producer ? [producer] : ['runner', 'cph', 'notebook', 'problem', 'oj'] as const) { result.push(...await this.call<IBeaconRecentItem[]>('listRecent', { producer: owner }, signal)); }
		return result;
	}
	async readShared(ref: IBeaconRecordRef, signal: AbortSignal): Promise<IBeaconRecentRecord> {
		this.recordsEnabled();
		if (!ref.id || !Number.isSafeInteger(ref.revision) || ref.revision < 1 || !['runner', 'cph', 'notebook', 'oj', 'problem'].includes(ref.producer)) { throw new Error('beacon-invalid-context-input'); }
		await this.call('context', {}, signal);
		const key = JSON.stringify({ producer: ref.producer, id: ref.id, revision: ref.revision }), pinned = this.shared.get(key);
		if (pinned) { return pinned; }
		let reading = this.sharedReads.get(key);
		if (!reading) {
			reading = (async () => {
				if (this.sharedBytes >= 32 * 1024 * 1024) { throw new Error('beacon-context-budget'); }
				const record = await this.call<IBeaconRecentRecord>('readRecent', { ref }, signal);
				if (record.sourceUri && !this.pageAllowed({ id: record.id, kind: 'text', title: '', uri: record.sourceUri, version: String(record.revision) })) { throw new Error('beacon-protected-page'); }
				const bytes = Buffer.byteLength(JSON.stringify(record));
				if (this.sharedBytes + bytes > 32 * 1024 * 1024) { throw new Error('beacon-context-budget'); }
				this.sharedBytes += bytes; this.shared.set(key, record); return record;
			})();
			this.sharedReads.set(key, reading);
		}
		try { const record = await reading; signal.throwIfAborted(); await this.call('context', {}, signal); return record; }
		finally { if (this.sharedReads.get(key) === reading) { this.sharedReads.delete(key); } }
	}
	private recordValue(record: IBeaconRecentRecord, input: ContextInput): unknown {
		const payload = record.payload;
		if (payload.kind === 'runtime') {
			let events = payload.events as Record<string, unknown>[];
			const details = (payload.events[0] as { details?: { cellId?: string; inputCellId?: string; input?: unknown; sampleNumbers?: number[]; problem?: { tests?: { input?: string; output?: string }[] } } })?.details;
			if (input.blockId && details?.cellId !== input.blockId && !events.some(event => event.blockId === input.blockId)) { throw new Error('beacon-part-unavailable'); }
			if (input.inputId && details?.inputCellId !== input.inputId && !events.some(event => event.inputId === input.inputId)) { throw new Error('beacon-part-unavailable'); }
			if (input.part === 'code') { return payload.code; }
			if (record.producer === 'cph' && input.sampleIndex && (!input.part || input.part === 'all')) {
				const index = details?.sampleNumbers ? details.sampleNumbers.indexOf(input.sampleIndex) : input.sampleIndex - 1;
				const sample = details?.problem?.tests?.[index];
				const selected = events.filter(event => event.sampleId === String(input.sampleIndex));
				const finished = selected.filter(event => event.type === 'sample-finished');
				if (!sample && !finished.length) { throw new Error('beacon-part-unavailable'); }
				const result = finished.at(-1)?.result as { stdout?: string; stderr?: string; exitCode?: number } | undefined;
				const view = { sampleNumber: input.sampleIndex, ...(sample?.input !== undefined ? { input: sample.input } : {}), ...(sample?.output !== undefined ? { expected: sample.output } : {}), ...(result?.stdout !== undefined ? { actual: result.stdout } : {}), ...(result?.stderr !== undefined ? { stderr: result.stderr } : {}), ...(result?.exitCode !== undefined ? { exitCode: result.exitCode } : {}), ...(finished.at(-1)?.verdict !== undefined ? { verdict: finished.at(-1)!.verdict } : {}), events: (runtimeDocument({ id: record.id, materialId: '', revision: record.revision, startedAt: payload.startedAt, code: payload.code, sequence: payload.lastEventSequence, events: selected }).events) };
				// Every nested bounded string goes through the same byte decoding as a
				// whole runtime document, before textResult applies redaction/paging.
				return decodeRuntimeValue(view);
			}
			if (input.part === 'input' || input.part === 'expected') {
				const index = input.sampleIndex ? details?.sampleNumbers ? details.sampleNumbers.indexOf(input.sampleIndex) : input.sampleIndex - 1 : -1;
				let selected = input.sampleIndex ? details?.problem?.tests?.[index]?.[input.part === 'expected' ? 'output' : 'input'] : input.part === 'input' ? details?.input : undefined;
				if (selected && typeof selected === 'object' && typeof (selected as { text?: unknown }).text === 'string') { selected = (selected as { text: string }).text; }
				if (selected === undefined) { throw new Error('beacon-part-unavailable'); } return decodeRuntimeValue(selected);
			}
			if (input.sampleIndex) { events = events.filter(event => event.sampleId === String(input.sampleIndex)); }
			if (input.blockId && details?.cellId !== input.blockId) { events = events.filter(event => event.blockId === input.blockId); }
			if (input.inputId && details?.inputCellId !== input.inputId) { events = events.filter(event => event.inputId === input.inputId); }
			if (input.part === 'output' || input.part === 'actual') {
				const samples = events.filter(event => event.type === 'sample-finished');
				if (samples.length && (!input.stream || ['stdout', 'stderr'].includes(input.stream))) {
					const observed = samples.map(event => { const sample = event.result as { stdout?: unknown; stderr?: unknown } | undefined; const actual = input.stream === 'stderr' ? sample?.stderr : sample?.stdout; return { sampleId: event.sampleId, index: event.index, stream: input.stream ?? 'stdout', verdict: event.verdict, ...(actual === undefined ? { available: false } : { actual }) }; });
					if (!input.sampleIndex) { return decodeRuntimeValue(observed); }
					if ('actual' in observed[0]) { return decodeRuntimeValue(observed[0].actual); }
				}
			}
			if (input.stream) { events = events.filter(event => event.stream === input.stream); }
			if ((input.sampleIndex || input.blockId || input.inputId || input.stream) && !events.length) { throw new Error('beacon-part-unavailable'); }
			if (input.part === 'compile') { events = events.filter(event => event.phase === 'compiling' || event.type === 'compiled'); }
			if (input.part === 'output' || input.part === 'actual') {
				const emptyRun = !input.sampleIndex && !input.stream && events.some(event => event.type === 'finished' && (event.outcome as { status?: string } | undefined)?.status === 'completed' && (event.coverage as { truncated?: boolean } | undefined)?.truncated === false);
				events = events.filter(event => event.type === 'stream' && event.phase !== 'compiling');
				if (!events.length && emptyRun) { return ''; }
			}
			if (['compile', 'output', 'actual'].includes(input.part ?? '') && !events.length) { throw new Error('beacon-part-unavailable'); }
			const document = runtimeDocument({ id: record.id, materialId: '', revision: record.revision, startedAt: payload.startedAt, code: payload.code, sequence: payload.lastEventSequence, events });
			return input.part === 'events' || input.part === 'compile' || input.part === 'output' || input.part === 'actual' ? document.events : document;
		}
		if (payload.kind === 'problem') { return this.problemValue(payload.document, input); }
		const value = payload.kind === 'oj' ? payload.record : payload.evaluation;
		if (input.part === 'compile') { if (!('compileMessage' in value) || value.compileMessage === undefined) { throw new Error('beacon-part-unavailable'); } return value.compileMessage; }
		if (input.part === 'code') { if (!('source' in value) || value.source === undefined) { throw new Error('beacon-part-unavailable'); } return value.source; }
		return value;
	}
	private problemValue(document: ProblemDocument, input: ContextInput): unknown {
		if (input.sampleIndex) {
			const sample = document.samples[input.sampleIndex - 1]; if (!sample) { throw new Error('beacon-part-unavailable'); }
			return input.part === 'input' ? sample.input : input.part === 'expected' || input.part === 'output' ? sample.output : sample;
		}
		if (input.locale || input.sectionIndex) {
			const body = document.bodies.find(body => !input.locale || body.locale === input.locale);
			if (!body || (input.sectionIndex && !body.sections[input.sectionIndex - 1])) { throw new Error('beacon-part-unavailable'); }
			return input.sectionIndex ? body.sections[input.sectionIndex - 1].content : body;
		}
		return document;
	}
	private textResult(value: unknown, input: ContextInput, metadata: Record<string, unknown>): ContextOutput {
		const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		const text = typeof value === 'string' ? redactContext(value) : JSON.stringify(redactValues(value), null, 2);
		const offset = input.offset ?? 0, end = Math.min(text.length, offset + (input.limit ?? 32768));
		const selection = Object.fromEntries(Object.entries({ part: input.part ?? 'all', sampleIndex: input.sampleIndex, sectionIndex: input.sectionIndex, blockId: input.blockId, inputId: input.inputId, stream: input.stream }).filter(([, value]) => value !== undefined));
		const ref = metadata.ref as IBeaconRecordRef | undefined;
		const continuation = ref ? { ...input, id: ref.id, revision: ref.revision, offset: end, limit: input.limit ?? 32768 } : metadata.source !== 'network' ? { ...input, offset: end, limit: input.limit ?? 32768 } : undefined;
		return { ok: true, ...metadata, selection, contents: text.slice(offset, end), offset, totalCharacters: text.length, redacted: text !== raw, truncated: offset > 0 || end < text.length, ...(end < text.length ? { nextOffset: end, ...(continuation ? { continuation } : { continuationNote: 'A new network read is a new observation. Select a needed section or sample instead of assuming the old body is retained.' }) } : {}) };
	}
	private availableParts(record: IBeaconRecentRecord, input: ContextInput): string[] {
		const parts = record.payload.kind === 'runtime' ? ['all', 'code', 'events', 'compile', 'input', ...(record.producer === 'cph' && input.sampleIndex ? ['expected'] : []), 'actual', 'output', 'verdict'] : record.payload.kind === 'problem' ? ['all', 'input', 'expected'] : ['all', 'code', 'compile', 'verdict'];
		return parts.filter(part => {
				if (record.payload.kind === 'runtime' && part === 'verdict' && !record.payload.events.some(event => !!event && typeof event === 'object' && (!input.sampleIndex || (event as { sampleId?: string }).sampleId === String(input.sampleIndex)) && ('verdict' in event || !input.sampleIndex && (event as { type?: string }).type === 'finished'))) { return false; }
			if (record.payload.kind === 'problem' && part !== 'all' && !input.sampleIndex) { return false; }
			try { return this.recordValue(record, { ...input, part: part as ContextInput['part'] }) !== undefined; } catch { return false; }
		});
	}
	private async problemHints(input: ContextInput, signal: AbortSignal): Promise<ContextOutput> {
		const pages = await this.pages(signal);
		const pageId = input.id;
		const target = pageId ? pages.find(page => page.id === pageId) : pages.find(page => page.active);
		const sourceUri = input.sourceUri ?? target?.uri;
		if (!sourceUri) { throw new Error('beacon-code-unavailable'); }
		const hints: IBeaconProblemHint[] = []; const sources: Record<string, string> = {};
		if (this.scope.mode !== 'blackout' && this.scope.usable) {
			try {
				for (const record of await this.records('problem', signal)) { if (sameSourceUri(record.sourceUri, sourceUri) && record.problem) { hints.push({ kind: 'get-problem', sourceUri, problem: record.problem, observedAt: record.capturedAt, viewedAt: record.viewedAt, record: { producer: record.producer, id: record.id, revision: record.revision }, basis: record.trigger ?? 'get-problem' }); } }
				sources.getProblem = hints.some(hint => hint.kind === 'get-problem') ? 'matched' : 'no-match';
			} catch { sources.getProblem = 'unavailable'; }
			try {
				if (sourceUri.startsWith('file:') && this.options.authorizeLocal && this.options.readAssociation) {
					await this.options.authorizeLocal(fileURLToPath(sourceUri), signal);
					const association = await this.options.readAssociation(sourceUri), problem = association && await this.options.resolveUrl?.(association.url);
					if (association && problem) { hints.push({ kind: 'cph', sourceUri, problem, observedAt: Date.now(), basis: association.revision }); }
				}
				sources.cph = !this.options.readAssociation || !this.options.resolveUrl || !this.options.authorizeLocal || !sourceUri.startsWith('file:') ? 'unavailable' : hints.some(hint => hint.kind === 'cph') ? 'matched' : 'no-match';
			} catch { sources.cph = 'unavailable'; }
		} else { sources.getProblem = 'mode-disabled'; sources.cph = 'mode-disabled'; }
		try { const resolved = await this.options.resolveProblem?.(sourceUri); if (resolved?.kind === 'problem') { hints.push({ kind: 'path', sourceUri, problem: resolved.problem, observedAt: Date.now(), basis: 'existing OJ source path resolver' }); } sources.path = resolved?.kind ?? 'unavailable'; } catch { sources.path = 'unavailable'; }
		await this.call('context', {}, signal);
		return { ok: true, sourceUri, hints, sources };
	}
	private async problem(input: ContextInput, signal: AbortSignal): Promise<ContextOutput> {
		if (this.scope.mode !== 'blackout' && !input.refresh) {
			const candidates = (await this.records('problem', signal)).filter(record => (!input.problem || record.problem?.url === input.problem.url) && (!input.sourceUri || sameSourceUri(record.sourceUri, input.sourceUri)) && (!input.id || record.id === input.id));
			if (input.id && input.revision) {
				const record = await this.readShared({ producer: 'problem', id: input.id, revision: input.revision }, signal);
				return this.textResult(this.recordValue(record, input), input, { ref: { producer: 'problem', id: record.id, revision: record.revision }, source: 'saved', viewedAt: record.viewedAt, capturedAt: record.capturedAt, sourceUri: record.sourceUri });
			}
			if (candidates.length > 1 || (!input.sourceUri && !input.id && candidates.length)) { return { ok: true, candidates, selectionRequired: true }; }
			if (candidates.length === 1) { const record = await this.readShared(candidates[0], signal); return this.textResult(this.recordValue(record, input), input, { ref: { producer: 'problem', id: record.id, revision: record.revision }, source: 'saved', viewedAt: record.viewedAt, capturedAt: record.capturedAt, sourceUri: record.sourceUri }); }
		}
		if (!input.problem || !this.options.readProblem) { throw new Error('beacon-part-unavailable'); }
		const document = await this.options.readProblem(input.problem, signal);
		await this.call('context', {}, signal);
		return this.textResult(this.problemValue(document, input), input, { source: 'network', observedAt: Date.now(), problem: document.ref });
	}
	private async overview(signal: AbortSignal): Promise<ContextOutput> {
		const pages = await this.pages(signal);
		const enabled = this.scope.usable && this.scope.mode !== 'blackout' && !!this.scope.activeId;
		const all = enabled ? await this.records(undefined, signal) : [];
		const producers: BeaconRecentProducer[] = ['problem', 'runner', 'cph', 'notebook', 'oj'];
		const index = (record: IBeaconRecentItem) => ({ producer: record.producer, id: record.id, revision: record.revision, sequence: record.sequence, sourceUri: record.sourceUri, problem: record.problem, capturedAt: record.capturedAt, viewedAt: record.viewedAt, state: record.state });
		const recent = producers.flatMap(producer => all.filter(record => record.producer === producer).slice(-3).reverse().map(index));
		const code = enabled ? await this.call<Omit<IBeaconCodeSnapshot, 'contents'>[]>('listCodeSnapshots', {}, signal) : [];
		return { ok: true, mode: this.scope.mode, root: this.scope.root, workspaceUsable: this.scope.usable, conversation: this.scope.activeId, pages,
			...(enabled ? { records: recent, recordCounts: Object.fromEntries(producers.map(producer => [producer, all.filter(record => record.producer === producer).length])), recordListing: 'This initial directory shows at most three newest entries per producer, newest first within each producer. Queue sequence is ordering metadata, not a discussion binding or proof that an older result verifies current code. Use records with a producer filter for the full retained list, then read the exact record revision.', codeSnapshots: code.map(record => ({ id: record.id, fileName: record.fileName, sourceUri: record.sourceUri, version: record.version, capturedAt: record.capturedAt, lastObservedAt: record.lastObservedAt })), materials: [...this.snapshots].map(([key, value]) => ({ ...value.metadata, id: key })) } : {}),
			codeReading: 'Use currentCode for the latest editor observation. Saved code uses codeSnapshots/codeSnapshot. Sending does not capture code. Read execution and verdict facts only from records.',
			problemReading: 'Use problemHints for independent candidate evidence, then problem with an explicit problem ref. Saved statements require record id/revision or sourceUri. Explicit refresh reads OJ Connect without persistence.',
			pdfReading: 'Use page with physical pageNumber for PDF. Extracted text is not OCR or complete visual understanding.' };
	}
	async describe(signal: AbortSignal): Promise<string> { return `Beacon context at request start (metadata only): ${JSON.stringify(await this.execute({ operation: 'overview' }, signal))}`; }
	async execute(input: ContextInput, signal: AbortSignal): Promise<ContextOutput> {
		try {
			signal.throwIfAborted();
			if (input && contextOperations.includes(input.operation) && !this.operations.includes(input.operation)) { this.recordsEnabled(); }
			const issues = contextInputIssues(input, this.operations);
			if (issues.length) { return { ok: false, code: 'beacon-invalid-context-input', error: 'Correct the listed fields before retrying this operation. Do not infer a different target.', issues }; }
			if (Number.isFinite(this.resultRemaining) && !['overview', 'pages', 'records', 'codeSnapshots', 'problemHints'].includes(input.operation)) {
				const available = Math.floor((this.resultRemaining - 512) / 6);
				if (available < 1) { throw new Error('beacon-context-budget'); }
				input = { ...input, limit: Math.min(input.limit ?? 32768, available) };
			}
			const offset = input.offset ?? 0, limit = input.limit ?? 32768;
			if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 131072 || [input.sampleIndex, input.sectionIndex].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 1))) { throw new Error('beacon-invalid-context-input'); }
			let output: ContextOutput;
			if (input.operation === 'overview') { output = await this.overview(signal); }
			else if (input.operation === 'pages') { output = { ok: true, pages: await this.pages(signal) }; }
			else if (input.operation === 'currentCode') { output = await this.currentCode(input, signal); }
			else if (input.operation === 'codeSnapshots') { this.recordsEnabled(); output = { ok: true, snapshots: await this.call('listCodeSnapshots', {}, signal) }; }
			else if (input.operation === 'codeSnapshot') { this.recordsEnabled(); if (!input.id) { throw new Error('beacon-invalid-context-input'); } output = this.sliceCode(await this.call<IBeaconCodeSnapshot>('readCodeSnapshot', { id: input.id }, signal), input); }
			else if (input.operation === 'records') { output = { ok: true, records: await this.records(input.producer, signal) }; }
			else if (input.operation === 'record') {
				const record = await this.readShared({ producer: input.producer!, id: input.id!, revision: input.revision! }, signal);
				const details = record.payload.kind === 'runtime' ? (record.payload.events[0] as { details?: { sampleNumbers?: number[] } } | undefined)?.details : undefined;
				const sampleNumbers = record.producer === 'cph' && record.payload.kind === 'runtime' ? details?.sampleNumbers ?? [...new Set(record.payload.events.flatMap(event => { const value = (event as { sampleId?: string }).sampleId; return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? [Number(value)] : []; }))] : undefined;
				output = this.textResult(this.recordValue(record, input), input, { ref: { producer: record.producer, id: record.id, revision: record.revision }, coverage: record.coverage, availableParts: this.availableParts(record, input), ...(sampleNumbers ? { sampleNumbers } : {}), sourceUri: record.sourceUri, capturedAt: record.capturedAt, problem: record.problem, sourceDigest: record.sourceDigest });
			} else if (input.operation === 'problemHints') { output = await this.problemHints(input, signal); }
			else if (input.operation === 'problem') { output = await this.problem(input, signal); }
			else if (input.operation === 'material') {
				this.recordsEnabled();
				const key = input.id && (this.snapshots.has(input.id) ? input.id : `material:${input.id}`);
				if (!key || !this.privateKeys.has(key) || !this.snapshots.has(key)) { throw new Error('beacon-material-missing'); }
				await this.call('context', {}, signal); const snapshot = this.snapshots.get(key)!;
				const value = (snapshot.metadata.source as ContextSource | undefined)?.kind === 'runtime' ? JSON.parse(snapshot.raw) : snapshot.raw;
				output = this.textResult(value, input, { ...snapshot.metadata, snapshot: true, snapshotKey: key });
			} else {
				if (!input.id || !input.version) { throw new Error('beacon-invalid-context-input'); }
				const page = (await this.pages(signal)).find(page => page.id === input.id);
				if (!page) { throw new Error('beacon-page-closed'); }
				if (page.reason) { throw new Error(page.reason); }
				if (page.kind === 'text' && ['c', 'cpp'].includes(page.languageId ?? '')) { return this.execute({ ...input, operation: 'currentCode' }, signal); }
				if (page.version !== input.version) { throw new Error('beacon-page-changed'); }
				if (page.kind === 'pdf' ? !input.pageNumber || !page.pageCount || input.pageNumber > page.pageCount : input.pageNumber !== undefined) { throw new Error('beacon-invalid-context-input'); }
				const key = `page:${page.id}:${page.version}:${input.pageNumber ?? ''}`;
				let snapshot = this.snapshots.get(key);
				if (!snapshot) {
					const captured = await this.call<IBeaconPageRead>('page', { id: page.id, version: page.version, ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}) }, signal);
					const source: ContextSource = { kind: 'page', id: page.id, origin: page.uri, version: page.version, ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}), capturedAt: Date.now(), contentSha256: createHash('sha256').update(captured.contents).digest('hex'), representation: page.kind === 'pdf' ? 'PDF.js text extraction, no OCR' : 'authorized loaded page text' };
					snapshot = { raw: captured.contents, metadata: { ...page, source, ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}) } };
					if (this.scope.mode !== 'blackout') { this.captureSnapshot(key, snapshot); }
					else { this.snapshots.set(key, snapshot); }
				}
				output = this.textResult(snapshot.raw, input, snapshot.metadata);
				const current = (await this.pages(signal)).find(value => value.id === page.id);
				if (!current || current.version !== page.version) { throw new Error('beacon-page-changed'); }
			}
			output = redactValues(output) as ContextOutput;
			this.used += Buffer.byteLength(JSON.stringify(output));
			this.resultRemaining -= Buffer.byteLength(JSON.stringify(output));
			if (this.resultRemaining < 0) { throw new Error('beacon-context-budget'); }
			if (this.used > 8 * 1024 * 1024) { throw new Error('beacon-context-budget'); }
			return output;
		} catch (error) {
			signal.throwIfAborted();
			const code = error instanceof Error && error.message.startsWith('beacon-') ? error.message : 'beacon-context-unavailable';
			return { ok: false, code, error: explanations[code] ?? 'Context access failed. Check the source and current context; do not invent missing evidence.' };
		}
	}
}
