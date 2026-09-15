/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import path from 'path';

async function main(registry: string | undefined): Promise<void> {
	if (!registry || /[\r\n]/.test(registry)) {
		throw new Error('A valid NPM registry URL is required.');
	}

	const agentTempDirectory = process.env['AGENT_TEMPDIRECTORY'];
	if (!agentTempDirectory) {
		throw new Error('AGENT_TEMPDIRECTORY is required.');
	}

	const npmrcPath = path.join(agentTempDirectory, 'vscode-ci.npmrc');
	await fs.writeFile(npmrcPath, `registry=${registry}\n`, 'utf8');

	console.log(`##vso[task.setvariable variable=NPMRC_PATH]${npmrcPath}`);
	console.log(`##vso[task.setvariable variable=NPM_CONFIG_USERCONFIG]${npmrcPath}`);
}

main(process.argv[2]).catch(error => {
	console.error(error.message);
	process.exit(1);
});
