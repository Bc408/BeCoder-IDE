/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Observe production math output on every paint, including unfinished TeX commands.
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../tmp/beacon-math');
const diagnose = process.argv.includes('--diagnose');
fs.mkdirSync(output, { recursive: true });
const server = createServer((request, response) => {
	if (request.url === '/') {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/beacon.css"><style>:root{--vscode-font-family:Segoe UI,sans-serif;--vscode-foreground:#ccc;--vscode-sideBar-background:#21252b;--vscode-descriptionForeground:#999}</style></head><body class="vscode-dark"><div id="root"></div><script>window.acquireVsCodeApi=()=>({postMessage(){}})</script><script src="/beacon.js"></script></body></html>');
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
	const page = await browser.newPage({ viewport: { width: 700, height: 800 }, deviceScaleFactor: 2 });
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForSelector('.composer');
	const sources = [
		'行内推导：$f(x)=\\frac{f^{(n)}(x_0)}{n!}(x-x_0)^n$。',
		'$$\nf(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(x_0)}{k!}(x-x_0)^k+R_n(x)\n$$',
		'\\[\\left(\\frac{x+1}{y-1}\\right)^2+\\sqrt{x^2+y^2}\\]',
		'\\[\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}\\]',
		'```math\n\\int_0^1\\frac{x^2}{1+x^2}\\,dx\n```\n'
	];
	const expressions = [
		'f(x)=\\frac{f^{(n)}(x_0)}{n!}(x-x_0)^n',
		'f(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(x_0)}{k!}(x-x_0)^k+R_n(x)',
		'\\left(\\frac{x+1}{y-1}\\right)^2+\\sqrt{x^2+y^2}',
		'\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}',
		'\\int_0^1\\frac{x^2}{1+x^2}\\,dx'
	];
	for (let index = 0; index < sources.length; index++) {
		const source = sources[index];
		const metrics = await page.evaluate(async ({ source, expression, id }) => {
			const publish = (text, status = 'streaming') => window.postMessage({ type: 'snapshot', configured: true, busy: status === 'streaming', messages: [{ id, role: 'assistant', text, reasoning: '', activities: [], status, createdAt: Date.now() }] }, '*');
			publish('');
			await new Promise(requestAnimationFrame);
			let end = 0, sending = true, previousFormula = '', previousHtml = '';
			const metrics = { frames: 0, redFrames: 0, liveUpdates: 0, heldFrames: 0, unstableHeldFrames: 0 };
			const timer = setInterval(() => {
				end = Math.min(source.length, end + 1); publish(source.slice(0, end));
				if (end === source.length) { sending = false; clearInterval(timer); }
			}, 16);
			try {
				const deadline = performance.now() + 8000;
				while (performance.now() < deadline) {
					await new Promise(requestAnimationFrame);
					metrics.frames++;
					if (document.querySelector('.katex-error')) { metrics.redFrames++; }
					const formula = document.querySelector('.math-formula');
					const annotation = document.querySelector('.katex annotation')?.textContent ?? '';
					const html = formula?.innerHTML ?? '';
					if (formula?.dataset.mathPending && annotation) {
						metrics.heldFrames++;
						if (previousHtml && html !== previousHtml) { metrics.unstableHeldFrames++; }
					}
					if (sending && annotation && annotation !== previousFormula) { metrics.liveUpdates++; }
					previousFormula = annotation; previousHtml = html;
					if (!sending && annotation.trim() === expression && !formula?.dataset.mathPending) {
						publish(source, 'complete');
						await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
						if (document.querySelector('.katex-error')) { metrics.redFrames++; }
						return metrics;
					}
				}
				throw new Error('Formula stream did not settle');
			} finally { clearInterval(timer); }
		}, { source, expression: expressions[index], id: index + 500 });
		console.log(index, metrics);
		if (!diagnose) {
			assert.equal(metrics.redFrames, 0, source);
			if (index < 2) { assert.ok(metrics.liveUpdates > 2, 'Valid prefixes render before the formula finishes'); }
			assert.equal(metrics.unstableHeldFrames, 0, 'A partial command preserves the last valid formula markup');
		}
		await page.screenshot({ path: path.join(output, `${diagnose ? 'before' : 'after'}-${index}.png`) });
	}
	if (!diagnose) {
		await page.evaluate(() => window.postMessage({ type: 'snapshot', configured: true, busy: false, messages: [{ id: 700, role: 'assistant', text: '$\\unsupportedcommand{a}$', reasoning: '', activities: [], status: 'complete', createdAt: Date.now() }] }, '*'));
		await page.waitForFunction(() => document.querySelector('.math-pending')?.textContent.includes('unsupportedcommand'));
		assert.equal(await page.locator('.katex-error').count(), 0);
		assert.equal(await page.locator('.katex').count(), 0, 'A different formula must not reuse another formula\'s markup');
		assert.deepStrictEqual(errors, []);
	}
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
