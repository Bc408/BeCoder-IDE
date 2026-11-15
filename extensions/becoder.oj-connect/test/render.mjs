/* Copyright (c) BeCoder contributors. Licensed under GPL-3.0-or-later. */
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { default: renderMarkdown } = require('../out/markdown.js');
const output = path.resolve('../../tmp/oj-connect-audit/shared-workflow/render');
await mkdir(output, { recursive: true });
// Match the shipped extension's CommonJS package boundary, outside the root ESM package.
await writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'commonjs' }));
// Exercise the host bundler's lazy module boundary as well as the renderer itself.
const serviceProbe = path.join(output, 'markdown-service.cjs');
await build({ entryPoints: ['src/markdownService.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['./markdown'], outfile: serviceProbe });
await cp('out/markdown.js', path.join(output, 'markdown.js'));
assert.ok((await require(serviceProbe).default.render('$a+b$')).includes('katex'));
const labels = { testCases:'测试点信息', submittedAt:'提交时间',codeLength:'代码长度',source:'源码',viewSource:'在 BeCoder 中查看',compileSucceeded:'编译成功',compileFailed:'编译失败', submit: '提交', importCph: '导入 CPH', viewRecord: '查看结果', openOriginal: '打开原题', samples: '样例', sample: '样例', input: '输入', output: '输出', copy: '复制', copied: '已复制', language: '语言', continueQuery: '继续查询', stopTracking: '停止跟踪', record: '提交记录', score: '得分', time: '用时', owner: '用户', memory: '内存', compiler: '编译器输出', problem:'所属题目',verdict:'评测状态',resources:'用时/内存',statementLanguage:'题面语言',chooseLanguage:'提交时选择语言',verification_unavailable: '无法读取提交源码', tracking: '正在读取本次评测结果' };
let state;
Object.assign(labels, { importCph: '传送至 CPH', difficulty: '题目难度', tags: '题目标签', 'Time Limit': '时间限制', 'Memory Limit': '内存限制', samples: '输入输出样例', judging: 'Judging' });
const server = createServer(async (req, res) => {
	try {
		if (req.url === '/') {
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.end(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fixture'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https:; connect-src 'none';"><link rel="stylesheet" href="/katex.min.css"><link rel="stylesheet" href="/webview.css"></head><body><main id="app"></main><script nonce="fixture">window.__OJ_STATE__=${JSON.stringify(state).replace(/</g, '\\u003c')};window.__messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>{window.__messages.push(m);if(m.uuid && m.data.action==='renderMarkdown'){window.__renderMarkdown(m.data.markdown).then(data=>window.dispatchEvent(new MessageEvent('message',{data:{uuid:m.uuid,data}})));return;}if(m.uuid){if(m.data.action==='selectLanguage')window.__OJ_STATE__.languageId=m.data.languageId;setTimeout(()=>{window.dispatchEvent(new MessageEvent('message',{data:{type:'state',state:window.__OJ_STATE__}}));window.dispatchEvent(new MessageEvent('message',{data:{uuid:m.uuid}}));},0);}}});</script><script nonce="fixture" src="/webview.js"></script></body></html>`);
		} else {
			const filename = req.url.slice(1);
			if (!/^(webview\.(js|css)|katex\.min\.css|fonts\/[a-zA-Z0-9_.-]+)$/.test(filename)) { res.writeHead(404).end(); return; }
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
	await page.exposeFunction('__renderMarkdown', renderMarkdown);
	await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__copied = text; } } }); });
	const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.route('https://example.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="#507cab"/></svg>' }));
	for (const site of ['luogu', 'atcoder']) {
		const ref = site === 'luogu' ? { site, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } : { site, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		state = { kind: 'problem', labels, sourceName: site === 'luogu' ? 'P1001.cpp' : 'abc086_a.cpp', languages:[{id:'one',label:'C++20 with O2',family:'cpp'},{id:'two',label:'C++23 with O2',family:'cpp'}],languageId:'one', problem: { ref, title: site === 'luogu' ? 'P1001 A+B Problem · 中文题面' : 'A - Product · A long title that wraps in a narrow editor', limits: [], interactive: false, bodies: [{ locale: site === 'luogu' ? 'zh-CN' : 'en', sections: [{ heading: 'Problem / 题目描述', format: site === 'luogu' ? 'markdown' : 'html', content: site === 'luogu' ? '求 $a+b$。\n\n$$a^2+b^2=c^2$$\n\n![figure](https://example.org/figure.png)\n\n<script data-remote>alert(1)</script><img src="/image.png" onerror="window.pwned=1"><a href="command:evil">bad</a>' : '<p>Determine whether <var>a \\times b</var> is odd.</p><img src="https://example.org/figure.png"><script data-remote>window.pwned=1</script><a href="javascript:alert(1)">bad</a>' }] }, { locale: 'ja', sections: [{ format: 'html', content: '<h2>問題文</h2><p><var>a+b</var> を求めよ。</p>' }] }], samples: [{ input: ' 1  2\n\n', output: '3\n' }, { input: '', output: '' }] } };
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
		await page.goto(url); await page.locator('article').waitFor(); await page.locator('article pre').first().waitFor();
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
			await block.waitFor({timeout:3000}); const copiedCode = site === 'luogu' && await block.locator('..').evaluate(pre => pre.classList.contains('shiki')) ? code.replace(/\n$/, '') : code; assert.equal(await block.textContent(), copiedCode);
			if (language && language !== 'unknown-language') { assert.ok(await block.locator('span[style],span[class^="hljs-"]').count() > 0, language + ' must have syntax tokens'); }
			const pre = block.locator('..'); await pre.hover();
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
		const sampleCopy = page.locator('.sample-grid pre').first().getByRole('button', { name: '复制', exact: true });
		assert.equal(await sampleCopy.textContent(), '', 'samples use the same icon-only control');
		assert.equal(await sampleCopy.locator('svg[aria-hidden="true"]').count(), 1);
		assert.equal(await sampleCopy.evaluate(button => button.getBoundingClientRect().width), 28);
		await page.locator('.sample-grid pre').first().getByRole('button', { name: '复制', exact: true }).click();
		assert.equal(await page.evaluate(() => window.__copied), ' 1  2\n\n');
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
		await page.getByRole('combobox',{name:'语言',exact:true}).selectOption('two');
		assert.deepEqual(await page.evaluate(()=>window.__messages.at(-1).data),{action:'selectLanguage',languageId:'two'});
		await page.getByRole('button', { name: /提交.*\.cpp/ }).click();
		assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'submit' });
		for (const dark of [true, false]) {
			await page.evaluate(dark => { document.body.dataset.vscodeThemeKind = dark ? 'vscode-dark' : 'vscode-light'; }, dark);
			themeColors.push(await page.locator(site === 'luogu' ? 'article pre.shiki span[style]' : 'article code.language-php .hljs-keyword').first().evaluate(element => getComputedStyle(element).color));
			await page.addStyleTag({ content: `body { --vscode-editor-background:${dark ? '#1e1e1e' : '#fff'};--vscode-editor-foreground:${dark ? '#ddd' : '#222'};--vscode-descriptionForeground:${dark ? '#aaa' : '#666'};--vscode-button-background:#007acc;--vscode-button-hoverBackground:#006bb3;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:${dark ? '#333' : '#eee'};--vscode-button-secondaryForeground:${dark ? '#ddd' : '#222'};--vscode-focusBorder:#007acc;--vscode-textCodeBlock-background:${dark ? '#282828' : '#f4f4f4'};--vscode-font-size:14px;--vscode-font-family:'Segoe UI',sans-serif; }` });
			for (const width of [260, 320, 420, 460, 532, 1000]) {
				await page.setViewportSize({ width, height: 900 });
				if (site === 'luogu') {
					if (width <= 420) { assert.equal(await page.locator('.problem-limits').isVisible(), false, 'upstream hides metadata in the narrowest editor'); }
					else {
						await page.locator('.problem-difficulty .tag').waitFor({ state: 'visible' });
						assert.equal(await page.locator('header').evaluate(element => getComputedStyle(element).flexDirection), 'row', 'upstream header stays side by side');
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
		assert.notEqual(themeColors[0], themeColors[1], 'syntax colors follow live theme changes');
		await page.getByRole('combobox',{name:'题面语言',exact:true}).selectOption('ja'); assert.deepEqual(await page.evaluate(() => window.__messages.at(-1).data), { action: 'selectLocale', locale: 'ja' });
		const record = { problem: ref, id: '22', url: site === 'luogu' ? 'https://www.luogu.com.cn/record/22' : 'https://atcoder.jp/contests/abc086/submissions/22' };
		state = { kind: 'record', labels, sourceName: 'solution.cpp', record, tracking: true, snapshot: { ref: record, phase: 'judging', rawStatus: 'Judging', sourceVerification: 'not-checked', groups: [{ name: 'Subtask #0', rows: [['1', 'Judging'], ['2', 'AC', '2ms', '1KiB']] }] } };
		await page.goto(url); await page.locator('.testcase .spinner').waitFor();
		await page.addStyleTag({ content: 'body { --vscode-editor-background:#252931;--vscode-editor-foreground:#bbb;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }' });
		assert.equal(await page.locator('.testcase .spinner').count(), 1, 'only judging test cases spin');
		assert.equal(await page.locator('.testcase').first().locator(':scope > div').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(52, 152, 219)');
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
		state = { kind: 'record', labels, sourceName: 'solution.cpp', record, snapshot: { ref: record, phase: 'finished', rawStatus: 'AC', score: '50', language: 'C++20', time: '40 ms', memory: '1 MiB', sourceVerification: 'unavailable', source:'int main() {}',submittedAt:'2026-11-14 12:00:00',codeLength:'13 B',compileSucceeded:true, groups: [{ name: 'Tests', rows: [['1', 'AC'], ['2', 'AC']] }] } };
		await page.goto(url); await page.locator('.record-verdict').waitFor();
		await page.addStyleTag({content: 'body { --vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd;--vscode-font-size:14px;--vscode-font-family:Segoe UI,sans-serif; }'});
		assert.equal(await page.locator('.record-verdict').textContent(), site === 'luogu' ? 'Accepted' : 'AC', 'Luogu displays the full upstream verdict while other sites retain native text');
		assert.equal(await page.locator('.record-info > div').filter({ has: page.getByText('50', { exact: true }) }).locator('span').last().evaluate(element => getComputedStyle(element).color), 'rgb(243, 156, 17)', 'upstream partial score uses orange');
		const infoLabels = await page.locator('.record-info > div > span:first-child').allTextContents();
		assert.ok(infoLabels.indexOf(labels.language) < infoLabels.indexOf(labels.codeLength), 'language precedes code length like upstream');
		assert.equal(await page.getByRole('button', { name: '继续查询', exact: true }).count(), 0);
		assert.equal(await page.getByRole('button', { name: '停止跟踪', exact: true }).count(), 0);
		assert.equal(await page.getByText('无法读取提交源码', { exact: true }).count(), 0);
		assert.ok(await page.locator('.testcase').count() > 0);
		await page.getByRole('link',{name:'在 BeCoder 中查看'}).click();
		assert.deepEqual(await page.evaluate(()=>window.__messages.at(-1).data),{action:'viewSource'});
		await page.screenshot({ path: path.join(output, `${site}-record.png`), fullPage: true });
		state = { ...state, message: 'Connection stopped', canRetry: true };
		await page.goto(url); await page.getByRole('button', { name: '继续查询', exact: true }).waitFor();
	}
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ passed: true, sites: 2, screenshots: 36, copyIcons: true, math: true, samplesPreserved: true, hostileMarkupRejected: true, fixedActions: true, metadata: true, judgingAnimation: true, terminalStopsAnimation: true, narrowSubmission: true }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
