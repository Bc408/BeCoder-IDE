/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, PauseableEmitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IFileMatch, ISearchComplete, ITextQuery } from '../../../../services/search/common/search.js';
import { arrayContainsElementOrParent, IChangeEvent, ISearchTreeFileMatch, ISearchTreeFolderMatch, IPlainTextSearchHeading, ISearchModel, ISearchResult, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWithResource, isSearchTreeMatch, isTextSearchHeading, ITextSearchHeading, mergeSearchResultEvents, RenderableMatch, SEARCH_RESULT_PREFIX } from './searchTreeCommon.js';

import { RangeHighlightDecorations } from './rangeDecorations.js';
import { PlainTextSearchHeadingImpl } from './textSearchHeading.js';

export class SearchResultImpl extends Disposable implements ISearchResult {

	private _onChange = this._register(new PauseableEmitter<IChangeEvent>({
		merge: mergeSearchResultEvents
	}));
	readonly onChange: Event<IChangeEvent> = this._onChange.event;
	private readonly _onWillChangeModelListener = this._register(new MutableDisposable());
	private readonly _onDidChangeModelListener = this._register(new MutableDisposable());
	private _plainTextSearchResult: PlainTextSearchHeadingImpl;

	private readonly _id: string;
	constructor(
		public readonly searchModel: ISearchModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super();
		this._plainTextSearchResult = this._register(this.instantiationService.createInstance(PlainTextSearchHeadingImpl, this));

		this._register(this._plainTextSearchResult.onChange((e) => this._onChange.fire(e)));

		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this._register(this.modelService.onModelAdded(model => this.onModelAdded(model)));

		this._register(this.notebookEditorService.onDidAddNotebookEditor(widget => {
			if (widget instanceof NotebookEditorWidget) {
				this.onDidAddNotebookEditorWidget(<NotebookEditorWidget>widget);
			}
		}));

		this._id = SEARCH_RESULT_PREFIX + Date.now().toString();
	}

	id(): string {
		return this._id;
	}

	get plainTextSearchResult(): IPlainTextSearchHeading {
		return this._plainTextSearchResult;
	}

	get children() {
		return this.textSearchResults;
	}

	get hasChildren(): boolean {
		return true; // should always have a Text Search Result for plain results.
	}
	get textSearchResults(): ITextSearchHeading[] {
		return [this._plainTextSearchResult];
	}

	async batchReplace(elementsToReplace: RenderableMatch[]) {
		try {
			this._onChange.pause();
			await Promise.all(elementsToReplace.map(async (elem) => {
				const parent = elem.parent();

				if ((isSearchTreeFolderMatch(parent) || isSearchTreeFileMatch(parent)) && arrayContainsElementOrParent(parent, elementsToReplace)) {
					// skip any children who have parents in the array
					return;
				}

				if (isSearchTreeFileMatch(elem)) {
					await elem.parent().replace(elem);
				} else if (isSearchTreeMatch(elem)) {
					await elem.parent().replace(elem);
				} else if (isSearchTreeFolderMatch(elem)) {
					await elem.replaceAll();
				}
			}));
		} finally {
			this._onChange.resume();
		}
	}

	batchRemove(elementsToRemove: RenderableMatch[]) {
		// need to check that we aren't trying to remove elements twice
		const removedElems: RenderableMatch[] = [];

		try {
			this._onChange.pause();
			elementsToRemove.forEach((currentElement) => {
				if (!arrayContainsElementOrParent(currentElement, removedElems)) {
					if (isTextSearchHeading(currentElement)) {
						currentElement.hide();
					} else if (!isSearchTreeFolderMatch(currentElement) || isSearchTreeFolderMatchWithResource(currentElement) || isSearchTreeFolderMatchNoRoot(currentElement)) {
						if (isSearchTreeFileMatch(currentElement)) {
							currentElement.parent().remove(currentElement);
						} else if (isSearchTreeMatch(currentElement)) {
							currentElement.parent().remove(currentElement);
						} else if (isSearchTreeFolderMatchWithResource(currentElement)) {
							currentElement.parent().remove(currentElement);
						} else if (isSearchTreeFolderMatchNoRoot(currentElement)) {
							const parent = currentElement.parent();
							if (isTextSearchHeading(parent)) {
								parent.remove(currentElement);
							}
						}
						removedElems.push(currentElement);
					}
				}
			}
			);
		} finally {
			this._onChange.resume();
		}
	}

