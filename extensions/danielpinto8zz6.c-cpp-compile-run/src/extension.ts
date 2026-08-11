/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { CompileRunManager } from './compile-run-manager';

export function activate(context: vscode.ExtensionContext): void {
	const manager = new CompileRunManager(context);
	context.subscriptions.push(manager);
	context.subscriptions.push(vscode.window.registerTerminalProfileProvider('becoder.runner', {
		provideTerminalProfile: () => manager.provideTerminalProfile()
	}));
	const commands: Array<[string, () => Promise<void>]> = [
		['becoder.runner.openPanel', () => manager.openPanel()],
		['becoder.runner.run', () => manager.run(false)],
		['becoder.runner.runWithInput', () => manager.run(true)]
	];
	for (const [command, handler] of commands) {
		context.subscriptions.push(vscode.commands.registerCommand(command, handler));
	}
}

export function deactivate(): void {
}
