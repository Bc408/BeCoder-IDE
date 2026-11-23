/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BeaconMode, IBeaconContext, IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconWindowSelection, IBeaconResume } from '../common/beaconContext.js';
import * as path from '../../../base/common/path.js';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { hasKey } from '../../../base/common/types.js';
import { BeaconStore, checkBeaconIdentifier, checkBeaconResume, prepareBeaconWorkspace } from './beaconStore.js';
import { acquireBeaconLease } from './beaconLease.js';
import type { BeaconProducer, IBeaconConsumedRecord, IBeaconRuntimeItem, BeaconRecentProducer, IBeaconCollectionScope, IBeaconProblemCapture, IBeaconOjCapture, IBeaconRecordRef, IBeaconRecentItem, IBeaconRecentRecord, IBeaconRecentWrite, IBeaconCodeObservation, IBeaconCodeSnapshot, IBeaconCodeSave } from '../common/beaconContextTypes.js';
import { BeaconNotebookResources } from './beaconNotebookResources.js';

const sameWorkspacePath = (left: string, right: string) => {
	const a = path.normalize(left);
	const b = path.normalize(right);
	return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
};

export interface IBeaconCoordinatorCallbacks {
	getSelection(id: number): IBeaconWindowSelection | undefined;
	saveSelection(id: number, selection: IBeaconWindowSelection): void;
	getRecent(): string[];
	saveRecent(recent: string[]): void;
	changed(id: number): void;
}

interface IWindowContext {
	resourceOwner: number;
	selection: IBeaconWindowSelection;
	store?: BeaconStore;
	usable: boolean;
	epoch: number;
	rootSelectionEpoch: number;
	busy: boolean;
	runtimeActivities: Set<string>;
	activities: Map<string, { source: string; canonical: string; collectionScope: IBeaconCollectionScope; producer?: BeaconProducer }>;
	ojActivities: Map<string, { collectionScope: IBeaconCollectionScope; attemptId?: string; recordKey?: string }>;
	writes: number;
	switching: boolean;
	tail: Promise<unknown>;
	active?: { id: string; identity: string; release: () => Promise<void> };
}

/** Owns window state and leases; no model SDK or editor-folder dependency. */
export class BeaconCoordinator {
	private readonly windows = new Map<number, IWindowContext>();
	private readonly views = new Map<number, Map<string, IBeaconResume>>();
	private resumeTail: Promise<unknown> = Promise.resolve();
	private readonly runtimeWrites = new Map<string, Promise<void>>();
	private readonly notebooks: BeaconNotebookResources;
	private readonly notebookScopes = new Map<string, { window: number; scope: IBeaconContext; creating: boolean; location?: { canonical: string; anchor: string; dev: number; ino: number } }>();
	private readonly notebookOwners = new Map<string, { window: number; owner: number }>();
	private nextResourceOwner = 0;
	private disposed = false;
	constructor(private readonly callbacks: IBeaconCoordinatorCallbacks) { this.notebooks = new BeaconNotebookResources(() => callbacks.changed(0)); }

