import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import * as vscode from 'vscode';

type DiagnosticStatus = 'ok' | 'warning' | 'error';
type DiagnosticItem = { label: string; status: DiagnosticStatus; detail: string; path?: string };

export function registerToolchainDiagnostics(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand('becoder.openToolchainDiagnostics', () => openToolchainDiagnostics(context)));
}

async function openToolchainDiagnostics(context: vscode.ExtensionContext): Promise<void> {
	const panel = vscode.window.createWebviewPanel('becoder.toolchainDiagnostics', 'BeCoder Toolchain Diagnostics', vscode.ViewColumn.Active, { enableScripts: true });
	const refresh = async () => panel.webview.postMessage({ type: 'state', value: await collectDiagnostics() });
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

async function collectDiagnostics(): Promise<DiagnosticItem[]> {
	const configuration = vscode.workspace.getConfiguration();
	const compiler = configuration.get<string>('becoder.toolchain.compilerPath') ?? '';
	const clangd = configuration.get<string>('becoder.toolchain.clangdPath') ?? configuration.get<string>('clangd.path') ?? '';
	return [
		await executableDiagnostic('BeCoder g++ 14.1.0', compiler, ['--version']),
		await executableDiagnostic('BeCoder clangd', clangd, ['--version']),
		{ label: 'C++ semantic service', status: 'ok', detail: 'BeCoder clangd is the only bundled C++ semantic service.' },
		{ label: 'C++ standard', status: configuration.get<string>('becoder.runner.cppStandard') === 'c++20' ? 'ok' : 'warning', detail: configuration.get<string>('becoder.runner.cppStandard') ?? 'c++20' },
	];
}

async function executableDiagnostic(label: string, executable: string, args: string[]): Promise<DiagnosticItem> {
	if (!executable) { return { label, status: 'error', detail: 'Path is not configured.' }; }
	if (!fs.existsSync(executable)) { return { label, status: 'error', detail: `File not found: ${executable}`, path: executable }; }
	try {
		const output = await run(executable, args);
		return { label, status: 'ok', detail: output.split(/\r?\n/).find(Boolean)?.trim() || 'Executable started.', path: executable };
	} catch (error) {
		return { label, status: 'error', detail: error instanceof Error ? error.message : String(error), path: executable };
	}
}

function run(executable: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => execFile(executable, args, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => error ? reject(error) : resolve(`${stdout}\n${stderr}`)));
}

function getHtml(): string {
	return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}main{max-width:900px;margin:auto;padding:32px}h1{font-size:24px}.toolbar{display:flex;gap:8px;margin:20px 0}button{border:0;padding:7px 12px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.list{border:1px solid var(--vscode-editorWidget-border)}.item{display:grid;grid-template-columns:12px 220px 1fr auto;gap:12px;padding:14px;border-bottom:1px solid var(--vscode-editorWidget-border)}.item:last-child{border:0}.dot{width:10px;height:10px;border-radius:50%;margin-top:5px}.ok{background:var(--vscode-testing-iconPassed)}.warning{background:var(--vscode-testing-iconQueued)}.error{background:var(--vscode-testing-iconFailed)}.detail{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}</style></head><body><main><h1>BeCoder Toolchain Diagnostics</h1><div class="toolbar"><button id="refresh">Refresh</button><button id="repair">Repair toolchain</button></div><div id="list" class="list"></div></main><script>const vscode=acquireVsCodeApi();document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('repair').onclick=()=>vscode.postMessage({type:'repair'});window.addEventListener('message',event=>{if(event.data?.type!=='state')return;document.getElementById('list').replaceChildren(...event.data.value.map(item=>{const row=document.createElement('div');row.className='item';row.innerHTML='<span class="dot '+item.status+'"></span><strong></strong><span class="detail"></span>';row.querySelector('strong').textContent=item.label;row.querySelector('.detail').textContent=item.detail;return row;}));});</script></body></html>`;
}
