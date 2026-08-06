import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

export type BeCoderSource = {
	readonly path: string;
	readonly name: string;
	readonly directory: string;
	readonly executable: string;
	readonly language: 'c' | 'cpp';
};

export type RunnerMode = 'run' | 'runWithInput' | 'compile';

export type RunnerRequest = {
	readonly requestId: string;
	readonly mode: RunnerMode;
	readonly sourcePath: string;
	readonly toolchainRoot: string;
	readonly compilerPath: string;
	readonly cCompilerPath: string;
	readonly cStandard: string;
	readonly cppStandard: string;
	readonly cppFlags: string[];
	readonly cFlags: string[];
	readonly cleanupExecutable: boolean;
	readonly inputPath?: string;
	readonly resultPath: string;
};

function setting<T>(key: string, fallback: T): T {
	return vscode.workspace.getConfiguration().get<T>(key) ?? fallback;
}

function configuredCompiler(source: BeCoderSource): string {
	const key = source.language === 'cpp' ? 'becoder.toolchain.compilerPath' : 'becoder.toolchain.cCompilerPath';
	return setting<string>(key, '');
}

function integratedToolchainRoot(context: vscode.ExtensionContext): string {
	if (process.platform !== 'win32') {
		return '';
	}
	// In a packaged portable build, this path is owned by BeCoder and sits beside
	// resources. The environment fallback keeps source builds usable without
	// making the Runner depend on a user-configured compiler setting.
	const packagedToolchainRoot = path.resolve(context.extensionPath, '..', '..', '..', '..', 'data', 'toolchains');
	if (fs.existsSync(packagedToolchainRoot)) {
		return packagedToolchainRoot;
	}
	const portableRoot = process.env['VSCODE_PORTABLE'];
	if (portableRoot) {
		return path.join(portableRoot, 'toolchains');
	}
	return path.resolve(context.globalStorageUri.fsPath, '..', '..', '..', 'toolchains');
}

function integratedCompiler(context: vscode.ExtensionContext, source: BeCoderSource): string {
	if (process.platform !== 'win32') {
		return configuredCompiler(source);
	}
	const toolchainRoot = integratedToolchainRoot(context);
	return path.join(toolchainRoot, 'becoder-ucrt64', 'bin', source.language === 'cpp' ? 'g++.exe' : 'gcc.exe');
}

export async function getActiveSource(): Promise<BeCoderSource | undefined> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !['c', 'cpp'].includes(editor.document.languageId)) {
		void vscode.window.showErrorMessage('BeCoder Runner supports only C and C++ source files.');
		return undefined;
	}
	if (editor.document.isUntitled) {
		const saved = await editor.document.save();
		if (!saved || editor.document.isUntitled) {
			void vscode.window.showErrorMessage('Save the source file before using BeCoder Runner.');
			return undefined;
		}
	} else if (editor.document.isDirty && !await editor.document.save()) {
		void vscode.window.showErrorMessage(`Unable to save ${path.basename(editor.document.fileName)} before running.`);
		return undefined;
	}
	const extension = path.extname(editor.document.fileName).toLowerCase();
	if (extension !== '.c' && !['.cc', '.cpp', '.cxx'].includes(extension)) {
		void vscode.window.showErrorMessage('BeCoder Runner supports .c, .cc, .cpp, and .cxx files.');
		return undefined;
	}
	const name = path.basename(editor.document.fileName, extension);
	return {
		path: editor.document.fileName,
		name: path.basename(editor.document.fileName),
		directory: path.dirname(editor.document.fileName),
		executable: `${name}.exe`,
		language: extension === '.c' ? 'c' : 'cpp',
	};
}

export type RunnerRequestHandle = {
	readonly resultPath: string;
	readonly requestId: string;
};

export async function writeRunnerRequest(context: vscode.ExtensionContext, source: BeCoderSource, mode: RunnerMode, inputPath?: string): Promise<RunnerRequestHandle> {
	const directory = context.globalStorageUri.fsPath;
	await fs.promises.mkdir(directory, { recursive: true });
	const resultPath = path.join(directory, 'runner-result.json');
	const requestId = crypto.randomUUID();
	const request: RunnerRequest = {
		requestId,
		mode,
		sourcePath: source.path,
		toolchainRoot: integratedToolchainRoot(context),
		compilerPath: integratedCompiler(context, source),
		cCompilerPath: integratedCompiler(context, { ...source, language: 'c' }),
		cStandard: setting('becoder.runner.cStandard', 'c17'),
		cppStandard: setting('becoder.runner.cppStandard', 'c++20'),
		cppFlags: setting('becoder.runner.cppFlags', ['-O2', '-Wall', '-DDEBUG']),
		cFlags: setting('becoder.runner.cFlags', ['-O2', '-Wall', '-DDEBUG']),
		cleanupExecutable: setting('becoder.runner.cleanupExecutable', true),
		inputPath,
		resultPath,
	};
	await fs.promises.unlink(resultPath).catch((): void => { /* There may be no previous result. */ });
	await fs.promises.writeFile(path.join(directory, 'runner-request.json'), JSON.stringify(request), 'utf8');
	return { resultPath, requestId };
}

export function runnerStatePath(context: vscode.ExtensionContext): string {
	return path.join(context.globalStorageUri.fsPath, 'runner-request.json');
}

export function runnerScriptPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, 'resources', 'becoder-runner.ps1');
}

export function runnerCommandPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, 'resources', 'run.cmd');
}
