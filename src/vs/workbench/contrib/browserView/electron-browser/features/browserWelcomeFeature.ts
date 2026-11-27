/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $, addDisposableListener, isAncestorOfActiveElement, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IBrowserViewModel, INavigateOptions } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { isBrowserHomeUrl } from '../../common/browserHome.js';
import { BrowserCustomSearchEnginesSettingId, BrowserSearchEngineSettingId, BROWSER_SEARCH_NONE, buildSearchUrl, resolveAddressBarInputType } from '../../common/browserSearch.js';
import { getOnlineJudgeLinks, onlineJudgeSitesSetting, onlineJudgesSetting } from '../../../welcomeGettingStarted/common/onlineJudges.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	IBrowserEditorWidget,
} from '../browserEditor.js';

/** The local homepage shares the browser tab's navigation and configuration. */
export class BrowserWelcomeFeature extends BrowserEditorContribution {

	private readonly _container: HTMLElement;
	private readonly _widget: IBrowserEditorWidget;
	private readonly _search: HTMLInputElement;
	private readonly _searchClear: HTMLButtonElement;
	private readonly _sites: HTMLElement;
	private readonly _siteDisposables = this._register(new DisposableStore());
	private _visible = true;

	constructor(
		editor: BrowserEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(editor);

		this._container = $('.browser-welcome-container');
		const content = $('.browser-welcome-content');

		const title = $('h1.browser-welcome-title');
		title.appendChild($('.browser-home-logo', { 'aria-hidden': 'true' }));
		title.appendChild($('span', undefined, 'BeCoder'));
		content.appendChild(title);

		const subtitle = $('.browser-welcome-subtitle');
		subtitle.textContent = localize('browser.home.subtitle', "All set");
		content.appendChild(subtitle);

		const form = $('form.browser-home-search');
		this._search = $('input', { type: 'search', autocomplete: 'off', spellcheck: 'false' });
		form.appendChild(this._search);
		const clearLabel = localize('browser.home.searchClear', "Clear");
		this._searchClear = $('button.browser-home-search-clear', { type: 'button', 'aria-label': clearLabel });
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._searchClear, clearLabel));
		this._searchClear.appendChild(renderIcon(Codicon.close));
		this._searchClear.hidden = true;
		form.appendChild(this._searchClear);
		this._register(addDisposableListener(this._search, 'input', () => {
			this._searchClear.hidden = !this._search.value;
		}));
		this._register(addDisposableListener(this._searchClear, 'click', () => {
			this._search.value = '';
			this._searchClear.hidden = true;
			this._search.focus();
		}));
		const submitLabel = localize('browser.home.searchSubmit', "Search");
		const submit = $('button.browser-home-search-submit', { type: 'submit', 'aria-label': submitLabel });
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), submit, submitLabel));
		submit.appendChild(renderIcon(Codicon.search));
		form.appendChild(submit);
		content.appendChild(form);
		this._register(addDisposableListener(form, 'submit', event => {
			event.preventDefault();
			const text = this._search.value.trim();
			if (!text) {
				return;
			}
			const engine = this.configurationService.getValue<string>(BrowserSearchEngineSettingId);
			const search = engine && engine !== BROWSER_SEARCH_NONE && resolveAddressBarInputType(text) !== 'url';
			void this._navigate(search ? buildSearchUrl(text, engine, this.configurationService.getValue(BrowserCustomSearchEnginesSettingId)) : text, { source: search ? 'searchInput' : 'urlInput' });
		}));

		this._sites = $('.browser-home-sites');
		content.appendChild(this._sites);
		const create = $('.browser-home-create');
		this._addButton(create, localize('browser.home.newC', "New C File"), Codicon.fileCode, () => this.commandService.executeCommand('workbench.action.files.newUntitledFile', { languageId: 'c' }));
		this._addButton(create, localize('browser.home.newCpp', "New C++ File"), Codicon.fileCode, () => this.commandService.executeCommand('workbench.action.files.newUntitledFile', { languageId: 'cpp' }));
		this._addButton(create, localize('browser.home.newNotebook', "New BeCoder NoteBook"), Codicon.notebook, () => this.commandService.executeCommand('becoder.notebook.new'));
		content.appendChild(create);
		const startup = $('.browser-home-startup');
		const startupLabel = localize('browser.home.showOnStartup', "Show welcome page on startup");
		const showOnStartup = this._register(new Checkbox(startupLabel, this.configurationService.getValue('workbench.startupEditor') === 'welcomePage', defaultCheckboxStyles));
		startup.appendChild(showOnStartup.domNode);
		const label = $('span.browser-home-startup-label', undefined, startupLabel);
		startup.appendChild(label);
		this._register(addDisposableListener(label, 'click', () => {
			showOnStartup.domNode.click();
			showOnStartup.focus();
		}));
		this._register(showOnStartup.onChange(() => {
			void this.configurationService.updateValue('workbench.startupEditor', showOnStartup.checked ? 'welcomePage' : 'none').catch(error => {
				showOnStartup.checked = this.configurationService.getValue('workbench.startupEditor') === 'welcomePage';
				this.notificationService.error(error);
			});
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if ([BrowserSearchEngineSettingId, BrowserCustomSearchEnginesSettingId].some(key => event.affectsConfiguration(key))) {
				this._updateSearch();
			}
			if ([onlineJudgeSitesSetting, onlineJudgesSetting].some(key => event.affectsConfiguration(key))) {
				this._updateSites();
			}
			if (event.affectsConfiguration('workbench.startupEditor')) {
				showOnStartup.checked = this.configurationService.getValue('workbench.startupEditor') === 'welcomePage';
			}
		}));
		this._updateSearch();
		this._updateSites();
		this._container.appendChild(content);
		this._container.appendChild(startup);

		this._widget = { location: BrowserWidgetLocation.ContentArea, element: this._container, order: 50 };
	}

	private _addButton(parent: HTMLElement, label: string, icon: ThemeIcon, run: () => Promise<unknown>): void {
		const button = $('button', { type: 'button', 'aria-label': label });
		button.appendChild(renderIcon(icon));
		button.appendChild($('span', undefined, label));
		parent.appendChild(button);
		this._register(addDisposableListener(button, 'click', () => {
			void run().catch(error => this.notificationService.error(error));
		}));
	}

	private async _navigate(url: string, options?: INavigateOptions): Promise<void> {
		const input = this.editor.input;
		if (!input) {
			return;
		}
		try {
			// Prerendered home controls can be used before the native view exists.
			if (!input.model) {
				await input.resolve();
			}
			if (this.editor.input === input && !input.isDisposed()) {
				input.navigate(url, options);
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private _updateSearch(): void {
		const engine = this.configurationService.getValue<string>(BrowserSearchEngineSettingId);
		this._search.placeholder = !engine || engine === BROWSER_SEARCH_NONE
			? localize('browser.home.address', "Enter a URL")
			: localize('browser.home.search', "Search the web");
		this._search.setAttribute('aria-label', this._search.placeholder);
	}

	private _updateSites(): void {
		this._siteDisposables.clear();
		reset(this._sites);
		for (const { name, url } of getOnlineJudgeLinks(this.configurationService.getValue(onlineJudgeSitesSetting), this.configurationService.getValue(onlineJudgesSetting))) {
			const button = $('button.browser-home-site', { type: 'button' }, name);
			this._sites.appendChild(button);
			this._siteDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), button, url));
			this._siteDisposables.add(addDisposableListener(button, 'click', () => { void this._navigate(url); }));
		}
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [this._widget];
	}

	override prerenderInput(input: BrowserEditorInput): void {
		this._setVisible(isBrowserHomeUrl(input.url));
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._setVisible(isBrowserHomeUrl(model.url));
		store.add(model.onDidNavigate(event => {
			this._setVisible(isBrowserHomeUrl(event.url));
			if (this._visible && isAncestorOfActiveElement(this.editor.browserContainer)) {
				this.tryFocus();
			}
		}));
	}

	override onModelDetached(): void {
		this._setVisible(true);
	}

	private _setVisible(visible: boolean): void {
		if (visible) {
			this._search.value = '';
			this._searchClear.hidden = true;
		}
		this._visible = visible;
		this._container.style.display = visible ? '' : 'none';
	}

	override tryFocus(): boolean {
		if (!this._visible) {
			return false;
		}
		this._search.focus();
		return true;
	}
}

BrowserEditor.registerContribution(BrowserWelcomeFeature);
