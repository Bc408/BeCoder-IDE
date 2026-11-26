/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import type { IBeaconPage, IBeaconPageRead, IBeaconCurrentCodeFile } from './beaconContextTypes.js';
import { URI } from '../../../base/common/uri.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';

export interface IBeaconPageSource {
	key: object;
	kind: 'text' | 'browser' | 'notebook' | 'unsupported';
	title: string;
	uri?: string;
	version: string;
	languageId?: string;
	dirty?: boolean;
	active?: boolean;
	visible?: boolean;
	reason?: string;
	read(): Promise<string>;
	readNotebook?(): Promise<Extract<IBeaconCurrentCodeFile, { kind: 'notebook' }>['cells']>;
}

export class BeaconPages {
	private readonly handles = new Map<object | string, string>();
	constructor(private readonly sources: () => IBeaconPageSource[]) { }
	reset(): void { this.handles.clear(); }
	forget(key: object): void { this.handles.delete(key); }
	private isCode(source: IBeaconPageSource): boolean {
		return source.kind === 'text' && (['c', 'cpp'].includes(source.languageId ?? '') || !source.languageId && /\.(?:c|cpp|cc|cxx)$/i.test(source.uri ?? source.title));
	}
	private identity(source: IBeaconPageSource): object | string {
		if (!(this.isCode(source) || source.kind === 'notebook') || !source.uri) { return source.key; }
		const uri = URI.parse(source.uri);
		return `${source.kind}:${uri.scheme === 'file' ? extUriBiasedIgnorePathCase.getComparisonKey(uri) : uri.toString()}`;
	}
	private documents(): IBeaconPageSource[] {
		const sources = new Map<object | string, IBeaconPageSource>();
		for (const source of this.sources()) {
			const identity = this.identity(source), previous = sources.get(identity);
			if (!previous) { sources.set(identity, source); continue; }
			const preferred = source.visible && !previous.visible ? source : previous;
			sources.set(identity, { ...preferred, visible: previous.visible || source.visible, active: previous.active || source.active, dirty: previous.dirty || source.dirty });
		}
		return [...sources.values()];
	}
	async readVisibleCurrentCode(): Promise<IBeaconCurrentCodeFile[]> {
		const isCode = (source: IBeaconPageSource) => source.visible && (source.kind === 'notebook' || this.isCode(source));
		const selected = this.documents().filter(isCode);
		const files: IBeaconCurrentCodeFile[] = [];
		for (const source of selected) {
			if (source.reason || !source.uri) { throw new Error(source.reason ?? 'beacon-code-unavailable'); }
			const uri = URI.parse(source.uri);
			const base = { fileName: uri.path.split('/').at(-1) || source.title, filePath: uri.scheme === 'file' ? uri.fsPath : null, isDirty: source.dirty === true };
			if (source.kind === 'notebook') {
				if (!source.readNotebook) { throw new Error('beacon-notebook-content-owner'); }
				files.push({ ...base, kind: 'notebook', cells: await source.readNotebook() });
			} else { files.push({ ...base, kind: 'code', code: await source.read() }); }
			const current = this.documents().find(item => this.identity(item) === this.identity(source) && item.visible);
			if (!current || current.version !== source.version || current.uri !== source.uri || current.languageId !== source.languageId) { throw new Error('beacon-page-changed'); }
		}
		const current = this.documents().filter(isCode);
		if (current.length !== selected.length || selected.some(source => !current.some(item => this.identity(item) === this.identity(source) && item.version === source.version && item.uri === source.uri && item.languageId === source.languageId))) { throw new Error('beacon-page-changed'); }
		return files;
	}
	list(): IBeaconPage[] {
		const sources = this.documents();
		for (const key of this.handles.keys()) { if (!sources.some(source => this.identity(source) === key)) { this.handles.delete(key); } }
		return sources.map(source => {
			const key = this.identity(source);
			let id = this.handles.get(key);
			if (!id) { id = generateUuid(); this.handles.set(key, id); }
			const { kind, title, uri, version, languageId, dirty, reason, active, visible } = source;
			return { id, kind, title, uri, version, languageId, dirty, reason, ...(active ? { active } : {}), ...(visible === undefined ? {} : { visible }) };
		});
	}
	async read(id: string, version: string, offset = 0, limit = 32768): Promise<IBeaconPageRead> {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) { throw new Error('beacon-invalid-range'); }
		const find = () => this.documents().find(source => this.handles.get(this.identity(source)) === id);
		const source = find();
		if (!source) { throw new Error('beacon-page-closed'); }
		if (source.version !== version) { throw new Error('beacon-page-changed'); }
		if (source.kind === 'notebook') { throw new Error('beacon-notebook-content-owner'); }
		if (source.reason) { throw new Error(source.reason); }
		const contents = await source.read();
		const current = find();
		if (!current) { throw new Error('beacon-page-closed'); }
		if (current.version !== version || current.uri !== source.uri) { throw new Error('beacon-page-changed'); }
		const end = Math.min(contents.length, offset + limit);
		return { id, kind: source.kind, title: source.title, uri: source.uri, version, dirty: source.dirty, contents: contents.slice(offset, end), totalCharacters: contents.length, ...(end < contents.length ? { nextOffset: end } : {}) };
	}
}
