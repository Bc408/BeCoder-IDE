/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { isDeepStrictEqual } from 'util';
import * as vscode from 'vscode';
import { registerSimpleSettings } from './simpleSettings';
import { registerToolchainDiagnostics } from './toolchainDiagnostics';

type PlatformPreset = {
	portableToolchain: boolean;
	compilerCandidates: string[];
	clangdCandidates: string[];
	installDescription: string;
	downloadSources?: DownloadSource[];
};

type DownloadSource = { id: string; unavailable?: boolean };

type PlatformInstaller = {
	createCommand?(input: { toolchainRoot: string; source?: DownloadSource; stage?: string; locale?: string }): string;
	getPortableAssets?(input: { toolchainRoot: string; source?: DownloadSource; stage?: string; locale?: string }): readonly unknown[];
};

type SetupSelection = 'recommended';
type FirstRunSelection = {
	mode: SetupSelection;
	editor: boolean;
	installToolchain: boolean;
	fontLigatures: boolean;
	fontSize: number;
	autoFormat: boolean;
	workspaceFolder: string;
};

const SETUP_COMPLETE = 'becoder.setupComplete';
const beCoderHiddenFiles: Record<string, boolean> = {
	'**/*.exe': true,
	'**/*.bin': true,
	'**/*.bin.dSYM': true,
	'**/*.dSYM': true
};

const FILE_EXCLUDES_MIGRATION = 'becoder.fileExcludes.v4';
const CLANGD_SETTINGS_MIGRATION = 'becoder.clangdSettings.v1';
const obsoleteBeCoderHiddenFiles = [
	'**/.clang-format',
	'**/.clangd',
	'**/.*'
];

const editorSettings: Record<string, unknown> = {
	'editor.fontLigatures': false,
	'editor.cursorSmoothCaretAnimation': 'on',
	'editor.smoothScrolling': true,
	'workbench.list.smoothScrolling': true,
	'terminal.integrated.smoothScrolling': true,
	'editor.cursorBlinking': 'smooth',
	'editor.fontSize': 14,
	'files.autoSave': 'onFocusChange',
	'editor.formatOnSave': false,
	'editor.formatOnPaste': false,
	'editor.mouseWheelZoom': true,
	'window.systemColorTheme': 'auto',
	'window.titleBarStyle': 'custom',
	'window.commandCenter': false,
	'workbench.startupEditor': 'welcomePage',
	'workbench.navigationControl.enabled': false,
	'workbench.layoutControl.enabled': true,
	'workbench.layoutControl.type': 'both',
	'workbench.activityBar.location': 'top',
	'workbench.statusBar.visible': false,
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerSimpleSettings(context);
	registerToolchainDiagnostics(context);
	context.subscriptions.push(vscode.commands.registerCommand('becoder.setupEnvironment', () => runSetup(context)));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.redetectToolchain', () => runSetup(context)));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.repairToolchain', () => repairToolchain(context)));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.rerunFirstRunSetup', () => rerunFirstRunSetup()));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.showAllFiles', toggleHiddenFiles));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.hideSetupFiles', toggleHiddenFiles));
	if (!context.globalState.get<boolean>(FILE_EXCLUDES_MIGRATION)) {
		await ensureBeCoderFileExcludes();
		await context.globalState.update(FILE_EXCLUDES_MIGRATION, true);
	}
	if (!context.globalState.get<boolean>(CLANGD_SETTINGS_MIGRATION)) {
		await removeLegacyClangdSettings();
		await context.globalState.update(CLANGD_SETTINGS_MIGRATION, true);
	}
	const updateHiddenFilesContext = () => {
		void vscode.commands.executeCommand('setContext', 'becoder.showAllFiles', !hasBeCoderHiddenFiles());
	};
	updateHiddenFilesContext();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('files.exclude')) {
			updateHiddenFilesContext();
		}
	}));
	let applyingPending = false;
	const applyPending = async () => {
		if (applyingPending) { return; }
		const pending = vscode.workspace.getConfiguration('becoder.setup').get<unknown>('pending');
		if (!isFirstRunSelection(pending)) { return; }
		applyingPending = true;
		try { await configure(context, pending); } finally { applyingPending = false; }
	};
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('becoder.setup.pending')) { void applyPending(); }
	}));
	await applyPending();
	await refreshPortableToolchainSettings(context);
}

