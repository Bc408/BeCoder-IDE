/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBrowserViewAppearance } from '../../../../platform/browserView/common/browserView.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import type { IColorTheme } from '../../../../platform/theme/common/themeService.js';

export const BrowserColorThemeSettingId = 'workbench.browser.colorTheme';
export type BrowserColorTheme = 'auto' | 'light' | 'dark';

export function resolveBrowserAppearance(setting: BrowserColorTheme | undefined, theme: IColorTheme): IBrowserViewAppearance {
	const colorScheme = setting === 'light' || setting === 'dark' ? setting : isDark(theme.type) ? 'dark' : 'light';
	return {
		colorScheme,
		backgroundColor: setting === 'light' ? '#ffffff' : setting === 'dark' ? '#1f1f1f'
			: theme.getColor('editor.background')?.toString() ?? (colorScheme === 'dark' ? '#1f1f1f' : '#ffffff')
	};
}
