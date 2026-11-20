/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loginContent } from '../src/views/loginContent.ts';
const require = createRequire(import.meta.url);
const { defaultLanguage } = require('../out/preferences.js');
const { compilerCatalogue } = require('../out/compilerCatalogue.js');
const { renderMarkdownTree, renderHtmlTree } = require('../out/markdown.js');
// Exercise the current Webview link bridge with trusted Chromium clicks, without invoking an OS opener.
const preSource = (await readFile('../../src/vs/workbench/contrib/webview/browser/pre/index.html', 'utf8')).replace(/\r\n/g, '\n');
const clickStart = preSource.indexOf('const handleInnerClick = (event) => {');
const clickEnd = preSource.indexOf('\n\t\t};', clickStart);
assert.ok(clickStart >= 0 && clickEnd > clickStart, 'locate the actual Webview click handler');
const linkBridge = `const hostMessaging={postMessage:(type,data)=>window.__defaultLinkOpens.push({type,...data})};${preSource.slice(clickStart, clickEnd + '\n\t\t};'.length)}window.addEventListener('click',handleInnerClick);`;
const output = path.resolve(process.env.BECODER_OJ_CONNECT_RENDER_AUDIT ?? '../../tmp/oj-connect-audit/shared-workflow/render');
await mkdir(output, { recursive: true });
// Match the shipped extension's CommonJS package boundary, outside the root ESM package.
await writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'commonjs' }));
// Exercise the host bundler's lazy module boundary as well as the renderer itself.
const serviceProbe = path.join(output, 'markdown-service.cjs');
await build({ entryPoints: ['src/markdownService.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['./markdown'], outfile: serviceProbe });
await cp('out/markdown.js', path.join(output, 'markdown.js'));
assert.ok(JSON.stringify(await require(serviceProbe).default.renderTree('$a+b$')).includes('katex'));
const translations = JSON.parse(await readFile('l10n/bundle.l10n.zh-cn.json', 'utf8'));
const localizedLabels = (locale) => {
	const Module = require('module'), original = Module._load, modulePath = require.resolve('../out/views/webview.js');
	delete require.cache[modulePath];
	Module._load = function (id, ...args) { return id === 'vscode' ? { l10n: { t: value => locale === 'zh-cn' ? translations[value] ?? value : value } } : original.call(this, id, ...args); };
	try { return require(modulePath).labels(); } finally { Module._load = original; delete require.cache[modulePath]; }
};
const labels = localizedLabels('zh-cn'), englishLabels = localizedLabels('en');
let state;
Object.assign(labels, { status_AC: '答案正确', status_WA: '答案错误', status_CE: '编译错误', status_WJ: '等待评测', status_WR: '等待重新评测' });
labels.status_QLE = '超过询问次数限制';
labels.passedTests = '通过测试点';
labels.status_Judging = '正在评测';
labels.status_Compiling = '正在编译';
const server = createServer(async (req, res) => {
	try {
		if (req.url === '/accounts') {
			const names = { luogu: '洛谷', atcoder: 'AtCoder', nowcoder: '牛客', codeforces: 'Codeforces', lanqiao: '蓝桥' };
			const rows = Object.keys(names).map(site => ({ site, state: site === 'luogu' ? 'signed-in' : site === 'lanqiao' ? 'unavailable' : site === 'codeforces' ? 'unknown' : 'signed-out' }));
			const icons = Object.fromEntries(Object.keys(names).map(site => [site, '/' + site + (site === 'luogu' || site === 'codeforces' ? '.svg' : '.png')]));
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.end(loginContent(rows, names, { 'signed-in': '已登录', 'signed-out': '未登录', unknown: '未检查', unavailable: '未接入' }, icons, '\'self\'', 'fixture').replace('<script nonce="fixture">', '<script nonce="fixture">window.__messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__messages.push(m)});'));
		} else if (/^\/((luogu|codeforces)\.svg|(atcoder|nowcoder|lanqiao)\.png)$/.test(req.url)) {
			res.setHeader('Content-Type', req.url.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
			res.end(await readFile(path.resolve('resources', req.url.slice(1))));
		} else if (req.url === '/') {
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.end(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fixture' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https:; connect-src 'self'; worker-src blob:;"><link rel="stylesheet" href="/katex.min.css"><link rel="stylesheet" href="/webview.css"></head><body><main id="app"></main><script nonce="fixture">window.__OJ_STATE__=${JSON.stringify(state).replace(/</g, '\\u003c')};window.__messages=[];window.__defaultLinkOpens=[];${linkBridge}window.acquireVsCodeApi=()=>({postMessage:m=>{window.__messages.push(m);if(m.uuid && m.data.action==='renderContent'){window.__renderContent(m.data.content,m.data.format).then(data=>window.dispatchEvent(new MessageEvent('message',{data:{uuid:m.uuid,data}})));return;}if(m.uuid){if(m.data.action==='selectLanguage')window.__OJ_STATE__.languageId=m.data.languageId;setTimeout(()=>{window.dispatchEvent(new MessageEvent('message',{data:{type:'state',state:window.__OJ_STATE__}}));window.dispatchEvent(new MessageEvent('message',{data:{uuid:m.uuid}}));},0);}}});</script><script nonce="fixture" src="/webview.js"></script></body></html>`);
		} else {
			const filename = req.url.slice(1);
			if (!/^(webview\.(js|css)|syntax-worker\.js|onig\.wasm|grammars\/[a-f0-9]+\.json|katex\.min\.css|fonts\/[a-zA-Z0-9_.-]+)$/.test(filename)) { res.writeHead(404).end(); return; }
			res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'font/woff2');
			res.end(await readFile(path.resolve('dist', filename)));
		}
	} catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.route('https://**/*', route => route.abort());
	await page.exposeFunction('__renderContent', (content, format) => format === 'markdown' ? renderMarkdownTree(content) : renderHtmlTree(content, state.problem.ref.url));
	await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { if (window.__failCopy) { throw new Error('clipboard unavailable'); } window.__copied = text; } } }); });
	await page.addInitScript(() => {
		const scrollIntoView = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = function (...args) { window.__scrolledTarget = this.id; return scrollIntoView.apply(this, args); };
	});
	const errors = []; page.on('pageerror', error => errors.push(error.message));
	const expectInternalLink = async (link, target, options) => {
		await page.evaluate(() => { window.__messages = []; window.__defaultLinkOpens = []; });
		if (options === 'keyboard') { await link.focus(); await page.keyboard.press('Enter'); }
		else { await link.click(options); }
		assert.deepEqual(await page.evaluate(() => window.__defaultLinkOpens), [], 'OJ links never reach the default external opener bridge');
		assert.deepEqual(await page.evaluate(() => window.__messages.filter(value => value.data?.action !== 'renderContent').map(value => value.data)), [{ action: 'openLink', url: target }], 'one user action dispatches one internal navigation');
		assert.equal(page.url(), url, 'navigation stays delegated to the host');
	};
	for (const problem of [
		{ site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' },
		{ site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' },
		{ site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' },
		{ site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' }
	]) {
		state = { kind: 'problem', sourceName: 'a.cpp', labels, problem: { ref: problem, title: 'Navigation', bodies: [{ locale: 'en', sections: [{ format: 'html', content: '<a href="https://example.org/reference"><span>Nested reference</span></a>' }, { format: 'markdown', content: '<iframe src="https://example.org/embedded"></iframe>' }] }], limits: [], samples: [], interactive: false } };
		await page.goto(url); await page.getByRole('link', { name: 'Nested reference' }).waitFor();
		const title = page.locator('h1 a');
		for (const options of [undefined, { modifiers: ['Control'] }, { modifiers: ['Meta'] }, 'keyboard']) { await expectInternalLink(title, problem.url, options); }
		await expectInternalLink(page.getByRole('link', { name: 'Nested reference' }).locator('span'), 'https://example.org/reference');
		await expectInternalLink(page.locator('a[href="https://example.org/embedded"]'), 'https://example.org/embedded');
		await page.evaluate(() => {
			window.__messages = []; window.__defaultLinkOpens = [];
			const invalid = document.createElement('a'); invalid.href = 'command:workbench.action.openSettings'; invalid.textContent = 'Invalid navigation'; document.getElementById('app').append(invalid);
		});
		await page.getByRole('link', { name: 'Invalid navigation', exact: true }).click();
		assert.deepEqual(await page.evaluate(() => [window.__messages, window.__defaultLinkOpens]), [[], []], 'invalid links are blocked without creating a pending host request');
		await page.evaluate(() => { window.__messages = []; window.__defaultLinkOpens = []; });
		await title.click({ button: 'middle' });
		assert.deepEqual(await page.evaluate(() => [window.__messages, window.__defaultLinkOpens]), [[], []], 'middle click keeps the existing no-navigation behavior');
		await title.click({ button: 'right' });
		assert.deepEqual(await page.evaluate(() => [window.__messages, window.__defaultLinkOpens]), [[], []], 'opening a context menu does not navigate');
		const record = { problem, id: '55', url: problem.site === 'luogu' ? 'https://www.luogu.com.cn/record/55' : problem.site === 'atcoder' ? 'https://atcoder.jp/contests/abc086/submissions/55' : problem.site === 'codeforces' ? 'https://codeforces.com/contest/4/submission/55' : 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=55' };
		state = { kind: 'record', sourceName: 'a.cpp', labels, record, tracking: false, snapshot: { ref: record, phase: 'finished', rawStatus: 'CE', sourceVerification: 'matched', source: 'int main(){}', compileSucceeded: false, compileMessage: 'diagnostic\n'.repeat(80) } };
		await page.goto(url); await page.locator('.record-info').waitFor();
		await expectInternalLink(page.locator('h1 a'), record.url);
		await expectInternalLink(page.locator('.problemNameWithDifficulty'), problem.url);
		await page.setViewportSize({ width: 700, height: 240 });
		await page.locator('.record-info').evaluate(element => { element.style.marginTop = '400px'; });
		const source = page.getByRole('link', { name: labels.viewSource });
		await source.scrollIntoViewIfNeeded();
		const position = await page.evaluate(() => scrollY);
		assert.ok(position > 0, 'source link fixture starts below the top');
		await page.evaluate(() => { window.__messages = []; window.__defaultLinkOpens = []; });
		await source.click();
		assert.equal(await page.evaluate(() => scrollY), position, 'viewing source does not add a scroll-to-top action');
		assert.deepEqual(await page.evaluate(() => window.__messages.map(value => value.data)), [{ action: 'viewSource' }]);
		assert.deepEqual(await page.evaluate(() => window.__defaultLinkOpens), []);
		await page.setViewportSize({ width: 700, height: 700 });
	}
	const cfProblem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	const cfRecord = { problem: cfProblem, id: '55', url: 'https://codeforces.com/contest/4/submission/55' };
	for (const text of [labels, englishLabels]) {
		assert.equal(text.copyFailed, text === labels ? '复制失败，请选择文本后手动复制。' : 'Copy failed. Select the text and copy it manually.');
		for (const record of [
			{ problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, id: '55', url: 'https://www.luogu.com.cn/record/55' },
			{ problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' },
			cfRecord,
			{ problem: { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' }, id: '55', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=55' }
		]) {
			state = { kind: 'record', labels: text, sourceName: 'solution.cpp', record, tracking: false, canRetry: true, message: 'Read failed' };
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.record-verdict').textContent(), text.resultUnavailable, 'a stopped initial read never claims it is still running');
			assert.equal(await page.locator('.spinner').count(), 0);
			assert.equal(await page.getByRole('button', { name: text.continueQuery, exact: true }).count(), 1);
			await page.screenshot({ path: path.join(output, record.problem.site + '-stopped-initial-' + (text === labels ? 'zh' : 'en') + '.png'), fullPage: true });
			state = { ...state, tracking: true, canRetry: false, message: undefined };
			await page.goto(url); await page.locator('.record-verdict .spinner').waitFor();
			assert.equal(await page.locator('.record-verdict').textContent(), text.tracking);
			state = { ...state, tracking: false, snapshot: { ref: record, phase: 'finished', rawStatus: 'CE', compileSucceeded: false, sourceVerification: 'unavailable' } };
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.record-verdict').textContent(), 'Compile Error');
			assert.equal(await page.getByText(text.compileUnavailable, { exact: true }).count(), 1, 'all sites explain explicitly missing failed compilation output');
			await page.screenshot({ path: path.join(output, record.problem.site + '-missing-compiler-' + (text === labels ? 'zh' : 'en') + '.png'), fullPage: true });
			assert.equal(await page.locator('h1').textContent(), (record.problem.site === 'luogu' ? 'R' : '#') + '55 ' + (text === labels ? '记录详情' : 'Submission Details'));
			for (const compileSucceeded of [true, undefined]) {
				state.snapshot = { ...state.snapshot, rawStatus: 'Unknown', compileSucceeded };
				await page.goto(url); await page.locator('.record-verdict').waitFor();
				assert.equal(await page.getByText(text.compileUnavailable, { exact: true }).count(), 0, 'missing compile status is not fabricated as a failed compilation');
			}
			state.snapshot = { ...state.snapshot, rawStatus: 'CE', compileSucceeded: false, compileMessage: '<literal compiler diagnostic>\n  ^\n' };
			await page.goto(url); await page.locator('pre').waitFor();
			assert.equal(await page.locator('pre code').textContent(), state.snapshot.compileMessage);
			await page.evaluate(() => { window.__failCopy = true; });
			await page.locator('pre').hover(); await page.locator('pre').getByRole('button', { name: text.copy, exact: true }).click();
			assert.equal(await page.getByRole('alert').textContent(), text.copyFailed);
			await page.screenshot({ path: path.join(output, record.problem.site + '-recovery-copy-' + (text === labels ? 'zh' : 'en') + '.png'), fullPage: true });
		}
	}
	for (const [phase, rawStatus, name, color] of [
		['queued', 'In queue', 'Waiting', 'rgb(52, 152, 219)'],
		['judging', 'Running on test 18', 'Judging', 'rgb(52, 152, 219)'],
		['judging', 'Running on pretest 2', 'Judging', 'rgb(52, 152, 219)'],
		['finished', 'Compilation error', 'Compile Error', 'rgb(250, 219, 20)'],
		['finished', 'Accepted', 'Accepted', 'rgb(82, 196, 26)'],
		['finished', 'Wrong answer on test 2', 'Wrong Answer', 'rgb(251, 99, 64)'],
		['finished', 'Time limit exceeded on test 5', 'Time Limit Exceeded', 'rgb(140, 158, 255)'],
		['unknown', 'NEW CF STATUS', 'NEW CF STATUS', 'rgb(127, 127, 127)']
	]) {
		state = { kind: 'record', labels, record: cfRecord, tracking: phase === 'queued' || phase === 'judging', snapshot: { ref: cfRecord, phase, rawStatus, problemTitle: 'Watermelon', submittedAt: '2026-11-18T09:54:00Z', owner: 'fixture_user', language: 'C++23 (GCC 14-64, msys2)', sourceVerification: 'matched', ...(rawStatus === 'Compilation error' ? { compileSucceeded: false, compileMessage: '<literal diagnostic>\n  ^\n' } : {}) } };
		for (const [width, background, foreground] of [[420, '#fff', '#222'], [700, '#252931', '#bbb']]) {
			await page.setViewportSize({ width, height: 700 }); await page.goto(url); await page.locator('.record-verdict').waitFor();
			await page.addStyleTag({ content: `body { --vscode-editor-background:${background};--vscode-editor-foreground:${foreground};--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }` });
			assert.ok((await page.locator('.record-verdict').textContent()).startsWith(name), 'CF shares the full common verdict name');
			assert.equal(await page.locator('.record-verdict').evaluate(element => getComputedStyle(element).color), color, 'CF shares the common verdict color');
			assert.equal(await page.locator('.record-verdict .spinner').count(), state.tracking ? 1 : 0);
			if (rawStatus.startsWith('Running')) {
				assert.equal(await page.locator('.record-progress').textContent(), rawStatus, 'preserve exact CF progress without a fabricated total');
				assert.notEqual(await page.locator('.record-progress').evaluate(element => getComputedStyle(element).color), color, 'native progress is secondary to the common verdict');
				assert.equal(await page.locator('.record-progress').evaluate(element => getComputedStyle(element).fontWeight), '400');
			}
			if (phase === 'finished') { assert.equal(await page.locator('.record-progress').count(), 0, 'terminal verdict details belong in the tooltip'); }
			assert.ok((await page.locator('.record-verdict').getAttribute('title')).includes(rawStatus), 'keep the original CF verdict in the tooltip');
			assert.equal(await page.locator('.testcase').count(), rawStatus.startsWith('Running') ? 1 : 0, 'only the current reported test gets a pending card; no fabricated total or CE cases');
			if (rawStatus.startsWith('Running')) {
				assert.equal(await page.locator('.testcase > div:first-child > div:first-child').textContent(), rawStatus.endsWith('18') ? '#18' : '#2');
				assert.equal(await page.locator('.testcase .spinner').count(), 1);
				assert.equal(await page.locator('.testcase > div:first-child').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(52, 152, 219)');
			}
			assert.equal(await page.getByText(labels.score, { exact: true }).count(), 0, 'no invented CF score');
			assert.equal(await page.getByText(labels.owner, { exact: true }).count(), 0, 'CF omits the owner row');
			if (state.snapshot.compileMessage) { assert.equal(await page.locator('pre code').textContent(), state.snapshot.compileMessage); }
			await page.screenshot({ path: path.join(output, `codeforces-${rawStatus.toLowerCase().replace(/\s+/g, '-')}-${width}.png`), fullPage: true });
		}
	}
	state = { kind: 'record', labels, record: cfRecord, tracking: true, snapshot: { ref: cfRecord, phase: 'judging', rawStatus: 'Running on test 18', sourceVerification: 'matched', groups: [{ name: 'Test Cases', rows: [['1', 'OK', '31 ms', '4 KiB'], ['2', 'OK', '15 ms', '12 KiB']] }] } };
	await page.goto(url); await page.locator('.testcase').first().waitFor();
	assert.equal(await page.locator('.testcase').count(), 3, 'keep real results and add only the current test');
	assert.equal(await page.locator('.testcase .spinner').count(), 1);
	assert.equal(await page.locator('.testcase').last().locator(':scope > div:first-child > div:first-child').textContent(), '#18');
	await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
	assert.equal(await page.locator('.testcase .spinner').evaluate(element => getComputedStyle(element).animationName), 'spin');
	await page.screenshot({ path: path.join(output, 'codeforces-pending-grid.png'), fullPage: true });
	await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.tracking = false; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
	await page.locator('.testcase .spinner').waitFor({ state: 'detached' });
	assert.equal(await page.locator('.testcase').count(), 3, 'stopped tracking retains last known progress');
	state.snapshot.groups[0].rows.push(['18', 'OK', '937 ms', '16 KiB']);
	await page.goto(url); await page.locator('.testcase').first().waitFor();
	assert.equal(await page.locator('.testcase').count(), 3, 'a real result for the running index takes precedence without duplication');
	assert.equal(await page.locator('.testcase .spinner').count(), 0);
	for (const rawStatus of ['Running on test 0', 'Running on test 1025', 'Running on test 99999999999999999999', 'Compiling']) {
		state.snapshot = { ref: cfRecord, phase: 'judging', rawStatus, sourceVerification: 'matched' };
		await page.goto(url); await page.locator('.record-verdict').waitFor();
		assert.equal(await page.locator('.testcase').count(), 0, 'unknown or out-of-range progress never creates a grid');
	}
	state = { kind: 'record', labels, record: cfRecord, tracking: false, snapshot: { ref: cfRecord, phase: 'finished', rawStatus: 'Accepted', problemTitle: 'Watermelon', submittedAt: '2026-11-18T09:54:00Z', language: 'C++23 (GCC 14-64, msys2)', time: '31 ms', memory: '20480 B', sourceVerification: 'matched', groups: [{ name: 'Test Cases', rows: [['1', 'OK', '31 ms', '20480 B', 'private input', 'private output', 'private answer', 'private checker'], ['2', 'OK', '15 ms', '12 KiB'], ['3', 'OK', '0 ms', '0 KiB'], ['4', 'OK', '15 ms', '8 KiB']] }] } };
	for (const [width, background, foreground] of [[420, '#fff', '#222'], [700, '#252931', '#bbb']]) {
		await page.setViewportSize({ width, height: 800 }); await page.goto(url); await page.locator('.testcase').first().waitFor();
		await page.addStyleTag({ content: `body { --vscode-editor-background:${background};--vscode-editor-foreground:${foreground};--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }` });
		assert.equal(await page.locator('.record-info').getByRole('link').textContent(), '4/A Watermelon');
		assert.equal(await page.locator('.record-info > div').filter({ has: page.getByText(labels.resources, { exact: true }) }).locator('span').last().textContent(), '31ms / 20.00KiB', 'peak testcase memory renders with the common Luogu units');
		assert.equal(await page.locator('.testCaseData h3').count(), 0, 'a single default group does not repeat the testcase heading');
		for (const card of await page.locator('.testcase').all()) {
			assert.equal(await card.locator(':scope > div:first-child > div:nth-child(2)').textContent(), 'AC');
			assert.equal(await card.locator(':scope > div:first-child').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(82, 196, 26)');
			assert.equal(await card.getAttribute('title'), null, 'use a single concise tooltip');
		}
		await page.locator('.testcase').first().hover();
		await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.testcase > div:nth-child(2)')).opacity) >= 0.79);
		assert.equal(await page.locator('.testcase').first().locator(':scope > div:nth-child(2)').textContent(), 'Accepted');
		assert.ok(!(await page.locator('.testCaseData').textContent()).includes('private'), 'test bodies never reach the rendered hover');
		await page.screenshot({ path: path.join(output, `codeforces-testcases-${width}.png`), fullPage: true });
	}
	for (const [rawStatus, status, color] of [['WRONG_ANSWER', 'WA', 'rgb(251, 99, 64)'], ['TIME_LIMIT_EXCEEDED', 'TLE', 'rgb(0, 18, 119)'], ['UNRECOGNIZED_NATIVE_STATUS', 'UNRECOGNIZED_NATIVE_STATUS', 'rgb(127, 127, 127)']]) {
		state.snapshot.groups[0].rows = [['1', rawStatus, '15 ms', '12 KiB', 'private input', 'private output', 'private answer', 'private checker', 'Exit with code -1']];
		await page.goto(url); await page.locator('.testcase').waitFor();
		assert.equal(await page.locator('.testcase > div:first-child > div:nth-child(2)').textContent(), status);
		assert.equal(await page.locator('.testcase > div:first-child').evaluate(element => getComputedStyle(element).backgroundColor), color);
		assert.ok(!(await page.locator('.testcase').textContent()).includes('private'));
		assert.ok((await page.locator('.testcase > div:nth-child(2)').textContent()).includes('Exit with code -1'));
	}
	for (const [time, memory, expected] of [[undefined, undefined, undefined], ['937 ms', undefined, '937ms'], [undefined, '16 KiB', '16.00KiB'], ['0 ms', '0 KB', '0ms / 0KB']]) {
		state.snapshot.time = time; state.snapshot.memory = memory;
		await page.goto(url); await page.locator('.record-verdict').waitFor();
		const row = page.locator('.record-info > div').filter({ has: page.getByText(labels.resources, { exact: true }) });
		assert.equal(await row.count(), expected === undefined ? 0 : 1);
		if (expected !== undefined) { assert.equal(await row.locator('span').last().textContent(), expected); }
	}
	state.snapshot.groups = [{ name: 'Subtask #1', rows: [['1', 'OK', '1 ms', '0 KiB']] }];
	await page.goto(url); await page.locator('.testCaseData h3').waitFor();
	assert.equal(await page.locator('.testCaseData h3').textContent(), 'Subtask #1', 'meaningful group names remain visible');
	// Deliberately keep Chinese status labels in the fixture: judging terminology must stay English.
	for (const site of ['luogu', 'atcoder', 'nowcoder', 'codeforces']) {
		const record = { ...cfRecord, problem: { ...cfProblem, site } };
		for (const [status, expected] of [['AC', 'Accepted'], ['WA', 'Wrong Answer'], ['CE', 'Compile Error'], ['TLE', 'Time Limit Exceeded'], ['MLE', 'Memory Limit Exceeded'], ['RE', 'Runtime Error'], ['OLE', 'Output Limit Exceeded'], ['QLE', 'Query Limit Exceeded'], ['IE', 'Internal Error'], ['PE', 'Presentation Error'], ['WJ', 'Waiting'], ['WR', 'Judging'], ['Compiling', 'Compiling'], ['Floating Point Exception', 'Floating Point Exception'], ['Segmentation Fault', 'Segmentation Fault'], ['Code Length Exceeded', 'Code Length Exceeded'], ['Nonzero Exit Code', 'Nonzero Exit Code']]) {
			state = { kind: 'record', labels, record, tracking: false, snapshot: { ref: record, phase: 'finished', rawStatus: status, sourceVerification: 'unavailable', groups: [{ name: 'Test Cases', rows: [['1', status, '15 ms', '20480 B']] }] } };
			await page.goto(url); await page.locator('.testcase').waitFor();
			assert.equal(await page.locator('.record-verdict').getAttribute('title'), site === 'codeforces' && status !== expected ? expected + ' · ' + status : expected, `${site} ${status} record explanation stays English while preserving the CF native verdict`);
			assert.equal(await page.locator('.testcase > div:nth-child(2)').textContent(), expected, `${site} ${status} testcase fallback stays English`);
		}
		state.snapshot.rawStatus = 'AC';
		state.snapshot.groups[0].rows = [['1', site === 'codeforces' ? 'OK' : 'AC', '15 ms', '20480 B', ...(site === 'codeforces' ? ['private input'] : ['ok accepted', 'Score: 10', 'Received signal 9']), 'Exit with code 0']];
		await page.goto(url); await page.locator('.testcase').waitFor();
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
		const hover = await page.locator('.testcase > div:nth-child(2)').textContent();
		assert.equal(hover, site === 'codeforces' ? 'Accepted\nExit with code 0' : 'ok accepted\nScore: 10\nReceived signal 9\nExit with code 0', 'retain actual English judge details without translating or fabricating them');
		assert.ok((await page.locator('.testcase > div:first-child').textContent()).includes('20.00KiB'), 'byte resources use the shared Luogu display formatter');
		await page.locator('.testcase').hover();
		await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.testcase > div:nth-child(2)')).opacity) >= 0.79);
		await page.screenshot({ path: path.join(output, `${site}-english-hover.png`), fullPage: true });
	}
	await page.route('https://example.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="#507cab"/></svg>' }));
	await page.route('https://www.nowcoder.com/equation?**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24"><text y="18">a+b</text></svg>' }));
	for (const [site, ref, cppLabel, cLabel] of [
		['luogu', { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, 'C++20 (GCC) (O2)', 'C17 (GCC) (O2)'],
		['atcoder', { site: 'atcoder', nativeId: 'abc484/abc484_c', url: 'https://atcoder.jp/contests/abc484/tasks/abc484_c' }, 'C++23 (GCC 15.2.0)', 'C23 (GCC 14.2.0)'],
		['codeforces', cfProblem, 'GNU G++23 14.2 (64 bit, msys2)', 'GNU GCC C17 7.3.0'],
		['nowcoder', { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' }, 'C++(g++ 13)', 'C(gcc 10)'],
		['lanqiao', { site: 'lanqiao', nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' }, 'C++（g++17）', 'C（gcc8.3.0）']
	]) {
		for (const family of ['cpp', 'c']) {
			const languages = [{ id: 'cpp', label: cppLabel, family: 'cpp' }, { id: 'c', label: cLabel, family: 'c' }].filter(option => option.family === family);
			const selected = defaultLanguage(languages, family, site);
			state = { kind: 'problem', labels, sourceName: 'solution.' + family, languages, languageId: selected.id, problem: { ref, title: 'Compiler selection', limits: [], bodies: [{ locale: 'en', sections: [{ format: 'html', content: '<p>Statement</p>' }] }], samples: [], interactive: false } };
			for (const width of [420, 700]) {
				await page.setViewportSize({ width, height: 500 }); await page.goto(url); await page.locator('article').waitFor();
				await page.addStyleTag({ content: 'body { --vscode-font-size:16px;--vscode-font-family:Segoe UI,sans-serif;--vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-button-background:#4b83ff;--vscode-button-foreground:white; }' });
				const compiler = page.getByRole('combobox', { name: labels.submissionLanguage, exact: true });
				assert.equal(await compiler.inputValue(), selected.id);
				assert.equal(await compiler.locator('option:checked').textContent(), selected.label);
				assert.equal(await compiler.getAttribute('title'), selected.label, 'the complete official label remains available in a narrow pane');
				assert.equal(await compiler.locator('option').count(), 1, 'only the bound source language family is shown');
				await page.screenshot({ path: path.join(output, `${site}-compiler-${family}-${width}.png`) });
			}
		}
	}
	for (const site of ['atcoder', 'codeforces']) {
		state.problem.ref = site === 'codeforces' ? cfProblem : { site, nativeId: 'abc484/abc484_c', url: 'https://atcoder.jp/contests/abc484/tasks/abc484_c' };
		state.languages = []; state.languageId = undefined; state.languagesLoading = true;
		await page.goto(url); await page.locator('article').waitFor();
		const compiler = page.getByRole('combobox', { name: labels.submissionLanguage, exact: true });
		assert.equal(await compiler.isDisabled(), true);
		assert.equal(await compiler.locator('option:checked').textContent(), labels.languagesLoading);
		await page.screenshot({ path: path.join(output, `${site}-compiler-loading.png`) });
		state.languagesLoading = false;
	}
	for (const site of ['atcoder', 'codeforces', 'lanqiao']) {
		for (const family of ['c', 'cpp']) {
			state.problem.ref = site === 'lanqiao' ? { site, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' } : site === 'codeforces' ? cfProblem : { site, nativeId: 'abc484/abc484_c', url: 'https://atcoder.jp/contests/abc484/tasks/abc484_c' };
			state.languages = compilerCatalogue(site).filter(option => option.family === family);
			state.languageId = defaultLanguage(state.languages, family, site)?.id; state.usingCompilerCatalogue = true;
			for (const loading of [true, false]) {
				state.languagesLoading = loading; state.problem.languageError = loading ? undefined : 'login-required';
				await page.goto(url); await page.locator('article').waitFor();
				const compiler = page.getByRole('combobox', { name: labels.submissionLanguage, exact: true });
				assert.equal(await compiler.isDisabled(), false, 'captured compilers stay selectable while loading or signed out');
				assert.ok((await compiler.getAttribute('title')).includes(labels.compilerCatalogue), 'the tooltip identifies captured options and the later validation');
				assert.equal(await page.getByText(labels.compilerCatalogue, { exact: true }).count(), 0, 'catalogue provenance stays in the tooltip');
				const selected = state.languages.at(-1);
				await compiler.selectOption(selected.id);
				await page.waitForFunction(id => window.__messages.some(message => message.data?.action === 'selectLanguage' && message.data.languageId === id), selected.id);
				await page.screenshot({ path: path.join(output, `${site}-compiler-catalogue-${family}-${loading ? 'loading' : 'signed-out'}.png`) });
			}
		}
	}
	state.usingCompilerCatalogue = false;
	for (const [languageError, expected] of [['unavailable', labels.languagesUnavailable], ['login-required', labels.languagesLoginRequired]]) {
		state.problem.languageError = languageError; state.languages = []; state.languageId = undefined;
		await page.goto(url); await page.locator('article').waitFor();
		const compiler = page.getByRole('combobox', { name: labels.submissionLanguage, exact: true });
		assert.equal(await compiler.isDisabled(), true); assert.equal(await compiler.locator('option:checked').textContent(), expected);
	}
	for (const site of ['luogu', 'atcoder', 'nowcoder', 'codeforces']) {
		const ref = { site, nativeId: site === 'luogu' ? 'B2005' : site === 'atcoder' ? 'abc484/abc484_c' : site === 'codeforces' ? '2121/H' : 'problem/18204', url: site === 'codeforces' ? 'https://codeforces.com/contest/2121/problem/H' : 'https://example.org/problem' };
		state = { kind: 'problem', labels, sourceName: 'solution.cpp', languages: [{ id: 'cpp', label: 'C++23 (GCC 15.2.0) (O2)', family: 'cpp' }], languageId: 'cpp', problem: { ref, title: site === 'luogu' ? '入门测试题目' : 'A+B Problem', limits: [{ label: 'Time Limit', value: '1.00s' }, { label: 'Memory Limit', value: '128.00MiB' }], bodies: [{ locale: 'en', sections: [{ heading: '题目描述', format: 'markdown', content: '求两个整数的和。' }] }], samples: [] } };
		if (site === 'atcoder') { state.problem.title = 'Move One Card'; state.problem.bodies.push({ locale: 'ja', sections: [] }); }
		if (site === 'luogu') { Object.assign(state.problem, { title: '字符三角形', difficulty: { label: '入门', color: '#FE4C61' }, tags: [{ label: '模拟', color: '#3498db' }] }); }
		if (site === 'codeforces') { Object.assign(state.problem, { title: 'Ice Baby', limits: [{ label: 'Time Limit', value: '2.00s' }, { label: 'Memory Limit', value: '512.00MiB' }] }); }
		for (const width of [320, 420, 480, 481, 532, 640, 700, 1000]) {
			await page.setViewportSize({ width, height: 700 }); await page.goto(url);
			await page.addStyleTag({ content: 'body { --vscode-font-size:16px;--vscode-font-family:Segoe UI,sans-serif;--vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-button-background:#4b83ff;--vscode-button-foreground:white; }' });
			await page.locator('article').waitFor();
			if (site === 'atcoder') { assert.equal(await page.locator('h1').textContent(), 'abc484_c Move One Card'); }
			if (site === 'codeforces') {
				assert.equal(await page.locator('h1').textContent(), 'H Ice Baby');
				assert.deepEqual(await page.locator('.problem-limit').allTextContents(), ['时间限制2.00s', '内存限制512.00MiB']);
			}
			await page.screenshot({ path: path.join(output, `${site}-compact-header-${width}.png`) });
			const titleGap = await page.locator('header').evaluate(element => {
				const title = element.querySelector('h1'), toolbar = title.nextElementSibling;
				const text = document.createRange(); text.selectNodeContents(title);
				return toolbar.getBoundingClientRect().top - text.getBoundingClientRect().bottom - parseFloat(getComputedStyle(title).marginBottom);
			});
			assert.ok(titleGap < 12, `${site} actions follow the title without waiting for the metadata height at ${width}px: gap ${titleGap}`);
			const row = await page.locator('header').evaluate(element => {
				const cph = element.querySelector('button'), submit = element.querySelector('.submissionControls button'), select = element.querySelector('.submissionControls select');
				return [cph, submit, select].map(control => { const box = control.getBoundingClientRect(); return { top: box.top, width: box.width }; });
			});
			assert.ok(row[0].top <= row[1].top && Math.abs(row[1].top - row[2].top) < 1, `${site} compiler stays beside submit when the toolbar wraps at ${width}px: ${JSON.stringify(row)}`);
			if (width >= 640 || width <= 480) { assert.ok(Math.abs(row[0].top - row[1].top) < 1, `${site} actions stay on one row when space allows`); }
			assert.ok(row[2].width >= 40, 'compiler selector retains a usable click target');
			assert.ok(row[2].width <= 225, `compiler selector stays compact instead of filling the toolbar: ${row[2].width}px`);
			assert.equal(await page.locator('.problem-limits').isVisible(), width > 480, 'metadata fits alongside the title in a third-width statement pane');
			if (width > 480) {
				assert.equal(await page.locator('.problem-limit').evaluateAll(elements => elements.every(element => [...element.children].every(child => child.getBoundingClientRect().height <= parseFloat(getComputedStyle(child).lineHeight) + 1))), true, 'limit labels and values remain on one line');
			}
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'compact header does not overflow');
		}
	}
	for (const site of ['luogu', 'atcoder']) {
		const ref = site === 'luogu' ? { site, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } : { site, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		state = { kind: 'problem', labels, sourceName: site === 'luogu' ? 'P1001.cpp' : 'abc086_a.cpp', languages: [{ id: 'one', label: 'C++20 with O2', family: 'cpp' }, { id: 'two', label: 'C++23 with O2', family: 'cpp' }], languageId: 'one', problem: { ref, title: site === 'luogu' ? 'P1001 A+B Problem · 中文题面' : 'Product · A long title that wraps in a narrow editor', limits: [], interactive: false, bodies: [{ locale: site === 'luogu' ? 'zh-CN' : 'en', sections: [{ heading: '题目描述', format: site === 'luogu' ? 'markdown' : 'html', content: site === 'luogu' ? '求 $a+b$。\n\n$$a^2+b^2=c^2$$\n\n![figure](https://example.org/figure.png)\n\n<script data-remote>alert(1)</script><img src="/image.png" onerror="window.pwned=1"><a href="command:evil">bad</a>' : '<p>Determine whether <var>a \\times b</var> is odd.</p><img src="https://example.org/figure.png"><script data-remote>window.pwned=1</script><a href="javascript:alert(1)">bad</a>' }] }, { locale: 'ja', sections: [{ format: 'html', content: '<h2>問題文</h2><p><var>a+b</var> を求めよ。</p>' }] }], samples: [{ input: ' 1  2\n\n', output: '3\n' }, { input: '', output: '' }] } };
		const snippets = [
			{ language: 'php', code: '<?php\n$input = trim(file_get_contents("php://stdin"));\necho $input;\n' },
			{ language: 'rust', code: 'use std::io;\nfn main() { let mut input = String::new(); }\n' },
			{ language: 'go', code: 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }\n' },
			{ language: 'html', code: '<div style="position:fixed">literal code</div>\n' },
			{ language: 'cpp', code: '  #include <iostream>\nint main() { const char* text = "<img src=x onerror=alert(1)>"; }\n\n' },
			{ language: '', code: '  plain pre with <literal> & whitespace\n\n' },
			{ language: 'unknown-language', code: '  literal <tag> & spaces\n\n' }
		];
		if (site === 'luogu') {
			Object.assign(state.problem, { limits: [{ label: 'Time Limit', value: '1.00s' }, { label: 'Memory Limit', value: '128.00MiB' }], difficulty: { label: '入门', color: '#FE4C61' }, tags: [{ label: '模拟', color: '#3498db' }] });
		}
		const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const section = state.problem.bodies[0].sections[0];
		if (site === 'luogu') { section.content += '\n\n$\\color{red}{x} + \\boxed{x} + \\sqrt[3]{x}$\n\n$\\rule{2em}{1em}$'; }
		if (site === 'luogu') { section.content += '\n\n<div class="hostile-overlay" style="position:fixed;inset:0;z-index:2147483647;background:white">FAKE CONTROLS</div>'; }
		if (site === 'luogu') { section.content += '\r\n\r\n<span class="hostile-duplicate" style="color:red" STYLE="position:fixed;inset:0">duplicate styles</span>'; }
		if (site === 'luogu') { section.content += '\n\nLiteral dollar: \\$5. Math: $a+b$\n\n$$\n\\begin{aligned}\na &= b\\\\\n\nc &= d\n\\end{aligned}\n$$\n\n| Group | Value |\n| --- | --- |\n| n | 100 |\n| ^ | 200 |\n| n,m | < |\n\n:::warning[Important]{open}\nRequired warning\n:::\n\n::anti-ai[]'; }
		section.content += snippets.map(({ language, code }) => site === 'luogu' ? '\n\n```' + language + '\n' + code + '```\n' : language ? '<pre><code class="language-' + language + '">' + escape(code) + '</code></pre>' : '<pre>' + escape(code) + '</pre>').join('');
		if (site === 'atcoder') {
			section.content += '<p><a href="#a%2520b">Cross-section notes</a></p>';
			state.problem.bodies[0].sections.push({ kind: 'notes', format: 'html', content: '<h3 id="a%20b" class="section-target">Cross-section target</h3>' });
		}
		await page.goto(url); await page.locator('article').first().waitFor(); await page.locator('article pre').first().waitFor();
		if (site === 'atcoder') {
			await page.locator('.section-target').waitFor();
			await page.evaluate(() => { window.__scrolledTarget = undefined; window.__messages = []; window.__defaultLinkOpens = []; });
			await page.getByRole('link', { name: 'Cross-section notes', exact: true }).click();
			assert.equal(await page.evaluate(() => document.getElementById(window.__scrolledTarget)?.className), 'section-target', 'the actual Webview fragment bridge scrolls to the target across HTML sections');
			assert.deepEqual(await page.evaluate(() => [window.__messages, window.__defaultLinkOpens]), [[], []], 'fragment navigation stays within the statement');
		}
		if (site === 'luogu') {
			assert.equal(await page.locator('.hostile-overlay').evaluate(element => getComputedStyle(element).position), 'static', 'author styles cannot cover application controls');
			assert.equal(await page.locator('.hostile-duplicate').evaluate(element => getComputedStyle(element).position), 'static', 'duplicate raw attributes remain inert');
			assert.ok(await page.locator('.katex [style*="border-style"]').count() > 0, 'boxed math retains generated borders');
			assert.ok(await page.locator('.katex [style*="color:red"]').count() > 0, 'named math colors survive');
			assert.equal(await page.locator('.katex-error').count(), 0, 'literal escaped dollars and multiline formulas must render');
			assert.ok(await page.locator('td[rowspan],td[colspan]').count() >= 2, 'Luogu merged table semantics');
			assert.ok(await page.locator('details.md-block').count() > 0, 'native callout presentation');
			assert.ok(!(await page.locator('article').allTextContents()).join('').includes(':anti-ai'));
		}
		for (const { language, code } of snippets) {
			const block = page.locator('article pre > code').nth(snippets.findIndex(value => value.language === language));
			await block.waitFor({ timeout: 3000 }); const copiedCode = code; assert.equal(await block.textContent(), copiedCode);
			if (language && language !== 'unknown-language') { await block.locator('.code-line > span[style]').first().waitFor({ timeout: 10000 }); }
			const pre = block.locator('..');
			if (language === 'php') {
				await pre.evaluate(element => {
					const before = document.createElement('button'); before.id = 'before-copy'; before.textContent = 'Before';
					const after = document.createElement('button'); after.id = 'after-copy'; after.textContent = 'After';
					element.before(before); element.after(after);
				});
				await page.mouse.move(0, 0); await page.locator('#before-copy').focus(); await page.keyboard.press('Tab');
				assert.equal(await pre.locator('button').evaluate(button => document.activeElement === button), true, 'keyboard users can reach copy without a prior mouse hover');
				assert.equal(await pre.locator('.copyButton').evaluate(element => getComputedStyle(element).opacity), '1');
				await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => window.__copied), code);
				await page.locator('#after-copy').focus();
				await page.locator('#before-copy, #after-copy').evaluateAll(elements => elements.forEach(element => element.remove()));
			}
			await pre.hover();
			assert.equal(await pre.locator('.copyButton').evaluate(element => getComputedStyle(element).position), 'absolute', 'copy control belongs at the code block corner');
			const copy = pre.getByRole('button', { name: '复制', exact: true });
			assert.equal(await copy.textContent(), '', 'copy controls show the icon without a text label');
			assert.equal(await copy.locator('svg[aria-hidden="true"]').count(), 1);
			const bounds = await copy.evaluate(button => {
				const control = button.getBoundingClientRect(), pre = button.closest('pre').getBoundingClientRect();
				return { width: control.width, height: control.height, right: pre.right - control.right, top: control.top - pre.top };
			});
			assert.deepEqual({ width: bounds.width, height: bounds.height }, { width: 28, height: 28 });
			assert.ok(Math.abs(bounds.right) <= 2 && Math.abs(bounds.top) <= 2, 'copy icon stays in the top-right corner');
			await copy.click(); assert.equal(await page.evaluate(() => window.__copied), copiedCode, 'copy exact uncolored displayed code');
		}
		await page.locator('.sample-grid pre').first().hover();
		const sampleCopy = page.locator('.sample-grid pre').first().locator('button');
		assert.equal(await sampleCopy.getAttribute('aria-label'), labels.copy);
		assert.equal(await sampleCopy.textContent(), '', 'samples use the same icon-only control');
		assert.equal(await sampleCopy.locator('svg[aria-hidden="true"]').count(), 1);
		assert.equal(await sampleCopy.evaluate(button => button.getBoundingClientRect().width), 28);
		await page.locator('.sample-grid pre').first().getByRole('button', { name: '复制', exact: true }).click();
		assert.equal(await page.evaluate(() => window.__copied), ' 1  2\n\n');
		await page.evaluate(() => { window.__failCopy = true; });
		await sampleCopy.click();
		await page.locator('.sample-grid pre').first().getByRole('alert').waitFor({ timeout: 1500 });
		assert.equal(await page.locator('.sample-grid pre').first().getByRole('alert').textContent(), labels.copyFailed, 'sample clipboard failures are visible');
		assert.equal(await sampleCopy.getAttribute('title'), labels.copy, 'failed copy clears a preceding success indication');
		await page.evaluate(() => { window.__failCopy = false; });
		await sampleCopy.click();
		assert.equal(await page.locator('.sample-grid pre').first().getByRole('alert').count(), 0, 'successful retry clears the failure');
		assert.equal(await sampleCopy.getAttribute('title'), labels.copied);
		const themeColors = [];
		assert.equal(await page.locator('script[data-remote], [onerror], a[href^="command:"], a[href^="javascript:"]').count(), 0);
		assert.equal(await page.evaluate(() => window.pwned), undefined);
		assert.ok(await page.locator('.katex').count() > 0);
		if (site === 'luogu') { assert.ok(await page.locator('.katex [style]').count() > 0, 'trusted math positioning must survive sanitization'); }
		assert.equal(await page.locator('.sample-grid code').first().textContent(), ' 1  2\n\n');
		assert.equal(await page.getByRole('button', { name: '查看结果', exact: true }).count(), 0);
		assert.equal(await page.getByRole('button', { name: '打开原题', exact: true }).count(), 0);
		assert.ok(await page.getByRole('button', { name: /提交.*\.cpp/ }).count() === 1);
		assert.equal(await page.getByRole('button', { name: '传送至 CPH' }).locator('svg').count(), 1);
		assert.equal(await page.getByRole('button', { name: /提交.*\.cpp/ }).locator('svg').count(), 1);
		assert.equal(await page.getByRole('button', { name: '传送至 CPH' }).textContent(), '', 'CPH is an icon with an accessible name');
		assert.equal(await page.getByRole('button', { name: /提交.*\.cpp/ }).textContent(), '', 'submission keeps the source name in its tooltip, not a text button');
		await page.addStyleTag({ content: 'body { --vscode-font-size:16px; }' });
		assert.equal(await page.locator('header h1').evaluate(element => getComputedStyle(element).fontSize), '32px', 'upstream h1 tracks the configured body font');
		for (const width of [260, 320, 420, 532]) {
			await page.setViewportSize({ width, height: 900 });
			const controls = await page.locator('.submissionControls').evaluate(element => {
				const button = element.querySelector('button'), select = element.querySelector('select');
				return { buttonHeight: button.getBoundingClientRect().height, selectHeight: select.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(button).fontSize) };
			});
			assert.ok(controls.buttonHeight <= controls.fontSize * 2.5, `submission button remains a single line at ${width}px`);
			assert.ok(controls.selectHeight <= controls.fontSize * 2.5, `language selector does not stretch at ${width}px`);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no viewport overflow at ${width}px`);
		}
		await page.setViewportSize({ width: 1000, height: 900 });
		if (site === 'luogu') {
			assert.equal(await page.locator('.problem-difficulty .tag').textContent(), '入门');
			assert.equal(await page.locator('.problem-difficulty .tag').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(254, 76, 97)');
			await page.locator('.problem-tags').hover();
			await page.locator('.problem-tags .tag').waitFor({ state: 'visible' });
			await page.waitForTimeout(550);
			assert.equal(await page.locator('.problem-tag-list').evaluate(element => getComputedStyle(element).opacity), '1', 'upstream tags open on hover');
			assert.equal(await page.locator('.problem-tags .tag').textContent(), '模拟');
			await page.mouse.move(0, 0);
			await page.locator('.problem-tags').focus();
			await page.waitForTimeout(550);
			assert.equal(await page.locator('.problem-tag-list').evaluate(element => getComputedStyle(element).opacity), '1', 'keyboard focus can open tags');
			await page.locator('.problem-tags').evaluate(element => element.blur());
		} else { assert.equal(await page.locator('.problem-difficulty, .problem-tags').count(), 0); }
		if (site === 'atcoder') {
			await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.languageId = undefined; window.__OJ_STATE__ = next; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
			await page.getByRole('combobox', { name: labels.submissionLanguage, exact: true }).locator('option[value=""]').waitFor({ state: 'attached' });
			assert.equal(await page.getByRole('combobox', { name: labels.submissionLanguage, exact: true }).inputValue(), '', 'an unavailable explicit preference is represented by an empty selection');
		}
		await page.getByRole('combobox', { name: labels.submissionLanguage, exact: true }).selectOption('two');
		assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'selectLanguage', languageId: 'two' });
		await page.getByRole('button', { name: /提交.*\.cpp/ }).click();
		assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'submit' });
		for (const dark of [true, false]) {
			await page.evaluate(dark => { document.body.dataset.vscodeThemeKind = dark ? 'vscode-dark' : 'vscode-light'; }, dark);
			assert.equal(await page.locator('article pre').first().evaluate(pre => getComputedStyle(pre).backgroundColor), 'rgb(40, 44, 52)', 'fixed code background stays readable on both page themes');
			assert.equal(await page.locator('article pre > code').first().evaluate(code => getComputedStyle(code).backgroundColor), 'rgba(0, 0, 0, 0)', 'old page background cannot cover the fixed code palette');
			themeColors.push(await page.locator('article code.language-php .code-line > span[style]').first().evaluate(element => getComputedStyle(element).color));
			await page.addStyleTag({ content: `body { --vscode-editor-background:${dark ? '#1e1e1e' : '#fff'};--vscode-editor-foreground:${dark ? '#ddd' : '#222'};--vscode-descriptionForeground:${dark ? '#aaa' : '#666'};--vscode-button-background:#007acc;--vscode-button-hoverBackground:#006bb3;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:${dark ? '#333' : '#eee'};--vscode-button-secondaryForeground:${dark ? '#ddd' : '#222'};--vscode-focusBorder:#007acc;--vscode-textCodeBlock-background:${dark ? '#282828' : '#f4f4f4'};--vscode-font-size:14px;--vscode-font-family:'Segoe UI',sans-serif; }` });
			for (const width of [260, 320, 420, 460, 480, 481, 532, 640, 1000]) {
				await page.setViewportSize({ width, height: 900 });
				if (site === 'luogu') {
					if (width <= 480) { assert.equal(await page.locator('.problem-limits').isVisible(), false, 'metadata leaves room for the title in narrow editors'); }
					else {
						await page.locator('.problem-difficulty .tag').waitFor({ state: 'visible' });
						assert.equal(await page.locator('header').evaluate(element => { const title = element.querySelector('h1').getBoundingClientRect(), metadata = element.lastElementChild.getBoundingClientRect(); return metadata.left >= title.right; }), true, 'metadata stays to the right of the title');
					}
				}
				assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'header remains within a narrow editor');
				await page.screenshot({ path: path.join(output, `${site}-${dark ? 'dark' : 'light'}-${width}.png`), fullPage: true });
				if (width === 532) {
					const code = page.locator('article pre').first(), sample = page.locator('.sample-grid pre').last();
					await code.hover(); await code.screenshot({ path: path.join(output, `${site}-${dark ? 'dark' : 'light'}-copy-icon.png`) });
					await sample.hover();
					assert.ok(await sample.evaluate(pre => pre.scrollHeight <= pre.clientHeight + 1), 'copy icon must fit even an empty sample without adding a scrollbar');
					await sample.screenshot({ path: path.join(output, `${site}-${dark ? 'dark' : 'light'}-sample-copy.png`) });
				}
			}
		}
		assert.equal(themeColors[0], themeColors[1], 'syntax colors stay fixed when the editor theme changes');
		await page.getByRole('combobox', { name: '题面语言', exact: true }).selectOption('ja'); assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'selectLocale', locale: 'ja' });
		if (site === 'atcoder') {
			// ABC467 E uses mathematical var nodes inside its input-format pre, not source code.
			const format = '<section><h3>Input</h3><pre><var>N</var> <var>M</var>\n<var>A_1</var> <var>A_2</var> <var>\\ldots</var> <var>A_N</var>\n<var>B_1</var> <var>B_2</var> <var>\\ldots</var> <var>B_{N-1}</var>\n</pre></section>';
			state.locale = 'en';
			state.problem.bodies = [{ locale: 'en', sections: [{ format: 'html', content: format }, { kind: 'sample-explanation', sampleIndex: 0, format: 'html', content: '<p>After the operations, <var>A=(6,8,7)</var>.</p>' }] }, { locale: 'ja', sections: [{ format: 'html', content: format }, { kind: 'sample-explanation', sampleIndex: 0, format: 'html', content: '<p>操作後の列は <var>A=(6,8,7)</var> です。</p>' }] }];
			await page.goto(url); await page.locator('.oj-input-format .katex').first().waitFor();
			await page.locator('.sample-explanation .katex').waitFor();
			assert.equal(await page.locator('.oj-input-format .katex').count(), 10);
			assert.equal(await page.locator('.oj-input-format code,.oj-input-format .copyButton').count(), 0, 'mathematical input formats bypass source highlighting and copying');
			assert.equal(await page.locator('.oj-input-format').evaluate(element => getComputedStyle(element).whiteSpace), 'pre-wrap');
			const pair = page.locator('.sample-grid').first();
			assert.equal(await pair.locator('.sample-explanation').count(), 1);
			assert.equal(await page.locator('.sample-grid').last().locator('.sample-explanation').count(), 0);
			assert.equal(await pair.locator(':scope > div').last().getAttribute('class'), 'sample-explanation');
			assert.equal(await pair.locator('.sample-explanation').evaluate(element => getComputedStyle(element).gridColumn), '1 / -1');
			assert.equal(await pair.locator('pre code').first().textContent(), ' 1  2\n\n', 'sample bytes remain untouched');
			await page.screenshot({ path: path.join(output, 'atcoder-format-sample-explanation.png'), fullPage: true });
			state.locale = 'ja'; await page.goto(url); await page.locator('.sample-explanation .katex').waitFor();
			assert.ok((await page.locator('.sample-explanation').textContent()).includes('操作後'));
			assert.ok(!(await page.locator('.sample-explanation').textContent()).includes('After the operations'));
		}
		const record = { problem: ref, id: '22', url: site === 'luogu' ? 'https://www.luogu.com.cn/record/22' : 'https://atcoder.jp/contests/abc086/submissions/22' };
		if (site === 'atcoder') {
			for (const phase of ['queued', 'judging', 'unknown']) {
				state = { kind: 'record', labels, sourceName: 'solution.cpp', record, tracking: true, snapshot: { ref: record, phase, rawStatus: phase === 'queued' ? 'WJ' : phase === 'judging' ? '1/21' : 'unknown', score: '0', sourceVerification: 'not-checked', groups: [] } };
				await page.goto(url); await page.locator('.record-verdict').waitFor();
				assert.equal(await page.getByText(labels.score, { exact: true }).count(), 0, 'a placeholder score must stay hidden before a final verdict');
				if (phase !== 'unknown') { await page.screenshot({ path: path.join(output, `atcoder-${phase}-score-hidden.png`), fullPage: true }); }
				await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.tracking = false; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
				assert.equal(await page.getByText(labels.score, { exact: true }).count(), 0, 'stopping local tracking must not turn a placeholder into a final score');
			}
			await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.snapshot.phase = 'finished'; next.snapshot.rawStatus = 'WA'; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
			await page.getByText(labels.score, { exact: true }).waitFor();
			assert.equal(await page.locator('.record-info > div').filter({ has: page.getByText(labels.score, { exact: true }) }).locator('span').last().textContent(), '0', 'a genuine final zero score remains visible');
			await page.screenshot({ path: path.join(output, 'atcoder-final-zero-score.png'), fullPage: true });
			await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); delete next.snapshot.score; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
			await page.getByText(labels.score, { exact: true }).waitFor({ state: 'detached' });
			state = { kind: 'record', labels, sourceName: 'solution.cpp', record, tracking: true, snapshot: { ref: record, phase: 'judging', rawStatus: '1/21', sourceVerification: 'not-checked', groups: [] } };
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.testcase .spinner').count(), 21, 'real reported total drives the pending testcase grid');
			assert.equal(await page.locator('.testcase-grid').evaluate(element => getComputedStyle(element).display), 'flex');
			assert.equal(await page.locator('.testcase').first().locator(':scope > div').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(52, 152, 219)');
			assert.equal(await page.locator('.testCaseData h3').count(), 0, 'no redundant generic subgroup heading');
			await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
			await page.screenshot({ path: path.join(output, 'atcoder-pending-grid.png'), fullPage: true });
		}
		for (const [phase, rawStatus] of [['queued', 'WJ'], ['judging', 'WR']]) {
			state = { kind: 'record', labels, sourceName: 'solution.cpp', record, tracking: true, snapshot: { ref: record, phase, rawStatus, sourceVerification: 'not-checked', groups: [] } };
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.record-verdict .spinner').count(), 1, 'pending records spin before individual test cases are available');
			assert.equal(await page.locator('.record-verdict').textContent(), rawStatus === 'WJ' ? 'Waiting' : 'Judging', 'known pending aliases use the common full verdict');
			assert.equal(await page.locator('.testcase').count(), 0, 'WJ without a reported total cannot invent testcases');
			await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.tracking = false; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
			await page.locator('.record-verdict .spinner').waitFor({ state: 'detached' });
		}
		state = { kind: 'record', labels, sourceName: 'solution.cpp', record, tracking: true, snapshot: { ref: record, phase: 'judging', rawStatus: 'Judging', sourceVerification: 'not-checked', groups: [{ name: 'Subtask #0', rows: [['1', 'Judging'], ['2', 'AC', '2ms', '1KiB']] }] } };
		await page.goto(url); await page.locator('.testcase .spinner').waitFor();
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
		assert.equal(await page.locator('.testcase .spinner').count(), 1, 'only judging test cases spin');
		assert.equal(await page.locator('.testcase').first().locator(':scope > div').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(52, 152, 219)');
		for (const rawStatus of ['WJ', 'WR']) {
			await page.evaluate(status => { const next = structuredClone(window.__OJ_STATE__); next.snapshot.groups[0].rows[0][1] = status; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); }, rawStatus);
			await page.locator(`.testcase .spinner[aria-label="${rawStatus}"]`).waitFor();
			assert.equal(await page.locator('.testcase').first().locator(':scope > div').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(52, 152, 219)', 'existing pending aliases keep the common blue testcase color');
		}
		const spinner = page.locator('.testcase .spinner');
		assert.equal(await spinner.evaluate(element => getComputedStyle(element).animationName), 'spin');
		const rotation = await spinner.evaluate(element => getComputedStyle(element).transform);
		await page.waitForTimeout(100);
		assert.notEqual(await spinner.evaluate(element => getComputedStyle(element).transform), rotation, 'judging ring actually rotates');
		await page.emulateMedia({ reducedMotion: 'reduce' });
		assert.equal(await spinner.evaluate(element => getComputedStyle(element).animationName), 'none');
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.screenshot({ path: path.join(output, `${site}-judging.png`), fullPage: true });
		await page.evaluate(() => { const next = structuredClone(window.__OJ_STATE__); next.snapshot.phase = 'finished'; next.snapshot.rawStatus = 'AC'; next.snapshot.groups[0].rows[0][1] = 'AC'; window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: next } })); });
		await page.locator('.testcase .spinner').waitFor({ state: 'detached' });
		state = { kind: 'record', labels, sourceName: 'solution.cpp', record, snapshot: { ref: record, problemTitle: 'A+B Problem', problemDifficulty: { label: '入门', color: '#fe4c61' }, phase: 'finished', rawStatus: 'AC', score: '50', owner: 'fixture-user', language: 'C++20', time: '40 ms', memory: '1 MiB', sourceVerification: 'unavailable', source: 'int main() {}', submittedAt: '2026-11-14 12:00:00', codeLength: '13 B', compileSucceeded: true, compileMessage: '  compiler output\n\n', groups: [{ name: 'Tests', rows: [['1', 'AC'], ['2', 'AC']] }] } };
		await page.goto(url); await page.locator('.record-verdict').waitFor();
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
		assert.equal(await page.locator('.record-verdict').textContent(), 'Accepted', 'all supported sites use the full upstream verdict');
		const problemLink = page.locator('.record-info > div').first().locator('a');
		assert.equal(await problemLink.textContent(), record.problem.nativeId + ' A+B Problem', 'record retains the official problem name like upstream');
		assert.equal(await problemLink.locator('span').evaluate(element => getComputedStyle(element).color), 'rgb(254, 76, 97)', 'official difficulty colors the problem ID');
		if (site === 'atcoder') { assert.equal(await page.locator('.record-verdict').getAttribute('title'), 'Accepted'); }
		assert.equal(await page.locator('.record-info > div').filter({ has: page.getByText('50', { exact: true }) }).locator('span').last().evaluate(element => getComputedStyle(element).color), 'rgb(243, 156, 17)', 'upstream partial score uses orange');
		const infoLabels = await page.locator('.record-info > div > span:first-child').allTextContents();
		assert.ok(infoLabels.indexOf(labels.language) < infoLabels.indexOf(labels.codeLength), 'language precedes code length like upstream');
		assert.equal(await page.getByText(labels.owner, { exact: true }).count(), site === 'luogu' ? 1 : 0, 'only Luogu retains its owner row');
		assert.equal(await page.getByRole('button', { name: '继续查询', exact: true }).count(), 0);
		assert.equal(await page.getByRole('button', { name: '停止跟踪', exact: true }).count(), 0);
		assert.equal(await page.getByText('无法读取提交源码', { exact: true }).count(), 0);
		assert.ok(await page.locator('.testcase').count() > 0);
		assert.equal(await page.getByRole('link', { name: labels.viewSource }).getAttribute('title'), labels.officialSource, 'official source retains its provenance');
		const resourceRow = page.locator('.record-info > div').filter({ has: page.getByText(labels.resources, { exact: true }) });
		assert.equal(await resourceRow.locator('span').last().textContent(), '40ms / 1.00MiB');
		await page.getByRole('link', { name: '在 BeCoder 中查看' }).click();
		assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'viewSource' });
		const compiler = page.locator('pre');
		await compiler.hover();
		const compilerCopy = compiler.getByRole('button', { name: labels.copy, exact: true });
		await page.evaluate(() => { window.__failCopy = true; });
		await compilerCopy.click();
		await compiler.getByRole('alert').waitFor({ timeout: 1500 });
		await page.evaluate(() => { window.__failCopy = false; });
		await compilerCopy.click();
		assert.equal(await page.evaluate(() => window.__copied), state.snapshot.compileMessage, 'compiler output copy preserves whitespace');
		assert.equal(await compiler.getByRole('alert').count(), 0);
		await page.screenshot({ path: path.join(output, `${site}-record.png`), fullPage: true });
		state = { ...state, message: 'Connection stopped', canRetry: true };
		await page.goto(url); await page.getByRole('button', { name: '继续查询', exact: true }).waitFor();
		if (site === 'luogu') {
			for (const [rawStatus, message] of [['N/A', '该评测结果已隐藏。可点击继续查询检查更新。'], ['NEW-STATUS', '暂不识别该评测状态。可点击继续查询检查更新。']]) {
				state = { ...state, tracking: false, message, snapshot: { ref: record, phase: 'unknown', rawStatus, sourceVerification: 'unavailable', groups: [] } };
				await page.goto(url); await page.getByRole('button', { name: '继续查询', exact: true }).waitFor();
				assert.equal(await page.locator('.spinner').count(), 0);
				assert.ok((await page.locator('[role="status"]').textContent()).includes(message));
				await page.getByRole('button', { name: '继续查询', exact: true }).click();
				assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'continueQuery' });
				await page.screenshot({ path: path.join(output, `luogu-stopped-${rawStatus === 'N/A' ? 'hidden' : 'unknown'}.png`), fullPage: true });
			}
		}
		if (site === 'atcoder') {
			state = { ...state, message: undefined, canRetry: false, snapshot: { ref: record, phase: 'finished', rawStatus: 'CE', compileSucceeded: false, compileMessage: './Main.cpp:4: error: cin was not declared\n  ^~~\n', sourceVerification: 'unavailable' } };
			await page.goto(url); await page.locator('pre').waitFor();
			assert.equal(await page.locator('.record-verdict').getAttribute('title'), 'Compile Error');
			assert.equal(await page.locator('.spinner').count(), 0);
			await page.locator('pre').hover();
			await page.locator('pre').getByRole('button', { name: labels.copy, exact: true }).click();
			assert.equal(await page.evaluate(() => window.__copied), state.snapshot.compileMessage);
			await page.screenshot({ path: path.join(output, 'atcoder-ce.png'), fullPage: true });
			state.snapshot.compileMessage = undefined;
			await page.goto(url); await page.getByText(labels.compileUnavailable, { exact: true }).waitFor();
			state.snapshot.rawStatus = 'NEW-STATUS'; state.snapshot.compileSucceeded = undefined;
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.record-verdict').textContent(), 'NEW-STATUS');
			assert.equal(await page.locator('.record-verdict').getAttribute('title'), null);
			state.snapshot.rawStatus = 'QLE';
			await page.goto(url); await page.locator('.record-verdict').waitFor();
			assert.equal(await page.locator('.record-verdict').getAttribute('title'), 'Query Limit Exceeded');
			assert.equal(await page.locator('.record-verdict').evaluate(element => getComputedStyle(element).color), 'rgb(140, 158, 255)');
		}
	}
	const nowcoderRef = { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
	const nowcoderRecord = { problem: nowcoderRef, id: '123', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123' };
	state = { kind: 'problem', labels, sourceName: '18204.cpp', problem: { ref: nowcoderRef, title: 'A+B(1)', limits: [{ label: 'Time Limit', value: '1.00s' }], interactive: false, bodies: [{ locale: 'zh-CN', sections: [{ format: 'html', content: '<h2>描述</h2><p>计算 <img alt="a+b" src="https://www.nowcoder.com/equation?tex=a%2Bb">。</p><pre><code class="language-cpp">int main() { return 0; }\n</code></pre>' }] }], samples: [{ input: ' 1 2\n', output: '3\n' }] } };
	Object.assign(state, { sourceName: '322020.cpp', languages: [{ id: '2', label: 'C++（clang++18）', family: 'cpp' }], languageId: '2' });
	Object.assign(state.problem, { title: '小月的相同数对', ref: { site: 'nowcoder', nativeId: 'problem/322020', url: 'https://ac.nowcoder.com/acm/problem/322020' }, limits: [{ label: 'Time Limit', value: '2.00s' }, { label: 'Memory Limit', value: '256.00MiB' }] });
	state.problem.bodies[0].sections.push({ kind: 'sample-explanation', sampleIndex: 0, format: 'html', content: '<h2>说明</h2><div class="oj-input-format">样例说明 <img src="https://hr.nowcoder.com/equation?tex=a%2Bb"></div>' });
	for (const width of [320, 532, 700, 1000]) {
		await page.setViewportSize({ width, height: 900 }); await page.goto(url);
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-button-background:#4b83ff;--vscode-button-foreground:white;--vscode-font-size:16px;--vscode-font-family:Segoe UI,sans-serif; }' });
		await page.locator('article .katex').first().waitFor();
		await page.locator('article code .code-line > span[style]').first().waitFor();
		await page.locator('.oj-input-format .katex').waitFor();
		assert.ok(await page.locator('header h1').evaluate(element => element.getBoundingClientRect().height < 150), 'long limits must not squeeze the title into a vertical column');
		const cph = page.getByRole('button', { name: labels.importCph });
		assert.ok(await cph.evaluate(element => element.getBoundingClientRect().height < 45), 'CPH label remains on one line');
		assert.ok(await page.getByRole('combobox', { name: labels.submissionLanguage, exact: true }).evaluate(element => element.getBoundingClientRect().width > 100), 'compiler selector must stay readable');
		assert.ok((await page.locator('body').textContent()).includes('样例说明'));
		assert.equal(await page.locator('.problem-difficulty, .problem-tags').count(), 0);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		await page.screenshot({ path: path.join(output, `nowcoder-problem-${width}.png`), fullPage: true });
	}
	for (const [phase, rawStatus] of [['queued', 'Waiting'], ['queued', 'Compiling'], ['judging', 'Judging'], ['finished', 'AC'], ['finished', 'WA'], ['finished', 'CE']]) {
		state = { kind: 'record', labels, sourceName: '18204.cpp', record: nowcoderRecord, tracking: phase !== 'finished', snapshot: { ref: nowcoderRecord, phase, rawStatus, groups: [], sourceVerification: 'not-checked', ...(rawStatus === 'CE' ? { compileSucceeded: false, compileMessage: 'main.cpp: error\n' } : {}) } };
		if (rawStatus === 'AC' || rawStatus === 'WA') { state.snapshot.testCaseSummary = { passed: rawStatus === 'AC' ? 24 : 3, total: 24 }; }
		await page.goto(url); await page.locator('.record-verdict').waitFor();
		assert.equal(await page.locator('.record-info > div').first().locator('a').textContent(), 'NC18204', 'internal routes are not user-facing problem names');
		assert.equal(await page.locator('.record-info > div').first().locator('a span').getAttribute('style'), null, 'missing difficulty has no invented color');
		assert.equal(await page.locator('.record-verdict').textContent(), rawStatus === 'AC' ? 'Accepted' : rawStatus === 'WA' ? 'Wrong Answer' : rawStatus === 'CE' ? 'Compile Error' : rawStatus);
		assert.ok(await page.locator('.record-verdict').getAttribute('title'), 'native verdict has an English explanation');
		if (phase !== 'finished') { assert.equal(await page.locator('.record-verdict').evaluate(element => getComputedStyle(element).color), 'rgb(52, 152, 219)', 'pending text and spinner share the readable judging blue'); }
		assert.equal(await page.locator('.record-verdict .spinner').count(), phase === 'finished' ? 0 : 1);
		assert.equal(await page.locator('.testcase').count(), 0, 'missing Nowcoder test details stay omitted');
		assert.equal(await page.locator('.record-info').getByText(labels.passedTests, { exact: true }).count(), 0, 'case totals are not record metadata');
		const summary = page.locator('.testCaseData p');
		assert.equal(await summary.count(), rawStatus === 'AC' || rawStatus === 'WA' ? 1 : 0);
		if (await summary.count()) {
			assert.equal(await summary.textContent(), labels.passedTests + ' ' + (rawStatus === 'AC' ? '24 / 24' : '3 / 24'));
			assert.equal(await page.locator('hr + .testCaseData > h2').textContent(), labels.testCases, 'case summary follows the shared separator and heading');
		}
		assert.equal(await page.locator('.record-info > div > span:first-child').filter({ hasText: new RegExp('^' + labels.score + '$') }).count(), 0, 'missing score stays omitted');
		await page.screenshot({ path: path.join(output, `nowcoder-${rawStatus}.png`), fullPage: true });
	}
	state.snapshot = { ...state.snapshot, problemTitle: 'A+B(1)', phase: 'finished', rawStatus: 'AC', testCaseSummary: { passed: 24, total: 24 }, language: 'C++23', owner: 'fixture-user', source: 'int main() {}\n', compileMessage: undefined, compileSucceeded: undefined };
	await page.goto(url); await page.locator('.record-verdict').waitFor();
	await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
	assert.equal(await page.locator('.record-info > div').first().locator('a').textContent(), 'NC18204 A+B(1)');
	assert.equal(await page.getByText(labels.source, { exact: true }).count(), 1, 'the source row has one shared concise label');
	assert.equal(await page.getByRole('link', { name: labels.viewSource }).getAttribute('title'), labels.sentSource, 'the local snapshot remains distinguishable from official source');
	assert.equal(await page.getByText(labels.codeLength, { exact: true }).count(), 0, 'unavailable official length remains omitted');
	assert.equal(await page.getByText(labels.owner, { exact: true }).count(), 0, 'Nowcoder hides the account field');
	await page.screenshot({ path: path.join(output, 'nowcoder-record.png'), fullPage: true });
	const lanqiaoProblem = { site: 'lanqiao', nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
	const lanqiaoRecord = { problem: lanqiaoProblem, id: '6aff1ff717e87398a15a4abf', url: 'https://www.lanqiao.cn/problems/254/submissions/6aff1ff717e87398a15a4abf/' };
	state = { kind: 'record', labels, sourceName: '254.cpp', tracking: true, submission: { problem: lanqiaoProblem, phase: 'preparing', codeLength: '171 B' }, message: '正式提交记录尚未确认。' };
	await page.setViewportSize({ width: 520, height: 650 }); await page.goto(url); await page.locator('.record-verdict').first().waitFor();
	await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
	const updateLanqiao = async () => { await page.evaluate(value => window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: value } })), state); };
	for (const phase of ['preparing', 'sending', 'judging', 'confirming']) {
		state.submission = { ...state.submission, phase, ...(phase !== 'preparing' ? { language: 'C++（g++17）' } : {}) };
		await updateLanqiao();
		const expected = phase === 'judging' ? 'Judging' : labels[phase === 'sending' ? 'submitting' : phase];
		await page.waitForFunction(text => document.querySelector('.record-verdict')?.textContent === text, expected);
		assert.equal(await page.locator('.testcase').count(), 0, 'no execution point count means no invented numbered cards');
		assert.equal(await page.locator('.spinner').count(), 2, 'phase and test results use the shared waiting indicator');
		assert.equal(await page.locator('h1 a').count(), 0, 'pending execution is not a verified record link');
		assert.equal(await page.getByRole('link', { name: labels.viewSource }).count(), 0, 'pending source is not presented as official source');
		await page.screenshot({ path: path.join(output, 'lanqiao-pending-' + phase + '.png'), fullPage: true });
	}
	state.submission = { ...state.submission, groups: [{ name: 'Test Cases', rows: [['1', 'AC', '0 ms', '0 kb'], ['2', 'Judging', '', '']] }] };
	await updateLanqiao(); await page.locator('.testcase').first().waitFor();
	assert.equal(await page.locator('.testcase .spinner').count(), 1, 'only a real projected running row spins');
	await page.screenshot({ path: path.join(output, 'lanqiao-pending-report.png'), fullPage: true });
	state = { kind: 'record', labels, sourceName: '254.cpp', record: lanqiaoRecord, tracking: false, snapshot: { ref: lanqiaoRecord, phase: 'finished', rawStatus: 'AC', sourceVerification: 'matched', groups: [{ name: 'Test Cases', rows: [['1', 'AC', '0 ms', '0 kb'], ['2', 'AC', '1 ms', '1 kb']] }] } };
	await updateLanqiao(); await page.locator('h1 a').waitFor();
	assert.equal(await page.locator('.spinner').count(), 0, 'final result stops the same page animation');
	assert.equal(await page.locator('.testcase').count(), 2);
	await page.screenshot({ path: path.join(output, 'lanqiao-progress-finished.png'), fullPage: true });
	for (const [name, snapshot] of [
		['accepted', { phase: 'finished', rawStatus: 'AC', groups: [{ name: 'Test Cases', rows: [['1', 'AC', '0 ms', '0 kb']] }], time: '0 ms', memory: '0 kb' }],
		['summary-only', { phase: 'finished', rawStatus: 'AC', testCaseSummary: { passed: 5, total: 5 } }],
		['unknown', { phase: 'unknown', rawStatus: 'NEW LANQIAO STATUS' }],
		['compile-missing', { phase: 'finished', rawStatus: 'CE', compileSucceeded: false }]
	]) {
		state = { kind: 'record', labels, sourceName: '254.cpp', record: lanqiaoRecord, tracking: false, snapshot: { ref: lanqiaoRecord, language: 'C++（g++17）', source: 'int main(){}\n', sourceVerification: 'matched', ...snapshot } };
		await page.setViewportSize({ width: 520, height: 650 }); await page.goto(url); await page.locator('.record-verdict').waitFor();
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
		assert.equal(await page.getByText(labels.score, { exact: true }).count(), 0, 'Lanqiao has no fabricated score');
		assert.equal(await page.locator('.testcase').count(), name === 'accepted' ? 1 : 0);
		assert.equal(await page.locator('.spinner').count(), 0);
		assert.ok((await page.locator('body').textContent()).includes('C++（g++17）'));
		if (name === 'accepted') { assert.equal(await page.locator('.testcase > div:nth-child(2)').textContent(), 'Accepted'); await page.locator('.testcase').hover(); }
		await page.screenshot({ path: path.join(output, 'lanqiao-' + name + '.png'), fullPage: true });
	}
	await page.goto(url + 'accounts');
	assert.deepEqual(await page.evaluate(() => window.__messages.splice(0)), [{ ready: true }]);
	await page.evaluate(() => { const style = document.createElement('style'); style.nonce = 'fixture'; style.textContent = 'body { background:#1e1e1e;--vscode-foreground:#ddd;--vscode-font-size:13px;--vscode-font-family:Segoe UI,sans-serif;--vscode-textLink-foreground:#4daafc;--vscode-descriptionForeground:#aaa;--vscode-disabledForeground:#777; }'; document.head.append(style); });
	for (const selector of ['.status', '.account img']) { for (const element of await page.locator(selector).all()) { await element.click(); } }
	assert.deepEqual(await page.evaluate(() => window.__messages), [], 'status text and logos remain inert');
	assert.equal(await page.locator('[data-site="codeforces"] button').isDisabled(), false);
	assert.equal(await page.locator('[data-site="codeforces"]').getAttribute('data-state'), 'unknown');
	assert.equal(await page.locator('[data-site="lanqiao"] button').isDisabled(), true);
	for (const icon of await page.locator('.account img').all()) {
		assert.equal(await icon.evaluate(element => getComputedStyle(element).opacity), '1');
		assert.equal(await icon.evaluate(element => getComputedStyle(element).filter), 'none');
	}
	await page.getByRole('button', { name: 'AtCoder', exact: true }).click();
	assert.deepEqual(await page.evaluate(() => window.__messages), [{ site: 'atcoder' }]);
	await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { rows: [{ site: 'atcoder', state: 'signed-in', text: '已登录 · fixture-user' }] } })));
	assert.equal(await page.locator('[data-site="atcoder"] img').evaluate(element => getComputedStyle(element).opacity), '1');
	assert.equal(await page.locator('[data-site="atcoder"] .status').textContent(), '已登录 · fixture-user');
	for (const width of [240, 320, 500]) { await page.setViewportSize({ width, height: 300 }); await page.screenshot({ path: path.join(output, 'accounts-' + width + '.png') }); }
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ passed: true, sites: 5, stoppedResultQuery: true, copyIcons: true, math: true, samplesPreserved: true, hostileMarkupRejected: true, fixedActions: true, metadata: true, judgingAnimation: true, terminalStopsAnimation: true, narrowSubmission: true }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
