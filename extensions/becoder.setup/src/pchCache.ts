/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { ChildProcessByStdio, spawn } from 'child_process';
import { Readable } from 'stream';

export interface IGchGenerationLock {
	dispose(): Promise<void>;
}

export interface IGchGenerationSpec {
	readonly headerDirectory: string;
	readonly prepare: (temporaryOutput: string, probeSource: string, privateRoot: string) => Promise<{
		compiler: string;
		cwd: string;
		buildArgs: readonly string[];
		probeArgs: readonly string[];
		environment: Record<string, string>;
	}>;
	readonly onPhase?: (phase: 'cleaning' | 'building' | 'verifying') => void;
	readonly signal?: AbortSignal;
	readonly execute?: (file: string, args: readonly string[], options: { cwd: string; env: Record<string, string>; windowsHide: true; shell: false }, signal?: AbortSignal) => Promise<{ stderr: string }>;
}

export interface IGchGenerationResult {
	readonly status: 'generated';
	readonly cachePath: string;
}

export class GchGenerationBusyError extends Error {
	constructor() {
		super('A BeCoder gch cache generation is already running for this toolchain.');
		this.name = 'GchGenerationBusyError';
	}
}

export function isGchCachePath(relativePath: string): boolean {
	return relativePath.split(/[\\/]/).some(segment => segment.toLowerCase().endsWith('.gch'));
}

export async function generateGchCache(toolchainRoot: string, spec: IGchGenerationSpec): Promise<IGchGenerationResult> {
	const root = await fs.promises.realpath(toolchainRoot);
	const lock = await acquireGchGenerationLock(root);
	const cachePath = path.join(spec.headerDirectory, 'stdc++.h.gch');
	const temporaryCache = path.join(path.dirname(cachePath), `stdc++.h.gch.${process.pid}.${crypto.randomUUID()}.tmp`);
	let privateRoot: string | undefined;
	let cleanupStarted = false;
	try {
		if (spec.signal?.aborted) { throw new Error('BeCoder gch cache generation was cancelled.'); }
		privateRoot = await fs.promises.mkdtemp(path.join(root, '.becoder-gch-'));
		const probe = path.join(privateRoot, 'probe.cpp');
		await fs.promises.writeFile(probe, '#include<bits/stdc++.h>\nint main(){std::vector<int> v{2,1};return v.size()!=2;}\n', { flag: 'wx' });
		const compilerPlan = await spec.prepare(temporaryCache, probe, privateRoot);
		if (path.resolve(compilerPlan.cwd) !== path.resolve(spec.headerDirectory)) { throw new Error('The BeCoder gch header location changed.'); }
		const compilerStat = await fs.promises.lstat(compilerPlan.compiler);
		const headerStat = await fs.promises.lstat(path.join(compilerPlan.cwd, 'stdc++.h'));
		if (!compilerStat.isFile() || compilerStat.isSymbolicLink() || !headerStat.isFile() || headerStat.isSymbolicLink()) {
			throw new Error('The BeCoder compiler or universal header is missing or invalid.');
		}
		assertWithinRoot(root, compilerPlan.cwd);
		assertWithinRoot(root, compilerPlan.compiler);
		await assertOrdinaryAncestors(root, compilerPlan.cwd);
		await assertOrdinaryAncestors(root, path.dirname(compilerPlan.compiler));
		await fs.promises.access(compilerPlan.cwd, fs.constants.W_OK);
		spec.onPhase?.('cleaning');
		await removeGchCaches(root);
		cleanupStarted = true;
		spec.onPhase?.('building');
		await runCompiler(spec, compilerPlan.compiler, compilerPlan.buildArgs, compilerPlan.cwd, compilerPlan.environment);
		const temporaryStat = await fs.promises.lstat(temporaryCache);
		if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink() || temporaryStat.size === 0) {
			throw new Error('GCC did not produce an ordinary non-empty universal-header cache.');
		}
		await fs.promises.rename(temporaryCache, cachePath);
		spec.onPhase?.('verifying');
		const probeResult = await runCompiler(spec, compilerPlan.compiler, compilerPlan.probeArgs, compilerPlan.cwd, compilerPlan.environment);
		if (!probeResult.stderr.split(/\r?\n/).some(line => line.startsWith('! ') && path.basename(line.slice(2).trim()) === 'stdc++.h.gch')) {
			throw new Error('GCC compiled the verification program without using the generated universal-header cache.');
		}
		return { status: 'generated', cachePath };
	} catch (error) {
		if (cleanupStarted) {
			await removeGchCaches(root);
		}
		throw error;
	} finally {
		try {
			if (privateRoot) {
				await fs.promises.rm(privateRoot, { recursive: true, force: true });
			}
		} finally { await lock.dispose(); }
	}
}

