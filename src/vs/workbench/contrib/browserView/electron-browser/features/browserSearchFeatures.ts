/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { BrowserCustomSearchEnginesSettingId, BrowserSearchEngineId, BrowserSearchEngineSettingId } from '../../common/browserSearch.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserSearchEngineSettingId]: {
			type: 'string',
			default: BrowserSearchEngineId.Bing,
			markdownDescription: localize(
				'browser.searchEngine',
				"Search engine used by the integrated browser's address bar and home page. Enter `bing`, `google`, `yahoo`, `duckduckgo`, or a name from {0}. Enter `none` to disable search.",
				`\`#${BrowserCustomSearchEnginesSettingId}#\``
			),
			scope: ConfigurationScope.APPLICATION,
			order: 110
		},
		[BrowserCustomSearchEnginesSettingId]: {
			type: 'object',
			default: {},
			additionalProperties: { type: 'string' },
			markdownDescription: localize(
				'browser.customSearchEngines',
				"Custom search engines, mapped from a name to an HTTP(S) URL containing `{query}`, for example `https://example.com/search?q={query}`. Select the name in {0}. Built-in names and `none` are reserved.",
				`\`#${BrowserSearchEngineSettingId}#\``
			),
			scope: ConfigurationScope.APPLICATION,
			order: 111
		}
	}
});
