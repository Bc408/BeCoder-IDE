/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ProblemDocument, ProblemReadOptions, LanguageOption, RecordRef, RecordSnapshot } from 'becoder-oj-connect';
import type { AnyNode, ObjectExpression, Property } from 'acorn';
import { assertLanqiaoProblem, lanqiaoRecord } from '../common/lanqiaoBridge.js';
export { assertLanqiaoProblem, lanqiaoRecord } from '../common/lanqiaoBridge.js';

export function lanqiaoObject(raw: unknown): Record<string, unknown> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { throw new Error('lanqiao-invalid-response'); }
	return raw as Record<string, unknown>;
}
function text(raw: unknown, limit: number): string {
	if (typeof raw !== 'string' || raw.length > limit) { throw new Error('lanqiao-invalid-response'); }
	return raw;
}
export function lanqiaoQuestion(problem: ProblemRef, raw: unknown): string {
	assertLanqiaoProblem(problem);
	const data = lanqiaoObject(raw);
	if (data.id !== Number(problem.nativeId) || !Number.isSafeInteger(data.question_id) || Number(data.question_id) <= 0 || Number(data.question_id) > 99999999 || data.type !== 'contest_oj' || data.in_contest !== false || data.contest_id !== null || data.vm_config !== null || data.challenge !== undefined && data.challenge !== null || data.lab_id !== undefined && data.lab_id !== null) { throw new Error('lanqiao-unsupported-problem'); }
	const stem = text(data.question_stem, 2 * 1024 * 1024);
	// allow-any-unicode-next-line
	if (!/(?:输入|\bInput\b)/i.test(stem) || !/(?:输出|\bOutput\b)/i.test(stem) || /交互题|interactive\s+(?:problem|task)|output[- ]only|填空题|补全代码|云环境挑战/i.test(stem)) { throw new Error('lanqiao-unsupported-problem'); }
	return String(data.question_id);
}

