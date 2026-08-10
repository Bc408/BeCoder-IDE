/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { prepareImportedPayload, validateImportedPayload } from './userDataPayload';

export const importTransactionJournalName = '.becoder-import-transaction.json';
const maximumImportTransactionJournalBytes = 1024 * 1024;

export interface IImportTransactionLock {
	release(): void;
}

export class ImportTransactionLockActiveError extends Error { }

export interface IConfiguration {
	readonly schemaVersion: 1;
	readonly dataRoot: string;
	readonly operationRoot: string;
	readonly executable: string;
	readonly waitPids: readonly number[];
	readonly resultPath: string;
}

type MovePhase = 'pending' | 'target-move-started' | 'target-moved' | 'staged-move-started' | 'staged-moved';

export interface IImportTransactionMove {
	readonly name: 'user-data' | 'shared-data' | 'extensions' | 'argv.json';
	readonly target: string;
	readonly staged: string;
	readonly previous: string;
	readonly targetExisted: boolean;
	phase: MovePhase;
}

interface IImportTransactionJournal {
	readonly schemaVersion: 1;
	readonly dataRoot: string;
	readonly operationRoot: string;
	readonly resultPath: string;
	committed: boolean;
	readonly moves: IImportTransactionMove[];
}

const operationPattern = /^\.becoder-import-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const movePhases = new Set<MovePhase>(['pending', 'target-move-started', 'target-moved', 'staged-move-started', 'staged-moved']);

