/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { generateGchCache, GchGenerationBusyError } from './pchCache';
import { getBeCoderToolchainRoot } from './toolchain';
import { selectDisplayText } from './localize';

type GenerationPlan = {
	compiler: string;
	cwd: string;
	buildArgs: string[];
	probeArgs: string[];
	environment: Record<string, string>;
};

let activeGeneration: { controller: AbortController; completion: Promise<void> } | undefined;

export function registerGchGeneration(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('BeCoder gch Cache');
	context.subscriptions.push(output, { dispose: () => activeGeneration?.controller.abort() });
	context.subscriptions.push(vscode.commands.registerCommand('becoder.generateGchCache', async () => {
		if (activeGeneration) {
			// allow-any-unicode-next-line
			void vscode.window.showInformationMessage(selectDisplayText('A gch cache generation is already running.', 'gch 缓存正在生成，请勿重复操作。'));
			return;
		}
		const controller = new AbortController();
		const completion = run(context, controller.signal, output);
		activeGeneration = { controller, completion };
		try { await completion; }
		finally { activeGeneration = undefined; }
	}));
}

export async function stopGchGeneration(): Promise<void> {
	activeGeneration?.controller.abort();
	await activeGeneration?.completion;
}

async function run(context: vscode.ExtensionContext, signal: AbortSignal, output: vscode.OutputChannel): Promise<void> {
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			// allow-any-unicode-next-line
			title: selectDisplayText('Generating gch cache. Do not close BeCoder.', '正在生成 gch 缓存，请勿关闭 BeCoder。'),
			cancellable: false
		}, async () => {
			const runner = vscode.extensions.getExtension('becoder.runner');
			if (!runner) { throw new Error('The BeCoder Runner extension is unavailable.'); }
			await runner.activate();
			const root = getBeCoderToolchainRoot(context);
			const headerDirectory = path.join(root, 'ucrt64', 'include', 'c++', '16.2.0', 'x86_64-w64-mingw32', 'bits');
			await generateGchCache(root, {
				headerDirectory,
				signal,
				onPhase: phase => output.appendLine(`gch: ${phase}`),
				prepare: async (temporaryOutput, probeSource, privateRoot) => {
					const plan = await vscode.commands.executeCommand<GenerationPlan>('_becoder.runner.gchGenerationPlan', temporaryOutput, probeSource, privateRoot);
					if (!plan) { throw new Error('The BeCoder C++ compilation plan is unavailable.'); }
					for (const name of ['TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
						const directory = plan.environment[name];
						if (directory) { await fs.promises.mkdir(directory, { recursive: true }); }
					}
					output.appendLine(JSON.stringify({ compiler: plan.compiler, args: plan.buildArgs }));
					return plan;
				}
			});
		});
		// allow-any-unicode-next-line
		void vscode.window.showInformationMessage(selectDisplayText('The gch cache was generated and GCC confirmed it is in use.', 'gch 缓存生成成功，已验证编译器命中。'));
	} catch (error) {
		if (signal.aborted) { return; }
		const detail = error instanceof Error ? error.message : String(error);
		output.appendLine(detail);
		if (error instanceof GchGenerationBusyError) {
			// allow-any-unicode-next-line
			void vscode.window.showInformationMessage(selectDisplayText('Another BeCoder window is generating the gch cache.', '另一个 BeCoder 窗口正在生成 gch 缓存。'));
			return;
		}
		// allow-any-unicode-next-line
		const showOutput = selectDisplayText('Show Output', '查看输出');
		void vscode.window.showErrorMessage(
			// allow-any-unicode-next-line
			selectDisplayText(`Failed to generate gch cache: ${detail}`, `gch 缓存生成失败：${detail}`), showOutput).then(action => {
			if (action === showOutput) { output.show(true); }
		});
	}
}
