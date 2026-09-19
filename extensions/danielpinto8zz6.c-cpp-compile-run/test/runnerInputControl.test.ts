/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../LICENSE.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as net from 'net';
import { once } from 'events';
import { test } from 'node:test';
import { RunnerInputControl } from '../src/runnerInputControl';

test('acknowledges a real startup before accepting the program exit code', async () => {
	let pid = 0;
	const control = new RunnerInputControl(value => pid = value, () => assert.fail('unexpected failure'));
	await control.listen();
	const socket = net.createConnection(control.pipe);
	try {
		await once(socket, 'connect');
		const acknowledged = once(socket, 'data');
		socket.write('{"type":"started","pid":42}\n');
		assert.strictEqual(String((await acknowledged)[0]), 'G');
		assert.strictEqual(pid, 42);
		socket.end('{"type":"exit","code":125}\n');
		assert.strictEqual(await control.result(), 125);
	} finally { socket.destroy(); await control.dispose(); }
});

test('helper errors and invalid protocol never become ordinary program exit codes', async () => {
	for (const message of ['{"type":"error","stage":"create","code":2}\n', '{"type":"exit","code":0}\n', 'null\n']) {
		let failures = 0;
		const control = new RunnerInputControl(() => assert.fail('unexpected startup'), () => failures++);
		await control.listen();
		const socket = net.createConnection(control.pipe);
		try {
			await once(socket, 'connect');
			socket.end(message);
			await assert.rejects(control.result());
			assert.strictEqual(failures, 1);
		} finally { socket.destroy(); await control.dispose(); }
	}
});
