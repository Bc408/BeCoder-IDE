/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import { chromium } from 'playwright';

// Use an isolated BeCoder extension-development window with Beacon visible.
// Inject rendering snapshots only; no provider request, credential or history write.
const port = Number(process.argv[2]);
assert.ok(port > 0 && port < 65536, 'Pass the isolated window CDP port');
const target = (await CDP.List({ port })).find(target => target.type === 'iframe' && target.url.includes('extensionId=becoder.beacon'));
assert.ok(target, 'Open Beacon in the isolated extension-development window');
const client = await CDP({ port, target: target.id });
const contexts = [];
client.Runtime.executionContextCreated(({ context }) => contexts.push(context));
let contextId;
const evaluate = async expression => {
	const result = await client.Runtime.evaluate({ contextId, expression, awaitPromise: true, returnByValue: true });
	assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
	return result.result.value;
};
const publish = async (text, status = 'streaming', id = 100) => evaluate(`window.postMessage(${JSON.stringify({ type: 'snapshot', configured: true, busy: status === 'streaming', messages: [{ id, role: 'assistant', text, reasoning: '', activities: [], status, createdAt: Date.now() }] })}, '*')`);
const waitFor = expression => evaluate(`(async () => { const deadline = performance.now() + 8000; while (performance.now() < deadline) { if (${expression}) return true; await new Promise(requestAnimationFrame); } return false; })()`);
const output = path.resolve(import.meta.dirname, '../../../tmp/beacon-webview');
let browser;
try {
	await client.Runtime.enable();
	for (const context of contexts.filter(context => !context.name)) {
		const result = await client.Runtime.evaluate({ contextId: context.id, expression: '!!document.querySelector("#root")', returnByValue: true });
		if (result.result.value) { contextId = context.id; break; }
	}
	assert.ok(contextId, 'Beacon content context is available');
	fs.mkdirSync(output, { recursive: true });
	browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
	assert.ok(await waitFor('!!document.querySelector(".composer")'), 'Beacon mounts before rendering snapshots');
	await publish('```cpp\nint value = 42;\n');
	assert.ok(await waitFor('[...document.querySelectorAll(".code-line > span")].some(e => e.textContent === "42" && getComputedStyle(e).color === "rgb(198, 120, 221)")'), 'Unclosed C++ fence is colored in the actual Webview');
	await browser.contexts()[0].pages()[0].screenshot({ path: path.join(output, 'webview-live-highlight.png') });
	const source = '```cpp\nint value = 42;\n' + '/* comment\nstill comment */\nint next = 7;\n'.repeat(40);
	// Run transport and paint observation together in the Webview. A single CDP
	// round trip per frame can finish the entire input during cold grammar setup.
	const liveUpdates = await evaluate(`(async () => {
		const source = ${JSON.stringify(source)}, createdAt = Date.now();
		let end = 60, sending = true, previousLength = 0;
		const updates = [];
		const timer = setInterval(() => {
			const text = source.slice(0, end);
			window.postMessage({ type: 'snapshot', configured: true, busy: true, messages: [{ id: 100, role: 'assistant', text, reasoning: '', activities: [], status: 'streaming', createdAt }] }, '*');
			if (end >= source.length) { sending = false; clearInterval(timer); }
			end += 90;
		}, 32);
		try {
			const deadline = performance.now() + 8000;
			while (performance.now() < deadline) {
				await new Promise(requestAnimationFrame);
				const length = document.querySelector('.code-block pre code')?.textContent.length ?? 0;
				const colored = [...document.querySelectorAll('.code-line > span')].some(element => element.textContent === '42' && getComputedStyle(element).color === 'rgb(198, 120, 221)');
				if (sending && colored && length > previousLength) { updates.push(length); }
				previousLength = length;
				if (!sending && length === source.length - 7) { return updates; }
			}
			throw new Error('Continuous code did not reach the latest snapshot');
		} finally { clearInterval(timer); }
	})()`);
	assert.ok(liveUpdates.length > 5, 'Colored text advances across multiple paint frames while input is still streaming');
	assert.ok(liveUpdates.at(-1) > liveUpdates[0] + 90, 'Highlighting consumes new input before fence closure');
	const prefix = '```cpp\nint value = 42;\n';
	await publish(prefix);
	assert.ok(await waitFor(`document.querySelector('.code-block pre code')?.textContent === ${JSON.stringify(prefix.slice(7))} && [...document.querySelectorAll('.code-line > span')].some(e => e.textContent === '42')`), 'The initial colored prefix settles before character streaming');
	const characterSource = prefix + 'void work() {\n    const int accumulator = 123456789;\n    /* comment\n       still comment */\n    return;\n}\n';
	const stability = await evaluate(`(async () => {
		const source = ${JSON.stringify(characterSource)}, createdAt = Date.now();
		let end = ${prefix.length}, sending = true, previousHeight = 0;
		const result = { frames: 0, plainFrames: 0, heightRegressions: 0 };
		const timer = setInterval(() => {
			end = Math.min(source.length, end + 2);
			window.postMessage({ type: 'snapshot', configured: true, busy: true, messages: [{ id: 100, role: 'assistant', text: source.slice(0, end), reasoning: '', activities: [], status: 'streaming', createdAt }] }, '*');
			if (end === source.length) { sending = false; clearInterval(timer); }
		}, 16);
		try {
			const deadline = performance.now() + 8000;
			while (performance.now() < deadline) {
				await new Promise(requestAnimationFrame);
				result.frames++;
				if (![...document.querySelectorAll('.code-line > span')].some(e => e.textContent === '42' && getComputedStyle(e).color === 'rgb(198, 120, 221)')) { result.plainFrames++; }
				const height = document.querySelector('.code-block').getBoundingClientRect().height;
				if (height < previousHeight - 0.5) { result.heightRegressions++; }
				previousHeight = height;
				if (!sending && document.querySelector('.code-block pre code')?.textContent === source.slice(7)) { return result; }
			}
			throw new Error('Character stream did not settle');
		} finally { clearInterval(timer); }
	})()`);
	assert.ok(stability.frames > 10, 'The anti-flicker check samples multiple character-stream frames');
	assert.equal(stability.plainFrames, 0, 'A colored prefix never flashes back to plain text while its last line grows');
	assert.equal(stability.heightRegressions, 0, 'Appending characters never shrinks the code card');
	console.log('Character-stream stability:', stability);
	const fenceStability = await evaluate(`(async () => {
		const source = ${JSON.stringify(characterSource + '```\n\nDone.')};
		const result = { frames: 0, markerFrames: 0, heightRegressions: 0 };
		let previousHeight = document.querySelector('.code-block').getBoundingClientRect().height;
		window.postMessage({ type: 'snapshot', configured: true, busy: true, messages: [{ id: 100, role: 'assistant', text: source, reasoning: '', activities: [], status: 'streaming', createdAt: Date.now() }] }, '*');
		const deadline = performance.now() + 8000;
		while (performance.now() < deadline) {
			await new Promise(requestAnimationFrame);
			result.frames++;
			const card = document.querySelector('.code-block');
			if (card.querySelector('code').textContent.includes('\u0060')) { result.markerFrames++; }
			const height = card.getBoundingClientRect().height;
			if (height < previousHeight - 0.5) { result.heightRegressions++; }
			previousHeight = height;
			if (document.querySelector('.markdown').textContent.endsWith('Done.')) { return result; }
		}
		throw new Error('Closing fence did not settle');
	})()`);
	assert.ok(fenceStability.frames > 2, 'Fence closure is sampled across paint frames');
	assert.equal(fenceStability.markerFrames, 0, 'Closing fence markers never appear as code');
	assert.equal(fenceStability.heightRegressions, 0, 'Closing the fence never adds and removes a temporary row');
	console.log('Fence stability:', fenceStability);
	await publish(source, 'stopped');
	assert.ok(await waitFor(`document.querySelector('.code-block pre code')?.textContent === ${JSON.stringify(source.slice(7))}`), 'Pause preserves exact code');
	const continued = source + 'int final = 9;\n```\n\n```c\nint second = 42;\n```';
	await publish(continued);
	assert.ok(await waitFor('document.querySelectorAll(".becoder-syntax").length === 2 && [...document.querySelectorAll(".code-line > span")].filter(e => e.textContent === "42" && getComputedStyle(e).color === "rgb(198, 120, 221)").length >= 2'), 'Continuation and multiple C/C++ blocks stay colored');
	await publish(continued, 'complete');
	await browser.contexts()[0].pages()[0].screenshot({ path: path.join(output, 'webview-multiple-highlight.png') });
	await publish('```cpp\nint replacement = 7;\n```', 'complete', 101);
	assert.ok(await waitFor('document.querySelectorAll(".becoder-syntax").length === 1 && document.querySelector(".code-block pre code")?.textContent === "int replacement = 7;\\n" && document.querySelectorAll(".code-line > span").length > 1'), 'Replacement retires old blocks and initializes the new worker');
	for (const [language, prefix, rest] of [
		['python', 'value = 42\n', 'def greet(name: str):\n    """first\n    second"""\n    return f"hello {name}"\n'],
		['shell', 'value=42\n', 'cat <<EOF\nhello\nEOF\necho "$value"\n'],
		['javascript', 'const value = 42;\n', '/* first\nsecond */\nconsole.log(`hello ${value}`);\n']
	]) {
		const fence = `\`\`\`${language}\n`;
		await publish(fence + prefix);
		assert.ok(await waitFor(`document.querySelector('.code-block code')?.textContent === ${JSON.stringify(prefix)} && !!document.querySelector('.code-line > span')`), `${language} uses the native worker in Webview`);
		const result = await evaluate(`(async () => {
			const source = ${JSON.stringify(fence + prefix + rest)};
			let end = ${fence.length + prefix.length}, sending = true, previousHeight = 0;
			const result = { frames: 0, plainFrames: 0, heightRegressions: 0 };
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
					if (!sending && card.querySelector('code').textContent === ${JSON.stringify(prefix + rest)}) { return result; }
				}
				throw new Error('Webview character stream did not settle');
			} finally { clearInterval(timer); }
		})()`);
		assert.ok(result.frames > 10, language);
		assert.equal(result.plainFrames, 0, language);
		assert.equal(result.heightRegressions, 0, language);
		console.log('Real Webview:', language, result);
		await browser.contexts()[0].pages()[0].screenshot({ path: path.join(output, `webview-${language}-live.png`) });
	}
	console.log('Real BeCoder Webview: unfinished/live C++ coloring without prefix flicker or shrinking, exact paused text, continuation, multiple blocks and worker recreation passed.');
} finally {
	await browser?.close();
	await client.close();
}
