/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export type ExactInputInspection = {
	readonly path: string;
	readonly status: 'valid' | 'missing' | 'not-file';
};

export async function inspectExactInput(directory: string): Promise<ExactInputInspection> {
	const inputPath = path.join(directory, 'input');
	let exactEntryExists: boolean;
	try {
		exactEntryExists = (await fs.promises.readdir(directory)).includes('input');
	} catch {
		return { path: inputPath, status: 'missing' };
	}
	if (!exactEntryExists) {
		return { path: inputPath, status: 'missing' };
	}
	let stat: fs.Stats;
	try {
		stat = await fs.promises.lstat(inputPath);
	} catch {
		return { path: inputPath, status: 'missing' };
	}
	return {
		path: inputPath,
		status: stat.isFile() && !stat.isSymbolicLink() ? 'valid' : 'not-file'
	};
}
