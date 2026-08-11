/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';

import { BcCommand, formatRunCommand, parseBcCommand, resolveCommandSource } from './bcCommand';
import { CommandHistory } from './bcLineEditor';
import { BcTerminal } from './bcTerminal';
import { BeCoderSource, PreparedSource, RunnerRequestError, bundledCompiler, exactInputPath, prepareActiveSource, prepareCommandSource, runnerSettings } from './compiler';
import { RunnerLifecycle } from './runnerLifecycle';
import { finalizePublishedExecutable, RunnerExecutionResult, RunnerExecutor } from './runnerProcess';
import { presentRunnerResult } from './runnerPresentation';

const runnerName = 'BeCoder Runner';

type ActiveRequest = {
	cancelled: boolean;
	exitCode?: number;
};

class RunnerCancellationError extends Error { }

export class CompileRunManager implements vscode.Disposable {
	private readonly history = new CommandHistory();
	private readonly lifecycle = new RunnerLifecycle();
	private readonly executor: RunnerExecutor;
	private readonly trace = vscode.window.createOutputChannel('BeCoder Runner Trace', { log: true });
	private readonly terminalOpenListener: vscode.Disposable;
	private readonly terminalCloseListener: vscode.Disposable;
	private terminal: vscode.Terminal | undefined;
	private pseudoterminal: BcTerminal | undefined;
	private pendingPseudoterminal: BcTerminal | undefined;
	private activeRequest: ActiveRequest | undefined;
	private disposed = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.executor = new RunnerExecutor(context.globalStorageUri.fsPath);
		this.terminalOpenListener = vscode.window.onDidOpenTerminal(terminal => {
			const creationOptions = terminal.creationOptions;
			if (!('pty' in creationOptions) || creationOptions.pty !== this.pendingPseudoterminal) {
				return;
			}
			const previousTerminal = this.terminal;
			this.terminal = terminal;
			this.pseudoterminal = this.pendingPseudoterminal;
			this.pendingPseudoterminal = undefined;
			if (previousTerminal && previousTerminal !== terminal && !previousTerminal.exitStatus) {
				previousTerminal.dispose();
			}
		});
		this.terminalCloseListener = vscode.window.onDidCloseTerminal(terminal => {
			if (terminal === this.terminal) {
				this.handleTerminalClosed(terminal);
			}
		});
	}

	provideTerminalProfile(): vscode.TerminalProfile {
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			?? (vscode.window.activeTextEditor ? path.dirname(vscode.window.activeTextEditor.document.fileName) : process.cwd());
		const pseudoterminal = this.createPseudoterminal(cwd);
		this.pendingPseudoterminal = pseudoterminal;
		return new vscode.TerminalProfile({
			name: runnerName,
			pty: pseudoterminal,
			iconPath: new vscode.ThemeIcon('terminal'),
			isTransient: true
		});
	}

	async openPanel(): Promise<void> {
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			?? (vscode.window.activeTextEditor ? path.dirname(vscode.window.activeTextEditor.document.fileName) : process.cwd());
		const { terminal } = this.ensureTerminal(cwd);
		terminal.show(false);
	}

	async run(withInput: boolean): Promise<void> {
		const requestStartedAt = Date.now();
		const request = this.beginRequest();
		if (!request) {
			return;
		}
		let requestTerminal = this.pseudoterminal;
		try {
			const panelStartedAt = Date.now();
			const initialDirectory = vscode.window.activeTextEditor
				? path.dirname(vscode.window.activeTextEditor.document.fileName)
				: process.cwd();
			const { terminal, pseudoterminal } = this.ensureTerminal(getInitialCwd(initialDirectory));
			requestTerminal = pseudoterminal;
			terminal.show(false);
			const prepared = await prepareActiveSource();
			const panelReadyMs = await pseudoterminal.waitForOpen(panelStartedAt);
			this.throwIfCancelled(request);
			if (panelReadyMs === undefined) {
				throw new RunnerRequestError(
					'BeCoder Runner panel was closed before the request started.',
					vscode.l10n.t('BeCoder Runner panel was closed before the request started.')
				);
			}
			const commandText = formatRunCommand(prepared.source.path, pseudoterminal.cwd, withInput);
			const parsed = parseBcCommand(commandText);
			if (parsed.kind !== 'command' || parsed.command.kind !== 'run') {
				throw new Error('BeCoder generated an invalid internal Run command.');
			}
			pseudoterminal.echoCommand(commandText);
			await this.executeRun(commandText, parsed.command, prepared, requestStartedAt, panelReadyMs, pseudoterminal, request);
		} catch (error) {
			this.handleRequestError(error, request, requestTerminal);
		} finally {
			this.finishRequest(request);
		}
	}

	private async submitTypedCommand(text: string, pseudoterminal: BcTerminal): Promise<void> {
		if (pseudoterminal !== this.pseudoterminal || this.disposed) {
			return;
		}
		const parsed = parseBcCommand(text);
		if (parsed.kind === 'empty') {
			pseudoterminal.finishCommand();
			return;
		}
		if (parsed.kind === 'error') {
			this.rejectUnsupportedCommand(pseudoterminal);
			return;
		}
		if (parsed.command.kind === 'clear') {
			this.history.record(text.trim());
			pseudoterminal.clearScreen();
			pseudoterminal.finishCommand(0);
			return;
		}
		if (parsed.command.kind === 'help') {
			this.history.record(text.trim());
			pseudoterminal.writeHelp();
			pseudoterminal.finishCommand(0);
			return;
		}
		const request = this.beginRequest();
		if (!request) {
			return;
		}
		const requestStartedAt = Date.now();
		try {
			const sourcePath = resolveCommandSource(parsed.command.source, pseudoterminal.cwd);
			const prepared = await prepareCommandSource(sourcePath);
			this.throwIfCancelled(request);
			await this.executeRun(text.trim(), parsed.command, prepared, requestStartedAt, 0, pseudoterminal, request);
		} catch (error) {
			this.handleRequestError(error, request, pseudoterminal);
		} finally {
			this.finishRequest(request);
		}
	}

	private async executeRun(
		commandText: string,
		command: Extract<BcCommand, { kind: 'run' }>,
		prepared: PreparedSource,
		requestStartedAt: number,
		panelReadyMs: number,
		pseudoterminal: BcTerminal,
		request: ActiveRequest
	): Promise<void> {
		const inputPath = command.withInput ? await exactInputPath(prepared.source) : undefined;
		this.throwIfCancelled(request);
		const compilerPath = bundledCompiler(this.context, prepared.source.language);
		this.history.record(commandText);
		pseudoterminal.setProgramInputEnabled(!command.withInput);
		const result = await this.executor.execute({
			source: prepared.source,
			compilerPath,
			settings: runnerSettings(),
			inputPath,
			requestStartedAt,
			panelReadyMs,
			saveMs: prepared.saveMs
		}, {
			write: text => pseudoterminal.writeProcessOutput(text),
			setPhase: phase => {
				if (!this.lifecycle.setPhase(phase)) {
					return;
				}
				pseudoterminal.setPhase(phase);
				if (phase === 'running') {
					pseudoterminal.writeStatus('Compilation Successful, Running', 'success');
				}
			}
		});
		if (result.status === 'cancelled' || request.cancelled || pseudoterminal !== this.pseudoterminal || this.disposed) {
			this.traceResult(prepared.source, command.withInput, result);
			return;
		}
		let finalResult = result;
		const presented = pseudoterminal.performWhileOpen(() => {
			finalResult = finalizePublishedExecutable(result, prepared.source.executablePath);
			const presentation = presentRunnerResult(finalResult);
			request.exitCode = presentation.exitCode;
			switch (presentation.outcome) {
				case 'run-complete':
					pseudoterminal.writeStatus('Run Complete', 'success');
					break;
				case 'runtime-error':
					pseudoterminal.writeStatus(`Runtime Error (exit code ${request.exitCode ?? 1})`, 'error');
					break;
				case 'runner-error': {
					const protocolMessage = finalResult.message ?? 'BeCoder Runner could not start the command.';
					const localizedMessage = finalResult.message ?? vscode.l10n.t('BeCoder Runner could not start the command.');
					pseudoterminal.writeError(protocolMessage);
					void vscode.window.showErrorMessage(localizedMessage);
					break;
				}
				case undefined:
					break;
			}
			if (presentation.flowFailure) {
				pseudoterminal.writeFlowFailure(presentation.flowFailure.title, presentation.flowFailure.description);
			}
			if (presentation.showExecutableRemoved) {
				pseudoterminal.writeStatus('Executable Program Removed', 'success');
			}
		});
		if (!presented) {
			this.traceResult(prepared.source, command.withInput, result);
			return;
		}
		this.traceResult(prepared.source, command.withInput, finalResult);
	}

	private beginRequest(): ActiveRequest | undefined {
		if (!this.lifecycle.begin()) {
			this.rejectBusy();
			return undefined;
		}
		const request = { cancelled: false };
		this.activeRequest = request;
		this.pseudoterminal?.setPhase('preparing');
		return request;
	}

	private throwIfCancelled(request: ActiveRequest): void {
		if (request.cancelled || request !== this.activeRequest) {
			throw new RunnerCancellationError();
		}
	}

	private handleRequestError(error: unknown, request: ActiveRequest, pseudoterminal: BcTerminal | undefined): void {
		if (request.cancelled || error instanceof RunnerCancellationError) {
			return;
		}
		const protocolMessage = error instanceof Error ? error.message : String(error);
		const localizedMessage = error instanceof RunnerRequestError ? error.localizedMessage : protocolMessage;
		request.exitCode = 1;
		pseudoterminal?.writeError(protocolMessage);
		void vscode.window.showErrorMessage(localizedMessage);
	}

	private finishRequest(request: ActiveRequest): void {
		if (request !== this.activeRequest) {
			return;
		}
		this.activeRequest = undefined;
		this.lifecycle.finish();
		if (!this.disposed) {
			this.pseudoterminal?.setPhase('ready');
			this.pseudoterminal?.setProgramInputEnabled(true);
			this.pseudoterminal?.finishCommand(request.exitCode);
		}
	}

	private async cancelActive(): Promise<void> {
		if (!this.lifecycle.busy || this.lifecycle.phase === 'cancelling') {
			return;
		}
		const request = this.activeRequest;
		if (!request) {
			return;
		}
		request.cancelled = true;
		request.exitCode = 1;
		this.lifecycle.setPhase('cancelling');
		this.pseudoterminal?.setPhase('cancelling');
		await this.executor.cancel();
	}

	private ensureTerminal(cwd: string): { terminal: vscode.Terminal; pseudoterminal: BcTerminal } {
		if (this.terminal && !this.terminal.exitStatus && this.pseudoterminal) {
			return { terminal: this.terminal, pseudoterminal: this.pseudoterminal };
		}
		const pseudoterminal = this.createPseudoterminal(cwd);
		const terminal = vscode.window.createTerminal({
			name: runnerName,
			pty: pseudoterminal,
			iconPath: new vscode.ThemeIcon('terminal'),
			isTransient: true
		});
		this.pseudoterminal = pseudoterminal;
		this.terminal = terminal;
		return { terminal, pseudoterminal };
	}

	private createPseudoterminal(cwd: string): BcTerminal {
		let pseudoterminal: BcTerminal;
		pseudoterminal = new BcTerminal(cwd, this.history, {
			phase: () => this.lifecycle.phase,
			submit: command => void this.submitTypedCommand(command, pseudoterminal),
			cancel: () => void this.cancelActive(),
			programInput: text => this.executor.writeProgramInput(text),
			busyAttempt: () => this.rejectBusy(),
			close: () => this.handlePseudoterminalClosed(pseudoterminal)
		});
		return pseudoterminal;
	}

	private handleTerminalClosed(terminal: vscode.Terminal): void {
		if (terminal !== this.terminal) {
			return;
		}
		this.terminal = undefined;
		this.pseudoterminal = undefined;
		if (this.lifecycle.busy) {
			void this.cancelActive();
		}
	}

	private handlePseudoterminalClosed(pseudoterminal: BcTerminal): void {
		if (pseudoterminal === this.pendingPseudoterminal) {
			this.pendingPseudoterminal = undefined;
		}
		if (pseudoterminal !== this.pseudoterminal) {
			return;
		}
		this.pseudoterminal = undefined;
		this.terminal = undefined;
		if (this.lifecycle.busy) {
			void this.cancelActive();
		}
	}

	private rejectUnsupportedCommand(pseudoterminal: BcTerminal): void {
		const protocolMessage = 'BC accepts only run <source>, run <source> -WithInput, clear, and help. Use native PowerShell for system commands.';
		const localizedMessage = vscode.l10n.t(protocolMessage);
		pseudoterminal.writeError(protocolMessage);
		pseudoterminal.finishCommand(1);
		void vscode.window.showWarningMessage(localizedMessage);
	}

	private rejectBusy(): void {
		const message = vscode.l10n.t('BeCoder Runner is busy. Cancel the active request or wait for it to finish.');
		void vscode.window.showWarningMessage(message);
	}

	private traceResult(source: BeCoderSource, withInput: boolean, result: RunnerExecutionResult): void {
		this.trace.appendLine(JSON.stringify({
			source: source.path,
			withInput,
			status: result.status,
			exitCode: result.exitCode,
			publishedExecutable: result.publishedExecutable,
			executableRemoved: result.executableRemoved,
			cleanupFailed: result.cleanupFailed,
			targetExceeded: typeof result.timings.compileToRunStartMs === 'number' && result.timings.compileToRunStartMs > 2000,
			...result.timings
		}));
	}

	dispose(): void {
		this.disposed = true;
		if (this.activeRequest) {
			this.activeRequest.cancelled = true;
		}
		this.terminalOpenListener.dispose();
		this.terminalCloseListener.dispose();
		void this.executor.cancel();
		this.terminal?.dispose();
		this.terminal = undefined;
		this.pseudoterminal = undefined;
		this.trace.dispose();
	}
}

function getInitialCwd(sourceDirectory: string): string {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? sourceDirectory;
}
