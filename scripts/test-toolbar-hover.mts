/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Use source styles and the contribution's actual stylesheet expression. No
// daily profile, product launch, website requests or provider configuration.
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'tmp/becoder-toolbar-hover');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(root, 'src/vs/workbench/contrib/browserView/electron-browser/features/browserProblemFeature.ts'), 'utf8');
const expression = /style\.textContent = ([\s\S]*?);\s*\}, this\._store\)/.exec(source)?.[1];
assert.ok(expression, 'Locate the problem toolbar contribution stylesheet');
const commandSource = fs.readFileSync(path.join(root, 'src/vs/platform/browserView/common/browserView.ts'), 'utf8');
const commandPrefix = /const commandPrefix = '([^']+)'/.exec(commandSource)?.[1];
const commandSuffix = /GetProblem\s*=\s*`\$\{commandPrefix\}([^`]+)`/.exec(commandSource)?.[1];
const commandId = commandPrefix && commandSuffix ? commandPrefix + commandSuffix : undefined;
assert.ok(commandId, 'Locate the production Get Problem command ID');
const iconStyle = new Function('ojIconUri', 'cphIconUri', 'asCSSUrl', 'BrowserViewCommandId', `return ${expression};`)(
	path.join(root, 'extensions/becoder.oj-connect/resources/oj-connect.svg'), path.join(root, 'extensions/becoder.cph/resources/judge.svg'),
	(uri: string) => `url("data:image/svg+xml;base64,${fs.readFileSync(uri).toString('base64')}")`, { GetProblem: commandId }
);
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.setContent(`<html><body><div class="monaco-workbench"><div class="browser-root"><div class="browser-actions-toolbar"><div class="monaco-action-bar"><div class="action-item"><div class="monaco-dropdown-with-default monaco-dropdown-with-primary"><div class="action-container menu-entry" data-command-id="${commandId}"><a class="action-label icon" role="button" tabindex="0" aria-label="Get Problem"></a></div><div class="dropdown-action-container"><div class="monaco-dropdown"><div class="dropdown-label"><a class="action-label codicon codicon-chevron-down" role="button" tabindex="0" aria-label="Problem Actions"></a></div></div></div></div></div></div></div></div></div></body></html>`);
	for (const file of ['src/vs/base/browser/ui/actionbar/actionbar.css', 'src/vs/base/browser/ui/dropdown/dropdown.css', 'src/vs/workbench/browser/media/style.css', 'src/vs/workbench/contrib/browserView/electron-browser/media/browser.css']) {
		await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
	}
	await page.addStyleTag({ content: iconStyle });
	await page.addStyleTag({ content: '.monaco-workbench{padding:20px}.browser-root{height:100px}.browser-actions-toolbar .action-label{width:24px;height:24px;display:block}.monaco-dropdown-with-primary{display:flex}' });
	const icon = page.getByRole('button', { name: 'Get Problem', exact: true });
	const arrow = page.getByRole('button', { name: 'Problem Actions', exact: true });
	const split = page.locator('.monaco-dropdown-with-primary');
	for (const [theme, fill, hover] of [['dark', 'rgb(204, 204, 204)', 'rgb(56, 56, 56)'], ['light', 'rgb(66, 66, 66)', 'rgb(232, 232, 232)']]) {
		await page.evaluate(({ theme, hover }) => {
			document.querySelector('.browser-root').dataset.browserTheme = theme;
			document.documentElement.style.setProperty('--vscode-toolbar-hoverBackground', hover);
			document.documentElement.style.setProperty('--vscode-toolbar-activeBackground', hover);
		}, { theme, hover });
		await page.mouse.move(0, 0);
		assert.equal(await icon.evaluate(node => getComputedStyle(node).backgroundColor), fill);
		await icon.hover();
		assert.equal(await icon.evaluate(node => getComputedStyle(node).backgroundColor), fill, `${theme}: hovering preserves the icon mask fill`);
		assert.equal(await split.evaluate(node => getComputedStyle(node).backgroundColor), hover, 'The native button still has its hover background');
		await split.screenshot({ path: path.join(output, `${theme}-hover.png`) });
		await page.mouse.down();
		await page.locator('.action-item').evaluate(node => node.classList.add('active'));
		assert.equal(await icon.evaluate(node => getComputedStyle(node).backgroundColor), fill, 'Pressed styling also preserves the icon mask fill');
		await page.mouse.up();
		await page.locator('.action-item').evaluate(node => node.classList.remove('active'));
		await arrow.hover();
		assert.equal(await icon.evaluate(node => getComputedStyle(node).backgroundColor), fill);
		assert.equal(await arrow.evaluate(node => getComputedStyle(node).backgroundColor), hover, 'The dropdown keeps native hover feedback');
	}
	console.log('Get Problem light/dark hover and pressed colors remain stable; split-button and dropdown feedback are retained.');
} finally { await browser.close(); }
