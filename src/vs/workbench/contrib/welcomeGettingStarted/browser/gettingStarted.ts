/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { splitRecentLabel } from '../../../../base/common/labels.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWindowOpenable } from '../../../../platform/window/common/window.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IRecentFolder, IRecentWorkspace, IRecentlyOpened, IWorkspacesService, isRecentFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { OpenRecentAction } from '../../../browser/actions/windowActions.js';
import { OpenFolderViaWorkspaceAction } from '../../../browser/actions/workspaceActions.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { startEntries } from '../common/gettingStartedStartEntries.js';
import { GettingStartedEditorOptions, GettingStartedInput } from './gettingStartedInput.js';
import { GettingStartedIndexList } from './gettingStartedList.js';
import './gettingStartedColors.js';
import './media/gettingStarted.css';

const configurationKey = 'workbench.startupEditor';

export const inWelcomeContext = new RawContextKey<boolean>('inWelcome', false);

export interface IWelcomePageStartEntry {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly command: string;
	readonly order: number;
	readonly icon: { readonly type: 'icon'; readonly icon: ThemeIcon };
	readonly when: ContextKeyExpression;
}

const parsedStartEntries: readonly IWelcomePageStartEntry[] = startEntries.map((entry, index) => ({
	command: entry.command,
	description: entry.description,
	icon: { type: 'icon', icon: entry.icon },
	id: entry.id,
	order: index,
	title: entry.title,
	when: ContextKeyExpr.deserialize(entry.when) ?? ContextKeyExpr.true()
}));

type GettingStartedActionClassification = {
	command: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The command being executed on the getting started page.' };
	argument: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The arguments being passed to the command' };
	owner: 'lramos15';
	comment: 'Help understand what actions are most commonly taken on the getting started page';
};

type GettingStartedActionEvent = {
	readonly command: string;
	readonly argument: string | undefined;
};

type RecentEntry = (IRecentFolder | IRecentWorkspace) & { readonly id: string };

export class GettingStartedPage extends EditorPane {

	static readonly ID = 'gettingStartedPage';

	private readonly dispatchListeners = this._register(new DisposableStore());
	private readonly pageDisposables = this._register(new DisposableStore());
	private readonly recentlyOpenedList = this._register(new MutableDisposable<GettingStartedIndexList<RecentEntry>>());
	private readonly startList = this._register(new MutableDisposable<GettingStartedIndexList<IWelcomePageStartEntry>>());

	private readonly container: HTMLElement;
	private readonly contextService: IContextKeyService;
	private categoriesSlide!: HTMLElement;
	private categoriesPageScrollbar: DomScrollableElement | undefined;
	private recentlyOpened: Promise<IRecentlyOpened>;

	get editorInput(): GettingStartedInput | undefined {
		return this._input as GettingStartedInput | undefined;
	}

