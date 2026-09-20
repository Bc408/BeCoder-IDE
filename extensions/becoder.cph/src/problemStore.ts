/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { ImportedProblem, parseImportedProblem, problemIdentity } from './problem';
import { acquireWorkspaceLease } from './workspaceLease';
import { SourcePreferences } from './importPreferences';

export interface StoredProblem extends ImportedProblem {
	readonly customCheckerPath?: string;
	readonly srcPath: string;
	readonly tests: readonly { readonly id: number; readonly input: string; readonly output: string }[];
}

export interface ImportResult {
	readonly kind: 'created' | 'replaced' | 'kept';
	readonly problem: StoredProblem;
}

export interface ProblemSnapshot {
	readonly problem: StoredProblem;
	readonly revision: string;
	readonly metadataPath: string;
}

export class ProblemStoreError extends Error {
	constructor(readonly code: 'busy' | 'unsafe-path' | 'invalid-data' | 'changed' | 'ambiguous', detail: string) {
		super(detail);
	}
}

function hash(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/** CPH's existing .prob naming convention; only locally selected paths are accepted. */
export function metadataName(source: string): string {
	return `.${path.basename(source)}_${createHash('md5').update(source).digest('hex')}.prob`;
}

export function safeSourceName(name: string): string {
	let stem = name.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
	if (!stem || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem) || stem.startsWith('.')) {
		stem = `problem_${stem}`;
	}
	return stem;
}

function ordinary(candidate: string, directory = false): fs.Stats {
	const stat = fs.lstatSync(candidate);
	if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || (!directory && stat.nlink !== 1)) {
		throw new ProblemStoreError('unsafe-path', candidate);
	}
	return stat;
}

function readMetadata(candidate: string): string {
	if (ordinary(candidate).size > 8 * 1024 * 1024) {
		throw new ProblemStoreError('invalid-data', candidate);
	}
	return fs.readFileSync(candidate, 'utf8');
}

/** Selected root is a user choice, not a page-provided saveLocation. */
export class ProblemStore {
	readonly root: string;
	private readonly dataDirectory: string;
	private readonly rootIdentity: fs.Stats;

	constructor(selectedRoot: string) {
		this.root = fs.realpathSync(selectedRoot);
		this.rootIdentity = ordinary(this.root, true);
		this.dataDirectory = path.join(this.root, '.cph');
	}

	private checkRoot(): void {
		const current = ordinary(this.root, true);
		if (current.dev !== this.rootIdentity.dev || current.ino !== this.rootIdentity.ino || fs.realpathSync(this.root) !== this.root) {
			throw new ProblemStoreError('changed', this.root);
		}
	}

	private checkDataDirectory(): void {
		this.checkRoot();
		ordinary(this.dataDirectory, true);
		if (fs.realpathSync(this.dataDirectory) !== this.dataDirectory) {
			throw new ProblemStoreError('unsafe-path', this.dataDirectory);
		}
	}

	private decode(raw: string): StoredProblem {
		const value = JSON.parse(raw);
		if (!value || typeof value.srcPath !== 'string' || path.dirname(value.srcPath) !== this.root || !/\.(c|cpp|cc|cxx)$/i.test(value.srcPath)
			|| (value.customCheckerPath !== undefined && typeof value.customCheckerPath !== 'string')
			|| (value.local === true && value.url !== value.srcPath)) {
			throw new ProblemStoreError('invalid-data', 'Unsupported CPH metadata.');
		}
		// Legacy CPH omits Companion transport fields. Do not import its settings.
		const parsedUrl = value.local === true ? 'https://local.becoder.invalid/problem' : value.url;
		const clean = parseImportedProblem(JSON.stringify({
			...value, url: parsedUrl,
			input: value.input ?? { type: 'stdin' }, output: value.output ?? { type: 'stdout' },
			testType: value.testType ?? 'single', batch: value.batch ?? { id: 'legacy', size: 1 }
		}), parsedUrl);
		if (!Array.isArray(value.tests) || value.tests.some((item: { id: unknown }) => !Number.isSafeInteger(item.id))) {
			throw new ProblemStoreError('invalid-data', 'Invalid sample identifiers.');
		}
		if (new Set(value.tests.map((item: { id: number }) => item.id)).size !== value.tests.length) {
			throw new ProblemStoreError('invalid-data', 'Duplicate sample identifiers.');
		}
		// Persisted user edits retain exact bytes; import normalization is not an edit.
		return { ...clean, url: value.local === true ? value.url : clean.url, local: value.local === true, srcPath: value.srcPath,
			...(value.customCheckerPath !== undefined ? { customCheckerPath: value.customCheckerPath } : {}),
			tests: value.tests.map((item: { id: number; input: string; output: string }) => ({ id: item.id, input: item.input, output: item.output })) };
	}

