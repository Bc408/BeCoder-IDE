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
import { suite, test } from 'node:test';

suite('BeCoder native Setup', { skip: process.platform !== 'win32' || process.env['BECODER_SETUP_INTEGRATION'] !== '1' }, () => {
	test('owns one machine installation and leaves independent Portable copies outside its integration', { timeout: 180_000 }, () => {
		const repository = path.resolve(import.meta.dirname, '..', '..', '..');
		const require = createRequire(import.meta.url);
		const iscc = path.join(path.dirname(path.dirname(require.resolve('innosetup'))), 'bin', 'ISCC.exe');
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-setup-'));
		const name = `BeCoder Setup Test ${path.basename(root)}`;
		const source = path.join(root, 'source');
		const output = path.join(root, 'output');
		const native = path.join(root, 'Native');
		const second = path.join(root, 'Second');
		const portable = path.join(root, 'Portable');
		const portableSecond = path.join(root, 'Portable2');
		fs.mkdirSync(path.join(source, 'data'), { recursive: true });
		fs.mkdirSync(output);
		fs.writeFileSync(path.join(source, 'BeCoder.exe'), 'fixture only; never execute');
		fs.writeFileSync(path.join(source, 'data', 'fixture.txt'), 'private data');
		execFileSync(iscc, [
			'/Qp', path.join(repository, 'build', 'win32', 'becoder.iss'), `/dNameLong=${name}`, '/dVersion=0.0.0', '/dExeBasename=BeCoder',
			`/dSourceDir=${source}`, `/dRepoDir=${repository}`, `/dOutputDir=${output}`
		], { encoding: 'utf8', timeout: 120_000, windowsHide: true });
		const setup = path.join(output, 'BeCoderSetup-x64-0.0.0.exe');
		const ps = (script: string) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
			env: { ...process.env, BC_TEST_NAME: name }, encoding: 'utf8', timeout: 15_000, windowsHide: true
		}).trim();
		const publicLink = path.join(ps("[Environment]::GetFolderPath('CommonPrograms')"), name + '.lnk');
		const desktopLink = path.join(ps("[Environment]::GetFolderPath('Desktop')"), name + '.lnk');
		const registry = () => ps("$p = Get-ItemProperty -LiteralPath ('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $env:BC_TEST_NAME + '_is1') -ErrorAction SilentlyContinue; if ($p) { $p.InstallLocation }; exit 0");
		assert.strictEqual(registry(), '');
		assert.ok(!fs.existsSync(publicLink) && !fs.existsSync(desktopLink));
		const invoke = (file: string, arguments_: string[]) => {
			const result = spawnSync(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ...arguments_], { timeout: 30_000, windowsHide: true });
			assert.ifError(result.error);
			assert.notStrictEqual(result.status, null);
			return result.status;
		};
		const install = (target: string, extra: string[] = []) => invoke(setup, [`/DIR=${target}`, ...extra]);
		let nativeUninstalled = false;
		try {
			assert.strictEqual(install(native), 0);
			assert.strictEqual(registry().replace(/\\$/, ''), native);
			const link = JSON.parse(ps("$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('CommonPrograms')) ($env:BC_TEST_NAME + '.lnk'))); @{ Target = $s.TargetPath; Working = $s.WorkingDirectory; Arguments = $s.Arguments } | ConvertTo-Json -Compress"));
			assert.deepStrictEqual(link, { Target: path.join(native, 'BeCoder.exe'), Working: native, Arguments: '' });
			assert.ok(fs.existsSync(desktopLink));
			assert.ok(!fs.existsSync(path.join(native, 'tools', 'becoder-shortcuts.exe')));
			const linkBytes = fs.readFileSync(publicLink);
			assert.notStrictEqual(install(second), 0, 'A second native destination must be refused.');
			assert.ok(!fs.existsSync(second));
			assert.notStrictEqual(install(native, ['/BECODERPORTABLE=1', '/BECODERALLOWDATALOSS=1']), 0);
			assert.strictEqual(fs.readFileSync(path.join(native, 'data', 'fixture.txt'), 'utf8'), 'private data');
			for (const target of [portable, portableSecond]) {
				assert.strictEqual(install(target, ['/BECODERPORTABLE=1', '/TASKS=']), 0);
				assert.ok(!fs.existsSync(path.join(target, 'unins000.exe')));
			}
			assert.deepStrictEqual(fs.readFileSync(publicLink), linkBytes);
			assert.strictEqual(registry().replace(/\\$/, ''), native);
			assert.notStrictEqual(install(native), 0, 'Silent replacement still requires consent.');
			assert.strictEqual(install(native, ['/BECODERALLOWDATALOSS=1']), 0);
			assert.strictEqual(invoke(path.join(native, 'unins000.exe'), []), 0);
			nativeUninstalled = true;
			assert.strictEqual(registry(), '');
			assert.ok(!fs.existsSync(publicLink) && !fs.existsSync(desktopLink));
			assert.ok(!fs.existsSync(path.join(native, 'data')));
			for (const target of [portable, portableSecond]) {
				assert.strictEqual(fs.readFileSync(path.join(target, 'data', 'fixture.txt'), 'utf8'), 'private data');
			}
		} finally {
			const uninstaller = path.join(native, 'unins000.exe');
			if (!nativeUninstalled && fs.existsSync(uninstaller)) {
				assert.strictEqual(invoke(uninstaller, []), 0, `Fixture uninstall failed; installation preserved at ${native}`);
			}
			// Only this fixture's unique paths are cleaned; no product integration is touched.
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
