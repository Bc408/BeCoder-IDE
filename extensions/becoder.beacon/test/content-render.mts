/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

declare global { interface Window { firstCodeLine: Element | null } }

const root = path.resolve(import.meta.dirname, '../dist');
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<html lang="zh-CN"><head><link rel="stylesheet" href="/beacon.css"></head><body><div id="root"></div><script>window.acquireVsCodeApi=()=>({postMessage(){}})</script><script src="/beacon.js"></script></body></html>');
		return;
	}
	const file = path.resolve(root, '.' + request.url);
	if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
	response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
	response.end(file.endsWith('syntax-worker.js') ? 'const post=self.postMessage.bind(self);self.postMessage=(value)=>setTimeout(()=>post(value),400);\n' + fs.readFileSync(file, 'utf8') : fs.readFileSync(file));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${address.port}`);
	const publish = (text: string, status = 'streaming') => page.evaluate(({ text, status }) => window.postMessage({ type: 'snapshot', configured: true, busy: status === 'streaming', messages: [{ id: 100, role: 'assistant', text, reasoning: '', activities: [], status, createdAt: Date.now() }] }, '*'), { text, status });
	const largeSource = 'int pending = 1;\n'.repeat(3000);
	await publish('```cpp\n' + largeSource + '```', 'complete');
	await page.waitForFunction(source => document.querySelector('.code-block code')?.textContent === source, largeSource);
	assert.ok(await page.locator('.code-block code').evaluate(code => code.childNodes.length <= 2), 'Pending syntax exposes the full source without allocating thousands of placeholder line nodes');
	await publish('```cpp\nint first = 1;\n', 'complete');
	await page.waitForSelector('.code-line > span');
	await page.evaluate(() => { window.firstCodeLine = document.querySelector('.code-line'); });
	await publish('```cpp\nint first = 1;\nint appended = 2;\n');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent?.includes('appended'), undefined, { timeout: 300 });
	assert.equal(await page.evaluate(() => document.querySelector('.code-line') === window.firstCodeLine), true, 'Stable lines reuse their DOM while the next syntax response is pending');
	await page.waitForFunction(() => document.querySelectorAll('.code-line > span').length > 6);
	await publish('```python\nprint("replacement")\n```', 'complete');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === 'print("replacement")\n');
	assert.equal(await page.locator('.code-block').textContent().then(text => text?.includes('appended')), false);
	await publish('```cpp\nint final = 3;\n\n```', 'complete');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === 'int final = 3;\n\n');
	await page.waitForFunction(() => document.querySelectorAll('.code-line').length === 2);
	await publish('```cpp\nint final = 3;\n```', 'complete');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === 'int final = 3;\n');
	await publish('```cpp\nint final = 3;\nint tail = 4;\n```', 'complete');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === 'int final = 3;\nint tail = 4;\n');
	await publish('```unknown-language\n<plain> & literal\n```', 'stopped');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === '<plain> & literal\n');
	await page.waitForTimeout(500);
	assert.equal(await page.locator('.code-line').count(), 0, 'A stale response cannot recolor the new unknown language');
	await publish('');
	await page.locator('.code-block').waitFor({ state: 'detached' });
	const wrapSource = 'int first = 1;\n\n\t' + 'long_identifier_'.repeat(80) + ';\n\n';
	await publish('```cpp\n' + wrapSource + '```', 'complete');
	await page.waitForFunction(source => document.querySelector('.code-block code')?.textContent === source, wrapSource);
	const plainHeight = await page.locator('.code-block pre').evaluate(pre => pre.getBoundingClientRect().height);
	await page.waitForFunction(() => document.querySelectorAll('.code-line').length === 4);
	const coloredHeight = await page.locator('.code-block pre').evaluate(pre => pre.getBoundingClientRect().height);
	assert.ok(Math.abs(plainHeight - coloredHeight) < 1, `Coloring preserves tabs, blank rows and unwrapped line height (${plainHeight} vs ${coloredHeight})`);
	await page.getByRole('button', { name: '\u81ea\u52a8\u6362\u884c' }).click();
	assert.ok(await page.locator('.code-scroller').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Wrapping contains a long identifier without horizontal overflow');
	assert.equal(await page.locator('.code-block code').textContent(), wrapSource, 'Wrapping preserves the authoritative source');
	const selectCode = (code: HTMLElement) => {
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range);
		const text = selection.toString(); selection.removeAllRanges();
		return text;
	};
	const selected = await page.locator('.code-block code').evaluate(selectCode);
	const previousLayout = await page.addStyleTag({ content: '.code-line { display: inline; }' });
	const previousSelection = await page.locator('.code-block code').evaluate(selectCode);
	await previousLayout.evaluate(style => style.parentNode?.removeChild(style));
	assert.equal(selected, previousSelection, 'Native selection retains its previous whitespace behavior after wrapping');
	await page.locator('.code-block').screenshot({ path: path.resolve(import.meta.dirname, '../../../tmp/beacon-render/code-wrap-review.png') });
	await publish('```cpp\nint reopened = 4;\n```', 'complete');
	await page.waitForSelector('.code-line > span');
	assert.equal(await page.locator('.code-block code').textContent(), 'int reopened = 4;\n', 'Closing and reopening a block has independent source state');
	const failed = await browser.newPage();
	await failed.route('**/onig.wasm', route => route.abort());
	await failed.goto(`http://127.0.0.1:${address.port}`);
	await failed.evaluate(() => window.postMessage({ type: 'snapshot', configured: true, messages: [{ id: 100, role: 'assistant', text: '```cpp\nint readable = 5;\n```', reasoning: '', activities: [], status: 'complete', createdAt: 1 }] }, '*'));
	await failed.waitForFunction(() => document.querySelector('.code-block code')?.textContent === 'int readable = 5;\n');
	await failed.waitForTimeout(500);
	assert.equal(await failed.locator('.code-block code').textContent(), 'int readable = 5;\n', 'Resource failure leaves the complete source visible');
	console.log('Pending syntax never hides source tails; stable lines survive append; replacement/language change are isolated.');
} finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
