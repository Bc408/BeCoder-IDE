/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Exercise production paste and preview controls with an isolated host fixture.
// Native Windows clipboard delivery and real editor/PDF opening remain owner acceptance.
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../tmp/beacon-attachments-2026-10-05');
fs.mkdirSync(output, { recursive: true });
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-beacon-test\' \'wasm-unsafe-eval\'; worker-src blob:; connect-src \'self\'; style-src \'self\' \'unsafe-inline\'; font-src \'self\'; img-src \'self\' data:;"><link rel="stylesheet" href="/beacon.css"><style>:root{--vscode-font-family:Segoe UI,sans-serif;--vscode-foreground:#ccc;--vscode-sideBar-background:#21252b;--vscode-descriptionForeground:#999;--vscode-widget-border:#444;--vscode-focusBorder:#80bfff;--vscode-list-hoverBackground:#ffffff10}</style></head><body class="vscode-dark"><div id="root"></div><script nonce="beacon-test" src="/beacon.js"></script></body></html>');
		return;
	}
	const file = path.resolve(root, 'dist', '.' + request.url);
	if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
	response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
	response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		let counter = 0;
		let state = { type: 'snapshot', activeId: 'preview-fixture', configured: true, busy: false, permission: 'none', attachments: [], messages: [], history: [], saveFailed: false, historyUnreadable: false, error: '', connection: { provider: 'deepseek', model: 'vision', baseURL: 'https://api.deepseek.com', parameters: {}, keyConfigured: true, loading: false, models: [], error: '', capabilities: { purpose: 'chat', vision: 'supported', tools: 'unsupported', reasoning: 'unsupported' } } };
		const publish = () => window.postMessage({ ...state, attachments: state.attachments.map(item => ({ ...item, contents: '' })), messages: state.messages.map(message => ({ ...message, attachments: message.attachments?.map(item => ({ ...item, contents: '' })) })) }, '*');
		window.hostMessages = [];
		window.fixture = { update: patch => { state = { ...state, ...patch }; publish(); }, snapshot: () => state };
		window.acquireVsCodeApi = () => ({ postMessage: message => {
			window.hostMessages.push(message);
			if (message.type === 'ready') { publish(); }
			if (message.type === 'pasteImages') {
				state.attachments.push(...message.images.map(image => { const id = 'clipboard-' + ++counter; return { ...image, id, path: 'clipboard:' + id, source: 'clipboard', kind: 'image', truncated: false }; })); publish();
			}
			if (message.type === 'previewAttachment') {
				const item = [...state.attachments, ...state.messages.flatMap(message => message.attachments ?? [])].find(item => item.id === message.id);
				if (item) { window.postMessage({ type: 'attachmentPreview', id: item.id, url: 'data:' + item.mediaType + ';base64,' + item.contents }, '*'); }
			}
			if (message.type === 'removeAttachment') { state.attachments = state.attachments.filter(item => item.id !== message.id); publish(); }
		} });
	});
	await page.goto(`http://127.0.0.1:${server.address().port}/`);
	await page.getByRole('textbox', { name: '向 Beacon 提问' }).waitFor();
	await page.waitForFunction(() => !document.querySelector('.permission-trigger').disabled);
	const png = await page.evaluate(() => {
		const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
		const context = canvas.getContext('2d'); context.fillStyle = '#ececec'; context.fillRect(0, 0, 1600, 1000); context.fillStyle = '#285772'; context.font = '64px sans-serif'; context.fillText('Screenshot preview', 70, 140); context.fillRect(70, 240, 1460, 30);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	const paste = async (names, type = 'image/png', contents = png) => page.evaluate(({ names, type, contents }) => {
		const data = new DataTransfer();
		for (const name of names) { data.items.add(new File([Uint8Array.from(atob(contents), char => char.charCodeAt(0))], name, { type })); }
		const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
		document.querySelector('.composer textarea').dispatchEvent(event);
		return event.defaultPrevented;
	}, { names, type, contents });
	for (const permission of ['none', 'workspace', 'computer']) {
		await page.evaluate(permission => window.fixture.update({ permission, attachments: [] }), permission);
		assert.equal(await paste(['Screenshot.png']), true);
		await page.waitForFunction(() => document.querySelectorAll('.draft-attachments .attachment-card').length === 1);
		assert.equal(await page.locator('.attachment-warning').count(), 0);
		assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isEnabled(), true);
		await page.locator('.attachment-open').click();
		await page.waitForFunction(() => document.querySelector('.image-preview-picture')?.naturalWidth === 1600);
		assert.equal(await page.locator('dialog').evaluate(node => node.open), true);
		await page.keyboard.press('Escape'); await page.waitForSelector('dialog', { state: 'detached' });
	}
	assert.equal(await page.evaluate(() => {
		const data = new DataTransfer(); data.setData('text/plain', 'ordinary text');
		const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); document.querySelector('.composer textarea').dispatchEvent(event);
		return event.defaultPrevented;
	}), false, 'Plain text retains the browser paste behavior');
	await page.evaluate(() => window.fixture.update({ attachments: [] }));
	await paste(['first.png', 'second.png']); await page.waitForFunction(() => document.querySelectorAll('.attachment-open').length === 2);
	await page.screenshot({ path: path.join(output, 'attachments.png') });
	await page.locator('.attachment-open').first().click(); await page.waitForFunction(() => document.querySelector('.image-preview-picture')?.naturalWidth === 1600);
	const width = await page.locator('.image-preview-picture').evaluate(node => node.getBoundingClientRect().width);
	await page.getByRole('button', { name: '放大', exact: true }).click();
	assert.ok(await page.locator('.image-preview-picture').evaluate(node => node.getBoundingClientRect().width) > width);
	await page.locator('.image-preview-picture').click({ position: { x: 30, y: 30 } });
	assert.equal(await page.locator('dialog').count(), 1, 'Clicking the image does not close its viewer');
	await page.locator('.image-preview-stage').evaluate(node => node.scrollTo(0, 0));
	const bounds = await page.locator('.image-preview-stage').boundingBox();
	await page.mouse.move(bounds.x + 100, bounds.y + 100); await page.mouse.down(); await page.mouse.move(bounds.x + 50, bounds.y + 70, { steps: 4 }); await page.mouse.up();
	assert.ok(await page.locator('.image-preview-stage').evaluate(node => node.scrollLeft) > 0, 'Zoomed images can be panned');
	await page.keyboard.press('0'); await page.keyboard.press('ArrowRight');
	await page.getByText('2 / 2', { exact: true }).waitFor();
	await page.waitForFunction(() => document.querySelector('.image-preview-picture')?.naturalWidth === 1600);
	await page.screenshot({ path: path.join(output, 'image-preview.png') });
	await page.getByRole('button', { name: '关闭预览', exact: true }).click();
	await page.waitForFunction(() => document.activeElement?.classList.contains('attachment-open'));
	assert.equal(await page.locator('.attachment-open').first().evaluate(node => document.activeElement === node), true, 'Closing restores the attachment trigger focus');
	await page.setViewportSize({ width: 280, height: 650 });
	await page.locator('.attachment-open').first().click(); await page.waitForFunction(() => document.querySelector('.image-preview-picture')?.naturalWidth === 1600);
	assert.ok(await page.locator('dialog').evaluate(node => node.getBoundingClientRect().width <= innerWidth), 'The viewer fits a narrow Beacon pane');
	await page.locator('.image-preview-stage').click({ position: { x: 3, y: 3 } }); await page.waitForSelector('dialog', { state: 'detached' });
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ connection: { ...state.connection, capabilities: { ...state.connection.capabilities, vision: 'unsupported' } } }); });
	await page.waitForFunction(() => document.querySelector('.send').disabled);
	assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), true);
	await page.locator('.attachment-open').first().click(); await page.waitForSelector('dialog[open]'); await page.keyboard.press('Escape'); await page.waitForSelector('dialog', { state: 'detached' });
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ attachments: [], messages: [{ id: 1, role: 'user', text: '', status: 'complete', attachments: state.attachments, activities: [], reasoning: '' }] }); });
	await page.locator('.message-attachments .attachment-open').first().click(); await page.waitForFunction(() => document.querySelector('.image-preview-picture')?.naturalWidth === 1600); await page.keyboard.press('Escape'); await page.waitForSelector('dialog', { state: 'detached' });
	await page.evaluate(() => window.fixture.update({ permission: 'workspace', messages: [], attachments: [{ id: 'source', name: 'main.cpp', path: 'C:/main.cpp', source: 'internal', kind: 'text', contents: '', truncated: false }] }));
	await page.getByRole('button', { name: '在编辑器中打开 main.cpp' }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.hostMessages.at(-1)), { type: 'openAttachment', id: 'source' });
	await page.setViewportSize({ width: 360, height: 800 });
	await page.evaluate(() => window.fixture.update({ busy: true, attachments: [], retry: { attempt: 1, limit: 2 }, messages: [{ id: 1, role: 'user', text: 'question', status: 'complete', activities: [] }, { id: 2, role: 'assistant', text: '', reasoning: '', activities: [], status: 'streaming', activeStartedAt: Date.now() }], error: '' }));
	await page.getByText('连接暂时中断，正在重连（1/2）…', { exact: true }).waitFor();
	assert.equal(await page.locator('.error').count(), 0);
	await page.screenshot({ path: path.join(output, 'recovery-reconnecting.png') });
	await page.getByRole('button', { name: '暂停生成', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.hostMessages.at(-1)), { type: 'stop' });
	await page.evaluate(() => window.fixture.update({ retry: { attempt: 2, limit: 2 } }));
	await page.getByText('连接暂时中断，正在重连（2/2）…', { exact: true }).waitFor();
	// Production snapshots omit the optional retry field once the connection recovers.
	await page.evaluate(() => { const state = window.fixture.snapshot(); delete state.retry; window.fixture.update({}); });
	await page.getByText('正在思考', { exact: true }).waitFor();
	assert.equal(await page.getByText(/正在重连/).count(), 0, 'Clearing recovery restores normal copy before any output arrives');
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ messages: [state.messages[0], { ...state.messages[1], reasoning: '恢复后的正常思考内容' }] }); });
	await page.locator('.reasoning-details > summary').getByText('正在思考', { exact: true }).waitFor();
	assert.equal(await page.getByText(/正在重连/).count(), 0, 'Streaming reasoning must not retain recovery copy');
	await page.screenshot({ path: path.join(output, 'recovery-restored.png') });
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ busy: false, messages: [state.messages[0], { ...state.messages[1], status: 'complete', text: 'answer', durationMs: 1200 }] }); });
	await page.locator('.assistant .markdown').filter({ hasText: /^answer$/ }).waitFor();
	await page.getByText('用时 1s', { exact: true }).waitFor();
	assert.equal(await page.getByText(/正在重连/).count(), 0);
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ messages: [state.messages[0], { ...state.messages[1], status: 'error', text: '', failure: { kind: 'connection', retries: 2 } }], error: '暂时无法连接服务商，请稍后重试。已尝试自动重连 2 次。' }); });
	await page.locator('.connection-notice').waitFor();
	assert.equal(await page.locator('.error').count(), 0);
	assert.equal(await page.getByRole('button', { name: '重新回答', exact: true }).isEnabled(), true);
	await page.screenshot({ path: path.join(output, 'recovery-failure.png') });
	await page.evaluate(() => { const state = window.fixture.snapshot(); window.fixture.update({ messages: [state.messages[0], { ...state.messages[1], failure: undefined }], error: '服务商拒绝了当前 API Key 或模型访问权限。' }); });
	await page.locator('.error').waitFor();
	assert.equal(await page.locator('.connection-notice').count(), 0);
	assert.deepStrictEqual(errors, []);
	console.log('Attachment preview and request recovery status, cancellation routing, successful reset and failure severity passed.');
} finally {
	await browser?.close();
	await new Promise(resolve => server.close(resolve));
}
