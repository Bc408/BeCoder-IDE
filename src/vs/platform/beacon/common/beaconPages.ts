/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import type { IBeaconPage, IBeaconPageRead } from './beaconContextTypes.js';

export interface IBeaconPageSource {
	key: object;
	kind: 'text' | 'browser' | 'notebook' | 'unsupported';
	title: string;
	uri?: string;
	version: string;
	dirty?: boolean;
	reason?: string;
	read(): Promise<string>;
}

export class BeaconPages {
	private readonly handles = new Map<object, string>();
	constructor(private readonly sources: () => IBeaconPageSource[]) { }
	reset(): void { this.handles.clear(); }
	forget(key: object): void { this.handles.delete(key); }
	list(): IBeaconPage[] {
		const sources = this.sources();
		for (const key of this.handles.keys()) { if (!sources.some(source => source.key === key)) { this.handles.delete(key); } }
		return sources.map(source => {
			let id = this.handles.get(source.key);
			if (!id) { id = generateUuid(); this.handles.set(source.key, id); }
			const { kind, title, uri, version, dirty, reason } = source;
			return { id, kind, title, uri, version, dirty, reason };
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
