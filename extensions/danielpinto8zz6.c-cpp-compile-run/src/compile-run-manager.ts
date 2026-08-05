import * as path from 'path';
import * as vscode from 'vscode';
import { BeCoderSource, RunnerMode, getActiveSource, runnerCommandPath, runnerStatePath, writeRunnerRequest } from './compiler';

const RUNNER_NAME = 'BeCoder Runner';
const RUNNER_ID = 'becoder-runner-stage-2.3';

export class CompileRunManager implements vscode.Disposable {
	private terminal: vscode.Terminal | undefined;
	private terminalCwd: string | undefined;
	private readonly terminalListener: vscode.Disposable;
	private operation: Promise<void> = Promise.resolve();

	constructor(private readonly context: vscode.ExtensionContext) {
		this.terminalListener = vscode.window.onDidCloseTerminal(terminal => {
			if (terminal === this.terminal) {
				this.terminal = undefined;
				this.terminalCwd = undefined;
			}
		});
	}

	public async compile(): Promise<void> {
		const source = await getActiveSource();
		if (source) {
			await this.enqueue(source, 'compile');
		}
	}

	public async run(): Promise<void> {
		const source = await getActiveSource();
		if (source) {
			await this.enqueue(source, 'run');
		}
	}

	public async runWithFile(): Promise<void> {
		const source = await getActiveSource();
		if (!source) {
			return;
		}
		const inputPath = await findInputFile(source);
		if (inputPath) {
			await this.enqueue(source, 'runWithInput', inputPath);
		}
	}

	private enqueue(source: BeCoderSource, mode: RunnerMode, inputPath?: string): Promise<void> {
		const next = this.operation.then(() => this.execute(source, mode, inputPath));
		this.operation = next.catch((): void => { /* Keep the queue usable after a failed run. */ });
		return next;
	}

	private async execute(source: BeCoderSource, mode: RunnerMode, inputPath?: string): Promise<void> {
		const terminal = await this.ensureTerminal(source.directory);
		if (!terminal) {
			return;
		}
		const resultPath = await writeRunnerRequest(this.context, source, mode, inputPath);
		terminal.show(true);
		await waitForTerminalStartup(terminal);
		const command = buildRunCommand(source.path, this.getTerminalCwd(terminal, source.directory), mode);
		if (terminal.shellIntegration) {
			await executeTerminalCommandAndWait(terminal, command);
		} else {
			executeTerminalCommand(terminal, command);
			await waitForRunnerResult(resultPath);
		}
	}

	private async ensureTerminal(sourceDirectory: string): Promise<vscode.Terminal | undefined> {
		if (this.terminal && !this.terminal.exitStatus) {
			return this.terminal;
		}
		const statePath = runnerStatePath(this.context);
		const existing = vscode.window.terminals.find(candidate => isBeCoderRunner(candidate, statePath));
		if (existing && !existing.exitStatus) {
			this.terminal = existing;
			this.terminalCwd = getCreationCwd(existing) ?? this.terminalCwd;
			return existing;
		}
		if (process.platform !== 'win32') {
			void vscode.window.showErrorMessage('BeCoder Runner currently supports Windows only.');
			return undefined;
		}
		const cwd = getInitialRunnerCwd(sourceDirectory);
		const terminal = vscode.window.createTerminal({
			name: RUNNER_NAME,
			shellPath: getPowerShellPath(),
			shellArgs: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '& $env:BECODER_RUNNER_INIT_PATH'],
			cwd,
			env: createRunnerEnvironment(this.context),
			strictEnv: true,
		});
		this.terminal = terminal;
		this.terminalCwd = cwd;
		return terminal;
	}

	private getTerminalCwd(terminal: vscode.Terminal, fallback: string): string {
		const shellCwd = terminal.shellIntegration?.cwd?.fsPath;
		return shellCwd ?? this.terminalCwd ?? fallback;
	}

	public dispose(): void {
		this.terminalListener.dispose();
		this.terminal = undefined;
		this.terminalCwd = undefined;
	}
}

async function findInputFile(source: BeCoderSource): Promise<string | undefined> {
	let entries: readonly [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(source.directory));
	} catch {
		void vscode.window.showWarningMessage(`Unable to inspect the source directory for an input file: ${source.directory}.`);
		return undefined;
	}
	const inputCandidates = entries
		.filter(([name]) => /^(?:input(?:\..*)?|main\.in|in)$/i.test(name))
		.map(([name, type]) => ({ name, type }));
	const exactInput = inputCandidates.filter(candidate => candidate.name.toLowerCase() === 'input' && candidate.type === vscode.FileType.File);
	if (inputCandidates.length === 1 && exactInput.length === 1) {
		return path.join(source.directory, exactInput[0].name);
	}
	if (inputCandidates.length === 0) {
		void vscode.window.showWarningMessage(`No input file named "input" was found beside ${source.name}.`);
		return undefined;
	}
	const names = inputCandidates.map(candidate => candidate.name).join(', ');
	void vscode.window.showErrorMessage(`Run With File requires exactly one ordinary file named "input". Found: ${names}.`);
	return undefined;
}

