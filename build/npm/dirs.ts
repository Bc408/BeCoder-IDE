/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '../..');

function isNpmProject(dir: string): boolean {
	return existsSync(path.join(root, dir, 'package.json'));
}

/**
 * Complete list of directories where npm should be executed to install node modules
 */
export const dirs = [
	'',
	'build',
	'build/rspack',
	'build/vite',
	'extensions',
	'extensions/becoder.beacon',
	'extensions/becoder.cph',
	'extensions/aadityanarayan.code-snap',
	'extensions/danielpinto8zz6.c-cpp-compile-run',
	'extensions/ipynb',
	'extensions/json-language-features',
	'extensions/json-language-features/server',
	'extensions/llvm-vs-code-extensions.vscode-clangd',
	'extensions/markdown-language-features',
	'extensions/markdown-math',
	'extensions/mermaid-markdown-features',
	'extensions/notebook-renderers',
	'test/automation',
	'test/monaco',
	'test/smoke',
	'.vscode/extensions/vscode-selfhost-import-aid',
	'.vscode/extensions/vscode-selfhost-test-provider',
	'.vscode/extensions/vscode-extras',
	'.vscode/extensions/vscode-pr-pinger',
].filter(isNpmProject);

dirs.push(...[
	'.build/distro/npm',
].filter(isNpmProject));
