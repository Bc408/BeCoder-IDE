/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ChatHistory } from './history';
import { Connections, connectionError, settingsError } from './connections';
import type { SettingsCommand } from './modelConfiguration';
import { createFileTools, currentFileRoots } from './workspaceFiles';
import { isFilePermission, type FilePermission } from './fileTools';
import { HistoryStore } from './historyStore';
import { AttachmentError, attachmentBudget, captureClipboardImages, checkAttachmentSource, readAttachments, type Attachment, type AttachmentSource } from './attachments';
import { ModelCapabilityError } from './models';

const streamSnapshotIntervalMs = 33;
let shutdown: (() => Promise<void>) | undefined;

export function deactivate(): Promise<void> | undefined { return shutdown?.(); }

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	let view: vscode.WebviewView | undefined;
	let configurationPanel: vscode.WebviewPanel | undefined;
	let settingsStamp = '';
	let timer: ReturnType<typeof setTimeout> | undefined;
	let alive = true;
	const describeError = connectionError;
	let historyUnreadable = false;
	let history: ChatHistory;
	const store = new HistoryStore(context.globalStorageUri.fsPath);
	try {
		history = new ChatHistory(await store.load(), data => store.save(data), schedule, describeError, currentFileRoots);
	} catch {
		historyUnreadable = true;
		history = new ChatHistory(undefined, async () => { throw new Error('unreadable-history'); }, schedule, describeError);
	}
	const session = history.session;
	let attachmentJob: AbortController | undefined;
	const busy = () => session.snapshot.busy || !!attachmentJob;
	const drafts = new Map<string, Attachment[]>();
	const attachments = () => drafts.get(history.snapshot.activeId) ?? [];
	const connectionLog = vscode.window.createOutputChannel(vscode.l10n.t('Beacon Connections'));
	context.subscriptions.push(connectionLog);
	const connections = new Connections(context, schedule, event => connectionLog.appendLine(JSON.stringify(event)));
	const readPermission = (): FilePermission => {
		const value = vscode.workspace.getConfiguration('beacon').get('filePermission');
		return isFilePermission(value) ? value : 'none';
	};
	let permission = readPermission();
	const readWebEnabled = () => vscode.workspace.getConfiguration('beacon').get<boolean>('webEnabled', true) !== false;
	let webEnabled = readWebEnabled();
	let requestNotice: { id: number; text: string } | undefined;
	const request = (beforeId = Infinity) => {
		const roots = currentFileRoots();
		const next = connections.request(createFileTools(permission, roots).execute, permission, roots, webEnabled);
		if (next.capabilities.vision !== 'supported' && session.snapshot.messages.some(message => message.id < beforeId && (message.attachments?.some(item => item.kind === 'image') || message.toolResults?.some(item => item.output.kind === 'image')))) { throw new ModelCapabilityError('vision'); }
		return next;
	};
	let closing: Promise<void> | undefined;
	shutdown = () => {
		alive = false;
		attachmentJob?.abort();
		drafts.clear();
		connections.dispose();
		if (timer) { clearTimeout(timer); }
		return closing ??= history.dispose();
	};
	const publish = () => {
		if (alive) {
			const snapshot = history.snapshot;
			const messages = snapshot.messages.map(message => {
				const visible = { ...message };
				delete visible.toolResults;
				delete visible.protocol;
				if (visible.sources) { visible.sources = visible.sources.map(source => ({ ...source, text: '' })); }
				if (visible.attachments) { visible.attachments = visible.attachments.map(item => ({ ...item, contents: '' })); }
				return visible;
			});
			const message = { type: 'snapshot', ...snapshot, busy: busy(), stopping: snapshot.stopping || attachmentJob?.signal.aborted, messages, attachments: attachments().map(item => ({ ...item, contents: '' })), configured: connections.configured, connection: connections.snapshot, historyUnreadable, permission, webEnabled, requestNotice };
			void view?.webview.postMessage(message);
			if (configurationPanel) {
				const connection = connections.snapshot;
				const stamp = `${connection.revision}:${connection.loading}:${connection.error}:${busy()}`;
				if (settingsStamp !== stamp) { settingsStamp = stamp; void configurationPanel.webview.postMessage({ type: 'settingsSnapshot', settings: connections.settings, busy: busy() }); }
			}
		}
	};
	function schedule(): void {
		if (!timer && alive) { timer = setTimeout(() => { timer = undefined; publish(); }, streamSnapshotIntervalMs); }
	}
	function html(webview: vscode.Webview, surface: 'chat' | 'configuration' = 'chat'): string {
		const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
		webview.options = { enableScripts: true, localResourceRoots: [dist] };
		const nonce = randomBytes(18).toString('base64');
		const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
		return `<!DOCTYPE html><html lang="${vscode.env.language.startsWith('zh') ? 'zh-CN' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${asset('beacon.css')}"></head><body data-surface="${surface}"><div id="root"></div><script nonce="${nonce}" src="${asset('beacon.js')}"></script></body></html>`;
	}
	function receive(message: unknown): void {
		if (!message || typeof message !== 'object') { return; }
		const value = message as { type?: string; text?: string; id?: number | string; conversationId?: string; activeId?: string; url?: string; permission?: unknown; enabled?: unknown; images?: unknown; code?: unknown };
		try { switch (value.type) {
			case 'ready': publish(); break;
			case 'send': if (typeof value.text === 'string') { void send(value.text); } break;
			case 'addFiles': void pickFiles(); break;
			case 'pasteImages': addClipboardImages(value.images, value.activeId); break;
			case 'attachmentInputError': if (value.code === 'image' || value.code === 'budget' || value.code === 'busy') { attachmentNotice(new AttachmentError(value.code)); } break;
			case 'unsupportedDrop': attachmentNotice(new AttachmentError(permission === 'none' ? 'permission' : 'source')); break;
			case 'removeAttachment': if (!busy() && typeof value.id === 'string') { drafts.set(history.snapshot.activeId, attachments().filter(item => item.id !== value.id)); publish(); } break;
			case 'previewAttachment': {
				const item = [...attachments(), ...session.snapshot.messages.flatMap(message => message.attachments ?? [])].find(item => item.id === value.id && item.kind === 'image');
				if (item) { void view?.webview.postMessage({ type: 'attachmentPreview', id: item.id, url: `data:${item.mediaType};base64,${item.contents}` }); }
				break;
			}
			case 'openAttachment': if (typeof value.id === 'string') { void openAttachment(value.id); } break;
			case 'edit': if (!busy() && !historyUnreadable && connections.configured && typeof value.id === 'number' && typeof value.text === 'string') { const next = request(value.id + 1); void session.edit(value.id, value.text, next.generate, next.source, next.files).finally(publish); } else { publish(); } break;
			case 'regenerate': if (!busy() && !historyUnreadable && connections.configured && typeof value.id === 'number') { const next = request(value.id); void session.regenerate(value.id, next.generate, next.source, next.files).finally(publish); } else { publish(); } break;
			case 'continue': if (!busy() && !historyUnreadable && connections.configured && typeof value.id === 'number') { const next = request(); void session.resume(value.id, next.generate, next.source, next.files).finally(publish); } else { publish(); } break;
			case 'setPermission':
				if (isFilePermission(value.permission)) {
					void setPermission(value.permission);
				}
				break;
			case 'setWebEnabled': if (typeof value.enabled === 'boolean') { void setWebEnabled(value.enabled); } break;
			case 'stop': attachmentJob?.abort(); session.stop(); publish(); break;
			case 'clear':
				if (!busy() && !historyUnreadable) {
					history.newConversation();
					if (timer) { clearTimeout(timer); timer = undefined; }
					publish();
				}
				break;
			case 'openHistory': if (!busy() && typeof value.conversationId === 'string') { history.open(value.conversationId); publish(); } break;
			case 'renameHistory': if (typeof value.conversationId === 'string') { void manageHistory(value.conversationId, false); } break;
			case 'deleteHistory': if (typeof value.conversationId === 'string') { void manageHistory(value.conversationId, true); } break;
			case 'saveHistory': if (!historyUnreadable) { void history.flush(); } break;
			case 'settings': openSettings(); break;
			case 'selectModel': void changeSettings(message, view?.webview); break;
			case 'copy': {
				const item = session.snapshot.messages.find(item => item.id === value.id);
				if (item) { void vscode.env.clipboard.writeText(item.text); }
				break;
			}
			case 'link': if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) { void vscode.env.openExternal(vscode.Uri.parse(value.url)); } break;
		} } catch (error) { attachmentNotice(error); }
	}
	async function setPermission(value: FilePermission): Promise<void> {
		try { await vscode.workspace.getConfiguration('beacon').update('filePermission', value, vscode.ConfigurationTarget.Global); }
		catch { requestNotice = { id: Date.now(), text: vscode.l10n.t('Could not save the file permission. Please try again.') }; publish(); }
	}
	async function changeSettings(message: unknown, webview: vscode.Webview | undefined): Promise<void> {
		const command = message as SettingsCommand;
		if (!command || typeof command !== 'object' || !Number.isSafeInteger(command.requestId)) { return; }
		try {
			await connections.apply(command);
			if (!alive) { return; }
			requestNotice = { id: Date.now(), text: busy() ? vscode.l10n.t('Model settings changes will take effect in the next response.') : vscode.l10n.t('Model settings saved.') };
			publish();
			void webview?.postMessage({ type: 'settingsResult', requestId: command.requestId, ok: true });
		} catch (error) {
			const text = settingsError(error);
			if (webview === view?.webview) { requestNotice = { id: Date.now(), text }; }
			publish();
			void webview?.postMessage({ type: 'settingsResult', requestId: command.requestId, ok: false, error: text });
		}
	}
	function openSettings(): void {
		if (configurationPanel) { configurationPanel.reveal(vscode.ViewColumn.Active); return; }
		const panel = vscode.window.createWebviewPanel('becoder.beacon.settings', vscode.l10n.t('Beacon Settings'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
		configurationPanel = panel;
		settingsStamp = '';
		panel.webview.html = html(panel.webview, 'configuration');
		const received = panel.webview.onDidReceiveMessage((message: unknown) => {
			if (!message || typeof message !== 'object') { return; }
			const type = (message as { type?: string }).type;
			if (type === 'ready') { settingsStamp = ''; publish(); }
			else if (type === 'openChat') { void vscode.commands.executeCommand('becoder.beacon.chat.focus'); }
			else { void changeSettings(message, panel.webview); }
		});
		const disposed = panel.onDidDispose(() => { received.dispose(); disposed.dispose(); if (configurationPanel === panel) { configurationPanel = undefined; } });
		context.subscriptions.push(panel, received, disposed);
		publish();
	}
	function attachmentNotice(error: unknown): void {
		const text = error instanceof AttachmentError ? error.code === 'busy' ? vscode.l10n.t('Pause the response before adding attachments.') : error.code === 'permission' ? vscode.l10n.t('File access is disabled. Change the permission before adding or sending attachments.') : error.code === 'source' ? vscode.l10n.t('Workspace permission only accepts files dragged from BeCoder. Explorer drops and the file picker require computer permission.') : error.code === 'image' ? vscode.l10n.t('The image is invalid or unsupported. Use PNG, JPEG, WebP or GIF, up to 4 MiB each.') : error.code === 'budget' ? vscode.l10n.t('Attachments exceed the limit: 8 MiB in total, up to 64 files.') : vscode.l10n.t('Could not read attachment {0}. Check its location, permissions and whether it is a private file.', error.file) : describeError(error);
		requestNotice = { id: Date.now(), text }; publish();
	}
	function addClipboardImages(images: unknown, activeId: string | undefined): void {
		if (busy()) { attachmentNotice(new AttachmentError('busy')); return; }
		if (historyUnreadable || activeId !== history.snapshot.activeId) { publish(); return; }
		try {
			const captured = captureClipboardImages(images);
			const next = [...attachments(), ...captured];
			if (next.length > 64 || next.reduce((size, item) => size + Buffer.byteLength(item.contents, 'utf8'), 0) > attachmentBudget) { throw new AttachmentError('budget'); }
			drafts.set(activeId, next); publish();
		} catch (error) { attachmentNotice(error); }
	}
	async function addResources(uris: readonly vscode.Uri[], source: AttachmentSource): Promise<void> {
		if (busy() || historyUnreadable) { return; }
		const controller = new AbortController();
		attachmentJob = controller;
		publish();
		try {
			checkAttachmentSource(permission, source);
			if (!uris.length || uris.some(uri => uri.scheme !== 'file')) { throw new AttachmentError('read'); }
			const captured = await readAttachments(uris.map(uri => ({ path: uri.fsPath, source })), permission, createFileTools(permission).execute, controller.signal);
			controller.signal.throwIfAborted();
			const merged = new Map(attachments().map(item => [item.path, item]));
			for (const item of captured) { merged.set(item.path, item); }
			const next = [...merged.values()];
			if (next.length > 64 || next.reduce((size, item) => size + Buffer.byteLength(item.contents, 'utf8'), 0) > attachmentBudget) { throw new AttachmentError('budget'); }
			drafts.set(history.snapshot.activeId, next);
		} catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
	}
	async function openAttachment(id: string): Promise<void> {
		const activeId = history.snapshot.activeId;
		const item = [...attachments(), ...session.snapshot.messages.flatMap(message => message.attachments ?? [])].find(item => item.id === id);
		if (!item || item.kind === 'image') { return; }
		const selectedPermission = permission;
		const roots = currentFileRoots();
		try {
			checkAttachmentSource(selectedPermission, item.source);
			const result = await createFileTools(selectedPermission, roots).execute({ operation: 'read', path: item.path }, new AbortController().signal);
			if (!result.ok) { throw new AttachmentError('read', item.name); }
			if (!alive || history.snapshot.activeId !== activeId) { return; }
			if (permission !== selectedPermission || JSON.stringify(currentFileRoots()) !== JSON.stringify(roots)) { throw new AttachmentError('read', item.name); }
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.path), { preview: true, preserveFocus: true });
		} catch (error) { if (alive) { attachmentNotice(error); } }
	}
	async function pickFiles(): Promise<void> {
		if (busy() || historyUnreadable) { return; }
		if (permission !== 'computer') { attachmentNotice(new AttachmentError(permission === 'none' ? 'permission' : 'source')); return; }
		const controller = new AbortController();
		attachmentJob = controller; publish();
		let uris: vscode.Uri[] | undefined;
		try { uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true, openLabel: vscode.l10n.t('Add files'), title: vscode.l10n.t('Add files to Beacon') }); }
		catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
		// Permission may have changed while the native dialog was open.
		if (alive && !controller.signal.aborted && uris?.length) { await addResources(uris, 'picker'); }
	}
	async function send(text: string): Promise<void> {
		if (busy() || historyUnreadable || !connections.configured || text.length > 32000 || (!text.trim() && !attachments().length)) { publish(); return; }
		const selectedPermission = permission;
		const refs = attachments();
		const activeId = history.snapshot.activeId;
		const controller = new AbortController();
		attachmentJob = controller; publish();
		let completion: Promise<void> | undefined;
		try {
			const next = request();
			if (refs.some(item => item.kind === 'image') && next.capabilities.vision !== 'supported') { throw new ModelCapabilityError('vision'); }
			const captured = await readAttachments(refs, selectedPermission, next.files, controller.signal);
			controller.signal.throwIfAborted();
			if (captured.some(item => item.kind === 'image') && next.capabilities.vision !== 'supported') { throw new ModelCapabilityError('vision'); }
			completion = session.send(text, next.generate, next.source, next.files, captured);
			drafts.delete(activeId);
			void view?.webview.postMessage({ type: 'sendAccepted', text, activeId, conversationId: history.snapshot.activeId });
		} catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
		await completion;
		publish();
	}
	async function setWebEnabled(value: boolean): Promise<void> {
		try { await vscode.workspace.getConfiguration('beacon').update('webEnabled', value, vscode.ConfigurationTarget.Global); }
		catch { requestNotice = { id: Date.now(), text: vscode.l10n.t('Could not save web access. Please try again.') }; publish(); }
	}
	async function manageHistory(id: string, remove: boolean): Promise<void> {
		if (busy() || historyUnreadable) { return; }
		const item = history.snapshot.history.find(item => item.id === id);
		if (!item) { return; }
		if (remove) {
			history.remove(id);
		} else {
			const title = await vscode.window.showInputBox({ title: vscode.l10n.t('Rename chat'), value: item.title, ignoreFocusOut: true, validateInput: value => value.trim() && value.trim().length <= 80 ? undefined : vscode.l10n.t('Enter a title between 1 and 80 characters.') });
			if (title !== undefined) { history.rename(id, title); }
		}
	}
	context.subscriptions.push(
		vscode.window.onDidChangeWindowState(async state => {
			if (state.focused && !busy() && !historyUnreadable && !history.snapshot.saveFailed) {
				try {
					await history.flush();
					const data = await store.read();
					if (history.refresh(data)) { store.useBaseline(data); }
				} catch { /* Keep current data; a later save reports storage failures. */ }
			}
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('beacon.filePermission')) {
				const next = readPermission();
				if (next !== permission && busy()) { requestNotice = { id: Date.now(), text: vscode.l10n.t('Permission changes will take effect in the next response.') }; }
				permission = next; publish();
			}
			if (event.affectsConfiguration('beacon.webEnabled')) {
				const next = readWebEnabled();
				if (next !== webEnabled && busy()) { requestNotice = { id: Date.now(), text: vscode.l10n.t('Web access changes will take effect in the next response.') }; }
				webEnabled = next; publish();
			}
		}),
		{ dispose: () => { void shutdown?.(); } },
		vscode.commands.registerCommand('becoder.beacon.open', async () => {
			if (view?.visible) {
				await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
			} else {
				await vscode.commands.executeCommand('becoder.beacon.chat.focus');
			}
		}),
		vscode.commands.registerCommand('becoder.beacon.settings', openSettings),
		vscode.window.registerWebviewViewProvider('becoder.beacon.chat', {
			resolveWebviewView(resolved) {
				view = resolved;
				const webview = resolved.webview;
				webview.html = html(webview);
				const receiveDisposable = webview.onDidReceiveMessage(receive);
				const dropDisposable = webview.onDidDropResources?.(event => { void addResources(event.uris, event.isExternal ? 'external' : 'internal'); });
				const disposed = resolved.onDidDispose(() => { receiveDisposable.dispose(); dropDisposable?.dispose(); disposed.dispose(); if (view === resolved) { view = undefined; } });
				publish();
			}
		}, { webviewOptions: { retainContextWhenHidden: true } })
	);
	void connections.refresh();
}
