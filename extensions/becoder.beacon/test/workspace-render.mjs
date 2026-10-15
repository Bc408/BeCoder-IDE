/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../tmp/beacon-workspace-render');
fs.mkdirSync(output, { recursive: true });
await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import './webview/beacon.css'; import {Workspace} from './webview/Workspace'; let context={slot:'test',root:'D:\\\\算法训练\\\\动态规划',usable:true,workspaceState:'ready',mode:'spot',recent:['D:\\\\算法训练\\\\动态规划','d:\\\\算法训练\\\\动态规划','C:\\\\练习','c:\\\\练习'],busy:false,epoch:0}; const root=createRoot(document.getElementById('root')); const render=()=>root.render(<header style={{display:'flex',justifyContent:'flex-end',padding:10}}><Workspace context={context} busy={false} post={m=>window.messages.push(m)}/><button id="settings">⚙</button></header>); window.messages=[];window.update=patch=>{context={...context,...patch};render()};render();` }, outfile: path.join(output, 'fixture.js'), bundle: true, jsx: 'automatic' });
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>:root{--vscode-foreground:#ddd;--vscode-sideBar-background:#21252b;--vscode-menu-background:#21252b;--vscode-descriptionForeground:#aaa;--vscode-list-hoverBackground:#ffffff12;--vscode-focusBorder:#88baff;--vscode-widget-border:#444;--vscode-font-family:Segoe UI,sans-serif}body{margin:0;background:#21252b}#root{height:100vh}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); return;
	}
	const file = path.join(output, request.url === '/fixture.css' ? 'fixture.css' : 'fixture.js');
	response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
	response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 360, height: 700 } });
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	const trigger = page.locator('.workspace-picker-trigger');
	await trigger.waitFor();
	const before = await page.locator('#settings').boundingBox();
	const collapsed = await page.locator('.workspace-picker-shell').boundingBox();
	await trigger.hover();
	await page.waitForTimeout(210);
	assert.equal(await page.locator('.workspace-picker.expanded').count(), 0, 'A selected Spot workspace only expands on click');
	assert.deepEqual(await page.locator('.workspace-picker-shell').boundingBox(), collapsed, 'Hover keeps a selected workspace compact');
	assert.equal(await trigger.locator(':scope > svg').count(), 0, 'Normal workspace labels have no decorative chevron');
	assert.equal(await trigger.getAttribute('data-becoder-tooltip'), 'D:\\算法训练\\动态规划', 'Workspace tooltip stays on the absolute path');
	assert.deepEqual(await page.locator('#settings').boundingBox(), before, 'Hover expansion keeps the settings anchor stable');
	assert.ok((await page.locator('.workspace-picker-shell').boundingBox()).x >= 8);
	await trigger.click();
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.workspace-picker-row').count(), 1, 'Current root excluded and Windows paths deduplicated');
	const currentRow = await page.locator('.workspace-current').boundingBox();
	const historyRow = await page.locator('.workspace-picker-row').boundingBox();
	assert.equal(historyRow.height, currentRow.height, 'History uses the current row height');
	const currentPath = await page.locator('.workspace-current .workspace-path').boundingBox();
	const historyPath = await page.locator('.workspace-picker-row .workspace-path').boundingBox();
	assert.equal(historyPath.x, currentPath.x, 'Current and history paths share the left edge');
	assert.equal((await page.locator('.workspace-picker-row .workspace-remove').boundingBox()).x, (await page.locator('.workspace-current-remove').boundingBox()).x, 'Remove buttons share the right edge');
	await trigger.hover();
	await page.waitForTimeout(120);
	assert.equal(await trigger.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'The expanded current row has no hover fill');
	const separator = await page.locator('.workspace-current').evaluate(element => { const style = getComputedStyle(element, '::after'); return { left: style.left, right: style.right }; });
	assert.deepEqual(separator, { left: '6px', right: '6px' }, 'The current-row separator stays inside the row hover surface');
	await page.screenshot({ path: path.join(output, 'open-dark.png') });
	await page.locator('.workspace-current-remove').click();
	assert.equal(await page.evaluate(() => window.messages.at(-1).type), 'clearWorkspace');
	assert.equal(await page.locator('.workspace-picker.open').count(), 1);
	assert.equal(await trigger.getAttribute('aria-label'), 'D:\\算法训练\\动态规划', 'Clearing waits for the host to confirm');
	const originalRow = await page.locator('.workspace-picker-row').boundingBox();
	const originalShell = await page.locator('.workspace-picker-shell').boundingBox();
	await page.evaluate(() => window.update({ root: undefined, usable: false, workspaceState: 'none', mode: 'blackout', recent: ['D:\\算法训练\\动态规划', 'C:\\练习'] }));
	await page.waitForFunction(() => !!document.querySelector('.workspace-flight'));
	const motion = await page.evaluate(() => {
		const animations = document.getAnimations().filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some(frame => frame.height || frame.transform));
		for (const animation of animations) { animation.pause(); animation.currentTime = 0; }
		return animations.length;
	});
	assert.ok(motion >= 3, 'Confirmed clear animates the current entry, existing rows and shell height together');
	for (const time of [0, 60, 120, 210]) {
		await page.evaluate(time => { for (const animation of document.getAnimations()) { if (animation.playState === 'paused') { animation.currentTime = time; } } }, time);
		await page.screenshot({ path: path.join(output, `clear-frame-${time}.png`) });
		if (time === 60) {
			const growing = await page.locator('.workspace-picker-shell').boundingBox();
			assert.ok(growing.height > originalShell.height && growing.height < originalShell.height + 30, 'The panel grows continuously while the selected entry slides down');
			assert.ok((await page.locator('.workspace-picker-row').last().boundingBox()).y > originalRow.y, 'The arriving row pushes existing history down');
		}
	}
	await page.evaluate(() => { for (const animation of document.getAnimations()) { if (animation.playState === 'paused') { animation.finish(); } } });
	await page.waitForTimeout(250);
	assert.equal(await page.locator('.workspace-picker-row').count(), 2);
	assert.equal(await page.locator('.workspace-current-remove').count(), 0);
	await page.evaluate(() => window.update({ root: 'D:\\算法训练\\动态规划', usable: true, workspaceState: 'ready', mode: 'flood' }));
	await page.locator('.workspace-current-remove').click();
	await page.evaluate(() => window.update({ root: undefined, usable: false, workspaceState: 'none', mode: 'blackout' }));
	await page.waitForFunction(() => !!document.querySelector('.workspace-flight'));
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('.workspace-flight'));
	assert.equal(await page.locator('.workspace-picker-row').first().evaluate(element => getComputedStyle(element).visibility), 'visible', 'Interrupting the animation restores the real history row');
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.equal(await page.locator('.workspace-picker.open').count(), 0);
	assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
	await page.evaluate(() => window.update({ root: 'D:\\算法训练\\动态规划', workspaceState: 'blackout' }));
	await page.mouse.click(5, 200);
	await page.mouse.move(5, 200);
	await page.waitForTimeout(200);
	const statusIcon = await page.locator('.workspace-status-icon').boundingBox();
	await trigger.hover();
	await page.waitForTimeout(210);
	assert.equal(await page.locator('.workspace-status-label').textContent(), '动态规划 未使用');
	assert.equal(await trigger.getAttribute('data-becoder-tooltip'), 'D:\\算法训练\\动态规划', 'Status hover keeps the absolute-path tooltip');
	assert.deepEqual(await page.locator('.workspace-status-icon').boundingBox(), statusIcon, 'Blackout icon stays in place while the description expands to the left');
	const hoverGeometry = await page.evaluate(() => {
		const label = document.querySelector('.workspace-status-label');
		const text = document.createRange(); text.selectNodeContents(label);
		const textRect = text.getBoundingClientRect();
		const icon = document.querySelector('.workspace-status-icon').getBoundingClientRect();
		return { gap: icon.left - textRect.right, width: document.querySelector('.workspace-picker-shell').getBoundingClientRect().width };
	});
	assert.ok(hoverGeometry.gap >= 4 && hoverGeometry.gap <= 10, 'Status expansion hugs its text and icon');
	await page.screenshot({ path: path.join(output, 'blackout-hover.png') });
	await page.mouse.move(5, 200);
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('expanded'));
	await page.evaluate(() => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 0; } });
	for (const time of [0, 40, 80, 160, 210]) {
		await page.evaluate(time => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.currentTime = time; } }, time);
		assert.deepEqual(await page.locator('.workspace-status-icon').boundingBox(), statusIcon, 'Blackout icon is stationary throughout collapse');
		await page.screenshot({ path: path.join(output, `blackout-collapse-${time}.png`) });
	}
	await page.evaluate(() => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.finish(); } });
	assert.equal((await page.locator('.workspace-picker-shell').boundingBox()).width, 28, 'Pointer exit actually returns to the compact icon');
	await trigger.hover();
	await trigger.click();
	assert.equal(await page.locator('.workspace-status-icon').count(), 0, 'Click-open Blackout uses the ordinary path-only header');
	await page.evaluate(() => document.dispatchEvent(new CustomEvent('beacon-menu-open', { detail: 'model' })));
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.equal(await page.locator('.workspace-picker.open').count(), 0, 'Opening another menu closes workspace');
	await page.evaluate(() => window.update({ workspaceState: 'unavailable' }));
	await page.mouse.click(5, 200);
	await page.mouse.move(5, 200);
	await page.waitForTimeout(200);
	const errorIcon = await page.locator('.workspace-status-icon').boundingBox();
	await trigger.hover();
	await page.waitForTimeout(210);
	assert.deepEqual(await page.locator('.workspace-status-icon').boundingBox(), errorIcon, 'The error icon keeps the same anchor and size on hover');
	assert.equal(await page.locator('.workspace-status-label').textContent(), '动态规划 出现问题');
	await page.screenshot({ path: path.join(output, 'unavailable-dark.png') });
	assert.equal(await page.locator('.workspace-error-dot').count(), 1);
	await page.mouse.move(5, 200);
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('expanded'));
	await page.evaluate(() => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 0; } });
	for (const time of [0, 40, 80, 160]) {
		await page.evaluate(time => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.currentTime = time; } }, time);
		assert.deepEqual(await page.locator('.workspace-status-icon').boundingBox(), errorIcon, 'Unavailable icon is stationary throughout collapse');
	}
	await page.evaluate(() => { for (const animation of document.querySelector('.workspace-picker').getAnimations({ subtree: true })) { animation.finish(); } });
	await trigger.hover();
	await trigger.click();
	assert.equal(await page.locator('.workspace-status-icon').count(), 0, 'Click-open unavailable workspace also hides its status icon');
	await page.waitForTimeout(210);
	await page.screenshot({ path: path.join(output, 'unavailable-open.png') });
	await page.keyboard.press('Escape');
	for (const width of [320, 480, 760]) {
		await page.setViewportSize({ width, height: 400 });
		await page.evaluate(() => window.update({ root: 'D:\\很长的课程目录\\数据结构与算法设计\\训练资料\\当前工作区', workspaceState: 'ready', recent: Array.from({ length: 20 }, (_, i) => 'C:\\练习' + i) }));
		await trigger.hover();
		await trigger.click();
		await page.waitForTimeout(200);
		const shell = await page.locator('.workspace-picker-shell').boundingBox();
		assert.ok(shell.x >= 8 && shell.x + shell.width <= width - 8, 'Expanded shell fits viewport');
		assert.equal((await page.locator('.workspace-picker-row .workspace-remove').first().boundingBox()).x, (await page.locator('.workspace-current-remove').boundingBox()).x, 'Scrollable history keeps the remove buttons aligned');
		await page.locator('.workspace-add').click();
		assert.equal(await page.evaluate(() => window.messages.at(-1).type), 'chooseWorkspace');
	}
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.evaluate(() => window.update({ mode: 'flood' }));
	await trigger.hover();
	assert.equal(await page.locator('.workspace-picker.expanded').count(), 0, 'Flood uses the same click-only expansion as Spot');
	await page.addStyleTag({ content: ':root{--vscode-foreground:#222;--vscode-sideBar-background:#fff;--vscode-menu-background:#fff;--vscode-descriptionForeground:#555;--vscode-widget-border:#ccc;--vscode-list-hoverBackground:#0000000a}body{background:white}' });
	await trigger.focus();
	await page.keyboard.press('Enter');
	await page.mouse.move(5, 200);
	assert.equal(await page.locator('.workspace-picker.open').count(), 1, 'Keyboard focus retains the menu after mouse leaves');
	await page.locator('.workspace-current-remove').click();
	await page.evaluate(() => window.update({ root: undefined, usable: false, workspaceState: 'none', mode: 'blackout' }));
	await page.waitForTimeout(40);
	assert.equal(await page.locator('.workspace-flight').count(), 0, 'Reduced motion updates the list without a flight copy');
	assert.ok(await page.locator('.workspace-picker-row').first().isVisible());
	await page.screenshot({ path: path.join(output, 'open-light-reduced-motion.png') });
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.deepEqual(errors, []);
	console.log('Workspace interaction and anchor checks passed; screenshots: ' + output);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
