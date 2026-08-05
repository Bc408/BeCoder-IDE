import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
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
	clangdVariableTypeHints: boolean;
	cppStandard: 'c++11' | 'c++14' | 'c++17' | 'c++20' | 'c++23';
	workspaceFolder: string;
};

const SETUP_COMPLETE = 'becoder.setupComplete';
const OI_WORKSPACE_INITIALIZATION_DISMISSED = 'becoder.oiWorkspaceInitializationDismissed';

const beCoderHiddenFiles: Record<string, boolean> = {
	'**/.clang-format': true,
	'**/.clangd': true,
	'**/*.exe': true,
	'**/*.bin': true,
	'**/*.bin.dSYM': true,
	'**/*.dSYM': true,
	'**/.*': true
};

const FILE_EXCLUDES_MIGRATION = 'becoder.fileExcludes.v3';

function clangdArgumentsForCompiler(compiler: string): string[] {
	// Homebrew exposes GCC through multiple symlinked paths, for example both
	// /opt/homebrew/bin/g++-16 and /opt/homebrew/opt/gcc/bin/g++-16. clangd
	// matches --query-driver against the path in its CompileFlags config before
	// resolving that symlink, so allowing only the selected path can leave GCC's
	// libstdc++ headers (including bits/stdc++.h) undiscovered.
	if (process.platform === 'darwin') {
		return [
			'--background-index',
			'--query-driver=/opt/homebrew/**/g++-*,/usr/local/**/g++-*'
		];
	}
	return process.platform === 'win32'
		? ['--background-index', '--enable-config=false']
		: ['--background-index', `--query-driver=${compiler}`];
}

function clangdFallbackFlagsForCompiler(compiler: string, cppStandard: FirstRunSelection['cppStandard']): string[] {
	const flags = [
		`-std=${cppStandard}`,
		'--target=x86_64-w64-windows-gnu',
		'-DDEBUG',
		'-Wall',
		'-Wextra',
		'-Wno-deprecated-declarations',
		'-Drsize_t=size_t',
		'-D__STDC_WANT_LIB_EXT1__=1',
		'-D__float128=long double',
		'-U__SIZEOF_FLOAT128__'
	];
	if (process.platform === 'win32') {
		flags.push(...windowsClangdIncludeFlags(compiler));
	} else if (process.platform === 'darwin') {
		flags.push('-I/opt/homebrew/include');
	}
	return flags;
}

function windowsClangdIncludeFlags(compiler: string): string[] {
	const toolchainRoot = path.dirname(path.dirname(compiler));
	const standardInclude = path.join(toolchainRoot, 'include', 'c++', '14.1.0');
	const targetInclude = path.join(standardInclude, 'x86_64-w64-mingw32');
	const gccInclude = path.join(toolchainRoot, 'lib', 'gcc', 'x86_64-w64-mingw32', '14.1.0', 'include');
	const includeFixed = path.join(toolchainRoot, 'lib', 'gcc', 'x86_64-w64-mingw32', '14.1.0', 'include-fixed');
	return [
		standardInclude,
		targetInclude,
		path.join(standardInclude, 'backward'),
		gccInclude,
		path.join(toolchainRoot, 'include'),
		path.join(targetInclude, 'bits'),
		includeFixed
	]
		.filter(includePath => fs.existsSync(includePath))
		.map(includePath => `-isystem${includePath}`);
}

function defaultClangdProjectConfig(compiler: string, cppStandard: FirstRunSelection['cppStandard']): string {
	const compilerPath = compiler.replaceAll('\\', '/');
	const flags = clangdFallbackFlagsForCompiler(compiler, cppStandard)
		.map(flag => `    - ${JSON.stringify(flag)}`)
		.join('\n');
	return `# BeCoder managed clangd configuration.
CompileFlags:
  Add:
${flags}
  BuiltinHeaders: Clangd
  Compiler: ${JSON.stringify(compilerPath)}

Completion:
  HeaderInsertion: Never

Index:
  Background: Build

Diagnostics:
  Suppress:
    - typecheck_expression_not_modifiable_lvalue
    - 'clang(typecheck_expression_not_modifiable_lvalue)'
`;
}

