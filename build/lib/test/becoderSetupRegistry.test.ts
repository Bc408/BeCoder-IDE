/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { test } from 'node:test';

test('Setup verification preserves registry subtrees and refuses to overwrite a concurrent registration', { skip: process.platform !== 'win32' }, context => {
	const verifier = fs.readFileSync(path.resolve(import.meta.dirname, '../../azure-pipelines/win32/verify-becoder-setup.ps1'), 'utf8');
	const start = verifier.indexOf('Add-Type -TypeDefinition');
	const end = verifier.indexOf('$shortcutsBefore = Get-ShortcutSnapshot', start);
	assert.ok(start >= 0 && end > start);
	const probe = String.raw`
$ErrorActionPreference = 'Stop'
$registryBase = 'HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\'
$backupSuffix = 'BeCoder_is1.verification-' + ('a' * 32)
$metadataBase = $registryBase + 'CloudStore\Store\DefaultAccount\Cloud\{test}$windows.data.apps.appmetadata$appmetadatalist\windows.data.apps.appmetadata$'
$requiredKeys = @(
    ($registryBase + 'Uninstall\BeCoder_is1'),
    ($registryBase + 'Uninstall\' + $backupSuffix),
    ($metadataBase + 'BeCoder_is1'),
    ($metadataBase + 'Other_is1.verification-' + ('a' * 32)),
    ($metadataBase + 'BeCoder_is1.verification-' + ('b' * 32))
)
$searchLines = @($requiredKeys)
$searchLines += $metadataBase + $backupSuffix
$searchLines += $metadataBase.Replace('\Cloud\', '\Current\') + $backupSuffix
$searchLines += 'End of search: 5 match(es) found.'
$filteredKeys = @(Get-RegistrySearchKeys -SearchOutput $searchLines -TemporaryRegistrationName $backupSuffix)
if (($filteredKeys -join "\n") -cne ($requiredKeys -join "\n")) { throw 'Registry search hid product state or included temporary derived metadata.' }
$parent = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall', $true)
if (-not $parent) { Write-Output 'SKIP_NO_UNINSTALL_ROOT'; exit 0 }
$name = 'BeCoderVerifierProbe-' + [Guid]::NewGuid().ToString('N')
$backup = $name + '-saved'
try {
    $key = $parent.CreateSubKey($name)
    $key.SetValue('Sentinel', '%USERPROFILE%', [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $child = $key.CreateSubKey('Child')
    $child.SetValue('Bytes', [byte[]]@(1,2,3), [Microsoft.Win32.RegistryValueKind]::Binary)
    $child.Dispose()
    $key.Dispose()
    Rename-VerificationUninstallKey -SourceName $name -DestinationName $backup
    $key = $parent.OpenSubKey($backup)
    if ($key.GetValueKind('Sentinel') -ne [Microsoft.Win32.RegistryValueKind]::ExpandString -or
        $key.GetValue('Sentinel', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -cne '%USERPROFILE%') { throw 'Value/type changed.' }
    $child = $key.OpenSubKey('Child')
    if (($child.GetValue('Bytes') -join ',') -ne '1,2,3') { throw 'Subtree changed.' }
    $child.Dispose()
    $key.Dispose()
    $collision = $parent.CreateSubKey($name)
    $collision.SetValue('Sentinel', 'preserve concurrent registration')
    $collision.Dispose()
    $refused = $false
    try { Rename-VerificationUninstallKey -SourceName $backup -DestinationName $name } catch { $refused = $true }
    if (-not $refused) { throw 'Existing registration was overwritten.' }
    $collision = $parent.OpenSubKey($name)
    if ($collision.GetValue('Sentinel') -ne 'preserve concurrent registration') { throw 'Collision changed.' }
    $collision.Dispose()
    $parent.DeleteSubKeyTree($name)
    Rename-VerificationUninstallKey -SourceName $backup -DestinationName $name
} finally {
    foreach ($ownedName in @($name, $backup)) { $parent.DeleteSubKeyTree($ownedName, $false) }
    $parent.Dispose()
}
`;
	const environment: NodeJS.ProcessEnv = { ...process.env };
	delete environment['PSModulePath'];
	const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', verifier.slice(start, end) + probe], {
		encoding: 'utf8', env: environment, timeout: 30_000, windowsHide: true
	});
	assert.ifError(result.error);
	assert.strictEqual(result.status, 0, result.stderr || result.stdout);
	if (result.stdout.includes('SKIP_NO_UNINSTALL_ROOT')) {
		context.skip('No current-user uninstall root exists to preserve.');
	}
});
