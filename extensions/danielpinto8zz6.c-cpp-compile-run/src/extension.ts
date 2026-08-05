import * as vscode from 'vscode';
import { CompileRunManager } from './compile-run-manager';

export function activate(context: vscode.ExtensionContext): void {
	const manager = new CompileRunManager(context);
	context.subscriptions.push(manager);
	const commands: Array<[string, () => Promise<void>]> = [
		['becoder.runner.compile', () => manager.compile()],
		['becoder.runner.run', () => manager.run()],
		['becoder.runner.runWithFile', () => manager.runWithFile()],
	];
	for (const [command, handler] of commands) {
		context.subscriptions.push(vscode.commands.registerCommand(command, handler));
	}
}

export function deactivate(): void {
}
