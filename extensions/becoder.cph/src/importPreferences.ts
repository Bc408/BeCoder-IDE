/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Programming Helper, src/companion.ts.
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { ImportedProblem } from './problem';

export interface SourcePreferences {
	language: 'c' | 'cpp';
	contents: string;
	stem: string;
	name?: string;
	initialize?: (problem: ImportedProblem & { srcPath: string }) => string;
}

export function problemDisplayName(problem: ImportedProblem, includeIndex: boolean): string {
	const sections = problem.name.split(' - ');
	return !includeIndex && sections.length > 1 ? sections.slice(1).join() : problem.name;
}

export function problemFileStem(problem: ImportedProblem, get: <T>(key: string, fallback: T) => T): string {
	const url = new URL(problem.url);
	if (/(^|\.)codeforces\.com$/.test(url.hostname) && get('general.useShortCodeForcesName', false)) {
		const match = url.pathname.match(/\/(?:contest|gym)\/(\d+)\/problem\/(\w+)|\/problemset\/problem\/(\d+)\/(\w+)/);
		if (match) { return `${match[1] ?? match[3]}${match[2] ?? match[4]}`; }
	}
	if (/(^|\.)luogu\.(com\.cn|com|org)$/.test(url.hostname) && get('general.useShortLuoguName', false)) {
		const match = url.pathname.match(/problem\/(\w+)/);
		if (match) { return match[1]; }
	}
	if (url.hostname === 'atcoder.jp' && get('general.useShortAtCoderName', false)) {
		const match = url.pathname.match(/tasks\/(\w+)_(\w+)/);
		if (match) { return `${match[1]}${match[2]}`; }
	}
	const sections = problem.name.split(' - ');
	const name = !get('general.includeProblemIndex', false) && sections.length > 1 ? sections.slice(1).join() : problem.name;
	const words = name.match(new RegExp(get('general.wordRegex', '[\\p{L}]+|[0-9]+'), 'gu'));
	return words === null ? name.replace(/\W+/g, '_') : words.join('_');
}

/** Preserve upstream's first-occurrence variable substitution, without modifying user files. */
export function fillTemplate(contents: string, problem: ImportedProblem & { srcPath?: string }, now = new Date()): string {
	const pad = (value: number) => value.toString().padStart(2, '0');
	const variables = { ...problem, date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` };
	for (const [key, value] of Object.entries(variables)) {
		const serialized = JSON.stringify(value);
		contents = contents.replace(`$${key}$`, () => serialized.substring(1, serialized.length - 1));
	}
	return contents;
}