function createDefaultClangdConfig(configPath: string, compiler: string, cppStandard: FirstRunSelection['cppStandard']): void {
	if (fs.existsSync(configPath)) {
		const existing = fs.readFileSync(configPath, 'utf8');
		if (isManagedClangdConfig(existing) || isLegacyBeCoderClangdConfig(existing)) {
			fs.writeFileSync(configPath, defaultClangdProjectConfig(compiler, cppStandard), 'utf8');
		}
		return;
	}
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	try {
		fs.writeFileSync(configPath, defaultClangdProjectConfig(compiler, cppStandard), { encoding: 'utf8', flag: 'wx' });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}
	}
}

function createDefaultClangdProjectConfig(workspaceFolder: string, compiler: string, cppStandard: FirstRunSelection['cppStandard']): void {
	createDefaultClangdConfig(path.join(workspaceFolder, '.clangd'), compiler, cppStandard);
}

const defaultClangFormatConfig = `BasedOnStyle: Google

# --- 行为：尽量允许一行写完 ---
AllowShortIfStatementsOnASingleLine: AllIfsAndElse
AllowShortLoopsOnASingleLine: true
AllowShortBlocksOnASingleLine: true
AllowShortFunctionsOnASingleLine: Inline

# --- 行长（核心关键，不然上面全白给） ---
ColumnLimit: 0

# --- 缩进 ---
IndentWidth: 4
TabWidth: 4
UseTab: Never

# --- 访问修饰符 ---
AccessModifierOffset: -2

# --- 大括号风格 ---
BreakBeforeBraces: Attach
AlwaysBreakTemplateDeclarations: No

# --- 指针与注释 ---
PointerAlignment: Left
SpacesBeforeTrailingComments: 4

# --- 代码块间距 ---
SeparateDefinitionBlocks: Always

# --- 语言标准 ---
Standard: Latest
`;

function createDefaultClangFormatConfig(workspaceFolder: string): void {
	const configPath = path.join(workspaceFolder, '.clang-format');
	if (fs.existsSync(configPath)) {
		return;
	}
	try {
		fs.writeFileSync(configPath, defaultClangFormatConfig, { encoding: 'utf8', flag: 'wx' });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}
	}
}

function getSingleLocalWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders?.length !== 1 || workspaceFolders[0].uri.scheme !== 'file') {
		return undefined;
	}
	return workspaceFolders[0];
}

function hasOiWorkspaceConfig(workspaceFolder: vscode.WorkspaceFolder): boolean {
	return fs.existsSync(path.join(workspaceFolder.uri.fsPath, '.clangd'))
		|| fs.existsSync(path.join(workspaceFolder.uri.fsPath, '.clang-format'));
}

async function initializeOiWorkspace(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = getSingleLocalWorkspaceFolder();
	if (!workspaceFolder) {
		void vscode.window.showInformationMessage('请先打开一个本地文件夹，再初始化 OI 项目配置。');
		return;
	}

	const configuredCompiler = vscode.workspace.getConfiguration().get<string>('becoder.toolchain.compilerPath');
	const compiler = configuredCompiler || await findPreferredCompiler(loadPreset(context).compilerCandidates) || 'g++';
	createDefaultClangdProjectConfig(workspaceFolder.uri.fsPath, compiler, 'c++20');
	createDefaultClangFormatConfig(workspaceFolder.uri.fsPath);
	await context.workspaceState.update(OI_WORKSPACE_INITIALIZATION_DISMISSED, undefined);
	void vscode.window.showInformationMessage(`已在“${workspaceFolder.name}”中创建 .clangd 和 .clang-format。`);
}

async function offerOiWorkspaceInitialization(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = getSingleLocalWorkspaceFolder();
	if (!workspaceFolder || hasOiWorkspaceConfig(workspaceFolder) || context.workspaceState.get<boolean>(OI_WORKSPACE_INITIALIZATION_DISMISSED)) {
		return;
	}

	const action = await vscode.window.showInformationMessage(
		`“${workspaceFolder.name}”尚未包含 OI 项目配置。要创建 .clangd 和 .clang-format 吗？`,
		'初始化 OI 配置',
		'暂不初始化'
	);
	if (action === '初始化 OI 配置') {
		await initializeOiWorkspace(context);
	} else {
		await context.workspaceState.update(OI_WORKSPACE_INITIALIZATION_DISMISSED, true);
	}
}

