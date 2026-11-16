/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemDocument } from './domain';
export function cphSamples(document: ProblemDocument): unknown {
	const limit = (label: string, units: Readonly<Record<string, number>>) => {
		const value = document.limits.find(item => item.label === label)?.value;
		const match = value && /^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)$/.exec(value);
		if (!match || units[match[2]] === undefined) { return undefined; }
		const number = Number(match[1]) * units[match[2]]; return number > 0 && Number.isFinite(number) ? number : undefined;
	};
	return {
		name: document.title, group: document.ref.site, url: document.ref.url, interactive: document.interactive, tests: document.samples,
		timeLimitMs: limit('Time Limit', { ms: 1, sec: 1000, s: 1000, min: 60000, h: 3600000, d: 86400000 }), memoryLimitMiB: limit('Memory Limit', { B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 })
	};
}
