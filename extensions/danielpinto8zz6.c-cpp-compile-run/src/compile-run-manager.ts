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
import { RunnerLifecycle, RunnerPhase } from './runnerLifecycle';
import { finalizePublishedExecutable, RunnerExecutionResult, RunnerExecutor } from './runnerProcess';
import { presentRunnerResult } from './runnerPresentation';

const runnerName = 'BeCoder Runner';

type ActiveRequest = {
	cancelled: boolean;
	exitCode?: number;
	readonly pseudoterminal: BcTerminal;
};

class RunnerCancellationError extends Error { }

export class CompileRunManager implements vscode.Disposable {
	private readonly history = new CommandHistory();
	private readonly lifecycle = new RunnerLifecycle();
	private readonly executor: RunnerExecutor;
	private readonly trace = vscode.window.createOutputChannel('BeCoder Runner Trace', { log: true });
	private readonly terminalOpenListener: vscode.Disposable;
	private readonly terminalCloseListener: vscode.Disposable;
	private readonly activeTerminalListener: vscode.Disposable;
	private readonly pendingPseudoterminals = new Set<BcTerminal>();
	private readonly terminals = new Map<BcTerminal, vscode.Terminal>();
	private terminal: vscode.Terminal | undefined;
	private pseudoterminal: BcTerminal | undefined;
	private activeRequest: ActiveRequest | undefined;
	private disposed = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.executor = new RunnerExecutor(context.globalStorageUri.fsPath);
		this.terminalOpenListener = vscode.window.onDidOpenTerminal(terminal => {
			const creationOptions = terminal.creationOptions;
			if (!Object.prototype.hasOwnProperty.call(creationOptions, 'pty')) {
				return;
			}
			const pseudoterminal = (creationOptions as { pty?: unknown }).pty;
			if (!(pseudoterminal instanceof BcTerminal) || !this.pendingPseudoterminals.delete(pseudoterminal)) {
				return;
			}
			this.trackTerminal(terminal, pseudoterminal);
		});
		this.terminalCloseListener = vscode.window.onDidCloseTerminal(terminal => {
			const pseudoterminal = this.findPseudoterminal(terminal);
			if (pseudoterminal) {
				this.handleTerminalClosed(terminal, pseudoterminal);
			}
		});
		this.activeTerminalListener = vscode.window.onDidChangeActiveTerminal(terminal => {
			if (!terminal) {
				return;
			}
			const pseudoterminal = this.findPseudoterminal(terminal);
			if (pseudoterminal) {
				this.selectTerminal(terminal, pseudoterminal);
			}
		});
	}

	provideTerminalProfile(): vscode.TerminalProfile {
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			?? (vscode.window.activeTextEditor ? path.dirname(vscode.window.activeTextEditor.document.fileName) : process.cwd());
		const pseudoterminal = this.createPseudoterminal(cwd);
		this.pendingPseudoterminals.add(pseudoterminal);
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
		const initialDirectory = vscode.window.activeTextEditor
			? path.dirname(vscode.window.activeTextEditor.document.fileName)
			: process.cwd();
		const { terminal, pseudoterminal } = this.ensureTerminal(getInitialCwd(initialDirectory));
		const request = this.beginRequest(pseudoterminal);
		if (!request) {
			return;
		}
		try {
			const panelStartedAt = Date.now();
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
			this.handleRequestError(error, request, pseudoterminal);
		} finally {
			this.finishRequest(request);
		}
	}

	private async submitTypedCommand(text: string, pseudoterminal: BcTerminal): Promise<void> {
		if (!this.terminals.has(pseudoterminal) || this.disposed) {
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
		const request = this.beginRequest(pseudoterminal);
		if (!request) {
			pseudoterminal.finishCommand(1);
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
		pseudoterminal.setPtyInput(true);
		const result = await this.executor.execute({
			source: prepared.source,
			compilerPath,
			settings: runnerSettings(),
			inputPath,
			ptyDimensions: pseudoterminal.programDimensions,
			inputHelperPath: command.withInput ? path.join(this.context.extensionPath, 'dist', 'runner-input.exe') : undefined,
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
					const { cols, rows } = pseudoterminal.programDimensions;
					this.executor.resizeProgram(cols, rows);
					pseudoterminal.writeStatus('Compilation Successful, Running', 'success');
				}
			}
		});
		if (result.status === 'cancelled' || request.cancelled || request.pseudoterminal !== pseudoterminal || !this.terminals.has(pseudoterminal) || this.disposed) {
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

	private beginRequest(pseudoterminal: BcTerminal): ActiveRequest | undefined {
		if (!this.lifecycle.begin()) {
			this.rejectBusy();
			return undefined;
		}
		const request = { cancelled: false, pseudoterminal };
		this.activeRequest = request;
		pseudoterminal.setPhase('preparing');
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
		this.lifecycle.finish();
		this.activeRequest = undefined;
		if (!this.disposed && this.terminals.has(request.pseudoterminal)) {
			request.pseudoterminal.setPhase('ready');
			request.pseudoterminal.setProgramInputEnabled(true);
			request.pseudoterminal.finishCommand(request.exitCode);
		}
	}

	private async cancelActive(pseudoterminal?: BcTerminal): Promise<void> {
		if (!this.lifecycle.busy || this.lifecycle.phase === 'cancelling') {
			return;
		}
		const request = this.activeRequest;
		if (!request) {
			return;
		}
		if (pseudoterminal && pseudoterminal !== request.pseudoterminal) {
			this.rejectBusy();
			return;
		}
		request.cancelled = true;
		request.exitCode = 1;
		this.lifecycle.setPhase('cancelling');
		request.pseudoterminal.setPhase('cancelling');
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
		this.trackTerminal(terminal, pseudoterminal);
		return { terminal, pseudoterminal };
	}

	private createPseudoterminal(cwd: string): BcTerminal {
		const pseudoterminal: BcTerminal = new BcTerminal(cwd, this.history, {
			phase: (): RunnerPhase => this.phaseFor(pseudoterminal),
			submit: command => void this.submitTypedCommand(command, pseudoterminal),
			cancel: () => void this.cancelActive(pseudoterminal),
			programInput: text => this.writeProgramInput(pseudoterminal, text),
			terminalResponse: text => {
				if (this.activeRequest?.pseudoterminal === pseudoterminal) {
					this.executor.writeProgramInput(text);
				}
			},
			resize: (cols, rows) => {
				if (this.activeRequest?.pseudoterminal === pseudoterminal) {
					this.executor.resizeProgram(cols, rows);
				}
			},
			busyAttempt: () => this.rejectBusy(),
			close: () => this.handlePseudoterminalClosed(pseudoterminal)
		});
		return pseudoterminal;
	}

	private phaseFor(pseudoterminal: BcTerminal): RunnerPhase {
		if (this.activeRequest?.pseudoterminal === pseudoterminal) {
			return this.lifecycle.phase;
		}
		return 'ready';
	}

	private writeProgramInput(pseudoterminal: BcTerminal, text: string): boolean {
		return this.activeRequest?.pseudoterminal === pseudoterminal
			&& this.lifecycle.phase === 'running'
			&& this.executor.writeProgramInput(text);
	}

	private trackTerminal(terminal: vscode.Terminal, pseudoterminal: BcTerminal): void {
		this.terminals.set(pseudoterminal, terminal);
		this.selectTerminal(terminal, pseudoterminal);
	}

	private selectTerminal(terminal: vscode.Terminal, pseudoterminal: BcTerminal): void {
		this.terminal = terminal;
		this.pseudoterminal = pseudoterminal;
	}

	private findPseudoterminal(terminal: vscode.Terminal): BcTerminal | undefined {
		for (const [pseudoterminal, candidate] of this.terminals) {
			if (candidate === terminal) {
				return pseudoterminal;
			}
		}
		return undefined;
	}

	private handleTerminalClosed(terminal: vscode.Terminal, pseudoterminal: BcTerminal): void {
		this.releaseTerminal(terminal, pseudoterminal);
	}

	private handlePseudoterminalClosed(pseudoterminal: BcTerminal): void {
		this.pendingPseudoterminals.delete(pseudoterminal);
		const terminal = this.terminals.get(pseudoterminal);
		if (terminal) {
			this.releaseTerminal(terminal, pseudoterminal);
		}
	}

	private releaseTerminal(terminal: vscode.Terminal, pseudoterminal: BcTerminal): void {
		if (!this.terminals.delete(pseudoterminal)) {
			return;
		}
		if (this.activeRequest?.pseudoterminal === pseudoterminal) {
			void this.cancelActive();
		}
		if (this.terminal !== terminal && this.pseudoterminal !== pseudoterminal) {
			return;
		}
		this.terminal = undefined;
		this.pseudoterminal = undefined;
		for (const [candidatePseudoterminal, candidateTerminal] of this.terminals) {
			if (!candidateTerminal.exitStatus) {
				this.selectTerminal(candidateTerminal, candidatePseudoterminal);
			}
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
		this.activeTerminalListener.dispose();
		void this.executor.cancel();
		const terminals = [...this.terminals.values()];
		this.pendingPseudoterminals.clear();
		this.terminals.clear();
		this.terminal = undefined;
		this.pseudoterminal = undefined;
		for (const terminal of terminals) {
			if (!terminal.exitStatus) {
				terminal.dispose();
			}
		}
		this.trace.dispose();
	}
}

function getInitialCwd(sourceDirectory: string): string {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? sourceDirectory;
}