	private find(url: string): { file: string; raw: string; problem: StoredProblem } | undefined {
		this.checkDataDirectory();
		let found: { file: string; raw: string; problem: StoredProblem } | undefined;
		for (const name of fs.readdirSync(this.dataDirectory).filter(name => name.endsWith('.prob'))) {
			const file = path.join(this.dataDirectory, name);
			const raw = readMetadata(file);
			let value;
			try {
				value = JSON.parse(raw);
			} catch {
				throw new ProblemStoreError('invalid-data', file);
			}
			if (typeof value?.url !== 'string') {
				throw new ProblemStoreError('invalid-data', file);
			}
			// Local CPH tasks use a filesystem path as URL; leave them untouched.
			if (value.local === true) {
				continue;
			}
			if (problemIdentity(value.url) !== url) {
				continue;
			}
			if (found) {
				throw new ProblemStoreError('ambiguous', url);
			}
			const problem = this.decode(raw);
			ordinary(problem.srcPath);
			found = { file, raw, problem };
		}
		return found;
	}

	load(source: string): ProblemSnapshot | undefined {
		this.checkRoot();
		if (path.dirname(source) !== this.root) { throw new ProblemStoreError('unsafe-path', source); }
		if (!fs.existsSync(this.dataDirectory)) { return undefined; }
		this.checkDataDirectory();
		const file = path.join(this.dataDirectory, metadataName(source));
		if (!fs.existsSync(file)) { return undefined; }
		const raw = readMetadata(file);
		const problem = this.decode(raw);
		if (problem.srcPath !== source) { throw new ProblemStoreError('invalid-data', file); }
		ordinary(source);
		return { problem, revision: hash(raw), metadataPath: file };
	}

	/** Preserve CPH's local-problem workflow while treating the existing source as user-owned. */
	async createLocal(source: string): Promise<ProblemSnapshot> {
		this.checkRoot();
		if (path.dirname(source) !== this.root) { throw new ProblemStoreError('unsafe-path', source); }
		ordinary(source);
		if (fs.existsSync(this.dataDirectory)) {
			this.checkDataDirectory();
			const existing = this.load(source);
			if (existing) { return existing; }
		} else {
			fs.mkdirSync(this.dataDirectory);
			this.checkDataDirectory();
		}
		const release = await acquireWorkspaceLease(this.root);
		try {
			const existing = this.load(source);
			if (existing) { return existing; }
			const problem: StoredProblem = {
				name: `Local: ${path.basename(source, path.extname(source))}`,
				group: 'local', url: source, timeLimit: 3000, memoryLimit: 1024,
				interactive: false, input: { type: 'stdin' }, output: { type: 'stdout' },
				testType: 'single', batch: { id: 'local', size: 1 }, local: true,
				srcPath: source, tests: [{ id: 0, input: '', output: '' }]
			};
			const metadataPath = path.join(this.dataDirectory, metadataName(source));
			const serialized = JSON.stringify(problem);
			fs.writeFileSync(metadataPath, serialized, { flag: 'wx' });
			return { problem, revision: hash(serialized), metadataPath };
		} finally {
			await release();
		}
	}

