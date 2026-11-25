/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import type { IBeaconPage, IBeaconPageRead, IBeaconCurrentCodeFile } from './beaconContextTypes.js';
import { URI } from '../../../base/common/uri.js';

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
}

export class BeaconPages {
	private readonly handles = new Map<object, string>();
	constructor(private readonly sources: () => IBeaconPageSource[]) { }
	reset(): void { this.handles.clear(); }
	forget(key: object): void { this.handles.delete(key); }
	async readVisibleCurrentCode(): Promise<IBeaconCurrentCodeFile[]> {
		const isCode = (source: IBeaconPageSource) => source.visible && source.kind === 'text' && (['c', 'cpp'].includes(source.languageId ?? '') || !source.languageId && /\.(?:c|cpp|cc|cxx)$/i.test(source.uri ?? source.title));
		const selected = this.sources().filter(isCode);
		const files: IBeaconCurrentCodeFile[] = [];
		for (const source of selected) {
			if (source.reason || !source.uri) { throw new Error(source.reason ?? 'beacon-code-unavailable'); }
			const uri = URI.parse(source.uri), code = await source.read();
			const current = this.sources().find(item => item.key === source.key && item.visible);
			if (!current || current.version !== source.version || current.uri !== source.uri || current.languageId !== source.languageId) { throw new Error('beacon-page-changed'); }
			files.push({ fileName: uri.path.split('/').at(-1) || source.title, filePath: uri.scheme === 'file' ? uri.fsPath : null, isDirty: source.dirty === true, code });
		}
		const current = this.sources().filter(isCode);
		if (current.length !== selected.length || selected.some(source => !current.some(item => item.key === source.key && item.version === source.version && item.uri === source.uri))) { throw new Error('beacon-page-changed'); }
		return files;
	}
	list(): IBeaconPage[] {
		const sources = this.sources();
		for (const key of this.handles.keys()) { if (!sources.some(source => source.key === key)) { this.handles.delete(key); } }
		return sources.map(source => {
			let id = this.handles.get(source.key);
			if (!id) { id = generateUuid(); this.handles.set(source.key, id); }
			const { kind, title, uri, version, languageId, dirty, reason, active } = source;
			return { id, kind, title, uri, version, languageId, dirty, reason, ...(active ? { active } : {}) };
		});
	}
	async read(id: string, version: string, offset = 0, limit = 32768): Promise<IBeaconPageRead> {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) { throw new Error('beacon-invalid-range'); }
		const find = () => this.sources().find(source => this.handles.get(source.key) === id);
		const source = find();
		if (!source) { throw new Error('beacon-page-closed'); }
		if (source.version !== version) { throw new Error('beacon-page-changed'); }
		if (source.reason) { throw new Error(source.reason); }
		const contents = await source.read();
		const current = find();
		if (!current) { throw new Error('beacon-page-closed'); }
		if (current.version !== version || current.uri !== source.uri) { throw new Error('beacon-page-changed'); }
		const end = Math.min(contents.length, offset + limit);
		return { id, kind: source.kind, title: source.title, uri: source.uri, version, dirty: source.dirty, contents: contents.slice(offset, end), totalCharacters: contents.length, ...(end < contents.length ? { nextOffset: end } : {}) };
	}
}