	get isDirty(): boolean {
		return this._plainTextSearchResult.isDirty;
	}

	get query(): ITextQuery | null {
		return this._plainTextSearchResult.query;
	}

	set query(query: ITextQuery | null) {
		this._plainTextSearchResult.query = query;
	}

	private onDidAddNotebookEditorWidget(widget: NotebookEditorWidget): void {

		this._onWillChangeModelListener.value = widget.onWillChangeModel(
			(model) => {
				if (model) {
					this.onNotebookEditorWidgetRemoved(widget, model?.uri);
				}
			}
		);

		// listen to view model change as we are searching on both inputs and outputs
		this._onDidChangeModelListener.value = widget.onDidAttachViewModel(
			() => {
				if (widget.hasModel()) {
					this.onNotebookEditorWidgetAdded(widget, widget.textModel.uri);
				}
			}
		);
	}

	folderMatches(): ISearchTreeFolderMatch[] {
		return this._plainTextSearchResult.folderMatches();
	}

	private onModelAdded(model: ITextModel): void {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(model.uri);
		folderMatch?.bindModel(model);
	}

	private async onNotebookEditorWidgetAdded(editor: NotebookEditorWidget, resource: URI): Promise<void> {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(resource);
		await folderMatch?.bindNotebookEditorWidget(editor, resource);
	}

	private onNotebookEditorWidgetRemoved(editor: NotebookEditorWidget, resource: URI): void {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(resource);
		folderMatch?.unbindNotebookEditorWidget(editor, resource);
	}


	add(allRaw: IFileMatch[], searchInstanceID: string, silent: boolean = false): void {
		this._plainTextSearchResult.hidden = false;
		this._plainTextSearchResult.add(allRaw, searchInstanceID, silent);
	}

	clear(): void {
		this._plainTextSearchResult.clear();
	}

	remove(matches: ISearchTreeFileMatch | ISearchTreeFolderMatch | (ISearchTreeFileMatch | ISearchTreeFolderMatch)[]): void {
		this._plainTextSearchResult.remove(matches);

	}

	replace(match: ISearchTreeFileMatch): Promise<any> {
		return this._plainTextSearchResult.replace(match);
	}

	matches(): ISearchTreeFileMatch[] {
		return this._plainTextSearchResult.matches();
	}

	isEmpty(): boolean {
		return this._plainTextSearchResult.isEmpty();
	}

	fileCount(): number {
		return this._plainTextSearchResult.fileCount();
	}

	count(): number {
		return this._plainTextSearchResult.count();
	}

	setCachedSearchComplete(cachedSearchComplete: ISearchComplete | undefined) {
		this._plainTextSearchResult.cachedSearchComplete = cachedSearchComplete;
	}

	getCachedSearchComplete(): ISearchComplete | undefined {
		return this._plainTextSearchResult.cachedSearchComplete;
	}

	toggleHighlights(value: boolean): void {
		this._plainTextSearchResult.toggleHighlights(value);
	}

	getRangeHighlightDecorations(): RangeHighlightDecorations {
		return this._plainTextSearchResult.rangeHighlightDecorations;
	}

	replaceAll(progress: IProgress<IProgressStep>): Promise<any> {
		return this._plainTextSearchResult.replaceAll(progress);
	}

	override async dispose(): Promise<void> {
		this._plainTextSearchResult?.dispose();
		super.dispose();
	}
}
