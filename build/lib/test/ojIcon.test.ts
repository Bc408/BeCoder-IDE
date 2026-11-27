/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { test } from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const extensionRoot = path.join(repositoryRoot, 'extensions/becoder.oj-connect');
const require = createRequire(path.join(extensionRoot, 'package.json'));
const { build } = require('esbuild') as { build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }> };
const { JSDOM } = require('jsdom') as { JSDOM: new (content: string, options: { contentType: string }) => { window: { document: Document; close(): void } } };

test('the native OJ Connect icon uses the same paper plane geometry as the submission button', async () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
	const activitybar = manifest.contributes.viewsContainers.activitybar.find((container: { id: string }) => container.id === 'becoder-oj-connect');
	assert.ok(activitybar, 'The native account container must own its shipped icon');
	const resource = fs.readFileSync(path.join(extensionRoot, activitybar.icon), 'utf8');
	const bundled = await build({
		absWorkingDir: extensionRoot,
		stdin: {
			contents: 'import { createElement } from \'react\'; import { renderToStaticMarkup } from \'react-dom/server\'; import { SubmitIcon } from \'./webview/luogu/presentation\'; export const markup = renderToStaticMarkup(createElement(SubmitIcon));',
			resolveDir: extensionRoot,
			loader: 'ts'
		},
		bundle: true,
		write: false,
		platform: 'node',
		format: 'esm',
		banner: { js: 'import { createRequire as createNodeRequire } from \'node:module\'; const require = createNodeRequire(' + JSON.stringify(path.join(extensionRoot, 'package.json')) + ');' },
		logLevel: 'silent'
	});
	const { markup } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')) as { markup: string };
	const native = new JSDOM(resource, { contentType: 'image/svg+xml' });
	const submit = new JSDOM(markup, { contentType: 'image/svg+xml' });
	try {
		const geometry = (document: Document) => ({
			viewBox: document.documentElement.getAttribute('viewBox'),
			paths: [...document.querySelectorAll('path')].map(element => element.getAttribute('d'))
		});
		assert.deepStrictEqual(geometry(native.window.document), geometry(submit.window.document));
		assert.strictEqual(native.window.document.querySelectorAll('rect, image, foreignObject').length, 0, 'The resource must keep a transparent background for native icon masks');
	} finally {
		native.window.close();
		submit.window.close();
	}
});
