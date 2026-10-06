/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'tmp/becoder-hover-2026-10-06/browser');
fs.mkdirSync(output, { recursive: true });
await build({ entryPoints: [path.join(root, 'extensions/becoder.shared/browser/hover.ts')], outfile: path.join(output, 'hover.js'), bundle: true, format: 'esm', platform: 'browser', target: 'chrome142' });

const variables = `:root{--vscode-font-family:Segoe UI,sans-serif;--vscode-foreground:#ccc;--vscode-sideBar-background:#21252b;--vscode-editor-background:#181a1f;--vscode-editorHoverWidget-background:#25282e;--vscode-editorHoverWidget-foreground:#ccc;--vscode-editorHoverWidget-border:#45494e;--vscode-widget-border:#45494e;--vscode-descriptionForeground:#999;--vscode-focusBorder:#80bfff;--vscode-list-hoverBackground:#ffffff10;--becoder-hover-delay:80;--becoder-hover-radius:8px}`;
const pageHtml = (body, css, script, surface = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-hover-test' 'wasm-unsafe-eval' 'self'; worker-src blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;"><link rel="stylesheet" href="${css}"><style>${variables}</style></head><body class="vscode-dark" data-surface="${surface}">${body}${script}</body></html>`;
const moduleScript = '<script nonce="hover-test" type="module">import {installHovers} from "/unit/hover.js"; window.hovers=installHovers({nativeTitles:"#toolbarContainer [title]"});</script>';
const unit = `<style>body{margin:0;height:320px;font-family:Segoe UI,sans-serif}.clip{position:absolute;right:8px;bottom:8px;width:48px;height:32px;overflow:hidden}button{height:30px;min-width:40px}#multi{position:absolute;left:12px;top:100px}#plain{position:absolute;left:12px;top:40px}#long{position:absolute;left:12px;top:160px}</style><button id="plain" data-becoder-tooltip="连接设置" aria-label="连接设置" aria-describedby="existing"><svg width="14" height="14"></svg></button><span id="existing">既有说明</span><button id="multi" data-becoder-tooltip="第一行&#10;第二行">多行</button><button id="long" data-becoder-tooltip="${'D:/很长的路径/'.repeat(25)}">路径</button><div class="clip"><button id="edge" data-becoder-tooltip="侧栏边缘的提示">边缘</button></div><div id="toolbarContainer"><button id="native" title="放大"></button></div><span id="annotation" title="文档注释">文档</span>`;
const routes = {
	'/beacon': pageHtml('<div id="root"></div>', '/beacon/beacon.css', '<script nonce="hover-test" src="/beacon/beacon.js"></script>'),
	'/settings': pageHtml('<div id="root"></div>', '/beacon/beacon.css', '<script nonce="hover-test" src="/beacon/beacon.js"></script>', 'configuration'),
	'/cph': pageHtml('<div id="app"></div>', '/cph/judge.css', '<script nonce="hover-test" src="/cph/judge.js"></script>'),
	'/pdf': pageHtml('<div id="toolbarContainer"><button id="zoomIn" title="放大"><span>放大</span></button></div><div class="annotationLayer"><span title="原有文档注释">注释</span></div>', '/pdf/hover.css', '<script nonce="hover-test" src="/pdf/hover.js" type="module"></script>'),
	'/unit': pageHtml(unit, '/unit/hover.css', moduleScript)
};
const folders = { '/unit/': output, '/beacon/': path.join(root, 'extensions/becoder.beacon/dist'), '/cph/': path.join(root, 'extensions/becoder.cph/dist'), '/pdf/': path.join(root, 'extensions/mathematic.vscode-pdf/dist') };
const server = createServer((request, response) => {
	if (routes[request.url]) { response.setHeader('Content-Type', 'text/html'); response.end(routes[request.url]); return; }
	for (const [prefix, folder] of Object.entries(folders)) {
		if (!request.url.startsWith(prefix)) { continue; }
		const file = path.resolve(folder, request.url.slice(prefix.length));
		if (!file.startsWith(folder + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { break; }
		response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
		response.end(fs.readFileSync(file)); return;
	}
	response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 390, height: 320 } });
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(origin + '/unit');
	await page.waitForFunction(() => !!window.hovers);
	const hover = page.locator('#becoder-hover');
	await page.locator('#plain').hover();
	assert.equal(await hover.isVisible(), false, 'Entering a target must respect the configured delay');
	await hover.waitFor({ state: 'visible' });
	assert.equal(await hover.textContent(), '连接设置');
	assert.equal(await page.locator('#plain').getAttribute('aria-describedby'), 'existing becoder-hover');
	const style = await hover.evaluate(element => { const css = getComputedStyle(element); return { font: css.fontSize, line: css.lineHeight, radius: css.borderRadius, padding: css.padding, background: css.backgroundColor }; });
	assert.deepEqual(style, { font: '12px', line: '19px', radius: '8px', padding: '2px 8px', background: 'rgb(37, 40, 46)' });
	await page.keyboard.press('Escape'); assert.equal(await hover.isVisible(), false);
	assert.equal(await page.locator('#plain').getAttribute('aria-describedby'), 'existing');
	await page.locator('#multi').focus(); await hover.waitFor({ state: 'visible' }); assert.equal(await hover.textContent(), '第一行\n第二行');
	await page.locator('#plain').focus(); await hover.waitFor({ state: 'visible' });
	await page.locator('#plain').evaluate(element => element.setAttribute('data-becoder-tooltip', '<script>动态内容</script>'));
	await page.waitForFunction(() => document.querySelector('#becoder-hover').textContent === '<script>动态内容</script>');
	assert.equal(await hover.locator('script').count(), 0);
	await page.locator('#plain').evaluate(element => element.remove()); await hover.waitFor({ state: 'hidden' });
	await page.locator('#edge').hover(); await hover.waitFor({ state: 'visible' });
	const edge = await hover.boundingBox(); assert.ok(edge.x >= 8 && edge.y >= 8 && edge.x + edge.width <= 382.1 && edge.y + edge.height <= 312.1);
	assert.equal(await hover.evaluate(element => element.matches(':popover-open')), true, 'A clipped card must not clip the shared hover');
	await page.screenshot({ path: path.join(output, 'edge-hover.png') });
	await page.locator('#edge').click(); assert.equal(await hover.isVisible(), false);
	await page.locator('#long').focus(); await hover.waitFor({ state: 'visible' });
	const long = await hover.boundingBox(); assert.ok(long.width <= 374 && long.height <= 304);
	await page.evaluate(() => document.dispatchEvent(new Event('scroll'))); assert.equal(await hover.isVisible(), false);
	await page.locator('#native').hover(); await hover.waitFor({ state: 'visible' });
	assert.equal(await hover.textContent(), '放大'); assert.equal(await page.locator('#native').getAttribute('title'), '');
	await page.locator('#native').evaluate(element => { element.title = 'Zoom in'; });
	await page.waitForFunction(() => document.querySelector('#becoder-hover').textContent === 'Zoom in');
	assert.equal(await page.locator('#annotation').getAttribute('title'), '文档注释');
	await page.evaluate(() => window.hovers.dispose());
	assert.equal(await page.locator('#native').getAttribute('title'), 'Zoom in'); assert.equal(await hover.count(), 0);
	await page.locator('#multi').focus(); await page.waitForTimeout(100); assert.equal(await hover.count(), 0);
	await page.goto(origin + '/unit'); await page.waitForFunction(() => !!window.hovers);
	await page.locator('#multi').focus(); await page.locator('#native').focus();
	await hover.waitFor({ state: 'visible' }); assert.equal(await hover.textContent(), '放大', 'A retired target must never appear after focus changes');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	assert.equal(await hover.evaluate(element => getComputedStyle(element).animationName), 'none');
	await page.evaluate(() => { document.documentElement.style.setProperty('--becoder-hover-radius', '5px'); document.documentElement.style.setProperty('--vscode-editorHoverWidget-background', '#ffffff'); document.documentElement.style.setProperty('--vscode-editorHoverWidget-foreground', '#000000'); });
	assert.equal(await hover.evaluate(element => getComputedStyle(element).borderRadius), '5px');
	assert.equal(await hover.evaluate(element => getComputedStyle(element).color), 'rgb(0, 0, 0)');
	await page.setViewportSize({ width: 390, height: 340 }); await hover.waitFor({ state: 'hidden' });
	await page.addInitScript(() => {
		window.hostMessages = [];
		const connection = { provider: 'deepseek', model: 'test', baseURL: 'https://api.deepseek.com', parameters: {}, keyConfigured: true, loading: false, models: [], error: '', capabilities: { purpose: 'chat', vision: 'supported', tools: 'unsupported', reasoning: 'unsupported' } };
		window.translations = { settings: '设置', runAgain: '再次运行', deleteTestcase: '删除测试', copy: '复制' };
		window.acquireVsCodeApi = () => ({
			getState: () => undefined, setState: () => {},
			postMessage: message => {
				window.hostMessages.push(message);
				if (message.type === 'ready') { setTimeout(() => window.postMessage({ type: 'snapshot', activeId: 'test', configured: true, busy: false, permission: 'none', attachments: [], messages: [], history: [], saveFailed: false, historyUnreadable: false, error: '', connection }, '*'), 0); }
				if (message.command === 'ready') { setTimeout(() => window.postMessage({ command: 'state', state: { revision: 'test', source: 'main.cpp', name: 'Example', local: true, busy: false, message: '', cases: [{ id: 0, testcase: { id: 0, input: '1', output: '2' }, result: null }] } }, '*'), 0); }
			}
		});
	});
	await page.goto(origin + '/beacon'); await page.getByRole('button', { name: '连接设置', exact: true }).hover(); await hover.waitFor({ state: 'visible' });
	assert.equal(await hover.textContent(), '连接设置'); assert.equal(await page.getByRole('button', { name: '连接设置', exact: true }).getAttribute('title'), null);
	await page.screenshot({ path: path.join(output, 'beacon-hover.png') });
	await page.getByRole('button', { name: '连接设置', exact: true }).click(); await page.waitForFunction(() => window.hostMessages.some(message => message.type === 'settings'));
	assert.equal(await hover.isVisible(), false);
	await page.evaluate(() => window.postMessage({ type: 'snapshot', messages: [{ id: 1, role: 'assistant', text: '```cpp\nint main() {}\n```', activities: [], status: 'complete' }] }, '*'));
	const copyCode = page.getByRole('button', { name: '复制代码', exact: true });
	await copyCode.hover(); await hover.waitFor({ state: 'visible' }); assert.equal(await hover.textContent(), '复制代码');
	assert.equal(await copyCode.evaluate(element => getComputedStyle(element, '::after').content), 'none', 'Code controls must not create a second hover');
	await page.goto(origin + '/cph'); await page.getByRole('button', { name: '设置', exact: true }).hover(); await hover.waitFor({ state: 'visible' });
	assert.equal(await hover.textContent(), '设置'); await page.screenshot({ path: path.join(output, 'cph-hover.png') });
	await page.getByRole('button', { name: '设置', exact: true }).click(); await page.waitForFunction(() => window.hostMessages.some(message => message.command === 'settings'));
	await page.getByRole('button', { name: '再次运行', exact: true }).hover(); await hover.waitFor({ state: 'visible' }); assert.equal(await hover.textContent(), '再次运行');
	await page.goto(origin + '/pdf'); await page.locator('#zoomIn').hover(); await hover.waitFor({ state: 'visible' });
	assert.equal(await hover.textContent(), '放大'); assert.equal(await page.locator('.annotationLayer span').getAttribute('title'), '原有文档注释');
	await page.screenshot({ path: path.join(output, 'pdf-hover.png') });
	assert.deepEqual(errors, []);
	console.log('Shared hovers passed: geometry, clipping, keyboard, dynamic text, theme, reduced motion, retirement, disposal, production Beacon/CPH/PDF integration.');
} finally {
	await browser?.close(); await new Promise(resolve => server.close(resolve));
}
