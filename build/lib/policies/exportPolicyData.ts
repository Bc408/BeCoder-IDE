/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

const rootPath = resolve(import.meta.dirname, '..', '..', '..');

// Ensure sources are transpiled
console.log('Transpiling client sources...');
execSync('npm run transpile-client', { cwd: rootPath, stdio: 'inherit' });

// BeCoder has no distro-owned extension policies. Keep policy export local and deterministic.
process.env['DISTRO_PRODUCT_JSON'] ??= resolve(rootPath, 'product.json');

// Run the export
console.log('Exporting policy data...');
const codeScript = process.platform === 'win32'
	? resolve(rootPath, 'scripts', 'code.bat')
	: resolve(rootPath, 'scripts', 'code.sh');
const policyDataPath = resolve(rootPath, 'build', 'lib', 'policies', 'policyData.jsonc');
const userDataPath = resolve(rootPath, '.build', 'policy-export-user-data');
const extensionsPath = resolve(rootPath, '.build', 'policy-export-extensions');
const sharedDataPath = resolve(rootPath, '.build', 'policy-export-shared-data');
const previousMtime = existsSync(policyDataPath) ? statSync(policyDataPath).mtimeMs : 0;

execSync(`"${codeScript}" --export-policy-data="${policyDataPath}" --user-data-dir="${userDataPath}" --extensions-dir="${extensionsPath}" --shared-data-dir="${sharedDataPath}" --disable-extensions`, {
	cwd: rootPath,
	stdio: 'inherit',
	env: process.env,
});

if (!existsSync(policyDataPath) || statSync(policyDataPath).mtimeMs <= previousMtime) {
	throw new Error('Policy export exited without updating policyData.jsonc');
}

console.log('\nPolicy data exported to build/lib/policies/policyData.jsonc');