export async function acquireGchGenerationLock(toolchainRoot: string): Promise<IGchGenerationLock> {
	if (process.platform !== 'win32') {
		throw new Error('BeCoder gch cache generation is available only on Windows.');
	}
	const root = await fs.promises.realpath(toolchainRoot);
	const pipeName = `\\\\.\\pipe\\BeCoderGch-${crypto.createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 32)}`;
	const server = net.createServer(socket => socket.destroy());
	await new Promise<void>((resolve, reject) => {
		const onError = (error: NodeJS.ErrnoException) => {
			server.removeListener('listening', onListening);
			reject(error.code === 'EADDRINUSE' ? new GchGenerationBusyError() : error);
		};
		const onListening = () => {
			server.removeListener('error', onError);
			resolve();
		};
		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(pipeName);
	});
	let disposed = false;
	return {
		dispose: () => new Promise<void>((resolve, reject) => {
			if (disposed) {
				resolve();
				return;
			}
			disposed = true;
			server.close(error => error ? reject(error) : resolve());
		})
	};
}

export async function removeGchCaches(toolchainRoot: string): Promise<string[]> {
	const rootStat = await fs.promises.lstat(toolchainRoot);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new Error('The BeCoder toolchain root is not an ordinary directory.');
	}
	const root = await fs.promises.realpath(toolchainRoot);
	const entries: string[] = [];
	await collectGchEntries(root, root, entries);
	for (const entry of entries) {
		await removeCacheEntry(root, entry);
	}
	return entries;
}

async function collectGchEntries(root: string, directory: string, entries: string[]): Promise<void> {
	await assertOrdinaryAncestors(root, directory);
	const children = await fs.promises.readdir(directory, { withFileTypes: true });
	for (const child of children) {
		const childPath = path.join(directory, child.name);
		const stat = await fs.promises.lstat(childPath);
		if (child.name.toLowerCase().endsWith('.gch') || /^stdc\+\+\.h\.gch\.[a-z0-9.-]+\.tmp$/i.test(child.name)) {
			entries.push(childPath);
		} else if (stat.isDirectory() && !stat.isSymbolicLink()) {
			assertWithinRoot(root, childPath);
			await collectGchEntries(root, childPath, entries);
		}
	}
}

async function runCompiler(spec: IGchGenerationSpec, file: string, args: readonly string[], cwd: string, environment: Record<string, string>): Promise<{ stderr: string }> {
	if (spec.execute) { return spec.execute(file, args, { cwd, env: environment, windowsHide: true, shell: false }, spec.signal); }
	if (spec.signal?.aborted) { throw new Error('BeCoder gch cache generation was cancelled.'); }
	return new Promise((resolve, reject) => {
		let stderr = '';
		let settled = false;
		let stoppingError: Error | undefined;
		let child: ChildProcessByStdio<null, null, Readable>;
		try {
			child = spawn(file, [...args], { cwd, env: environment, windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
		} catch (error) {
			reject(error);
			return;
		}
		const finish = (error?: Error) => {
			if (settled) { return; }
			settled = true;
			clearTimeout(timeout);
			spec.signal?.removeEventListener('abort', abort);
			if (error) { reject(error); }
			else { resolve({ stderr }); }
		};
		const abort = () => {
			stoppingError = new Error('BeCoder gch cache generation was cancelled.');
			terminateCompiler();
		};
		const terminateCompiler = () => {
			const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
			if (process.platform === 'win32' && systemRoot && child.pid) {
				const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
				killer.once('error', () => child.kill());
			} else { child.kill(); }
		};
		const timeout = setTimeout(() => {
			stoppingError = new Error('GCC exceeded the two-minute gch generation limit.');
			terminateCompiler();
		}, 120000);
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', chunk => stderr += chunk);
		child.once('error', error => finish(error));
		child.once('close', code => {
			if (settled) { return; }
			if (stoppingError) { finish(stoppingError); }
			else if (code !== 0) { finish(new Error(stderr.trim() || `GCC exited with code ${code ?? 'unknown'}.`)); }
			else { finish(); }
		});
		spec.signal?.addEventListener('abort', abort, { once: true });
		if (spec.signal?.aborted) { abort(); }
	});
}

async function removeCacheEntry(root: string, target: string): Promise<void> {
	assertWithinRoot(root, target);
	await assertOrdinaryAncestors(root, path.dirname(target));
	const current = await fs.promises.lstat(target);
	if (current.isDirectory() && !current.isSymbolicLink()) {
		for (const name of await fs.promises.readdir(target)) {
			const childPath = path.join(target, name);
			await removeCacheEntry(root, childPath);
		}
		await fs.promises.rmdir(target);
		return;
	}
	await fs.promises.rm(target, { recursive: false, force: false });
}

async function assertOrdinaryAncestors(root: string, directory: string): Promise<void> {
	const relative = path.relative(root, directory);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error('A gch cache parent is outside the BeCoder toolchain.');
	}
	let current = root;
	for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
		current = path.join(current, part);
		const stat = await fs.promises.lstat(current);
		if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(current, await fs.promises.realpath(current)) !== '') {
			throw new Error(`A gch cache parent is not an ordinary directory: ${current}`);
		}
	}
}

function assertWithinRoot(root: string, target: string): void {
	const relative = path.relative(root, target);
	if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`The gch cache path is outside the BeCoder toolchain: ${target}`);
	}
}
