/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, LanguageOption, RecordRef, RecordSnapshot } from 'becoder-oj-connect';
import type { AnyNode } from 'acorn';
import { decodeAtCoderHTML } from '../common/atcoderSubmission.js';

export const codeforcesOrigin = 'https://codeforces.com';
interface Element { tag: string; attrs: Record<string, string>; children: (Element | string)[]; closed?: boolean }
const classes = (node: Element, name: string) => (node.attrs.class ?? '').split(/\s+/).includes(name);
function elements(node: Element, predicate: (element: Element) => boolean): Element[] {
	const result: Element[] = [], stack = [node];
	while (stack.length) { const current = stack.pop()!; if (predicate(current)) { result.push(current); } for (const child of [...current.children].reverse()) { if (typeof child !== 'string') { stack.push(child); } } }
	return result;
}
function content(node: Element): string { return node.children.map(child => typeof child === 'string' ? child : ['script', 'style'].includes(child.tag) ? '' : child.tag === 'br' ? '\n' : content(child) + (['pre', 'div', 'p'].includes(child.tag) ? '\n' : '')).join(''); }
const plain = (node: Element) => content(node).replace(/\s+/g, ' ').trim();
/** Bounded inert HTML tokenizer. Script/textarea bodies are raw text, never executed. */
function document(html: string): Element {
	if (html.length > 4 * 1024 * 1024) { throw new Error('codeforces-response-too-large'); }
	if (/<title[^>]*>\s*(?:Just a moment|Attention Required)|<form\b[^>]*\bid=["']challenge-form["']/i.test(html)) { throw new Error('codeforces-browser-verification-required'); }
	const root: Element = { tag: '', attrs: {}, children: [] }, stack = [root];
	const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</gi;
	let count = 0;
	for (let token; (token = tokens.exec(html));) {
		if (++count > 100000 || stack.length > 128) { throw new Error('codeforces-html-too-complex'); }
		const raw = token[0], parent = stack[stack.length - 1];
		if (raw.startsWith('<!')) { continue; }
		if (raw.startsWith('</')) { const tag = /^<\/([a-z0-9-]+)/i.exec(raw)?.[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) { if (stack[i].tag === tag) { stack[i].closed = true; stack.length = i; break; } } continue; }
		const open = /^<([a-z0-9-]+)\b/i.exec(raw);
		if (!open) { parent.children.push(decodeAtCoderHTML(raw)); continue; }
		const tag = open[1].toLowerCase(), attrs: Record<string, string> = Object.create(null);
		for (const attr of raw.slice(open[0].length, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
			const name = attr[1].toLowerCase(); if (Object.hasOwn(attrs, name)) { throw new Error('codeforces-duplicate-attribute'); } attrs[name] = decodeAtCoderHTML(attr[2] ?? attr[3] ?? attr[4] ?? '');
		}
		const node: Element = { tag, attrs, children: [] }; parent.children.push(node);
		if (['script', 'style', 'textarea'].includes(tag)) {
			const close = new RegExp('</' + tag + '\\s*>', 'gi'); close.lastIndex = tokens.lastIndex; const end = close.exec(html); if (!end) { throw new Error('codeforces-incomplete-html'); }
			const value = html.slice(tokens.lastIndex, end.index); node.children.push(tag === 'textarea' ? decodeAtCoderHTML(value.replace(/^\r?\n/, '')) : value); tokens.lastIndex = close.lastIndex;
		} else if (!['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tag) && !raw.endsWith('/>')) { stack.push(node); }
	}
	return root;
}
function account(root: Element): string | undefined {
	const header = elements(root, node => node.attrs.id === 'header')[0];
	if (!header) { throw new Error('codeforces-account-unknown'); }
	const chooser = elements(header, node => classes(node, 'lang-chooser'))[0] ?? header;
	const owners = elements(chooser, node => node.tag === 'a' && /^\/profile\/[A-Za-z0-9_.-]{3,24}$/.test(node.attrs.href ?? '')).map(node => node.attrs.href.slice('/profile/'.length));
	if (new Set(owners).size === 1) { return owners[0]; }
	if (!owners.length && elements(header, node => node.tag === 'a' && /^\/enter(?:\?|$)/.test(node.attrs.href ?? '')).length && elements(header, node => node.tag === 'a' && /^\/register(?:\?|$)/.test(node.attrs.href ?? '')).length) { return undefined; }
	throw new Error('codeforces-account-unknown');
}
export function codeforcesAccount(html: string): string | undefined { return account(document(html)); }
export function codeforcesProblemParts(problem: ProblemRef): { contest: string; index: string } {
	const match = /^([1-9]\d{0,5})\/([A-Z][A-Z0-9]*)$/.exec(problem.nativeId);
	if (problem.site !== 'codeforces' || !match || problem.url !== codeforcesOrigin + '/contest/' + match[1] + '/problem/' + match[2]) { throw new Error('codeforces-invalid-problem'); }
	return { contest: match[1], index: match[2] };
}
export function codeforcesRecord(problem: ProblemRef, id: string): RecordRef {
	const { contest } = codeforcesProblemParts(problem); if (!/^[1-9]\d{0,15}$/.test(id)) { throw new Error('codeforces-invalid-record'); }
	return { problem, id, url: codeforcesOrigin + '/contest/' + contest + '/submission/' + id };
}
export interface CodeforcesForm { ownerKey: string; action: string; csrf: string; fields: URLSearchParams; languages: readonly LanguageOption[] }
function completeDocument(root: Element): void {
	const html = elements(root, node => node.tag === 'html'), body = elements(root, node => node.tag === 'body');
	if (html.length !== 1 || body.length !== 1 || !html[0].closed || !body[0].closed) { throw new Error('codeforces-incomplete-document'); }
}
function compilerOptions(form: Element): LanguageOption[] {
	const languageSelect = elements(form, node => node.tag === 'select' && node.attrs.name === 'programTypeId')[0];
	const languages: LanguageOption[] = [];
	for (const option of languageSelect ? elements(languageSelect, node => node.tag === 'option') : []) {
		const label = plain(option), id = option.attrs.value;
		const family = /(?:G\+\+|C\+\+|Clang\+\+)/i.test(label) ? 'cpp' : /\b(?:GNU GCC C|GNU C|Clang C|C\d)/i.test(label) ? 'c' : undefined;
		if (family && /^\d{1,5}$/.test(id) && label.length <= 200 && !Object.hasOwn(option.attrs, 'disabled')) { languages.push({ id, label, family }); }
	}
	if (!languages.length || languages.length > 100 || new Set(languages.map(value => value.id)).size !== languages.length) { throw new Error('codeforces-language-unavailable'); }
	return languages;
}
/** A compiler catalogue does not confer a send permit or require submit-token initialization. */
export function parseCodeforcesLanguages(problem: ProblemRef, html: string): { ownerKey: string; languages: readonly LanguageOption[] } {
	const { contest, index } = codeforcesProblemParts(problem), root = document(html), ownerKey = account(root);
	if (!ownerKey) { throw new Error('codeforces-login-required'); }
	completeDocument(root);
	const sidebar = elements(root, node => node.attrs.id === 'sidebar')[0];
	const contestTable = sidebar && elements(sidebar, node => node.tag === 'table' && elements(node, item => item.tag === 'a' && item.attrs.href === '/contest/' + contest).length > 0)[0];
	if (!contestTable || !elements(contestTable, node => classes(node, 'contest-state-phase') && plain(node) === 'Finished').length || !elements(contestTable, node => classes(node, 'contest-state-regular') && plain(node) === 'Practice').length) { throw new Error('codeforces-practice-unavailable'); }
	const forms = elements(root, node => node.tag === 'form' && classes(node, 'submit-form'));
	if (forms.length !== 1 || !forms[0].closed) { throw new Error('codeforces-incomplete-form'); }
	const form = forms[0], action = new URL(form.attrs.action ?? '', codeforcesOrigin + '/contest/' + contest + '/submit');
	if (form.attrs.method?.toLowerCase() !== 'post' || action.origin !== codeforcesOrigin || action.pathname !== '/contest/' + contest + '/submit' || action.username || action.password || action.hash || [...action.searchParams.keys()].some(key => key !== 'csrf_token')) { throw new Error('codeforces-form-action'); }
	const identities = elements(form, node => node.tag === 'input' && node.attrs.name === 'contestId');
	const problemSelects = elements(form, node => node.tag === 'select' && node.attrs.name === 'submittedProblemIndex');
	const languageSelects = elements(form, node => node.tag === 'select' && node.attrs.name === 'programTypeId');
	if (identities.length !== 1 || identities[0].attrs.value !== contest || problemSelects.length !== 1 || !problemSelects[0].closed || languageSelects.length !== 1 || !languageSelects[0].closed || Object.hasOwn(languageSelects[0].attrs, 'disabled')) { throw new Error('codeforces-form-identity'); }
	const indices = elements(problemSelects[0], node => node.tag === 'option'), selected = indices.filter(node => Object.hasOwn(node.attrs, 'selected'));
	if (selected.length > 1 || (selected[0] ?? indices[0])?.attrs.value !== index) { throw new Error('codeforces-form-identity'); }
	return { ownerKey, languages: compilerOptions(form) };
}
function submissionForm(problem: ProblemRef, root: Element): { form: Element; fields: URLSearchParams; csrf: string; action: URL } {
	const { contest, index } = codeforcesProblemParts(problem);
	const forms = elements(root, node => node.tag === 'form' && classes(node, 'submit-form'));
	if (forms.length !== 1) { throw new Error('codeforces-submit-form-missing'); }
	const form = forms[0], fields = new URLSearchParams();
	if (!form.closed) { throw new Error('codeforces-incomplete-form'); }
	for (const node of elements(form, node => ['input', 'select', 'textarea'].includes(node.tag))) {
		const name = node.attrs.name; if (!name || Object.hasOwn(node.attrs, 'disabled') || ['submit', 'button', 'reset'].includes(node.attrs.type) || ['checkbox', 'radio'].includes(node.attrs.type) && !Object.hasOwn(node.attrs, 'checked')) { continue; }
		if (fields.has(name)) { throw new Error('codeforces-duplicate-field'); }
		const options = node.tag === 'select' ? elements(node, item => item.tag === 'option') : [];
		const selected = options.find(item => Object.hasOwn(item.attrs, 'selected')) ?? options[0];
		fields.set(name, node.tag === 'textarea' ? content(node) : node.tag === 'select' ? selected?.attrs.value ?? '' : node.attrs.type === 'file' ? '' : node.attrs.value ?? '');
	}
	const csrf = fields.get('csrf_token') ?? '', action = new URL(form.attrs.action ?? '', codeforcesOrigin + '/contest/' + contest + '/submit');
	if (form.attrs.method?.toLowerCase() !== 'post' || action.origin !== codeforcesOrigin || action.pathname !== '/contest/' + contest + '/submit' || action.hash || !csrf || action.searchParams.get('csrf_token') !== csrf || [...action.searchParams.keys()].some(key => key !== 'csrf_token')) { throw new Error('codeforces-form-action'); }
	if (fields.get('action') !== 'submitSolutionFormSubmitted' || fields.get('contestId') !== contest || fields.get('submittedProblemIndex') !== index) { throw new Error('codeforces-form-identity'); }
	return { form, fields, csrf, action };
}
/** Only a complete response for this account and form can prove the source was rejected. */
export function isCodeforcesDuplicateRejection(problem: ProblemRef, ownerKey: string, html: string): boolean {
	try {
		const root = document(html); completeDocument(root);
		if (account(root) !== ownerKey) { return false; }
		const { form } = submissionForm(problem, root);
		return elements(form, node => classes(node, 'error') && classes(node, 'for__source')).some(node => /^You have submitted exactly the same code before[.!]?$/i.test(plain(node)));
	} catch { return false; }
}
export async function parseCodeforcesForm(problem: ProblemRef, html: string): Promise<CodeforcesForm> {
	const { contest, index } = codeforcesProblemParts(problem), root = document(html), ownerKey = account(root);
	if (!ownerKey) { throw new Error('codeforces-login-required'); }
	completeDocument(root);
	const sidebar = elements(root, node => node.attrs.id === 'sidebar')[0];
	const contestTable = sidebar && elements(sidebar, node => node.tag === 'table' && elements(node, item => item.tag === 'a' && item.attrs.href === '/contest/' + contest).length > 0)[0];
	if (!contestTable || !elements(contestTable, node => classes(node, 'contest-state-phase') && plain(node) === 'Finished').length || !elements(contestTable, node => classes(node, 'contest-state-regular') && plain(node) === 'Practice').length) { throw new Error('codeforces-practice-unavailable'); }
	const { form, fields, csrf, action } = submissionForm(problem, root);
	if (fields.get('source')) { throw new Error('codeforces-form-identity'); }
	const languages = compilerOptions(form);
	const literals = new Map<string, string>(); let outputOnly: readonly string[] | undefined;
	for (const script of elements(root, node => node.tag === 'script' && !node.attrs.src)) {
		const source = content(script); if (!/window\._(?:ftaa|bfaa)|\boutputOnlyIndices\b/.test(source)) { continue; }
		const ast = (await import('acorn')).parse(source, { ecmaVersion: 'latest' }), stack: unknown[] = [ast]; let count = 0;
		while (stack.length) {
			const value = stack.pop(); if (!value || typeof value !== 'object') { continue; } if (++count > 100000) { throw new Error('codeforces-script-too-complex'); }
			if (Array.isArray(value)) { stack.push(...value); continue; }
			const node = value as AnyNode;
			if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.id.name === 'outputOnlyIndices') {
				if (node.init?.type !== 'ArrayExpression' || node.init.elements.length > 500 || node.init.elements.some(item => item?.type !== 'Literal' || typeof item.value !== 'string' || !/^[A-Z][A-Z0-9]*$/.test(item.value))) { throw new Error('codeforces-task-type-unknown'); }
				const indices = node.init.elements.map(item => (item as { value: string }).value);
				if (outputOnly && JSON.stringify(outputOnly) !== JSON.stringify(indices)) { throw new Error('codeforces-task-type-unknown'); } outputOnly = indices;
			}
			if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'MemberExpression' && !node.left.computed && node.left.object.type === 'Identifier' && node.left.object.name === 'window' && node.left.property.type === 'Identifier' && ['_ftaa', '_bfaa'].includes(node.left.property.name)) {
				if (node.right.type !== 'Literal' || typeof node.right.value !== 'string' || !node.right.value || node.right.value.length > 1024 || literals.has(node.left.property.name) && literals.get(node.left.property.name) !== node.right.value) { throw new Error('codeforces-nonliteral-token'); }
				literals.set(node.left.property.name, node.right.value);
			}
			stack.push(...Object.values(value));
		}
	}
	for (const key of ['_ftaa', '_bfaa']) { const value = literals.get(key); if (!value) { throw new Error('codeforces-literal-token-missing'); } fields.set(key.slice(1), value); }
	if (!outputOnly) { throw new Error('codeforces-task-type-unknown'); }
	if (outputOnly.includes(index) || classes(form, 'output-only')) { throw new Error('codeforces-output-only-unsupported'); }
	return { ownerKey, action: action.href, csrf, fields, languages };
}
export interface CodeforcesRow { id: string; problemURL: string; owner: string; language: string; title: string; rawStatus: string; waiting: boolean; submittedAt?: string; time?: string; memory?: string }
export interface CodeforcesList { ownerKey: string; csrf: string; rows: readonly CodeforcesRow[]; rowsByTable: readonly (readonly CodeforcesRow[])[]; nextPage?: number }
export function parseCodeforcesList(problem: ProblemRef, html: string, page = 1): CodeforcesList {
	const { contest } = codeforcesProblemParts(problem), root = document(html), ownerKey = account(root);
	if (!ownerKey) { throw new Error('codeforces-login-required'); }
	completeDocument(root);
	const tables = elements(root, node => node.tag === 'table' && classes(node, 'status-frame-datatable'));
	if (!tables.length) { throw new Error('codeforces-list-missing'); }
	const rowsByTable: CodeforcesRow[][] = [];
	// The official page may split practice and original contest submissions into separate tables.
	for (const table of tables) {
		const rows: CodeforcesRow[] = []; rowsByTable.push(rows);
		if (!table.closed) { throw new Error('codeforces-incomplete-list'); }
		const headers = elements(table, node => node.tag === 'th').map(plain);
		if (headers.length < 8 || headers[0] !== '#' || !/^When$/i.test(headers[1]) || !/^Who$/i.test(headers[2]) || !/^Problem$/i.test(headers[3]) || !/^Lang(?:uage)?$/i.test(headers[4]) || !/^Verdict$/i.test(headers[5])) { throw new Error('codeforces-list-structure'); }
		let previous: bigint | undefined;
		const items = elements(table, node => node.tag === 'tr' && Object.hasOwn(node.attrs, 'data-submission-id'));
		for (const row of items) {
			const id = row.attrs['data-submission-id'], cells = row.children.filter((node): node is Element => typeof node !== 'string' && node.tag === 'td');
			if (!/^[1-9]\d{0,15}$/.test(id) || cells.length !== headers.length) { throw new Error('codeforces-list-row'); }
			if (previous !== undefined && BigInt(id) >= previous) { throw new Error('codeforces-list-order'); } previous = BigInt(id);
			const owners = elements(cells[2], node => node.tag === 'a' && (node.attrs.href ?? '').startsWith('/profile/'));
			if (owners.length !== 1 || owners[0].attrs.href !== '/profile/' + ownerKey) { throw new Error('codeforces-list-owner'); }
			const links = elements(cells[3], node => node.tag === 'a' && /^\/(?:contest\/\d+\/problem\/|problemset\/problem\/\d+\/)/.test(node.attrs.href ?? ''));
			if (links.length !== 1) { throw new Error('codeforces-list-problem'); }
			const problemURL = new URL(links[0].attrs.href, codeforcesOrigin).href;
			const waiting = elements(cells[5], node => node.attrs.waiting === 'true').length > 0;
			rows.push({ id, owner: ownerKey, problemURL, language: plain(cells[4]), title: plain(cells[3]), rawStatus: plain(cells[5]), waiting, submittedAt: plain(cells[1]) || undefined, time: /^Time$/i.test(headers[6]) ? plain(cells[6]) || undefined : undefined, memory: /^Memory$/i.test(headers[7]) ? plain(cells[7]) || undefined : undefined });
		}
		if (!items.length && !elements(table, node => node.tag === 'td' && node.attrs.colspan === String(headers.length) && plain(node) === 'No items').length) { throw new Error('codeforces-empty-list-unverified'); }
	}
	const rows = rowsByTable.flat();
	if (rows.length > 100 || new Set(rows.map(row => row.id)).size !== rows.length) { throw new Error('codeforces-list-order'); }
	rows.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
	const csrf = elements(root, node => node.tag === 'meta' && node.attrs.name === 'X-Csrf-Token')[0]?.attrs.content;
	if (!csrf) { throw new Error('codeforces-list-token'); }
	const pages = elements(root, node => node.tag === 'a').flatMap(node => { const match = new RegExp('^/contest/' + contest + '/my/page/(\\d+)$').exec(node.attrs.href ?? ''); return match ? [Number(match[1])] : []; });
	return { ownerKey, csrf, rows, rowsByTable, ...(pages.some(value => value > page) ? { nextPage: page + 1 } : {}) };
}
export function sameCodeforcesCompiler(formLabel: string, listLabel: string): boolean {
	if (formLabel === listLabel) { return true; }
	// The native 2026-11-18 submissions verified this legacy compiler's abbreviated list label.
	if (formLabel === 'GNU G++17 7.3.0' && listLabel === 'C++17 (GCC 7-32)') { return true; }
	// The official form and list use different labels: GNU G++20 13.2 (64 bit, winlibs) / C++20 (GCC 13-64).
	const form = /^GNU G\+\+(\d+)\s+(\d+)(?:\.\d+)*\s*\((32|64) bit(?:, ([^)]+))?\)$/i.exec(formLabel);
	const list = /^C\+\+(\d+)\s*\(GCC (\d+)-(32|64)(?:, ([^)]+))?\)$/i.exec(listLabel);
	if (form && list) { return form.slice(1, 4).join('/') === list.slice(1, 4).join('/') && (!list[4] || form[4] === list[4]); }
	const c = /^GNU GCC C(\d+)\s+(\d+)(?:\.\d+)*$/.exec(formLabel), lc = /^C(\d+)\s*\(GCC (\d+)(?:\.\d+)*\)$/.exec(listLabel);
	return !!c && !!lc && c[1] === lc[1] && c[2] === lc[2];
}
export function codeforcesObject(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('codeforces-response-invalid'); } return value as Record<string, unknown>; }
function flag(value: unknown): boolean | undefined { return value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined; }
function safeText(value: unknown): string { return typeof value === 'string' ? content(document(value)).trim().slice(0, 524288) : ''; }
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : typeof value === 'string' && /^\d{1,12}$/.test(value) ? Number(value) : undefined;
/** Prefer terminal list resources; missing/zero memory can use the peak of available detail tests. */
export function codeforcesResources(snapshot: Pick<RecordSnapshot, 'ref' | 'phase' | 'rawStatus' | 'groups'>, row?: CodeforcesRow): Pick<RecordSnapshot, 'time' | 'memory'> {
	const { contest, index } = codeforcesProblemParts(snapshot.ref.problem);
	if (snapshot.phase !== 'finished' || /^Compilation error$/i.test(snapshot.rawStatus)) { return {}; }
	const terminalRow = row && row.id === snapshot.ref.id && !row.waiting && row.rawStatus.toLowerCase() === snapshot.rawStatus.toLowerCase() && [snapshot.ref.problem.url, codeforcesOrigin + '/problemset/problem/' + contest + '/' + index].includes(row.problemURL) ? row : undefined;
	const time = terminalRow?.time && /^\d{1,12}\s+ms$/i.test(terminalRow.time) ? terminalRow.time : undefined;
	let memory = terminalRow?.memory && /^\d{1,12}\s+KB$/i.test(terminalRow.memory) ? terminalRow.memory : undefined;
	if (memory === undefined || Number.parseInt(memory, 10) === 0) {
		let peak: number | undefined;
		for (const group of snapshot.groups ?? []) {
			for (const test of group.rows) {
				// The detail parser keeps exact bytes so small values are not rounded to zero.
				const match = /^(\d{1,16}) B$/.exec(test[3] ?? '');
				const bytes = match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : undefined;
				if (bytes !== undefined) { peak = Math.max(peak ?? 0, bytes); }
			}
		}
		if (peak !== undefined && (peak > 0 || memory === undefined)) { memory = peak + ' B'; }
	}
	return { time, memory };
}
export function parseCodeforcesRecord(record: RecordRef, raw: unknown, row?: CodeforcesRow): RecordSnapshot {
	const data = codeforcesObject(raw), waiting = flag(data.waiting), ce = flag(data.compilationError), rawStatus = safeText(data.verdict).replace(/\s+/g, ' ').trim();
	const titlePrefix = record.problem.nativeId.split('/')[1] + ' - ';
	if (!rawStatus || rawStatus.length > 500 || waiting === undefined || ce === undefined || typeof data.source === 'string' && data.source.length > 1048576) { throw new Error('codeforces-record-incomplete'); }
	const terminal = /^(?:Accepted|Wrong answer(?: on (?:test|pretest) \d+)?|Compilation error|(?:Time|Memory|Idleness) limit exceeded(?: on (?:test|pretest) \d+)?|Runtime error(?: on (?:test|pretest) \d+)?|Presentation error(?: on (?:test|pretest) \d+)?|Skipped|Rejected|Failed|Partial(?:.*))$/i.test(rawStatus);
	const phase = waiting ? /^(?:In queue|Queue|Pending)$/i.test(rawStatus) ? 'queued' : 'judging' : terminal ? 'finished' : 'unknown';
	const rows: string[][] = [];
	if (!ce) {
		const indices = Object.keys(data).filter(key => /^verdict#[1-9]\d{0,3}$/.test(key)).map(key => Number(key.slice(8))).sort((a, b) => a - b);
		if (indices.length > 1024) { throw new Error('codeforces-too-many-tests'); }
		for (const i of indices) {
			const time = integer(data['timeConsumed#' + i]), memory = integer(data['memoryConsumed#' + i]), exit = data['exitCode#' + i];
			const exitCode = typeof exit === 'number' && Number.isSafeInteger(exit) ? exit : typeof exit === 'string' && /^-?\d{1,12}$/.test(exit) ? Number(exit) : undefined;
			rows.push([String(i), safeText(data['verdict#' + i]).slice(0, 500), time === undefined ? '' : time + ' ms', memory === undefined ? '' : memory + ' B', ...(exitCode === undefined ? [] : ['Exit with code ' + exitCode])]);
		}
	}
	const groups = rows.length ? [{ name: 'Test Cases', rows }] : undefined;
	return { ref: record, rawStatus, phase, sourceVerification: typeof data.source === 'string' ? 'not-checked' : 'unavailable', ...(typeof data.source === 'string' ? { source: data.source } : {}), ...(row ? { language: row.language, problemTitle: row.title.startsWith(titlePrefix) ? row.title.slice(titlePrefix.length) : row.title, submittedAt: row.submittedAt } : {}), ...codeforcesResources({ ref: record, rawStatus, phase, groups }, row), ...(ce ? { compileSucceeded: false, compileMessage: safeText(data.submissionProtocol) } : {}), ...(groups ? { groups } : {}), ...(waiting ? { pollAfterMs: 2000 } : {}) };
}
