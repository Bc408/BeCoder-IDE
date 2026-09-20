/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

const { JSDOM } = require('jsdom');
async function until(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) { return; }
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	assert.fail('Webview did not reach expected state.');
}

test('checker controls retain upstream path, hidden expected output and expandable logs', async () => {
	const dom = new JSDOM('<div id="app"></div>', { url: 'https://becoder.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
	try {
		const messages: any[] = [];
		dom.window.translations = {};
		dom.window.acquireVsCodeApi = () => ({ postMessage: (message: unknown) => messages.push(message), getState: () => undefined, setState: () => undefined });
		dom.window.eval(fs.readFileSync(path.resolve('extensions/becoder.cph/dist/judge.js'), 'utf8'));
		await until(() => messages.some(message => message.command === 'ready'));
		const state = { revision: 'checker', source: 'a.cpp', name: 'A', busy: false, message: '', customCheckerPath: 'check.py',
			cases: [{ id: 0, testcase: { id: 0, input: '1', output: '2' }, result: { pass: false, verdict: 'wrong-answer', stdout: '3', stderr: '', time: 1,
				checkerRun: { command: 'python check.py input output', stdout: '<script>bad()</script>', stderr: 'log', exitCode: 1, durationMs: 2, signal: null } } }] };
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'state', state } }));
		await until(() => dom.window.document.querySelector('.custom-checker-area input') !== null);
		assert.strictEqual(dom.window.document.querySelector('.custom-checker-area input').value, 'check.py');
		assert.ok(dom.window.document.querySelector('.expected-output-container.hidden'));
		assert.ok(dom.window.document.querySelector('details summary'));
		assert.strictEqual(dom.window.document.querySelector('script'), null);
		dom.window.document.querySelector('[aria-label="runAll"]').click();
		await until(() => messages.some(message => message.command === 'run'));
		assert.strictEqual(messages.find(message => message.command === 'run').customCheckerPath, 'check.py');
	} finally { dom.window.close(); }
});

test('CPH cards display escaped output, save/add/run/stop messages, and retain edits on failure', async () => {
	const dom = new JSDOM('<div id="app"></div>', { url: 'https://becoder.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
	try {
		const messages: any[] = [];
		dom.window.translations = {};
		dom.window.acquireVsCodeApi = () => ({ postMessage: (value: unknown) => messages.push(value), getState: () => undefined, setState: () => undefined });
		dom.window.eval(fs.readFileSync(path.resolve('extensions/becoder.cph/dist/judge.js'), 'utf8'));
		await until(() => messages.some(message => message.command === 'ready'));
		const state = { revision: 'one', source: 'C:\\contest\\a.cpp', name: '<img onerror=bad()>', busy: false, message: '',
			cases: [{ id: 1, testcase: { id: 1, input: '1', output: '2' }, result: { pass: true, verdict: 'passed', stdout: '<script>bad()</script>', stderr: 'debug:1', signal: null, timeOut: false, time: 12 } }] };
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'state', state } }));
		await until(() => dom.window.document.querySelector('.stderror-textarea') !== null);
		assert.strictEqual(dom.window.document.querySelector('img'), null);
		assert.strictEqual(dom.window.document.querySelector('script'), null);
		assert.strictEqual(dom.window.document.querySelector('.stderror-textarea').value, 'debug:1');
		assert.strictEqual(dom.window.document.querySelector('.received-textarea').value, '<script>bad()</script>');
		const click = (text: string) => {
			const button = [...dom.window.document.querySelectorAll('button')].find((value: any) => value.getAttribute('aria-label') === text || value.textContent === text);
			assert.ok(button, text);
			button.click();
		};
		click('add');
		await until(() => dom.window.document.querySelectorAll('.case').length === 2);
		await until(() => messages.some(message => message.command === 'save'));
		const saved = messages.find(message => message.command === 'save');
		assert.strictEqual(saved.tests.length, 2);
		assert.strictEqual(saved.srcPath, undefined);
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'failure', message: 'Changed externally', revision: 'one' } }));
		await until(() => dom.window.document.body.textContent?.includes('Changed externally') === true);
		assert.strictEqual(dom.window.document.querySelectorAll('.case').length, 2);
		click('runAll');
		await until(() => messages.some(message => message.command === 'run'));
		await until(() => [...dom.window.document.querySelectorAll('button')].some((value: any) => value.getAttribute('aria-label') === 'stop' && !value.disabled));
		click('stop');
		assert.ok(messages.some(message => message.command === 'stop'));
	} finally { dom.window.close(); }
});

test('web problems link to their source, JSON imports append cases, and single runs mark only one card', async () => {
	const dom = new JSDOM('<div id="app"></div>', { url: 'https://becoder.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
	try {
		const messages: any[] = [];
		dom.window.translations = {};
		dom.window.acquireVsCodeApi = () => ({ postMessage: (value: unknown) => messages.push(value), getState: () => undefined, setState: () => undefined });
		dom.window.eval(fs.readFileSync(path.resolve('extensions/becoder.cph/dist/judge.js'), 'utf8'));
		await until(() => messages.some(message => message.command === 'ready'));
		const state = { revision: 'web', source: 'C:\\contest\\a.cpp', url: 'https://codeforces.com/problemset/problem/1/A', name: 'A', busy: false, message: '',
			cases: [0, 1].map(id => ({ id, testcase: { id, input: String(id), output: String(id) }, result: null })) };
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'state', state } }));
		await until(() => dom.window.document.querySelectorAll('.case').length === 2);
		assert.strictEqual(dom.window.document.querySelector('.problem-name')?.getAttribute('href'), state.url);
		dom.window.document.querySelector('[title="runAgain"]').click();
		await until(() => messages.some(message => message.command === 'run' && message.id === 0));
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'progress', phase: 'compile' } }));
		await until(() => dom.window.document.querySelector('.compiling') !== null);
		assert.strictEqual(dom.window.document.querySelectorAll('.case.running').length, 0, 'compilation must not mark a testcase as running');
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'state', state: { ...state, message: 'Compilation failed' } } }));
		await until(() => dom.window.document.querySelector('.compiling') === null);
		assert.strictEqual(dom.window.document.querySelectorAll('.case.running').length, 0);
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'running', id: 1, compileOnly: false } }));
		await until(() => dom.window.document.querySelectorAll('.case.running').length === 1);
		assert.strictEqual(dom.window.document.querySelectorAll('.case')[1].classList.contains('running'), true);
		const result = { pass: true, verdict: 'passed', stdout: '1', stderr: '', time: 1, signal: null };
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'result', id: 1, result } }));
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'progress', phase: 'checking', id: 0 } }));
		await until(() => dom.window.document.querySelectorAll('.case.passed').length === 1);
		assert.strictEqual(dom.window.document.querySelectorAll('.case')[1].classList.contains('passed'), true);
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'state', state: { ...state, cases: state.cases.map(item => ({ ...item, result })) } } }));
		await until(() => dom.window.document.querySelectorAll('.case.passed').length === 2);
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command: 'requestRun' } }));
		await until(() => messages.some(message => message.command === 'run'));
		const input = dom.window.document.querySelector('.case-import-input');
		Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 64, text: async () => JSON.stringify([{ input: 'x', output: 'y' }]) }] });
		input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
		await until(() => dom.window.document.querySelectorAll('.case').length === 3);
		assert.ok(messages.some(message => message.command === 'dirty'));
	} finally { dom.window.close(); }
});