function isDirectChild(parent: string, candidate: string): boolean {
	return path.dirname(path.resolve(candidate)).toLowerCase() === path.resolve(parent).toLowerCase();
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function pathExists(candidate: string): Promise<boolean> {
	try {
		await fs.promises.lstat(candidate);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

async function waitForProcesses(pids: readonly number[]): Promise<void> {
	const deadline = Date.now() + 5 * 60_000;
	while (pids.some(processExists)) {
		if (Date.now() >= deadline) {
			throw new Error('Timed out waiting for BeCoder to close.');
		}
		await delay(250);
	}
	await delay(500);
}

async function renameWithRetry(source: string, destination: string, deadline: number): Promise<void> {
	let lastError: unknown;
	do {
		try {
			await fs.promises.rename(source, destination);
			return;
		} catch (error) {
			lastError = error;
			await delay(250);
		}
	} while (Date.now() < deadline);
	throw lastError ?? new Error(`Unable to rename ${source}.`);
}

function transactionJournalPath(dataRoot: string): string {
	return path.join(dataRoot, importTransactionJournalName);
}

export function importTransactionMutexName(dataRoot: string): string {
	const identity = crypto.createHash('sha256').update(path.resolve(dataRoot).toLowerCase(), 'utf8').digest('hex');
	return `Local\\BeCoder.UserDataImport.${identity}`;
}

async function acquireImportTransactionLock(dataRoot: string): Promise<IImportTransactionLock> {
	const mutexName = importTransactionMutexName(dataRoot);
	const WindowsMutex = await import('@vscode/windows-mutex');
	try {
		return new WindowsMutex.Mutex(mutexName);
	} catch (error) {
		if (WindowsMutex.isActive(mutexName)) {
			throw new ImportTransactionLockActiveError('Another BeCoder user-data import is already active.');
		}
		throw error;
	}
}

async function waitForImportTransactionLock(dataRoot: string): Promise<IImportTransactionLock> {
	const mutexName = importTransactionMutexName(dataRoot);
	const WindowsMutex = await import('@vscode/windows-mutex');
	const deadline = Date.now() + 6 * 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		if (!WindowsMutex.isActive(mutexName)) {
			try {
				return new WindowsMutex.Mutex(mutexName);
			} catch (error) {
				lastError = error;
			}
		}
		await delay(250);
	}
	throw lastError ?? new Error('Timed out waiting for an active BeCoder user-data import to finish.');
}

async function writeJournal(journal: IImportTransactionJournal): Promise<void> {
	const journalPath = transactionJournalPath(journal.dataRoot);
	const temporaryPath = `${journalPath}.${process.pid}.tmp`;
	const handle = await fs.promises.open(temporaryPath, 'wx');
	try {
		await handle.writeFile(`${JSON.stringify(journal, undefined, '\t')}\n`, 'utf8');
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await fs.promises.rename(temporaryPath, journalPath);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

function expectedMovePaths(dataRoot: string, operationRoot: string, name: IImportTransactionMove['name']): { target: string; staged: string } {
	if (name === 'argv.json') {
		return { target: path.join(dataRoot, name), staged: path.join(operationRoot, 'staged-argv.json') };
	}
	return { target: path.join(dataRoot, name), staged: path.join(operationRoot, 'staged', name) };
}

function validateMove(value: unknown, dataRoot: string, operationRoot: string): IImportTransactionMove | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	if (!['user-data', 'shared-data', 'extensions', 'argv.json'].includes(String(candidate.name))
		|| typeof candidate.target !== 'string'
		|| typeof candidate.staged !== 'string'
		|| typeof candidate.previous !== 'string'
		|| typeof candidate.targetExisted !== 'boolean'
		|| typeof candidate.phase !== 'string'
		|| !movePhases.has(candidate.phase as MovePhase)) {
		return undefined;
	}
	const name = candidate.name as IImportTransactionMove['name'];
	const expected = expectedMovePaths(dataRoot, operationRoot, name);
	const previousName = name === 'argv.json' ? 'argv' : name;
	const previousPattern = new RegExp(`^\\.becoder-import-previous-${previousName}-[0-9]+-[0-9]+${name === 'argv.json' ? '\\.json' : ''}$`, 'i');
	if (path.resolve(candidate.target).toLowerCase() !== path.resolve(expected.target).toLowerCase()
		|| path.resolve(candidate.staged).toLowerCase() !== path.resolve(expected.staged).toLowerCase()
		|| !isDirectChild(dataRoot, candidate.previous)
		|| !previousPattern.test(path.basename(candidate.previous))) {
		return undefined;
	}
	return candidate as unknown as IImportTransactionMove;
}

async function loadJournal(journalPath: string): Promise<IImportTransactionJournal> {
	const journalStat = await fs.promises.lstat(journalPath);
	if (!journalStat.isFile() || journalStat.isSymbolicLink() || journalStat.size > maximumImportTransactionJournalBytes) {
		throw new Error('Invalid BeCoder import transaction journal.');
	}
	const value = JSON.parse(await fs.promises.readFile(journalPath, 'utf8')) as unknown;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid BeCoder import transaction journal.');
	}
	const candidate = value as Record<string, unknown>;
	const dataRoot = path.resolve(typeof candidate.dataRoot === 'string' ? candidate.dataRoot : '');
	const operationRoot = path.resolve(typeof candidate.operationRoot === 'string' ? candidate.operationRoot : '');
	const resultPath = path.resolve(typeof candidate.resultPath === 'string' ? candidate.resultPath : '');
	const operationStat = await fs.promises.lstat(operationRoot).catch(error => {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return undefined;
		}
		throw error;
	});
	if (candidate.schemaVersion !== 1
		|| typeof candidate.committed !== 'boolean'
		|| !Array.isArray(candidate.moves)
		|| !isDirectChild(dataRoot, operationRoot)
		|| !operationPattern.test(path.basename(operationRoot))
		|| path.resolve(journalPath).toLowerCase() !== transactionJournalPath(dataRoot).toLowerCase()
		|| resultPath.toLowerCase() !== path.join(dataRoot, '.becoder-import-result.json').toLowerCase()
		|| (operationStat && (!operationStat.isDirectory() || operationStat.isSymbolicLink()))
		|| !fs.existsSync(path.join(dataRoot, '.becoder-data-root'))) {
		throw new Error('Invalid BeCoder import transaction journal.');
	}
	const moves = candidate.moves.map(move => validateMove(move, dataRoot, operationRoot));
	const expectedNames = candidate.moves.length === 4
		? ['user-data', 'shared-data', 'extensions', 'argv.json']
		: ['user-data', 'shared-data', 'extensions'];
	if (moves.some(move => !move) || moves.map(move => move?.name).join(',') !== expectedNames.join(',')) {
		throw new Error('Invalid BeCoder import transaction journal.');
	}
	return {
		schemaVersion: 1,
		dataRoot,
		operationRoot,
		resultPath,
		committed: candidate.committed,
		moves: moves as IImportTransactionMove[]
	};
}

async function rollbackTransaction(journal: IImportTransactionJournal): Promise<void> {
	const errors: string[] = [];
	const deadline = Date.now() + 60_000;
	for (const move of [...journal.moves].reverse()) {
		try {
			let targetExists = await pathExists(move.target);
			let stagedExists = await pathExists(move.staged);
			let previousExists = await pathExists(move.previous);
			const operationExists = await pathExists(journal.operationRoot);

			if (move.targetExisted && targetExists && !previousExists && (stagedExists || !operationExists)) {
				continue;
			}
			if (!move.targetExisted && !targetExists && (stagedExists || !operationExists)) {
				continue;
			}

			if (move.phase === 'staged-move-started' || move.phase === 'staged-moved') {
				if (targetExists && !stagedExists) {
					await renameWithRetry(move.target, move.staged, deadline);
					targetExists = false;
					stagedExists = true;
				} else if (targetExists || !stagedExists) {
					throw new Error(`Cannot recover imported ${move.name}.`);
				}
			}

			previousExists = await pathExists(move.previous);
			if (move.targetExisted) {
				if (previousExists && !targetExists) {
					await renameWithRetry(move.previous, move.target, deadline);
				} else if (previousExists || !targetExists) {
					throw new Error(`Cannot restore previous ${move.name}.`);
				}
			} else if (targetExists) {
				throw new Error(`Cannot restore the absence of ${move.name}.`);
			}
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}
	if (errors.length > 0) {
		throw new Error(`BeCoder user data rollback was incomplete. Recoverable data was preserved. ${errors.join(' ')}`);
	}
}

async function createMoves(configuration: IConfiguration, stagingRoot: string, stagedArgvPath: string, includeArgv: boolean): Promise<IImportTransactionMove[]> {
	const suffix = `${process.pid}-${Date.now()}`;
	const names: IImportTransactionMove['name'][] = ['user-data', 'shared-data', 'extensions'];
	if (includeArgv) {
		names.push('argv.json');
	}
	return Promise.all(names.map(async name => {
		const expected = expectedMovePaths(configuration.dataRoot, configuration.operationRoot, name);
		const previousName = name === 'argv.json' ? 'argv' : name;
		return {
			name,
			target: expected.target,
			staged: name === 'argv.json' ? stagedArgvPath : path.join(stagingRoot, name),
			previous: path.join(configuration.dataRoot, `.becoder-import-previous-${previousName}-${suffix}${name === 'argv.json' ? '.json' : ''}`),
			targetExisted: await pathExists(expected.target),
			phase: 'pending' as MovePhase
		};
	}));
}

export async function swapUserData(configuration: IConfiguration, stagingRoot: string, stagedArgvPath: string, includeArgv: boolean): Promise<readonly IImportTransactionMove[]> {
	const moves = await createMoves(configuration, stagingRoot, stagedArgvPath, includeArgv);
	for (const move of moves) {
		if (!await pathExists(move.staged) || await pathExists(move.previous)) {
			throw new Error(`Import staging directory is invalid: ${move.name}`);
		}
	}
	const journal: IImportTransactionJournal = {
		schemaVersion: 1,
		dataRoot: configuration.dataRoot,
		operationRoot: configuration.operationRoot,
		resultPath: configuration.resultPath,
		committed: false,
		moves
	};
	await writeJournal(journal);
	const deadline = Date.now() + 60_000;
	try {
		for (const move of moves) {
			if (move.targetExisted) {
				move.phase = 'target-move-started';
				await writeJournal(journal);
				await renameWithRetry(move.target, move.previous, deadline);
			}
			move.phase = 'target-moved';
			await writeJournal(journal);
			move.phase = 'staged-move-started';
			await writeJournal(journal);
			await renameWithRetry(move.staged, move.target, deadline);
			move.phase = 'staged-moved';
			await writeJournal(journal);
		}
		return moves;
	} catch (error) {
		try {
			await rollbackTransaction(journal);
			await fs.promises.rm(transactionJournalPath(configuration.dataRoot), { force: true });
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], 'BeCoder user data import failed and rollback was incomplete.');
		}
		throw error;
	}
}

