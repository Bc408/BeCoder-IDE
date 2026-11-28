/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import type { StatementTranslationTicket, StatementVersion } from 'becoder-oj-connect';
import type { Connection } from './connection';
import { generateTranslationBatch } from './provider';
import { applyStatementTranslation, prepareStatementTranslation, translationBatches, translationPayload, type TranslationBatchResult } from './translationContent';
import { translationSystemPrompt } from './translationPrompts';

export async function translateStatement(ticket: StatementTranslationTicket, connection: Connection, signal: AbortSignal, progress: (completed: number, total: number) => void): Promise<StatementVersion> {
	const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
	const prepared = prepareStatementTranslation(ticket.source, ticket.targetLanguage), batches = translationBatches(prepared, connection);
	const results: TranslationBatchResult[] = [];
	progress(0, batches.length);
	for (const batch of batches) {
		requestSignal.throwIfAborted();
		let text: string;
		try { text = await generateTranslationBatch(connection, translationSystemPrompt, translationPayload(batch, ticket.source), requestSignal); }
		catch (error) {
			signal.throwIfAborted();
			if (error instanceof Error && error.message.startsWith('translation-')) { throw error; }
			throw new Error('translation-service-failed', { cause: error });
		}
		let value: { parts?: unknown };
		try { value = JSON.parse(text); } catch { throw new Error('translation-invalid-output'); }
		if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.parts) || value.parts.length !== batch.parts.length || value.parts.some((part, index) => !part || Object.keys(part).length !== 2 || part.id !== batch.parts[index].id || typeof part.text !== 'string')) { throw new Error('translation-invalid-output'); }
		results.push({ id: batch.id, parts: value.parts }); progress(results.length, batches.length);
	}
	requestSignal.throwIfAborted(); return applyStatementTranslation(prepared, results);
}
