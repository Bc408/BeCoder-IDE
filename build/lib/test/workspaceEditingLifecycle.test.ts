/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the native method's real body without loading the Electron workbench in Node.
const source = ts.createSourceFile('workspaceEditingService.ts', fs.readFileSync(new URL('../../../src/vs/workbench/services/workspaces/electron-browser/workspaceEditingService.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'NativeWorkspaceEditingService');
const method = declaration?.members.find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(source) === 'enterWorkspace');
assert.ok(method?.body);
const compiled = ts.transpileModule(`const enterWorkspace = async function(workspaceUri) ${method.body.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const enterWorkspace = new Function('localize', 'toWorkspaceIdentifier', 'WorkingCopyBackupService', `${compiled}\nreturn enterWorkspace;`)(
	(_key: string, value: string) => value, (workspace: unknown) => workspace, class { }
) as (this: unknown, uri: string) => Promise<void>;

for (const [name, stopped, result, expected] of [
	['successful unsaved workspace transition', true, { workspace: { id: 'untitled' } }, ['stop', 'enter', 'storage', 'participants', 'restart']],
	['transition without a result', true, undefined, ['stop', 'enter', 'restart']],
	['vetoed extension-host stop', false, undefined, ['stop']]
] as const) {
	test(`workspace commands remain available after ${name}`, async () => {
		const events: string[] = [];
		await enterWorkspace.call({
			extensionService: {
				stopExtensionHosts: async () => { events.push('stop'); return stopped; },
				startExtensionHosts: async () => { await new Promise(resolve => setImmediate(resolve)); events.push('restart'); }
			},
			contextService: { getWorkspace: () => ({ id: 'old-folder' }) },
			doEnterWorkspace: async () => { events.push('enter'); return result; },
			storageService: { switch: async (workspace: unknown, preserve: boolean) => { assert.strictEqual(workspace, result?.workspace); assert.strictEqual(preserve, true); events.push('storage'); } },
			fireDidEnterWorkspace: async () => { events.push('participants'); }
		}, 'untitled/workspace.json');
		assert.deepStrictEqual(events, expected);
	});
}
