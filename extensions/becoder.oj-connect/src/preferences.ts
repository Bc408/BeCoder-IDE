/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SiteId } from './settings';
import type { LanguageOption } from './domain';
import { symbolicCompiler } from './compilerCatalogue';

/** Select from the current catalogue; labels and language IDs always remain site-owned. */
export function defaultLanguage(options: readonly LanguageOption[], family: 'c' | 'cpp'): LanguageOption | undefined {
	const minimum = family === 'cpp' ? 2020 : 2017;
	const candidates = options.filter(option => option.family === family).map(option => {
		const label = option.label;
		const standard = (family === 'cpp' ? /\bC\+\+\s*(\d{2})(?!\d)|^(?:GNU\s+)?G\+\+\s*(\d{2})(?!\d)/i : /\bC\s*(\d{2})(?!\d)/i).exec(label);
		const number = standard ? Number(standard[1] ?? standard[2]) : undefined;
		const year = number === undefined ? undefined : number < 50 ? 2000 + number : 1900 + number;
		const compiler = /\bGCC\s*(\d+(?:\.\d+){0,3})/i.exec(label)
			?? /(?:C|G)\+\+\s*\d{2}\s+(\d+(?:\.\d+){0,3})/i.exec(label)
			?? /\b(?:g\+\+|clang(?:\+\+)?)\s*(\d+(?:\.\d+){0,3})/i.exec(label)
			?? /\bC\s*\d{2}\s+(\d+(?:\.\d+){0,3})/i.exec(label);
		return {
			option, year, version: compiler?.[1].split('.').map(Number) ?? [],
			gnu: /\bGNU\b|\bGCC\b|\bGCC\d|\bg\+\+/i.test(label),
			o2: /(?:^|[\s(\-])O2(?:$|[\s)])/i.test(label), msys2: /\bmsys2\b/i.test(label)
		};
	}).filter(candidate => candidate.year === undefined || candidate.year >= minimum);
	candidates.sort((left, right) => {
		// Unversioned native labels are a fallback, never evidence of a particular standard.
		const preference = Number(left.year === undefined) - Number(right.year === undefined)
			|| Number(right.gnu) - Number(left.gnu) || Number(right.o2) - Number(left.o2)
			|| Number(right.msys2) - Number(left.msys2) || (left.year ?? 0) - (right.year ?? 0);
		if (preference) { return preference; }
		for (let i = 0; i < Math.max(left.version.length, right.version.length); i++) {
			const difference = (right.version[i] ?? 0) - (left.version[i] ?? 0);
			if (difference) { return difference; }
		}
		return 0;
	});
	return candidates[0]?.option;
}

interface PreferenceStore {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): PromiseLike<void>;
}

function validLanguage(site: SiteId, family: 'c' | 'cpp', value: unknown): value is string {
	return typeof value === 'string' && (!!symbolicCompiler(site, family, value) || (site === 'atcoder' || site === 'nowcoder' || site === 'codeforces' ? /^\d+$/.test(value) : site === 'luogu' && /^\d+(?::o2)?$/.test(value)));
}

/** Personal settings are the sole authority; available compilers remain site-owned. */
export class OjPreferences {
	constructor(private readonly store: PreferenceStore) { }
	hasLanguagePreference(site: SiteId, family: 'c' | 'cpp'): boolean {
		const value = this.store.get<unknown>(site + '.' + family + 'Compiler');
		return value !== undefined && value !== '';
	}
	language(site: SiteId, family: 'c' | 'cpp'): string | undefined {
		const value = this.store.get<unknown>(site + '.' + family + 'Compiler');
		return validLanguage(site, family, value) ? value : undefined;
	}
	async selectLanguage(site: SiteId, family: 'c' | 'cpp', id: string): Promise<void> {
		if (!validLanguage(site, family, id)) { throw new Error('Invalid compiler language.'); }
		await this.store.update(site + '.' + family + 'Compiler', id);
	}
	statementLocale(available: readonly string[]): string | undefined {
		const saved = this.store.get<unknown>('atcoder.statementLanguage');
		return typeof saved === 'string' && available.includes(saved) ? saved : available.find(locale => locale === 'en') ?? available[0];
	}
	async selectStatementLocale(locale: string): Promise<void> {
		if (locale !== 'en' && locale !== 'ja') { throw new Error('Invalid statement locale.'); }
		await this.store.update('atcoder.statementLanguage', locale);
	}
	async migrate(legacy: PreferenceStore, configured: (key: string) => boolean): Promise<void> {
		for (const [oldKey, key] of [['atcoder.language.c', 'atcoder.cCompiler'], ['atcoder.language.cpp', 'atcoder.cppCompiler'], ['atcoder.statementLocale', 'atcoder.statementLanguage']]) {
			const value = legacy.get<unknown>(oldKey);
			if (value === undefined) { continue; }
			const valid = key === 'atcoder.statementLanguage' ? value === 'en' || value === 'ja' : validLanguage('atcoder', key === 'atcoder.cCompiler' ? 'c' : 'cpp', value);
			if (valid && !configured(key)) { await this.store.update(key, value); }
			// Never erase an old choice until its settings write has succeeded.
			await legacy.update(oldKey, undefined);
		}
	}
}
