/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
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
	languagesLoading?: boolean;
	usingCompilerCatalogue?: boolean;
	languageId?: string;
}
export type PanelAction = { action: 'submit' | 'importCph' | 'viewSource' | 'continueQuery' | 'ready' } | { action: 'openLink'; url: string } | { action: 'selectLocale'; locale: string } | { action: 'selectLanguage'; languageId: string } | { action: 'renderContent'; content: string; format: 'markdown' | 'html' };
export function safeState(value: unknown): string {
	return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}
export function panelMessage(raw: unknown): PanelAction | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
	const value = raw as Record<string, unknown>;
	if (value.action === 'openLink' && Object.keys(value).length === 2 && typeof value.url === 'string' && value.url.length <= 8192 && !/[\u0000-\u0020\u007f]/.test(value.url)) {
		try {
			const url = new URL(value.url);
			if (url.protocol === 'https:' && !url.username && !url.password) { return { action: 'openLink', url: url.href }; }
		} catch { /* Invalid links cannot fall through to a different opener. */ }
		return undefined;
	}
	if (value.action === 'renderContent' && Object.keys(value).length === 3 && typeof value.content === 'string' && value.content.length <= 8 * 1024 * 1024 && (value.format === 'markdown' || value.format === 'html')) { return { action: 'renderContent', content: value.content, format: value.format }; }
	if (value.action === 'selectLocale' && Object.keys(value).length === 2 && typeof value.locale === 'string' && value.locale.length < 40) { return { action: 'selectLocale', locale: value.locale }; }
	if (value.action === 'selectLanguage' && Object.keys(value).length === 2 && typeof value.languageId === 'string' && value.languageId.length <= 200) { return { action: 'selectLanguage', languageId: value.languageId }; }
	if (Object.keys(value).length === 1 && ['submit', 'importCph', 'viewSource', 'continueQuery', 'ready'].includes(String(value.action))) { return { action: value.action as Exclude<PanelAction, { url: string } | { locale: string } | { languageId: string } | { content: string }>['action'] }; }
	return undefined;
}
