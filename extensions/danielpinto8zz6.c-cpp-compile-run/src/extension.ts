/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------
 *  Modifications Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { CompileRunManager } from './compile-run-manager';
import { bundledCompiler, runnerSettings } from './compiler';
import { buildCompilerArguments, privateRunnerEnvironment } from './compilation';
import { captureCompilationSource, CompilationSourceSnapshot } from './compilationSnapshot';
import { BeaconEvidence, RuntimeEvidence } from './beaconEvidence';
import { runNotebookProgram, NotebookRunRequest, NotebookRunCallbacks, NotebookRunResult } from './notebookProcess';

export interface CompilationPlan {
	readonly compiler: string;
	readonly args: readonly string[];
	readonly environment: Record<string, string>;
}

export interface RunnerCompilerApi {
	runNotebook(request: NotebookRunRequest, signal: AbortSignal, callbacks: NotebookRunCallbacks): Promise<NotebookRunResult>;
	prepareCompilation(source: string, output: string, session: string): CompilationPlan;
	prepareCapturedCompilation(source: string, output: string, session: string): Promise<CompilationPlan & { readonly sourceSnapshot: CompilationSourceSnapshot }>;
	createEvidence(handle: string, producer: 'runner' | 'cph' | 'notebook', failed: (error: unknown) => void): RuntimeEvidence;
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
		runNotebook(request, signal, callbacks) {
			const settings = runnerSettings();
			return runNotebookProgram(request, signal, callbacks, path.join(context.extensionPath, 'dist', 'runner-input.exe'), (source, output, session, language, cwd) => {
				const compiler = bundledCompiler(context, language);
				return { compiler, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, path.basename(source)), language }, settings, output), environment: privateRunnerEnvironment(session, compiler) };
			});
		},
		createEvidence: (handle, producer, failed) => new BeaconEvidence(handle, producer, (operation, input) => vscode.commands.executeCommand('_becoder.beacon.context', operation, input), failed),
		prepareCompilation(source, output, session) {
			if (!/\.(c|cpp|cc|cxx)$/i.test(source)) { throw new Error('Unsupported C/C++ source.'); }
			const language = /\.c$/i.test(source) ? 'c' : 'cpp';
			const compiler = bundledCompiler(context, language);
			return { compiler, args: buildCompilerArguments({ path: source, language }, runnerSettings(), output), environment: privateRunnerEnvironment(session, compiler) };
		},
		async prepareCapturedCompilation(source, output, session) {
			if (!/\.(c|cpp|cc|cxx)$/i.test(source)) { throw new Error('Unsupported C/C++ source.'); }
			const language = /\.c$/i.test(source) ? 'c' : 'cpp';
			const compiler = bundledCompiler(context, language);
			const settings = runnerSettings();
			const sourceSnapshot = await captureCompilationSource(source, session);
			return { compiler, args: buildCompilerArguments({ path: sourceSnapshot.path, originalPath: sourceSnapshot.originalPath, language }, settings, output), environment: privateRunnerEnvironment(session, compiler), sourceSnapshot };
		}
	};
}

export function deactivate(): void {
}