async function markImportCommitted(configuration: IConfiguration): Promise<void> {
	const journal = await loadJournal(transactionJournalPath(configuration.dataRoot));
	if (journal.moves.some(move => move.phase !== 'staged-moved')) {
		throw new Error('Cannot commit an incomplete BeCoder import transaction.');
	}
	journal.committed = true;
	await writeJournal(journal);
}

async function writeResultPath(resultPath: string, success: boolean, message?: string): Promise<void> {
	const temporaryPath = `${resultPath}.${process.pid}.tmp`;
	await fs.promises.writeFile(temporaryPath, `${JSON.stringify({ success, message })}\n`, 'utf8');
	await fs.promises.rm(resultPath, { force: true });
	await fs.promises.rename(temporaryPath, resultPath);
}

async function writeResult(configuration: IConfiguration, success: boolean, message?: string): Promise<void> {
	await writeResultPath(configuration.resultPath, success, message);
}

export async function cleanupCommittedImport(
	moves: readonly Pick<IImportTransactionMove, 'previous'>[],
	operationRoot: string,
	remove: typeof fs.promises.rm = fs.promises.rm
): Promise<boolean> {
	const results = await Promise.allSettled([
		...moves.map(move => remove(move.previous, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })),
		remove(operationRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
	]);
	return results.every(result => result.status === 'fulfilled');
}