function sampleSections(stem: string): { body: string; notes?: string; samples: { input: string; output: string }[] } {
	const lines = stem.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [];
	let offset = 0, area = -1, input: string | undefined, kind: 'input' | 'output' | undefined, labelStart = 0;
	let inputRanges: { start: number; end: number }[] | undefined, malformed = false;
	const ranges: { start: number; end: number }[] = [];
	let fence: { char: string; length: number; start: number; opening: number; labelStart: number; labelEnd: number; kind?: 'input' | 'output' } | undefined;
	let labelEnd = 0;
	const samples: { input: string; output: string }[] = [];
	for (const line of lines) {
		const clean = line.replace(/\r?\n$/, '');
		const boundary = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(clean);
		if (fence) {
			if (boundary && boundary[1][0] === fence.char && boundary[1].length >= fence.length && !boundary[2].trim()) {
				const content = stem.slice(fence.start, offset);
				const spans = [{ start: fence.labelStart, end: fence.labelEnd }, { start: fence.opening, end: offset + line.length }];
				if (fence.kind === 'input') { if (input !== undefined) { malformed = true; } input = content; inputRanges = spans; }
				else if (fence.kind === 'output') { if (input === undefined || !inputRanges) { malformed = true; } else { samples.push({ input, output: content }); ranges.push(...inputRanges, ...spans); input = undefined; inputRanges = undefined; } }
				fence = undefined; kind = undefined;
			}
		} else if (boundary) { fence = { char: boundary[1][0], length: boundary[1].length, opening: offset, start: offset + line.length, labelStart, labelEnd, kind: area >= 0 ? kind : undefined }; }
		else {
			const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(clean)?.[1];
			// allow-any-unicode-next-line
			if (heading && /^(?:输入输出样例|样例|示例|Samples?|Examples?)(?:\s*\d+)?$/i.test(heading)) { if (input !== undefined) { malformed = true; } kind = undefined; if (area < 0) { area = offset; } }
			// allow-any-unicode-next-line
			const label = clean.replace(/^\s*(?:#{1,6}\s*|>\s*)?/, '').replace(/[:：]\s*$/, '').trim();
			// allow-any-unicode-next-line
			if (/^(?:样例输入|输入样例|Sample Input)\s*\d*$/i.test(label) && area < 0) { area = offset; }
			if (area >= 0) {
				// allow-any-unicode-next-line
				if (/^(?:输入|样例输入|输入样例|Sample Input|Input)\s*\d*$/i.test(label)) { if (input !== undefined || kind === 'input') { malformed = true; } kind = 'input'; labelStart = offset; labelEnd = offset + line.length; }
				// allow-any-unicode-next-line
				else if (/^(?:输出|样例输出|输出样例|Sample Output|Output)\s*\d*$/i.test(label)) { kind = 'output'; labelStart = offset; labelEnd = offset + line.length; }
				else if (heading) { if (input !== undefined) { malformed = true; } kind = undefined; }
			}
		}
		offset += line.length;
		if (samples.length > 100) { throw new Error('lanqiao-too-many-samples'); }
	}
	// Keep unpaired or unfamiliar sample structure entirely readable, rather than pairing tutorial fences.
	if (area < 0 || !samples.length || input !== undefined || fence || malformed) { return { body: stem, samples: [] }; }
	// Remove only paired sample spans. Keep explanations and all unrelated code verbatim.
	let remainder = stem.slice(area);
	for (const range of ranges.sort((left, right) => right.start - left.start)) { remainder = remainder.slice(0, range.start - area) + remainder.slice(range.end - area); }
	// allow-any-unicode-next-line
	remainder = remainder.split(/(?<=\n)/).filter(line => !/^\s*#{1,6}\s+(?:输入输出样例|样例|示例|Samples?|Examples?)(?:\s*\d+)?\s*\r?\n?$/i.test(line)).join('');
	return { body: stem.slice(0, area), ...(remainder.trim() ? { notes: remainder } : {}), samples };
}

function resource(raw: unknown, unit: string): string | undefined {
	if (raw === undefined || raw === null) { return undefined; }
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) { throw new Error('lanqiao-invalid-resource'); }
	return String(raw) + ' ' + unit;
}
function problemMetadata(data: Record<string, unknown>): Pick<ProblemDocument, 'difficulty' | 'tags'> {
	// Lanqiao's DifficultyLevelTag prefers levels 1-15, then falls back to 10/20/30.
	const rawLevel = data.difficulty_level;
	const originalLevel = typeof rawLevel === 'number' && Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 15 ? rawLevel : undefined;
	const coarse = typeof data.difficulty === 'number' && [10, 20, 30].includes(data.difficulty) ? data.difficulty : undefined;
	const level = originalLevel ?? ((rawLevel === undefined || rawLevel === null || rawLevel === 0) && coarse !== undefined ? Math.abs(4 * (coarse / 10 - 4)) : undefined);
	const difficulty = level === undefined ? undefined : {
		// allow-any-unicode-next-line
		label: (level <= 5 ? '易' : level <= 10 ? '中' : '难') + (originalLevel === undefined ? '' : ' LV.' + originalLevel),
		color: level <= 5 ? '#32b03f' : level <= 10 ? '#faac2b' : '#f64600'
	};
	// Optional unfamiliar metadata must not prevent reading the actual statement.
	const tags = Array.isArray(data.tags) && data.tags.length <= 256 && data.tags.every(tag => typeof tag === 'string' && tag.trim() && tag.length <= 200) ? data.tags.map(label => ({ label })) : undefined;
	return { ...(difficulty ? { difficulty } : {}), ...(tags?.length ? { tags } : {}) };
}
export function parseLanqiaoProblem(problem: ProblemRef, raw: unknown, options: ProblemReadOptions): ProblemDocument {
	lanqiaoQuestion(problem, raw);
	if (!options || !['c', 'cpp'].includes(options.family)) { throw new Error('lanqiao-source-family'); }
	const data = lanqiaoObject(raw), title = text(data.name, 2048), stem = text(data.question_stem, 2 * 1024 * 1024);
	if (!title.trim() || !Array.isArray(data.limit_details) || data.limit_details.length > 32) { throw new Error('lanqiao-invalid-problem'); }
	const matching = data.limit_details.map(lanqiaoObject).filter(value => value.language === (options.family === 'cpp' ? 'C++' : 'C'));
	if (matching.length > 1) { throw new Error('lanqiao-invalid-limits'); }
	const limits: { label: string; value: string }[] = [];
	if (matching[0]) {
		const time = resource(matching[0].max_runtime_seconds, 's'), memory = resource(matching[0].max_runtime_memory_mb, 'MB');
		if (time !== undefined) { limits.push({ label: 'Time Limit', value: time }); }
		if (memory !== undefined) { limits.push({ label: 'Memory Limit', value: memory }); }
	}
	const sample = sampleSections(stem);
	return { ref: problem, title, bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: sample.body }, ...(sample.notes ? [{ format: 'markdown' as const, kind: 'notes' as const, content: sample.notes }] : [])] }], samples: sample.samples, limits, ...problemMetadata(data), interactive: false };
}

