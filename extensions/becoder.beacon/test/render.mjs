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
	if (request.url === '/' || request.url === '/configuration') {
		response.setHeader('Content-Type', 'text/html');
		response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/beacon.css"></head><body class="vscode-dark" data-surface="${request.url === '/configuration' ? 'configuration' : 'chat'}"><div id="root"></div><script src="/beacon.js"></script></body></html>`);
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
	await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: false, busy: false, messages: [] }, '*'));
	await page.getByText('请在左侧 Beacon 面板配置服务商和模型后开始。').waitFor();
	assert.equal(await page.getByRole('button', { name: '配置 API Key', exact: true }).count(), 0);
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled());
	await page.screenshot({ path: path.join(output, 'chat-empty.png') });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: true, busy: false, messages: [] }, '*'));
	await page.getByRole('textbox').fill('解释这段代码');
	await page.getByRole('textbox').press('Enter');
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '解释这段代码' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: true, busy: true, messages: [] }, '*'));
	assert.ok(await page.getByRole('button', { name: '新聊天', exact: true }).isDisabled());
	await page.getByRole('button', { name: '停止生成', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'stop' });
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
	await page.evaluate(() => window.postMessage({ type: 'snapshot', activeId: 'one', history: [{ id: 'one', title: '代码与泰勒展开式', updatedAt: Date.now() }, { id: 'two', title: '图论学习：最短路与最小生成树的区别', updatedAt: Date.now() - 86400000 }] }, '*'));
	await page.getByRole('textbox').fill('保留这一条草稿');
	await page.getByRole('button', { name: '聊天记录', exact: true }).click();
	await page.getByRole('searchbox').fill('图论');
	assert.equal(await page.locator('.history-row').count(), 1);
	await page.getByRole('searchbox').fill('');
	await page.screenshot({ path: path.join(output, 'history-dark-360.png') });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.getByRole('button', { name: '重命名聊天', exact: true }).first().click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'renameHistory', conversationId: 'one' });
	await page.getByRole('button', { name: '删除聊天', exact: true }).last().click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'deleteHistory', conversationId: 'two' });
	await page.locator('.history-open').last().click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'openHistory', conversationId: 'two' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', activeId: 'two', messages: [] }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
	await page.evaluate(() => window.postMessage({ type: 'snapshot', activeId: 'one', messages: [] }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '保留这一条草稿');
	await page.getByRole('button', { name: '连接设置', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'settings' });
	await page.getByRole('button', { name: '新聊天', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'clear' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', saveFailed: true }, '*'));
	await page.getByRole('button', { name: '重试保存', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'saveHistory' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', saveFailed: false, historyUnreadable: true }, '*'));
	await page.getByRole('alert').filter({ hasText: '无法读取聊天记录' }).waitFor();
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled());
	await page.evaluate(() => window.postMessage({ type: 'snapshot', historyUnreadable: false }, '*'));
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fafafa; --vscode-editor-background:#fff; --vscode-foreground:#292d33; --vscode-descriptionForeground:#656970; --vscode-input-background:#eee; --vscode-input-foreground:#222; --vscode-textCodeBlock-background:#f0f1f3; }' });
	await page.screenshot({ path: path.join(output, 'light-360.png') });
	await page.goto(`http://127.0.0.1:${server.address().port}/configuration`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-font-family:Segoe UI, sans-serif; --vscode-textLink-foreground:#7db9e8; --vscode-button-background:#365a78; --vscode-button-foreground:#fff; --vscode-button-secondaryBackground:#454c57; --vscode-widget-border:#343b44; }' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: false, busy: false, connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: '', keyConfigured: false, models: [], loading: false, error: '' } }, '*'));
	await page.getByRole('button', { name: '配置 API Key', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'configure' });
	assert.equal(await page.getByRole('textbox').count(), 1);
	await page.screenshot({ path: path.join(output, 'configuration-dark-360.png') });
	await page.getByRole('button', { name: '打开聊天', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'openChat' });
	await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: true, busy: true, connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: '', keyConfigured: true, models: ['deepseek-v4-flash'], loading: false, error: '' } }, '*'));
	await page.getByText('API Key 已保存', { exact: true }).waitFor();
	assert.ok(await page.getByRole('button', { name: '更新 API Key', exact: true }).isDisabled());
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Configuration fits a narrow sidebar');
	await page.evaluate(() => window.postMessage({ type: 'snapshot', busy: false, connection: { provider: 'ollama', baseURL: 'http://localhost:11434/v1', model: '', keyConfigured: false, models: ['local-chat'], loading: false, error: '' } }, '*'));
	await page.getByText('API Key 可选', { exact: true }).waitFor();
	await page.getByRole('button', { name: '获取模型', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'fetchModels' });
	await page.getByRole('combobox', { name: '聊天模型', exact: true }).selectOption('local-chat');
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'updateConnection', field: 'model', value: 'local-chat', provider: 'ollama' });
	await page.getByRole('combobox', { name: '服务商', exact: true }).selectOption('bailian');
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'updateConnection', field: 'provider', value: 'bailian', provider: 'ollama' });
	await page.getByRole('button', { name: '打开 Beacon 设置', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'openSettings' });
	assert.deepStrictEqual(errors, []);
	console.log('Production UI: code lines, exact clipboard, four formulas, narrow/wide layout and no browser errors passed. Screenshots: ' + output);
} finally {
	await browser.close();
	await new Promise(resolve => server.close(resolve));
}
