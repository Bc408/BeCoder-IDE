/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SiteId } from './settings';

interface PreferenceStore {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): PromiseLike<void>;
}

function validLanguage(site: SiteId, value: unknown): value is string {
	return typeof value === 'string' && (site === 'atcoder' || site === 'nowcoder' ? /^\d+$/.test(value) : site === 'luogu' && /^\d+(?::o2)?$/.test(value));
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
		return validLanguage(site, value) ? value : undefined;
	}
	async selectLanguage(site: SiteId, family: 'c' | 'cpp', id: string): Promise<void> {
		if (!validLanguage(site, id)) { throw new Error('Invalid compiler language.'); }
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
			const valid = key === 'atcoder.statementLanguage' ? value === 'en' || value === 'ja' : validLanguage('atcoder', value);
			if (valid && !configured(key)) { await this.store.update(key, value); }
			// Never erase an old choice until its settings write has succeeded.
			await legacy.update(oldKey, undefined);
		}
	}
}
