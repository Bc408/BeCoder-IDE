/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';

interface IExtensionManifest {
	readonly contributes?: {
		readonly grammars?: readonly {
			readonly path?: string;
			readonly scopeName?: string;
		}[];
	};
}

suite('OI extension boundary', () => {
	test('keeps a single C++ TextMate grammar owner', () => {
		const extensionsRoot = path.resolve(import.meta.dirname, '..', '..', '..', 'extensions');
		const contributors: Array<{ extension: string; grammarPath: string | undefined }> = [];

		for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const manifestPath = path.join(extensionsRoot, entry.name, 'package.json');
			if (!fs.existsSync(manifestPath)) {
				continue;
			}
			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IExtensionManifest;
			for (const grammar of manifest.contributes?.grammars ?? []) {
				if (grammar.scopeName === 'source.cpp') {
					contributors.push({ extension: entry.name, grammarPath: grammar.path });
				}
			}
		}

		assert.deepStrictEqual(contributors, [
			{ extension: 'cpp', grammarPath: './syntaxes/cpp.tmLanguage.json' }
		]);
	});
});
