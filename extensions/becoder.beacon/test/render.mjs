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
		let state = { type: 'snapshot', screen: 'home', activeId: '', canSend: true, temporary: true, viewKey: 'test::', attachments: [], messages: [], history: [], busy: false, responseBusy: false, saveFailed: false, historyUnreadable: false, error: '', permission: 'none', webEnabled: true, context: { slot: 'test', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] } };
		// Produce complete current host snapshots. Individual cases patch fixture state.
		window.fixtureSnapshot = (patch, origin) => {
			if (patch.type !== 'snapshot') { window.postMessage(patch, origin); return; }
			const previousView = state.viewKey;
			state = { ...state, ...patch };
			if (patch.busy !== undefined && patch.responseBusy === undefined) { state.responseBusy = patch.busy; }
			if (patch.context !== undefined) { state.context = { runtimeBusy: false, ...patch.context }; }
			if (patch.screen === undefined && patch.messages !== undefined) { state.screen = patch.messages.length ? 'conversation' : 'home'; }
			state.viewKey = `${state.context.slot}:${state.context.root ?? ''}:${state.activeId}`;
			if (state.viewKey !== previousView && patch.draftText === undefined) { state.draftText = ''; }
			state.temporary = !state.context.usable || state.context.mode === 'blackout';
			window.postMessage(state, origin);
		};
		window.fixtureState = () => structuredClone(state);
		window.acquireVsCodeApi = () => ({ postMessage: message => {
			(window.messages ??= []).push(message);
			if (message.type === 'send' && window.acceptSends !== false) { window.postMessage({ type: 'sendAccepted', text: message.text, editRevision: message.editRevision, viewKey: state.viewKey, conversationViewKey: state.viewKey }, '*'); }
		} });
	});
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-editor-background:#181b20; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-input-background:#1b1f24; --vscode-input-foreground:#d4d4d4; --vscode-input-placeholderForeground:#8b919a; --vscode-textCodeBlock-background:#171b20; --vscode-font-family:Segoe UI, sans-serif; --vscode-editor-font-family:Consolas, monospace; --vscode-button-background:#505965; --vscode-button-foreground:#fff; --vscode-scrollbarSlider-background:#454c57; --vscode-widget-border:#343b44; --vscode-focusBorder:#629ad1; }' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', screen: 'conversation', activeId: 'inherited', configured: true, messages: [
		{ id: 1, role: 'user', text: '原聊天中的问题', status: 'complete', activities: [] },
		{ id: 2, role: 'assistant', text: '这是已有上下文。', status: 'complete', activities: [] },
		{ id: 3, role: 'user', text: '临时追问', status: 'complete', activities: [], transition: 'temporary' },
		{ id: 4, role: 'assistant', text: '临时对话继续。', status: 'complete', activities: [] },
		{ id: 5, role: 'user', text: '保存后继续讨论', status: 'complete', activities: [], transition: 'persistent' }
	] }, '*'));
	await page.getByText('原聊天中的问题', { exact: true }).waitFor();
	assert.equal(await page.getByRole('separator').count(), 2, 'Both inherited conversation boundaries are visible');
	await page.getByText('已继承上文，开始临时对话', { exact: true }).waitFor();
	await page.getByText('已继承上文，建立持久化对话', { exact: true }).waitFor();
	for (const width of [360, 760]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Inherited dividers fit the panel');
		await page.screenshot({ path: path.join(output, `mode-inheritance-dark-${width}.png`) });
	}
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#fff; --vscode-foreground:#252525; --vscode-descriptionForeground:#616161; --vscode-widget-border:#ddd; --vscode-input-background:#f5f5f5; --vscode-input-foreground:#252525; }' });
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.screenshot({ path: path.join(output, 'mode-inheritance-light-360.png') });
	await page.addStyleTag({ content: ':root { --vscode-sideBar-background:#21262d; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; --vscode-widget-border:#343b44; --vscode-input-background:#1b1f24; --vscode-input-foreground:#d4d4d4; }' });
	await page.evaluate(() => { document.body.className = 'vscode-dark'; });
	await page.setViewportSize({ width: 760, height: 1000 });
	await page.evaluate(() => { window.acceptSends = false; });
	const sameTextInput = page.getByRole('textbox', { name: '向 Beacon 提问', exact: true });
	await sameTextInput.fill('同样的问题'); await page.getByRole('button', { name: '发送', exact: true }).click();
	const originalSend = await page.evaluate(() => window.messages.findLast(message => message.type === 'send'));
	await sameTextInput.fill(''); await sameTextInput.fill('同样的问题');
	await page.evaluate(send => { window.postMessage({ type: 'sendAccepted', text: send.text, viewKey: window.fixtureState().viewKey, editRevision: send.editRevision }, '*'); }, originalSend);
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await sameTextInput.inputValue(), '同样的问题', 'A late send acknowledgement preserves a new draft even when its text matches the sent question');
	await page.evaluate(send => {
		const previous = window.fixtureState(); const current = `${previous.context.slot}:${previous.context.root ?? ''}:accepted-destination`;
		window.fixtureSnapshot({ type: 'snapshot', activeId: 'accepted-destination', draftText: '', acceptedInputView: { previous: previous.viewKey, current, editRevision: send.editRevision } }, '*');
	}, originalSend);
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await sameTextInput.inputValue(), '同样的问题', 'An accepted destination snapshot cannot erase newer local input still in flight');
	await sameTextInput.press('End'); await sameTextInput.pressSequentially('继续');
	assert.equal(await sameTextInput.inputValue(), '同样的问题继续');
	await page.evaluate(() => { window.acceptSends = true; });
	// Navigation keeps interaction locked without dimming otherwise available controls.
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', screen: 'home', activeId: '', messages: [], busy: false, responseBusy: false, navigationBusy: false, configured: true, canSend: true, permission: 'workspace', draftText: 'next question', context: { slot: 'test', root: 'C:/example', usable: true, workspaceState: 'ready', mode: 'spot', busy: false, runtimeBusy: false, recent: [] }, history: [{ id: 'visual-chat', title: 'Visual chat', updatedAt: Date.now() }] }, '*'));
	await page.locator('.history-open').waitFor();
	const stableControls = ['.add-files', '.permission-trigger', '.header-actions > button:last-child', '.send'];
	const appearance = () => page.evaluate(selectors => selectors.map(selector => { const style = getComputedStyle(document.querySelector(selector)); return { opacity: style.opacity, color: style.color, background: style.backgroundColor }; }), stableControls);
	await page.mouse.move(0, 500);
	await page.waitForTimeout(150);
	const idleAppearance = await appearance();
	await page.screenshot({ path: path.join(output, 'navigation-idle.png') });
	await page.locator('.history-open').click();
	await page.mouse.move(0, 500);
	assert.deepEqual(await appearance(), idleAppearance, 'Local navigation keeps surrounding control appearance');
	assert.equal(await page.locator('.add-files').isDisabled(), true, 'Quiet navigation still locks actions');
	const openedChats = await page.evaluate(() => window.messages.filter(message => message.type === 'openHistory').length);
	await page.locator('.history-open').click({ force: true });
	assert.equal(await page.evaluate(() => window.messages.filter(message => message.type === 'openHistory').length), openedChats, 'Quiet controls still reject repeated clicks');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: true, busy: true, responseBusy: false }, '*'));
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.deepEqual(await appearance(), idleAppearance, 'Host navigation preserves the same visuals');
	await page.screenshot({ path: path.join(output, 'navigation-locked.png') });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: false, busy: false }, '*'));
	await page.locator('.add-files').hover(); await page.waitForTimeout(150);
	const hoverAppearance = await appearance();
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: true, busy: true, responseBusy: false }, '*'));
	await page.waitForTimeout(150);
	assert.deepEqual(await appearance(), hoverAppearance, 'A hovered control keeps its surface during navigation');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: false, busy: false, draftText: '' }, '*'));
	await page.mouse.move(0, 500); await page.waitForTimeout(150);
	const emptyAppearance = await appearance();
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: true, busy: true, responseBusy: false }, '*'));
	await page.waitForTimeout(150);
	assert.deepEqual(await appearance(), emptyAppearance, 'Navigation does not brighten an empty composer send control');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: true, busy: true, context: { ...window.fixtureState().context, runtimeBusy: true } }, '*'));
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await page.locator('.add-files').evaluate(node => getComputedStyle(node).opacity), '0.4', 'Runtime activity takes precedence over quiet navigation');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', navigationBusy: false, busy: false, context: { ...window.fixtureState().context, runtimeBusy: false } }, '*'));
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', screen: 'home', activeId: '', canSend: false, configured: false, busy: false, messages: [], history: [], permission: 'none', context: { slot: 'test', usable: false, workspaceState: 'none', mode: 'blackout', busy: false, runtimeBusy: false, recent: [] } }, '*'));
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
	// Runtime producers block sending in both persistent and workspace-free sessions.
	const runtimeDraft = page.getByRole('textbox', { name: '向 Beacon 提问', exact: true });
	await runtimeDraft.fill('运行结束后由我再次发送');
	const beforeRuntime = await page.evaluate(() => window.messages.filter(message => ['send', 'stop', 'continue'].includes(message.type)).length);
	for (const workspace of [false, true]) {
		for (const activity of ['context', 'runtime']) {
			await page.evaluate(({ workspace, activity }) => window.fixtureSnapshot({ type: 'snapshot', busy: false, responseBusy: false, context: { slot: 'test', ...(workspace ? { root: 'D:/fixture' } : {}), usable: workspace, workspaceState: workspace ? 'ready' : 'none', mode: workspace ? 'spot' : 'blackout', epoch: 0, busy: activity === 'context', runtimeBusy: activity === 'runtime', recent: [] } }, '*'), { workspace, activity });
			await page.locator('.send').waitFor();
			await runtimeDraft.fill('运行结束后由我再次发送');
			assert.equal(await page.getByRole('button', { name: '暂停生成', exact: true }).count(), 0, 'A producer activity never impersonates an assistant response');
			const blockedSend = page.getByRole('button', { name: '发送', exact: true });
			assert.ok(await blockedSend.isDisabled(), 'Producer activity disables the send arrow with or without a workspace');
			const idleSurface = await blockedSend.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, opacity: style.opacity, shadow: style.boxShadow }; });
			await blockedSend.hover();
			await page.waitForTimeout(130);
			assert.deepStrictEqual(await blockedSend.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, opacity: style.opacity, shadow: style.boxShadow }; }), idleSurface, 'Disabled send remains matte on hover');
			await runtimeDraft.press('Enter');
			await blockedSend.dispatchEvent('click');
			assert.equal(await page.evaluate(() => window.messages.filter(message => ['send', 'stop', 'continue'].includes(message.type)).length), beforeRuntime, 'Disabled clicks and Enter do not send or queue an action');
			if (activity === 'runtime') { await page.locator('footer').screenshot({ path: path.join(output, `runtime-send-disabled-${workspace ? 'workspace' : 'no-workspace'}.png`) }); }
		}
	}
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: true, responseBusy: true, context: { ...window.fixtureState().context, runtimeBusy: true } }, '*'));
	await page.getByRole('button', { name: '暂停生成', exact: true }).waitFor();
	assert.ok(await page.getByRole('button', { name: '暂停生成', exact: true }).isEnabled(), 'An actual assistant response remains pausable while a producer is active');
	await page.getByRole('button', { name: '暂停生成', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'stop' });
	const sendsAfterRuntime = await page.evaluate(() => window.messages.filter(message => message.type === 'send').length);
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', busy: false, responseBusy: false, context: { ...window.fixtureState().context, busy: false, runtimeBusy: false } }, '*'));
	await page.getByRole('button', { name: '发送', exact: true }).waitFor();
	await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await page.evaluate(() => window.messages.filter(message => message.type === 'send').length), sendsAfterRuntime, 'Completing runtime work does not automatically send the preserved draft');
	assert.equal(await runtimeDraft.inputValue(), '运行结束后由我再次发送', 'Runtime activity preserves the draft');
	await page.getByRole('button', { name: '发送', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '运行结束后由我再次发送', editRevision: await page.evaluate(() => window.messages.at(-1).editRevision) });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', context: { slot: 'test', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] } }, '*'));
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
	assert.deepStrictEqual(await permissions.locator('small').allTextContents(), ['只读已打开文件的无痕模式', '只工作在当前Beacon工作区', '可自由访问本机文件']);
	assert.equal(await permissions.locator('.permission-menu-heading, .permission-note').count(), 0);
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
	await page.mouse.click(2, 200);
	await page.waitForTimeout(180);
	const collapsedWidth = (await page.locator('.workspace-picker-shell').boundingBox()).width;
	await page.locator('.workspace-picker-trigger.hidden').hover();
	await page.waitForTimeout(180);
	const expandedWidth = (await page.locator('.workspace-picker-shell').boundingBox()).width;
	assert.ok(expandedWidth > collapsedWidth, 'Blackout workspace status expands on hover');
	await page.screenshot({ path: path.join(output, 'workspace-blackout-expanded.png') });
	const naturalRestoration = page.locator('.workspace-picker-shell').evaluate(element => new Promise(resolve => {
		const frames = [];
		let started;
		const sample = now => {
			const label = element.querySelector('.workspace-status-label');
			if (!element.closest('.workspace-picker').classList.contains('expanded')) {
				started ??= now;
				const labels = element.querySelector('.workspace-labels');
				const icon = element.querySelector('.workspace-status-icon');
				frames.push({ elapsed: now - started, width: element.getBoundingClientRect().width, overflow: getComputedStyle(label).overflow, clipPath: getComputedStyle(labels).clipPath, textWidth: labels.getBoundingClientRect().width, textRight: labels.getBoundingClientRect().right, iconLeft: icon.getBoundingClientRect().left });
			}
			if (started !== undefined && now - started >= 180) { resolve(frames); } else { requestAnimationFrame(sample); }
		};
		requestAnimationFrame(sample);
	}));
	await page.mouse.move(2, 200);
	const restorationFrames = await naturalRestoration;
	const earlyFrame = restorationFrames.find(frame => frame.elapsed >= 30 && frame.elapsed <= 65);
	assert.ok(earlyFrame && earlyFrame.width > collapsedWidth + (expandedWidth - collapsedWidth) * .5, 'Natural pointer leave retains the visible capsule through the first frames');
	assert.ok(restorationFrames.every(frame => frame.overflow === 'visible'), 'Status text retains its clipping rules throughout restoration');
	assert.ok(restorationFrames.every(frame => frame.clipPath === 'inset(0px)' && (frame.textWidth === 0 || frame.textRight <= frame.iconLeft)), 'Restoring text is clipped to the left of the fixed status icon in every frame');
	await page.locator('.workspace-picker-trigger.hidden').hover();
	await page.waitForTimeout(180);
	await page.mouse.move(2, 200);
	const restoring = await page.locator('.workspace-picker-shell').evaluate(element => {
		const animations = element.getAnimations({ subtree: true });
		const transitions = animations.filter(animation => animation instanceof CSSTransition && (animation.effect.target === element || animation.effect.target === element.querySelector('.workspace-status-label')));
		for (const animation of animations) { animation.pause(); animation.currentTime = 80; }
		return { width: element.getBoundingClientRect().width, properties: transitions.map(animation => animation.transitionProperty), durations: transitions.filter(animation => ['width', 'background-color', 'border-top-color', 'opacity'].includes(animation.transitionProperty)).map(animation => animation.effect.getTiming().duration), opacity: Number(getComputedStyle(element.querySelector('.workspace-status-label')).opacity) };
	});
	assert.ok(restoring.properties.includes('border-top-color'), 'The workspace border fades back instead of disappearing immediately');
	assert.ok(restoring.durations.every(duration => duration === 160), 'Workspace width, surface and label restore with the same timing');
	assert.ok(restoring.width > collapsedWidth && restoring.width < expandedWidth, 'The workspace is visibly between expanded and collapsed sizes');
	assert.ok(restoring.opacity > 0 && restoring.opacity < 1, 'The status label fades during restoration');
	await page.screenshot({ path: path.join(output, 'workspace-blackout-restoring.png'), animations: 'allow' });
	await page.locator('.workspace-picker-shell').evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
	assert.equal((await page.locator('.workspace-picker-shell').boundingBox()).width, collapsedWidth, 'Restoration ends at the original icon size');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.locator('.workspace-picker-trigger.hidden').hover();
	await page.mouse.move(2, 200);
	assert.equal(await page.locator('.workspace-picker-shell').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.effect.target === element || animation.effect.target === element.querySelector('.workspace-status-label')).length), 0, 'Reduced motion keeps workspace restoration immediate');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.screenshot({ path: path.join(output, 'workspace-blackout.png') });
	await page.getByRole('button', { name: 'Blackout', exact: true }).click();
	const blackoutPermissions = page.getByRole('dialog', { name: '文件读取权限', exact: true });
	assert.ok(await blackoutPermissions.getByRole('button', { name: /Spot/ }).isEnabled(), 'A valid selected workspace can leave manual Blackout');
	assert.ok(await blackoutPermissions.getByRole('button', { name: /Flood/ }).isEnabled());
	await page.keyboard.press('Escape');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'workspace', context: { slot: 'test', root: 'D:/fixture', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 3, busy: false, recent: ['D:/fixture'] } }, '*'));
	await page.getByRole('textbox').fill('解释这段代码');
	await page.getByRole('textbox').press('Enter');
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '解释这段代码', editRevision: await page.evaluate(() => window.messages.at(-1).editRevision) });
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
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '补充要求', editRevision: await page.evaluate(() => window.messages.at(-1).editRevision) });
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
	for (const theme of ['dark', 'light']) {
		const palette = await page.addStyleTag({ content: theme === 'dark' ? ':root { --vscode-sideBar-background:#21262d; --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#999fa8; }' : ':root { --vscode-sideBar-background:#fff; --vscode-foreground:#252525; --vscode-descriptionForeground:#616161; }' });
		for (const selector of ['.history-rename', '.history-delete']) {
			const control = page.locator(selector).first();
			await page.locator('.history-open').first().hover({ position: { x: 12, y: 12 } });
			await page.waitForTimeout(130);
			const bounds = await control.boundingBox();
			assert.equal(await control.locator('svg').evaluate(element => getComputedStyle(element).filter), 'none');
			await control.hover();
			await page.waitForTimeout(130);
			assert.deepStrictEqual(await control.boundingBox(), bounds, 'History hover preserves the target bounds');
			assert.equal(await control.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
			assert.match(await control.locator('svg').evaluate(element => getComputedStyle(element).filter), /drop-shadow/, 'Production history icons have a hover glow');
			await page.locator('.history-row').first().screenshot({ path: path.join(output, `history-${theme}-${selector.slice(1)}-hover.png`) });
		}
		await palette.evaluate(element => element.remove());
	}
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
	await page.waitForFunction(() => document.querySelector('.web-toggle')?.getAttribute('data-available') === 'true');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', connection: { provider: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'unknown-model', parameters: {}, keyConfigured: false, loading: false, error: '', capabilities: { purpose: 'chat', vision: true, reasoning: true, tools: false, source: 'manual' } } }, '*'));
	await page.waitForFunction(() => document.querySelector('.web-toggle')?.getAttribute('data-available') === 'false');
	assert.ok((await webToggle.getAttribute('data-becoder-tooltip')).includes('当前模型不支持工具'));
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
	await page.evaluate(({ image, file }) => window.fixtureSnapshot({ type: 'snapshot', activeId: '', configured: true, permission: 'workspace', busy: false, messages: [], attachments: [image, file], connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', capabilities: { purpose: 'chat', vision: false, reasoning: true, tools: true, source: 'service' }, parameters: {}, loading: false, keyConfigured: true, error: '' } }, '*'), { image, file });
	await page.locator('.draft-attachments').waitFor();
	assert.equal(await page.getByRole('button', { name: '添加文件', exact: true }).count(), 1);
	assert.ok(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), 'Non-vision models cannot send an image');
	await page.evaluate(() => window.fixtureSnapshot({ type: 'attachmentPreview', id: 'image-test', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dwAAAABJRU5ErkJggg==' }, '*'));
	await page.locator('.draft-attachments img').waitFor();
	await page.getByRole('button', { name: '移除附件 question.png', exact: true }).click();
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'removeAttachment', id: 'image-test' });
	await page.evaluate(() => window.fixtureSnapshot({ type: 'snapshot', permission: 'computer', connection: { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', capabilities: { purpose: 'chat', vision: true, reasoning: true, tools: true, source: 'service' }, parameters: {}, loading: false, keyConfigured: true, error: '' } }, '*'));
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
	assert.deepStrictEqual(await page.evaluate(() => window.messages.at(-1)), { type: 'send', text: '', editRevision: await page.evaluate(() => window.messages.at(-1).editRevision) });
	await page.goto('http://127.0.0.1:' + server.address().port + '/configuration');
	await page.evaluate(() => {
		window.settings = { revision: 1, pending: false, error: '', supplierEnabled: true, keyConfigured: { deepseek: true }, providers: { deepseek: { baseURL: 'https://api.deepseek.com', enabled: true, models: [] } } };
		window.fixtureSnapshot({ type: 'settingsSnapshot', settings: window.settings, busy: false }, '*');
	});
	await page.getByRole('heading', { name: '模型服务', exact: true }).waitFor();
	await page.getByRole('navigation', { name: '设置分类' }).getByText('模型配置', { exact: true }).waitFor();
	const providerPicker = page.getByRole('combobox', { name: '供应商', exact: true });
	await providerPicker.click();
	await page.getByRole('option', { name: 'DeepSeek', exact: true }).waitFor();
	assert.equal(await page.getByRole('option').count(), 4);
	await page.keyboard.press('Escape');
	assert.equal(await providerPicker.getAttribute('aria-expanded'), 'false');
	await providerPicker.press('ArrowDown');
	await page.getByRole('option', { name: 'DeepSeek', exact: true }).press('Enter');
	assert.ok(await providerPicker.evaluate(element => element === document.activeElement));
	assert.equal(await page.getByText('已保存，留空保留', { exact: true }).count(), 0);
	await page.getByRole('switch', { name: '启用 DeepSeek', exact: true }).waitFor();
	await page.addStyleTag({ content: ':root { --vscode-editor-background:#282c34; --vscode-sideBar-background:#282c34; --vscode-list-hoverBackground:#ffffff10; --vscode-foreground:#d4d5d8; --vscode-descriptionForeground:#a1a5ae; --vscode-font-family:Segoe UI,sans-serif; --vscode-input-background:#21252b; --vscode-input-foreground:#d4d5d8; --vscode-button-background:#365f88; --vscode-button-foreground:#fff; --vscode-widget-border:#3a3e46; --vscode-focusBorder:#59a4f9; }' });
	const settingsPublish = async patch => page.evaluate(patch => { Object.assign(window.settings, patch); window.fixtureSnapshot({ type: 'settingsSnapshot', settings: window.settings, busy: false }, '*'); }, patch);
	const settingsAck = async (ok = true, error) => page.evaluate(({ ok, error }) => { const message = window.messages.findLast(message => message.requestId); window.fixtureSnapshot({ type: 'settingsResult', requestId: message.requestId, ok, error }, '*'); }, { ok, error });
	const checkDraftEye = async name => {
		const icon = page.locator('.api-key-input .api-key-visibility-icon');
		const maskedIcon = await icon.evaluate(element => getComputedStyle(element).maskImage);
		assert.notEqual(maskedIcon, 'none');
		await page.getByRole('button', { name: '显示输入', exact: true }).click();
		assert.equal(await page.getByLabel('API 密钥', { exact: true }).getAttribute('type'), 'text');
		assert.equal(await page.getByRole('button', { name: '隐藏输入', exact: true }).getAttribute('aria-pressed'), 'true');
		assert.notEqual(await icon.evaluate(element => getComputedStyle(element).maskImage), maskedIcon, 'Visible draft changes the eye icon');
		await page.locator('.api-key-input').screenshot({ path: path.join(output, name + '-visible.png') });
		await page.getByRole('button', { name: '隐藏输入', exact: true }).click();
		assert.equal(await page.getByLabel('API 密钥', { exact: true }).getAttribute('type'), 'password');
		assert.equal(await icon.evaluate(element => getComputedStyle(element).maskImage), maskedIcon, 'Hiding the draft restores its eye icon');
	};
	const caps = { purpose: 'chat', vision: true, reasoning: true, tools: true, source: 'service', contextWindow: 1048576, maxOutputTokens: 393216, reasoningEfforts: ['low', 'high', 'max'] };
	await settingsPublish({ providers: { deepseek: { baseURL: 'https://api.deepseek.com', enabled: true, models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', parameters: {}, settings: {}, discovered: caps }] } } });
	const providerSwitch = page.getByRole('switch', { name: '启用 DeepSeek', exact: true });
	await page.mouse.move(0, 0);
	const switchBackground = await providerSwitch.evaluate(element => getComputedStyle(element).backgroundColor);
	await providerSwitch.hover();
	assert.equal(await providerSwitch.evaluate(element => getComputedStyle(element).backgroundColor), switchBackground, 'Hover preserves the switch track');
	await page.getByRole('button', { name: 'deepseek', exact: true }).hover();
	await page.waitForTimeout(150);
	assert.equal(await page.getByRole('button', { name: 'deepseek', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'Model group has no hover fill');
	await page.locator('.settings-model-group').screenshot({ path: path.join(output, 'settings-group-no-hover-fill.png') });
	assert.equal(await page.locator('.settings-capability.unknown small').count(), 0);
	assert.equal(await page.locator('.settings-capability.tools').evaluate(element => getComputedStyle(element).borderStyle), 'solid');
	await page.setViewportSize({ width: 900, height: 712 });
	await providerPicker.click();
	await page.getByRole('option', { name: 'DeepSeek', exact: true }).waitFor();
	await page.screenshot({ path: path.join(output, 'settings-provider-open-dark.png'), animations: 'disabled' });
	await page.getByRole('heading', { name: '模型服务', exact: true }).click();
	assert.equal(await providerPicker.getAttribute('aria-expanded'), 'false');
	await page.getByLabel('API 地址', { exact: true }).focus();
	assert.equal(await page.getByLabel('API 地址', { exact: true }).evaluate(element => getComputedStyle(element).outlineStyle), 'none');
	await page.screenshot({ path: path.join(output, 'settings-address-neutral-focus-dark.png'), animations: 'disabled' });
	for (const width of [1440, 900, 620, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'New settings fit viewport');
		await page.screenshot({ path: path.join(output, 'deepseek-settings-dark-' + width + '.png'), fullPage: true });
	}
	for (const width of [1440, 1100, 900, 801, 800, 700, 620, 541, 540, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		for (const id of ['connection-address', 'connection-key']) {
			const label = await page.locator(id === 'connection-key' ? '#connection-key-label' : 'label[for="' + id + '"]').boundingBox();
			const input = await page.locator('#' + id).boundingBox();
			assert.ok(input.x > label.x + label.width && label.y < input.y + input.height && label.y + label.height > input.y, 'Connection title and control stay beside each other at ' + width);
		}
		const addressBounds = await page.locator('#connection-address').boundingBox();
		const keyBounds = await page.locator('#connection-key').boundingBox();
		assert.ok(Math.abs(addressBounds.x - keyBounds.x) < 1 && addressBounds.width >= keyBounds.width, 'Address and key share a leading edge and use available width at ' + width);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings have no horizontal overflow at ' + width);
		await page.screenshot({ path: path.join(output, 'settings-inline-' + width + '.png'), fullPage: true });
	}
	await settingsPublish({ keyConfigured: { deepseek: false } });
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).waitFor();
	for (const width of [900, 700, 641, 640, 620, 541, 540, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		const address = await page.locator('#connection-address').boundingBox();
		const key = await page.locator('#connection-key').boundingBox();
		assert.ok(Math.abs(address.x - key.x) < 1 && address.width >= key.width, 'Empty key shares the address leading edge at ' + width);
		assert.ok(await page.locator('#connection-key').evaluate(element => element.scrollWidth <= element.clientWidth), 'Add key label is not clipped at ' + width);
		await page.screenshot({ path: path.join(output, 'settings-empty-key-' + width + '.png'), fullPage: true });
	}
	await settingsPublish({ keyConfigured: { deepseek: true } });
	await page.locator('.connection-key-field.configured').waitFor();
	assert.equal(await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '模型配置', exact: true }).count(), 1);
	await page.setViewportSize({ width: 900, height: 360 });
	await page.locator('.settings-v3').evaluate(element => element.scrollTo({ top: 180 }));
	await page.waitForFunction(() => document.querySelector('.settings-v3').scrollTop > 0);
	await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '模型配置', exact: true }).click();
	await page.waitForFunction(() => document.querySelector('.settings-v3').scrollTop === 0);
	await page.setViewportSize({ width: 620, height: 1000 });
	assert.equal(await page.locator('.settings-row-copy small').count(), 4);
	assert.equal(await page.locator('.settings-connection > form').evaluate(element => getComputedStyle(element).borderTopWidth), '1px');
	assert.equal(await page.locator('.settings-header h1').evaluate(element => getComputedStyle(element).fontSize), '24px');
	assert.equal(await page.locator('.settings-category').evaluate(element => getComputedStyle(element).fontSize), '13px');
	assert.equal(await page.locator('.settings-card').first().evaluate(element => getComputedStyle(element).borderRadius), '16px');
	assert.equal(await page.locator('.settings-v3 .settings-switch').evaluate(element => getComputedStyle(element).width), '32px');
	await page.setViewportSize({ width: 360, height: 1000 });
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '复制密钥', exact: true }).focus();
	await page.mouse.move(0, 0);
	assert.ok(await page.locator('.connection-key-actions button:not([data-key-action="show"])').evaluateAll(buttons => buttons.every(button => getComputedStyle(button).opacity === '0' && getComputedStyle(button).pointerEvents === 'none')), 'Key actions hide after pointer leaves even when a button retains focus');
	assert.equal(await page.getByRole('button', { name: '显示密钥', exact: true }).evaluate(button => getComputedStyle(button).opacity), '1');
	await page.screenshot({ path: path.join(output, 'settings-key-pointer-outside.png'), fullPage: true });
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '复制密钥', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).action, 'copy');
	const savedEye = page.locator('[data-key-action="show"] .api-key-visibility-icon');
	const maskedSavedEye = await savedEye.evaluate(element => getComputedStyle(element).maskImage);
	assert.notEqual(maskedSavedEye, 'none');
	await page.getByRole('button', { name: '显示密钥', exact: true }).click();
	const revealRequest = await page.evaluate(() => window.messages.at(-1));
	await page.evaluate(id => window.fixtureSnapshot({ type: 'connectionKey', provider: 'deepseek', requestId: id, revision: 1, key: 'fixture-saved' }, '*'), revealRequest.requestId);
	await page.waitForFunction(() => document.querySelector('#connection-key').textContent === 'fixture-saved');
	assert.equal(await page.getByRole('button', { name: '隐藏密钥', exact: true }).getAttribute('aria-pressed'), 'true');
	assert.notEqual(await savedEye.evaluate(element => getComputedStyle(element).maskImage), maskedSavedEye, 'Revealing the saved key changes the eye icon');
	await page.locator('.connection-key-field').screenshot({ path: path.join(output, 'saved-key-visible-eye.png') });
	await page.getByRole('button', { name: '隐藏密钥', exact: true }).click();
	assert.equal(await savedEye.evaluate(element => getComputedStyle(element).maskImage), maskedSavedEye, 'Hiding the saved key restores its eye icon');
	assert.equal(await page.locator('#connection-key').textContent(), '••••••••');
	const messagesBeforeKeyClick = await page.evaluate(() => window.messages.length);
	await page.locator('#connection-key').click({ position: { x: 10, y: 16 } });
	assert.equal(await page.getByRole('dialog').count(), 0, 'Clicking the saved key display does not edit it');
	assert.equal(await page.evaluate(() => window.messages.length), messagesBeforeKeyClick, 'Clicking the saved key display sends no host action');
	await page.getByRole('button', { name: '编辑密钥', exact: true }).click();
	await page.getByLabel('API 密钥', { exact: true }).fill('second-replacement');
	await checkDraftEye('replacement-key');
	await page.getByRole('button', { name: '保存并检测', exact: true }).click();
	await settingsPublish({ revision: 3, providerTest: undefined }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'testProvider');
	await page.getByRole('dialog').getByRole('button', { name: '取消检测', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'cancelProviderTest', 'Closing before the first running snapshot still cancels the submitted test');
	await page.evaluate(() => { const message = window.messages.findLast(message => message.type === 'testProvider'); window.fixtureSnapshot({ type: 'settingsResult', requestId: message.requestId, ok: true }, '*'); window.fixtureSnapshot({ type: 'settingsSnapshot', settings: { ...window.settings, revision: 3, pending: false, providerTest: undefined }, busy: false }, '*'); });
	await page.locator('#connection-key').waitFor();
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '删除密钥', exact: true }).waitFor({ state: 'visible' });
	await page.waitForFunction(() => !document.querySelector('[data-key-action="delete"]')?.disabled);
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '删除密钥', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'saveKey');
	assert.equal((await page.evaluate(() => window.messages.at(-1))).clearKey, true);
	await settingsAck(false, '删除失败');
	assert.ok(await page.locator('#connection-key').isVisible(), 'Deletion failure preserves the saved key control');
	await page.getByRole('button', { name: 'deepseek', exact: true }).click();
	assert.equal(await page.locator('.settings-model-row').count(), 0);
	await page.getByRole('button', { name: 'deepseek', exact: true }).click();
	await page.locator('.settings-model-logo img').waitFor();
	assert.ok(await page.locator('.settings-model-logo img').evaluate(image => image.complete && image.naturalWidth > 0));
	await page.locator('.connection-key-field').hover();
	await page.screenshot({ path: path.join(output, 'settings-approved-key-hover.png'), fullPage: true });
	await page.getByRole('button', { name: '编辑密钥', exact: true }).click();
	assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '', 'Replacing a key never fetches or prefills the saved secret');
	await page.getByLabel('API 密钥', { exact: true }).fill('fixture-input');
	assert.ok(await page.getByRole('button', { name: '同步模型', exact: true }).isDisabled());
	await page.getByRole('button', { name: '保存并检测', exact: true }).click(); await settingsAck(false, '保存失败');
	assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), 'fixture-input');
	await page.getByRole('button', { name: '保存并检测', exact: true }).click();
	const savedKeyRequest = await page.evaluate(() => window.messages.at(-1));
	assert.equal(savedKeyRequest.type, 'saveKey');
	assert.equal(savedKeyRequest.baseURL, undefined, 'Key saving is independent of the address');
	await settingsPublish({ revision: 2 }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'testProvider');
	assert.equal((await page.evaluate(() => window.messages.at(-1))).revision, 2, 'Chained testing uses the host-confirmed key revision');
	await settingsPublish({ providerTest: { id: 'replacement-test', revision: 2, running: false, models: [{ id: 'deepseek-flash', status: 'success' }] } }); await settingsAck();
	const completedTests = page.getByRole('dialog', { name: '检测模型连接', exact: true });
	await completedTests.getByRole('button', { name: '重新检测', exact: true }).waitFor();
	assert.ok(await completedTests.locator('header, footer, .test-result').evaluateAll(elements => elements.every(element => { const style = getComputedStyle(element); return style.borderTopWidth === '0px' && style.borderBottomWidth === '0px'; })), 'Connection results have no internal separators');
	assert.notEqual(await completedTests.getByRole('button', { name: '重新检测', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
	const doneButton = completedTests.getByRole('button', { name: '完成', exact: true });
	assert.equal(await completedTests.getByText('密钥与模型配置已保存，请查看各模型的检测结果。', { exact: true }).count(), 0);
	const doneBackground = await doneButton.evaluate(element => getComputedStyle(element).backgroundColor);
	await doneButton.hover();
	await page.waitForTimeout(150);
	assert.equal(await doneButton.evaluate(element => getComputedStyle(element).backgroundColor), doneBackground, 'Done keeps its background on hover');
	await page.setViewportSize({ width: 900, height: 712 });
	await page.screenshot({ path: path.join(output, 'model-tests-no-dividers-dark.png'), animations: 'disabled' });
	await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click();
	assert.equal(await page.locator('#connection-key').textContent(), '••••••••');
	assert.equal(await page.getByText('已保存，修改将在下一轮回复中生效。', { exact: true }).count(), 0);
	await page.getByRole('button', { name: '同步模型', exact: true }).click();
	await settingsPublish({ discovery: { id: 'candidate-1', revision: 1, provider: 'deepseek', models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', capabilities: caps }, { id: 'new-pro', name: 'New Pro', capabilities: { ...caps, vision: false } }] } }); await settingsAck();
	const dialog = page.getByRole('dialog');
	assert.equal(await dialog.getByText(/已选择：/).count(), 0);
	assert.equal(await dialog.getByText('确认后移除该供应商的全部模型。', { exact: true }).count(), 0);
	assert.equal(await dialog.getByRole('checkbox', { name: /DeepSeek Flash/ }).isChecked(), true);
	assert.equal(await dialog.getByRole('checkbox', { name: /New Pro/ }).isChecked(), false);
	assert.equal(await dialog.getByText(/确认后更新能力并清除/).count(), 0);
	assert.equal(await dialog.locator('.discovery-row small').count(), 2, 'Model candidates show only model IDs below names');
	await dialog.getByRole('searchbox').focus();
	assert.equal(await dialog.getByRole('searchbox').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
	for (const width of [900, 360]) {
		await page.setViewportSize({ width, height: 712 });
		const search = await dialog.locator('.discovery-search').boundingBox();
		const selectAllButton = dialog.getByRole('button', { name: '选择所有', exact: true });
		const selectAll = await selectAllButton.boundingBox();
		const border = await selectAllButton.evaluate(element => { const style = getComputedStyle(element); return [style.borderTopStyle, style.borderTopWidth, style.borderTopColor]; });
		assert.equal(border[0], 'solid'); assert.equal(border[1], '1px'); assert.notEqual(border[2], 'rgba(0, 0, 0, 0)');
		await page.mouse.move(0, 0); await page.waitForTimeout(150);
		const idleBackground = await selectAllButton.evaluate(element => getComputedStyle(element).backgroundColor);
		await selectAllButton.hover(); await page.waitForTimeout(150);
		assert.notEqual(await selectAllButton.evaluate(element => getComputedStyle(element).backgroundColor), idleBackground, 'Select all retains its hover feedback');
		await dialog.locator('.discovery-tools').screenshot({ path: path.join(output, 'discovery-select-all-hover-' + width + '.png') });
		await page.mouse.move(0, 0); await page.waitForTimeout(150);
		assert.ok(Math.abs(search.y - selectAll.y) < 1 && Math.abs(search.height - selectAll.height) < 1, 'Search and select all share top/bottom edges and height at ' + width);
		assert.equal(await selectAllButton.evaluate(element => getComputedStyle(element).borderRadius), await dialog.locator('.discovery-search').evaluate(element => getComputedStyle(element).borderRadius), 'Search and select all use matching corners');
		assert.equal(await selectAllButton.evaluate(element => getComputedStyle(element).fontSize), await dialog.getByRole('searchbox').evaluate(element => getComputedStyle(element).fontSize), 'Search and select all use matching text size');
		await page.screenshot({ path: path.join(output, 'model-discovery-search-dark-' + width + '.png'), animations: 'disabled' });
	}
	await dialog.getByRole('searchbox').fill('New');
	await dialog.getByRole('button', { name: '选择所有', exact: true }).click();
	await dialog.getByRole('searchbox').fill('');
	assert.equal(await dialog.getByRole('checkbox', { name: /DeepSeek Flash/ }).isChecked(), true);
	await page.setViewportSize({ width: 900, height: 1000 });
	await page.screenshot({ path: path.join(output, 'deepseek-discovery-dark.png') });
	await settingsPublish({ revision: 2, discovery: undefined });
	await page.locator('.settings-notifications .notification-card').filter({ hasText: '设置已改变，请重新获取模型。' }).waitFor({ timeout: 1500 });
	assert.equal(await page.getByRole('dialog').count(), 0, 'Stale candidates do not masquerade as a pending fetch');
	await page.getByRole('button', { name: '同步模型', exact: true }).click();
	await settingsPublish({ discovery: { id: 'candidate-2', revision: 2, provider: 'deepseek', models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', capabilities: caps }, { id: 'new-pro', name: 'New Pro', capabilities: caps }] } }); await settingsAck();
	await dialog.getByRole('checkbox', { name: /New Pro/ }).check();
	await dialog.getByRole('button', { name: '确认', exact: true }).click();
	assert.deepStrictEqual((await page.evaluate(() => window.messages.at(-1))).ids, ['deepseek-flash', 'new-pro']);
	await settingsPublish({ discovery: undefined }); await settingsAck();
	while (await page.locator('.settings-notifications .notification-close:enabled').count()) { await page.locator('.settings-notifications .notification-close:enabled').first().click({ force: true }); await page.waitForTimeout(200); }
	await page.getByRole('button', { name: '编辑 DeepSeek Flash', exact: true }).click();
	assert.equal(await page.getByLabel('模型 ID', { exact: true }).getAttribute('readonly'), '');
	await page.setViewportSize({ width: 900, height: 712 });
	await page.screenshot({ path: path.join(output, 'deepseek-detail-compact-dark.png') });
	await page.getByLabel('显示名称', { exact: true }).fill('My Flash');
	assert.equal(await page.getByLabel('模型类型', { exact: true }).count(), 0);
	assert.equal(await page.getByText('手动修正能力', { exact: true }).count(), 0);
	assert.equal(await page.getByLabel('上下文窗口（Token）', { exact: true }).inputValue(), '1048576');
	assert.equal(await page.getByLabel('最大输入 Token', { exact: true }).inputValue(), '24576');
	assert.equal(await page.getByLabel('最大输出 Token', { exact: true }).inputValue(), '393216');
	const toolCapability = page.getByRole('button', { name: '工具', exact: true });
	assert.equal(await toolCapability.getAttribute('aria-pressed'), 'true');
	await toolCapability.click(); assert.equal(await toolCapability.getAttribute('aria-pressed'), 'false');
	await toolCapability.press('Enter'); assert.equal(await toolCapability.getAttribute('aria-pressed'), 'true');
	const thinkingSelect = page.getByRole('combobox', { name: '思考模式', exact: true });
	await thinkingSelect.click();
	await page.getByRole('option', { name: '开启', exact: true }).click();
	const effortSelect = page.getByRole('combobox', { name: '推理强度', exact: true });
	await effortSelect.click();
	assert.equal(await page.getByRole('option', { name: '模型默认', exact: true }).getAttribute('aria-selected'), 'true');
	await page.screenshot({ path: path.join(output, 'model-select-dark.png') });
	await effortSelect.press('End'); await effortSelect.press('ArrowUp'); await effortSelect.press('Enter');
	assert.equal(await effortSelect.textContent(), '高');
	await effortSelect.click(); await effortSelect.press('Escape');
	assert.equal(await page.getByRole('listbox', { name: '推理强度', exact: true }).count(), 0);
	assert.equal(await page.getByRole('dialog', { name: '编辑模型', exact: true }).count(), 1, 'Escape closes the menu before the model dialog');
	await effortSelect.click();
	await page.getByRole('heading', { name: '生成参数', exact: true }).click();
	assert.equal(await effortSelect.getAttribute('aria-expanded'), 'false');
	await page.getByRole('button', { name: '推理', exact: true }).click();
	assert.equal(await page.getByRole('combobox', { name: '思考模式', exact: true }).count(), 0);
	await page.locator('.model-inapplicable').scrollIntoViewIfNeeded();
	assert.equal(await page.locator('.model-inapplicable').textContent(), '思考设置不适用');
	await page.screenshot({ path: path.join(output, 'model-editor-inapplicable-dark.png') });
	await page.getByRole('button', { name: '推理', exact: true }).click();
	assert.equal(await page.getByRole('combobox', { name: '思考模式', exact: true }).textContent(), '模型默认', 'Re-enabling reasoning does not restore discarded options');
	await page.getByLabel('最大输入 Token', { exact: true }).fill('12345');
	await page.getByRole('button', { name: '恢复模型默认', exact: true }).click();
	assert.equal(await page.getByLabel('最大输入 Token', { exact: true }).inputValue(), '24576');
	await page.getByLabel('最大输入 Token', { exact: true }).fill('12345');
	await page.getByRole('button', { name: '推理', exact: true }).click();
	const modelFooter = await page.locator('.model-form .settings-form-actions').boundingBox();
	assert.ok(modelFooter.y + modelFooter.height <= 712 && modelFooter.y > 0, 'Expanded capabilities keep model actions visible at laptop height');
	assert.ok(await page.locator('.model-form-body').evaluate(element => element.scrollHeight > element.clientHeight), 'Model form body scrolls independently of its actions');
	await page.screenshot({ path: path.join(output, 'deepseek-detail-dark.png') });
	await page.getByRole('button', { name: '保存模型', exact: true }).click();
	const editedModel = await page.evaluate(() => window.messages.at(-1).model);
	assert.equal(editedModel.settings.overrides.reasoning, false);
	assert.equal(editedModel.settings.overrides.maxInputTokens, 12345);
	assert.equal(editedModel.settings.thinking, undefined); assert.equal(editedModel.settings.effort, undefined);
	await settingsAck(false, '模型保存失败');
	assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), 'My Flash');
	await page.getByRole('dialog').getByRole('alert').filter({ hasText: '模型保存失败' }).waitFor();
	await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
	await page.evaluate(() => { document.body.className = 'vscode-light'; });
	await page.addStyleTag({ content: ':root { --vscode-editor-background:#fafafa; --vscode-foreground:#272a30; --vscode-descriptionForeground:#60656d; --vscode-input-background:#f1f2f4; --vscode-input-foreground:#272a30; --vscode-widget-border:#d5d8df; --vscode-button-background:#305f98; --vscode-focusBorder:#3076be; }' });
	await page.screenshot({ path: path.join(output, 'deepseek-settings-error-light.png') });
	while (await page.locator('.settings-notifications .notification-close:enabled').count()) { await page.locator('.settings-notifications .notification-close:enabled').first().click({ force: true }); await page.waitForTimeout(200); }
	await page.getByRole('button', { name: '编辑 DeepSeek Flash', exact: true }).click();
	for (const width of [900, 360]) {
		await page.setViewportSize({ width, height: 712 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.ok(await page.locator('.model-form-body').evaluate(element => element.scrollWidth <= element.clientWidth));
		await page.screenshot({ path: path.join(output, 'model-editor-light-' + width + '.png') });
		const effort = page.getByRole('combobox', { name: '推理强度', exact: true });
		await effort.click();
		const menu = await page.getByRole('listbox', { name: '推理强度', exact: true }).boundingBox();
		const trigger = await effort.boundingBox();
		assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= 712, 'Dropdown fits the viewport at ' + width);
		assert.ok(Math.abs(menu.width - trigger.width) < 1, 'Dropdown matches its control width');
		await page.screenshot({ path: path.join(output, 'model-select-light-' + width + '.png') });
		await effort.press('Escape');
	}
	await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
	for (const width of [1440, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.screenshot({ path: path.join(output, 'deepseek-settings-light-' + width + '.png'), fullPage: true });
	}
	await page.getByRole('button', { name: '编辑 DeepSeek Flash', exact: true }).click();
	await page.screenshot({ path: path.join(output, 'deepseek-detail-light-360.png') });
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 900, height: 712 });
	const idleKey = await page.locator('#connection-key').boundingBox();
	await settingsPublish({ providerTest: { id: 'visual-test', revision: 2, running: true, models: [{ id: 'deepseek-flash', status: 'running' }] } });
	await page.getByRole('button', { name: '取消测试', exact: true }).waitFor();
	const testingKey = await page.locator('#connection-key').boundingBox();
	assert.equal(testingKey.width, idleKey.width, 'Testing feedback preserves key input width');
	assert.equal(await page.getByRole('button', { name: '取消测试', exact: true }).getAttribute('aria-busy'), 'true');
	await page.getByRole('button', { name: '取消测试', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'cancelProviderTest');
	await page.screenshot({ path: path.join(output, 'deepseek-testing-light.png') });
	await settingsPublish({ providerTest: undefined });
	await page.getByRole('button', { name: '测试', exact: true }).click();
	await settingsPublish({ providerTest: { id: 'toast-test', revision: 2, running: false, models: [{ id: 'deepseek-flash', status: 'success' }, { id: 'pro', status: 'failure', error: '鉴权失败' }, { id: 'cancelled', status: 'cancelled' }] } }); await settingsAck();
	const testToast = page.locator('.settings-notifications .notification-card').filter({ hasText: '连接测试：1 个成功，1 个失败，1 个取消。' });
	await testToast.waitFor();
	assert.ok((await testToast.innerText()).includes('pro: 鉴权失败'));
	assert.equal(await page.getByRole('heading', { name: '连接测试', exact: true }).count(), 0);
	await page.screenshot({ path: path.join(output, 'settings-test-toast-light.png'), animations: 'disabled' });
	await testToast.getByRole('button', { name: '关闭通知', exact: true }).click();
	await testToast.waitFor({ state: 'detached' });
	await page.getByRole('button', { name: '测试', exact: true }).click();
	const hiddenTest = await page.evaluate(() => window.messages.at(-1).requestId);
	await settingsPublish({ providerTest: { id: 'hidden-test', revision: 2, running: true, models: [{ id: 'deepseek-flash', status: 'running' }] } });
	await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
	await settingsPublish({ providerTest: { id: 'hidden-test', revision: 2, running: false, models: [{ id: 'deepseek-flash', status: 'cancelled' }] } });
	await page.evaluate(requestId => window.fixtureSnapshot({ type: 'settingsResult', requestId, ok: true }, '*'), hiddenTest);
	await page.waitForFunction(() => document.querySelectorAll('.settings-notifications .notification-card').length === 0, { timeout: 1500 });
	assert.equal(await page.locator('.settings-notifications .notification-card').count(), 0, 'Hiding settings clears its notices and suppresses late test notifications');
	await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
	// A fresh key opens an isolated input, then chains saved host revisions through discovery and tests.
	await settingsPublish({ revision: 10, keyConfigured: { deepseek: false }, providers: { deepseek: { baseURL: 'https://api.deepseek.com', enabled: false, models: [] } } });
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).waitFor();
	assert.equal(await page.locator('#connection-key').evaluate(element => getComputedStyle(element).justifyContent), 'flex-start');
	assert.notEqual(await page.locator('.api-key-mark').evaluate(element => getComputedStyle(element).maskImage), 'none');
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).click();
	assert.equal(await page.locator('.api-key-heading').textContent(), 'DeepSeek· 添加 API 密钥');
	assert.ok(await page.locator('.api-key-heading img').evaluate(image => image.complete && image.naturalWidth > 0));
	assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '');
	assert.ok(await page.getByLabel('API 密钥', { exact: true }).evaluate(element => element === document.activeElement));
	assert.ok(await page.getByRole('dialog').getByRole('button', { name: '下一步', exact: true }).isDisabled());
	await page.getByLabel('API 密钥', { exact: true }).fill('fixture-new-key');
	await page.mouse.move(0, 0);
	const nextButton = page.getByRole('dialog').getByRole('button', { name: '下一步', exact: true });
	const nextColors = await nextButton.evaluate(element => { const style = getComputedStyle(element); return [style.backgroundColor, style.color, style.borderColor]; });
	await nextButton.hover();
	await page.waitForTimeout(150);
	assert.deepStrictEqual(await nextButton.evaluate(element => { const style = getComputedStyle(element); return [style.backgroundColor, style.color, style.borderColor]; }), nextColors, 'Primary action keeps its colors on hover');
	await page.mouse.move(0, 0);
	for (const width of [900, 360]) {
		await page.setViewportSize({ width, height: 712 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		await page.screenshot({ path: path.join(output, 'api-key-add-light-' + width + '.png') });
	}
	await checkDraftEye('new-key');
	await page.getByRole('button', { name: '下一步', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'saveKey');
	await settingsPublish({ revision: 11, keyConfigured: { deepseek: true } }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'fetchModels');
	assert.equal((await page.evaluate(() => window.messages.at(-1))).revision, 11);
	await settingsAck(false, '无法连接，请检查网络');
	await page.getByRole('dialog').getByRole('button', { name: '重试', exact: true }).click();
	await settingsPublish({ discovery: { id: 'first-key-models', revision: 11, provider: 'deepseek', models: [{ id: 'flash', name: 'Flash', capabilities: caps }, { id: 'pro', name: 'Pro', capabilities: caps }] } }); await settingsAck();
	await page.getByRole('dialog').getByRole('checkbox', { name: /Flash/ }).check();
	await page.setViewportSize({ width: 900, height: 712 });
	await page.screenshot({ path: path.join(output, 'api-key-choose-models-light.png') });
	await page.getByRole('button', { name: '添加所选模型并检测', exact: true }).click();
	assert.deepEqual((await page.evaluate(() => window.messages.at(-1))).ids, ['flash']);
	await settingsPublish({ revision: 12, discovery: undefined, providers: { deepseek: { baseURL: 'https://api.deepseek.com', enabled: true, models: [{ id: 'flash', name: 'Flash', parameters: {}, settings: {}, discovered: caps }] } } }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'testProvider');
	assert.equal((await page.evaluate(() => window.messages.at(-1))).revision, 12);
	await settingsPublish({ providerTest: { id: 'first-key-tests', revision: 12, running: true, models: [{ id: 'flash', status: 'running' }] } });
	await page.screenshot({ path: path.join(output, 'api-key-testing-light.png') });
	await settingsPublish({ providerTest: { id: 'first-key-tests', revision: 12, running: false, models: [{ id: 'flash', status: 'failure', error: '鉴权失败，请更换密钥。' }] } }); await settingsAck();
	await page.getByRole('dialog').getByText('失败', { exact: false }).waitFor();
	await page.screenshot({ path: path.join(output, 'api-key-test-failure-light.png') });
	await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click();
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '删除密钥', exact: true }).click();
	await settingsPublish({ revision: 13, keyConfigured: { deepseek: false }, providerTest: undefined }); await settingsAck();
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).waitFor();
	assert.equal(await page.getByRole('button', { name: '保存连接', exact: true }).count(), 0);
	await page.getByLabel('API 地址', { exact: true }).fill('https://draft.example/v1');
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).click();
	await page.getByLabel('API 密钥', { exact: true }).fill('cancelled-input');
	await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), 'https://draft.example/v1', 'Key cancellation does not cancel the independent address draft');
	assert.equal(await page.locator('#connection-key').evaluate(element => getComputedStyle(element).justifyContent), 'flex-start');
	assert.notEqual(await page.locator('.api-key-mark').evaluate(element => getComputedStyle(element).maskImage), 'none');
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).click();
	assert.equal(await page.locator('.api-key-heading').textContent(), 'DeepSeek· 添加 API 密钥');
	assert.ok(await page.locator('.api-key-heading img').evaluate(image => image.complete && image.naturalWidth > 0));
	assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '', 'Cancelled input is cleared');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: '添加 API 密钥', exact: true }).click();
	await page.getByLabel('API 密钥', { exact: true }).fill('while-address-dirty');
	await page.getByRole('button', { name: '下一步', exact: true }).click();
	await settingsPublish({ revision: 14, keyConfigured: { deepseek: true } }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'fetchModels');
	await settingsPublish({ discovery: { id: 'cancel-on-stale', revision: 14, provider: 'deepseek', models: [{ id: 'flash', capabilities: caps }] } }); await settingsAck();
	await settingsPublish({ revision: 15, discovery: undefined });
	await page.getByRole('button', { name: '保存地址', exact: true }).waitFor();
	assert.ok(await page.getByRole('button', { name: '保存地址', exact: true }).isEnabled(), 'Invalidated setup candidates release the page');
	await page.getByRole('button', { name: '保存地址', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).revision, 15, 'Independent key changes do not stale a draft address when the saved address is unchanged');
	await settingsPublish({ revision: 16, providers: { deepseek: { baseURL: 'https://draft.example/v1', enabled: true, models: [] } } }); await settingsAck();
	await page.getByLabel('API 地址', { exact: true }).fill('https://normalized.example/v1/');
	await page.getByRole('button', { name: '保存地址', exact: true }).click();
	await settingsPublish({ revision: 17, providers: { deepseek: { baseURL: 'https://normalized.example/v1', enabled: true, models: [] } } }); await settingsAck();
	await page.waitForFunction(() => document.querySelector('#connection-address').value === 'https://normalized.example/v1');
	await page.getByLabel('API 地址', { exact: true }).fill('https://second.example/v1');
	await page.getByRole('button', { name: '保存地址', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).revision, 17, 'Saving a normalized address adopts the confirmed revision for the next edit');
	await settingsPublish({ revision: 18, providers: { deepseek: { baseURL: 'https://second.example/v1', enabled: true, models: [] } } }); await settingsAck();
	await settingsPublish({ revision: 19, providers: { deepseek: { baseURL: 'https://second.example/v1', enabled: true, models: [{ id: 'conflict', name: 'Conflict', parameters: {}, settings: { thinking: 'enabled', effort: 'high' }, discovered: { ...caps, reasoning: false } }] } } });
	await page.getByRole('button', { name: '编辑 Conflict', exact: true }).click();
	assert.match(await page.locator('.model-form [role="alert"]').textContent(), /thinking, effort/, 'Opening a refreshed model preserves and exposes its conflicts');
	assert.ok(await page.getByRole('button', { name: '保存模型', exact: true }).isDisabled());
	await page.locator('.model-form [role="alert"]').scrollIntoViewIfNeeded();
	await page.screenshot({ path: path.join(output, 'model-editor-refreshed-conflict.png') });
	await page.getByRole('button', { name: '恢复模型默认', exact: true }).click();
	assert.equal(await page.locator('.model-form [role="alert"]').count(), 0, 'Restoring defaults explicitly clears inapplicable thinking settings');
	await page.getByRole('button', { name: '保存模型', exact: true }).click();
	const resolvedConflict = await page.evaluate(() => window.messages.at(-1));
	assert.equal(resolvedConflict.model.settings.thinking, undefined); assert.equal(resolvedConflict.model.settings.effort, undefined);
	await settingsAck();

	const providerProfiles = {
		deepseek: { baseURL: 'https://api.deepseek.com', enabled: true, models: [] },
		bailian: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', enabled: false, models: [{ id: 'shared-id', name: 'Qwen fixture', parameters: {}, settings: {}, discovered: caps }] },
		moonshot: { baseURL: 'https://api.moonshot.cn/v1', enabled: true, models: [{ id: 'shared-id', name: 'Kimi fixture', parameters: {}, settings: {}, discovered: caps }] },
		ollama: { baseURL: 'http://localhost:11434/v1', enabled: false, models: [] }
	};
	await settingsPublish({ revision: 20, providers: providerProfiles, keyConfigured: { deepseek: true, bailian: true, moonshot: true }, keyPreview: { deepseek: 'ds••••', bailian: 'bl••••', moonshot: 'ms••••' }, providerTest: undefined });
	const chooseProvider = async name => {
		await providerPicker.click();
		await page.getByRole('option', { name, exact: true }).click();
		assert.equal(await providerPicker.textContent(), name);
	};
	await chooseProvider('百炼');
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), providerProfiles.bailian.baseURL);
	assert.equal(await page.getByRole('switch', { name: '启用 百炼', exact: true }).getAttribute('aria-checked'), 'false');
	await page.getByRole('button', { name: '编辑 Qwen fixture', exact: true }).click();
	await page.getByLabel('显示名称', { exact: true }).fill('My Qwen');
	await page.getByRole('button', { name: '保存模型', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'bailian');
	await settingsAck();
	await page.getByLabel('API 地址', { exact: true }).fill('https://draft-only.example/v1');
	assert.ok(await providerPicker.isDisabled(), 'Switching providers cannot silently discard an address draft');
	await page.getByRole('button', { name: '取消', exact: true }).click();
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '显示密钥', exact: true }).click();
	const previousReveal = await page.evaluate(() => window.messages.at(-1));
	assert.equal(previousReveal.provider, 'bailian');
	await chooseProvider('Moonshot');
	assert.equal(await page.locator('#connection-key').textContent(), 'ms••••');
	await page.evaluate(request => window.fixtureSnapshot({ type: 'connectionKey', provider: request.provider, requestId: request.requestId, revision: 20, key: 'stale-bailian-key' }, '*'), previousReveal);
	assert.equal(await page.locator('#connection-key').textContent(), 'ms••••', 'Late key results cannot cross providers');
	await page.locator('.connection-key-field').hover();
	await page.getByRole('button', { name: '编辑密钥', exact: true }).click();
	assert.equal((await page.locator('.api-key-heading > span:not(.provider-mark)').allTextContents()).join(''), 'Moonshot· 更换 API 密钥');
	await page.getByLabel('API 密钥', { exact: true }).fill('moonshot-fixture-key');
	await page.getByRole('button', { name: '保存并检测', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'moonshot');
	await settingsPublish({ revision: 21 }); await settingsAck();
	await page.waitForFunction(() => window.messages.at(-1).type === 'testProvider');
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'moonshot');
	await settingsPublish({ providerTest: { id: 'moonshot-test', provider: 'moonshot', revision: 21, running: false, models: [{ id: 'shared-id', status: 'success' }] } }); await settingsAck();
	await page.getByRole('button', { name: '完成', exact: true }).click();
	await chooseProvider('Ollama');
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), 'http://localhost:11434/v1');
	assert.ok(await page.getByRole('button', { name: '同步模型', exact: true }).isEnabled(), 'Local discovery needs no API key');
	await page.getByRole('button', { name: '同步模型', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'ollama');
	assert.ok(await providerPicker.isDisabled(), 'Discovery retains provider ownership');
	await settingsPublish({ discovery: { id: 'ollama-models', revision: 21, provider: 'ollama', models: [{ id: 'local:latest', provider: 'ollama', name: 'Local fixture' }] } }); await settingsAck();
	await page.getByRole('checkbox', { name: /Local fixture/ }).check();
	await page.getByRole('button', { name: '确认', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'ollama');
	providerProfiles.ollama.models = [{ id: 'local:latest', name: 'Local fixture', parameters: {}, settings: {}, discovered: caps }];
	providerProfiles.ollama.enabled = true;
	await settingsPublish({ revision: 22, providers: providerProfiles, discovery: undefined, providerTest: undefined }); await settingsAck();
	await page.waitForFunction(() => !document.querySelector('.connection-test').disabled);
	assert.ok(await page.getByRole('button', { name: '测试', exact: true }).isEnabled(), 'Local testing needs no API key');
	await page.getByRole('button', { name: '测试', exact: true }).click();
	assert.equal((await page.evaluate(() => window.messages.at(-1))).provider, 'ollama');
	await settingsPublish({ providerTest: { id: 'ollama-test', provider: 'ollama', revision: 22, running: false, models: [{ id: 'local:latest', status: 'success' }] } }); await settingsAck();
	for (const [id, name] of [['bailian', '百炼'], ['moonshot', 'Moonshot'], ['ollama', 'Ollama']]) {
		await chooseProvider(name);
		for (const width of [900, 360]) {
			await page.setViewportSize({ width, height: 900 });
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await page.screenshot({ path: path.join(output, `provider-${id}-light-${width}.png`), fullPage: true });
		}
	}
	await providerPicker.click();
	assert.equal(await page.getByRole('option').count(), 4);
	await page.waitForFunction(() => [...document.querySelectorAll('#settings-providers .provider-mark')].length === 4 && [...document.querySelectorAll('#settings-providers .provider-mark')].every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0));
	await page.screenshot({ path: path.join(output, 'providers-menu-light-360.png') });
	await page.keyboard.press('Escape');
	await page.evaluate(() => { document.body.className = 'vscode-dark'; });
	await page.addStyleTag({ content: ':root { --vscode-editor-background:#282c34; --vscode-foreground:#d4d5d8; --vscode-descriptionForeground:#a1a5ae; --vscode-input-background:#21252b; --vscode-input-foreground:#d4d5d8; --vscode-widget-border:#3a3e46; --vscode-button-background:#365f88; --vscode-focusBorder:#59a4f9; }' });
	for (const [id, name] of [['bailian', '百炼'], ['moonshot', 'Moonshot'], ['ollama', 'Ollama']]) {
		await chooseProvider(name);
		for (const width of [900, 360]) {
			await page.setViewportSize({ width, height: 900 });
			await page.screenshot({ path: path.join(output, `provider-${id}-dark-${width}.png`), fullPage: true });
		}
	}
	await providerPicker.click();
	await page.screenshot({ path: path.join(output, 'providers-menu-dark-360.png') });
	await page.keyboard.press('Escape');
	await chooseProvider('DeepSeek');
	assert.equal(await page.getByLabel('API 地址', { exact: true }).inputValue(), providerProfiles.deepseek.baseURL);
	assert.deepStrictEqual(errors, []);
	console.log('Production UI: Captain Who-style Markdown/code blocks, exact clipboard, GFM/math, activity lifecycle/timer, reduced motion, scroll escape/return/resize, Chinese/English, themes, history and four-provider settings passed. Screenshots: ' + output);
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