	async reportNotebooks(id: number, files: { file: string; dirty: boolean }[]): Promise<void> { const owner = this.window(id); await this.notebooks.report(owner.resourceOwner, files); if (this.windows.get(id) !== owner) { await this.notebooks.reset(owner.resourceOwner); } }
	async notebookReadonly(id: number, files: string[]): Promise<boolean[]> { this.window(id); return Promise.all(files.map(file => this.notebooks.editing(file))); }
	async beginNotebookRun(id: number, file: string): Promise<string> {
		const owner = this.window(id); const handle = await this.notebooks.begin(owner.resourceOwner, file, 'run');
		if (this.windows.get(id) !== owner) { await this.notebooks.release(owner.resourceOwner, handle); throw new Error('beacon-window-closed'); }
		this.notebookOwners.set(handle, { window: id, owner: owner.resourceOwner }); return handle;
	}
	async endNotebookResource(id: number, handle: string): Promise<void> {
		const owner = this.notebookOwners.get(handle); if (!owner) { return; } if (owner.window !== id) { throw new Error('notebook-owner'); }
		await this.notebooks.release(owner.owner, handle); this.notebookScopes.delete(handle); this.notebookOwners.delete(handle); this.callbacks.changed(id);
	}
	private async authorizeNotebook(id: number, file: string, scope: IBeaconContext, creating = false): Promise<{ canonical: string; anchor: string; dev: number; ino: number } | undefined> {
		if (!scope || !/\.bcnb$/i.test(file) || file.slice(path.parse(file).root.length).includes(':')) { throw new Error('notebook-invalid-target'); }
		if (file.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork')) { throw new Error('notebook-invalid-target'); }
		await this.checkPageAccess(id, file);
		return this.serial(id, false, async context => {
			const store = await this.store(context); this.checkScope(context, scope);
			if (!['spot', 'flood'].includes(this.snapshot(context).mode)) { throw new Error('notebook-write-denied'); }
			let real: string; let location: { canonical: string; anchor: string; dev: number; ino: number } | undefined;
			if (creating) {
				try { await fs.lstat(file); throw new Error('notebook-target-exists'); }
				catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
				let ancestor = path.dirname(file); const suffix = [path.basename(file)];
				while (true) {
					try {
						const stat = await fs.lstat(ancestor); const canonical = await fs.realpath(ancestor);
						if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(path.resolve(ancestor), canonical) !== '') { throw new Error('notebook-redirected-parent'); }
						real = path.join(canonical, ...suffix); location = { canonical: real, anchor: ancestor, dev: stat.dev, ino: stat.ino }; break;
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(ancestor) === ancestor) { throw error; }
						suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor);
					}
				}
			} else {
				const stat = await fs.lstat(file); real = await fs.realpath(file);
				if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) { throw new Error('notebook-invalid-target'); }
			}
			if ([file, real].some(value => value.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork'))) { throw new Error('notebook-invalid-target'); }
			const relative = path.relative(store.binding.canonicalPath, real);
			if (scope.mode === 'spot' && (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))) { throw new Error('notebook-outside-workspace'); }
			return location;
		});
	}
	async beginNotebookEdit(id: number, file: string, scope: IBeaconContext): Promise<string> {
		return this.beginNotebookWriting(id, file, scope, false);
	}
	async beginNotebookCreate(id: number, file: string, scope: IBeaconContext): Promise<string> {
		return this.beginNotebookWriting(id, file, scope, true);
	}
	private async beginNotebookWriting(id: number, file: string, scope: IBeaconContext, creating: boolean): Promise<string> {
		const owner = this.window(id); const location = await this.authorizeNotebook(id, file, scope, creating); const handle = await this.notebooks.begin(owner.resourceOwner, file, 'edit');
		try {
			await this.authorizeNotebook(id, file, scope, creating); if (this.windows.get(id) !== owner) { throw new Error('beacon-window-closed'); }
			this.notebookScopes.set(handle, { window: id, scope: structuredClone(scope), creating, location }); this.notebookOwners.set(handle, { window: id, owner: owner.resourceOwner }); return handle;
		} catch (error) { await this.notebooks.release(owner.resourceOwner, handle); throw error; }
	}
	async verifyNotebookEdit(id: number, handle: string): Promise<void> {
		const claim = this.notebooks.verify(this.window(id).resourceOwner, handle); const owner = this.notebookScopes.get(handle);
		if (claim.kind !== 'edit' || owner?.window !== id) { throw new Error('notebook-owner'); }
		const location = await this.authorizeNotebook(id, claim.file, owner.scope, owner.creating);
		if (owner.location) {
			const anchor = await fs.lstat(owner.location.anchor);
			if (anchor.dev !== owner.location.dev || anchor.ino !== owner.location.ino || anchor.isSymbolicLink() || location?.canonical.toLowerCase() !== owner.location.canonical.toLowerCase()) { throw new Error('notebook-parent-changed'); }
		}
	}

	private window(id: number): IWindowContext {
		const selection = this.callbacks.getSelection(id);
		if (this.disposed || !selection) { throw new Error('beacon-window-closed'); }
		let context = this.windows.get(id);
		if (!context) {
			context = { resourceOwner: ++this.nextResourceOwner, selection: { ...selection }, usable: false, epoch: 0, rootSelectionEpoch: 0, busy: false, runtimeActivities: new Set(), activities: new Map(), ojActivities: new Map(), writes: 0, switching: false, tail: Promise.resolve() };
			this.windows.set(id, context);
		}
		return context;
	}

	private async refresh(context: IWindowContext): Promise<void> {
		const previous = context.usable;
		context.usable = false; context.store = undefined;
		if (context.selection.root) {
			try {
				const binding = await prepareBeaconWorkspace(context.selection.root, false);
				if (context.selection.identity && context.selection.identity !== binding.identity) { throw new Error('beacon-workspace-changed'); }
				context.store = new BeaconStore(binding);
				context.usable = true;
			} catch { /* Retain the selected root; unavailable roots do not redirect persistence. */ }
		}
		if (previous !== context.usable) {
			context.epoch++; context.rootSelectionEpoch++;
			if (!context.usable) { await this.release(context); }
		}
	}

	private snapshot(context: IWindowContext): IBeaconContext {
		const mode = context.usable ? context.selection.mode : 'blackout';
		const workspaceState = !context.selection.root ? 'none' : !context.usable ? 'unavailable' : mode === 'blackout' ? 'blackout' : 'ready';
		return { slot: context.selection.slot, root: context.selection.root, usable: context.usable, workspaceState, mode, epoch: context.epoch,
			runtimeBusy: context.runtimeActivities.size > 0, busy: context.busy || context.runtimeActivities.size > 0 || context.activities.size > 0 || context.writes > 0 || context.switching || this.ownsNotebookEdit(context), activeId: context.active?.id, recent: [...this.callbacks.getRecent()] };
	}
	private ownsNotebookEdit(context: IWindowContext): boolean { return [...this.notebookOwners].some(([handle, value]) => value.owner === context.resourceOwner && this.notebookScopes.has(handle)); }

	private async serial<T>(id: number, write: boolean, operation: (context: IWindowContext) => Promise<T>): Promise<T> {
		const context = this.window(id);
		if (write) { context.writes++; }
		const result = context.tail.then(() => {
			if (this.disposed || this.windows.get(id) !== context || !this.callbacks.getSelection(id)) { throw new Error('beacon-window-closed'); }
			return operation(context);
		});
		context.tail = result.catch(() => { });
		try { return await result; } finally { if (write) { context.writes--; } }
	}

	async getContext(id: number): Promise<IBeaconContext> {
		return this.serial(id, false, async context => { await this.refresh(context); return this.snapshot(context); });
	}

	async getResume(id: number): Promise<IBeaconResume | undefined> {
		await this.resumeTail;
		return this.serial(id, false, async context => {
			const store = await this.store(context);
			const view = this.views.get(id)?.get(store.binding.identity) ?? await store.readResume();
			return view ? structuredClone(view) : undefined;
		});
	}

	async setView(id: number, view: IBeaconResume): Promise<void> {
		checkBeaconResume(view);
		await this.serial(id, false, async context => {
			const store = await this.store(context);
			if (view.id && !await store.readConversation(view.id)) { throw new Error('beacon-missing-conversation'); }
			// A released home draft can be explicitly cleared by another window.
			if (view.homeId && !await store.readConversation(view.homeId)) { view = { ...view, homeId: undefined }; }
			let views = this.views.get(id);
			if (!views) { views = new Map(); this.views.set(id, views); }
			views.set(store.binding.identity, structuredClone(view));
		});
	}

	async selectWorkspace(id: number, root: string): Promise<IBeaconContext> {
		const current = this.window(id);
		if (current.busy || current.runtimeActivities.size || current.activities.size || current.writes || current.switching || this.ownsNotebookEdit(current)) { throw new Error('beacon-busy'); }
		return this.serial(id, false, async context => {
			if (context.busy || context.runtimeActivities.size || context.activities.size || context.writes || this.ownsNotebookEdit(context)) { throw new Error('beacon-busy'); }
			context.switching = true;
			try {
				const binding = await prepareBeaconWorkspace(root, true);
				const store = new BeaconStore(binding);
				await store.listHistory();
				if (context.busy || context.runtimeActivities.size || context.activities.size || context.writes || this.ownsNotebookEdit(context)) { throw new Error('beacon-busy'); }
				await this.release(context);
				context.selection = { slot: context.selection.slot, root, mode: context.selection.root ? context.selection.mode : 'spot', identity: binding.identity };
				context.store = store; context.usable = true; context.epoch++; context.rootSelectionEpoch++;
				this.callbacks.saveSelection(id, context.selection);
				this.callbacks.saveRecent([root, ...this.callbacks.getRecent().filter(value => !sameWorkspacePath(value, root))]);
			} finally { context.switching = false; }
			this.callbacks.changed(0);
			return this.snapshot(context);
		});
	}

	async setMode(id: number, mode: BeaconMode, retainConversation = false): Promise<IBeaconContext> {
		return this.serial(id, false, async context => {
			await this.refresh(context);
			if (!context.usable && mode !== 'blackout') { throw new Error('beacon-mode-unavailable'); }
			if (context.selection.mode !== mode) {
				context.selection = { ...context.selection, mode }; context.epoch++;
				this.callbacks.saveSelection(id, context.selection);
			}
			if (mode === 'blackout' && !retainConversation) { await this.release(context); }
			this.callbacks.changed(id);
			return this.snapshot(context);
		});
	}

	async clearWorkspace(id: number): Promise<IBeaconContext> {
		const current = this.window(id);
		if (current.busy || current.runtimeActivities.size || current.activities.size || current.writes || current.switching || this.ownsNotebookEdit(current)) { throw new Error('beacon-busy'); }
		return this.serial(id, false, async context => {
			if (context.busy || context.runtimeActivities.size || context.activities.size || context.writes || this.ownsNotebookEdit(context)) { throw new Error('beacon-busy'); }
			context.switching = true;
			try {
				const root = context.selection.root;
				await this.release(context);
				context.selection = { slot: context.selection.slot, mode: 'blackout' };
				context.store = undefined; context.usable = false; context.epoch++; context.rootSelectionEpoch++;
				this.callbacks.saveSelection(id, context.selection);
				if (root) { this.callbacks.saveRecent([root, ...this.callbacks.getRecent().filter(value => !sameWorkspacePath(value, root))]); }
			} finally { context.switching = false; }
			this.callbacks.changed(0);
			return this.snapshot(context);
		});
	}

	async removeRecentWorkspace(id: number, root: string): Promise<IBeaconContext> {
		if (!root || !path.isAbsolute(root) || root.includes('\0')) { throw new Error('beacon-invalid-workspace'); }
		if (this.window(id).selection.root && sameWorkspacePath(this.window(id).selection.root!, root)) { return this.clearWorkspace(id); }
		return this.serial(id, false, async context => {
			this.callbacks.saveRecent(this.callbacks.getRecent().filter(value => !sameWorkspacePath(value, root)));
			this.callbacks.changed(0);
			return this.snapshot(context);
		});
	}

	setBusy(id: number, busy: boolean): void {
		if (typeof busy !== 'boolean') { throw new Error('beacon-invalid-context'); }
		const context = this.window(id);
		if (context.busy !== busy) { context.busy = busy; this.callbacks.changed(id); }
	}

	/** Runtime occupancy is window-local and does not grant access to persistent evidence. */
	beginRuntimeActivity(id: number): string {
		const context = this.window(id); const handle = randomUUID();
		context.runtimeActivities.add(handle); this.callbacks.changed(id); return handle;
	}
	endRuntimeActivity(id: number, handle: string): void {
		const context = this.window(id);
		if (context.runtimeActivities.delete(handle)) { this.callbacks.changed(id); }
	}

	async captureCollectionScope(id: number): Promise<IBeaconCollectionScope | undefined> {
		return this.serial(id, false, async context => {
			await this.refresh(context);
			return context.usable && context.store && context.selection.root ? { slot: context.selection.slot, root: context.selection.root, workspaceIdentity: context.store.binding.identity, rootSelectionEpoch: context.rootSelectionEpoch } : undefined;
		});
	}

	private async collectionStore(context: IWindowContext, scope: IBeaconCollectionScope): Promise<BeaconStore> {
		await this.refresh(context);
		if (!context.usable || !context.store || !scope || scope.slot !== context.selection.slot || scope.root !== context.selection.root || scope.workspaceIdentity !== context.store.binding.identity || scope.rootSelectionEpoch !== context.rootSelectionEpoch) { throw new Error('beacon-context-changed'); }
		return context.store;
	}

	private activeKeys(identity: string, producer: BeaconRecentProducer): Set<string> {
		const keys = new Set<string>();
		for (const window of this.windows.values()) {
			for (const [id, activity] of window.activities) {
				if (activity.collectionScope.workspaceIdentity === identity && activity.producer === producer) { keys.add(id); }
			}
			if (producer === 'oj') { for (const activity of window.ojActivities.values()) { if (activity.collectionScope.workspaceIdentity === identity) { if (activity.attemptId) { keys.add(activity.attemptId); } if (activity.recordKey) { keys.add(activity.recordKey); } } } }
		}
		return keys;
	}

	async beginActivity(id: number, source: string, scope: IBeaconCollectionScope | undefined): Promise<string | undefined> {
		return this.serial(id, false, async context => {
			if (!scope) { return undefined; }
			const store = await this.collectionStore(context, scope);
			if (!path.isAbsolute(source)) { return undefined; }
			const real = await fs.realpath(source);
			const relative = path.relative(store.binding.canonicalPath, real);
			if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { return undefined; }
			const handle = randomUUID(); context.activities.set(handle, { source: path.normalize(source), canonical: real, collectionScope: structuredClone(scope) }); this.callbacks.changed(id);
			return handle;
		});
	}

	async endActivity(id: number, handle: string): Promise<void> {
		await this.serial(id, false, async context => {
			const activity = context.activities.get(handle); context.activities.delete(handle);
			if (activity?.producer) { try { await this.runtimeWrite(context, activity.producer, activity.collectionScope, store => store.trimRecent(activity.producer!, this.activeKeys(store.binding.identity, activity.producer!))); } catch { /* Root retirement does not redirect cleanup. */ } }
			this.callbacks.changed(id);
		});
	}

	async startRuntime(id: number, handle: string, producer: BeaconProducer, source: string, code: string, events: unknown[]): Promise<void> {
		await this.serial(id, true, async context => {
			const activity = context.activities.get(handle);
			if (!activity) { throw new Error('beacon-invalid-activity'); }
			const normalized = path.normalize(source);
			if ((process.platform === 'win32' ? normalized.toLowerCase() !== activity.source.toLowerCase() : normalized !== activity.source)) { throw new Error('beacon-invalid-source'); }
			if (producer !== 'runner' && producer !== 'cph' && producer !== 'notebook') { throw new Error('beacon-invalid-producer'); }
			if (activity.producer && activity.producer !== producer) { throw new Error('beacon-invalid-producer'); }
			if (activity.producer) { return; }
			const capture = events[0] as { sourceSnapshot?: { canonicalPath?: string } } | undefined;
			const canonical = capture?.sourceSnapshot?.canonicalPath;
			if (typeof canonical !== 'string' || (process.platform === 'win32' ? canonical.toLowerCase() !== activity.canonical.toLowerCase() : canonical !== activity.canonical)) { throw new Error('beacon-invalid-source'); }
			activity.producer = producer;
			try { await this.runtimeWrite(context, producer, activity.collectionScope, store => store.commitRuntimeRecord(producer, { id: handle, code, startedAt: Date.now(), events }, this.activeKeys(store.binding.identity, producer))); }
			catch (error) { activity.producer = undefined; throw error; }
		});
	}

	async appendRuntime(id: number, handle: string, sequence: number, events: unknown[]): Promise<boolean> {
		return this.serial(id, true, async context => {
			const activity = context.activities.get(handle);
			if (!activity?.producer) { throw new Error('beacon-invalid-activity'); }
			return this.runtimeWrite(context, activity.producer, activity.collectionScope, store => store.appendRuntimeEvents(activity.producer!, handle, sequence, events, this.activeKeys(store.binding.identity, activity.producer!)));
		});
	}

	private async runtimeWrite<T>(context: IWindowContext, producer: BeaconRecentProducer, scope: IBeaconCollectionScope, operation: (store: BeaconStore) => Promise<T>): Promise<T> {
		const store = await this.collectionStore(context, scope);
		const key = `${store.binding.identity}/${producer}`;
		const result = (this.runtimeWrites.get(key) ?? Promise.resolve()).then(async () => { await this.collectionStore(context, scope); return operation(store); });
		const tail = result.then(() => { }, () => { });
		this.runtimeWrites.set(key, tail);
		try { return await result; } finally { if (this.runtimeWrites.get(key) === tail) { this.runtimeWrites.delete(key); } }
	}

	private async collectionSource(context: IWindowContext, scope: IBeaconCollectionScope, sourceUri: string | undefined): Promise<string> {
		const store = await this.collectionStore(context, scope);
		if (!sourceUri?.startsWith('file:')) { throw new Error('beacon-invalid-source'); }
		const real = await fs.realpath(fileURLToPath(sourceUri));
		const relative = path.relative(store.binding.canonicalPath, real);
		if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { throw new Error('beacon-invalid-source'); }
		return real;
	}

	async captureProblem(id: number, input: IBeaconProblemCapture, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef> {
		return this.serial(id, true, async context => {
			const canonical = await this.collectionSource(context, scope, input.sourceUri);
			if (!input.document?.ref || !Number.isFinite(input.viewedAt) || !['get-problem', 'import-cph'].includes(input.trigger)) { throw new Error('beacon-invalid-record'); }
			const sourceUri = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
			const ref = input.document.ref;
			return this.runtimeWrite(context, 'problem', scope, store => store.saveRecentRecord('problem', { producer: 'problem', dedupKey: JSON.stringify([ref.site, ref.nativeId, ref.url, sourceUri]), sourceUri: input.sourceUri, problem: ref, capturedAt: input.viewedAt, viewedAt: input.viewedAt, trigger: input.trigger, state: 'available', coverage: { complete: true, channels: [] }, payload: { kind: 'problem', document: input.document } }, new Set(), true));
		});
	}

	async captureOj(id: number, input: IBeaconOjCapture, scope: IBeaconCollectionScope): Promise<IBeaconRecordRef> {
		return this.serial(id, true, async context => {
			await this.collectionSource(context, scope, input.sourceUri);
			const record = hasKey(input, { record: true }) ? input.record : undefined;
			const evaluation = hasKey(input, { evaluation: true }) ? input.evaluation : undefined;
			const attemptId = input.attemptId;
			const recordKey = record ? JSON.stringify([record.ref.problem.site, record.ref.id, record.ref.url]) : undefined;
			if (!record && (!attemptId || !evaluation || evaluation.phase === 'preparing')) { throw new Error('beacon-invalid-record'); }
			const data: IBeaconRecentWrite = { producer: 'oj', dedupKey: recordKey ?? attemptId!, sourceUri: input.sourceUri, problem: record?.ref.problem ?? evaluation?.problem, capturedAt: Date.now(), submission: { attemptId, recordKey }, state: record?.phase === 'finished' ? 'finished' : record?.phase === 'unknown' ? 'unknown' : 'active', coverage: { channels: [] }, payload: record ? { kind: 'oj', record } : { kind: 'oj-evaluation', attemptId: attemptId!, evaluation: evaluation! } };
			return this.runtimeWrite(context, 'oj', scope, store => store.saveRecentRecord('oj', data, this.activeKeys(store.binding.identity, 'oj'), false));
		});
	}

	async beginOjCaptureActivity(id: number, input: { sourceUri: string; attemptId?: string; recordKey?: string }, scope: IBeaconCollectionScope): Promise<string> {
		return this.serial(id, false, async context => {
			await this.collectionSource(context, scope, input.sourceUri);
			if (!input.attemptId && !input.recordKey) { throw new Error('beacon-invalid-record'); }
			const handle = randomUUID(); context.ojActivities.set(handle, { collectionScope: structuredClone(scope), attemptId: input.attemptId, recordKey: input.recordKey }); return handle;
		});
	}

	async endOjCaptureActivity(id: number, handle: string): Promise<void> {
		await this.serial(id, false, async context => {
			const activity = context.ojActivities.get(handle); context.ojActivities.delete(handle);
			if (activity) { try { await this.runtimeWrite(context, 'oj', activity.collectionScope, store => store.trimRecent('oj', this.activeKeys(store.binding.identity, 'oj'))); } catch { /* Retired roots are not reopened. */ } }
		});
	}

	async listRecent(id: number, producer: BeaconRecentProducer, scope: IBeaconContext): Promise<IBeaconRecentItem[]> {
		return this.serial(id, false, async context => {
			const { store } = await this.ownedStore(context); this.checkScope(context, scope);
			return (await store.listRecentRecords(producer)).map(({ payload: _payload, ...item }) => item);
		});
	}
	async readRecent(id: number, ref: IBeaconRecordRef, scope: IBeaconContext): Promise<IBeaconRecentRecord> {
		return this.serial(id, false, async context => { const { store } = await this.ownedStore(context); this.checkScope(context, scope); return store.readRecentRecord(ref); });
	}
	async saveCodeRead(id: number, observation: IBeaconCodeObservation, scope: IBeaconContext): Promise<IBeaconCodeSave> {
		return this.serial(id, true, async context => { const { store, conversationId } = await this.ownedStore(context); this.checkScope(context, scope); const result = await store.saveCodeRead(conversationId, observation); this.checkScope(context, scope); return result; });
	}
	async listCodeSnapshots(id: number, scope: IBeaconContext): Promise<Omit<IBeaconCodeSnapshot, 'contents'>[]> {
		return this.serial(id, false, async context => { const { store, conversationId } = await this.ownedStore(context); this.checkScope(context, scope); return store.listCodeSnapshots(conversationId); });
	}
	async readCodeSnapshot(id: number, key: string, scope: IBeaconContext): Promise<IBeaconCodeSnapshot> {
		return this.serial(id, false, async context => { const { store, conversationId } = await this.ownedStore(context); this.checkScope(context, scope); return store.readCodeSnapshot(conversationId, key); });
	}

	private async store(context: IWindowContext): Promise<BeaconStore> {
		await this.refresh(context);
		if (!context.usable || !context.store || context.selection.mode === 'blackout') { throw new Error('beacon-workspace-unavailable'); }
		return context.store;
	}

	private async ownedStore(context: IWindowContext): Promise<{ store: BeaconStore; conversationId: string }> {
		const store = await this.store(context);
		if (!context.active || context.active.identity !== store.binding.identity) { throw new Error('beacon-conversation-owner'); }
		return { store, conversationId: context.active.id };
	}

	private checkScope(context: IWindowContext, scope?: IBeaconContext): void {
		const current = this.snapshot(context);
		if (scope && (['slot', 'root', 'usable', 'mode', 'epoch', 'activeId'] as const).some(key => current[key] !== scope[key])) { throw new Error('beacon-context-changed'); }
	}

	async listRuntime(id: number, producer: BeaconProducer, scope?: IBeaconContext): Promise<IBeaconRuntimeItem[]> {
		return this.serial(id, false, async context => {
			const { store } = await this.ownedStore(context);
			this.checkScope(context, scope);
			return (await store.listRuntimeRecords(producer)).map(record => {
				const snapshot = (record.events[0] as { sourceSnapshot?: { originalPath?: unknown; sha256?: unknown } } | undefined)?.sourceSnapshot;
				return { id: record.id, producer, revision: record.revision, startedAt: record.startedAt,
					source: typeof snapshot?.originalPath === 'string' ? snapshot.originalPath : undefined,
					sha256: typeof snapshot?.sha256 === 'string' ? snapshot.sha256 : undefined,
					finished: record.events.some(event => (event as { type?: string } | null)?.type === 'finished') };
			});
		});
	}

	async consumeRuntime(id: number, producer: BeaconProducer, recordId: string, revision: number, scope?: IBeaconContext): Promise<IBeaconConsumedRecord> {
		if (!Number.isSafeInteger(revision) || revision < 1) { throw new Error('beacon-invalid-record'); }
		return this.serial(id, true, async context => {
			const { store, conversationId } = await this.ownedStore(context);
			this.checkScope(context, scope);
			return store.consumeRuntimeRecord(conversationId, producer, recordId, revision);
		});
	}

	async readConsumed(id: number, materialId: string, scope?: IBeaconContext): Promise<IBeaconConsumedRecord | undefined> {
		return this.serial(id, false, async context => {
			const { store, conversationId } = await this.ownedStore(context);
			this.checkScope(context, scope);
			return store.readMaterial(conversationId, materialId);
		});
	}

	/** Checks only metadata of a known open page; never reads its backing content. */
	async checkPageAccess(id: number, file: string): Promise<void> {
		return this.serial(id, false, async context => {
			if (!path.isAbsolute(file) || file.includes('\0')) { throw new Error('beacon-protected-page'); }
			let ancestor = file;
			const suffix: string[] = [];
			let canonical: string;
			while (true) {
				try { canonical = path.join(await fs.realpath(ancestor), ...suffix); break; }
				catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(ancestor) === ancestor) { throw error; }
					suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor);
				}
			}
			for (const target of [file, canonical]) {
				const parts = target.split(/[\\/]/);
				if (parts.some(part => part.toLowerCase() === '.beaconwork')) { throw new Error('beacon-protected-page'); }
				if (parts.some((part, index) => part.toLowerCase() === 'globalstorage' && parts[index + 1]?.toLowerCase() === 'becoder.beacon')) { throw new Error('beacon-protected-page'); }
				if (parts.some(part => /^(?:\.git|\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.npmrc|\.pypirc|\.netrc|\.htpasswd|id_rsa|id_ed25519|credentials|secrets?|cookies|login data|web data|local state|state\.vscdb(?:.*)|keychains?|vault)(?:$|\.)|^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|p8|kdbx)$/i.test(part))) { throw new Error('beacon-protected-page'); }
			}
		});
	}

	async listHistory(id: number): Promise<IBeaconHistoryItem[]> {
		return this.serial(id, false, async context => (await this.store(context)).listHistory());
	}

	async openConversation(id: number, conversationId: string, create = false): Promise<IBeaconStoredConversation> {
		checkBeaconIdentifier(conversationId);
		return this.serial(id, true, async context => {
			// First-send/material capture owns the busy state before it has a conversation.
			if (context.busy && (!create || context.active)) { throw new Error('beacon-busy'); }
			const store = await this.store(context);
			if (context.active?.id === conversationId && context.active.identity === store.binding.identity) {
				const record = await store.readConversation(conversationId);
				if (!record) { throw new Error('beacon-missing-conversation'); }
				return record;
			}
			const release = await acquireBeaconLease(store.binding.identity, `conversation:${conversationId}`);
			try {
				let record = await store.readConversation(conversationId);
				if (create) {
					if (record) { throw new Error('beacon-conversation-exists'); }
					record = await store.saveConversation({ id: conversationId, title: '', updatedAt: Date.now(), messages: [], error: '', draftOnly: true, workspace: [{ name: path.basename(store.binding.path), path: store.binding.path }] }, 0);
				}
				if (!record) { throw new Error('beacon-missing-conversation'); }
				await this.release(context);
				context.active = { id: conversationId, identity: store.binding.identity, release };
				this.callbacks.changed(id);
				return record;
			} catch (error) { await release(); throw error; }
		});
	}

	async saveConversation(id: number, data: IBeaconConversation, revision: number, expectedScope?: IBeaconContext): Promise<IBeaconStoredConversation> {
		return this.serial(id, true, async context => {
			const store = await this.store(context);
			this.checkScope(context, expectedScope);
			if (context.active?.id !== data.id || context.active.identity !== store.binding.identity) { throw new Error('beacon-conversation-owner'); }
			const result = await store.saveConversation(data, revision, () => this.checkScope(context, expectedScope));
			this.callbacks.changed(0);
			return result;
		});
	}

	/** Clear only the owned source draft after a mode handoff accepts its first send. */
	async consumeDraft(id: number, conversationId: string, revision: number): Promise<void> {
		checkBeaconIdentifier(conversationId);
		if (!Number.isSafeInteger(revision) || revision < 1) { throw new Error('beacon-invalid-history'); }
		await this.serial(id, true, async context => {
			// Unlike normal asset access this host cleanup may run in Blackout. It
			// accepts no replacement content and requires the retained source lease.
			await this.refresh(context);
			const store = context.store;
			if (!context.usable || !store) { throw new Error('beacon-workspace-unavailable'); }
			if (context.active?.id !== conversationId || context.active.identity !== store.binding.identity) { throw new Error('beacon-conversation-owner'); }
			await store.validate();
			const current = await store.readConversation(conversationId);
			if (!current) { throw new Error('beacon-missing-conversation'); }
			if (current.revision !== revision) { throw new Error('beacon-history-conflict'); }
			await store.saveConversation({ ...current.data, draft: { text: '', attachments: [] } }, revision);
			this.callbacks.changed(0);
		});
	}

	private async manageConversation(id: number, conversationId: string, operation: (store: BeaconStore) => Promise<void>): Promise<void> {
		checkBeaconIdentifier(conversationId);
		return this.serial(id, true, async context => {
			if (context.busy) { throw new Error('beacon-busy'); }
			const store = await this.store(context);
			const owned = context.active?.id === conversationId && context.active.identity === store.binding.identity;
			const release = owned ? undefined : await acquireBeaconLease(store.binding.identity, `conversation:${conversationId}`);
			try { await operation(store); this.callbacks.changed(0); } finally { await release?.(); }
		});
	}

	async renameConversation(id: number, conversationId: string, title: string): Promise<void> {
		if (typeof title !== 'string' || !title.trim()) { throw new Error('beacon-invalid-history'); }
		await this.manageConversation(id, conversationId, async store => {
			const current = await store.readConversation(conversationId);
			if (!current) { throw new Error('beacon-missing-conversation'); }
			await store.saveConversation({ ...current.data, title: title.trim().slice(0, 80), updatedAt: Date.now() }, current.revision);
		});
	}

	async deleteConversation(id: number, conversationId: string): Promise<void> {
		await this.manageConversation(id, conversationId, store => store.deleteConversation(conversationId));
		const context = this.window(id);
		if (context.active?.id === conversationId) { await this.releaseConversation(id); }
	}

	private async release(context: IWindowContext): Promise<void> {
		await context.active?.release();
		context.active = undefined;
	}

	async releaseConversation(id: number): Promise<void> {
		await this.serial(id, false, context => this.release(context));
		this.callbacks.changed(id);
	}

	/** Extension reload retires resources without pretending that its native window closed. */
	async resetWindow(id: number): Promise<void> {
		await this.serial(id, false, async context => {
			await this.notebooks.reset(context.resourceOwner);
			for (const [handle, owner] of this.notebookOwners) { if (owner.owner === context.resourceOwner) { this.notebookOwners.delete(handle); this.notebookScopes.delete(handle); } }
			context.resourceOwner = ++this.nextResourceOwner;
			context.activities.clear(); context.ojActivities.clear(); context.runtimeActivities.clear(); context.busy = false; context.epoch++; context.rootSelectionEpoch++;
			await this.release(context);
		});
	}

	/** Only the real native window close publishes the workspace's default resume target. */
	async closeWindow(id: number, publish = false): Promise<void> {
		const context = this.windows.get(id);
		if (!context) { return; }
		const view = context.store ? this.views.get(id)?.get(context.store.binding.identity) : undefined;
		const store = publish && context.usable && context.selection.mode !== 'blackout' ? context.store : undefined;
		// Reserve the publication order before any asynchronous resource retirement.
		const previous = this.resumeTail;
		let complete!: () => void;
		if (publish) { this.resumeTail = new Promise<void>(resolve => { complete = resolve; }); }
		this.windows.delete(id);
		try {
			await this.notebooks.reset(context.resourceOwner);
			for (const [handle, owner] of this.notebookOwners) { if (owner.owner === context.resourceOwner) { this.notebookOwners.delete(handle); this.notebookScopes.delete(handle); } }
			await context.tail;
			await this.release(context);
			if (publish) {
				await previous;
				this.views.delete(id);
				if (store) {
					await store.saveResume(view ?? { screen: 'home' });
					await this.collectDrafts(store);
				}
			}
		} finally { complete?.(); }
	}

	private async collectDrafts(store: BeaconStore): Promise<void> {
		const resume = await store.readResume();
		const referenced = new Set([resume?.id, resume?.homeId]);
		for (const views of this.views.values()) {
			const view = views.get(store.binding.identity); if (view) { referenced.add(view.id); referenced.add(view.homeId); }
		}
		for (const item of await store.listHistory(true)) {
			if (referenced.has(item.id)) { continue; }
			let release: (() => Promise<void>) | undefined;
			try { release = await acquireBeaconLease(store.binding.identity, `conversation:${item.id}`); }
			catch (error) { if (error instanceof Error && error.message === 'conversation-open') { continue; } throw error; }
			try {
				const record = await store.readConversation(item.id);
				if (record?.data.draftOnly === true && record.data.messages.length === 0) { await store.deleteConversation(item.id); }
			} finally { await release(); }
		}
	}

	async dispose(): Promise<void> {
		await this.flushResume();
		this.disposed = true;
		await Promise.all([...this.windows.keys()].map(id => this.closeWindow(id)));
		await this.notebooks.dispose();
	}

	async flushResume(): Promise<void> {
		let tail: Promise<unknown>;
		do { tail = this.resumeTail; await tail; } while (tail !== this.resumeTail);
	}
}
