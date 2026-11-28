/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import nativeFs from 'node:fs/promises';
import * as path from 'path';
import { FileTools, safeFileError } from '../src/fileTools';
import { ChatSession, fileModelOutput, type Generate } from '../src/session';
import { createGenerator } from '../src/provider';
import { providers } from '../src/connection';

const signal = new AbortController().signal;
async function fixture(run: (directory: string) => Promise<void>) {
	const parent = path.resolve('../../tmp');
	await fs.mkdir(parent, { recursive: true });
	const directory = await fs.mkdtemp(path.join(parent, 'beacon-files-'));
	try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

suite('Beacon read-only permissions', () => {
	test('continuation_uses_true_units_and_pdf_page', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'unicode.txt'), '中😀xyz');
		const tools = new FileTools('workspace', [{ name: 'root', path: directory }]);
		const first = await tools.execute({ operation: 'read', path: 'unicode.txt', limit: 2 }, signal);
		assert.equal(first.contents, '中😀'); assert.equal(first.nextOffset, 2);
		assert.match(JSON.stringify(fileModelOutput(first)), /use offset=2/);
		const last = await tools.execute({ operation: 'read', path: 'unicode.txt', offset: 2 }, signal);
		assert.equal(last.contents, 'xyz'); assert.doesNotMatch(JSON.stringify(fileModelOutput(last)), /use offset=/);
	}));
	test('file_failure_keeps_ui_and_model_contracts_separate', async () => fixture(async directory => {
		const raw = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'read', path: 'missing.cpp' }, signal);
		assert.equal(raw.code, 'material-missing'); assert.equal(typeof raw.error, 'string');
		const projected = fileModelOutput(raw);
		assert.equal(projected.type, 'json');
		assert.deepStrictEqual(Reflect.get(Reflect.get(projected, 'value') as object, 'error'), { code: 'file-not-found', message: raw.error });
		assert.equal(Reflect.get(raw, 'failureCode'), 'file-not-found');
		assert.equal(Reflect.get(Reflect.get(projected, 'value') as object, 'failureCode'), undefined);
		assert.equal(Reflect.get(Reflect.get(projected, 'value') as object, 'code'), undefined);
		assert.equal(Reflect.get(Reflect.get(projected, 'value') as object, 'path'), 'missing.cpp');
	}));
	test('image_projection_preserves_media', () => {
		const result = fileModelOutput({ ok: true, path: 'pixel.png', kind: 'image', mediaType: 'image/png', contents: 'aW1hZ2U=' });
		assert.equal(result.type, 'content');
		const parts = Reflect.get(result, 'value');
		assert.equal(parts[0].type, 'text');
		assert.doesNotMatch(Reflect.get(parts[0], 'text'), /aW1hZ2U=/);
		assert.deepStrictEqual(parts[1], { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aW1hZ2U=' } });
	});
	test('Notebook owner validation includes the final file-handle close', async t => fixture(async directory => {
		const file = path.join(directory, 'notes.bcnb'); await fs.writeFile(file, 'saved');
		let version = 1;
		const open = nativeFs.open;
		t.mock.method(nativeFs, 'open', async (...args: Parameters<typeof fs.open>) => {
			const handle = await open(...args), close = handle.close.bind(handle);
			t.mock.method(handle, 'close', async () => { await close(); version++; });
			return handle;
		});
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }], undefined, { readRepresentation: async () => {
			const observed = version;
			return { contents: 'dirty content', representation: 'notebook-content', verify: () => { if (version !== observed) { throw new Error('file-changed'); } } };
		} });
		const result = await reader.execute({ operation: 'read', path: file }, signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'conflict'); assert.equal(result.contents, undefined);
	}));
	test('search marks unreadable ordinary files incomplete without failing on sensitive exclusions', async t => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'blocked.txt'), 'needle');
		await fs.writeFile(path.join(directory, 'readable.txt'), 'needle');
		await fs.writeFile(path.join(directory, '.env'), 'excluded');
		const open = nativeFs.open;
		t.mock.method(nativeFs, 'open', async (...args: Parameters<typeof fs.open>) => {
			if (String(args[0]).endsWith('blocked.txt')) { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }
			return open(...args);
		});
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'search', path: '.', query: 'needle' }, signal);
		assert.equal(result.ok, true); assert.equal(result.truncated, true);
		assert.match(result.contents!, /readable\.txt:1: needle/); assert.doesNotMatch(result.contents!, /blocked|\.env/);
	}));
	test('sensitive exclusions alone do not mark an otherwise complete search incomplete', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, '.env'), 'needle');
		await fs.writeFile(path.join(directory, 'notes.txt'), 'ordinary content');
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'search', path: '.', query: 'needle' }, signal);
		assert.equal(result.ok, true); assert.equal(result.truncated, false); assert.equal(result.contents, '');
	}));
	test('Notebook owner validation runs after the final disk verification', async t => fixture(async directory => {
		const file = path.join(directory, 'notes.bcnb'); await fs.writeFile(file, 'saved');
		let captured = false, version = 1;
		const stat = nativeFs.stat;
		t.mock.method(nativeFs, 'stat', async (...args: Parameters<typeof fs.stat>) => { const value = await stat(...args); if (captured) { version++; } return value; });
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }], undefined, { readRepresentation: async () => {
			const observed = version; captured = true;
			return { contents: 'dirty content', representation: 'notebook-content', verify: () => { if (version !== observed) { throw new Error('file-changed'); } } };
		} });
		const result = await reader.execute({ operation: 'read', path: file }, signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'conflict'); assert.equal(result.contents, undefined);
	}));

	test('search marks a long text window incomplete when its matching suffix was not read', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'long.txt'), 'a'.repeat(131072) + '\nneedle\n');
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'search', path: '.', query: 'needle' }, signal);
		assert.equal(result.ok, true); assert.equal(result.contents, ''); assert.equal(result.truncated, true);
	}));
	test('cancellation during the final file stat cannot publish a successful read', async t => fixture(async directory => {
		const file = path.join(directory, 'cancel.txt'); await fs.writeFile(file, 'saved');
		const controller = new AbortController(), reason = new Error('cancel during final stat');
		const stat = nativeFs.stat; let finalStat = false;
		t.mock.method(nativeFs, 'stat', async (...args: Parameters<typeof fs.stat>) => {
			const result = await stat(...args); if (finalStat) { controller.abort(reason); } return result;
		});
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }], () => { finalStat = true; return 'dirty'; });
		await assert.rejects(reader.execute({ operation: 'read', path: file }, controller.signal), error => error === reason);
	}));
	test('cancellation while opening an empty directory cannot publish a successful scan', async t => fixture(async directory => {
		const controller = new AbortController(), reason = new Error('cancel during empty opendir');
		const opendir = nativeFs.opendir;
		t.mock.method(nativeFs, 'opendir', async (...args: Parameters<typeof fs.opendir>) => {
			const result = await opendir(...args); controller.abort(reason); return result;
		});
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		await assert.rejects(reader.execute({ operation: 'list', path: '.' }, controller.signal), error => error === reason);
	}));
	test('disk, dirty editor and Notebook text resume at the same Unicode code point offsets', async () => fixture(async directory => {
		const text = 'A你😀𐐷e\u0301\n尾';
		const disk = path.join(directory, 'unicode.txt'); const notebook = path.join(directory, 'unicode.bcnb');
		await fs.writeFile(disk, text); await fs.writeFile(notebook, 'native Notebook data');
		const roots = [{ name: 'root', path: directory }];
		const readers = [new FileTools('workspace', roots), new FileTools('workspace', roots, () => text), new FileTools('workspace', roots, undefined, { readRepresentation: async () => ({ contents: text, representation: 'notebook-content' }) })];
		for (const [index, reader] of readers.entries()) {
			for (const [offset, contents, nextOffset] of [[0, 'A你', 2], [2, '😀𐐷', 4], [4, 'e\u0301', 6], [6, '\n尾', undefined]] as const) {
				const result = await reader.execute({ operation: 'read', path: index === 2 ? notebook : disk, offset, limit: 2 }, signal);
				assert.equal(result.kind, 'text'); assert.equal(result.contents, contents); assert.equal(result.nextOffset, nextOffset);
				assert.equal(Reflect.get(result, 'offsetUnit'), 'character');
			}
			assert.equal((await reader.execute({ operation: 'read', path: index === 2 ? notebook : disk, offset: 3, limit: 1 }, signal)).contents, '𐐷');
		}
	}));
	test('disk UTF-8 decoding crosses a chunk boundary without an eager whole-file read', async t => fixture(async directory => {
		const file = path.join(directory, 'stream.txt');
		await fs.writeFile(file, 'a'.repeat(65535) + '😀你尾' + 'b'.repeat(2 * 1024 * 1024));
		const open = nativeFs.open;
		let readBytes = 0, maxRead = 0;
		t.mock.method(nativeFs, 'readFile', async () => { throw new Error('whole-file reads are forbidden'); });
		t.mock.method(nativeFs, 'open', async (...args: Parameters<typeof fs.open>) => {
			const handle = await open(...args), read = handle.read.bind(handle);
			t.mock.method(handle, 'readFile', async () => { throw new Error('whole-file reads are forbidden'); });
			t.mock.method(handle, 'read', async (buffer: Buffer, offset: number, length: number, position: number) => {
				maxRead = Math.max(maxRead, length); const result = await read(buffer, offset, length, position); readBytes += result.bytesRead; return result;
			});
			return handle;
		});
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'read', path: file, offset: 65535, limit: 2 }, signal);
		assert.equal(result.contents, '😀你'); assert.equal(result.nextOffset, 65537); assert.equal(Reflect.get(result, 'offsetUnit'), 'character');
		assert.ok(maxRead <= 128 * 1024); assert.ok(readBytes <= 256 * 1024, `read ${readBytes} bytes for a short excerpt`);
	}));
	test('default text size and byte caps return a real character continuation', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'ascii.txt'), 'a'.repeat(40000));
		await fs.writeFile(path.join(directory, 'emoji.txt'), '😀'.repeat(40000));
		const roots = [{ name: 'root', path: directory }];
		for (const reader of [new FileTools('workspace', roots), new FileTools('workspace', roots, file => file.endsWith('emoji.txt') ? '😀'.repeat(40000) : 'a'.repeat(40000))]) {
			const first = await reader.execute({ operation: 'read', path: 'ascii.txt' }, signal);
			assert.equal(first.contents?.length, 32768); assert.equal(first.nextOffset, 32768);
			const emoji = await reader.execute({ operation: 'read', path: 'emoji.txt', limit: 131072 }, signal);
			assert.equal(emoji.contents, '😀'.repeat(32768)); assert.equal(emoji.nextOffset, 32768); assert.equal(Buffer.byteLength(emoji.contents!), 128 * 1024);
			assert.equal((await reader.execute({ operation: 'read', path: 'emoji.txt', offset: 32768 }, signal)).contents, '😀'.repeat(7232));
		}
	}));
	test('operations reject unrelated parameters and scan limits above 200', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'note.txt'), 'needle');
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (const input of [
			{ operation: 'read', path: 'note.txt', query: 'needle' }, { operation: 'list', path: '.', query: 'needle' },
			{ operation: 'list', path: '.', offset: 0 }, { operation: 'find', path: '.', query: 'note', offset: 0 },
			{ operation: 'search', path: '.', query: 'needle', offset: 0 }, { operation: 'find', path: '.' },
			{ operation: 'list', path: '.', limit: 201 }, { operation: 'search', path: '.', query: 'needle', limit: 201 }
		] as const) {
			const result = await reader.execute(input, signal); assert.equal(result.ok, false, JSON.stringify(input)); assert.equal(result.code, 'invalid-input');
		}
		assert.equal((await reader.execute({ operation: 'find', path: '.', query: 'note', limit: 200 }, signal)).ok, true);
	}));
	test('missing targets, access denial and wrong types have safe distinct actionable errors', async () => fixture(async directory => {
		const file = path.join(directory, 'note.txt'); await fs.writeFile(file, 'notes');
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		const missing = await reader.execute({ operation: 'read', path: 'missing.txt' }, signal);
		const wrongType = await reader.execute({ operation: 'list', path: file }, signal);
		assert.equal(missing.code, 'material-missing'); assert.match(missing.error!, /not exist|not found/i);
		assert.equal(wrongType.code, 'invalid-input'); assert.match(wrongType.error!, /directory|type/i);
		for (const code of ['EACCES', 'EPERM']) {
			const error = Object.assign(new Error('secret raw operating system detail'), { code });
			assert.match(safeFileError(error), /denied|permission/i); assert.doesNotMatch(safeFileError(error), /secret/);
		}
		assert.notEqual(safeFileError(Object.assign(new Error('same'), { code: 'ENOENT' })), safeFileError(Object.assign(new Error('same'), { code: 'EACCES' })));
	}));
	test('binary offsets remain bytes and images reject text ranges', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'bytes.bin'), Buffer.from([0, 255, 3, 42]));
		await fs.writeFile(path.join(directory, 'pixel.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		const binary = await reader.execute({ operation: 'read', path: 'bytes.bin', offset: 1, limit: 2 }, signal);
		assert.equal(binary.kind, 'binary'); assert.equal(binary.contents, 'ff03'); assert.equal(binary.nextOffset, 3); assert.equal(Reflect.get(binary, 'offsetUnit'), 'byte');
		assert.equal((await reader.execute({ operation: 'read', path: 'pixel.png', offset: 0, limit: 1 }, signal)).ok, false);
	}));
	test('a remaining answer byte budget shortens text without splitting its next character', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'large.txt'), 'x'.repeat(131072)); await fs.writeFile(path.join(directory, 'small.txt'), 'abc');
		await fs.writeFile(path.join(directory, 'emoji.txt'), '😀'.repeat(40000));
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (let index = 0; index < 63; index++) { assert.equal((await reader.execute({ operation: 'read', path: 'large.txt', limit: 131072 }, signal)).ok, true); }
		assert.equal((await reader.execute({ operation: 'read', path: 'small.txt' }, signal)).contents, 'abc');
		const result = await reader.execute({ operation: 'read', path: 'emoji.txt', limit: 131072 }, signal);
		assert.equal(result.contents, '😀'.repeat(32767)); assert.equal(result.nextOffset, 32767);
		const blocked = await reader.execute({ operation: 'read', path: 'emoji.txt', offset: 32767 }, signal);
		assert.equal(blocked.ok, false); assert.equal(blocked.code, 'budget');
	}));
	test('search result lines respect the response byte cap without returning partial matches', async () => fixture(async directory => {
		const name = 'long-'.repeat(30) + '.txt'; await fs.writeFile(path.join(directory, name), ('needle' + 'x'.repeat(494) + '\n').repeat(200));
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'search', path: '.', query: 'needle', limit: 200 }, signal);
		assert.equal(result.ok, true); assert.ok(Buffer.byteLength(result.contents!) <= 131072); assert.equal(result.truncated, true);
		assert.ok(result.contents!.split('\n').every(line => line.endsWith('x'.repeat(494))));
	}));
	test('search excerpts never end inside an emoji surrogate pair', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'emoji.txt'), 'x' + '😀'.repeat(300) + 'needle');
		const result = await new FileTools('workspace', [{ name: 'root', path: directory }]).execute({ operation: 'search', path: '.', query: 'needle' }, signal);
		assert.equal(result.ok, true); assert.equal(result.contents!.isWellFormed(), true);
	}));
	test('a file disappearing during an owner read returns changed instead of publishing its text', async () => fixture(async directory => {
		const file = path.join(directory, 'changing.txt'); await fs.writeFile(file, 'before');
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }], async () => { await fs.unlink(file); return 'unverified text'; });
		const result = await reader.execute({ operation: 'read', path: file }, signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'conflict'); assert.equal(result.contents, undefined);
	}));
	test('search cannot hide an exhausted read budget as an empty successful match list', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'large.txt'), 'x'.repeat(131072)); await fs.writeFile(path.join(directory, 'filler.txt'), 'x'.repeat(131070));
		await fs.writeFile(path.join(directory, 'other.txt'), 'text');
		const reader = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (let index = 0; index < 63; index++) { await reader.execute({ operation: 'read', path: 'large.txt', limit: 131072 }, signal); }
		await reader.execute({ operation: 'read', path: 'filler.txt', limit: 131072 }, signal);
		const result = await reader.execute({ operation: 'search', path: '.', query: 'absent' }, signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'budget');
	}));
	test('notebook reads and search use owner content before paging, with no raw fallback', async () => fixture(async directory => {
		const file = path.join(directory, 'note.bcnb');
		await fs.writeFile(file, JSON.stringify({ cells: [{ source: 'normal WA discussion', outputs: ['secret-run'], metadata: { becoder: { attempt: 'secret-attempt' } } }] }));
		const original = await fs.readFile(file, 'utf8');
		const tools = new FileTools('workspace', [{ name: 'root', path: directory }], async () => original, { readRepresentation: async () => ({ contents: 'normal WA discussion', representation: 'notebook-content' }) });
		const result = await tools.execute({ operation: 'read', path: file, limit: 128 }, signal);
		assert.equal(result.contents, 'normal WA discussion'); assert.equal(result.representation, 'notebook-content');
		assert.equal((await tools.execute({ operation: 'search', path: directory, query: 'secret-run' }, signal)).contents, '');
		assert.equal((await new FileTools('workspace', [{ name: 'root', path: directory }], async () => original).execute({ operation: 'read', path: file }, signal)).ok, false);
		assert.equal(await fs.readFile(file, 'utf8'), original);
	}));
	test('unknown error names cannot resolve inherited properties instead of a safe message', () => {
		for (const code of ['toString', 'constructor', 'private-token']) {
			const message = safeFileError(new Error(code));
			assert.equal(typeof message, 'string'); assert.equal(message.includes('private-token'), false);
		}
	});
	test('file denial carries an owned reason without exposing a raw exception', async () => {
		const result = await new FileTools('none', []).execute({ operation: 'read', path: 'C:\\private\\main.cpp' }, signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'protected');
	});
	test('flood excludes other conversation assets, including aliases and legacy profile storage', async () => fixture(async directory => {
		const assets = path.join(directory, '.beaconWork');
		const legacy = path.join(directory, 'profile');
		await fs.mkdir(assets); await fs.mkdir(legacy);
		await fs.writeFile(path.join(assets, 'other.json'), 'other-chat');
		await fs.writeFile(path.join(legacy, 'history.json'), 'old-chats');
		await fs.symlink(assets, path.join(directory, 'alias'), 'junction');
		const files = new FileTools('computer', [], undefined, { protectedRoots: [legacy] });
		for (const file of [path.join(assets, 'other.json'), path.join(directory, 'alias', 'other.json'), path.join(legacy, 'history.json')]) {
			assert.equal((await files.execute({ operation: 'read', path: file }, signal)).ok, false);
		}
		const listing = await files.execute({ operation: 'search', path: directory, query: 'chat' }, signal);
		assert.equal(listing.ok, true); assert.equal(listing.contents, '');
	}));
	test('a user supplied file grants one capture without its neighbor or directory', async () => fixture(async directory => {
		const file = path.join(directory, 'chosen.txt');
		await fs.writeFile(file, 'chosen'); await fs.writeFile(path.join(directory, 'neighbor.txt'), 'neighbor');
		const files = new FileTools('computer', [], undefined, { suppliedFiles: [file] });
		assert.equal((await files.execute({ operation: 'read', path: file }, signal)).contents, 'chosen');
		assert.equal((await files.execute({ operation: 'read', path: path.join(directory, 'neighbor.txt') }, signal)).ok, false);
		assert.equal((await files.execute({ operation: 'list', path: directory }, signal)).ok, false);
	}));
	test('a later redirected application cache root is protected by its original path', async () => fixture(async directory => {
		const privateRoot = path.join(directory, 'application-cache'), foreign = path.join(directory, 'foreign');
		const files = new FileTools('computer', [], undefined, { protectedRoots: [privateRoot] });
		await fs.mkdir(foreign); await fs.writeFile(path.join(foreign, 'problem-statements.json'), 'all-private-problems');
		await fs.symlink(foreign, privateRoot, 'junction');
		assert.equal((await files.execute({ operation: 'read', path: path.join(privateRoot, 'problem-statements.json') }, signal)).ok, false);
	}));
	test('none rejects every operation; workspace real targets stay inside roots; computer still rejects private files', async () => fixture(async directory => {
		const root = path.join(directory, 'workspace');
		const outside = path.join(directory, 'outside');
		await fs.mkdir(root); await fs.mkdir(outside);
		await fs.writeFile(path.join(root, 'main.cpp'), 'int main() {}');
		await fs.writeFile(path.join(outside, 'note.txt'), 'outside');
		await fs.writeFile(path.join(outside, '.env'), 'SECRET=value');
		await fs.symlink(outside, path.join(root, 'escape'), 'junction');
		await fs.mkdir(path.join(root, 'nested'));
		await fs.writeFile(path.join(root, 'nested', 'readme.txt'), 'inside');
		await fs.symlink(path.join(root, 'nested'), path.join(root, 'alias'), 'junction');
		const roots = [{ name: 'workspace', path: root }];
		const none = new FileTools('none', roots);
		for (const operation of ['read', 'list', 'find', 'search'] as const) {
			assert.equal((await none.execute({ operation, path: root, query: 'main' }, signal)).ok, false);
		}
		const files = new FileTools('workspace', roots);
		assert.equal((await files.execute({ operation: 'read', path: 'main.cpp' }, signal)).contents, 'int main() {}');
		assert.equal((await files.execute({ operation: 'read', path: 'alias/readme.txt' }, signal)).contents, 'inside');
		for (const target of ['escape/note.txt', '../outside/note.txt', path.join(outside, 'note.txt')]) {
			assert.equal((await files.execute({ operation: 'read', path: target }, signal)).ok, false);
		}
		const computer = new FileTools('computer', roots);
		assert.equal((await computer.execute({ operation: 'read', path: path.join(outside, 'note.txt') }, signal)).contents, 'outside');
		for (const target of [path.join(outside, '.env'), path.join(outside, 'note.txt:secret'), '\\\\?\\C:\\Windows\\system.ini']) {
			assert.equal((await computer.execute({ operation: 'read', path: target }, signal)).ok, false);
		}
		assert.equal(await fs.readFile(path.join(outside, '.env'), 'utf8'), 'SECRET=value');
	}));
	test('text chunks preserve UTF-8, open document edits take priority, binary and images remain readable', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'source.txt'), 'abc你好世界');
		await fs.writeFile(path.join(directory, 'bytes.bin'), Buffer.from([0, 255, 3, 42]));
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6AAAAABJRU5ErkJggg==', 'base64');
		await fs.writeFile(path.join(directory, 'pixel.png'), png);
		const roots = [{ name: 'root', path: directory }];
		const files = new FileTools('workspace', roots);
		let result = ''; let offset = 0;
		do {
			const chunk = await files.execute({ operation: 'read', path: 'source.txt', offset, limit: 7 }, signal);
			assert.equal(chunk.kind, 'text'); result += chunk.contents;
			if (chunk.nextOffset === undefined) { break; }
			assert.ok(chunk.nextOffset > offset); offset = chunk.nextOffset;
		} while (true);
		assert.equal(result, 'abc你好世界');
		const open = new FileTools('workspace', roots, () => 'unsaved edit');
		assert.equal((await open.execute({ operation: 'read', path: 'source.txt' }, signal)).contents, 'unsaved edit');
		const binary = await files.execute({ operation: 'read', path: 'bytes.bin' }, signal);
		assert.equal(binary.kind, 'binary'); assert.equal(binary.contents, '00ff032a');
		const image = await files.execute({ operation: 'read', path: 'pixel.png' }, signal);
		assert.equal(image.kind, 'image'); assert.equal(image.contents, png.toString('base64'));
		assert.equal(fileModelOutput(image).type, 'content');
	}));
	test('listing, literal find and search omit private and escaping entries; cancellation and budgets are bounded', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, '.env'), 'private');
		await fs.writeFile(path.join(directory, 'main.cpp'), 'int main() {}\nneedle');
		const files = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (const operation of ['list', 'find', 'search'] as const) {
			const result = await files.execute({ operation, path: '.', ...(operation === 'list' ? {} : { query: operation === 'search' ? 'needle' : 'main' }) }, signal);
			assert.equal(result.ok, true); assert.ok(result.contents?.includes('main.cpp')); assert.ok(!result.contents?.includes('.env'));
		}
		await fs.writeFile(path.join(directory, 'large.txt'), 'x'.repeat(128 * 1024));
		const budget = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (let index = 0; index < 64; index++) { assert.equal((await budget.execute({ operation: 'read', path: 'large.txt', limit: 131072 }, signal)).ok, true); }
		assert.equal((await budget.execute({ operation: 'read', path: 'large.txt' }, signal)).ok, false);
		await assert.rejects(() => files.execute({ operation: 'read', path: 'main.cpp' }, AbortSignal.abort()));
	}));
	test('changing selection leaves active request permission unchanged and keeps previous file context after downgrade', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'note.txt'), 'saved context');
		const session = new ChatSession(() => {}, () => 'error');
		let permission: 'none' | 'workspace' = 'workspace';
		const files = new FileTools(permission, [{ name: 'root', path: directory }]);
		const generate: Generate = async function* (_messages, requestSignal, execute) {
			permission = 'none';
			const input = { operation: 'read' as const, path: 'note.txt' };
			const output = await execute(input, requestSignal);
			assert.equal(output.ok, true);
			yield { type: 'tool-result', result: { id: 'read', path: 'note.txt', input, output } };
			yield { type: 'protocol', turn: { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: 'deepseek-chat', messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'read', toolName: 'inspectFile', input }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'read', toolName: 'inspectFile', output: fileModelOutput(output) }] }, { role: 'assistant', content: 'answer keeps streaming' }] } };
			yield { type: 'text', text: 'answer keeps streaming' };
		};
		await session.send('read', generate, undefined, files.execute);
		assert.equal(session.snapshot.messages[1].status, 'complete');
		await session.send('follow up', async function* (messages, requestSignal, execute) {
			assert.ok(JSON.stringify(messages).includes('saved context'));
			assert.equal((await execute({ operation: 'read', path: 'note.txt' }, requestSignal)).ok, false);
			yield { type: 'text', text: 'uses previous context' };
		}, undefined, new FileTools(permission, []).execute);
	}));
	test('default file permission exposes no file tools', async () => {
		const generate = createGenerator(async () => ({ provider: 'deepseek', ...providers.deepseek, model: 'test', parameters: {}, apiKey: 'test' }), async (_url, options) => {
			assert.deepStrictEqual(JSON.parse(String(options?.body)).tools?.map((tool: { function: { name: string } }) => tool.function.name), ['browseWeb']);
			return new Response('data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		});
		const session = new ChatSession(() => {}, () => 'error');
		await session.send('hello', generate); assert.equal(session.snapshot.messages[1].text, 'hello');
	});
	test('all providers receive actual images during the tool loop and after reload and downgrade', async () => {
		const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6AAAAABJRU5ErkJggg==';
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			let requests = 0;
			const mock: typeof fetch = async (_url, options) => {
				const body = JSON.parse(String(options?.body));
				requests++;
				if (requests > 1) {
					const images = body.messages.flatMap((message: { content: unknown }) => Array.isArray(message.content) ? message.content.filter(part => part.type === 'image_url') : []);
					assert.deepStrictEqual(images.map((part: { image_url: { url: string } }) => part.image_url.url), [`data:image/png;base64,${image}`]);
					assert.ok(body.messages.filter((message: { role: string }) => message.role === 'tool').every((message: { content: string }) => !message.content.includes(image)));
				}
				const delta = requests < 3 ? { tool_calls: [{ index: 0, id: `call-${requests}`, type: 'function', function: { name: 'inspectFile', arguments: JSON.stringify({ operation: 'read', path: requests === 1 ? 'pixel.png' : 'note.txt' }) } }] } : { content: 'image answer' };
				const chunks = [delta, {}].map((value, index) => 'data: ' + JSON.stringify({ id: 'image-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: index === 1 ? (requests < 3 ? 'tool_calls' : 'stop') : null }] }) + '\n\n');
				return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			};
			const connection = async () => ({ provider, ...providers[provider], model: 'vision-test', parameters: {}, capabilities: { purpose: 'chat' as const, vision: true as const, tools: true as const, reasoning: true as const, source: 'manual' as const }, apiKey: 'test-key' });
			const session = new ChatSession(() => {}, () => 'error');
			await session.send('Describe the image', createGenerator(connection, mock, 'workspace'), undefined, async input => ({ ok: true, path: input.path, kind: input.path === 'pixel.png' ? 'image' : 'text', contents: input.path === 'pixel.png' ? image : 'note', ...(input.path === 'pixel.png' ? { mediaType: 'image/png' } : {}) }));
			assert.equal(requests, 3);
			assert.equal(session.snapshot.messages[1].text, 'image answer');
			const restored = new ChatSession(() => {}, () => 'error');
			restored.restore(session.snapshot);
			await restored.send('Use the saved image', createGenerator(connection, mock, 'none'));
			assert.equal(requests, 4);
			assert.equal(restored.snapshot.messages[3].text, 'image answer');
		}
	});
});
