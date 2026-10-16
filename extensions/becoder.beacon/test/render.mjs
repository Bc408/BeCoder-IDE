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
	if (request.url === '/' || request.url === '/english' || request.url === '/configuration') {
		response.setHeader('Content-Type', 'text/html');
		response.end(`<!doctype html><html lang="${request.url === '/english' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-beacon-test' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;"><link rel="stylesheet" href="/beacon.css"></head><body class="vscode-dark" data-surface="${request.url === '/configuration' ? 'configuration' : 'chat'}"><div id="root"></div><script nonce="beacon-test" src="/beacon.js"></script></body></html>`);
		return;
	}
	const file = path.resolve(root, 'dist', '.' + request.url);
	if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
	response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
	// Model the real Webview boundary: resource fetches from blob workers cannot
	// resolve a Webview owner. Assets must be loaded by the window and transferred.
	response.end(file.endsWith('syntax-worker.js') ? `globalThis.fetch = () => { throw new Error('worker-resource-fetch-forbidden'); };\n${fs.readFileSync(file, 'utf8')}` : fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		let state = { type: 'snapshot', screen: 'home', activeId: '', canSend: true, temporary: true, viewKey: 'test::', attachments: [], messages: [], history: [], busy: false, saveFailed: false, historyUnreadable: false, error: '', permission: 'none', webEnabled: true, context: { slot: 'test', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, recent: [] } };
		// Produce complete current host snapshots. Individual cases patch fixture state.
		window.fixtureSnapshot = (patch, origin) => {
			if (patch.type !== 'snapshot') { window.postMessage(patch, origin); return; }
			const previousView = state.viewKey;
			state = { ...state, ...patch };
			if (patch.screen === undefined && patch.messages !== undefined) { state.screen = patch.messages.length ? 'conversation' : 'home'; }
			state.viewKey = `${state.context.slot}:${state.context.root ?? ''}:${state.activeId}`;
			if (state.viewKey !== previousView && patch.draftText === undefined) { state.draftText = ''; }
			state.temporary = !state.context.usable || state.context.mode === 'blackout';
			window.postMessage(state, origin);
		};
		window.fixtureState = () => structuredClone(state);
		window.acquireVsCodeApi = () => ({ postMessage: message => {
			(window.messages ??= []).push(message);
			if (message.type === 'send' && window.acceptSends !== false) { window.postMessage({ type: 'sendAccepted', text: message.text, viewKey: state.viewKey, conversationViewKey: state.viewKey }, '*'); }
		} });
	});
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-editor-background:#181b20; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-input-background:#1b1f24; --vscode-input-foreground:#d4d4d4; --vscode-input-placeholderForeground:#8b919a; --vscode-textCodeBlock-background:#171b20; --vscode-font-family:Segoe UI, sans-serif; --vscode-editor-font-family:Consolas, monospace; --vscode-button-background:#505965; --vscode-button-foreground:#fff; --vscode-scrollbarSlider-background:#454c57; --vscode-widget-border:#343b44; --vscode-focusBorder:#629ad1; }' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', screen: 'home', canSend: false, configured: false, busy: false, messages: [] }, '*'));
	await page.getByText('点击右上角设置按钮，配置服务商并选择模型后开始。').waitFor();
	assert.equal(await page.getByText('打开一段聊天，或点击新聊天开始提问。', { exact: true }).count(), 0, 'A clean home screen does not show an obsolete chat-selection warning');
	assert.equal(await page.getByRole('button', { name: '选择工作区' }).count(), 1, 'The workspace selector appears on the home page');
	assert.equal(await page.locator('.chats-title').textContent(), '聊天', 'Home has the same secondary heading as the reference');
	await page.getByRole('button', { name: '选择工作区' }).hover();
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.workspace-picker.expanded').count(), 0, 'An unselected workspace does not expand on hover');
	for (const button of await page.locator('.workspace-header .header-actions > button').all()) {
		const before = await button.boundingBox();
		await button.hover();
		assert.deepEqual(await button.boundingBox(), before, 'Header hover keeps the action size and position stable');
		assert.equal(await button.evaluate(element => getComputedStyle(element).borderRadius), '50%', 'Header icon hover is circular');
	}
	await page.getByRole('button', { name: '选择工作区' }).click();
	await page.getByRole('dialog', { name: 'Beacon 工作区' }).getByRole('button', { name: '添加新工作区' }).waitFor();
	assert.equal(await page.getByRole('dialog', { name: 'Beacon 工作区' }).getByRole('button', { name: '添加新工作区' }).count(), 1);
	await page.keyboard.press('Escape');
	assert.equal(await page.getByRole('button', { name: '配置 API Key', exact: true }).count(), 0);
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled());
	await page.screenshot({ path: path.join(output, 'chat-empty.png') });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', canSend: true, configured: true, busy: false, messages: [], connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', parameters: {}, keyConfigured: true, loading: false, error: '' } }, '*'));
	const webToggle = page.getByRole('button', { name: '联网搜索', exact: true });
	// The reference's cool hover surface follows the theme, including selected web search.
	await page.setViewportSize({ width: 648, height: 1000 });
	const referenceTheme = await page.addStyleTag({ content: ':root { --vscode-list-hoverBackground:#292d35; --vscode-sideBar-background:#21252b; --vscode-input-background:#1d1f23; }' });
	for (const selector of ['.add-files', '.web-toggle', '.permission-trigger', '.model-label']) {
		const control = page.locator(selector);
		const bounds = await control.boundingBox();
		await control.hover();
		await page.waitForTimeout(130);
		assert.equal(await control.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(41, 45, 53)', `${selector} uses the theme hover surface`);
		assert.deepStrictEqual(await control.boundingBox(), bounds, 'Theme hover does not resize or move a composer control');
		await page.locator('footer').screenshot({ path: path.join(output, `controls-hover-${selector.slice(1)}-dark.png`) });
	}
	const lightHoverTheme = await page.addStyleTag({ content: ':root { --vscode-list-hoverBackground:#eee; --vscode-sideBar-background:#fff; --vscode-input-background:#fafafa; --vscode-foreground:#242424; --vscode-descriptionForeground:#666; --vscode-editor-background:#fff; } .vscode-dark { --chat-muted:#666; }' });
	await page.locator('.add-files').hover();
	await page.waitForTimeout(130);
	assert.equal(await page.locator('.add-files').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(238, 238, 238)', 'Composer hover follows a light theme instead of a fixed dark color');
	await page.locator('footer').screenshot({ path: path.join(output, 'controls-hover-add-files-light.png') });
	await lightHoverTheme.evaluate(element => element.remove());
	await referenceTheme.evaluate(element => element.remove());
	await page.setViewportSize({ width: 760, height: 1000 });
	assert.equal(await webToggle.getAttribute('aria-pressed'), 'true', 'Web search defaults to on');
	await webToggle.click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'setWebEnabled', enabled: false });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', webEnabled: false }, '*'));
	await page.waitForFunction(() => document.querySelector('.web-toggle')?.getAttribute('aria-pressed') === 'false');
	await webToggle.getAttribute('aria-pressed').then(value => assert.equal(value, 'false'));
	await webToggle.click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'setWebEnabled', enabled: true });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', webEnabled: true }, '*'));
	assert.equal(await page.locator('.model-label').textContent(), 'deepseek-chat');
	await page.getByRole('button', { name: 'deepseek-chat', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'settings' });
	assert.equal(await page.locator('.model-picker-menu').count(), 0, 'A model trigger without choices opens settings directly');
	const composerInput = page.getByRole('textbox', { name: '向 Beacon 提问', exact: true });
	await composerInput.fill('宽度变化后输入框应重新计算换行高度。'.repeat(18));
	await page.setViewportSize({ width: 760, height: 1000 });
	const wideInputHeight = await composerInput.evaluate(element => element.getBoundingClientRect().height);
	await page.setViewportSize({ width: 220, height: 1000 });
	await page.waitForFunction(() => {
		const element = document.querySelector('.composer textarea');
		return element.getBoundingClientRect().height >= Math.min(element.scrollHeight, 180) - 1;
	});
	const narrowInputLayout = await composerInput.evaluate(element => ({ height: element.getBoundingClientRect().height, scrollHeight: element.scrollHeight }));
	assert.ok(narrowInputLayout.scrollHeight > wideInputHeight, 'A narrower composer creates additional wrapped input content');
	assert.ok(narrowInputLayout.height >= Math.min(narrowInputLayout.scrollHeight, 180) - 1, 'Composer input height follows wrapping after a sidebar resize');
	assert.ok(await page.locator('.model-label .model-picker-name').isHidden(), 'Narrow composer collapses the model label text');
	assert.ok(await page.locator('.permission-trigger > span').isHidden(), 'Narrow composer collapses the permission label text');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow composer does not overflow horizontally');
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.waitForFunction(height => document.querySelector('.composer textarea').getBoundingClientRect().height <= height + 1, wideInputHeight);
	assert.ok(await page.locator('.model-label .model-picker-name').isVisible(), 'Wide composer restores the model label text');
	assert.ok(await page.locator('.permission-trigger > span').isVisible(), 'Wide composer restores the permission label text');
	const draftBeforeResize = await composerInput.inputValue();
	const wideIconSizes = await page.locator('.composer-toolbar > .add-files, .composer-toolbar > .web-toggle, .composer-toolbar > .send').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
	const widePermissionWidth = await page.locator('.permission-trigger').evaluate(element => element.getBoundingClientRect().width);
	for (const width of [760, 480, 360, 320, 280, 260, 220, 180, 220, 360, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const layout = await page.locator('.composer-toolbar').evaluate(element => {
			const bounds = element.getBoundingClientRect();
			const tools = [...element.querySelectorAll(':scope > button, .permission-trigger, .model-label')].map(tool => tool.getBoundingClientRect()).filter(tool => tool.width > 0 && tool.height > 0);
			return { bounds: { left: bounds.left, right: bounds.right }, tools: tools.map(tool => ({ left: tool.left, right: tool.right, top: tool.top, height: tool.height })), fits: tools.every(tool => tool.left >= bounds.left - 1 && tool.right <= bounds.right + 1), aligned: tools.every(tool => Math.abs(tool.top + tool.height / 2 - tools[0].top - tools[0].height / 2) < 1) };
		});
		assert.ok(layout.fits && layout.aligned, `All composer actions fit and share a centerline at ${width}px`);
		assert.deepStrictEqual(await page.locator('.composer-toolbar > .add-files, .composer-toolbar > .web-toggle, .composer-toolbar > .send').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height }; })), wideIconSizes, `Composer icon actions keep fixed hit targets at ${width}px`);
		assert.equal(await page.locator('.permission-trigger').evaluate(element => element.getBoundingClientRect().width), width <= 320 ? 28 : widePermissionWidth, `Permission trigger uses the compact mode at ${width}px`);
		if (width <= 280) {
			assert.equal(await page.locator('.model-picker').evaluate(element => getComputedStyle(element).display), 'none', 'The model picker yields space to the primary actions in the narrowest composer');
		} else {
			const modelWidth = await page.locator('.model-label').evaluate(element => element.getBoundingClientRect().width);
			assert.ok(modelWidth >= 72, `Model trigger keeps a stable mode at ${width}px`);
		}
		assert.equal(await composerInput.inputValue(), draftBeforeResize, 'Resizing preserves the input draft');
		await page.locator('footer').screenshot({ path: path.join(output, `composer-draft-dark-${width}.png`) });
	}
	await composerInput.fill('');
	for (const width of [180, 220, 260, 320, 360, 480, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.locator('footer').screenshot({ path: path.join(output, `composer-empty-dark-${width}.png`) });
	}
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', displayName: 'Chat model', revision: 7, parameters: {}, keyConfigured: true, choices: [{ provider: 'deepseek', id: 'deepseek-chat', name: 'Chat model' }, { provider: 'ollama', id: 'local', name: 'Local model' }], loading: false, error: '' } }, '*'));
	await page.getByRole('button', { name: 'Chat model', exact: true }).click();
	await page.screenshot({ path: path.join(output, 'model-menu-dark-760.png') });
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 320, height: 1000 });
	await page.getByRole('button', { name: 'Chat model', exact: true }).click();
	const narrowModelMenu = await page.locator('.model-picker-menu').evaluate(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right }; });
	assert.ok(narrowModelMenu.left >= 8 && narrowModelMenu.right <= 312, 'Narrow model menu stays inside the composer safety margins');
	await page.screenshot({ path: path.join(output, 'model-menu-dark-320.png') });
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.getByRole('button', { name: 'Chat model', exact: true }).click();
	await page.getByRole('button', { name: 'Local model Ollama', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'selectModel', provider: 'ollama', id: 'local', revision: 7, requestId: await page.evaluate(() => window.messages.at(-1).requestId) });
	assert.equal(await page.locator('.model-picker-menu').count(), 0);
	await page.getByRole('button', { name: 'Chat model', exact: true }).click();
	await page.getByRole('button', { name: '管理模型', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'settings' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', parameters: {}, keyConfigured: true, loading: false, error: '' } }, '*'));
	await page.getByRole('button', { name: 'Blackout', exact: true }).click();
	const permissions = page.getByRole('dialog', { name: '文件读取权限', exact: true });
	assert.equal(await permissions.getByRole('button').count(), 3, 'All three permission modes remain visible');
	assert.ok(await permissions.getByRole('button', { name: /Spot/ }).isDisabled());
	assert.deepStrictEqual(await permissions.locator('small').allTextContents(), ['当前页面与主动提供材料；不读本地文件', '只读当前 Beacon 工作区', '只读本机与共享目录']);
	assert.equal(await permissions.locator('.permission-note').textContent(), '敏感文件与其他会话始终隔离，读取内容会发送给所选模型。');
	assert.equal(await page.locator('.permission-trigger').evaluate(element => getComputedStyle(element).height), '28px');
	assert.equal(await permissions.evaluate(element => getComputedStyle(element).borderRadius), '12px');
	assert.ok(await permissions.locator('button').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 38)), 'Permission choices have a consistent compact click target');
	assert.equal(await page.locator('.web-toggle').evaluate(element => getComputedStyle(element).width), '28px');
	assert.deepStrictEqual(await page.locator('.composer-toolbar').evaluate(element => Array.from(element.children).map(child => child.className)), ['add-files', 'web-toggle', 'permission-control', 'composer-spacer', 'model-picker', 'send']);
	assert.equal(await page.locator('.add-files path').getAttribute('d'), 'M12 4v16M4 12h16');
	assert.ok(await page.locator('.workspace-header .header-actions > button').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().width >= 24)), 'Top-level icon actions keep usable click targets');
	await page.screenshot({ path: path.join(output, 'permissions-dark.png') });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fff; --vscode-foreground:#242424; --vscode-descriptionForeground:#666; --vscode-widget-border:#ccc; --vscode-menu-background:#fff; --vscode-list-hoverBackground:#eee; --vscode-focusBorder:#007fd4; --vscode-textLink-foreground:#006ab1; --vscode-editor-background:#fff; } .vscode-dark { --chat-title:#242424; --chat-muted:#666; }' });
	await page.locator('body').evaluate(element => element.classList.remove('vscode-dark'));
	await page.screenshot({ path: path.join(output, 'permissions-light.png') });
	await page.setViewportSize({ width: 360, height: 1000 });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Permission controls fit a narrow Beacon sidebar');
	await page.screenshot({ path: path.join(output, 'permissions-narrow.png') });
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.locator('body').evaluate(element => element.classList.add('vscode-dark'));
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-widget-border:#343b44; --vscode-menu-background:#21262d; --vscode-list-hoverBackground:#ffffff10; --vscode-focusBorder:#629ad1; --vscode-textLink-foreground:#80bfff; --vscode-editor-background:#181b20; } .vscode-dark { --chat-title:#ccc; --chat-muted:#999a9c; }' });
	await page.keyboard.press('Escape');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'workspace', context: { slot: 'test', root: 'D:/fixture', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 1, busy: false, recent: ['D:/fixture'] } }, '*'));
	for (const width of [220, 320, 480, 760]) {
		await page.setViewportSize({ width, height: 700 });
		await page.locator('.workspace-picker-trigger').hover();
		await page.waitForTimeout(180);
		const header = await page.locator('.workspace-header').evaluate(element => { const controls = [...element.querySelectorAll('.conversation-heading, .workspace-picker, .header-actions > button')].map(control => control.getBoundingClientRect()); return controls.every((control, index) => control.left >= 0 && control.right <= innerWidth && (index === 0 || control.left >= controls[index - 1].right - 1)); });
		assert.ok(header, `Home heading and controls have separate bounds at ${width}px`);
		await page.mouse.move(2, 200);
		await page.waitForTimeout(180);
		await page.screenshot({ path: path.join(output, `controls-home-${width}.png`) });
	}
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.getByRole('button', { name: 'Spot', exact: true }).click();
	assert.equal(await permissions.getByRole('button').count(), 3);
	assert.equal(await permissions.getByRole('button', { name: /Blackout/ }).count(), 1);
	await permissions.getByRole('button', { name: /Spot/ }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'setPermission', permission: 'workspace' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'workspace' }, '*'));
	await page.getByRole('button', { name: 'Spot', exact: true }).waitFor();
	await page.locator('.workspace-picker-trigger').click();
	await page.locator('.workspace-picker.open .workspace-current-remove').waitFor();
	await page.waitForTimeout(220);
	assert.ok((await page.locator('.workspace-picker-shell').boundingBox()).width >= 280, 'The production selector expands to the available left-hand space');
	await page.getByRole('dialog', { name: 'Beacon 工作区' }).getByRole('button', { name: '添加新工作区' }).waitFor();
	await page.screenshot({ path: path.join(output, 'workspace-picker-open.png') });
	assert.equal(await page.locator('.workspace-picker-row').count(), 0, 'Current workspace is excluded from recents');
	await page.locator('.workspace-current-remove').click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'clearWorkspace' });
	await page.keyboard.press('Escape');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'none', context: { slot: 'test', root: 'D:/fixture', usable: true, workspaceState: 'blackout', mode: 'blackout', epoch: 2, busy: false, recent: ['D:/fixture'] }, history: [{ id: 'hidden', title: 'Hidden chat', updatedAt: Date.now() }] }, '*'));
	assert.equal(await page.evaluate(() => window.fixtureState().context.workspaceState), 'blackout');
	assert.equal(await page.locator('.history-list').count(), 0, 'Blackout home does not render workspace history');
	await page.locator('.workspace-picker-trigger.hidden').waitFor();
	assert.ok(await page.locator('.workspace-picker-trigger.hidden').isVisible());
	assert.equal(await page.locator('.workspace-picker-trigger.hidden').getAttribute('aria-label'), 'fixture 未使用');
	await page.screenshot({ path: path.join(output, 'workspace-blackout.png') });
	await page.getByRole('button', { name: 'Blackout', exact: true }).click();
	const blackoutPermissions = page.getByRole('dialog', { name: '文件读取权限', exact: true });
	assert.ok(await blackoutPermissions.getByRole('button', { name: /Spot/ }).isEnabled(), 'A valid selected workspace can leave manual Blackout');
	assert.ok(await blackoutPermissions.getByRole('button', { name: /Flood/ }).isEnabled());
	await page.keyboard.press('Escape');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'workspace', context: { slot: 'test', root: 'D:/fixture', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 3, busy: false, recent: ['D:/fixture'] } }, '*'));
	await page.getByRole('textbox').fill('解释这段代码');
	await page.getByRole('textbox').press('Enter');
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '解释这段代码' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', configured: true, busy: true, messages: [] }, '*'));
	assert.ok(await page.getByRole('button', { name: 'Spot', exact: true }).isDisabled(), 'Permission changes are unavailable while a response is running');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: false }, '*'));
	await page.getByRole('button', { name: 'Spot', exact: true }).click();
	await page.getByRole('dialog', { name: '文件读取权限' }).getByRole('button', { name: /Flood/ }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'setPermission', permission: 'computer' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'computer', busy: true, requestNotice: { id: 1, text: '权限变更将在下一轮回复中生效。' } }, '*'));
	await page.getByRole('status').getByText('权限变更将在下一轮回复中生效。', { exact: true }).waitFor();
	assert.ok(await page.getByRole('button', { name: '暂停生成', exact: true }).isEnabled());
	assert.ok(await page.getByRole('button', { name: '新聊天', exact: true }).isDisabled());
	await page.getByRole('button', { name: '暂停生成', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'stop' });
	assert.ok(await page.getByRole('button', { name: '正在暂停', exact: true }).isDisabled());
	const code = 'int a,b;\n\n// preserved blank line\n    cin>>a>>b;\n    cout<<a+b;';
	const text = '下面是代码和公式。\n\n```cpp\n' + code + '\n```\n\n常见的泰勒展开式：\n\n\\[ f(x)=f(0)+f\'(0)x+\\frac{f^{(2)}(0)}{2!}x^2+\\cdots \\]\n\n行内公式 \\(x^2\\)，以及 $y^2$。\n\n$$\ne^x=1+x+\\frac{x^2}{2!}+\\cdots\n$$';
	const createdAt = new Date('2026-09-24T08:33:00Z').getTime();
	await page.evaluate(({ text, createdAt }) => window.fixtureSnapshot({ type: 'snapshot', configured: true, busy: false, error: '', messages: [{ id: 1, role: 'user', text: '给一份代码和泰勒展开式', status: 'complete', reasoning: '', activities: [], createdAt }, { id: 2, role: 'assistant', text, reasoning: '检查题意与公式。', activities: [], status: 'complete', createdAt: createdAt + 1000, durationMs: 18000 }] }, '*'), { text, createdAt });
	await page.getByText('用时 18s', { exact: true }).waitFor();
	assert.deepStrictEqual(await page.locator('.assistant-actions').evaluate(element => [...element.children].map(child => child.tagName)), ['BUTTON', 'BUTTON', 'TIME']);
	assert.notEqual(await page.locator('.thought').evaluate(element => getComputedStyle(element).borderBottomColor), 'rgba(0, 0, 0, 0)');
	assert.equal(await page.getByText(/深度求索|deepseek-flash/).count(), 0);
	await page.waitForSelector('.code-line');
	await page.waitForSelector('.katex-display');
	assert.equal(await page.locator('.code-block pre code').textContent(), code + '\n');
	assert.equal(await page.locator('.katex-display').count(), 2);
	assert.equal(await page.locator('.katex').count(), 4);
	const top = await page.locator('.code-line').evaluateAll(lines => lines.map(line => line.getBoundingClientRect().top));
	assert.ok(top.at(-1) > top[0] + 40, 'Code lines must remain separate');
	for (const [fontSize, lineHeight] of [[14, 19], [18, 27]]) {
		const metrics = await page.locator('.code-block pre code').evaluate((code, { fontSize, lineHeight }) => {
			document.documentElement.style.setProperty('--vscode-editor-font-size', `${fontSize}px`);
			document.documentElement.style.setProperty('--vscode-editor-line-height', `${lineHeight}px`);
			const style = getComputedStyle(code);
			return { fontSize: style.fontSize, lineHeight: style.lineHeight };
		}, { fontSize, lineHeight });
		assert.deepStrictEqual(metrics, { fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` });
	}
	await page.evaluate(() => {
		document.documentElement.style.removeProperty('--vscode-editor-font-size');
		document.documentElement.style.removeProperty('--vscode-editor-line-height');
	});
	await page.getByRole('button', { name: '复制代码', exact: true }).click();
	// Windows normalizes text clipboard line endings to CRLF.
	assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), code + '\n');
	await page.locator('.message.user').hover();
	assert.ok(await page.getByRole('button', { name: '复制消息', exact: true }).isVisible());
	await page.getByRole('button', { name: '复制消息', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'copy', id: 1 });
	await page.getByRole('button', { name: '编辑消息', exact: true }).click();
	await page.getByRole('textbox', { name: '编辑消息', exact: true }).fill('修改后的问题');
	await page.locator('.message-edit').getByRole('button', { name: '发送', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'edit', id: 1, text: '修改后的问题' });
	await page.evaluate(({ text, createdAt }) => window.fixtureSnapshot({ type: 'snapshot', configured: true, busy: false, error: '', messages: [{ id: 1, role: 'user', text: '给一份代码和泰勒展开式', status: 'complete', reasoning: '', activities: [], createdAt }, { id: 2, role: 'assistant', text, reasoning: '检查题意与公式。', activities: [], status: 'complete', createdAt: createdAt + 1000, durationMs: 18000 }] }, '*'), { text, createdAt });
	await page.getByRole('button', { name: '重新回答', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'regenerate', id: 2 });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: false }, '*'));
	await page.locator('.conversation-back:enabled').waitFor();
	for (const selector of ['.message-actions button', '.conversation-back', '.code-toolbar button']) {
		for (const control of await page.locator(selector).all()) {
			if (!await control.isVisible()) { continue; }
			const bounds = await control.boundingBox();
			await control.hover();
			assert.deepStrictEqual(await control.boundingBox(), bounds, 'Icon hover preserves its target bounds');
			if (selector === '.conversation-back') {
				assert.equal(await control.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'Back hover stays transparent');
				assert.match(await control.locator('svg').evaluate(element => getComputedStyle(element).filter), /drop-shadow/, 'Back hover gives the smaller arrow a subtle glow');
			} else {
				assert.equal(await control.evaluate(element => getComputedStyle(element).borderRadius), '50%', `${selector} uses a circular hover surface`);
				assert.equal(await control.locator('svg').evaluate(element => getComputedStyle(element).filter), 'none', 'Other icon hover does not add a glow');
			}
		}
	}
	await page.getByRole('button', { name: '重新回答', exact: true }).hover();
	await page.waitForTimeout(130);
	await page.locator('.assistant-actions').screenshot({ path: path.join(output, 'controls-message-hover-dark.png') });
	await page.getByRole('button', { name: '复制回复', exact: true }).hover();
	await page.waitForTimeout(130);
	await page.locator('.assistant-actions').screenshot({ path: path.join(output, 'controls-copy-hover-dark.png') });
	await page.evaluate(() => {
		document.body.classList.add('vscode-high-contrast');
		document.documentElement.style.setProperty('--vscode-contrastBorder', '#fff');
	});
	await page.getByRole('button', { name: '复制回复', exact: true }).focus();
	await page.waitForTimeout(130);
	assert.equal(await page.getByRole('button', { name: '复制回复', exact: true }).evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(255, 255, 255)', 'High contrast icon controls retain an explicit boundary');
	await page.locator('.assistant-actions').screenshot({ path: path.join(output, 'controls-message-high-contrast.png') });
	await page.evaluate(() => {
		document.body.classList.remove('vscode-high-contrast');
		document.documentElement.style.removeProperty('--vscode-contrastBorder');
	});
	await page.evaluate(({ text, createdAt }) => window.fixtureSnapshot({ type: 'snapshot', configured: true, busy: false, error: '', messages: [{ id: 1, role: 'user', text: '给一份代码和泰勒展开式', status: 'complete', reasoning: '', activities: [], createdAt }, { id: 2, role: 'assistant', text, reasoning: '检查题意与公式。', activities: [], status: 'complete', createdAt: createdAt + 1000, durationMs: 18000 }] }, '*'), { text, createdAt });
	for (const width of [760, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.screenshot({ path: path.join(output, `dark-${width}.png`) });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page horizontal overflow');
	}
	// Code blocks follow Captain Who's wrap/copy toolbar and stable streaming update behavior.
	const publishAnswer = async (answer, reasoning = '', status = 'streaming', durationMs, id = 20) => {
		await page.evaluate(({ answer, reasoning, status, durationMs, id }) => window.fixtureSnapshot({ type: 'snapshot', configured: true, error: '', busy: status === 'streaming', messages: [{ id, role: 'assistant', text: answer, reasoning, activities: [], status, createdAt: Date.now() - 61000, durationMs }] }, '*'), { answer, reasoning, status, durationMs, id });
	};
	await publishAnswer('逐字输出的首段');
	await publishAnswer('逐字输出的首段，继续追加字符');
	await page.getByText('逐字输出的首段，继续追加字符', { exact: true }).waitFor();
	assert.equal(await page.locator('.markdown[data-streaming] .streaming-character').count(), 0, 'Streamed prose renders directly without per-character animation');
	// Transport bursts must advance over several paint frames without losing text or splitting emoji.
	await publishAnswer('', '', 'streaming', undefined, 23);
	await page.locator('.assistant > .markdown').waitFor({ state: 'detached' });
	const burst = '连续输出，保持自然节奏。😊'.repeat(12);
	const frames = await page.evaluate(async burst => {
		const lengths = [];
		window.fixtureSnapshot({ type: 'snapshot', busy: true, messages: [{ id: 23, role: 'assistant', text: burst, reasoning: '', activities: [], status: 'streaming', createdAt: Date.now() }] }, '*');
		for (let frame = 0; frame < 15; frame++) {
			await new Promise(requestAnimationFrame);
			const text = document.querySelector('.assistant > .markdown')?.textContent ?? '';
			if (!burst.startsWith(text) || /[\uD800-\uDBFF]$/.test(text)) { throw new Error('Broken streamed prefix'); }
			lengths.push(text.length);
		}
		return lengths;
	}, burst);
	assert.ok(new Set(frames.filter(length => length > 0 && length < burst.length)).size >= 5, 'A burst advances gradually across multiple intermediate paint frames');
	assert.equal(frames.at(-1), burst.length, 'The presentation buffer catches up promptly');
	assert.equal(await page.locator('.streaming-run').last().evaluate(element => getComputedStyle(element).animationName), 'beacon-text-reveal', 'Only newly revealed text fades in');
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.streaming-run').last().evaluate(element => getComputedStyle(element).opacity), '1', 'New text becomes fully readable after the short reveal');
	await publishAnswer(burst + '停止。', '', 'stopped', 1000, 23);
	await page.getByText(burst + '停止。', { exact: true }).waitFor();
	assert.equal(await page.locator('.assistant-actions').getByRole('button', { name: '继续回答', exact: true }).count(), 0);
	await page.getByRole('textbox').fill('补充要求');
	await page.getByRole('button', { name: '发送', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '补充要求' });
	await publishAnswer(burst + '停止。', '', 'stopped', 1000, 23);
	await page.getByRole('button', { name: '继续回答', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'continue', id: 23 });
	await publishAnswer(burst + '停止。', '', 'stopped', 1000, 23);
	await page.getByRole('button', { name: '重新回答', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'regenerate', id: 23 });
	await publishAnswer('', '', 'stopped', 1000, 23);
	await page.locator('.assistant > .markdown').waitFor({ state: 'detached' });
	await page.locator('.composer .send:enabled').waitFor();
	assert.ok(await page.getByRole('button', { name: '继续回答', exact: true }).isEnabled(), 'An empty paused answer can continue');
	assert.ok(await page.getByRole('button', { name: '重新回答', exact: true }).isEnabled(), 'An empty paused answer can regenerate');
	await page.screenshot({ path: path.join(output, 'paused-response-dark-360.png') });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await publishAnswer(burst, '', 'streaming', undefined, 24);
	await page.getByText(burst, { exact: true }).waitFor();
	assert.equal(await page.locator('.streaming-run').count(), 0, 'Reduced motion renders text immediately without reveal animation');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await publishAnswer('```cpp\nint value = 1;\n');
	await page.waitForSelector('.code-line');
	await page.waitForSelector('.code-line > span[style]');
	assert.equal(await page.locator('.code-block').getAttribute('data-streaming'), 'true', 'An unfinished fence renders as a live code block');
	await page.screenshot({ path: path.join(output, 'streaming-code-dark-360.png') });
	await publishAnswer('```cpp\nint value = 1;\nvalue++;\n');
	await page.waitForFunction(() => document.querySelector('.code-block pre code')?.textContent === 'int value = 1;\nvalue++;\n');
	assert.equal(await page.locator('.code-live-character').count(), 0, 'Live code tails render directly without per-character animation');
	assert.equal(await page.locator('.code-block pre code').textContent(), 'int value = 1;\nvalue++;\n');
	assert.equal(await page.locator('.code-toolbar button').count(), 2, 'The code toolbar provides wrapping and copy actions');
	assert.equal(await page.getByRole('button', { name: '自动换行', exact: true }).getAttribute('aria-pressed'), 'false');
	assert.equal(await page.locator('.code-block pre').evaluate(element => getComputedStyle(element).whiteSpace), 'pre', 'Code follows the cloud layout without automatic wrapping');
	await page.getByRole('button', { name: '自动换行', exact: true }).click();
	assert.equal(await page.locator('.code-block pre code').evaluate(element => getComputedStyle(element).whiteSpace), 'pre-wrap', 'The code toolbar toggles line wrapping');
	const activeCodeBlock = await page.locator('.code-block').elementHandle();
	await publishAnswer('```cpp\nint value = 1;\nvalue++;\nvalue += 2;\n```');
	await page.waitForFunction(() => document.querySelector('.code-block pre code')?.textContent === 'int value = 1;\nvalue++;\nvalue += 2;\n');
	assert.equal(await page.locator('.code-block').evaluate(element => element.classList.contains('is-wrapped')), true, 'A streamed update preserves the reader\'s wrapping choice');
	assert.ok(await activeCodeBlock?.evaluate(element => element.isConnected), 'A streamed update keeps its code-block component mounted');
	const continuousHighlight = await page.evaluate(async () => {
		let source = '```cpp\nint value = 1;\n';
		let highlightedDuringStream = false;
		for (let index = 0; index < 40; index++) {
			source += `int item${index} = ${index};\n`;
			window.fixtureSnapshot({ type: 'snapshot', busy: true, messages: [{ id: 20, role: 'assistant', text: source, reasoning: '', activities: [], status: 'streaming', createdAt: Date.now() }] }, '*');
			await new Promise(requestAnimationFrame);
			if (index > 15 && [...document.querySelectorAll('.code-line > span[style]')].some(element => element.textContent?.includes('item5'))) { highlightedDuringStream = true; }
		}
		return highlightedDuringStream;
	});
	assert.ok(continuousHighlight, 'Syntax coloring progresses while deltas continuously arrive, before the fence closes');
	await publishAnswer('```c\nint value = 42;\n/* first\nsecond */\n```', '', 'complete', 1000);
	await page.waitForFunction(() => document.querySelector('.becoder-syntax pre code')?.textContent === 'int value = 42;\n/* first\nsecond */\n');
	assert.equal(await page.locator('.code-line > span').filter({ hasText: '42' }).evaluate(element => getComputedStyle(element).color), 'rgb(198, 120, 221)', 'C numeric tokens use the default editor theme');
	assert.equal(await page.locator('.code-line > span').filter({ hasText: 'second' }).evaluate(element => getComputedStyle(element).color), 'rgb(103, 111, 125)', 'C multi-line comments carry the prior line state');
	await page.screenshot({ path: path.join(output, 'textmate-code-dark.png') });
	await publishAnswer('```cpp\nint replacement = 7;\n```', '', 'complete', 1000);
	await page.waitForFunction(() => document.querySelector('.becoder-syntax pre code')?.textContent === 'int replacement = 7;\n');
	assert.ok(!(await page.locator('.code-block pre code').textContent()).includes('item5'), 'Replaced code does not retain stale worker tokens');
	await publishAnswer('```unknown-language\n<plain>&code\n```', '', 'complete', 1000);
	await page.waitForFunction(() => document.querySelector('.code-block pre code')?.textContent === '<plain>&code\n');
	await publishAnswer('推导实时更新：$x');
	await page.waitForSelector('.markdown[data-streaming] .katex');
	assert.ok(await page.locator('.markdown .katex').count() > 0, 'An unfinished inline formula renders before its closing delimiter arrives');
	assert.equal(await page.locator('.markdown .katex').first().evaluate(element => getComputedStyle(element).animationName), 'none', 'Streaming formulas render without an additional entrance animation');
	await publishAnswer('推导实时更新：$x^2');
	await page.waitForFunction(() => [...document.querySelectorAll('.markdown .katex')].some(element => element.textContent?.includes('2')));
	await publishAnswer('$$\n\\sum_{i=1}^{n} i');
	await page.waitForSelector('.markdown[data-streaming] .katex-display .katex');
	assert.ok(await page.locator('.markdown .katex-display').count() > 0, 'An unfinished display formula renders while streaming');
	await page.screenshot({ path: path.join(output, 'streaming-math-dark-360.png') });

	// Reasoning defaults to collapsed during streaming; opening it is the reader's choice.
	await publishAnswer('');
	await page.locator('.running-text').waitFor();
	assert.equal(await page.locator('.running-text').evaluate(element => getComputedStyle(element).animationDuration), '2.4s');
	for (const phase of [0, 1000, 1400]) {
		await page.locator('.running-text').evaluate((element, phase) => {
			const animation = element.getAnimations()[0];
			animation.pause();
			animation.currentTime = phase;
		}, phase);
		await page.screenshot({ path: path.join(output, `shimmer-${phase}.png`) });
	}
	await page.locator('.running-text').evaluate(element => element.getAnimations()[0].play());
	await page.emulateMedia({ reducedMotion: 'reduce' });
	assert.equal(await page.locator('.running-text').evaluate(element => getComputedStyle(element).animationName), 'none');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await publishAnswer('', '检查 **边界条件** 与 $n^2$。');
	await page.locator('.reasoning-content strong').waitFor({ state: 'attached' });
	assert.equal(await page.locator('.reasoning-details').getAttribute('open'), null, 'Reasoning starts collapsed');
	assert.match(await page.locator('.reasoning-details summary').innerText(), /正在思考/);
	assert.doesNotMatch(await page.locator('.reasoning-details summary').innerText(), /思考过程|Reasoning/);
	await page.locator('.reasoning-details summary').click();
	assert.ok(await page.locator('.reasoning-content').isVisible());
	await publishAnswer('', '检查 **边界条件** 与 $n^2$。\n补充判断。');
	assert.ok(await page.locator('.reasoning-details').getAttribute('open') !== null, 'Snapshot updates preserve the reader choice');
	await publishAnswer('结论。', '检查 **边界条件** 与 $n^2$。\n补充判断。', 'complete', 90000);
	await page.getByText('用时 1m 30s', { exact: true }).waitFor();
	assert.ok(await page.locator('.reasoning-content').isVisible());
	assert.equal(await page.locator('.running-text').count(), 0);
	await publishAnswer('新的回答。', '新的思考过程。', 'complete', 90000, 21);
	await page.getByText('新的思考过程。', { exact: true }).waitFor({ state: 'attached' });
	assert.equal(await page.locator('.reasoning-details').getAttribute('open'), null, 'A new response starts collapsed');
	await page.locator('.reasoning-details summary').click();
	await page.screenshot({ path: path.join(output, 'activity-expanded-dark-360.png') });

	// Real browser layout growth, user escape, explicit return and composer resize.
	const longAnswer = Array.from({ length: 55 }, (_, index) => `段落 ${index}：阅读时应保留滚动位置。`).join('\n\n');
	await publishAnswer(longAnswer);
	// The presentation buffer initially fits in the viewport; wait for actual content
	// before treating "at bottom" as evidence that the long response has settled.
	await page.getByText('段落 54：阅读时应保留滚动位置。', { exact: true }).waitFor();
	const atBottom = () => page.waitForFunction(() => { const el = document.querySelector('.conversation-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 4; });
	await atBottom();
	await page.locator('.scroll-bottom').waitFor({ state: 'detached' });
	await page.locator('.conversation-scroll').hover();
	await page.mouse.wheel(0, -650);
	await page.getByRole('button', { name: '回到底部', exact: true }).waitFor();
	await page.waitForFunction(() => { const el = document.querySelector('.conversation-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight > 400; });
	const readingTop = await page.locator('.conversation-scroll').evaluate(element => element.scrollTop);
	await publishAnswer(longAnswer + '\n\n新增长的回复。');
	await page.getByText('新增长的回复。', { exact: true }).waitFor({ state: 'attached' });
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.ok(Math.abs(await page.locator('.conversation-scroll').evaluate(element => element.scrollTop) - readingTop) < 5, 'New content must not pull the reader down');
	assert.equal(await page.locator('.scroll-typing > span').count(), 3, 'A live response shows three dots only when away from the bottom');
	assert.equal(await page.locator('.scroll-bottom svg').count(), 0);
	await page.screenshot({ path: path.join(output, 'return-to-bottom-dark-360.png') });
	await page.getByRole('button', { name: '回到底部', exact: true }).click();
	const returnPositions = await page.locator('.conversation-scroll').evaluate(element => new Promise(resolve => {
		const positions = [];
		const sample = () => { positions.push(element.scrollTop); if (positions.length < 8) { requestAnimationFrame(sample); } else { resolve(positions); } };
		requestAnimationFrame(sample);
	}));
	assert.ok(new Set(returnPositions).size > 2, 'Returning to the bottom moves across paint frames');
	await atBottom();
	await page.locator('.scroll-bottom').waitFor({ state: 'detached' });
	await publishAnswer(longAnswer + '\n\n```cpp\nint a;\nint b;\n```\n\n$$n^2$$');
	await page.waitForSelector('.code-line');
	await atBottom();
	await page.getByRole('textbox', { name: '向 Beacon 提问', exact: true }).fill('一\n二\n三\n四\n五\n六');
	await atBottom();
	await page.getByRole('textbox', { name: '向 Beacon 提问', exact: true }).fill('');
	await publishAnswer(longAnswer, '', 'complete', 9045000);
	await page.locator('.scroll-typing').waitFor({ state: 'detached' });
	await page.getByText('用时 2h 30m 45s', { exact: true }).waitFor();
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', configured: true, busy: false, error: '无法建立与服务商的连接，请检查网络或代理后重试。', messages: [{ id: 30, role: 'user', text: '你好', reasoning: '', activities: [], status: 'complete' }, { id: 31, role: 'assistant', text: '', reasoning: '', activities: [], status: 'error', durationMs: 0 }] }, '*'));
	await page.locator('.assistant [role="alert"]').waitFor();
	assert.equal(await page.locator('.thought').count(), 0, 'An empty failed request has no misleading duration or divider');
	assert.equal(await page.locator('footer [role="alert"]').count(), 0, 'Request errors belong to their reply');
	assert.equal(await page.getByRole('button', { name: '重新生成回答', exact: true }).count(), 0, 'Failed responses have no duplicate text retry action');
	assert.equal(await page.locator('.assistant-actions button').count(), 1, 'An empty failed response has only the regenerate icon');
	await page.getByRole('button', { name: '重新回答', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'regenerate', id: 31 });
	// Markdown typography, formulas and narrow layouts retain their semantic elements.
	await publishAnswer('|项目|复杂度|\n|---|---|\n|排序|$n \\log n$|\n\n- [x] 已完成\n- [ ] 待完成\n\n> 引用说明\n\n~~删除线~~ 与 **加粗**。\n\n\\[\\frac{a+b}{c}\\]\n\n```cpp\nint answer = 42;\n```', '', 'complete', 1000);
	await page.waitForSelector('.markdown table');
	await page.waitForSelector('.code-line');
	assert.equal(await page.locator('.markdown input[type="checkbox"]').count(), 2);
	assert.equal(await page.locator('.markdown blockquote').count(), 1);
	assert.equal(await page.locator('.markdown del').count(), 1);
	for (const width of [320, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		await page.screenshot({ path: path.join(output, `rendering-dark-${width}.png`) });
	}
	// Long GFM tables must stay in normal flow when mixed with equations and lists.
	const derivativeRows = Array.from({ length: 14 }, (_, index) => `| $x^{${index + 1}}$ | $${index + 1}x^{${index}}$ |`).join('\n');
	const mixedContent = `## 函数与导数\n\n| 函数 | 导数 |\n| --- | --- |\n${derivativeRows}\n\n## 高阶展开\n\n$$\n(fg)^{(n)}=\\sum_{k=0}^{n}\\binom{n}{k}f^{(k)}g^{(n-k)}\n$$\n\n- 常见展开：$e^x=\\sum_{k=0}^\\infty x^k/k!$\n- 泰勒公式：$f(x)=f(0)+f\'(0)x+R_n$\n\n需要哪部分展开更细？`;
	await publishAnswer(mixedContent, '', 'complete', 1000, 22);
	await page.locator('.markdown table').waitFor();
	assert.equal(await page.locator('.markdown table tbody tr').count(), 14);
	assert.ok(await page.locator('.markdown .katex-display').count() >= 1);
	const tableFlow = await page.evaluate(() => {
		const table = document.querySelector('.markdown table');
		const heading = [...document.querySelectorAll('.markdown h2')].find(element => element.textContent === '高阶展开');
		if (!table || !heading) { throw new Error('Expected the table and following section heading to render'); }
		const rows = [...table.querySelectorAll('tr')];
		const lastRow = rows.at(-1);
		if (!lastRow) { throw new Error('Expected the table to contain rows'); }
		return { tableBottom: table.getBoundingClientRect().bottom, lastRowBottom: lastRow.getBoundingClientRect().bottom, nextHeadingTop: heading.getBoundingClientRect().top, tableHeight: table.getBoundingClientRect().height, display: getComputedStyle(table).display };
	});
	assert.equal(tableFlow.display, 'table', 'GFM tables keep native table layout');
	assert.ok(tableFlow.tableHeight > 14 * 20, 'The table box must account for every long-table row');
	assert.ok(tableFlow.tableBottom >= tableFlow.lastRowBottom - 1, 'The table box must enclose its final row');
	assert.ok(tableFlow.nextHeadingTop >= tableFlow.lastRowBottom, 'The section after a long table must not overlap the rows');
	for (const width of [320, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long tables must fit the message width without widening the page');
		await page.screenshot({ path: path.join(output, `captain-who-content-dark-${width}.png`) });
	}
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', activeId: 'one', history: [{ id: 'one', title: '代码与泰勒展开式', updatedAt: Date.now() }, { id: 'two', title: '图论学习：最短路与最小生成树的区别', updatedAt: Date.now() - 86400000 }] }, '*'));
	await page.getByRole('textbox').fill('保留这一条草稿');
	await page.getByRole('button', { name: '返回', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'back' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', activeId: '', messages: [], busy: false }, '*'));
	await page.locator('.history-list').waitFor();
	assert.equal(await page.getByRole('button', { name: '聊天记录', exact: true }).count(), 0);
	assert.equal(await page.getByRole('searchbox').count(), 0);
	assert.equal(await page.getByText(/查看全部/).count(), 0);
	assert.equal(await page.locator('.history-row').count(), 2);
	assert.equal(await page.getByRole('textbox').inputValue(), '', 'History navigation does not carry a conversation draft into a new chat');
	assert.match(await page.locator('.history-open time').first().textContent(), /^\d{2}:\d{2}$/);
	assert.match(await page.locator('.history-open time').last().textContent(), /^昨天 \d{2}:\d{2}$/);
	await page.screenshot({ path: path.join(output, 'history-dark-360.png') });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.locator('.history-row').first().hover();
	assert.ok(await page.getByRole('button', { name: '重命名聊天', exact: true }).first().isVisible());
	assert.ok(await page.getByRole('button', { name: '删除聊天', exact: true }).first().isVisible());
	await page.getByRole('button', { name: '连接设置', exact: true }).hover();
	assert.equal(await page.getByRole('button', { name: '重命名聊天', exact: true }).first().isVisible(), false);
	await page.locator('.history-row').first().hover();
	await page.getByRole('button', { name: '重命名聊天', exact: true }).first().click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'renameHistory', conversationId: 'one' });
	await page.locator('.history-row').last().hover();
	await page.getByRole('button', { name: '删除聊天', exact: true }).last().click();
	assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).count(), 1);
	assert.equal(await page.getByRole('button', { name: '重命名聊天', exact: true }).last().isVisible(), false);
	await page.screenshot({ path: path.join(output, 'history-confirm-dark-360.png') });
	await page.getByRole('button', { name: '连接设置', exact: true }).hover();
	assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).count(), 0);
	await page.locator('.history-row').last().hover();
	await page.getByRole('button', { name: '删除聊天', exact: true }).last().click();
	await page.getByRole('button', { name: '确认删除', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'deleteHistory', conversationId: 'two' });
	await page.locator('.history-open').last().click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'openHistory', conversationId: 'two' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', activeId: 'two', messages: [] }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', screen: 'conversation', activeId: 'one', messages: [], draftText: '保留这一条草稿', homeHasDraft: true }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '保留这一条草稿');
	await page.getByRole('button', { name: '已有未发送草稿', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'newChat' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', activeId: '', messages: [], draftText: '主页保留的草稿', homeHasDraft: true }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '主页保留的草稿');
	await page.getByRole('button', { name: '新聊天', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'newChat' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', draftText: '', homeHasDraft: false }, '*'));
	await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
	const manyChats = Array.from({ length: 60 }, (_, index) => ({ id: 'chat-' + index, title: '历史聊天 ' + index, updatedAt: Date.now() - index * 86400000 }));
	await page.evaluate(history => window.fixtureSnapshot({ type: 'snapshot', history }, '*'), manyChats);
	await page.waitForFunction(() => document.querySelectorAll('.history-row').length === 60);
	assert.equal(await page.locator('.history-list').evaluate(element => element.scrollTop), 0, 'History starts with the newest chats');
	assert.ok(await page.locator('.history-list').evaluate(element => element.scrollHeight > element.clientHeight), 'All history entries are available by scrolling');
	await page.locator('.history-row').last().scrollIntoViewIfNeeded();
	assert.ok(await page.locator('.history-row').last().isVisible());
	assert.ok(await page.locator('.history-open time').evaluateAll(times => times.every(time => getComputedStyle(time).whiteSpace === 'nowrap')));
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', messages: [{ id: 1, role: 'user', text: '你好', reasoning: '', activities: [], status: 'complete', createdAt: Date.now() - 2 * 86400000 }] }, '*'));
	await page.locator('.user').hover();
	assert.match(await page.locator('.user-actions time').textContent(), /^星期. \d{2}:\d{2}$/);
	const actionLayout = await page.locator('.user-actions').evaluate(element => {
		const [time, copy, edit] = [...element.children].map(child => child.getBoundingClientRect());
		return { height: time.height, fits: time.right <= copy.left && copy.right <= edit.left, left: time.left };
	});
	assert.ok(actionLayout.height < 24 && actionLayout.fits && actionLayout.left >= 0, 'Short bubbles keep the full timestamp and actions on one line');
	const bubble = await page.locator('.user-content').boundingBox();
	const copyMessage = page.getByRole('button', { name: '复制消息', exact: true });
	const copyBounds = await copyMessage.boundingBox();
	// Move through the former 5px hover gap; locator.click alone can jump over it.
	await page.mouse.move(copyBounds.x + copyBounds.width / 2, bubble.y + bubble.height + 2);
	assert.equal(await page.locator('.user-actions').evaluate(element => getComputedStyle(element).opacity), '1', 'The controls remain visible while crossing from the bubble');
	await page.mouse.move(copyBounds.x + copyBounds.width / 2, copyBounds.y + copyBounds.height / 2, { steps: 8 });
	await page.mouse.click(copyBounds.x + copyBounds.width / 2, copyBounds.y + copyBounds.height / 2);
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'copy', id: 1 });
	await page.locator('.user-content').hover();
	const editBounds = await page.getByRole('button', { name: '编辑消息', exact: true }).boundingBox();
	await page.mouse.move(editBounds.x + editBounds.width / 2, bubble.y + bubble.height + 2);
	await page.mouse.move(editBounds.x + editBounds.width / 2, editBounds.y + editBounds.height / 2, { steps: 8 });
	await page.mouse.click(editBounds.x + editBounds.width / 2, editBounds.y + editBounds.height / 2);
	await page.getByRole('textbox', { name: '编辑消息', exact: true }).waitFor();
	assert.equal(await page.getByRole('textbox', { name: '编辑消息', exact: true }).inputValue(), '你好');
	await page.getByRole('button', { name: '取消', exact: true }).click();
	await page.getByRole('button', { name: '连接设置', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'settings' });
	const stableConversation = await page.locator('.conversation').elementHandle();
	await page.getByRole('button', { name: '新聊天', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'newChat' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', activeId: '', messages: [], busy: false }, '*'));
	await page.waitForFunction(() => document.querySelector('.welcome'));
	assert.ok(await stableConversation?.evaluate(element => element.isConnected), 'Starting a new chat keeps the scroll container mounted to avoid a flash');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', saveFailed: true }, '*'));
	await page.getByRole('button', { name: '重试保存', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'saveHistory' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', saveFailed: false, historyUnreadable: true }, '*'));
	await page.getByRole('alert').filter({ hasText: '无法读取聊天记录' }).waitFor();
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled());
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', historyUnreadable: false }, '*'));
	const webSources = [{ id: 'web-0123456789abcdef', title: 'std::vector：容量、迭代器与复杂度', url: 'https://en.cppreference.com/cpp/container/vector', kind: 'search', text: '', retrievedAt: Date.now(), truncated: true }, { id: 'web-fedcba9876543210', title: 'Python 标准库文档', url: 'https://docs.python.org/3/library/', kind: 'page', text: '', retrievedAt: Date.now(), truncated: false }];
	await page.evaluate(({ text, sources }) => window.fixtureSnapshot({ type: 'snapshot', error: '', busy: true, webEnabled: true, messages: [{ id: 91, role: 'assistant', text, sources, reasoning: '', activities: [{ id: 'lookup', type: 'web-search', path: 'C++ vector documentation', status: 'running' }], status: 'streaming', createdAt: Date.now() }] }, '*'), { text, sources: webSources });
	await page.locator('.web-sources summary').click();
	await page.getByText('搜索摘要 · 已截断', { exact: true }).waitFor();
	await page.getByText('网页节选', { exact: true }).waitFor();
	assert.equal(await page.locator('.web-sources a').count(), 2);
	const sourceNode = await page.locator('.web-sources').elementHandle();
	await page.getByRole('link', { name: /std::vector：容量/ }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'link', url: webSources[0].url });
	await webToggle.click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'setWebEnabled', enabled: false });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: true, webEnabled: false, requestNotice: { id: 2, text: '联网开关将在下一轮回复中生效。' } }, '*'));
	await page.getByRole('status').getByText('联网开关将在下一轮回复中生效。', { exact: true }).waitFor();
	assert.ok(await page.getByRole('button', { name: '暂停生成', exact: true }).isEnabled(), 'Changing web access does not pause the response');
	assert.ok(await sourceNode.evaluate(element => element.isConnected && element.open), 'Source list stays mounted and expanded across streaming snapshots');
	for (const width of [360, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Web sources and composer fit the sidebar');
		await page.screenshot({ path: path.join(output, `web-sources-dark-${width}.png`) });
	}
	await page.evaluate(({ sources }) => window.fixtureSnapshot({ type: 'snapshot', busy: false, messages: [{ id: 91, role: 'assistant', text: '无法核实当前资料。', sources, reasoning: '', activities: [{ id: 'lookup', type: 'web-search', path: 'C++ vector documentation', status: 'error', error: 'rate-limit' }], status: 'stopped', durationMs: 1000 }] }, '*'), { sources: webSources });
	await page.getByText('搜索服务暂时限流，请稍后再试。', { exact: true }).waitFor();
	assert.equal(await page.getByText('重新生成回答', { exact: true }).count(), 0);
	const feedback = [
		{ id: 'closed', type: 'read', path: 'main.cpp', status: 'error', error: 'page-closed' },
		{ id: 'save', type: 'notebook-edit', path: 'notes.bcnb', status: 'error', error: 'save-failed' }
	];
	await page.evaluate(activities => window.fixtureSnapshot({ type: 'snapshot', busy: false, messages: [{ id: 92, role: 'assistant', text: '', activities, status: 'complete' }] }, '*'), feedback);
	await page.getByText('页面已关闭，请重新打开后读取。', { exact: true }).waitFor();
	await page.getByText('修改已应用但未保存，请查看原生笔记编辑器。', { exact: true }).waitFor();
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Tool failure feedback fits the narrow sidebar');
	await page.locator('.thought').screenshot({ path: path.join(output, 'tool-feedback-zh-760.png') });
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', connection: { provider: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'unknown-model', parameters: {}, keyConfigured: false, loading: false, error: '' }, webEnabled: true }, '*'));
	await page.waitForFunction(() => document.querySelector('.web-toggle')?.getAttribute('data-available') === 'false');
	assert.ok((await webToggle.getAttribute('data-becoder-tooltip')).includes('当前模型未确认支持工具'));
	assert.equal(await webToggle.getAttribute('aria-pressed'), 'true', 'An unavailable model does not silently rewrite the saved switch');
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fafafa; --vscode-editor-background:#fff; --vscode-foreground:#292d33; --vscode-descriptionForeground:#656970; --vscode-input-background:#eee; --vscode-input-foreground:#222; --vscode-textCodeBlock-background:#f0f1f3; }' });
	await publishAnswer(text, '检查 $n^2$。', 'complete', 18000);
	await page.waitForSelector('.code-line');
	await page.getByRole('button', { name: '重新回答', exact: true }).hover();
	await page.waitForTimeout(130);
	await page.locator('.assistant-actions').screenshot({ path: path.join(output, 'controls-message-hover-light.png') });
	await page.screenshot({ path: path.join(output, 'light-360.png') });
	await page.goto(`http://127.0.0.1:${server.address().port}/english`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fafafa; --vscode-foreground:#292d33; --vscode-descriptionForeground:#656970; --vscode-input-background:#eee; --vscode-input-foreground:#222; --vscode-font-family:Segoe UI, sans-serif; --vscode-editor-font-family:Consolas, monospace; --vscode-widget-border:#ddd; }' });
	await publishAnswer('Hello.', 'Check the boundary.', 'complete', 18000);
	await page.getByText('Thought for 18s', { exact: true }).waitFor();
	await page.evaluate(activities => window.fixtureSnapshot({ type: 'snapshot', busy: false, messages: [{ id: 92, role: 'assistant', text: '', activities, status: 'complete' }] }, '*'), feedback);
	await page.getByText('The page is closed. Open it again to read its contents.', { exact: true }).waitFor();
	await page.getByText('The edits were applied but not saved. Check the native Notebook editor.', { exact: true }).waitFor();
	await page.locator('.thought').screenshot({ path: path.join(output, 'tool-feedback-en-360.png') });
	await publishAnswer('Partial output.', '', 'stopped', 61000);
	await page.getByText('Paused after 1m 1s', { exact: true }).waitFor();
	assert.equal(await page.locator('.running-text').count(), 0);
	assert.equal(await page.getByRole('button', { name: 'Web search', exact: true }).getAttribute('aria-pressed'), 'true');
	// Attachment preview uses captured bytes; drafts survive a rejected send.
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-input-background:#1b1f24; --vscode-input-foreground:#d4d4d4; --vscode-input-placeholderForeground:#8b919a; --vscode-font-family:Segoe UI, sans-serif; --vscode-widget-border:#343b44; --vscode-focusBorder:#629ad1; }' });
	const image = { id: 'image-test', path: 'D:/workspace/question.png', name: 'question.png', kind: 'image', contents: '', mediaType: 'image/png', source: 'internal', truncated: false };
	const file = { id: 'file-test', path: 'D:/workspace/very-long-filename-for-an-algorithm-solution.cpp', name: 'very-long-filename-for-an-algorithm-solution.cpp', kind: 'text', contents: '', source: 'internal', truncated: true };
	await page.evaluate(({ image, file }) => window.fixtureSnapshot({ type: 'snapshot', activeId: '', configured: true, permission: 'workspace', busy: false, messages: [], attachments: [image, file], connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', parameters: {}, loading: false, keyConfigured: true, error: '' } }, '*'), { image, file });
	await page.locator('.draft-attachments').waitFor();
	assert.equal(await page.getByRole('button', { name: '添加文件', exact: true }).count(), 1);
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), 'Non-vision models cannot send an image');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'attachmentPreview', id: 'image-test', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dwAAAABJRU5ErkJggg==' }, '*'));
	await page.locator('.draft-attachments img').waitFor();
	await page.getByRole('button', { name: '移除附件 question.png', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'removeAttachment', id: 'image-test' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'computer', connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', parameters: {}, loading: false, keyConfigured: true, error: '' } }, '*'));
	await page.getByRole('button', { name: '添加文件', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'addFiles' });
	await page.getByRole('textbox', { name: '向 Beacon 提问' }).fill('查看附件');
	await page.evaluate(() => { window.acceptSends = false; });
	await page.getByRole('button', { name: '发送', exact: true }).click();
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: false, requestNotice: { id: 9, text: '附件读取失败' } }, '*'));
	assert.equal(await page.getByRole('textbox', { name: '向 Beacon 提问' }).inputValue(), '查看附件');
	assert.equal(await page.locator('.draft-attachments .attachment-card').count(), 2);
	for (const width of [360, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Attachments fit the sidebar');
		await page.screenshot({ path: path.join(output, `attachments-dark-${width}.png`) });
	}
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fafafa; --vscode-foreground:#292d33; --vscode-descriptionForeground:#656970; --vscode-input-background:#fff; --vscode-input-foreground:#222; --vscode-widget-border:#dedede; }' });
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.screenshot({ path: path.join(output, 'attachments-light-360.png') });
	await page.evaluate(() => { window.acceptSends = true; window.fixtureSnapshot({ type: 'snapshot', attachments: [], messages: [{ id: 1, role: 'user', text: '', attachments: [{ id: 'stored', name: 'question.png', path: 'D:/workspace/question.png', source: 'internal', kind: 'image', contents: '', truncated: false }], activities: [], status: 'complete' }, { id: 2, role: 'assistant', text: 'partial', activities: [], status: 'stopped' }] }, '*'); });
	await page.getByRole('textbox', { name: '向 Beacon 提问' }).fill('');
	await page.getByRole('button', { name: '继续回答', exact: true }).waitFor();
	await page.evaluate(({ file }) => window.fixtureSnapshot({ type: 'snapshot', attachments: [file] }, '*'), { file });
	await page.getByRole('button', { name: '发送', exact: true }).waitFor();
	assert.equal(await page.getByRole('button', { name: '继续回答', exact: true }).count(), 0, 'A new attachment sends a new message after pause');
	await page.getByRole('button', { name: '发送', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '' });
	await page.goto('http://127.0.0.1:' + server.address().port + '/configuration');
	await page.addStyleTag({ content: ':root { --vscode-editor-background:#21252b; --vscode-sideBar-background:#21252b; --vscode-foreground:#ccc; --vscode-descriptionForeground:#999a9c; --vscode-font-family:Segoe UI, sans-serif; --vscode-input-background:#282c34; --vscode-input-foreground:#ccc; --vscode-textLink-foreground:#7db9e8; --vscode-button-background:#365a78; --vscode-widget-border:#343b44; --vscode-focusBorder:#629ad1; }' });
	await page.evaluate(() => {
		window.settings = { revision: 1, pending: false, error: '', keyConfigured: {}, providers: {
			deepseek: { baseURL: 'https://api.deepseek.com', models: [] },
			bailian: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: [] },
			moonshot: { baseURL: 'https://api.moonshot.cn/v1', models: [] },
			ollama: { baseURL: 'http://localhost:11434/v1', models: [] }
		} };
		window.fixtureSnapshot({ type: 'settingsSnapshot', settings: window.settings, busy: false }, '*');
	});
	const acknowledge = async (ok, error) => page.evaluate(({ ok, error }) => {
		const message = window.messages.at(-1);
		if (ok) {
			if (message.type === 'saveConnection') {
				window.settings.providers[message.provider].baseURL = message.baseURL.replace(/\/+$/, '');
				window.settings.keyConfigured[message.provider] = !!message.key;
			}
			if (message.type === 'saveModel') {
				const models = window.settings.providers[message.provider].models;
				const index = models.findIndex(model => model.id === message.originalId);
				if (index < 0) { models.push(message.model); } else { models[index] = message.model; }
			}
			window.settings.revision++;
		}
		window.fixtureSnapshot({ type: 'settingsSnapshot', settings: window.settings, busy: true }, '*');
		window.fixtureSnapshot({ type: 'settingsResult', requestId: message.requestId, ok, error }, '*');
	}, { ok, error });
	await page.getByRole('heading', { name: 'Beacon 设置', exact: true }).waitFor();
	await page.setViewportSize({ width: 360, height: 1000 });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings fit a narrow editor');
	await page.screenshot({ path: path.join(output, 'settings-dark-360.png') });
	await page.getByLabel('API 地址', { exact: true }).fill('https://api.deepseek.com/');
	await page.getByLabel('API Key', { exact: true }).fill('new-test-key');
	assert.ok(await page.getByRole('button', { name: /Ollama/ }).isDisabled(), 'Provider navigation preserves an unsaved connection draft');
	await page.getByRole('button', { name: '保存连接', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'saveConnection');
	await acknowledge(false, '测试保存失败，保留草稿');
	await page.getByRole('alert').filter({ hasText: '测试保存失败' }).waitFor();
	assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), 'new-test-key');
	await page.getByRole('button', { name: '保存连接', exact: true }).click();
	await acknowledge(true);
	await page.getByRole('button', { name: /Ollama/ }).waitFor();
	await page.waitForFunction(() => document.querySelector('input[type="password"]').value === '');
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), 'https://api.deepseek.com');
	assert.ok(await page.getByRole('button', { name: '保存连接', exact: true }).isDisabled());
	await page.getByRole('button', { name: '获取模型', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'fetchModels');
	await page.evaluate(() => {
		window.settings.providers.deepseek.models = [{ id: 'deepseek-v4-flash', name: 'DeepSeek Flash', enabled: true, parameters: {}, settings: {} }];
	});
	await acknowledge(true);
	await page.getByRole('button', { name: '编辑 DeepSeek Flash', exact: true }).click();
	await page.getByLabel('显示名称', { exact: true }).fill('My Flash');
	const beforeDraft = await page.evaluate(() => window.messages.length);
	await page.getByRole('combobox', { name: '思考模式', exact: true }).selectOption('disabled');
	await page.getByRole('switch', { name: '自定义温度', exact: true }).click();
	await page.getByRole('spinbutton', { name: '温度', exact: true }).fill('0.7');
	await page.getByRole('switch', { name: '自定义Top-P', exact: true }).click();
	await page.getByRole('spinbutton', { name: 'Top-P', exact: true }).fill('0.8');
	await page.getByRole('combobox', { name: '工具调用', exact: true }).selectOption('supported');
	assert.equal(await page.evaluate(() => window.messages.length), beforeDraft, 'Model edits stay local until Save');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Model details fit a narrow editor');
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.evaluate(() => { document.querySelector('.settings-page').scrollTop = 0; });
	await page.screenshot({ path: path.join(output, 'settings-model-dark-1440.png'), fullPage: true });
	await page.locator('.model-form').screenshot({ path: path.join(output, 'settings-model-detail-dark.png') });
	const circles = await page.locator('.settings-model-row .settings-icon').evaluateAll(elements => elements.every(element => { const box = element.getBoundingClientRect(); return box.width === box.height && getComputedStyle(element).borderRadius === '50%'; }));
	assert.ok(circles, 'Model icon buttons have circular hover surfaces');
	await page.getByRole('button', { name: '保存模型', exact: true }).click();
	const save = await page.evaluate(() => window.messages.at(-1));
	assert.equal(save.type, 'saveModel'); assert.equal(save.model.name, 'My Flash');
	assert.deepStrictEqual(save.model.parameters, { temperature: 0.7, topP: 0.8 });
	await acknowledge(false, '测试模型保存失败');
	await page.getByRole('alert').filter({ hasText: '测试模型保存失败' }).waitFor();
	assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), 'My Flash');
	await page.getByRole('button', { name: '保存模型', exact: true }).click();
	await acknowledge(true);
	await page.getByRole('button', { name: '编辑 My Flash', exact: true }).click();
	await page.getByLabel('显示名称', { exact: true }).fill('Discarded name');
	const beforeCancel = await page.evaluate(() => window.messages.length);
	await page.getByRole('button', { name: '取消编辑', exact: true }).click();
	assert.equal(await page.evaluate(() => window.messages.length), beforeCancel, 'Cancel never sends an update');
	await page.getByRole('button', { name: '编辑 My Flash', exact: true }).click();
	assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), 'My Flash');
	await page.getByRole('combobox', { name: '思考模式', exact: true }).selectOption('enabled');
	assert.equal(await page.getByRole('spinbutton', { name: '温度', exact: true }).count(), 0, 'Unsupported sampling overrides are removed when thinking is enabled');
	await page.getByRole('button', { name: '取消编辑', exact: true }).click();
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-editor-background:#fff; --vscode-sideBar-background:#fff; --vscode-foreground:#222; --vscode-descriptionForeground:#777; --vscode-input-background:#fafafa; --vscode-input-foreground:#222; --vscode-widget-border:#eee; --vscode-textLink-foreground:#3278ae; }' });
	await page.screenshot({ path: path.join(output, 'settings-light-1440.png'), fullPage: true });
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.getByRole('button', { name: '编辑 My Flash', exact: true }).click();
	await page.locator('.model-form').screenshot({ path: path.join(output, 'settings-model-light-360.png') });
	await page.getByRole('button', { name: '取消编辑', exact: true }).click();
	await page.getByRole('button', { name: /Ollama/ }).click();
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), 'http://localhost:11434/v1');
	await page.getByRole('button', { name: '添加模型', exact: true }).click();
	await page.getByLabel('模型 ID', { exact: true }).fill('local-model');
	assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), 'local-model');
	await page.getByRole('button', { name: '取消编辑', exact: true }).click();
	await page.getByRole('button', { name: '打开聊天', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'openChat' });
	assert.deepStrictEqual(errors, []);
	console.log('Production UI: Captain Who-style Markdown/code blocks, exact clipboard, GFM/math, activity lifecycle/timer, reduced motion, scroll escape/return/resize, Chinese/English, themes, history and settings passed. Screenshots: ' + output);
} catch (error) {
	const page = browser.contexts()[0]?.pages()[0];
	if (page) {
		fs.writeFileSync(path.join(output, 'failure.html'), await page.content());
		await page.screenshot({ path: path.join(output, 'failure.png') });
	}
	throw error;
} finally {
	await browser.close();
	await new Promise(resolve => server.close(resolve));
}
