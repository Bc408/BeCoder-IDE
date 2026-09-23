/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the production Webview bundle with an isolated mock host, never a provider key.
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../tmp/beacon-render');
fs.mkdirSync(output, { recursive: true });
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/beacon.css"></head><body class="vscode-dark"><div id="root"></div><script src="/beacon.js"></script></body></html>');
		return;
	}
	const file = path.resolve(root, 'dist', '.' + request.url);
	if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
	response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
	response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		window.acquireVsCodeApi = () => ({ postMessage: message => { (window.messages ??= []).push(message); } });
	});
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-editor-background:#181b20; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-input-background:#1b1f24; --vscode-input-foreground:#d4d4d4; --vscode-input-placeholderForeground:#8b919a; --vscode-textCodeBlock-background:#171b20; --vscode-font-family:Segoe UI, sans-serif; --vscode-editor-font-family:Consolas, monospace; --vscode-button-background:#505965; --vscode-button-foreground:#fff; --vscode-scrollbarSlider-background:#454c57; --vscode-widget-border:#343b44; --vscode-focusBorder:#629ad1; }' });
	const code = 'int a,b;\n\n// preserved blank line\n    cin>>a>>b;\n    cout<<a+b;';
	const text = '下面是代码和公式。\n\n```cpp\n' + code + '\n```\n\n常见的泰勒展开式：\n\n\\[ f(x)=f(0)+f\'(0)x+\\frac{f^{(2)}(0)}{2!}x^2+\\cdots \\]\n\n行内公式 \\(x^2\\)，以及 $y^2$。\n\n$$\ne^x=1+x+\\frac{x^2}{2!}+\\cdots\n$$';
	await page.evaluate(text => window.postMessage({ type: 'snapshot', configured: true, busy: false, error: '', canRetry: false, messages: [{ id: 1, role: 'user', text: '给一份代码和泰勒展开式', status: 'complete', reasoning: '' }, { id: 2, role: 'assistant', text, reasoning: '', status: 'complete' }] }, '*'), text);
	await page.waitForSelector('.code-line');
	await page.waitForSelector('.katex-display');
	assert.equal(await page.locator('.code-block pre code').textContent(), code);
	assert.equal(await page.locator('.katex-display').count(), 2);
	assert.equal(await page.locator('.katex').count(), 4);
	const top = await page.locator('.code-line').evaluateAll(lines => lines.map(line => line.getBoundingClientRect().top));
	assert.ok(top.at(-1) > top[0] + 40, 'Code lines must remain separate');
	await page.getByRole('button', { name: '复制代码', exact: true }).click();
	// Windows normalizes text clipboard line endings to CRLF.
	assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), code);
	for (const width of [760, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.screenshot({ path: path.join(output, `dark-${width}.png`) });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page horizontal overflow');
	}
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fafafa; --vscode-editor-background:#fff; --vscode-foreground:#292d33; --vscode-descriptionForeground:#656970; --vscode-input-background:#eee; --vscode-input-foreground:#222; --vscode-textCodeBlock-background:#f0f1f3; }' });
	await page.screenshot({ path: path.join(output, 'light-360.png') });
	assert.deepStrictEqual(errors, []);
	console.log('Production UI: code lines, exact clipboard, four formulas, narrow/wide layout and no browser errors passed. Screenshots: ' + output);
} finally {
	await browser.close();
	await new Promise(resolve => server.close(resolve));
}
