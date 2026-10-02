/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { bundledLanguagesInfo } from 'shiki';

// Production browser bundle, local resources and rendering snapshots only.
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../tmp/beacon-languages');
fs.mkdirSync(output, { recursive: true });
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/beacon.css"><style>:root{--vscode-font-family:Segoe UI,sans-serif;--vscode-editor-font-family:Consolas,monospace;--vscode-editor-font-size:14px;--vscode-editor-line-height:19px;--vscode-sideBar-background:#21252b;--vscode-foreground:#ccc;--vscode-descriptionForeground:#999}</style></head><body class="vscode-dark"><div id="root"></div><script>window.acquireVsCodeApi=()=>({postMessage(){}})</script><script src="/beacon.js"></script></body></html>');
		return;
	}
	const file = path.resolve(root, 'dist', '.' + request.url);
	if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
	response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
	response.end(file.endsWith('syntax-worker.js') ? `globalThis.fetch=()=>{throw new Error('worker-resource-fetch-forbidden')};\n${fs.readFileSync(file, 'utf8')}` : fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	const publish = (text, status = 'complete') => page.evaluate(({ text, status }) => window.postMessage({ type: 'snapshot', configured: true, busy: status === 'streaming', messages: [{ id: 100, role: 'assistant', text, reasoning: '', activities: [], status, createdAt: Date.now() }] }, '*'), { text, status });
	const languages = new Set(bundledLanguagesInfo.map(language => language.id));
	for (const name of fs.readdirSync(path.join(root, '..'))) {
		const manifest = path.join(root, '..', name, 'package.json');
		if (!fs.existsSync(manifest)) { continue; }
		const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
		for (const grammar of pkg.contributes?.grammars ?? []) { if (grammar.language) { languages.add(grammar.language); } }
	}
	const source = 'value = 42;\n"hello"\n';
	await publish([...languages].map(language => `\`\`\`${language}\n${source}\`\`\``).join('\n\n'));
	await page.waitForFunction(count => {
		const cards = [...document.querySelectorAll('.code-block')];
		return cards.length === count && cards.every(card => card.querySelector('.code-line > span'));
	}, languages.size, { timeout: 20000 });
	assert.equal(await page.locator('.becoder-syntax').count(), languages.size);
	assert.deepStrictEqual(await page.locator('.code-block pre code').allTextContents(), [...languages].map(() => source));
	console.log(`All ${languages.size} fence languages render through the incremental worker.`);

	const cases = [
		['python', 'value = 42\n', 'def greet(name: str):\n    """first\n    second"""\n    return f"hello {name}"\n'],
		['shell', 'value=42\n', 'cat <<EOF\nhello\nEOF\necho "$value"\n'],
		['javascript', 'const value = 42;\n', '/* first\nsecond */\nconsole.log(`hello ${value}`);\n'],
		['tsx', 'const value = 42;\n', 'const view = <div title="hello">{value}</div>;\n'],
		['json', '{"value": 42,\n', '"text": "hello",\n"list": [1, 2, 3]}\n'],
		['yaml', 'value: 42\n', 'text: |\n  first\n  second\nlist: [1, 2, 3]\n'],
		['cpp', 'int value = 42;\n', '/* first\nsecond */\nconst char* text = "hello";\n']
	];
	for (const [language, prefix, rest] of cases) {
		const fence = `\`\`\`${language}\n`;
		await publish(fence + prefix, 'streaming');
		await page.waitForFunction(prefix => document.querySelector('.code-block code')?.textContent === prefix && !!document.querySelector('.code-line > span'), prefix);
		const stability = await page.evaluate(async ({ fence, prefix, rest }) => {
			const source = fence + prefix + rest;
			let end = fence.length + prefix.length, sending = true, previousHeight = 0, previousLength = 0;
			const result = { frames: 0, plainFrames: 0, heightRegressions: 0, liveUpdates: 0, worstStallMs: 0 };
			let lastAdvance = performance.now();
			const timer = setInterval(() => {
				end = Math.min(source.length, end + 2);
				window.postMessage({ type: 'snapshot', configured: true, busy: true, messages: [{ id: 100, role: 'assistant', text: source.slice(0, end), reasoning: '', activities: [], status: 'streaming', createdAt: Date.now() }] }, '*');
				if (end === source.length) { sending = false; clearInterval(timer); }
			}, 16);
			try {
				const deadline = performance.now() + 8000;
				while (performance.now() < deadline) {
					await new Promise(requestAnimationFrame);
					const card = document.querySelector('.code-block');
					result.frames++;
					if (!card.querySelector('.code-line > span')) { result.plainFrames++; }
					const height = card.getBoundingClientRect().height;
					if (height < previousHeight - 0.5) { result.heightRegressions++; }
					previousHeight = height;
					const length = card.querySelector('code').textContent.length;
					if (length > previousLength) {
						if (sending) { result.liveUpdates++; }
						result.worstStallMs = Math.max(result.worstStallMs, performance.now() - lastAdvance);
						lastAdvance = performance.now(); previousLength = length;
					}
					if (!sending && card.querySelector('code').textContent === prefix + rest) { return result; }
				}
				throw new Error('Character stream did not settle');
			} finally { clearInterval(timer); }
		}, { fence, prefix, rest });
		assert.equal(stability.plainFrames, 0, language);
		assert.equal(stability.heightRegressions, 0, language);
		assert.ok(stability.liveUpdates > 5, language);
		assert.ok(stability.worstStallMs < 250, language);
		await page.locator('.code-block').screenshot({ path: path.join(output, `${language}-live.png`) });
		await publish(fence + prefix + rest, 'stopped');
		assert.equal(await page.locator('.code-block code').textContent(), prefix + rest);
		await publish(fence + prefix + rest + '// continued\n');
		await page.waitForFunction(expected => document.querySelector('.code-block code')?.textContent === expected, prefix + rest + '// continued\n');
		console.log(language, stability);
	}
	await publish('```unknown-language\n<plain>& preserved\n```');
	await page.waitForFunction(() => document.querySelector('.code-block code')?.textContent === '<plain>& preserved\n');
	assert.equal(await page.locator('.code-line').count(), 0);
	assert.deepStrictEqual(errors, []);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
