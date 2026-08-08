/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { selectDisplayText } from './localize';

type DiagnosticStatus = 'ok' | 'warning' | 'error';
type DiagnosticItem = { label: string; status: DiagnosticStatus; detail: string; path?: string };

export function registerToolchainDiagnostics(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand('becoder.openToolchainDiagnostics', () => openToolchainDiagnostics(context)));
}

async function openToolchainDiagnostics(context: vscode.ExtensionContext): Promise<void> {
	// allow-any-unicode-next-line
	const panel = vscode.window.createWebviewPanel('becoder.toolchainDiagnostics', selectDisplayText('BeCoder Toolchain Diagnostics', 'BeCoder 工具链诊断'), vscode.ViewColumn.Active, { enableScripts: true });
	const refresh = async () => panel.webview.postMessage({ type: 'state', value: await collectDiagnostics(context) });
	panel.webview.onDidReceiveMessage(async message => {
		if (message?.type === 'refresh') {
			await refresh();
		} else if (message?.type === 'repair') {
			await vscode.commands.executeCommand('becoder.repairToolchain');
			await refresh();
		} else if (message?.type === 'openPath' && typeof message.path === 'string') {
			const target = fs.existsSync(message.path) && fs.statSync(message.path).isDirectory() ? message.path : path.dirname(message.path);
			await vscode.env.openExternal(vscode.Uri.file(target));
		}
	}, undefined, context.subscriptions);
	panel.webview.html = getHtml();
	await refresh();
}

async function collectDiagnostics(context: vscode.ExtensionContext): Promise<DiagnosticItem[]> {
	const configuration = vscode.workspace.getConfiguration();
	const toolchainRoot = getBeCoderToolchainRoot(context);
	const compiler = process.platform === 'win32'
		? path.join(toolchainRoot, 'becoder-ucrt64', 'bin', 'g++.exe')
		: configuration.get<string>('becoder.toolchain.compilerPath') ?? '';
	const clangd = process.platform === 'win32'
		? path.join(toolchainRoot, 'clangd', 'clangd_22.1.6', 'bin', 'clangd.exe')
		: path.join(toolchainRoot, 'clangd', 'clangd_22.1.6', 'bin', 'clangd');
	return [
		await executableDiagnostic('BeCoder g++ 14.1.0', compiler, ['--version']),
		await executableDiagnostic('BeCoder clangd', clangd, ['--version']),
		// allow-any-unicode-next-line
		{ label: selectDisplayText('C++ semantic service', 'C++ 语义服务'), status: 'ok', detail: selectDisplayText('BeCoder clangd is the only bundled C++ semantic service.', 'BeCoder clangd 是唯一内置的 C++ 语义服务。') },
		// allow-any-unicode-next-line
		{ label: selectDisplayText('C++ standard', 'C++ 标准'), status: configuration.get<string>('becoder.runner.cppStandard') === 'c++20' ? 'ok' : 'warning', detail: configuration.get<string>('becoder.runner.cppStandard') ?? 'c++20' },
	];
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

async function executableDiagnostic(label: string, executable: string, args: string[]): Promise<DiagnosticItem> {
	// allow-any-unicode-next-line
	if (!executable) { return { label, status: 'error', detail: selectDisplayText('Path is not configured.', '路径尚未配置。') }; }
	// allow-any-unicode-next-line
	if (!fs.existsSync(executable)) { return { label, status: 'error', detail: selectDisplayText(`File not found: ${executable}`, `找不到文件：${executable}`), path: executable }; }
	try {
		const output = await run(executable, args);
		// allow-any-unicode-next-line
		return { label, status: 'ok', detail: output.split(/\r?\n/).find(Boolean)?.trim() || selectDisplayText('Executable started.', '可执行文件已启动。'), path: executable };
	} catch (error) {
		return { label, status: 'error', detail: error instanceof Error ? error.message : String(error), path: executable };
	}
}

function run(executable: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => execFile(executable, args, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => error ? reject(error) : resolve(`${stdout}\n${stderr}`)));
}

function getHtml(): string {
	const language = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
	// allow-any-unicode-next-line
	const title = selectDisplayText('BeCoder Toolchain Diagnostics', 'BeCoder 工具链诊断');
	// allow-any-unicode-next-line
	const refresh = selectDisplayText('Refresh', '刷新');
	// allow-any-unicode-next-line
	const repair = selectDisplayText('Repair Toolchain', '修复工具链');
	return `<!doctype html><html lang="${language}"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}main{max-width:900px;margin:auto;padding:32px}h1{font-size:24px}.toolbar{display:flex;gap:8px;margin:20px 0}button{border:0;padding:7px 12px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.list{border:1px solid var(--vscode-editorWidget-border)}.item{display:grid;grid-template-columns:12px 220px 1fr auto;gap:12px;padding:14px;border-bottom:1px solid var(--vscode-editorWidget-border)}.item:last-child{border:0}.dot{width:10px;height:10px;border-radius:50%;margin-top:5px}.ok{background:var(--vscode-testing-iconPassed)}.warning{background:var(--vscode-testing-iconQueued)}.error{background:var(--vscode-testing-iconFailed)}.detail{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}</style></head><body><main><h1>${title}</h1><div class="toolbar"><button id="refresh">${refresh}</button><button id="repair">${repair}</button></div><div id="list" class="list"></div></main><script>const vscode=acquireVsCodeApi();document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('repair').onclick=()=>vscode.postMessage({type:'repair'});window.addEventListener('message',event=>{if(event.data?.type!=='state')return;document.getElementById('list').replaceChildren(...event.data.value.map(item=>{const row=document.createElement('div');row.className='item';row.innerHTML='<span class="dot '+item.status+'"></span><strong></strong><span class="detail"></span>';row.querySelector('strong').textContent=item.label;row.querySelector('.detail').textContent=item.detail;return row;}));});</script></body></html>`;
}