async function refreshPortableToolchainSettings(context: vscode.ExtensionContext): Promise<void> {
	if (process.platform !== 'win32') {
		return;
	}
	const preset = loadPreset(context);
	if (!preset.portableToolchain) {
		return;
	}
	const compiler = preset.compilerCandidates[0];
	const clangd = preset.clangdCandidates[0];
	if (!compiler || !clangd) {
		return;
	}
	const toolchainRoot = getBeCoderToolchainRoot(context);
	await updateGlobalSettings({
		'becoder.toolchain.compilerPath': compiler,
		'becoder.toolchain.cCompilerPath': compiler.replace(/g\+\+\.exe$/i, 'gcc.exe'),
		'becoder.toolchain.stdIncludePath': path.join(toolchainRoot, 'becoder-ucrt64', 'include', 'c++', '14.1.0'),
		'becoder.toolchain.debuggerHeader': path.join(toolchainRoot, 'becoder-ucrt64', 'include', 'c++', '14.1.0', 'x86_64-w64-mingw32', 'bits', 'debugger.h')
	});
}

async function rerunFirstRunSetup(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('becoder.setup');
	await configuration.update('pending', undefined, vscode.ConfigurationTarget.Global);
	await configuration.update('completed', false, vscode.ConfigurationTarget.Global);
	const action = await vscode.window.showInformationMessage(
		'BeCoder IDE will show the first-run setup after restart.',
		'Restart Now'
	);
	if (action === 'Restart Now') {
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
	}
}

async function repairToolchain(context: vscode.ExtensionContext): Promise<void> {
	const preset = loadPreset(context);
	if (preset.portableToolchain) {
		const configuration = vscode.workspace.getConfiguration('becoder.setup');
		await configuration.update('pending', undefined, vscode.ConfigurationTarget.Global);
		await configuration.update('completed', false, vscode.ConfigurationTarget.Global);
		await vscode.window.showInformationMessage('正在进入工具链修复。请在开箱页继续，BeCoder IDE 会重新下载缺失的组件。');
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
		return;
	}
	const compiler = await findPreferredCompiler(preset.compilerCandidates);
	const clangd = await findFirstExecutable(preset.clangdCandidates);
	if (compiler && clangd && !await isAppleClang(compiler)) {
		// Repair only toolchain-related settings; do not overwrite the user's editor
		// and unrelated legacy preferences with the first-run preset.
		const settings: Record<string, unknown> = {
			'becoder.toolchain.compilerPath': compiler,
			'becoder.toolchain.cCompilerPath': compiler.replace(/g\+\+\.exe$/i, 'gcc.exe')
		};
		await updateGlobalSettings(settings);
		return;
	}
	// A configured Apple Clang fallback is usable, but "repair" means install
	// Homebrew GCC rather than treating that fallback as already complete.
	await offerInstaller(context, preset, !compiler || await isAppleClang(compiler), !clangd);
}

async function runSetup(context: vscode.ExtensionContext): Promise<void> {
	await configure(context);
}

