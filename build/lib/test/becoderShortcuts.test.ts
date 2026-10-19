/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync, spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, before, suite, test } from 'node:test';
import { buildBeCoderShortcutHelper } from '../becoderShortcuts.ts';

suite('BeCoder native Start-menu shortcuts', { skip: process.platform !== 'win32' || !process.env['BECODER_SHORTCUT_COMPILER'] }, () => {
	let root: string;
	let helper: string;
	let programs: string;
	let userPrograms: string;
	let first: string;
	let second: string;
	let shortcut: string;
	let environment: NodeJS.ProcessEnv;

	before(async () => {
		assert.ok(process.env['BECODER_SHORTCUT_COMPILER'], 'Set BECODER_SHORTCUT_COMPILER to the bundled g++.exe.');
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-sc-'));
		helper = path.join(root, 'shortcuts.exe');
		programs = path.join(root, 'programs');
		userPrograms = path.join(root, 'user');
		first = path.join(root, 'a');
		second = path.join(root, 'b');
		for (const directory of [programs, userPrograms, first, second]) {
			fs.mkdirSync(directory);
		}
		for (const directory of [first, second]) {
			fs.writeFileSync(path.join(directory, 'BeCoder.exe'), 'not an executable; never launch');
		}
		shortcut = path.join(programs, 'BeCoder.lnk');
		environment = { ...process.env, BECODER_SHORTCUT_TEST_PROGRAMS: programs, BECODER_SHORTCUT_TEST_USER_PROGRAMS: userPrograms };
		await buildBeCoderShortcutHelper(process.env['BECODER_SHORTCUT_COMPILER']!, helper, true);
	});

	after(async () => {
		if (root) { await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
	});

	function run(action: string, target = first): number | null {
		const result = spawnSync(helper, [action, target], { env: environment, timeout: 10_000, windowsHide: true });
		assert.ifError(result.error);
		return result.status;
	}

	function shellLink(filename: string, write = false, target = first, arguments_ = '', workingDirectory = target): { TargetPath: string; WorkingDirectory: string; Arguments: string } {
		const script = '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:BC_LINK); if ($env:BC_WRITE -eq "1") { $s.TargetPath = $env:BC_TARGET; $s.WorkingDirectory = $env:BC_WORKING; $s.Arguments = $env:BC_ARGS; $s.Save() }; @{ TargetPath = $s.TargetPath; WorkingDirectory = $s.WorkingDirectory; Arguments = $s.Arguments } | ConvertTo-Json -Compress';
		const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
			env: { ...process.env, BC_LINK: filename, BC_WRITE: write ? '1' : '0', BC_TARGET: path.join(target, 'BeCoder.exe'), BC_WORKING: workingDirectory, BC_ARGS: arguments_ },
			encoding: 'utf8', timeout: 15_000, windowsHide: true
		});
		assert.ifError(result.error);
		assert.strictEqual(result.status, 0, result.stderr);
		return JSON.parse(result.stdout);
	}

	test('creates a Windows shortcut with the exact target, working directory and empty arguments', () => {
		assert.strictEqual(run('create'), 0);
		assert.deepStrictEqual(shellLink(shortcut), { TargetPath: path.join(first, 'BeCoder.exe'), WorkingDirectory: first, Arguments: '' });
	});

	test('reinstall is idempotent and another installation cannot replace or uninstall the entry', () => {
		const before = fs.readFileSync(shortcut);
		assert.strictEqual(run('create'), 0);
		assert.deepStrictEqual(fs.readFileSync(shortcut), before);
		assert.strictEqual(run('create', second), 183);
		assert.strictEqual(run('remove', second), 183);
		assert.deepStrictEqual(fs.readFileSync(shortcut), before);
		assert.strictEqual(run('remove'), 0);
		assert.strictEqual(fs.existsSync(shortcut), false);
		assert.strictEqual(run('remove'), 0);
	});

	test('preserves malformed, argument-bearing and redirected-working-directory entries', () => {
		for (const kind of ['malformed', 'arguments', 'working directory']) {
			if (kind === 'malformed') { fs.writeFileSync(shortcut, 'not a ShellLink'); }
			else { shellLink(shortcut, true, first, kind === 'arguments' ? '--other-app' : '', kind === 'working directory' ? second : first); }
			const before = fs.readFileSync(shortcut);
			assert.strictEqual(run('create'), 183, kind);
			assert.strictEqual(run('remove'), 183, kind);
			assert.deepStrictEqual(fs.readFileSync(shortcut), before);
			fs.unlinkSync(shortcut);
		}
	});

	test('refuses hard-linked entries and junction ancestors', () => {
		assert.strictEqual(run('create'), 0);
		const external = path.join(root, 'external.lnk');
		fs.linkSync(shortcut, external);
		assert.strictEqual(run('remove'), 183);
		assert.strictEqual(fs.existsSync(external), true);
		fs.unlinkSync(external);
		assert.strictEqual(run('remove'), 0);
		const junction = path.join(root, 'junction');
		fs.symlinkSync(first, junction, 'junction');
		assert.strictEqual(run('create', junction), 123);
		const originalPrograms = environment['BECODER_SHORTCUT_TEST_PROGRAMS'];
		environment['BECODER_SHORTCUT_TEST_PROGRAMS'] = junction;
		assert.strictEqual(run('create'), 123);
		environment['BECODER_SHORTCUT_TEST_PROGRAMS'] = originalPrograms;
		fs.unlinkSync(junction);
	});

	test('cleans only the matching legacy user entry and leaves other files and installations intact', () => {
		const folder = path.join(userPrograms, 'BeCoder');
		fs.mkdirSync(folder);
		const legacy = path.join(folder, 'BeCoder.lnk');
		const unrelated = path.join(folder, 'user-file.txt');
		fs.writeFileSync(unrelated, 'preserve');
		shellLink(legacy, true, second);
		assert.strictEqual(run('remove-legacy'), 183);
		assert.strictEqual(fs.existsSync(legacy), true);
		shellLink(legacy, true);
		assert.strictEqual(run('remove-legacy'), 0);
		assert.strictEqual(fs.existsSync(legacy), false);
		assert.strictEqual(fs.readFileSync(unrelated, 'utf8'), 'preserve');
	});

	test('rejects unsupported operations and cannot use a caller-specified destination', () => {
		assert.strictEqual(run('delete-tree'), 87);
		assert.strictEqual(run('create', 'C:\\'), 87);
		assert.strictEqual(run('create', path.join(first, 'x'.repeat(80))), 87);
		delete environment['BECODER_SHORTCUT_TEST_PROGRAMS'];
		assert.strictEqual(run('create'), 87);
	});

	test('compiles Setup and exercises Native/Portable installation and uninstall without launching BeCoder', async () => {
		const repository = path.resolve(import.meta.dirname, '..', '..', '..');
		const require = createRequire(import.meta.url);
		const iscc = path.join(path.dirname(path.dirname(require.resolve('innosetup'))), 'bin', 'ISCC.exe');
		const source = path.join(root, 'source');
		const output = path.join(root, 'setup');
		const native = path.join(root, 'Native A');
		const portable = path.join(root, 'Portable');
		const name = `BeCoder Shortcut Test ${path.basename(root)}`;
		const productionHelper = path.join(root, 'production-helper.exe');
		const hash = await buildBeCoderShortcutHelper(process.env['BECODER_SHORTCUT_COMPILER']!, productionHelper, false, name);
		fs.mkdirSync(path.join(source, 'data'), { recursive: true });
		fs.writeFileSync(path.join(source, 'BeCoder.exe'), 'fixture only; never execute');
		fs.writeFileSync(path.join(source, 'data', 'fixture.txt'), 'private data');
		fs.mkdirSync(output);
		execFileSync(iscc, [
			'/Qp', path.join(repository, 'build', 'win32', 'becoder.iss'), `/dNameLong=${name}`, '/dVersion=0.0.0', '/dExeBasename=BeCoder',
			`/dSourceDir=${source}`, `/dRepoDir=${repository}`, `/dOutputDir=${output}`, `/dShortcutHelperPath=${productionHelper}`, `/dShortcutHelperSHA256=${hash}`
		], { encoding: 'utf8', timeout: 120_000, windowsHide: true });
		const getFolder = (folder: string) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::GetFolderPath('${folder}')`], { encoding: 'utf8', windowsHide: true }).trim();
		const publicLink = path.join(getFolder('CommonPrograms'), name + '.lnk');
		const desktopLink = path.join(getFolder('Desktop'), name + '.lnk');
		const legacyFolder = path.join(getFolder('Programs'), name);
		const legacyLink = path.join(legacyFolder, name + '.lnk');
		assert.ok(!fs.existsSync(publicLink) && !fs.existsSync(desktopLink) && !fs.existsSync(legacyFolder));
		fs.mkdirSync(legacyFolder);
		shellLink(legacyLink, true, native);
		const setup = path.join(output, 'BeCoderSetup-x64-0.0.0.exe');
		const invoke = (file: string, arguments_: string[]) => {
			const result = spawnSync(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ...arguments_], { timeout: 30_000, windowsHide: true });
			assert.ifError(result.error);
			assert.strictEqual(result.status, 0);
		};
		let nativeUninstalled = false;
		try {
			invoke(setup, [`/DIR=${native}`, `/LOG=${path.join(root, 'native-install.log')}`]);
			const displayIcon = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-ItemProperty -LiteralPath $env:BC_UNINSTALL).DisplayIcon'], {
				env: { ...process.env, BC_UNINSTALL: `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${name}_is1` },
				encoding: 'utf8', timeout: 15_000, windowsHide: true
			}).trim();
			assert.strictEqual(displayIcon, path.join(native, 'BeCoder.exe'), 'Control Panel must use the installed application icon.');
			assert.deepStrictEqual(shellLink(publicLink), { TargetPath: path.join(native, 'BeCoder.exe'), WorkingDirectory: native, Arguments: '' });
			assert.ok(fs.existsSync(desktopLink), 'Desktop shortcut must remain selected by default.');
			assert.ok(!fs.existsSync(legacyLink), 'Only the matching legacy user shortcut should be removed.');
			assert.ok(fs.existsSync(path.join(native, 'tools', 'becoder-shortcuts.exe')));
			invoke(path.join(native, 'unins000.exe'), [`/LOG=${path.join(root, 'native-uninstall.log')}`]);
			nativeUninstalled = true;
			assert.ok(!fs.existsSync(publicLink) && !fs.existsSync(desktopLink));
			assert.ok(!fs.existsSync(path.join(native, 'data', 'fixture.txt')));
			invoke(setup, ['/BECODERPORTABLE=1', `/DIR=${portable}`, `/LOG=${path.join(root, 'portable-install.log')}`]);
			assert.ok(!fs.existsSync(publicLink));
			assert.ok(fs.existsSync(desktopLink), 'Portable desktop default must remain unchanged.');
			assert.ok(!fs.existsSync(path.join(portable, 'unins000.exe')));
			assert.ok(!fs.existsSync(path.join(portable, 'tools', 'becoder-shortcuts.exe')));
		} finally {
			const uninstaller = path.join(native, 'unins000.exe');
			if (!nativeUninstalled && fs.existsSync(uninstaller)) { invoke(uninstaller, []); }
			// These names are unique to this fixture; never remove a product shortcut.
			for (const link of [publicLink, desktopLink, legacyLink]) {
				if (fs.existsSync(link)) { fs.unlinkSync(link); }
			}
			fs.rmdirSync(legacyFolder);
		}
	});
});
