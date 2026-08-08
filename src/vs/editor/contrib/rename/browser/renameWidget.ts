/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { assertType } from '../../../../base/common/types.js';
import './renameWidget.css';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IDimension } from '../../../common/core/2d/dimension.js';
import { Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ScrollType } from '../../../common/editorCommon.js';
import * as nls from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	editorWidgetBackground,
	inputBackground,
	inputBorder,
	inputForeground,
	widgetBorder,
	widgetShadow
} from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';

/** for debugging */
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;


export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false, nls.localize('renameInputVisible', "Whether the rename input widget is visible"));
export const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey<boolean>('renameInputFocused', false, nls.localize('renameInputFocused', "Whether the rename input widget is focused"));

export type RenameWidgetResult = {
	/**
	 * The new name to be used
	 */
	newName: string;
	wantsPreview?: boolean;
};

interface IRenameWidget {
	/**
	 * @returns a `boolean` standing for `shouldFocusEditor`, if user didn't pick a new name, or a {@link RenameWidgetResult}
	 */
	getInput(
		where: IRange,
		currentName: string,
		supportPreview: boolean,
		cts: CancellationTokenSource
	): Promise<RenameWidgetResult | boolean>;

	acceptInput(wantsPreview: boolean): void;
	cancelInput(focusEditor: boolean, caller: string): void;
}

export class RenameWidget implements IRenameWidget, IContentWidget, IDisposable {

	// implement IContentWidget
	readonly allowEditorOverflow: boolean = true;

	// UI state

	private _domNode?: HTMLElement;
	private _inputWithButton: InputWithButton;
	private _label?: HTMLDivElement;

	// Model state

	private _position?: Position;

