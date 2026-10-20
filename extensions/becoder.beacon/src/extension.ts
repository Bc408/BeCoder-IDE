/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes, randomUUID } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatHistory, type Conversation, type HistoryItem } from './history';
import { Connections, connectionError, settingsError } from './connections';
import type { SettingsCommand } from './modelConfiguration';
import { createFileTools } from './workspaceFiles';
import { BeaconContextClient, withPdfPages, type PdfPageApi, type BeaconHistoryBinding } from './context';
import { ContextTools, redactContext } from './contextTools';
import { NotebookTools } from './notebookTools';
import type { NotebookEditApi } from '../../becoder.notebook/src/editApi';
import { isFilePermission, type FilePermission } from './fileTools';
import { AttachmentError, attachmentBudget, captureClipboardImages, checkAttachmentSource, readAttachments, type Attachment, type AttachmentSource } from './attachments';
import { ModelCapabilityError } from './models';

const streamSnapshotIntervalMs = 33;
const sameWorkspacePath = (left: string, right: string) => process.platform === 'win32' ? path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase() : path.normalize(left) === path.normalize(right);
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
	const native = new BeaconContextClient(withPdfPages(async (operation, input) => vscode.commands.executeCommand('_becoder.beacon.context', operation, input), () => {
		const pdf = vscode.extensions.getExtension<PdfPageApi>('mathematic.vscode-pdf');
		return pdf?.isActive && typeof pdf.exports?.listPages === 'function' && typeof pdf.exports?.readPage === 'function' ? pdf.exports : undefined;
	}));
	let binding: BeaconHistoryBinding = { data: { version: 1, activeId: '', conversations: [] }, save: async data => data };
	let history = new ChatHistory(binding.data, binding.save, schedule, describeError);
	let session = history.session;
	let temporary = true;
	// The displayed conversation keeps its owner until a send crosses storage classes.
	let modeDraft: { text: string; attachments: Attachment[] } | undefined;
	let modeHistory: HistoryItem[] | undefined;
	let screen: 'home' | 'conversation' = 'home';
	let generation = 0;
	let inputRevision = 0;
	let acceptedInputView: { previous: string; current: string; editRevision?: number } | undefined;
	let draftTail = Promise.resolve();
	const pendingWork = new Set<Promise<void>>();
	const track = (work: Promise<void>): Promise<void> => {
		const tracked = work.finally(() => pendingWork.delete(tracked)); pendingWork.add(tracked); return tracked;
	};
	const interruptedDrafts = new Map<string, { conversation: Conversation; revision?: number }>();
	const homes = new Map<string, { id?: string; hasDraft: boolean }>();
	const temporaryDrafts = new Map<string, { text: string; attachments: Attachment[] }>();
	try {
		await native.setBusy(false);
		await native.release();
		binding = await native.bindHistory();
		history = new ChatHistory(binding.data, binding.save, schedule, describeError, () => native.roots);
		session = history.session; temporary = !native.consumingWorkspace;
	} catch {
		historyUnreadable = true;
	}
	let attachmentJob: AbortController | undefined;
	let workspaceJob = false;
	let workspaceSettled = Promise.resolve();
	const busy = () => session.snapshot.busy || !!attachmentJob || workspaceJob;
	let nativeBusy: boolean | undefined;
	let busyTail = Promise.resolve();
	const syncBusy = () => {
		// Draft debounce does not disable the composer; navigation explicitly flushes it.
		const value = session.snapshot.busy || !!attachmentJob;
		if (value !== nativeBusy) { nativeBusy = value; busyTail = busyTail.then(() => native.setBusy(value)).catch(() => { nativeBusy = undefined; }); }
	};
	const viewKey = () => `${native.state.slot}:${native.state.root ?? ''}:${screen}:${generation}`;
	const draft = () => modeDraft ?? (temporary ? temporaryDrafts.get(native.state.root ?? '') ?? { text: '', attachments: [] } : history.draft);
	const attachments = () => draft().attachments;
	const home = () => homes.get(native.state.root ?? '');
	const recordView = async () => {
		if (!native.consumingWorkspace || modeDraft) { return; }
		if (screen === 'home') { homes.set(native.state.root!, { id: history.snapshot.activeId || undefined, hasDraft: !!(draft().text || attachments().length) }); }
		await native.setView({ screen, id: screen === 'conversation' ? history.snapshot.activeId || undefined : undefined, homeId: home()?.id });
	};
	const setDraft = async (text: string, items: Attachment[]) => {
		if (modeDraft) { modeDraft = { text, attachments: items }; }
		else if (temporary) { temporaryDrafts.set(native.state.root ?? '', { text, attachments: items }); }
		else {
			if (!history.snapshot.activeId && (text.length || items.length)) { await replaceHistory(await native.bindHistory({ id: randomUUID(), create: true })); }
			history.setDraft(text, items);
		}
		await recordView();
	};
	const updateDraft = (text: string, expected: string) => {
		if (expected === acceptedInputView?.previous && viewKey() === acceptedInputView.current) { expected = acceptedInputView.current; }
		if (text.length > 32000 || expected !== viewKey() || historyUnreadable) { return; }
		inputRevision++;
		draftTail = draftTail.then(async () => { if (expected !== viewKey()) { return; } await setDraft(text, attachments()); publish(); }).catch(error => attachmentNotice(error));
	};
	const connectionLog = vscode.window.createOutputChannel(vscode.l10n.t('Beacon Connections'));
	context.subscriptions.push(connectionLog);
	const connections = new Connections(context, schedule, event => connectionLog.appendLine(JSON.stringify(event)));
	let permission = native.permission;
	const readWebEnabled = () => vscode.workspace.getConfiguration('beacon').get<boolean>('webEnabled', true) !== false;
	let webEnabled = readWebEnabled();
	let requestNotice: { id: number; text: string } | undefined;
	const canSend = () => !historyUnreadable && (modeDraft ? !binding.root || binding.root === native.state.root : temporary ? !native.consumingWorkspace : !history.snapshot.activeId || (!!native.consumingWorkspace && binding.root === native.state.root && native.state.activeId === history.snapshot.activeId));
	const request = async (beforeId = Infinity) => {
		if (connections.testing) { throw new Error('settings-pending'); }
		await native.refreshForRequest(); permission = native.permission;
		if (!canSend()) { throw new Error('beacon-conversation-owner'); }
		const roots = native.roots;
		const scope = native.captureScope();
		const requestHistory = history;
		const files = createFileTools(permission, roots, { protectedRoots: [context.globalStorageUri.fsPath] }).execute;
		const notebooks = permission === 'none' ? undefined : new NotebookTools(async () => { const extension = vscode.extensions.getExtension<NotebookEditApi>('becoder.notebook'); if (!extension) { throw new Error('notebook-extension-unavailable'); } return extension.activate(); }, scope);
		const next = connections.request((input, signal) => native.guardRead(scope, files, input, signal), permission, roots, webEnabled, new ContextTools(native, scope, [context.globalStorageUri.fsPath], requestHistory.contextSnapshots, snapshot => requestHistory.captureContext(snapshot)), notebooks);
		if (next.capabilities.vision !== 'supported' && session.snapshot.messages.some(message => message.id < beforeId && (message.attachments?.some(item => item.kind === 'image') || message.toolResults?.some(item => item.output.kind === 'image')))) { throw new ModelCapabilityError('vision'); }
		return next;
	};
	let closing: Promise<void> | undefined;
	shutdown = () => {
		alive = false;
		attachmentJob?.abort();
		session.stop();
		connections.dispose();
		if (timer) { clearTimeout(timer); }
		return closing ??= (async () => {
			await Promise.allSettled([...pendingWork]); await workspaceSettled; await draftTail;
			try { await recordView(); }
			finally { await history.dispose(); await busyTail; await native.setBusy(false); await native.release(); }
		})();
	};
	const publish = () => {
		if (alive) {
			syncBusy();
			const snapshot = history.snapshot;
			const messages = snapshot.messages.map(message => {
				const visible = { ...message };
				delete visible.toolResults;
				delete visible.protocol;
				if (visible.sources) { visible.sources = visible.sources.map(source => ({ ...source, text: '' })); }
				if (visible.attachments) { visible.attachments = visible.attachments.map(item => ({ ...item, contents: '' })); }
				return visible;
			});
			const message = { type: 'snapshot', ...snapshot, modeTransitionPending: !!modeDraft, acceptedInputView: acceptedInputView?.current === viewKey() ? acceptedInputView : undefined, screen, history: native.consumingWorkspace ? modeDraft && temporary ? modeHistory ?? [] : snapshot.history : [], context: native.state, canSend: canSend(), temporary: !native.consumingWorkspace, viewKey: viewKey(), draftText: draft().text, homeHasDraft: home()?.hasDraft ?? false, busy: busy(), navigationBusy: workspaceJob, responseBusy: session.snapshot.busy, stopping: snapshot.stopping || attachmentJob?.signal.aborted, messages, attachments: attachments().map(item => ({ ...item, contents: '' })), configured: connections.configured, connection: connections.snapshot, historyUnreadable, permission, webEnabled, requestNotice };
			void view?.webview.postMessage(message);
			if (configurationPanel) {
				const connection = connections.snapshot;
				const stamp = `${JSON.stringify(connections.settings)}:${connection.revision}:${connection.loading}:${connection.error}:${busy()}:${JSON.stringify(native.state)}`;
				if (settingsStamp !== stamp) { settingsStamp = stamp; void configurationPanel.webview.postMessage({ type: 'settingsSnapshot', settings: connections.settings, context: native.state, busy: busy() }); }
			}
		}
	};
	function schedule(): void {
		// Capture native busy before a workspace command can overtake this scheduled UI update.
		if (typeof syncBusy === 'function') { syncBusy(); }
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
		if (!alive) { return; }
		if (!message || typeof message !== 'object') { return; }
		const value = message as { type?: string; root?: string; text?: string; viewKey?: string; editRevision?: number; id?: number | string; conversationId?: string; activeId?: string; url?: string; permission?: unknown; enabled?: unknown; images?: unknown; code?: unknown };
		try { switch (value.type) {
			case 'ready': publish(); break;
			case 'draft': if (typeof value.text === 'string' && typeof value.viewKey === 'string') { updateDraft(value.text, value.viewKey); } break;
			case 'send': if (typeof value.text === 'string') { void track(send(value.text, value.editRevision)); } break;
			case 'addFiles': void pickFiles(); break;
			case 'pasteImages': addClipboardImages(value.images, value.activeId); break;
			case 'attachmentInputError': if (value.code === 'image' || value.code === 'budget' || value.code === 'busy') { attachmentNotice(new AttachmentError(value.code)); } break;
			case 'unsupportedDrop': attachmentNotice(new AttachmentError('source')); break;
			case 'removeAttachment': if (!busy() && typeof value.id === 'string') {
				if (temporary || modeDraft) { void setDraft(draft().text, attachments().filter(item => item.id !== value.id)); publish(); }
				else { draftTail = draftTail.then(async () => { await setDraft(draft().text, attachments().filter(item => item.id !== value.id)); publish(); }).catch(attachmentNotice); }
			} break;
			case 'previewAttachment': {
				const item = [...attachments(), ...session.snapshot.messages.flatMap(message => message.attachments ?? [])].find(item => item.id === value.id && item.kind === 'image');
				if (item) { void view?.webview.postMessage({ type: 'attachmentPreview', id: item.id, url: `data:${item.mediaType};base64,${item.contents}` }); }
				break;
			}
			case 'openAttachment': if (typeof value.id === 'string') { void openAttachment(value.id); } break;
			case 'edit': case 'regenerate': case 'continue': if (typeof value.id === 'number') { void track(respond(value.type, value.id, value.text)); } break;
			case 'chooseWorkspace': if (screen === 'home') { void chooseWorkspace(); } break;
			case 'selectWorkspace': if (screen === 'home' && typeof value.root === 'string') { void workspaceAction(() => selectWorkspace(value.root!)); } break;
			case 'clearWorkspace': if (screen === 'home') { void workspaceAction(clearWorkspace); } break;
			case 'removeRecentWorkspace': if (screen === 'home' && typeof value.root === 'string') { void workspaceAction(() => removeRecentWorkspace(value.root!)); } break;
			case 'setPermission':
				if (isFilePermission(value.permission)) {
					void setPermission(value.permission);
				}
				break;
			case 'setWebEnabled': if (typeof value.enabled === 'boolean') { void setWebEnabled(value.enabled); } break;
			case 'stop': attachmentJob?.abort(); session.stop(); publish(); break;
			case 'back':
				void workspaceAction(returnHome);
				break;
			case 'newChat': void workspaceAction(() => screen === 'home' ? clearHome() : returnHome()); break;
			case 'openHistory': if (screen === 'home' && native.consumingWorkspace && typeof value.conversationId === 'string') { void workspaceAction(() => openHistory(value.conversationId!)); } break;
			case 'renameHistory': if (screen === 'home' && native.consumingWorkspace && typeof value.conversationId === 'string') { void manageHistory(value.conversationId, false); } break;
			case 'deleteHistory': if (screen === 'home' && native.consumingWorkspace && typeof value.conversationId === 'string') { void manageHistory(value.conversationId, true); } break;
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
		await workspaceAction(async () => {
			if (value === native.permission) { return; }
			// Freeze the source before IPC; edits arriving during the switch belong
			// to the same live composer, never to a stale captured input version.
			modeDraft = structuredClone(draft());
			try { await native.setMode(value === 'none' ? 'blackout' : value === 'workspace' ? 'spot' : 'flood', true); }
			finally {
				await draftTail; permission = native.permission;
				if (temporary === !native.consumingWorkspace) {
					const current = structuredClone(draft()); modeDraft = undefined;
					await setDraft(current.text, current.attachments); await flushHistory();
				}
			}
			modeHistory = modeDraft && temporary && native.consumingWorkspace ? (await native.metadata()).conversations.map(({ id, title, updatedAt, workspace }) => ({ id, title, updatedAt, workspace })) : undefined;
		});
	}
	async function flushHistory(): Promise<void> {
		await history.flush(); syncBusy(); await busyTail;
		if (history.snapshot.saveFailed) { throw new Error('beacon-unsaved-history'); }
	}
	async function replaceHistory(next: BeaconHistoryBinding): Promise<void> {
		await history.dispose();
		const interrupted = history.currentConversation;
		if (binding.root && interrupted && history.snapshot.saveFailed) {
			interruptedDrafts.set(`${binding.root}:${interrupted.id}`, { conversation: interrupted, revision: binding.revision });
			attachmentNotice(new Error('beacon-unsaved-history'));
		}
		binding = next;
		const key = next.root && next.data.activeId ? `${next.root}:${next.data.activeId}` : undefined;
		const recovered = key ? interruptedDrafts.get(key) : undefined;
		const canRecover = recovered && recovered.revision === next.revision;
		const data = canRecover ? { ...next.data, conversations: next.data.conversations.map(item => item.id === recovered.conversation.id ? recovered.conversation : item) } : next.data;
		history = new ChatHistory(data, next.save, schedule, describeError, () => native.roots);
		session = history.session; temporary = !native.consumingWorkspace; historyUnreadable = false;
		permission = native.permission;
		if (canRecover) {
			const pending = history.draft; history.setDraft(pending.text, pending.attachments); await history.flush();
			if (!history.snapshot.saveFailed) { interruptedDrafts.delete(key!); }
		}
	}
	async function workspaceAction(action: () => Promise<void>): Promise<void> {
		if (!alive || busy()) { publish(); return; }
		let settled!: () => void;
		workspaceSettled = new Promise<void>(resolve => { settled = resolve; });
		workspaceJob = true; publish();
		try {
			await draftTail; await flushHistory();
			await native.refresh();
			if (native.state.busy) { throw new Error('beacon-busy'); }
			await recordView(); await action();
		}
		catch (error) { attachmentNotice(error); }
		finally { workspaceJob = false; settled(); publish(); }
	}
	async function selectWorkspace(root: string): Promise<void> {
		if (screen !== 'home') { throw new Error('beacon-workspace-home-only'); }
		if (modeDraft) { await returnHome(); await flushHistory(); }
		await native.select(root);
		await native.release();
		await replaceHistory(await native.bindHistory());
		await restoreWorkspace(false);
	}
	async function clearWorkspace(): Promise<void> {
		if (modeDraft) { await returnHome(); await flushHistory(); }
		await native.clearWorkspace();
		await replaceHistory(await native.bindHistory());
		screen = 'home';
		generation++;
	}
	async function removeRecentWorkspace(root: string): Promise<void> {
		const currentRoot = native.state.root;
		const clearingCurrent = !!currentRoot && sameWorkspacePath(currentRoot, root);
		await native.removeRecentWorkspace(root);
		if (clearingCurrent) { await replaceHistory(await native.bindHistory()); }
		screen = 'home';
		if (clearingCurrent) { generation++; }
	}
	async function chooseWorkspace(): Promise<void> {
		await workspaceAction(async () => {
			const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: vscode.l10n.t('Select Beacon workspace'), openLabel: vscode.l10n.t('Select workspace') });
			if (selected?.[0]?.scheme === 'file') { await selectWorkspace(selected[0].fsPath); }
		});
	}
	async function openHistory(id: string): Promise<void> {
		if (modeDraft) { await returnHome(); await flushHistory(); }
		await native.refresh();
		if (!native.consumingWorkspace) { throw new Error('beacon-mode-unavailable'); }
		await recordView();
		await replaceHistory(await native.bindHistory({ id }));
		screen = 'conversation';
		generation++; await recordView();
	}
	async function returnHome(): Promise<void> {
		const carried = modeDraft;
		await native.release();
		await replaceHistory(await native.bindHistory());
		screen = 'home';
		const id = home()?.id;
		if (native.consumingWorkspace && id) {
			try { await replaceHistory(await native.bindHistory({ id })); }
			catch (error) { if (!(error instanceof Error) || !['conversation-open', 'beacon-missing-conversation'].includes(error.message)) { throw error; } homes.delete(native.state.root!); }
		}
		if (carried) {
			await draftTail;
			const current = structuredClone(draft()); modeDraft = undefined;
			try { await setDraft(current.text, current.attachments); }
			catch (error) { modeDraft = current; throw error; }
		}
		generation++; await recordView();
	}
	async function clearHome(): Promise<void> {
		if (modeDraft) { await returnHome(); }
		const current = history.currentConversation;
		await setDraft('', []); await flushHistory();
		if (native.consumingWorkspace && current?.draftOnly) { await native.remove(current.id); }
		if (temporary) { temporaryDrafts.delete(native.state.root ?? ''); }
		homes.delete(native.state.root ?? '');
		await native.release(); await replaceHistory(await native.bindHistory());
		screen = 'home'; generation++; await recordView();
	}
	async function restoreWorkspace(details: boolean): Promise<void> {
		screen = 'home';
		if (native.consumingWorkspace) {
			const saved = await native.resume();
			const root = native.state.root!;
			const homeId = home()?.id ?? saved?.homeId;
			if (homeId) {
				try {
					await replaceHistory(await native.bindHistory({ id: homeId }));
					homes.set(root, { id: homeId, hasDraft: !!(draft().text || attachments().length) });
				} catch (error) {
					if (!(error instanceof Error) || !['conversation-open', 'beacon-missing-conversation'].includes(error.message)) { throw error; }
					homes.delete(root);
				}
			}
			if (details && saved?.screen === 'conversation' && saved.id) {
				await native.release(); await replaceHistory(await native.bindHistory());
				try { await replaceHistory(await native.bindHistory({ id: saved.id })); screen = 'conversation'; }
				catch (error) {
					if (!(error instanceof Error) || !['conversation-open', 'beacon-missing-conversation'].includes(error.message)) { throw error; }
					// An occupied automatic resume returns to an explicitly blank home.
					homes.delete(root);
				}
			}
		}
		generation++; await recordView();
	}
	async function respond(kind: string, id: number, text?: string): Promise<void> {
		if (modeDraft) { requestNotice = { id: Date.now(), text: vscode.l10n.t('Send a new question to inherit this context, or switch back to the original mode to change earlier messages.') }; publish(); return; }
		if (busy() || native.state.runtimeBusy || !canSend() || !connections.configured) { publish(); return; }
		const controller = new AbortController(); attachmentJob = controller; publish();
		let completion: Promise<void> | undefined;
		try {
			const next = await request(kind === 'edit' ? id + 1 : kind === 'regenerate' ? id : Infinity);
			controller.signal.throwIfAborted();
			completion = kind === 'edit' && typeof text === 'string' ? session.edit(id, text, next.generate, next.source, next.files) : kind === 'regenerate' ? session.regenerate(id, next.generate, next.source, next.files) : session.resume(id, next.generate, next.source, next.files);
		} catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
		await completion; publish();
	}
	let refreshing: Promise<void> | undefined;
	let refreshPending = false;
	function refreshContext(): Promise<void> {
		if (!alive) { return Promise.resolve(); }
		refreshPending = true;
		return refreshing ??= (async () => {
			try {
				do {
					refreshPending = false;
					await native.refresh(); permission = native.permission;
					if ((!modeDraft || !native.state.usable) && !temporary && !native.consumingWorkspace && !busy()) { await returnHome(); }
					else if (!modeDraft && temporary && native.consumingWorkspace && !busy()) { await replaceHistory(await native.bindHistory()); await restoreWorkspace(false); }
					if (!modeDraft && !busy() && !history.snapshot.persisting && !history.snapshot.saveFailed && !historyUnreadable && native.consumingWorkspace && binding.root === native.state.root) { history.refresh(await native.metadata(history.currentConversation)); }
				} while (refreshPending && alive);
			} catch (error) { attachmentNotice(error); }
			finally { refreshing = undefined; publish(); }
		})();
	}
	async function changeSettings(message: unknown, webview: vscode.Webview | undefined): Promise<void> {
		const command = message as SettingsCommand;
		if (!command || typeof command !== 'object' || !Number.isSafeInteger(command.requestId)) { return; }
		try {
			if (command.type === 'testProvider' && (busy() || native.state.runtimeBusy)) { throw new Error('settings-pending'); }
			await connections.apply(command);
			if (!alive) { return; }
			if (['saveConnection', 'saveModel', 'confirmModels', 'removeModel', 'toggleProvider', 'selectModel'].includes(command.type)) { requestNotice = { id: Date.now(), text: busy() ? vscode.l10n.t('Model settings changes will take effect in the next response.') : vscode.l10n.t('Model settings saved.') }; }
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
		const disposed = panel.onDidDispose(() => { connections.closeSettings(); received.dispose(); disposed.dispose(); if (configurationPanel === panel) { configurationPanel = undefined; } });
		context.subscriptions.push(panel, received, disposed);
		publish();
	}
	function attachmentNotice(error: unknown): void {
		const contextErrors: Record<string, string> = {
			'beacon-runtime-busy': vscode.l10n.t('Wait for the current run to finish before sending to Beacon.'),
			'beacon-busy': vscode.l10n.t('Finish the current response, run or save before switching the Beacon workspace.'),
			'conversation-open': vscode.l10n.t('This chat is already open in another window.'),
			'beacon-workspace-unavailable': vscode.l10n.t('The selected Beacon workspace is unavailable. Restore it or choose a folder again.'),
			'beacon-workspace-changed': vscode.l10n.t('The workspace directory was replaced. Choose it again before saving.'),
			'beacon-invalid-assets': vscode.l10n.t('The .beaconWork location is not an ordinary usable directory. Existing files have not been replaced.'),
			'beacon-unsaved-history': vscode.l10n.t('Save the current chat successfully before changing its context.'),
			'beacon-history-conflict': vscode.l10n.t('The saved chat changed. Your local messages are retained; reopen it after resolving the change.'),
			'beacon-conversation-owner': vscode.l10n.t('Open or start a chat in the current Beacon workspace before asking.'),
			'beacon-mode-unavailable': vscode.l10n.t('A usable workspace allows Spot or Flood. Without one, only Blackout is available.'),
			'beacon-write-busy': vscode.l10n.t('Another window is saving this workspace data. Try again shortly.')
		};
		const contextText = error instanceof Error ? contextErrors[error.message] : undefined;
		const text = error instanceof AttachmentError ? error.code === 'busy' ? vscode.l10n.t('Pause the response before adding attachments.') : error.code === 'permission' || error.code === 'source' ? vscode.l10n.t('Could not identify local files in this drop. Use Add files or paste an image.') : error.code === 'image' ? vscode.l10n.t('The image is invalid or unsupported. Use PNG, JPEG, WebP or GIF, up to 4 MiB each.') : error.code === 'budget' ? vscode.l10n.t('Attachments exceed the limit: 8 MiB in total, up to 64 files.') : vscode.l10n.t('Could not read attachment {0}. Check its location, permissions and whether it is a private file.', error.file) : describeError(error);
		requestNotice = { id: Date.now(), text: contextText ?? text }; publish();
	}
	async function addClipboardImages(images: unknown, activeId: string | undefined): Promise<void> {
		if (busy()) { attachmentNotice(new AttachmentError('busy')); return; }
		if (historyUnreadable || activeId !== history.snapshot.activeId) { publish(); return; }
		try {
			const captured = captureClipboardImages(images);
			const next = [...attachments(), ...captured];
			if (next.length > 64 || next.reduce((size, item) => size + Buffer.byteLength(item.contents, 'utf8'), 0) > attachmentBudget) { throw new AttachmentError('budget'); }
			if (temporary || modeDraft) { void setDraft(draft().text, next); publish(); }
			else { draftTail = draftTail.then(async () => { await setDraft(draft().text, next); publish(); }).catch(attachmentNotice); await draftTail; }
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
			const suppliedFiles = uris.map(uri => uri.fsPath);
			const captured = await readAttachments(suppliedFiles.map(path => ({ path, source })), permission, createFileTools('computer', [], { suppliedFiles }).execute, controller.signal);
			controller.signal.throwIfAborted();
			const merged = new Map(attachments().map(item => [item.path, item]));
			for (const item of captured) { merged.set(item.path, item); }
			const next = [...merged.values()];
			if (next.length > 64 || next.reduce((size, item) => size + Buffer.byteLength(item.contents, 'utf8'), 0) > attachmentBudget) { throw new AttachmentError('budget'); }
			await draftTail; await setDraft(draft().text, next);
		} catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
	}
	async function openAttachment(id: string): Promise<void> {
		const activeId = history.snapshot.activeId;
		const root = native.state.root;
		const item = [...attachments(), ...session.snapshot.messages.flatMap(message => message.attachments ?? [])].find(item => item.id === id);
		if (!item || item.kind === 'image') { return; }
		try {
			if (item.source === 'internal' && item.path.startsWith('selection:')) {
				const document = await vscode.workspace.openTextDocument({ content: item.contents, language: 'plaintext' });
				if (alive && history.snapshot.activeId === activeId && native.state.root === root) { await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true }); }
				return;
			}
			const result = await createFileTools('computer', [], { suppliedFiles: [item.path] }).execute({ operation: 'read', path: item.path }, new AbortController().signal);
			if (!result.ok) { throw new AttachmentError('read', item.name); }
			if (!alive || history.snapshot.activeId !== activeId) { return; }
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.path), { preview: true, preserveFocus: true });
		} catch (error) { if (alive) { attachmentNotice(error); } }
	}
	async function pickFiles(): Promise<void> {
		if (busy() || historyUnreadable) { return; }
		const controller = new AbortController();
		attachmentJob = controller; publish();
		let uris: vscode.Uri[] | undefined;
		try { uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true, openLabel: vscode.l10n.t('Add files'), title: vscode.l10n.t('Add files to Beacon') }); }
		catch (error) { if (!controller.signal.aborted) { attachmentNotice(error); } }
		finally { attachmentJob = undefined; publish(); }
		// Permission may have changed while the native dialog was open.
		if (alive && !controller.signal.aborted && uris?.length) { await track(addResources(uris, 'picker')); }
	}
	async function send(text: string, editRevision?: number): Promise<void> {
		if (busy() || native.state.runtimeBusy || !canSend() || !connections.configured || text.length > 32000 || (!text.trim() && !attachments().length)) { publish(); return; }
		const sentViewKey = viewKey();
		const sentInputRevision = inputRevision;
		const controller = new AbortController();
		attachmentJob = controller; publish();
		let completion: Promise<void> | undefined;
		let rollback: (() => Promise<void>) | undefined;
		let consumedSource: { id: string; binding: BeaconHistoryBinding } | undefined;
		let transition: 'temporary' | 'persistent' | undefined;
		let consumeTemporary = false;
		try {
			const preparing = draftTail.then(async () => {
				if (!modeDraft && native.consumingWorkspace && !history.snapshot.activeId) {
					await replaceHistory(await native.bindHistory({ id: randomUUID(), create: true }));
				}
			});
			draftTail = preparing.catch(attachmentNotice);
			await preparing;
			const refs = attachments();
			const activeId = history.snapshot.activeId;
			let next = await request();
			if (refs.some(item => item.kind === 'image') && next.capabilities.vision !== 'supported') { throw new ModelCapabilityError('vision'); }
			const captured = structuredClone(refs);
			controller.signal.throwIfAborted();
			if (captured.some(item => item.kind === 'image') && next.capabilities.vision !== 'supported') { throw new ModelCapabilityError('vision'); }
			await draftTail;
			await native.refreshForRequest();
			if (modeDraft) {
				const sourceBinding = binding; const sourceData = history.checkpoint; const sourceTemporary = temporary;
				const sourceScreen = screen; const pending = structuredClone(draft());
				const inherited = session.snapshot.messages;
				let target: BeaconHistoryBinding;
				let targetId: string | undefined;
				// Roll back the staged identity if admission or preparation fails. The source
				// remains untouched until the new user message has actually been accepted.
				rollback = async () => {
					await draftTail;
					modeDraft = structuredClone(draft());
					await history.dispose();
					if (targetId) {
						await native.setBusy(false); nativeBusy = undefined;
						await native.remove(targetId); await native.release();
					}
					binding = sourceBinding;
					history = new ChatHistory(sourceData, binding.save, schedule, describeError, () => native.roots);
					session = history.session; temporary = sourceTemporary; screen = sourceScreen;
				};
				if (native.consumingWorkspace) {
					await native.release();
					targetId = randomUUID();
					target = await native.bindHistory({ id: targetId, create: true });
				} else { target = { data: { version: 1, activeId: randomUUID(), conversations: [] }, save: async data => data }; }
				const id = target.data.activeId;
				const conversation: Conversation = { id, title: history.currentConversation?.title ?? '', updatedAt: Date.now(), messages: inherited, error: '', workspace: native.roots, draftOnly: inherited.length === 0, draft: pending, contextSnapshots: history.contextSnapshots };
				target.data = { ...target.data, conversations: [...target.data.conversations.filter(item => item.id !== id), conversation] };
				await replaceHistory(target);
				await draftTail;
				const latestDraft = structuredClone(draft()); modeDraft = undefined;
				await setDraft(latestDraft.text, latestDraft.attachments);
				if (inherited.length) { transition = temporary ? 'temporary' : 'persistent'; }
				consumeTemporary = sourceTemporary;
				if (!sourceTemporary && sourceData.activeId) { consumedSource = { id: sourceData.activeId, binding: sourceBinding }; }
				next = await request();
			}
			await draftTail;
			const previousDraftText = draft().text;
			const remainingText = previousDraftText === text && inputRevision === sentInputRevision ? '' : previousDraftText;
			const sentAttachments = new Set(captured.map(item => item.id));
			const remainingAttachments = attachments().filter(item => !sentAttachments.has(item.id));
			await setDraft(remainingText, remainingAttachments);
			try {
				// Draft persistence can yield after the first admission check.
				await native.refreshForRequest();
				controller.signal.throwIfAborted();
			} catch (error) {
				{
					const restored = draftTail.then(async () => {
						const current = draft(); const currentIds = new Set(current.attachments.map(item => item.id));
						await setDraft(current.text === remainingText ? previousDraftText : current.text, [...captured.filter(item => !currentIds.has(item.id)), ...current.attachments]);
					});
					draftTail = restored.catch(attachmentNotice); await restored;
				}
				throw error;
			}
			screen = 'conversation';
			generation++; acceptedInputView = { previous: sentViewKey, current: viewKey(), editRevision };
			completion = session.send(text, next.generate, next.source, next.files, captured, transition);
			rollback = undefined;
			if (home()?.id === activeId || consumedSource?.id === home()?.id) { homes.delete(native.state.root!); }
			if (consumeTemporary) { temporaryDrafts.delete(native.state.root ?? ''); }
			if (consumedSource) {
				try { await native.consumeDraft(consumedSource.id, consumedSource.binding.revision!); }
				catch { requestNotice = { id: Date.now(), text: vscode.l10n.t('The new conversation accepted your question, but the original draft could not be cleared. It is still saved in the original conversation.') }; }
			}
			await recordView();
			void view?.webview.postMessage({ type: 'sendAccepted', text, editRevision, activeId, conversationId: history.snapshot.activeId, viewKey: sentViewKey, conversationViewKey: viewKey() });
		} catch (error) {
			if (rollback) { try { await rollback(); } catch (restoreError) { attachmentNotice(restoreError); } }
			if (!controller.signal.aborted) { attachmentNotice(error); }
		}
		finally { attachmentJob = undefined; publish(); }
		await completion;
		if (consumedSource && temporary) { await native.release(); }
		publish();
	}
	async function setWebEnabled(value: boolean): Promise<void> {
		try { await vscode.workspace.getConfiguration('beacon').update('webEnabled', value, vscode.ConfigurationTarget.Global); }
		catch { requestNotice = { id: Date.now(), text: vscode.l10n.t('Could not save web access. Please try again.') }; publish(); }
	}
	async function manageHistory(id: string, remove: boolean): Promise<void> {
		if (screen !== 'home' || !native.consumingWorkspace || busy() || historyUnreadable) { return; }
		const item = history.snapshot.history.find(item => item.id === id);
		if (!item) { return; }
		if (remove) {
			await workspaceAction(async () => {
				const active = history.snapshot.activeId;
				await native.remove(id);
				await replaceHistory(await native.bindHistory(active && active !== id ? { id: active } : undefined));
			});
		} else {
			const title = await vscode.window.showInputBox({ title: vscode.l10n.t('Rename chat'), value: item.title, ignoreFocusOut: true, validateInput: value => value.trim() && value.trim().length <= 80 ? undefined : vscode.l10n.t('Enter a title between 1 and 80 characters.') });
			if (title !== undefined) { await workspaceAction(async () => {
				const active = history.snapshot.activeId;
				await native.rename(id, title);
				await replaceHistory(await native.bindHistory(active ? { id: active } : undefined));
			}); }
		}
	}
	async function addSelection(capture: () => Promise<{ uri: vscode.Uri; contents: string; name: string; isCurrent(): boolean } | undefined>): Promise<void> {
		if (busy()) { void vscode.window.showInformationMessage(vscode.l10n.t('Wait for the current response before adding a selection.')); return; }
		const active = history.snapshot.activeId; const scope = native.captureScope();
		let selected: { uri: vscode.Uri; contents: string; name: string; isCurrent(): boolean } | undefined;
		try { selected = await capture(); } catch { void vscode.window.showInformationMessage(vscode.l10n.t('The selected page is no longer available. Select the text again.')); return; }
		if (!selected || !selected.isCurrent()) { return; }
		const uri = selected.uri;
		if (uri.scheme === 'file') { try { await vscode.commands.executeCommand('_becoder.beacon.context', 'checkPageAccess', { source: uri.fsPath }); } catch { void vscode.window.showInformationMessage(vscode.l10n.t('This page is excluded from Beacon access.')); return; } }
		if (!alive || busy() || !selected.isCurrent() || history.snapshot.activeId !== active || native.state.root !== scope.root || native.state.epoch !== scope.epoch) { return; }
		const contents = redactContext(selected.contents); const previous = attachments();
		if (Buffer.byteLength(contents) + previous.reduce((total, item) => total + Buffer.byteLength(item.contents), 0) > attachmentBudget || previous.length >= 64) { void vscode.window.showInformationMessage(vscode.l10n.t('This selection exceeds the conversation attachment budget.')); return; }
		const id = randomUUID(); const target = viewKey();
		draftTail = draftTail.then(async () => {
			if (!alive || target !== viewKey()) { return; }
			const current = attachments();
			if (current.length >= 64 || Buffer.byteLength(contents) + current.reduce((total, item) => total + Buffer.byteLength(item.contents), 0) > attachmentBudget) { throw new AttachmentError('budget'); }
			await setDraft(draft().text, [...current, { id, name: selected.name, path: 'selection:' + uri.toString(), source: 'internal', kind: 'text', contents, truncated: false }]);
		}).catch(attachmentNotice);
		await draftTail;
		await vscode.commands.executeCommand('becoder.beacon.chat.focus'); publish();
	}
	try { if (!historyUnreadable) { await restoreWorkspace(true); } } catch { historyUnreadable = true; }
	context.subscriptions.push(
		vscode.commands.registerCommand('_becoder.beacon.contextChanged', refreshContext),
		vscode.commands.registerCommand('_becoder.beacon.shutdown', () => shutdown?.()),
		vscode.commands.registerCommand('_becoder.beacon.flush', async () => {
			attachmentJob?.abort(); session.stop();
			await Promise.allSettled([...pendingWork]); await workspaceSettled; await draftTail;
			await flushHistory(); await recordView();
		}),
		vscode.window.onDidChangeWindowState(async state => {
			if (state.focused) { await refreshContext(); }
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
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
		vscode.commands.registerCommand('becoder.beacon.askSelection', () => addSelection(async () => {
			const editor = vscode.window.activeTextEditor; if (!editor || editor.selection.isEmpty) { return; }
			const notebook = vscode.workspace.notebookDocuments.find(document => document.getCells().some(cell => cell.document === editor.document));
			const version = editor.document.version;
			return { uri: notebook?.uri ?? editor.document.uri, contents: editor.document.getText(editor.selection), name: vscode.l10n.t('Editor selection'), isCurrent: () => !editor.document.isClosed && editor.document.version === version };
		})),
		vscode.commands.registerCommand('becoder.beacon.askPdfSelection', () => addSelection(async () => {
			const extension = vscode.extensions.getExtension<{ captureSelection(): Promise<{ uri: string; contents: string; isCurrent(): boolean } | undefined> }>('mathematic.vscode-pdf');
			const selection = extension && await (await extension.activate()).captureSelection();
			if (!selection) { return; }
			const uri = vscode.Uri.parse(selection.uri);
			if (uri.scheme !== 'file' || typeof selection.contents !== 'string' || typeof selection.isCurrent !== 'function') { return; }
			return { ...selection, uri, name: vscode.l10n.t('PDF selection') };
		})),
		vscode.window.registerWebviewViewProvider('becoder.beacon.chat', {
			resolveWebviewView(resolved) {
				view = resolved;
				const webview = resolved.webview;
				webview.html = html(webview);
				const receiveDisposable = webview.onDidReceiveMessage(receive);
				const dropDisposable = webview.onDidDropResources?.(event => { void track(addResources(event.uris, event.isExternal ? 'external' : 'internal')); });
				const disposed = resolved.onDidDispose(() => { receiveDisposable.dispose(); dropDisposable?.dispose(); disposed.dispose(); if (view === resolved) { view = undefined; } });
				publish();
			}
		}, { webviewOptions: { retainContextWhenHidden: true } })
	);
	void connections.refresh();
}
