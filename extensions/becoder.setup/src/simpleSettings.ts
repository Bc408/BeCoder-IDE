import * as vscode from 'vscode';

export function registerSimpleSettings(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('becoder.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings')),
		vscode.commands.registerCommand('becoder.configureCppSnippets', () => vscode.commands.executeCommand('workbench.action.openSnippets', 'cpp')),
		vscode.commands.registerCommand('becoder.configureAutoFormat', () => vscode.commands.executeCommand('workbench.action.openSettings', '@id:editor.formatOnSave')),
	);
}
