/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Main-process Electron tests: no daily profile, live website or product installation.
const { app } = require('electron');
const path = require('node:path');
const Mocha = require('mocha');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp/release-2.1.0-audit/native-browser/profile'));
app.on('window-all-closed', () => { });
app.whenReady().then(() => {
	global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
	global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
	global._VSCODE_FILE_ROOT = path.join(root, 'out');
	const mocha = new Mocha({ ui: 'tdd', timeout: 10000 });
	for (const file of process.argv.slice(2)) { mocha.addFile(file); }
	mocha.run(failures => app.exit(failures ? 1 : 0));
}).catch(error => { console.error(error); app.exit(1); });