async function syntax(source: string): Promise<AnyNode[]> {
	if (source.length > 4 * 1024 * 1024) { throw new Error('lanqiao-script-too-large'); }
	const stack: unknown[] = [(await import('acorn')).parse(source, { ecmaVersion: 'latest' })], result: AnyNode[] = [];
	while (stack.length) {
		const raw = stack.pop();
		if (!raw || typeof raw !== 'object') { continue; }
		if (Array.isArray(raw)) { stack.push(...raw); continue; }
		const node = raw as AnyNode;
		if (!node.type) { continue; }
		result.push(node);
		if (result.length > 800000) { throw new Error('lanqiao-script-too-large'); }
		for (const value of Object.values(node)) { if (value && typeof value === 'object') { stack.push(value); } }
	}
	return result;
}
function key(node: Pick<Property, 'computed' | 'kind' | 'key'>): string | undefined { return !node.computed && node.kind === 'init' ? node.key.type === 'Identifier' ? node.key.name : node.key.type === 'Literal' ? String(node.key.value) : undefined : undefined; }
function field(node: ObjectExpression, name: string): AnyNode | undefined {
	const found = node.properties.filter((item): item is Property => item.type === 'Property' && key(item) === name);
	if (found.length !== 1) { throw new Error('lanqiao-language-config-changed'); }
	return found[0].value;
}
function literal(node: AnyNode | undefined): string {
	if (node?.type !== 'Literal' || typeof node.value !== 'string' || !node.value || node.value.length > 200 || /[\u0000-\u001f]/.test(node.value)) { throw new Error('lanqiao-language-config-changed'); }
	return node.value;
}
export async function parseLanqiaoLanguages(source: string): Promise<readonly LanguageOption[]> {
	const found = (await syntax(source)).filter((node): node is Property => node.type === 'Property' && key(node) === 'availableLanguages');
	if (found.length !== 1) { throw new Error('lanqiao-language-config-changed'); }
	const fn = found[0].value;
	if (fn.type !== 'FunctionExpression' || fn.params.length || fn.body.body.length !== 1 || fn.body.body[0].type !== 'ReturnStatement' || fn.body.body[0].argument?.type !== 'ArrayExpression') { throw new Error('lanqiao-language-config-changed'); }
	const elements = fn.body.body[0].argument.elements;
	if (!elements.length || elements.length > 32) { throw new Error('lanqiao-language-config-changed'); }
	const languages: LanguageOption[] = [];
	for (const item of elements) {
		if (item?.type !== 'ObjectExpression') { throw new Error('lanqiao-language-config-changed'); }
		const id = literal(field(item, 'value'));
		if (id !== 'c' && id !== 'cpp') { continue; }
		const label = literal(field(item, 'label'));
		// allow-any-unicode-next-line
		if (label !== (id === 'cpp' ? 'C++（g++17）' : 'C（gcc8.3.0）')) { throw new Error('lanqiao-language-config-changed'); }
		languages.push({ id, family: id, label });
	}
	if (languages.length !== 2 || new Set(languages.map(value => value.id)).size !== 2) { throw new Error('lanqiao-language-config-changed'); }
	return languages;
}
export function lanqiaoAssets(html: string): { base: string; runtime: string; application: string } {
	if (html.length > 4 * 1024 * 1024) { throw new Error('lanqiao-script-too-large'); }
	const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="(https:\/\/assets\.lanqiao\.cn\/lanqiao-fe\/v\d+\.\d+\.\d+\/dist\/[a-f0-9]{7}\.js)"[^>]*>/g)].map(match => match[1]);
	if (scripts.length < 3 || scripts.length > 64 || new Set(scripts.map(url => new URL('.', url).href)).size !== 1) { throw new Error('lanqiao-language-config-changed'); }
	return { base: new URL('.', scripts[0]).href, runtime: scripts[0], application: scripts.at(-2)! };
}
export async function lanqiaoCatalogueAsset(runtime: string, application: string, base: string): Promise<string> {
	if (!/^https:\/\/assets\.lanqiao\.cn\/lanqiao-fe\/v\d+\.\d+\.\d+\/dist\/$/.test(base)) { throw new Error('lanqiao-asset-target'); }
	const routes = (await syntax(application)).filter((node): node is ObjectExpression => node.type === 'ObjectExpression' && node.properties.some(item => item.type === 'Property' && key(item) === 'path' && item.value.type === 'Literal' && item.value.value === '/problems/:id/learning'));
	if (routes.length !== 1 || literal(field(routes[0], 'name')) !== 'problems-id-learning') { throw new Error('lanqiao-language-config-changed'); }
	const component = field(routes[0], 'component');
	if (!component || !application.slice(component.start, component.end).match(/\.e\(85\)/)) { throw new Error('lanqiao-language-config-changed'); }
	const maps = (await syntax(runtime)).filter(node => node.type === 'BinaryExpression' && node.operator === '+' && node.right.type === 'Literal' && node.right.value === '.js' && node.left.type === 'BinaryExpression' && node.left.right.type === 'MemberExpression' && node.left.right.object.type === 'ObjectExpression');
	if (maps.length !== 1) { throw new Error('lanqiao-language-config-changed'); }
	const expression = maps[0];
	if (expression.type !== 'BinaryExpression' || expression.left.type !== 'BinaryExpression' || expression.left.right.type !== 'MemberExpression' || expression.left.right.object.type !== 'ObjectExpression') { throw new Error('lanqiao-language-config-changed'); }
	const hash = literal(field(expression.left.right.object, '85'));
	if (!/^[a-f0-9]{7}$/.test(hash)) { throw new Error('lanqiao-language-config-changed'); }
	return base + hash + '.js';
}