const editorSettings: Record<string, unknown> = {
	'editor.fontLigatures': false,
	'editor.cursorSmoothCaretAnimation': 'on',
	'editor.smoothScrolling': true,
	'workbench.list.smoothScrolling': true,
	'terminal.integrated.smoothScrolling': true,
	'editor.cursorBlinking': 'smooth',
	'editor.fontSize': 14,
	'files.autoSave': 'onFocusChange',
	'editor.formatOnSave': true,
	'editor.formatOnPaste': true,
	'editor.inlayHints.enabled': 'on',
	// Competitive-programming comments commonly contain Chinese text. Treat
	// non-ASCII characters as ordinary source content instead of highlighting
	// them as suspicious Unicode.
	'editor.unicodeHighlight.nonBasicASCII': false,
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
	context.subscriptions.push(vscode.commands.registerCommand('becoder.initializeOiWorkspace', () => initializeOiWorkspace(context)));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.showAllFiles', toggleHiddenFiles));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.hideSetupFiles', toggleHiddenFiles));
	if (!context.globalState.get<boolean>(FILE_EXCLUDES_MIGRATION)) {
		await ensureBeCoderFileExcludes();
		await context.globalState.update(FILE_EXCLUDES_MIGRATION, true);
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
	await migrateWorkspaceClangdConfig(context);
	void offerOiWorkspaceInitialization(context);
}

function isManagedClangdConfig(content: string): boolean {
	return content.includes('# BeCoder managed clangd configuration.');
}

function isLegacyBeCoderClangdConfig(content: string): boolean {
	const compiler = /^\s*Compiler:\s*["']?([^"'\r\n]+)["']?\s*$/mi.exec(content)?.[1] ?? '';
	return content.includes('BuiltinHeaders: QueryDriver')
		&& content.includes('HeaderInsertion: Never')
		&& (/^(?:g\+\+|clang\+\+)$/i.test(compiler) || /(?:portable_stage|portable_test|becoder-stage)/i.test(compiler));
}

async function migrateWorkspaceClangdConfig(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = getSingleLocalWorkspaceFolder();
	if (!workspaceFolder) {
		return;
	}
	const configuredCompiler = vscode.workspace.getConfiguration().get<string>('becoder.toolchain.compilerPath');
	const compiler = configuredCompiler || await findPreferredCompiler(loadPreset(context).compilerCandidates);
	if (compiler) {
		createDefaultClangdProjectConfig(workspaceFolder.uri.fsPath, compiler, 'c++20');
	}
}

async function refreshPortableToolchainSettings(context: vscode.ExtensionContext): Promise<void> {
	if (process.platform !== 'win32') {
		return;
	}
	const preset = loadPreset(context);
	if (!preset.portableToolchain) {
		return;
	}
	const compiler = await findPreferredCompiler(preset.compilerCandidates);
	const clangd = await findFirstExecutable(preset.clangdCandidates);
	if (!compiler || !clangd) {
		return;
	}
	const cppStandard = vscode.workspace.getConfiguration('becoder.runner').get<FirstRunSelection['cppStandard']>('cppStandard') ?? 'c++20';
	const toolchainRoot = getBeCoderToolchainRoot(context);
	await updateGlobalSettings({
		'becoder.toolchain.compilerPath': compiler,
		'becoder.toolchain.cCompilerPath': compiler.replace(/g\+\+\.exe$/i, 'gcc.exe'),
		'becoder.toolchain.clangdPath': clangd,
		'becoder.toolchain.stdIncludePath': path.join(toolchainRoot, 'becoder-ucrt64', 'include', 'c++', '14.1.0'),
		'becoder.toolchain.debuggerHeader': path.join(toolchainRoot, 'becoder-ucrt64', 'include', 'c++', '14.1.0', 'x86_64-w64-mingw32', 'bits', 'debugger.h'),
		'clangd.path': clangd,
		'clangd.arguments': clangdArgumentsForCompiler(compiler),
		'clangd.fallbackFlags': clangdFallbackFlagsForCompiler(compiler, cppStandard)
	});
	await configureClangd(compiler, clangd);
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
			'becoder.toolchain.cCompilerPath': compiler.replace(/g\+\+\.exe$/i, 'gcc.exe'),
			'clangd.path': clangd,
			'clangd.arguments': clangdArgumentsForCompiler(compiler)
		};
		await updateGlobalSettings(settings);
		await configureClangd(compiler, clangd);
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
			settings['editor.inlayHints.enabled'] = firstRunSelection.clangdVariableTypeHints ? 'on' : 'off';
		}
	}
	settings['files.exclude'] = addMissingBeCoderFileExcludes(getGlobalFileExcludes());
	const cppStandard = firstRunSelection?.cppStandard ?? 'c++20';
	if (compiler) {
		settings['becoder.toolchain.compilerPath'] = compiler;
		settings['becoder.toolchain.cCompilerPath'] = compiler.replace(/g\+\+\.exe$/i, 'gcc.exe');
		settings['becoder.toolchain.clangdPath'] = clangd;
		settings['becoder.toolchain.stdIncludePath'] = path.join(path.dirname(path.dirname(compiler)), 'include', 'c++', '14.1.0');
		settings['becoder.toolchain.debuggerHeader'] = path.join(path.dirname(path.dirname(compiler)), 'include', 'c++', '14.1.0', 'x86_64-w64-mingw32', 'bits', 'debugger.h');
		settings['becoder.runner.cppStandard'] = cppStandard;
		settings['becoder.runner.cppFlags'] = ['-O2', '-Wall', '-DDEBUG'];
		settings['becoder.runner.cFlags'] = ['-O2', '-Wall', '-DDEBUG'];
		settings['becoder.runner.cleanupExecutable'] = true;
		settings['clangd.fallbackFlags'] = clangdFallbackFlagsForCompiler(compiler, cppStandard);
		if (firstRunSelection) {
			createDefaultClangdProjectConfig(firstRunSelection.workspaceFolder, compiler, cppStandard);
		}
		settings['clangd.arguments'] = clangdArgumentsForCompiler(compiler);
	}
	if (clangd) {
		settings['clangd.path'] = clangd;
	}
	for (const key of Object.keys(settings)) {
		if (key.startsWith('c-cpp-compile-run.')) {
			delete settings[key];
		}
	}
	if (firstRunSelection?.autoFormat) {
		createDefaultClangFormatConfig(firstRunSelection.workspaceFolder);
	}
	await updateGlobalSettings(settings);
	await configureClangd(compiler, clangd);
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