async function configure(context: vscode.ExtensionContext, firstRunSelection?: FirstRunSelection): Promise<void> {
	const preset = loadPreset(context);
	let compiler = await findPreferredCompiler(preset.compilerCandidates);
	let clangd = await findFirstExecutable(preset.clangdCandidates);
	let installerStarted = false;
	let includeEditor = true;

	if (firstRunSelection) {
		includeEditor = firstRunSelection.editor;
		if (firstRunSelection.installToolchain && (!compiler || !clangd)) {
			await offerInstaller(context, preset, !compiler, !clangd);
			installerStarted = true;
		}
	} else if (!compiler || !clangd) {
		await offerInstaller(context, preset, !compiler, !clangd);
		installerStarted = true;
	}

	if (installerStarted) {
		compiler = await findPreferredCompiler(preset.compilerCandidates);
		clangd = await findFirstExecutable(preset.clangdCandidates);
		if (preset.portableToolchain) {
			compiler ??= preset.compilerCandidates[0];
			clangd ??= preset.clangdCandidates[0];
		}
	}
	if (compiler && await isAppleClang(compiler)) {
		await vscode.window.showWarningMessage(
			'未检测到 Homebrew GCC，当前将使用 Apple Clang（g++ 兼容包装器）。它可以编译代码，但为保持竞赛环境一致，建议执行“修复工具链”安装 Homebrew GCC。',
			{ modal: true },
			'修复工具链',
			'继续使用 Apple Clang'
		).then(action => action === '修复工具链' ? repairToolchain(context) : undefined);
	}

	const settings: Record<string, unknown> = {};
	if (includeEditor) {
		Object.assign(settings, editorSettings);
		if (firstRunSelection) {
			settings['editor.fontLigatures'] = firstRunSelection.fontLigatures;
			settings['editor.fontSize'] = firstRunSelection.fontSize;
			settings['editor.formatOnSave'] = firstRunSelection.autoFormat;
			settings['editor.formatOnPaste'] = firstRunSelection.autoFormat;
		}
	}
	settings['files.exclude'] = addMissingBeCoderFileExcludes(getGlobalFileExcludes());
	if (compiler) {
		settings['becoder.toolchain.compilerPath'] = compiler;
		settings['becoder.toolchain.cCompilerPath'] = compiler.replace(/g\+\+\.exe$/i, 'gcc.exe');
		settings['becoder.toolchain.stdIncludePath'] = path.join(path.dirname(path.dirname(compiler)), 'include', 'c++', '14.1.0');
		settings['becoder.toolchain.debuggerHeader'] = path.join(path.dirname(path.dirname(compiler)), 'include', 'c++', '14.1.0', 'x86_64-w64-mingw32', 'bits', 'debugger.h');
		settings['becoder.runner.cppFlags'] = ['-O2', '-Wall', '-DDEBUG'];
		settings['becoder.runner.cFlags'] = ['-O2', '-Wall', '-DDEBUG'];
		settings['becoder.runner.cleanupExecutable'] = true;
	}
	for (const key of Object.keys(settings)) {
		if (key.startsWith('c-cpp-compile-run.')) {
			delete settings[key];
		}
	}
	await updateGlobalSettings(settings);
	if (firstRunSelection) {
		const firstRunConfiguration = vscode.workspace.getConfiguration('becoder.setup');
		await firstRunConfiguration.update('pending', undefined, vscode.ConfigurationTarget.Global);
		await firstRunConfiguration.update('completed', true, vscode.ConfigurationTarget.Global);
	}
	await context.globalState.update(SETUP_COMPLETE, true);

	if (installerStarted && preset.portableToolchain) {
		void vscode.window.showInformationMessage('BeCoder IDE is configured for its Portable toolchain. The download continues in the setup terminal without changing your system PATH.');
	} else if (!compiler || !clangd) {
		void vscode.window.showWarningMessage('The preset was saved, but one or more compilers are not installed yet. Finish the terminal installer, then run “BeCoder IDE: Configure Competitive Programming Environment” again to detect their actual paths.');
	} else {
		void vscode.window.showInformationMessage(`BeCoder IDE is ready. Using g++ at ${compiler}.`);
	}
}

function isFirstRunSelection(candidate: unknown): candidate is FirstRunSelection {
	if (!candidate || typeof candidate !== 'object') {
		return false;
	}
	const value = candidate as Partial<FirstRunSelection>;
	return value.mode === 'recommended'
		&& typeof value.editor === 'boolean'
		&& typeof value.installToolchain === 'boolean'
		&& typeof value.fontLigatures === 'boolean'
		&& typeof value.fontSize === 'number'
		&& typeof value.autoFormat === 'boolean'
		&& typeof value.workspaceFolder === 'string'
		&& path.isAbsolute(value.workspaceFolder);
}

function loadPreset(context: vscode.ExtensionContext): PlatformPreset {
	const name = getPlatformName() + '.json';
	const preset = JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'resources', name), 'utf8')) as PlatformPreset;
	const toolchainRoot = getBeCoderToolchainRoot(context);
	return {
		...preset,
		compilerCandidates: preset.compilerCandidates.map(candidate => candidate.replaceAll('{{TOOLCHAIN_ROOT}}', toolchainRoot)),
		clangdCandidates: preset.clangdCandidates.map(candidate => candidate.replaceAll('{{TOOLCHAIN_ROOT}}', toolchainRoot))
	};
}

function getPlatformName(): 'windows' | 'mac' | 'linux' {
	return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
}

function loadPlatformInstaller(context: vscode.ExtensionContext): PlatformInstaller {
	// Platform installers are plain CommonJS resources so the main-process first-run
	// window and this extension command execute the exact same platform logic.
	// eslint-disable-next-line no-restricted-syntax
	return require(path.join(context.extensionPath, 'resources', `${getPlatformName()}.js`)) as PlatformInstaller;
}

