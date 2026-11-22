/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'node:crypto';
import type { ProblemPanel } from './views/problemPanel';
import type { RecordPanel } from './views/recordPanel';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Projects the state already delivered to open panels without refreshing or navigating. */
export function createBeaconPages(problems: Pick<ProblemPanel, 'beaconProblems'>, records: Pick<RecordPanel, 'beaconRecords'>) {
	const handles = new WeakMap<object, string>();
	function pageId(identity: object, kind: 'problem' | 'record'): string {
		let id = handles.get(identity);
		if (!id) { id = `oj:${kind}:${randomUUID()}`; handles.set(identity, id); }
		return id;
	}
	const cached = new WeakMap<object, Map<string, { contents: string; version: string }>>();
	function content(owner: object, key: string, read: () => unknown) {
		let versions = cached.get(owner);
		if (!versions) { versions = new Map(); cached.set(owner, versions); }
		let entry = versions.get(key);
		if (!entry) {
			const contents = JSON.stringify(read(), null, 2);
			entry = { contents, version: hash(contents) };
			versions.set(key, entry);
		}
		return entry;
	}
	const pages = () => {
		const statements = problems.beaconProblems().map(({ identity, document, locale, sourceUri, active }) => {
			const { ref, title, samples, limits, interactive } = document;
			const current = document.bodies.find(body => body.locale === locale) ?? document.bodies[0];
			const { contents, version } = content(document, current?.locale ?? '', () => ({ ref, title, body: current, samples, limits, interactive }));
			return { id: pageId(identity, 'problem'), kind: 'oj-problem' as const, title, uri: ref.url, sourceUri, active, problemKey: ref.url, contents, version };
		});
		const verdicts = records.beaconRecords().map(({ identity, snapshot, sourceUri, active }) => {
			const { ref, sourceVerification, source } = snapshot;
			const sourceSha256 = sourceVerification === 'matched' && source !== undefined ? hash(source.replace(/\r\n/g, '\n')) : undefined;
			const { contents, version } = content(snapshot, '', () => snapshot);
			return { id: pageId(identity, 'record'), kind: 'oj-record' as const, title: `#${ref.id} ${snapshot.rawStatus}`, uri: ref.url, sourceUri, active, problemKey: ref.problem.url, sourceSha256, contents, version };
		});
		return [...statements, ...verdicts];
	};
	return {
		listBeaconPages: () => pages().map(({ contents: _, ...page }) => page),
		readBeaconPage: (id: string, version: string) => {
			const page = pages().find(value => value.id === id && value.version === version);
			return page && { ...page, totalCharacters: page.contents.length };
		}
	};
}