async function configureClangd(compiler?: string, clangd?: string): Promise<void> {
	const configuredCompiler = compiler ?? vscode.workspace.getConfiguration().get<string>('becoder.toolchain.compilerPath');
	const configuredClangd = clangd ?? vscode.workspace.getConfiguration().get<string>('becoder.toolchain.clangdPath');
	const settings = vscode.workspace.getConfiguration(undefined, null);
	const updates: Array<Promise<void>> = [];
	const updateIfRegistered = (key: string, value: unknown): void => {
		if (settings.inspect(key)) {
			updates.push(Promise.resolve(settings.update(key, value, vscode.ConfigurationTarget.Global)));
		}
	};
	updateIfRegistered('clangd.enable', true);
	updateIfRegistered('clangd.path', configuredClangd);
	updateIfRegistered('clangd.arguments', configuredCompiler ? clangdArgumentsForCompiler(configuredCompiler) : ['--background-index']);
	updateIfRegistered('clangd.fallbackFlags', configuredCompiler ? clangdFallbackFlagsForCompiler(configuredCompiler, 'c++20') : ['-std=c++20', '-Wno-deprecated-declarations']);
	await Promise.allSettled(updates);
	const clangdExtension = vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd');
	if (clangdExtension?.isActive) {
		await vscode.commands.executeCommand('clangd.restart');
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
		&& typeof value.clangdVariableTypeHints === 'boolean'
		&& (value.cppStandard === 'c++11' || value.cppStandard === 'c++14' || value.cppStandard === 'c++17' || value.cppStandard === 'c++20' || value.cppStandard === 'c++23')
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
		: path.resolve(context.globalStorageUri.fsPath, '..', '..', '..', '..', 'toolchains');
}

async function updateGlobalSettings(settings: Record<string, unknown>): Promise<void> {
	for (const [key, value] of Object.entries(settings)) {
		await vscode.workspace.getConfiguration(undefined, null).update(key, value, vscode.ConfigurationTarget.Global);
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
		if (!(pattern in updatedExcludes)) {
			updatedExcludes[pattern] = excluded;
		}
	}
	return updatedExcludes;
}

async function ensureBeCoderFileExcludes(): Promise<void> {
	const excludes = getGlobalFileExcludes();
	const updatedExcludes = addMissingBeCoderFileExcludes(excludes);
	if (Object.keys(updatedExcludes).length === Object.keys(excludes).length) {
		return;
	}
	await vscode.workspace.getConfiguration('files', null).update('exclude', updatedExcludes, vscode.ConfigurationTarget.Global);
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