export async function recoverInterruptedImport(journalPath: string): Promise<'committed' | 'rolled-back'> {
	const journal = await loadJournal(journalPath);
	if (journal.committed) {
		for (const move of journal.moves) {
			if (!await pathExists(move.target)) {
				throw new Error(`Committed BeCoder import is missing ${move.name}.`);
			}
		}
		await writeResultPath(journal.resultPath, true);
		if (!await cleanupCommittedImport(journal.moves, journal.operationRoot)) {
			throw new Error('Committed BeCoder import cleanup is incomplete.');
		}
		await fs.promises.rm(journalPath, { force: true });
		return 'committed';
	}

	await rollbackTransaction(journal);
	await writeResultPath(journal.resultPath, false, 'The previous BeCoder import was interrupted and rolled back.');
	await fs.promises.rm(journal.operationRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	await fs.promises.rm(journalPath, { force: true });
	return 'rolled-back';
}

export async function runImportRecovery(
	journalPath: string,
	acquireTransactionLock: (dataRoot: string) => Promise<IImportTransactionLock> = waitForImportTransactionLock,
	recoverTransaction: (journalPath: string) => Promise<'committed' | 'rolled-back'> = recoverInterruptedImport
): Promise<'not-needed' | 'committed' | 'rolled-back'> {
	const resolvedJournalPath = path.resolve(journalPath);
	const dataRoot = path.dirname(resolvedJournalPath);
	if (path.basename(resolvedJournalPath) !== importTransactionJournalName
		|| resolvedJournalPath.toLowerCase() !== transactionJournalPath(dataRoot).toLowerCase()
		|| !fs.existsSync(path.join(dataRoot, '.becoder-data-root'))) {
		throw new Error('Invalid BeCoder import recovery path.');
	}

	const transactionLock = await acquireTransactionLock(dataRoot);
	try {
		if (!await pathExists(resolvedJournalPath)) {
			return 'not-needed';
		}
		return recoverTransaction(resolvedJournalPath);
	} finally {
		transactionLock.release();
	}
}

function sanitizedRelaunchEnvironment(): NodeJS.ProcessEnv {
	const environment = { ...process.env };
	for (const name of Object.keys(environment)) {
		if (name === 'NODE_OPTIONS' || name === 'NODE_PATH' || name.startsWith('VSCODE_') || name.startsWith('ELECTRON_')) {
			delete environment[name];
		}
	}
	return environment;
}

function relaunch(executable: string): void {
	spawn(executable, [], { detached: true, env: sanitizedRelaunchEnvironment(), stdio: 'ignore', windowsHide: true }).unref();
}

async function loadConfiguration(configurationPath: string): Promise<IConfiguration> {
	const configuration = JSON.parse(await fs.promises.readFile(configurationPath, 'utf8')) as IConfiguration;
	const dataRoot = path.resolve(configuration.dataRoot ?? '');
	const operationRoot = path.resolve(configuration.operationRoot ?? '');
	const resultPath = path.resolve(configuration.resultPath ?? '');
	const executable = path.resolve(configuration.executable ?? '');
	const operationStat = await fs.promises.lstat(operationRoot).catch(() => undefined);
	if (configuration.schemaVersion !== 1
		|| !isDirectChild(dataRoot, operationRoot)
		|| !operationPattern.test(path.basename(operationRoot))
		|| path.resolve(configurationPath).toLowerCase() !== path.join(operationRoot, 'import.json').toLowerCase()
		|| !operationStat?.isDirectory()
		|| operationStat.isSymbolicLink()
		|| resultPath.toLowerCase() !== path.join(dataRoot, '.becoder-import-result.json').toLowerCase()
		|| executable.toLowerCase() !== path.resolve(process.execPath).toLowerCase()
		|| !fs.existsSync(path.join(dataRoot, '.becoder-data-root'))
		|| !Array.isArray(configuration.waitPids)
		|| configuration.waitPids.length === 0
		|| configuration.waitPids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) {
		throw new Error('Invalid BeCoder import helper configuration.');
	}
	return { ...configuration, dataRoot, operationRoot, resultPath, executable };
}

async function writeFallbackDiagnostic(configurationPath: string, error: unknown): Promise<void> {
	const operationRoot = path.dirname(path.resolve(configurationPath));
	const dataRoot = path.dirname(operationRoot);
	if (!isDirectChild(dataRoot, operationRoot)
		|| !operationPattern.test(path.basename(operationRoot))
		|| !fs.existsSync(path.join(dataRoot, '.becoder-data-root'))) {
		return;
	}
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	await fs.promises.appendFile(path.join(dataRoot, 'becoder-import-helper.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8').catch(() => undefined);
}

export async function runImportHelper(
	configurationPath: string,
	relaunchApplication: (executable: string) => void = relaunch,
	acquireTransactionLock: (dataRoot: string) => Promise<IImportTransactionLock> = acquireImportTransactionLock
): Promise<void> {
	let configuration: IConfiguration | undefined;
	let transactionLock: IImportTransactionLock | undefined;
	let committed = false;
	let relaunchOnExit = true;
	try {
		configuration = await loadConfiguration(configurationPath);
		transactionLock = await acquireTransactionLock(configuration.dataRoot);
		if (fs.existsSync(transactionJournalPath(configuration.dataRoot))) {
			throw new Error('A previous BeCoder import transaction requires recovery.');
		}
		await waitForProcesses(configuration.waitPids);
		const extractedRoot = path.join(configuration.operationRoot, 'extracted');
		const stagingRoot = path.join(configuration.operationRoot, 'staged');
		const stagedArgvPath = path.join(configuration.operationRoot, 'staged-argv.json');
		if (fs.existsSync(stagingRoot) || fs.existsSync(stagedArgvPath)) {
			throw new Error('BeCoder import staging already exists.');
		}
		await validateImportedPayload(extractedRoot);
		const includeArgv = await prepareImportedPayload(configuration.dataRoot, extractedRoot, stagingRoot, stagedArgvPath);
		const moves = await swapUserData(configuration, stagingRoot, stagedArgvPath, includeArgv);
		await markImportCommitted(configuration);
		committed = true;
		await writeResult(configuration, true);
		if (await cleanupCommittedImport(moves, configuration.operationRoot)) {
			await fs.promises.rm(transactionJournalPath(configuration.dataRoot), { force: true });
		}
	} catch (error) {
		if (error instanceof ImportTransactionLockActiveError) {
			relaunchOnExit = false;
			await writeFallbackDiagnostic(configurationPath, error);
		} else if (configuration && !committed) {
			const journalPath = transactionJournalPath(configuration.dataRoot);
			if (fs.existsSync(journalPath)) {
				try {
					const journal = await loadJournal(journalPath);
					await rollbackTransaction(journal);
					await fs.promises.rm(journalPath, { force: true });
				} catch (rollbackError) {
					throw new AggregateError([error, rollbackError], 'BeCoder user data import failed and rollback was incomplete.');
				}
			}
			await writeResult(configuration, false, error instanceof Error ? error.message : String(error)).catch(() => undefined);
			await fs.promises.rm(configuration.operationRoot, { recursive: true, force: true }).catch(() => undefined);
		} else if (!configuration) {
			await writeFallbackDiagnostic(configurationPath, error);
		}
		throw error;
	} finally {
		try {
			if (relaunchOnExit) {
				relaunchApplication(configuration?.executable ?? process.execPath);
			}
		} finally {
			transactionLock?.release();
		}
	}
}

if (require.main === module) {
	if (process.argv[2] === '--recover' && process.argv[3]) {
		runImportRecovery(process.argv[3]).catch(error => {
			console.error(error);
			process.exitCode = 1;
		});
	} else if (process.argv[2]) {
		runImportHelper(process.argv[2]).catch(() => process.exitCode = 1);
	} else {
		process.exitCode = 1;
	}
}