async function waitForTerminalStartup(terminal: vscode.Terminal): Promise<void> {
	if (terminal.shellIntegration) {
		return;
	}
	await new Promise<void>(resolve => {
		let settled = false;
		const finish = () => {
			if (!settled) {
				settled = true;
				listener.dispose();
				clearTimeout(timer);
				resolve();
			}
		};
		const listener = vscode.window.onDidChangeTerminalShellIntegration(event => {
			if (event.terminal === terminal) {
				finish();
			}
		});
		const timer = setTimeout(finish, 5000);
	});
}

function executeTerminalCommand(terminal: vscode.Terminal, command: string): void {
	try {
		if (terminal.shellIntegration) {
			terminal.shellIntegration.executeCommand(command);
		} else {
			terminal.sendText(command, true);
		}
	} catch {
		terminal.sendText(command, true);
	}
}

async function executeTerminalCommandAndWait(terminal: vscode.Terminal, command: string): Promise<number | undefined> {
	if (!terminal.shellIntegration) {
		terminal.sendText(command, true);
		return undefined;
	}
	const shellIntegration = terminal.shellIntegration;
	return new Promise<number | undefined>(resolve => {
		let execution: vscode.TerminalShellExecution | undefined;
		let settled = false;
		const finish = (exitCode: number | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			listener.dispose();
			clearTimeout(timer);
			resolve(exitCode);
		};
		const listener = vscode.window.onDidEndTerminalShellExecution(event => {
			if (event.terminal === terminal && event.execution === execution) {
				finish(event.exitCode);
			}
		});
		const timer = setTimeout(() => finish(undefined), 5000);
		try {
			execution = shellIntegration.executeCommand(command);
		} catch {
			finish(undefined);
			terminal.sendText(command, true);
		}
	});
}

async function waitForRunnerResult(resultPath: string): Promise<void> {
	const deadline = Date.now() + 300000;
	while (Date.now() < deadline) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(resultPath));
			return;
		} catch {
			await new Promise<void>(resolve => setTimeout(resolve, 100));
		}
	}
}

function buildRunCommand(sourcePath: string, terminalCwd: string, mode: RunnerMode): string {
	const relativePath = path.relative(terminalCwd, sourcePath).replaceAll('/', '\\') || path.basename(sourcePath);
	const sourceArgument = quotePowerShellArgument(relativePath);
	return `run ${sourceArgument}${mode === 'runWithInput' ? ' -WithInput' : ''}`;
}

function quotePowerShellArgument(value: string): string {
	if (!/[\s'`$&|;<>()[\]{}!#^]/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "''")}'`;
}

function isBeCoderRunner(terminal: vscode.Terminal, statePath: string): boolean {
	if (terminal.name !== RUNNER_NAME) {
		return false;
	}
	const options = terminal.creationOptions as vscode.TerminalOptions;
	return options.env?.['BECODER_RUNNER_ID'] === RUNNER_ID
		&& options.env?.['BECODER_RUNNER_STATE_PATH'] === statePath;
}

function getCreationCwd(terminal: vscode.Terminal): string | undefined {
	const options = terminal.creationOptions as vscode.TerminalOptions;
	return typeof options.cwd === 'string' ? options.cwd : options.cwd?.fsPath;
}

function getInitialRunnerCwd(sourceDirectory: string): string {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? sourceDirectory;
}

function getPowerShellPath(): string {
	const systemRoot = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows';
	return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function createRunnerEnvironment(context: vscode.ExtensionContext): Record<string, string> {
	const systemRoot = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows';
	const userProfile = process.env['USERPROFILE'] ?? process.cwd();
	const localAppData = process.env['LOCALAPPDATA'] ?? path.join(userProfile, 'AppData', 'Local');
	const temp = process.env['TEMP'] ?? path.join(localAppData, 'Temp');
	const commandDirectory = path.dirname(runnerCommandPath(context));
	return {
		SystemRoot: systemRoot,
		windir: systemRoot,
		SystemDrive: process.env['SystemDrive'] ?? path.parse(systemRoot).root.replace('\\', ''),
		ComSpec: process.env['ComSpec'] ?? path.join(systemRoot, 'System32', 'cmd.exe'),
		TEMP: temp,
		TMP: process.env['TMP'] ?? temp,
		USERPROFILE: userProfile,
		HOMEDRIVE: process.env['HOMEDRIVE'] ?? path.parse(userProfile).root.replace('\\', ''),
		HOMEPATH: process.env['HOMEPATH'] ?? userProfile.substring(2),
		APPDATA: process.env['APPDATA'] ?? path.join(userProfile, 'AppData', 'Roaming'),
		LOCALAPPDATA: localAppData,
		ProgramData: process.env['ProgramData'] ?? path.join(process.env['SystemDrive'] ?? 'C:', 'ProgramData'),
		PATHEXT: '.COM;.EXE;.BAT;.CMD',
		// The Runner invokes the bundled compiler and executable by absolute path.
		// Keep its shell PATH limited to the BeCoder command directory so other
		// UCRT64 utilities cannot accidentally become part of the Runner surface.
		PATH: commandDirectory,
		BECODER_RUNNER_ID: RUNNER_ID,
		BECODER_RUNNER_INIT_PATH: path.join(commandDirectory, 'runner-init.ps1'),
		BECODER_RUNNER_SCRIPT_PATH: path.join(commandDirectory, 'becoder-runner.ps1'),
		BECODER_RUNNER_STATE_PATH: runnerStatePath(context),
	};
}