	constructor(
		group: IEditorGroup,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextService: IContextKeyService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super(GettingStartedPage.ID, group, telemetryService, themeService, storageService);

		this.container = $('.gettingStartedContainer.noWalkthroughs', {
			role: 'document',
			tabindex: 0,
			'aria-label': localize('welcomeAriaLabel', "Overview of how to get started with BeCoder.")
		});
		this.contextService = this._register(contextService.createScoped(this.container));
		inWelcomeContext.bindTo(this.contextService).set(true);

		this.recentlyOpened = this.workspacesService.getRecentlyOpened();
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => {
			this.recentlyOpened = this.workspacesService.getRecentlyOpened();
			this.refreshRecentlyOpened();
		}));
	}

	override async setInput(input: GettingStartedInput, options: GettingStartedEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		input.showTelemetryNotice = options?.showTelemetryNotice ?? input.showTelemetryNotice;
		this.buildWelcomePage();
	}

	override setOptions(options: GettingStartedEditorOptions | undefined): void {
		super.setOptions(options);
		if (this.editorInput && options?.showTelemetryNotice !== undefined) {
			this.editorInput.showTelemetryNotice = options.showTelemetryNotice;
			this.buildWelcomePage();
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this.categoriesPageScrollbar?.dispose();
		this.categoriesSlide = $('.gettingStartedSlideCategories.gettingStartedSlide');
		this.categoriesPageScrollbar = this._register(new DomScrollableElement(this.categoriesSlide, { className: 'full-height-scrollable categoriesScrollbar' }));
		this.container.appendChild($('.gettingStarted', {}, this.categoriesPageScrollbar.getDomNode()));
		parent.appendChild(this.container);
	}

	private buildWelcomePage(): void {
		this.pageDisposables.clear();

		const showOnStartupCheckbox = this.pageDisposables.add(new Toggle({
			icon: Codicon.check,
			actionClassName: 'getting-started-checkbox',
			isChecked: this.configurationService.getValue(configurationKey) === 'welcomePage',
			title: localize('checkboxTitle', "When checked, this page will be shown on startup."),
			...defaultToggleStyles
		}));
		showOnStartupCheckbox.domNode.id = 'showOnStartup';
		const showOnStartupLabel = $('label.caption', { for: 'showOnStartup' }, localize('welcomePage.showOnStartup', "Show welcome page on startup"));
		const updateStartupSetting = () => {
			const checked = showOnStartupCheckbox.checked;
			this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', {
				command: checked ? 'showOnStartupChecked' : 'showOnStartupUnchecked',
				argument: undefined
			});
			this.configurationService.updateValue(configurationKey, checked ? 'welcomePage' : 'none');
		};
		this.pageDisposables.add(showOnStartupCheckbox.onChange(updateStartupSetting));
		this.pageDisposables.add(addDisposableListener(showOnStartupLabel, 'click', () => {
			showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
			updateStartupSetting();
		}));

		const header = $('.header', {},
			$('h1.product-name.caption', {}, this.productService.nameLong),
			$('p.subtitle.description', {}, localize({ key: 'gettingStarted.editingEvolved', comment: ['Shown as subtitle on the Welcome page.'] }, "Editing evolved"))
		);
		const leftColumn = $('.categories-column.categories-column-left', {}, this.buildStartList().getDomElement());
		const recentList = this.buildRecentlyOpenedList();
		recentList.setLimit(10);
		const rightColumn = $('.categories-column.categories-column-right', {}, recentList.getDomElement());
		const footer = $('.footer', {}, $('p.showOnStartup', {}, showOnStartupCheckbox.domNode, showOnStartupLabel));

		if (this.editorInput?.showTelemetryNotice && this.productService.openToWelcomeMainPage) {
			const telemetryNotice = $('p.telemetry-notice');
			this.buildTelemetryFooter(telemetryNotice);
			footer.appendChild(telemetryNotice);
		}

		reset(this.categoriesSlide, $('.gettingStartedCategoriesContainer', {}, header, leftColumn, rightColumn, footer));
		this.categoriesPageScrollbar?.scanDomNode();
		this.registerDispatchListeners();
	}

	private registerDispatchListeners(): void {
		this.dispatchListeners.clear();
		// eslint-disable-next-line no-restricted-syntax
		this.container.querySelectorAll('[x-dispatch]').forEach(element => {
			const [command, argument] = (element.getAttribute('x-dispatch') ?? '').split(':');
			if (!command) {
				return;
			}
			const run = (event: Event) => {
				event.stopPropagation();
				this.runDispatchCommand(command, argument);
			};
			this.dispatchListeners.add(addDisposableListener(element, 'click', run));
			this.dispatchListeners.add(addDisposableListener(element, 'keyup', event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.keyCode === KeyCode.Enter || keyboardEvent.keyCode === KeyCode.Space) {
					run(event);
				}
			}));
		});
	}

	private async runDispatchCommand(command: string, argument: string): Promise<void> {
		this.commandService.executeCommand('workbench.action.keepEditor');
		this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command, argument });
		switch (command) {
			case 'showMoreRecents':
				await this.commandService.executeCommand(OpenRecentAction.ID);
				break;
			case 'openFolder':
				await this.commandService.executeCommand(
					this.contextService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace')))
						? OpenFolderViaWorkspaceAction.ID
						: 'workbench.action.files.openFolder'
				);
				break;
			case 'selectStartEntry': {
				const selected = startEntries.find(entry => entry.id === argument);
				if (!selected) {
					throw new Error(`Could not find start entry with id: ${argument}`);
				}
				await this.runStartEntryCommand(selected.command);
				break;
			}
		}
	}

	private async runStartEntryCommand(href: string): Promise<void> {
		if (!href.startsWith('command:')) {
			if (href.startsWith('https://') || href.startsWith('http://')) {
				await this.openerService.open(href);
			} else {
				await this.commandService.executeCommand(href);
			}
			return;
		}

		const commandUri = URI.parse(href.replace(/^command:toSide:/, 'command:'));
		let args: unknown = [];
		try {
			args = parse(decodeURIComponent(commandUri.query));
		} catch {
			try {
				args = parse(commandUri.query);
			} catch {
				args = [];
			}
		}
		await this.commandService.executeCommand(commandUri.path, ...(Array.isArray(args) ? args : [args]));
	}

	private buildStartList(): GettingStartedIndexList<IWelcomePageStartEntry> {
		const list = this.startList.value = new GettingStartedIndexList({
			title: localize('start', "Start"),
			klass: 'start-container',
			limit: 10,
			renderElement: entry => $('li', {}, $('button.button-link', {
				'x-dispatch': `selectStartEntry:${entry.id}`,
				title: `${entry.description} ${this.getKeybindingLabel(entry.command)}`
			}, this.iconWidgetFor(entry), $('span', {}, entry.title))),
			rankElement: entry => -entry.order,
			contextService: this.contextService
		});
		list.setEntries([...parsedStartEntries]);
		list.onDidChange(() => this.registerDispatchListeners());
		return list;
	}

	private buildRecentlyOpenedList(): GettingStartedIndexList<RecentEntry> {
		const list = this.recentlyOpenedList.value = new GettingStartedIndexList({
			title: localize('recent', "Recent"),
			klass: 'recently-opened',
			limit: 10,
			empty: $('.empty-recent', {},
				localize('noRecents', "You have no recent folders,"),
				$('button.button-link', { 'x-dispatch': 'openFolder' }, localize('openFolder', "open a folder")),
				localize('toStart', "to start.")),
			more: $('.more', {}, $('button.button-link', {
				'x-dispatch': 'showMoreRecents',
				title: localize('show more recents', "Show All Recent Folders {0}", this.getKeybindingLabel(OpenRecentAction.ID))
			}, localize('showAll', "More..."))),
			renderElement: recent => this.renderRecent(recent),
			contextService: this.contextService
		});
		list.onDidChange(() => this.registerDispatchListeners());
		this.recentlyOpened.then(({ workspaces }) => {
			const entries = this.filterRecentlyOpened(workspaces);
			const updateEntries = () => list.setEntries(entries);
			updateEntries();
			list.register(this.labelService.onDidChangeFormatters(updateEntries));
		}).catch(onUnexpectedError);
		return list;
	}

	private renderRecent(recent: RecentEntry): HTMLElement {
		const isFolder = isRecentFolder(recent);
		const fullPath = recent.label || this.labelService.getWorkspaceLabel(isFolder ? recent.folderUri : recent.workspace, { verbose: Verbosity.LONG });
		const openable: IWindowOpenable = isFolder ? { folderUri: recent.folderUri } : { workspaceUri: recent.workspace.configPath };
		const resource = isFolder ? recent.folderUri : recent.workspace.configPath;
		const { name, parentPath } = splitRecentLabel(fullPath);
		const item = $('li');
		const link = $('button.button-link', {
			title: fullPath,
			'aria-label': localize('welcomePage.openFolderWithPath', "Open folder {0} with path {1}", name, parentPath)
		}, name);
		link.addEventListener('click', event => {
			this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'openRecent', argument: undefined });
			this.hostService.openWindow([openable], {
				forceNewWindow: event.ctrlKey || event.metaKey,
				remoteAuthority: recent.remoteAuthority || null
			});
			event.preventDefault();
			event.stopPropagation();
		});
		item.append(link, $('span.path.detail', { title: fullPath }, parentPath));

		const removeButton = $('a.codicon.codicon-close.hide-category-button.recently-opened-delete-button', {
			tabindex: 0,
			role: 'button',
			title: localize('welcomePage.removeRecent', "Remove from Recently Opened"),
			'aria-label': localize('welcomePage.removeRecentAriaLabel', "Remove {0} from Recently Opened", name)
		});
		const remove = async (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			await this.workspacesService.removeRecentlyOpened([resource]);
		};
		removeButton.addEventListener('click', remove);
		removeButton.addEventListener('keydown', event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.Enter || keyboardEvent.keyCode === KeyCode.Space) {
				remove(event);
			}
		});
		item.appendChild(removeButton);
		return item;
	}

	private filterRecentlyOpened(workspaces: readonly (IRecentFolder | IRecentWorkspace)[]): RecentEntry[] {
		return workspaces
			.filter(recent => !this.workspaceContextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri))
			.map(recent => ({ ...recent, id: isRecentWorkspace(recent) ? recent.workspace.id : recent.folderUri.toString() }));
	}

	private refreshRecentlyOpened(): void {
		this.recentlyOpened.then(({ workspaces }) => {
			this.recentlyOpenedList.value?.setEntries(this.filterRecentlyOpened(workspaces));
		}).catch(onUnexpectedError);
	}

	private iconWidgetFor(entry: IWelcomePageStartEntry): HTMLElement {
		const widget = $(ThemeIcon.asCSSSelector(entry.icon.icon));
		widget.classList.add('icon-widget');
		return widget;
	}

	private buildTelemetryFooter(parent: HTMLElement): void {
		const privacyStatement = `[${localize('privacy statement', "privacy statement")}](command:workbench.action.openPrivacyStatementUrl)`;
		const optOut = `[${localize('optOut', "opt out")}](command:settings.filterByTelemetry)`;
		const text = localize({ key: 'footer', comment: ['first substitution is the product name, second is privacy statement, third is opt out.'] },
			"{0} collects usage data. Read our {1} and learn how to {2}.", this.productService.nameShort, privacyStatement, optOut);
		const rendered = this.pageDisposables.add(this.markdownRendererService.render({ value: text, isTrusted: true }));
		parent.append(rendered.element);
	}

	private getKeybindingLabel(command: string): string {
		const label = this.keybindingService.lookupKeybinding(command.replace(/^command:/, ''))?.getLabel();
		return label ? `(${label})` : '';
	}

	override layout(size: Dimension): void {
		this.startList.value?.layout(size);
		this.recentlyOpenedList.value?.layout(size);
		this.container.classList.toggle('height-constrained', size.height <= 600);
		this.container.classList.toggle('width-constrained', size.width <= 400);
		this.container.classList.toggle('width-semi-constrained', size.width <= 950);
		this.categoriesPageScrollbar?.scanDomNode();
	}

	override clearInput(): void {
		this.pageDisposables.clear();
		super.clearInput();
	}

	override focus(): void {
		super.focus();
		const active = this.container.ownerDocument.activeElement;
		let parent = this.container.parentElement;
		while (parent && parent !== active) {
			parent = parent.parentElement;
		}
		if (parent) {
			this.container.focus();
		}
	}
}

export class GettingStartedInputSerializer implements IEditorSerializer {
	canSerialize(_editorInput: GettingStartedInput): boolean {
		return true;
	}

	serialize(_editorInput: GettingStartedInput): string {
		return '{}';
	}

	deserialize(instantiationService: IInstantiationService, _serializedEditorInput: string): GettingStartedInput {
		return instantiationService.createInstance(GettingStartedInput, {});
	}
}
