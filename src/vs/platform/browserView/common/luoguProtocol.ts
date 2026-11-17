/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file

// The main-process Luogu client owns protocol normalization; the extension consumes its DTOs.
// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ProblemDocument, RecordRef, RecordSnapshot, LanguageOption, LoginSummary, Section } from 'becoder-oj-connect';
import { assertLuoguProblem } from './luoguBridge.js';
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('oj-connect-invalid-data'); }
	return value as Record<string, unknown>;
}
function text(value: unknown, limit = 8192, allowEmpty = false): string {
	if (typeof value !== 'string' || value.length > limit || !allowEmpty && !value.trim()) { throw new Error('oj-connect-invalid-data'); }
	return value;
}
function validateRecordRef(ref: RecordRef): RecordRef {
	assertLuoguProblem(ref.problem);
	if (!/^[1-9]\d*$/.test(ref.id) || ref.url !== 'https://www.luogu.com.cn/record/' + ref.id) { throw new Error('luogu-invalid-record'); }
	return ref;
}


function dataOf(raw: unknown): Record<string, unknown> {
	const root = object(raw);
	return object(root.data ?? root.currentData);
}
function values(raw: unknown): Record<string, unknown>[] {
	return raw && typeof raw === 'object' ? Object.values(raw).filter(item => item && typeof item === 'object').map(object).sort((a, b) => Number(a.id) - Number(b.id)) : [];
}
function numeric(value: unknown): string | undefined { return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined; }


// Adapted from vscode-luogu v4.20.0 shared.ts, color.ts, stringUtils.ts and tagManager.ts.
// Copyright (c) 2018 引领天下. MIT License; see ThirdPartyNotices.txt.
const difficultyNames = ['\u6682\u65e0\u8bc4\u5b9a', '\u5165\u95e8', '\u666e\u53ca-', '\u666e\u53ca', '\u666e\u53ca+/\u63d0\u9ad8-', '\u63d0\u9ad8', '\u63d0\u9ad8+/\u7701\u9009-', '\u7701\u9009/NOI-', 'NOI/NOI+/CTS'];
const difficultyColors = ['#BFBFBF', '#FE4C61', '#F39C11', '#FFC116', '#52C41A', '#13C2C2', '#3498DB', '#9D3DCF', '#0E1D69'];
const tagColors = {
	'blue-1': '#e0f7ff',
	'blue-2': '#89d1f5',
	'blue-3': '#3498db',
	'blue-4': '#14558f',
	'blue-5': '#052242',
	'green-1': '#d9f0c7',
	'green-2': '#94d66d',
	'green-3': '#52c41a',
	'green-4': '#22700a',
	'green-5': '#072401',
	'purple-1': '#fbedff',
	'purple-2': '#ce8ee8',
	'purple-3': '#9d3dcf',
	'purple-4': '#561982',
	'purple-5': '#1f0736',
	'orange-1': '#ffedb5',
	'orange-2': '#ffce63',
	'orange-3': '#f39c11',
	'orange-4': '#a65b00',
	'orange-5': '#592b00',
	'pink-1': '#fff0f0',
	'pink-2': '#ff9ea3',
	'pink-3': '#fe4c61',
	'pink-4': '#b3243e',
	'pink-5': '#660e24',
	'lapis-1': '#cad5e8',
	'lapis-2': '#728dcf',
	'lapis-3': '#2949b4',
	'lapis-4': '#0e1d69',
	'lapis-5': '#02051c',
	'gold-1': '#fff6ba',
	'gold-2': '#ffe169',
	'gold-3': '#ffc116',
	'gold-4': '#b37700',
	'gold-5': '#663d00',
	'cyan-1': '#b5f5ec',
	'cyan-2': '#5cdbd3',
	'cyan-3': '#13c2c2',
	'cyan-4': '#006d75',
	'cyan-5': '#002329',
	'yellow-1': '#ffffb8',
	'yellow-2': '#fffb8f',
	'yellow-3': '#fadb14',
	'yellow-4': '#ad8b00',
	'yellow-5': '#614700',
	'red-1': '#ffebe6',
	'red-2': '#ffa694',
	'red-3': '#e74c3c',
	'red-4': '#9c1d19',
	'red-5': '#4f080a',
	'grey-1': '#fafafa',
	'grey-2': '#e8e8e8',
	'grey-3': '#bfbfbf',
	'grey-4': '#595959',
	'grey-5': '#262626',
	'lgreen-1': '#dae0d3',
	'lgreen-2': '#aac791',
	'lgreen-3': '#70ad47',
	'lgreen-4': '#34611e',
	'lgreen-5': '#091405'
} as const;
function formatTime(time: number): string {
	if (time < 1e3) { return `${time}ms`; }
	if (time < 60 * 1e3) { return `${(time / 1e3).toFixed(2)}s`; }
	if (time < 60 * 60 * 1e3) { return `${(time / (60 * 1e3)).toFixed(2)}min`; }
	if (time < 24 * 60 * 60 * 1e3) { return `${(time / (60 * 60 * 1e3)).toFixed(2)}h`; }
	return `${(time / (24 * 60 * 60 * 1e3)).toFixed(2)}d`;
}
function formatMemory(memory: number): string {
	if (memory < 2 ** 10) { return `${memory}B`; }
	if (memory < 2 ** 20) { return `${(memory / 2 ** 10).toFixed(2)}KiB`; }
	if (memory < 2 ** 30) { return `${(memory / 2 ** 20).toFixed(2)}MiB`; }
	return `${(memory / 2 ** 30).toFixed(2)}GiB`;
}
function problemMetadata(problem: Record<string, unknown>, rawTags: unknown): Pick<ProblemDocument, 'difficulty' | 'tags'> {
	const id = problem.difficulty;
	const difficulty = typeof id === 'number' && Number.isSafeInteger(id) && id >= 0 ? { label: difficultyNames[id] ?? `\u672a\u77e5\u96be\u5ea6 (${id})`, color: difficultyColors[id] ?? difficultyColors[0] } : undefined;
	const ids = Array.isArray(problem.tags) ? problem.tags.filter((id): id is number => Number.isSafeInteger(id) && Number(id) >= 0) : [];
	const response = rawTags && typeof rawTags === 'object' ? object(rawTags) : {};
	const types = new Map(values(response.types).map(type => [type.id, typeof type.color === 'string' && Object.hasOwn(tagColors, type.color) ? tagColors[type.color as keyof typeof tagColors] : '#000000']));
	const tagsById = new Map(values(response.tags).map(tag => [tag.id, tag]));
	const tags = ids.map(id => { const tag = tagsById.get(id); return tag && typeof tag.name === 'string' && tag.name.trim() ? { label: text(tag.name, 200), color: types.get(tag.type) ?? '#000000' } : { label: `Unknown Tag: id ${id}`, color: '#000000' }; });
	return { ...(difficulty === undefined ? {} : { difficulty }), ...(tags.length ? { tags } : {}) };
}