	/** UI may change sample text and IDs, never source paths, limits or commands. */
	async saveSamples(snapshot: ProblemSnapshot, tests: unknown, customCheckerPath = snapshot.problem.customCheckerPath): Promise<ProblemSnapshot> {
		this.checkDataDirectory();
		if (!Array.isArray(tests) || tests.length > 100 || tests.some(item => !item || !Number.isSafeInteger(item.id)
			|| typeof item.input !== 'string' || typeof item.output !== 'string')) {
			throw new ProblemStoreError('invalid-data', 'Invalid sample edits.');
		}
		if (new Set(tests.map(item => item.id)).size !== tests.length) { throw new ProblemStoreError('invalid-data', 'Duplicate sample IDs.'); }
		if (customCheckerPath !== undefined && (typeof customCheckerPath !== 'string' || customCheckerPath.length > 32767 || customCheckerPath.includes('\0'))) { throw new ProblemStoreError('invalid-data', 'Invalid checker path.'); }
		const replacement: StoredProblem = { ...snapshot.problem, customCheckerPath, tests: tests.map(item => ({ id: item.id, input: item.input, output: item.output })) };
		const serialized = JSON.stringify(replacement);
		if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) { throw new ProblemStoreError('invalid-data', 'Samples too large.'); }
		const expectedPath = path.join(this.dataDirectory, metadataName(snapshot.problem.srcPath));
		if (snapshot.metadataPath !== expectedPath) { throw new ProblemStoreError('unsafe-path', snapshot.metadataPath); }
		const release = await acquireWorkspaceLease(this.root);
		const temporary = path.join(this.dataDirectory, `.becoder-${randomUUID()}.tmp`);
		let temporaryIdentity: fs.Stats | undefined;
		try {
			const current = this.load(snapshot.problem.srcPath);
			if (!current || current.revision !== snapshot.revision) { throw new ProblemStoreError('changed', expectedPath); }
			fs.writeFileSync(temporary, serialized, { flag: 'wx' });
			temporaryIdentity = ordinary(temporary);
			this.checkDataDirectory();
			if (hash(readMetadata(expectedPath)) !== snapshot.revision) { throw new ProblemStoreError('changed', expectedPath); }
			fs.renameSync(temporary, expectedPath);
			temporaryIdentity = undefined;
			return { problem: replacement, revision: hash(serialized), metadataPath: expectedPath };
		} finally {
			try {
				this.checkDataDirectory();
				if (temporaryIdentity) {
					this.removeTemporary(temporary, temporaryIdentity);
				}
			} finally {
				await release();
			}
		}
	}

	async importProblem(
		input: ImportedProblem,
		confirmReplacement: (existing: StoredProblem) => Promise<boolean>,
		signal?: AbortSignal,
		sourcePreferences?: SourcePreferences
	): Promise<ImportResult> {
		// Revalidate even if invoked from a future internal command rather than browser.
		const problem = parseImportedProblem(JSON.stringify({ ...input, name: sourcePreferences?.name ?? input.name }), input.url);
		this.checkRoot();
		try {
			fs.mkdirSync(this.dataDirectory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
		}
		this.checkDataDirectory();
		const directoryIdentity = ordinary(this.dataDirectory, true);
		const token = randomUUID();
		const release = await acquireWorkspaceLease(this.root);
		const check = () => {
			signal?.throwIfAborted();
			this.checkDataDirectory();
			const current = ordinary(this.dataDirectory, true);
			if (current.dev !== directoryIdentity.dev || current.ino !== directoryIdentity.ino) {
				throw new ProblemStoreError('changed', this.dataDirectory);
			}
		};
		try {
			check();
			const existing = this.find(problem.url);
			if (existing) {
				const accepted = await confirmReplacement(structuredClone(existing.problem));
				check();
				if (hash(readMetadata(existing.file)) !== hash(existing.raw)) {
					throw new ProblemStoreError('changed', existing.file);
				}
				ordinary(existing.problem.srcPath);
				if (!accepted) {
					return { kind: 'kept', problem: existing.problem };
				}
				const replacement = { ...this.withSource(problem, existing.problem.srcPath), customCheckerPath: existing.problem.customCheckerPath };
				const temporary = path.join(this.dataDirectory, `.becoder-${token}.tmp`);
				fs.writeFileSync(temporary, JSON.stringify(replacement), { flag: 'wx' });
				const temporaryIdentity = ordinary(temporary);
				let published = false;
				try {
					// External applications do not honor our lease; recheck before publication.
					check();
					if (readMetadata(existing.file) !== existing.raw) {
						throw new ProblemStoreError('changed', existing.file);
					}
					fs.renameSync(temporary, existing.file);
					published = true;
				} finally {
					if (!published) {
						this.checkDataDirectory();
						this.removeTemporary(temporary, temporaryIdentity);
					}
				}
				return { kind: 'replaced', problem: replacement };
			}
			const stem = safeSourceName(sourcePreferences?.stem ?? problem.name);
			const source = path.join(this.root, `${stem}.${sourcePreferences?.language ?? 'cpp'}`);
			const stored = this.withSource(problem, source);
			check();
			if (!fs.existsSync(source)) {
				const contents = sourcePreferences?.initialize?.(stored) ?? sourcePreferences?.contents ?? '';
				check();
				try { fs.writeFileSync(source, contents, { flag: 'wx' }); }
				catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
			}
			// CPH reuses the named source. Never truncate or initialize an existing file.
			const sourceIdentity = ordinary(source);
			const metadata = path.join(this.dataDirectory, metadataName(source));
			const previous = fs.existsSync(metadata) ? readMetadata(metadata) : undefined;
			if (previous !== undefined) { this.decode(previous); }
			const temporary = path.join(this.dataDirectory, `.becoder-${token}.tmp`);
			fs.writeFileSync(temporary, JSON.stringify(stored), { flag: 'wx' });
			const identity = ordinary(temporary);
			let published = false;
			try {
				check();
				const current = ordinary(source);
				if (current.dev !== sourceIdentity.dev || current.ino !== sourceIdentity.ino) { throw new ProblemStoreError('changed', source); }
				if (previous === undefined) {
					// Exclusive creation also protects metadata appearing after the initial check.
					fs.copyFileSync(temporary, metadata, fs.constants.COPYFILE_EXCL);
				} else {
					if (readMetadata(metadata) !== previous) { throw new ProblemStoreError('changed', metadata); }
					fs.renameSync(temporary, metadata);
					published = true;
				}
			} finally {
				if (!published) {
					this.checkDataDirectory();
					this.removeTemporary(temporary, identity);
				}
			}
			return { kind: previous === undefined ? 'created' : 'replaced', problem: stored };
		} finally {
			await release();
		}
	}

	/** Cleanup failures are observable; a replaced temporary file is never deleted. */
	private removeTemporary(filename: string, identity: fs.Stats): void {
		this.checkDataDirectory();
		const current = ordinary(filename);
		if (current.dev !== identity.dev || current.ino !== identity.ino) { throw new ProblemStoreError('changed', filename); }
		fs.unlinkSync(filename);
	}

	private withSource(problem: ImportedProblem, source: string): StoredProblem {
		return { ...problem, srcPath: source, tests: problem.tests.map((sample, id) => ({ ...sample, id })) };
	}
}