export function lanqiaoExecution(raw: unknown, questionId: string): { id: string; url: string } {
	if (typeof raw !== 'string' || !/^[1-9]\d{0,7}$/.test(questionId)) { throw new Error('lanqiao-execution-url'); }
	const prefix = 'https://opcenter.lanqiao.cn/api/v1/evaluation/questions/' + questionId + '/submissions/';
	if (!raw.startsWith(prefix) || !/^[0-9a-f]{24}\/\?is_submit=true&judge_client=2$/.test(raw.slice(prefix.length))) { throw new Error('lanqiao-execution-url'); }
	return { id: raw.slice(prefix.length, prefix.length + 24), url: raw };
}
const terminal = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE', 'OLE', 'PE', 'IE']);
export function parseLanqiaoRecord(record: RecordRef, raw: unknown): RecordSnapshot {
	if (lanqiaoRecord(record.problem, record.id).url !== record.url) { throw new Error('lanqiao-invalid-record'); }
	const data = lanqiaoObject(raw);
	if (data.submission_id !== record.id || data.problem_id !== Number(record.problem.nativeId) || data.language !== 'c' && data.language !== 'cpp') { throw new Error('lanqiao-record-mismatch'); }
	const rawStatus = data.status === undefined ? 'Unknown' : text(data.status, 200);
	const phase = terminal.has(rawStatus) ? 'finished' : /^(?:Queued|Pending|Waiting)$/.test(rawStatus) ? 'queued' : /^(?:Compiling|Judging|Running)$/.test(rawStatus) ? 'judging' : 'unknown';
	const source = data.content === undefined ? undefined : text(data.content, 1024 * 1024);
	const time = rawStatus === 'CE' ? undefined : resource(data.elapsed_time, 'ms'), memory = rawStatus === 'CE' ? undefined : resource(data.memory, 'kb');
	const summary = typeof data.pass_sample === 'string' ? /^(\d+)\s*\/\s*(\d+)$/.exec(data.pass_sample) : undefined;
	const diagnostic = rawStatus === 'CE' && data.error_info && typeof data.error_info === 'object' ? lanqiaoObject(data.error_info).error_msg : undefined;
	return {
		// allow-any-unicode-next-line
		ref: record, phase, rawStatus, language: data.language === 'cpp' ? 'C++（g++17）' : 'C（gcc8.3.0）', sourceVerification: source === undefined ? 'unavailable' : 'not-checked',
		...(source === undefined ? {} : { source, codeLength: Buffer.byteLength(source, 'utf8') + ' B' }), ...(time === undefined ? {} : { time }), ...(memory === undefined ? {} : { memory }),
		...(typeof data.problem_name === 'string' ? { problemTitle: text(data.problem_name, 2048) } : {}),
		...(typeof data.created_at === 'string' ? { submittedAt: text(data.created_at, 200) } : {}),
		...(summary && Number(summary[2]) > 0 && Number(summary[1]) <= Number(summary[2]) && Number(summary[2]) <= 1000000 ? { testCaseSummary: { passed: Number(summary[1]), total: Number(summary[2]) } } : {}),
		...(rawStatus === 'CE' ? { compileSucceeded: false, ...(typeof diagnostic === 'string' ? { compileMessage: text(diagnostic, 1024 * 1024) } : {}) } : {})
	};
}
export interface LanqiaoReportProjection { readonly rows: string[][] }
export function projectLanqiaoReport(raw: unknown): LanqiaoReportProjection {
	const data = lanqiaoObject(raw);
	if (data.test_cases === undefined || data.test_cases === null) { return { rows: [] }; }
	if (!Array.isArray(data.test_cases) || data.test_cases.length > 1024) { throw new Error('lanqiao-invalid-report'); }
	return {
		rows: data.test_cases.map((raw, index) => {
			const point = lanqiaoObject(raw);
			return [String(index + 1), point.status === true ? 'AC' : typeof point.status === 'string' ? text(point.status, 200) : 'Unknown', resource(point.millisecond, 'ms') ?? '', resource(point.memory, 'kb') ?? ''];
		})
	};
}