// Upstream record/data.ts processTestcaseData: pending cards come only from official groups.
function testcaseSubtasks(record: Record<string, unknown>, data: Record<string, unknown>, judge: Record<string, unknown>): Record<string, unknown>[] {
	const actual = values(judge.subtasks);
	if (record.status !== 1 || !['P', 'B', 'T', 'U'].includes(String(object(record.problem).type))) { return actual; }
	const groups = data.testcaseGroup ?? data.testCaseGroup;
	const subtasks = new Map<number, Record<string, unknown>>();
	if (groups && typeof groups === 'object') {
		for (const [key, ids] of Object.entries(groups)) {
			const id = Number(key);
			if (!Number.isSafeInteger(id) || id < 0 || !Array.isArray(ids)) { continue; }
			subtasks.set(id, { id, testCases: ids.filter(id => Number.isSafeInteger(id) && id >= 0).map(id => ({ id, status: 1 })) });
		}
	}
	for (const subtask of actual) {
		const id = Number(subtask.id), previous = subtasks.get(id);
		const tests = new Map(values(previous?.testCases).map(test => [test.id, test]));
		for (const test of values(subtask.testCases)) { tests.set(test.id, test); }
		subtasks.set(id, { ...subtask, testCases: Object.fromEntries(tests) });
	}
	return [...subtasks.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

export function parseLuoguProblem(ref: ProblemRef, raw: unknown, rawTags?: unknown): ProblemDocument {
	assertLuoguProblem(ref);
	const data = dataOf(raw), problem = object(data.problem), content = object(problem.content);
	if (problem.pid !== ref.nativeId.split('@')[0]) { throw new Error('Luogu returned a different problem.'); }
	const bodies: { locale: string; sections: Section[] }[] = [];
	const add = (rawContent: unknown, fallback: string) => {
		const value = object(rawContent), locale = typeof value.locale === 'string' ? value.locale : fallback;
		const fields = [['background', '\u9898\u76ee\u80cc\u666f'], ['description', '\u9898\u76ee\u63cf\u8ff0'], ['formatI', '\u8f93\u5165\u683c\u5f0f'], ['formatO', '\u8f93\u51fa\u683c\u5f0f'], ['hint', '\u8bf4\u660e/\u63d0\u793a']];
		const sections: Section[] = fields.filter(([key]) => typeof value[key] === 'string' && value[key]).map(([key, heading]) => ({ heading, format: 'markdown', content: text(value[key], 8 * 1024 * 1024, true), ...(key === 'hint' ? { kind: 'notes' as const } : {}) }));
		if (sections.length && !bodies.some(body => body.locale === locale)) { bodies.push({ locale, sections }); }
	};
	add(content, 'zh-CN');
	for (const [locale, value] of Object.entries(data.translations && typeof data.translations === 'object' ? data.translations : {})) {
		if (value && typeof value === 'object') { add(value, locale); }
	}
	const translations = Object.keys(data.translations && typeof data.translations === 'object' ? data.translations : {});
	if (typeof problem.translation === 'string' && problem.translation && (translations.length === 1 && translations[0] !== 'zh-CN' || translations.length === 0 && !String(content.locale ?? 'zh-CN').toLowerCase().startsWith('zh'))) {
		for (const body of bodies) {
			const notes = body.sections.findIndex(section => section.kind === 'notes');
			body.sections.splice(notes < 0 ? body.sections.length : notes, 0, { heading: '\u9898\u610f\u7ffb\u8bd1', format: 'markdown', content: text(problem.translation, 8 * 1024 * 1024, true) });
		}
	}
	const limits: { label: string; value: string }[] = [];
	const limit = problem.limits && typeof problem.limits === 'object' ? object(problem.limits) : {};
	for (const [field, label, format] of [['time', 'Time Limit', formatTime], ['memory', 'Memory Limit', (value: number) => formatMemory(value * 2 ** 10)]] as const) {
		const raw = limit[field];
		if (Array.isArray(raw) && raw.length && raw.every(item => typeof item === 'number' && Number.isFinite(item) && item > 0)) {
			const min = format(Math.min(...raw)), max = format(Math.max(...raw));
			limits.push({ label, value: min === max ? min : `${min}~${max}` });
		}
	}
	if (!Array.isArray(problem.samples)) { throw new Error('Luogu samples are unavailable.'); }
	return {
		ref, title: ref.nativeId + ' ' + text(problem.title ?? problem.name ?? content.name, 1024), bodies, limits, ...problemMetadata(problem, rawTags), interactive: false,
		samples: problem.samples.map(sample => { if (!Array.isArray(sample) || sample.length !== 2) { throw new Error('Invalid Luogu sample.'); } return { input: text(sample[0], 8 * 1024 * 1024, true), output: text(sample[1], 8 * 1024 * 1024, true) }; })
	};
}

// Default entries extracted from languageFamily + defaultLanguageVersion in
// vscode-luogu v4.20.0 src/utils/shared.ts (987ca974b5419230a07b59a195ec44026e16f6f4).
// Copyright (c) 2018 引领天下. MIT License. See ThirdPartyNotices.txt.
const defaultLanguages = { cpp: { id: 28, O2: true }, c: { id: 2, O2: true } } as const;

export function luoguLanguages(raw: unknown, rawConfig: unknown): LanguageOption[] {
	const problem = object(dataOf(raw).problem), config = object(object(rawConfig).CodeLanguage);
	if (!Array.isArray(problem.acceptLanguages)) { throw new Error('Luogu languages are unavailable.'); }
	const result: LanguageOption[] = [];
	for (const id of problem.acceptLanguages) {
		if (!Number.isSafeInteger(id) || !config[String(id)]) { continue; }
		const language = object(config[String(id)]);
		if (language.disabled || !Array.isArray(language.fileExt)) { continue; }
		const family = language.fileExt.some(ext => ['cpp', 'cc', 'cxx'].includes(String(ext))) ? 'cpp' : language.fileExt.includes('c') ? 'c' : undefined;
		if (!family) { continue; }
		const label = text(language.name, 200);
		result.push({ id: String(id), label, family });
		if (language.canO2 === true) { result.push({ id: id + ':o2', label: label + ' (O2)', family }); }
	}
	const isDefault = (option: LanguageOption) => option.id === defaultLanguages[option.family].id + (defaultLanguages[option.family].O2 ? ':o2' : '');
	return result.sort((left, right) => Number(isDefault(right)) - Number(isDefault(left)));
}

export function luoguLogin(raw: unknown): LoginSummary {
	const root = object(raw);
	if (root.user === null) { return { site: 'luogu', state: 'signed-out' }; }
	if (root.user && typeof root.user === 'object') {
		const user = object(root.user);
		if (Number.isSafeInteger(user.uid) && Number(user.uid) > 0 && typeof user.name === 'string') { return { site: 'luogu', state: 'signed-in', label: text(user.name, 512), profileUrl: 'https://www.luogu.com.cn/user/' + user.uid }; }
	}
	return { site: 'luogu', state: 'unknown' };
}

export function parseLuoguRecord(input: RecordRef, raw: unknown, rawConfig: unknown, expectedSource?: string): RecordSnapshot {
	const ref = validateRecordRef(input), data = dataOf(raw), record = object(data.record);
	const problem = object(record.problem);
	if (ref.problem.site !== 'luogu' || String(record.id) !== ref.id || problem.pid !== ref.problem.nativeId.split('@')[0]) { throw new Error('Luogu returned a different record.'); }
	const config = object(rawConfig), statuses = object(config.RecordStatus), languages = object(config.CodeLanguage);
	const status = statuses[String(record.status)], visible = data.canViewStatus !== false && data.showStatus !== false;
	const mapping = status && typeof status === 'object' ? object(status) : undefined;
	const rawStatus = !visible ? 'N/A' : mapping ? text(mapping.shortName ?? mapping.name, 200) : String(record.status);
	const phase = !visible || !mapping || Number(record.status) < 0 ? 'unknown' : record.status === 0 ? 'queued' : record.status === 1 ? 'judging' : 'finished';
	const language = languages[String(record.language)];
	const detail = record.detail && typeof record.detail === 'object' ? object(record.detail) : {};
	const compile = detail.compileResult && typeof detail.compileResult === 'object' ? object(detail.compileResult) : {};
	const judge = detail.judgeResult && typeof detail.judgeResult === 'object' ? object(detail.judgeResult) : {};
	const groups = visible ? testcaseSubtasks(record, data, judge).map(subtask => ({
		name: 'Subtask #' + String(subtask.id), rows: values(subtask.testCases).map(row => {
			const status = statuses[String(row.status)];
			return [typeof row.id === 'number' && Number.isSafeInteger(row.id) && row.id >= 0 ? String(row.id + 1) : String(row.id), status && typeof status === 'object' ? String(object(status).shortName ?? row.status) : String(row.status), numeric(row.time) ? row.time + ' ms' : '', numeric(row.memory) ? row.memory + ' KiB' : '', typeof row.description === 'string' ? row.description : '', numeric(row.score) !== undefined ? 'Score: ' + row.score : '', numeric(row.signal) !== undefined && row.signal !== 0 ? 'Received signal ' + row.signal : '', numeric(row.exitCode) !== undefined ? 'Exit with code ' + row.exitCode : ''];
		})
	})) : [];
	// Legacy content-only records omit canViewCode and return sourceCode only when visible.
	const sourceVisible = data.canViewCode !== false && typeof record.sourceCode === 'string';
	const sourceVerification = !sourceVisible ? 'unavailable' : expectedSource === undefined ? 'not-checked' : (record.sourceCode as string).replace(/\r\n/g, '\n') === expectedSource.replace(/\r\n/g, '\n') ? 'matched' : 'mismatch';
	const compileVisible = visible && record.status !== 0 && typeof compile.success === 'boolean';
	const title = problem.title ?? problem.name, difficulty = problemMetadata(problem, undefined).difficulty;
	return {
		ref, phase, rawStatus, sourceVerification, groups,
		...(typeof title === 'string' && title.trim() ? { problemTitle: text(title, 2048) } : {}),
		...(difficulty ? { problemDifficulty: difficulty } : {}),
		...(typeof record.submitTime === 'number' && Number.isFinite(record.submitTime) && record.submitTime >= 0 && record.submitTime < 8640000000000 ? { submittedAt: new Date(record.submitTime * 1000).toISOString() } : {}),
		...(numeric(record.sourceCodeLength) !== undefined ? { codeLength: formatMemory(Number(record.sourceCodeLength)) } : {}),
		...(sourceVisible ? { source: record.sourceCode as string } : {}),
		...(compileVisible ? { compileSucceeded: compile.success as boolean } : {}),
		...(language && typeof language === 'object' ? { language: text(object(language).name, 200) + (record.enableO2 ? ' (O2)' : '') } : {}),
		...(visible && numeric(record.score) !== undefined ? { score: numeric(record.score) } : {}),
		...(visible && numeric(record.time) !== undefined ? { time: formatTime(Number(record.time)) } : {}),
		...(visible && numeric(record.memory) !== undefined ? { memory: formatMemory(Number(record.memory) * 1024) } : {}),
		...(compileVisible && typeof compile.message === 'string' ? { compileMessage: compile.message } : {})
	};
}
