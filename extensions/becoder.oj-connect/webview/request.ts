/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.18.2 (dbced7c2cd0aca345cfa6f91de64b59c02806341).
 *  BeCoder changes: shared OJ data/commands, localization, removed peripheral features.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import type { PanelAction } from '../src/views/model';

declare function acquireVsCodeApi(): { postMessage(data: unknown): void };
export const vscode = acquireVsCodeApi();

const p = new Map<string, [(data: unknown) => void, (err: string) => void]>();

export default function send<T = void>(data: PanelAction): Promise<T> {
	const uuid = crypto.randomUUID();
	return new Promise((resolve, reject) => {
		p.set(uuid, [value => resolve(value as T), err => reject(new Error(err))]);
		vscode.postMessage({ type: 'ojAction', data, uuid });
	});
}
window.addEventListener(
	'message',
	({ data }: MessageEvent<{ uuid: string; data?: unknown; error?: string }>) => {
		const f = p.get(data.uuid);
		if (f) {
			p.delete(data.uuid);
			data.error ? f[1](data.error) : f[0](data.data);
		}
	}
);
