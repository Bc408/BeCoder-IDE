/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { BcLineEditor, CommandHistory, LineEditorAction } from './bcLineEditor';
import { RunnerPhase } from './runnerLifecycle';
import { ProgramInputAction, ProgramInputEditor, TerminalOpenTracker } from './terminalInput';
import { terminalCellWidth } from './terminalText';
import { osc633CommandExecuted, osc633CommandFinished, osc633CommandStart, osc633PromptStart, renderBcCommand, renderBcPrompt, renderBcStatus } from './terminalVisuals';

export type BcTerminalCallbacks = {
	readonly phase: () => RunnerPhase;
	readonly submit: (command: string) => void;
	readonly cancel: () => void;
	readonly programInput: (text: string) => boolean;
	readonly busyAttempt: () => void;
	readonly close: () => void;
};

export class BcTerminal implements vscode.Pseudoterminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	readonly onDidWrite = this.writeEmitter.event;
	private readonly lineEditor: BcLineEditor;
	private opened = false;
	private pendingOutput = '';
	private promptVisible = false;
	private busyNoticeShown = false;
	private readonly programInputEditor = new ProgramInputEditor();
	private outputEndsOnLineBoundary = true;
	private closed = false;
	private programInputEnabled = true;
	private suppressLeadingLineFeed = false;
	private readonly openTracker = new TerminalOpenTracker();
	private escapeFlushTimer: ReturnType<typeof setTimeout> | undefined;
	private commandActive = false;

	constructor(
		readonly cwd: string,
		history: CommandHistory,
		private readonly callbacks: BcTerminalCallbacks
	) {
		this.lineEditor = new BcLineEditor(history);
	}

	open(): void {
		if (this.closed) {
			return;
		}
		this.opened = true;
		this.openTracker.open(Date.now());
		if (this.pendingOutput) {
			this.writeEmitter.fire(this.pendingOutput);
			this.pendingOutput = '';
		}
		if (!this.promptVisible && this.callbacks.phase() === 'ready') {
			this.showPrompt();
		}
	}

	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.opened = false;
		this.clearEscapeFlush();
		this.openTracker.close();
		this.callbacks.close();
		this.writeEmitter.dispose();
	}

	handleInput(data: string): void {
		this.clearEscapeFlush();
		if (this.suppressLeadingLineFeed) {
			this.suppressLeadingLineFeed = false;
			if (data.startsWith('\n')) {
				data = data.slice(1);
			}
			if (!data) {
				return;
			}
		}
		const phase = this.callbacks.phase();
		if (phase === 'ready') {
			if (this.applyLineEditorActions(this.lineEditor.handleInput(data), data.endsWith('\r'))) {
				return;
			}
			if (this.lineEditor.hasPendingEscape) {
				this.scheduleEscapeFlush('command');
			}
			return;
		}
		if (phase === 'running') {
			if (this.programInputEnabled) {
				this.handleProgramInput(data);
			} else if (data.includes('\x03')) {
				this.callbacks.cancel();
			} else if (!this.busyNoticeShown && hasUserInput(data)) {
				this.busyNoticeShown = true;
				this.callbacks.busyAttempt();
			}
			return;
		}
		if (data.includes('\x03')) {
			this.callbacks.cancel();
			return;
		}
		if (!this.busyNoticeShown && hasUserInput(data)) {
			this.busyNoticeShown = true;
			this.callbacks.busyAttempt();
		}
	}

	setPhase(phase: RunnerPhase): void {
		this.clearEscapeFlush();
		this.busyNoticeShown = false;
		if (phase !== 'running') {
			this.programInputEditor.reset();
		}
	}

	setProgramInputEnabled(enabled: boolean): void {
		this.programInputEnabled = enabled;
		if (!enabled) {
			this.programInputEditor.reset();
		}
	}

	waitForOpen(startedAt: number): Promise<number | undefined> {
		return this.openTracker.wait(startedAt);
	}

	echoCommand(command: string): void {
		this.clearEscapeFlush();
		this.lineEditor.reset();
		if (this.promptVisible) {
			this.writeRaw(`\r\x1b[2K${this.promptText}${renderBcCommand(command)}\r\n`);
		} else {
			this.writeRaw(`${osc633PromptStart()}${this.promptText}${osc633CommandStart()}${renderBcCommand(command)}\r\n`);
		}
		this.promptVisible = false;
		this.outputEndsOnLineBoundary = true;
		this.beginCommand(command);
	}

	writeProcessOutput(text: string): void {
		if (!text) {
			return;
		}
		this.writeRaw(text);
		this.outputEndsOnLineBoundary = /(?:\r\n|\n|\r)$/.test(text);
	}

	writeError(message: string): void {
		this.ensureLineBoundary();
		this.writeRaw(`${renderBcStatus(message, 'error')}\r\n`);
		this.outputEndsOnLineBoundary = true;
	}

	writeStatus(message: string, kind: 'success' | 'error'): void {
		this.ensureLineBoundary();
		this.writeRaw(`${renderBcStatus(message, kind)}\r\n`);
		this.outputEndsOnLineBoundary = true;
	}

	writeHelp(): void {
		this.writeRaw([
			'run <source>',
			'run <source> -WithInput',
			'clear',
			'help',
			''
		].join('\r\n'));
		this.outputEndsOnLineBoundary = true;
	}

	clearScreen(): void {
		this.writeRaw('\x1b[2J\x1b[H');
		this.promptVisible = false;
		this.outputEndsOnLineBoundary = true;
	}

	finishCommand(exitCode?: number): void {
		this.clearEscapeFlush();
		this.ensureLineBoundary();
		if (this.commandActive) {
			this.writeRaw(osc633CommandFinished(exitCode));
			this.commandActive = false;
		}
		this.lineEditor.reset();
		this.showPrompt();
	}

	private get promptText(): string {
		return renderBcPrompt(this.cwd);
	}

	private showPrompt(): void {
		this.writeRaw(`${osc633PromptStart()}${this.promptText}${osc633CommandStart()}`);
		this.promptVisible = true;
		this.outputEndsOnLineBoundary = false;
	}

	private redrawPrompt(): void {
		const text = this.lineEditor.text;
		this.writeRaw(`\r\x1b[2K${this.promptText}${renderBcCommand(text)}`);
		const tailWidth = terminalCellWidth(text.slice(this.lineEditor.cursorColumn));
		if (tailWidth > 0) {
			this.writeRaw(`\x1b[${tailWidth}D`);
		}
		this.promptVisible = true;
		this.outputEndsOnLineBoundary = false;
	}

	private handleProgramInput(data: string): void {
		if (this.applyProgramInputActions(this.programInputEditor.handleInput(data))) {
			return;
		}
		if (this.programInputEditor.hasPendingEscape) {
			this.scheduleEscapeFlush('program');
		}
	}

	private applyLineEditorActions(actions: readonly LineEditorAction[], endsWithCarriageReturn: boolean): boolean {
		for (const action of actions) {
			switch (action.kind) {
				case 'redraw':
					this.redrawPrompt();
					break;
				case 'submit':
					this.writeRaw('\r\n');
					this.promptVisible = false;
					this.outputEndsOnLineBoundary = true;
					this.suppressLeadingLineFeed = endsWithCarriageReturn;
					this.beginCommand(action.value);
					this.callbacks.submit(action.value);
					return true;
				case 'interrupt':
					this.writeRaw('^C\r\n');
					this.promptVisible = false;
					this.writeRaw(osc633CommandFinished());
					this.showPrompt();
					return true;
			}
		}
		return false;
	}

	private applyProgramInputActions(actions: readonly ProgramInputAction[]): boolean {
		for (const action of actions) {
			switch (action.kind) {
				case 'interrupt':
					this.callbacks.cancel();
					return true;
				case 'submit':
					this.writeRaw('\r\n');
					this.callbacks.programInput(action.value);
					this.outputEndsOnLineBoundary = true;
					break;
				case 'erase':
					this.writeRaw('\b \b'.repeat(action.width));
					break;
				case 'echo':
					this.writeRaw(action.value);
					this.outputEndsOnLineBoundary = false;
					break;
			}
		}
		return false;
	}

	private scheduleEscapeFlush(mode: 'command' | 'program'): void {
		this.escapeFlushTimer = setTimeout(() => {
			this.escapeFlushTimer = undefined;
			if (this.closed) {
				return;
			}
			if (mode === 'command' && this.callbacks.phase() === 'ready') {
				this.applyLineEditorActions(this.lineEditor.flushPendingEscape(), false);
			} else if (mode === 'program' && this.callbacks.phase() === 'running' && this.programInputEnabled) {
				this.applyProgramInputActions(this.programInputEditor.flushPendingEscape());
			}
		}, 25);
	}

	private clearEscapeFlush(): void {
		if (this.escapeFlushTimer) {
			clearTimeout(this.escapeFlushTimer);
			this.escapeFlushTimer = undefined;
		}
	}

	private ensureLineBoundary(): void {
		if (!this.outputEndsOnLineBoundary) {
			this.writeRaw('\r\n');
			this.outputEndsOnLineBoundary = true;
		}
	}

	private beginCommand(command: string): void {
		this.writeRaw(osc633CommandExecuted(command));
		this.commandActive = true;
	}

	private writeRaw(text: string): void {
		if (this.closed) {
			return;
		}
		if (this.opened) {
			this.writeEmitter.fire(text);
		} else {
			this.pendingOutput += text;
		}
	}
}

function hasUserInput(data: string): boolean {
	return Array.from(data).some(character => character >= ' ' || character === '\r' || character === '\n');
}