async function offerInstaller(context: vscode.ExtensionContext, preset: PlatformPreset, compilerMissing: boolean, clangdMissing: boolean): Promise<void> {
	const missingTools = [
		compilerMissing ? (process.platform === 'darwin' ? 'Homebrew GCC' : 'g++') : undefined,
		clangdMissing ? 'clangd' : undefined
	].filter((tool): tool is string => !!tool);
	const choice = await vscode.window.showWarningMessage(
		`未检测到 ${missingTools.join(' 和 ')}。${preset.installDescription}。安装命令会在集成终端中运行，可能需要管理员权限。`,
		{ modal: true },
		'安装并修复',
		'暂不处理'
	);
	if (choice === '安装并修复') {
		const toolchainRoot = getBeCoderToolchainRoot(context);
		const source = preset.downloadSources?.find(candidate => candidate.id === 'tuna' && !candidate.unavailable)
			?? preset.downloadSources?.find(candidate => !candidate.unavailable);
		const installer = loadPlatformInstaller(context);
		if (installer.getPortableAssets || !installer.createCommand) {
			const restart = await vscode.window.showInformationMessage(
				'Portable toolchains are downloaded by the first-run setup window. Restart setup to download them.',
				'Restart setup now'
			);
			if (restart === 'Restart setup now') {
				await rerunFirstRunSetup();
			}
			return;
		}
		const installCommand = process.platform === 'darwin'
			? `${installer.createCommand({ toolchainRoot, source, stage: 'xcode', locale: vscode.env.language })}; ${installer.createCommand({ toolchainRoot, source, stage: 'homebrew', locale: vscode.env.language })}; ${installer.createCommand({ toolchainRoot, source, stage: 'toolchain', locale: vscode.env.language })}`
			: installer.createCommand({ toolchainRoot, source, stage: 'toolchain', locale: vscode.env.language });
		const terminal = vscode.window.createTerminal('BeCoder IDE Toolchain Setup');
		terminal.show();
		terminal.sendText(installCommand, true);
	}
}

function getBeCoderToolchainRoot(context: vscode.ExtensionContext): string {
	const packagedRoot = path.resolve(context.extensionPath, '..', '..', '..', '..', 'data', 'toolchains');
	if (fs.existsSync(packagedRoot)) {
		return packagedRoot;
	}
	const portableRoot = process.env['VSCODE_PORTABLE'];
	return portableRoot
		? path.join(portableRoot, 'toolchains')
		: path.resolve(context.globalStorageUri.fsPath, '..', '..', '..', 'toolchains');
}

async function updateGlobalSettings(settings: Record<string, unknown>): Promise<void> {
	for (const [key, value] of Object.entries(settings)) {
		const configuration = vscode.workspace.getConfiguration(undefined, null);
		if (!isDeepStrictEqual(configuration.inspect(key)?.globalValue, value)) {
			await configuration.update(key, value, vscode.ConfigurationTarget.Global);
		}
	}
}

function getGlobalFileExcludes(): Record<string, boolean> {
	return vscode.workspace.getConfiguration('files', null).inspect<Record<string, boolean>>('exclude')?.globalValue ?? {};
}

function hasBeCoderHiddenFiles(): boolean {
	const excludes = vscode.workspace.getConfiguration('files', null).get<Record<string, boolean>>('exclude') ?? {};
	return Object.keys(beCoderHiddenFiles).some(pattern => excludes[pattern] === true);
}

function addMissingBeCoderFileExcludes(excludes: Record<string, boolean>): Record<string, boolean> {
	const updatedExcludes = { ...excludes };
	for (const [pattern, excluded] of Object.entries(beCoderHiddenFiles)) {
		if (!Object.hasOwn(updatedExcludes, pattern)) {
			updatedExcludes[pattern] = excluded;
		}
	}
	return updatedExcludes;
}

function migrateBeCoderFileExcludes(excludes: Record<string, boolean>): Record<string, boolean> {
	const updatedExcludes = addMissingBeCoderFileExcludes(excludes);
	for (const pattern of obsoleteBeCoderHiddenFiles) {
		delete updatedExcludes[pattern];
	}
	return updatedExcludes;
}

