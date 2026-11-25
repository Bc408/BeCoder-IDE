/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const beCoderInfoTopics = ['overview', 'problems', 'runner', 'cph', 'notebook', 'oj-connect', 'beacon'] as const;
export type BeCoderInfoTopic = typeof beCoderInfoTopics[number];
export interface BeCoderInfo { version: string; topic: BeCoderInfoTopic; content: string }
export type BeCoderInfoReader = (topic: BeCoderInfoTopic, signal: AbortSignal) => Promise<BeCoderInfo>;

/** Read only bundled product facts. No user files, settings, network or workspace scope. */
export function createBeCoderInfoReader(resourceRoot: string, readVersion: (signal: AbortSignal) => Promise<string>): BeCoderInfoReader {
	return async (topic, signal) => {
		signal.throwIfAborted();
		if (!beCoderInfoTopics.includes(topic)) { throw new Error('product-info-invalid-topic'); }
		const version = await readVersion(signal);
		signal.throwIfAborted();
		if (typeof version !== 'string' || !version.trim()) { throw new Error('product-info-version-unavailable'); }
		const content = await readFile(path.join(resourceRoot, topic + '.md'), { encoding: 'utf8', signal });
		signal.throwIfAborted();
		if (!content.trim()) { throw new Error('product-info-content-unavailable'); }
		return { version, topic, content };
	};
}
