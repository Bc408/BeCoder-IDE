/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef, StatementContent, StatementLanguage, StatementRead, StatementTranslationTicket, StatementVersion } from 'becoder-oj-connect';

export class StatementCacheClient {
	constructor(private readonly execute: (operation: string, input: object) => Promise<unknown>, private readonly generate: (ticket: StatementTranslationTicket, signal: AbortSignal, progress: (completed: number, total: number) => void) => Promise<StatementVersion>) { }
	read(ref: ProblemRef, language: StatementLanguage): Promise<StatementRead | undefined> { return this.execute('read', { ref, language }) as Promise<StatementRead | undefined>; }
	publishAcquired(document: StatementContent): Promise<StatementContent> { return this.execute('publishAcquired', { document }) as Promise<StatementContent>; }
	async merge(input: StatementContent): Promise<StatementContent> {
		return await this.execute('merge', { document: input }) as StatementContent;
	}
	async translate(source: StatementRead, target: StatementLanguage, signal: AbortSignal, progress: (completed: number, total: number) => void): Promise<StatementContent> {
		signal.throwIfAborted();
		const ticket = await this.execute('acquireTranslation', { source, target }) as StatementTranslationTicket;
		const release = () => this.execute('releaseTranslation', { ticketId: ticket.id });
		const abort = () => { void release().catch(() => { }); };
		signal.addEventListener('abort', abort, { once: true });
		try {
			signal.throwIfAborted(); const version = await this.generate(ticket, signal, progress); signal.throwIfAborted();
			try { return await this.execute('publishTranslation', { ticketId: ticket.id, version }) as StatementContent; }
			catch (error) {
				if (error instanceof Error && ['statement-source-changed', 'statement-translation-owner', 'statement-cache-publication-uncertain'].includes(error.message)) { throw error; }
				throw new Error('statement-cache-save-failed', { cause: error });
			}
		} finally { signal.removeEventListener('abort', abort); await release().catch(() => { }); }
	}
}