async function ensureBeCoderFileExcludes(): Promise<void> {
	const excludes = getGlobalFileExcludes();
	const updatedExcludes = migrateBeCoderFileExcludes(excludes);
	if (isDeepStrictEqual(updatedExcludes, excludes)) {
		return;
	}
	await vscode.workspace.getConfiguration('files', null).update('exclude', updatedExcludes, vscode.ConfigurationTarget.Global);
}

async function removeLegacyClangdSettings(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration(undefined, null);
	for (const key of [
		'becoder.toolchain.clangdPath',
		'clangd.arguments',
		'clangd.checkUpdates',
		'clangd.enable',
		'clangd.enableCodeCompletion',
		'clangd.enableHover',
		'clangd.fallbackFlags',
		'clangd.onConfigChanged',
		'clangd.onConfigChangedForceEnable',
		'clangd.path',
		'clangd.restartAfterCrash',
		'clangd.serverCompletionRanking',
		'clangd.trace',
		'clangd.useScriptAsExecutable'
	]) {
		if (configuration.inspect(key)?.globalValue !== undefined) {
			await configuration.update(key, undefined, vscode.ConfigurationTarget.Global);
		}
	}
}

async function toggleHiddenFiles(): Promise<void> {
	const excludes = { ...getGlobalFileExcludes() };
	if (hasBeCoderHiddenFiles()) {
		for (const pattern of Object.keys(beCoderHiddenFiles)) {
			delete excludes[pattern];
		}
	} else {
		Object.assign(excludes, beCoderHiddenFiles);
	}
	await vscode.workspace.getConfiguration('files', null).update('exclude', excludes, vscode.ConfigurationTarget.Global);
}

async function findFirstExecutable(candidates: readonly string[]): Promise<string | undefined> {
	for (const candidate of candidates) {
		if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
			return candidate;
		}
		const located = await locateOnPath(candidate);
		if (located) {
			return located;
		}
	}
	return undefined;
}

async function findPreferredCompiler(candidates: readonly string[]): Promise<string | undefined> {
	if (process.platform !== 'darwin') {
		return findFirstExecutable(candidates);
	}

	const brew = await locateOnPath('brew');
	const directories = ['/opt/homebrew/bin', '/usr/local/bin'];
	if (brew) {
		const prefix = await getHomebrewGccPrefix(brew);
		if (prefix) {
			// Prefer the executable that Homebrew exposes on PATH (`which g++-16`).
			// clangd's query-driver matching is path-sensitive, while the formula
			// prefix is an additional symlink that can differ from user config.
			directories.push(path.join(prefix, 'bin'));
		}
	}

	const matches = directories.flatMap(directory => {
		try {
			return fs.readdirSync(directory)
				.filter(name => /^g\+\+-\d+$/.test(name))
				.map(name => path.join(directory, name))
				.filter(candidate => fs.existsSync(candidate));
		} catch {
			return [];
		}
	});
	const homebrewGcc = matches.sort((left, right) => getGccVersion(right) - getGccVersion(left))[0];
	// macOS ships /usr/bin/g++ as an Apple Clang compatibility wrapper. It is a
	// usable fallback, but diagnostics and the setup warning make that explicit.
	return homebrewGcc ?? await findFirstExecutable(['/usr/bin/g++', '/usr/bin/clang++', 'g++', 'clang++']);
}

function getHomebrewGccPrefix(brew: string): Promise<string | undefined> {
	return new Promise(resolve => execFile(brew, ['--prefix', 'gcc'], { windowsHide: true }, (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined)));
}

function getGccVersion(candidate: string): number {
	return Number(/g\+\+-(\d+)$/.exec(candidate)?.[1] ?? 0);
}

function isAppleClang(compiler: string): Promise<boolean> {
	return new Promise(resolve => execFile(compiler, ['--version'], { windowsHide: true }, (error, stdout, stderr) => {
		resolve(!error && /apple clang/i.test(`${stdout}\n${stderr}`));
	}));
}

function locateOnPath(command: string): Promise<string | undefined> {
	const locator = process.platform === 'win32' ? 'where.exe' : 'which';
	return new Promise(resolve => {
		execFile(locator, [command], { windowsHide: true }, (error, stdout) => {
			const result = error ? undefined : stdout.split(/\r?\n/, 1)[0]?.trim();
			resolve(result || undefined);
		});
	});
}
