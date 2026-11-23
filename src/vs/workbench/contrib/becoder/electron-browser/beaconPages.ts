/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IBeaconContextService } from '../../../../platform/beacon/common/beaconContext.js';
import { BeaconPages, IBeaconPageSource } from '../../../../platform/beacon/common/beaconPages.js';
import { IBrowserViewService } from '../../../../platform/browserView/common/browserView.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import type { IBeaconCodeObservation } from '../../../../platform/beacon/common/beaconContextTypes.js';

/** Never resolves an editor, creates a model or opens a resource to acquire content. */
export class BeaconWorkbenchPages extends Disposable {
	private readonly keys = new WeakMap<EditorInput, Map<string, object>>();
	private readonly versions = new WeakMap<object, { id: string; navigation: number }>();
	private readonly watched = this._register(new DisposableMap<object>());
	readonly pages: BeaconPages;
	constructor(private readonly editors: IEditorService, private readonly models: IModelService, private readonly browsers: IBrowserViewService, private readonly context: IBeaconContextService, private readonly windowId: number, private readonly notebooks: INotebookService) {
		super();
		this.pages = new BeaconPages(() => this.sources());
		this._register(editors.onDidCloseEditor(event => {
			if (!editors.editors.includes(event.editor)) { for (const key of this.keys.get(event.editor)?.values() ?? []) { this.pages.forget(key); } }
		}));
	}
	private key(editor: EditorInput, side: string): object {
		let keys = this.keys.get(editor);
		if (!keys) { keys = new Map(); this.keys.set(editor, keys); }
		let key = keys.get(side);
		if (!key) { key = {}; keys.set(side, key); }
		return key;
	}
	async readCurrentCode(id?: string, expectedVersion?: string): Promise<Omit<IBeaconCodeObservation, 'contentSha256'>> {
		const pages = this.pages.list();
		const page = id ? pages.find(page => page.id === id) : pages.find(page => page.active && page.kind === 'text' && ['c', 'cpp'].includes(page.languageId ?? ''));
		if (!page) { throw new Error('beacon-page-closed'); }
		if (page.kind !== 'text' || !['c', 'cpp'].includes(page.languageId ?? '') || !page.uri) { throw new Error('beacon-code-unavailable'); }
		if (page.reason) { throw new Error(page.reason); }
		if (expectedVersion !== undefined && expectedVersion !== page.version) { throw new Error('beacon-page-changed'); }
		const read = await this.pages.read(page.id, page.version, 0, Number.MAX_SAFE_INTEGER);
		const uri = URI.parse(page.uri);
		return { sourceUri: page.uri, fileName: uri.path.split('/').at(-1) || page.title, ...(uri.scheme === 'file' ? { filePath: uri.fsPath } : {}), pageId: page.id, version: page.version, languageId: page.languageId as 'c' | 'cpp', observedAt: Date.now(), contents: read.contents };
	}
	private sources(): IBeaconPageSource[] {
		return this.editors.editors.flatMap<IBeaconPageSource>(editor => {
			if (editor instanceof BrowserEditorInput) {
				const model = editor.model;
				let version = model && this.versions.get(model);
				if (model && !version) {
					version = { id: generateUuid(), navigation: 0 }; this.versions.set(model, version);
					const tracked = version;
					const listeners = new DisposableStore(); this.watched.set(model, listeners);
					listeners.add(model.onDidNavigate(() => { tracked.navigation++; }));
					listeners.add(model.onWillDispose(() => this.watched.deleteAndDispose(model)));
				}
				const url = model?.url;
				return [{ key: this.key(editor, 'browser'), kind: 'browser', title: editor.getName(), uri: url, version: `${version?.id}:${version?.navigation}`, reason: model ? undefined : 'beacon-page-provider-unavailable', read: async () => {
					const uri = URI.parse(url!);
					if (uri.scheme === 'file') { await this.context.checkPageAccess(this.windowId, uri.fsPath); }
					if (await this.browsers.resolveBrowserProblem(url!) || /^https:\/\/(?:www\.)?(?:luogu\.com\.cn\/record\/|atcoder\.jp\/contests\/[^/]+\/submissions\/|codeforces\.com\/(?:contest\/[^/]+\/)?submission\/|ac\.nowcoder\.com\/acm\/contest\/view-submission|lanqiao\.cn\/problems\/[^/]+\/submissions\/)/i.test(url!)) { throw new Error('beacon-persisted-evidence-required'); }
					const text = await this.browsers.readCurrentPage(editor.id, this.windowId, url!);
					if (uri.scheme === 'file') { await this.context.checkPageAccess(this.windowId, uri.fsPath); }
					return text;
				} }];
			}
			const resources = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
			const uris = resources instanceof URI ? [resources] : [resources?.primary, resources?.secondary].filter((uri): uri is URI => !!uri);
			if (!uris.length) { return [{ key: this.key(editor, 'unsupported'), kind: 'unsupported', title: editor.getName(), version: 'unavailable', reason: 'beacon-page-provider-unavailable', read: async () => { throw new Error('beacon-page-provider-unavailable'); } }]; }
			return uris.map(uri => {
				const notebook = this.notebooks.getNotebookTextModel(uri);
				if (notebook || /\.bcnb(?:-backup)?$/i.test(uri.path)) { return { key: this.key(editor, uri.toString()), kind: 'unsupported' as const, title: editor.getName(), uri: uri.toString(), version: 'content-owner', reason: 'beacon-notebook-content-owner', read: async () => { throw new Error('beacon-notebook-content-owner'); } }; }
				const model = this.models.getModel(uri);
				let version = model && this.versions.get(model);
				if (model && !version) { version = { id: generateUuid(), navigation: 0 }; this.versions.set(model, version); }
				return { key: this.key(editor, uri.toString()), kind: 'text' as const, title: editor.getName(), uri: uri.toString(), version: `${version?.id}:${model?.getVersionId()}`, languageId: model?.getLanguageId(), dirty: editor.isDirty(), active: this.editors.activeEditor === editor, reason: model ? undefined : 'beacon-page-provider-unavailable', read: async () => {
					if (uri.scheme === 'file') { await this.context.checkPageAccess(this.windowId, uri.fsPath); }
					if (!model || model.isDisposed() || this.models.getModel(uri) !== model) { throw new Error('beacon-page-changed'); }
					return model.getValue();
				} };
			});
		});
	}
}
