/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface PreferenceStore {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): PromiseLike<void>;
}

/** Local explicit AtCoder choices; no account, form or problem state. */
export class OjPreferences {
	constructor(private readonly store: PreferenceStore) { }
	language(family: 'c' | 'cpp'): string | undefined {
		const value = this.store.get<unknown>('atcoder.language.' + family);
		return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
	}
	async selectLanguage(family: 'c' | 'cpp', id: string): Promise<void> {
		if (!/^\d+$/.test(id)) { throw new Error('Invalid AtCoder language.'); }
		await this.store.update('atcoder.language.' + family, id);
	}
	statementLocale(available: readonly string[]): string | undefined {
		const saved = this.store.get<unknown>('atcoder.statementLocale');
		return typeof saved === 'string' && available.includes(saved) ? saved : available.find(locale => locale === 'en') ?? available[0];
	}
	async selectStatementLocale(locale: string): Promise<void> {
		if (locale !== 'en' && locale !== 'ja') { throw new Error('Invalid AtCoder statement locale.'); }
		await this.store.update('atcoder.statementLocale', locale);
	}
}
