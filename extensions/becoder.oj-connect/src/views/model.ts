/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemDocument, RecordRef, RecordSnapshot, LanguageOption } from '../domain';
export interface PanelState {
	kind: 'problem' | 'record';
	labels: Record<string, string>;
	sourceName: string;
	problem?: ProblemDocument;
	record?: RecordRef;
	snapshot?: RecordSnapshot;
	locale?: string;
	message?: string;
	tracking?: boolean;
	canRetry?: boolean;
	languages?: readonly LanguageOption[];
	languageId?: string;
}
export type PanelAction = { action: 'submit' | 'importCph' | 'viewRecord' | 'openOriginal' | 'viewSource' | 'continueQuery' | 'stopTracking' | 'ready' } | { action: 'selectLocale'; locale: string } | { action: 'selectLanguage'; languageId: string } | { action: 'renderMarkdown'; markdown: string };
export function safeState(value: unknown): string {
	return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}
export function panelMessage(raw: unknown): PanelAction | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
	const value = raw as Record<string, unknown>;
	if (value.action === 'renderMarkdown' && Object.keys(value).length === 2 && typeof value.markdown === 'string' && value.markdown.length <= 8 * 1024 * 1024) { return { action: 'renderMarkdown', markdown: value.markdown }; }
	if (value.action === 'selectLocale' && Object.keys(value).length === 2 && typeof value.locale === 'string' && value.locale.length < 40) { return { action: 'selectLocale', locale: value.locale }; }
	if (value.action === 'selectLanguage' && Object.keys(value).length === 2 && typeof value.languageId === 'string' && value.languageId.length <= 200) { return { action: 'selectLanguage', languageId: value.languageId }; }
	if (Object.keys(value).length === 1 && ['submit', 'importCph', 'viewRecord', 'openOriginal', 'viewSource', 'continueQuery', 'stopTracking', 'ready'].includes(String(value.action))) { return { action: value.action as Exclude<PanelAction, { locale: string } | { languageId: string } | { markdown: string }>['action'] }; }
	return undefined;
}
