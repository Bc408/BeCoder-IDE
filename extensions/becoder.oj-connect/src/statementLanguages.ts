/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StatementContent, StatementLanguage, StatementRead } from 'becoder-oj-connect';

export function statementLanguages(document: StatementContent): readonly StatementLanguage[] {
	return (['zh-CN', 'en'] as const).filter(language => document.bodies.some(body => body.locale === language && body.sections.some(section => section.content.trim())));
}
export function selectStatement(document: StatementContent, language: StatementLanguage): StatementRead | undefined {
	if (language !== 'zh-CN' && language !== 'en') { throw new Error('statement-invalid-language'); }
	const body = document.bodies.find(body => body.locale === language && body.sections.some(section => section.content.trim()));
	if (!body) { return undefined; }
	return {
		ref: document.ref, samples: document.samples, limits: document.limits, interactive: document.interactive,
		...(document.difficulty ? { difficulty: document.difficulty } : {}), ...(document.tags ? { tags: document.tags } : {}),
		version: { language, title: body.title ?? document.title, sections: body.sections, origin: body.origin ?? 'site' }
	};
}
