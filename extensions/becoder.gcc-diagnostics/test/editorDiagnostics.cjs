/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

exports.run = async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-diagnostic-editor-'));
	const file = path.join(root, '测试.cpp');
	fs.writeFileSync(file, 'int main() { return 0; }\n');
	const document = await vscode.workspace.openTextDocument(file);
	await vscode.window.showTextDocument(document);
	const extension = vscode.extensions.getExtension('becoder.gcc-diagnostics');
	assert.ok(extension);
	assert.strictEqual(path.resolve(extension.extensionPath).toLowerCase(), path.resolve(__dirname, '..').toLowerCase(), 'Expected development extension, not stale packaged extension');
	await extension.activate();
	async function replace(text) {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
		assert.ok(await vscode.workspace.applyEdit(edit));
	}
	async function waitFor(check) {
		const deadline = Date.now() + 20000;
		while (Date.now() < deadline) {
			const diagnostics = vscode.languages.getDiagnostics(document.uri).filter(d => d.source === 'BeCoder GCC');
			if (check(diagnostics)) { return diagnostics; }
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		throw new Error('Timed out waiting for editor diagnostics');
	}
	try {
		const text = 'int main() { /*你😀*/ return x; }\n';
		await replace(text);
		const [diagnostic] = await waitFor(d => d.length === 1 && d[0].message.includes('x'));
		assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
		assert.strictEqual(diagnostic.range.start.character, text.indexOf('x'));
		assert.strictEqual(diagnostic.range.end.character, text.indexOf('x') + 1);
		assert.strictEqual(document.isDirty, true);
		await replace('#include<bits/stdc++.h>\nint main() { int x=1; debug(x); return 0; }\n');
		await waitFor(d => d.length === 0);
		console.log('EDITOR_DIAGNOSTICS_PASSED: unsaved x error, exact UTF16 range, Error severity, clean debug clears markers.');
	} finally {
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
		fs.rmSync(root, { recursive: true, force: true });
	}
};
