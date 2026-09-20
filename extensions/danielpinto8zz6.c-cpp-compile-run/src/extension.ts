/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { CompileRunManager } from './compile-run-manager';
import { bundledCompiler, runnerSettings } from './compiler';
import { buildCompilerArguments, privateRunnerEnvironment } from './compilation';

export interface CompilationPlan {
	readonly compiler: string;
	readonly args: readonly string[];
	readonly environment: Record<string, string>;
}

export interface RunnerCompilerApi {
	prepareCompilation(source: string, output: string, session: string): CompilationPlan;
}

export function activate(context: vscode.ExtensionContext): RunnerCompilerApi {
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
	return {
		prepareCompilation(source, output, session) {
			if (!/\.(c|cpp|cc|cxx)$/i.test(source)) { throw new Error('Unsupported C/C++ source.'); }
			const language = /\.c$/i.test(source) ? 'c' : 'cpp';
			const compiler = bundledCompiler(context, language);
			return { compiler, args: buildCompilerArguments({ path: source, language }, runnerSettings(), output), environment: privateRunnerEnvironment(session, compiler) };
		}
	};
}

export function deactivate(): void {
}
