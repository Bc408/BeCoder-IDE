/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/beCoderNewTab.css';
import { $, addDisposableListener, append, Dimension } from '../../../../base/browser/dom.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { localizeNewTab } from './beCoderNewTabInput.js';

export class BeCoderNewTabEditor extends EditorPane {

	// Do not derive this identifier from the class name. Production workbench
	// bundles are minified, where class names are not a stable editor ID.
	static readonly ID = 'workbench.editor.beCoderNewTab';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(BeCoderNewTabEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = append(parent, $('.becoder-new-tab'));
		const content = append(container, $('.becoder-new-tab-content'));
		append(content, $('h1', undefined, localizeNewTab('BeCoder IDE', 'BeCoder IDE')));
		// allow-any-unicode-next-line
		append(content, $('.subtitle', undefined, localizeNewTab('Competitive programming, focused.', '专注于竞赛编程。')));
		// allow-any-unicode-next-line
		append(content, $('h2', undefined, localizeNewTab('Start', '开始')));

		const actions = append(content, $('.becoder-new-tab-actions'));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('New File...', '新建文件...'), 'codicon-new-file', () => this.commandService.executeCommand('workbench.action.files.newUntitledFile', { languageId: this.configurationService.getValue<string>('becoder.newFile.defaultLanguage') || 'cpp' }));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('Open...', '打开...'), 'codicon-folder-opened', () => this.commandService.executeCommand('workbench.action.files.openFile'));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('Open Folder...', '打开文件夹...'), 'codicon-folder', () => this.commandService.executeCommand('workbench.action.files.openFolder'));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('Open File Quickly...', '快速打开文件...'), 'codicon-go-to-file', () => this.commandService.executeCommand('workbench.action.quickOpen'));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('Open Integrated Browser', '打开内置浏览器'), 'codicon-globe', () => this.commandService.executeCommand('workbench.action.browser.open'));
		// allow-any-unicode-next-line
		this.addAction(actions, localizeNewTab('Open Settings', '打开设置'), 'codicon-settings-gear', () => this.commandService.executeCommand('becoder.openSettings'));
	}

	private addAction(parent: HTMLElement, label: string, icon: string, run: () => Thenable<unknown>): void {
		const button = append(parent, $('button.becoder-new-tab-action', { type: 'button' }));
		append(button, $(`span.codicon.${icon}`, { 'aria-hidden': 'true' }));
		append(button, $('span', undefined, label));
		this._register(addDisposableListener(button, 'click', () => void run()));
	}

	override focus(): void {
		this.getContainer()?.focus();
	}

	override layout(_dimension: Dimension): void { }
}
