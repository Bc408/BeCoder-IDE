/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { BrowserColorTheme, BrowserColorThemeSettingId, resolveBrowserAppearance } from '../../common/browserAppearance.js';
import { BrowserEditor, BrowserEditorContribution } from '../browserEditor.js';

export class BrowserAppearanceFeature extends BrowserEditorContribution {
	private _root: HTMLElement | undefined;

	constructor(
		editor: BrowserEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super(editor);
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(BrowserColorThemeSettingId)) {
				this._updateAppearance();
			}
		}));
		this._register(themeService.onDidColorThemeChange(() => this._updateAppearance()));
	}

	override onContainerCreated(container: HTMLElement): void {
		this._root = container.closest<HTMLElement>('.browser-root') ?? undefined;
		this._updateAppearance();
	}

	private _updateAppearance(): void {
		if (!this._root) {
			return;
		}
		const setting = this.configurationService.getValue<BrowserColorTheme>(BrowserColorThemeSettingId);
		this._root.dataset.browserTheme = setting === 'light' || setting === 'dark' ? setting : 'auto';
		this._root.style.colorScheme = resolveBrowserAppearance(setting, this.themeService.getColorTheme()).colorScheme;
	}
}

BrowserEditor.registerContribution(BrowserAppearanceFeature);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserColorThemeSettingId]: {
			type: 'string',
			default: 'auto',
			enum: ['auto', 'light', 'dark'],
			enumItemLabels: [localize('browser.colorTheme.auto', "Follow BeCoder"), localize('browser.colorTheme.light', "Light"), localize('browser.colorTheme.dark', "Dark")],
			description: localize('browser.colorTheme', "Color theme for the integrated browser, including its toolbar and home page. Websites receive the same light or dark preference and decide how to display it."),
			scope: ConfigurationScope.APPLICATION,
			order: 105
		}
	}
});