	private _visible?: boolean;

	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _acceptKeybindings: [string, string],
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);

		this._inputWithButton = new InputWithButton();
		this._disposables.add(this._inputWithButton);

		this._editor.addContentWidget(this);

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
	}

	dispose(): void {
		this._disposables.dispose();
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return '__renameInputWidget';
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.className = 'monaco-editor rename-box';

			this._domNode.appendChild(this._inputWithButton.domNode);

			this._label = document.createElement('div');
			this._label.className = 'rename-label';
			this._domNode.appendChild(this._label);

			this._updateFont();
			this._updateStyles(this._themeService.getColorTheme());
		}
		return this._domNode;
	}

	private _updateStyles(theme: IColorTheme): void {
		if (!this._domNode) {
			return;
		}

		const widgetShadowColor = theme.getColor(widgetShadow);
		const widgetBorderColor = theme.getColor(widgetBorder);
		this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? '');
		this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : '';
		this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : '';
		this._domNode.style.color = String(theme.getColor(inputForeground) ?? '');

		const border = theme.getColor(inputBorder);

		this._inputWithButton.domNode.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		this._inputWithButton.input.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		this._inputWithButton.domNode.style.borderWidth = border ? '1px' : '0px';
		this._inputWithButton.domNode.style.borderStyle = border ? 'solid' : 'none';
		this._inputWithButton.domNode.style.borderColor = border?.toString() ?? 'none';
	}

	private _updateFont(): void {
		if (this._domNode === undefined) {
			return;
		}
		assertType(this._label !== undefined, 'RenameWidget#_updateFont: _label must not be undefined given _domNode is defined');

		this._editor.applyFontInfo(this._inputWithButton.input);

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
	}

	private _computeLabelFontSize(editorFontSize: number) {
		return editorFontSize * 0.8;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._visible) {
			return null;
		}

		if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
			!this._editor.getDomNode() // @ulugbekna: can happen during tests based on suggestWidget's similar predicate check
		) {
			return null;
		}

		return {
			position: this._position!,
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE],
		};
	}

	beforeRender(): IDimension | null {
		const [accept, preview] = this._acceptKeybindings;
		this._label!.innerText = nls.localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());

		this._domNode!.style.minWidth = `200px`; // to prevent from widening when candidates come in

		return null;
	}

	afterRender(position: ContentWidgetPositionPreference | null): void {
		// FIXME@ulugbekna: commenting trace log out until we start unmounting the widget from editor properly - https://github.com/microsoft/vscode/issues/226975
		// this._trace('invoking afterRender, position: ', position ? 'not null' : 'null');
		if (position === null) {
			// cancel rename when input widget isn't rendered anymore
			this.cancelInput(true, 'afterRender (because position is null)');
			return;
		}

		if (!this._editor.hasModel() || // shouldn't happen
			!this._editor.getDomNode() // can happen during tests based on suggestWidget's similar predicate check
		) {
			return;
		}
	}


	private _currentAcceptInput?: (wantsPreview: boolean) => void;
	private _currentCancelInput?: (focusEditor: boolean) => void;

	acceptInput(wantsPreview: boolean): void {
		this._trace(`invoking acceptInput`);
		this._currentAcceptInput?.(wantsPreview);
	}

	cancelInput(focusEditor: boolean, caller: string): void {
		// this._trace(`invoking cancelInput, caller: ${caller}, _currentCancelInput: ${this._currentAcceptInput ? 'not undefined' : 'undefined'}`);
		this._currentCancelInput?.(focusEditor);
	}

	getInput(
		where: IRange,
		currentName: string,
		supportPreview: boolean,
		cts: CancellationTokenSource
	): Promise<RenameWidgetResult | boolean> {

		const { start: selectionStart, end: selectionEnd } = this._getSelection(where, currentName);

		const disposeOnDone = new DisposableStore();

		this._domNode!.classList.toggle('preview', supportPreview);

		this._position = new Position(where.startLineNumber, where.startColumn);

		this._inputWithButton.input.value = currentName;
		this._inputWithButton.input.setAttribute('selectionStart', selectionStart.toString());
		this._inputWithButton.input.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputWithButton.input.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20); // determines width

		disposeOnDone.add(toDisposable(() => {
			cts.dispose(true);
		})); // @ulugbekna: this may result in `this.cancelInput` being called twice, but it should be safe since we set it to undefined after 1st call

		const inputResult = new DeferredPromise<RenameWidgetResult | boolean>();

		inputResult.p.finally(() => {
			disposeOnDone.dispose();
			this._hide();
		});

		this._currentCancelInput = (focusEditor) => {
			this._trace('invoking _currentCancelInput');
			this._currentAcceptInput = undefined;
			this._currentCancelInput = undefined;
			inputResult.complete(focusEditor);
			return true;
		};

		this._currentAcceptInput = (wantsPreview) => {
			this._trace('invoking _currentAcceptInput');
			const newName = this._inputWithButton.input.value;

			if (newName === currentName || newName.trim().length === 0 /* is just whitespace */) {
				this.cancelInput(true, '_currentAcceptInput (because newName === value || newName.trim().length === 0)');
				return;
			}

			this._currentAcceptInput = undefined;
			this._currentCancelInput = undefined;

			inputResult.complete({
				newName,
				wantsPreview: supportPreview && wantsPreview
			});
		};

		disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, 'cts.token.onCancellationRequested')));
		if (!_sticky) {
			disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), 'editor.onDidBlurEditorWidget')));
		}

		this._show();

		return inputResult.p;
	}

	/**
	 * This allows selecting only part of the symbol name in the input field based on the selection in the editor
	 */
	private _getSelection(where: IRange, currentName: string): { start: number; end: number } {
		assertType(this._editor.hasModel());

		const selection = this._editor.getSelection();
		let start = 0;
		let end = currentName.length;

		if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(where, selection)) {
			start = Math.max(0, selection.startColumn - where.startColumn);
			end = Math.min(where.endColumn, selection.endColumn) - where.startColumn;
		}

		return { start, end };
	}

	private _show(): void {
		this._trace('invoking _show');
		this._editor.revealLineInCenterIfOutsideViewport(this._position!.lineNumber, ScrollType.Smooth);
		this._visible = true;
		this._visibleContextKey.set(true);
		this._editor.layoutContentWidget(this);

		// TODO@ulugbekna: could this be simply run in `afterRender`?
		setTimeout(() => {
			this._inputWithButton.input.focus();
			this._inputWithButton.input.setSelectionRange(
				parseInt(this._inputWithButton.input.getAttribute('selectionStart')!),
				parseInt(this._inputWithButton.input.getAttribute('selectionEnd')!)
			);
		}, 100);
	}

	private _hide(): void {
		this._trace('invoked _hide');
		this._visible = false;
		this._visibleContextKey.reset();
		this._editor.layoutContentWidget(this);
	}

	private _trace(...args: unknown[]) {
		this._logService.trace('RenameWidget', ...args);
	}
}

class InputWithButton implements IDisposable {
	private _domNode: HTMLDivElement | undefined;
	private _inputNode: HTMLInputElement | undefined;

	private readonly _disposables = new DisposableStore();

	get domNode() {
		if (!this._domNode) {

			this._domNode = document.createElement('div');
			this._domNode.className = 'rename-input-with-button';
			this._domNode.style.display = 'flex';
			this._domNode.style.flexDirection = 'row';
			this._domNode.style.alignItems = 'center';

			this._inputNode = document.createElement('input');
			this._inputNode.className = 'rename-input';
			this._inputNode.type = 'text';
			this._inputNode.style.border = 'none';
			this._inputNode.setAttribute('aria-label', nls.localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));

			this._domNode.appendChild(this._inputNode);

			// focus "container" border instead of input box

			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => {
				this.domNode.style.outlineWidth = '1px';
				this.domNode.style.outlineStyle = 'solid';
				this.domNode.style.outlineOffset = '-1px';
				this.domNode.style.outlineColor = 'var(--vscode-focusBorder)';
			}));
			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.BLUR, () => {
				this.domNode.style.outline = 'none';
			}));
		}
		return this._domNode;
	}

	get input() {
		assertType(this._inputNode);
		return this._inputNode;
	}
	dispose(): void {
		this._disposables.dispose();
	}
}
