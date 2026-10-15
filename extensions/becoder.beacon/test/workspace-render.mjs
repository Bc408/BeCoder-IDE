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
	await trigger.hover();
	await page.waitForTimeout(210);
	assert.equal(await page.locator('.workspace-picker.expanded').count(), 1);
	assert.deepEqual(await page.locator('#settings').boundingBox(), before, 'Hover expansion keeps the settings anchor stable');
	assert.ok((await page.locator('.workspace-picker-shell').boundingBox()).x >= 8);
	await trigger.click();
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.workspace-picker-row').count(), 1, 'Current root excluded and Windows paths deduplicated');
	await page.screenshot({ path: path.join(output, 'open-dark.png') });
	await page.locator('.workspace-current-remove').click();
	assert.equal(await page.evaluate(() => window.messages.at(-1).type), 'clearWorkspace');
	assert.equal(await page.locator('.workspace-picker.open').count(), 1);
	await page.evaluate(() => window.update({ root: undefined, usable: false, workspaceState: 'none', mode: 'blackout', recent: ['D:\\算法训练\\动态规划', 'C:\\练习'] }));
	await page.waitForTimeout(250);
	assert.equal(await page.locator('.workspace-picker-row').count(), 2);
	assert.equal(await page.locator('.workspace-current-remove').count(), 0);
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.equal(await page.locator('.workspace-picker.open').count(), 0);
	assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
	await page.evaluate(() => window.update({ root: 'D:\\算法训练\\动态规划', workspaceState: 'blackout' }));
	await trigger.hover();
	await page.waitForTimeout(210);
	assert.equal(await page.locator('.workspace-expanded-label').textContent(), 'D:\\算法训练\\动态规划未使用');
	await trigger.click();
	await page.evaluate(() => document.dispatchEvent(new CustomEvent('beacon-menu-open', { detail: 'model' })));
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.equal(await page.locator('.workspace-picker.open').count(), 0, 'Opening another menu closes workspace');
	await page.evaluate(() => window.update({ workspaceState: 'unavailable' }));
	await trigger.hover();
	await page.waitForTimeout(210);
	await page.screenshot({ path: path.join(output, 'unavailable-dark.png') });
	assert.equal(await page.locator('.workspace-error-dot').count(), 1);
	for (const width of [320, 480, 760]) {
		await page.setViewportSize({ width, height: 400 });
		await page.evaluate(() => window.update({ root: 'D:\\很长的课程目录\\数据结构与算法设计\\训练资料\\当前工作区', workspaceState: 'ready', recent: Array.from({ length: 20 }, (_, i) => 'C:\\练习' + i) }));
		await trigger.hover();
		await trigger.click();
		await page.waitForTimeout(200);
		const shell = await page.locator('.workspace-picker-shell').boundingBox();
		assert.ok(shell.x >= 8 && shell.x + shell.width <= width - 8, 'Expanded shell fits viewport');
		await page.locator('.workspace-add').click();
		assert.equal(await page.evaluate(() => window.messages.at(-1).type), 'chooseWorkspace');
	}
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addStyleTag({ content: ':root{--vscode-foreground:#222;--vscode-sideBar-background:#fff;--vscode-menu-background:#fff;--vscode-descriptionForeground:#555;--vscode-widget-border:#ccc;--vscode-list-hoverBackground:#0000000a}body{background:white}' });
	await trigger.focus();
	await page.keyboard.press('Enter');
	await page.mouse.move(5, 200);
	assert.equal(await page.locator('.workspace-picker.open').count(), 1, 'Keyboard focus retains the menu after mouse leaves');
	await page.screenshot({ path: path.join(output, 'open-light-reduced-motion.png') });
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('.workspace-picker').classList.contains('open'));
	assert.deepEqual(errors, []);
	console.log('Workspace interaction and anchor checks passed; screenshots: ' + output);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
