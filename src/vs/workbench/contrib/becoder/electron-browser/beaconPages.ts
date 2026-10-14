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
import { beCoderNotebookStreamMime, describeNotebookMetadata } from '../common/beCoderNotebook.js';

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
				if (notebook) {
					let version = this.versions.get(notebook); if (!version) { version = { id: generateUuid(), navigation: 0 }; this.versions.set(notebook, version); }
					return { key: this.key(editor, uri.toString()), kind: 'notebook' as const, title: editor.getName(), uri: uri.toString(), version: `${version.id}:${notebook.versionId}`, dirty: editor.isDirty(), read: async () => {
						if (uri.scheme === 'file') { await this.context.checkPageAccess(this.windowId, uri.fsPath); }
						if (this.notebooks.getNotebookTextModel(uri) !== notebook) { throw new Error('beacon-page-changed'); }
						const cells = notebook.cells.map(cell => ({
							id: (cell.metadata.becoder as { id?: string } | undefined)?.id,
							kind: cell.cellKind, language: cell.language, source: cell.getValue(), metadata: describeNotebookMetadata(cell.metadata),
							outputs: cell.outputs.map(output => ({
								metadata: output.metadata,
								items: output.outputs.map(item => ({ mime: item.mime, ...(item.mime === beCoderNotebookStreamMime || item.mime.startsWith('text/') || item.mime.includes('stdout') || item.mime.includes('stderr') ? { text: item.data.toString() } : { byteLength: item.data.byteLength }) }))
							}))
						}));
						return JSON.stringify({ representation: 'Loaded Notebook cells and current outputs; attachments are described by name, MIME and byte length, not model vision input', metadata: describeNotebookMetadata(notebook.metadata), cells }, null, 2);
					} };
				}
				const model = this.models.getModel(uri);
				let version = model && this.versions.get(model);
				if (model && !version) { version = { id: generateUuid(), navigation: 0 }; this.versions.set(model, version); }
				return { key: this.key(editor, uri.toString()), kind: 'text' as const, title: editor.getName(), uri: uri.toString(), version: `${version?.id}:${model?.getVersionId()}`, dirty: editor.isDirty(), reason: model ? undefined : 'beacon-page-provider-unavailable', read: async () => {
					if (uri.scheme === 'file') { await this.context.checkPageAccess(this.windowId, uri.fsPath); }
					if (!model || model.isDisposed() || this.models.getModel(uri) !== model) { throw new Error('beacon-page-changed'); }
					return model.getValue();
				} };
			});
		});
	}
}
