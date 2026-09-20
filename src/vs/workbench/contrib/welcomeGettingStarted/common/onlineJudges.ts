/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const onlineJudgeSitesSetting = 'becoder.welcome.onlineJudgeSites';
export const onlineJudgesSetting = 'becoder.welcome.onlineJudges';

export function getOnlineJudgeLinks(sites: unknown, selected: unknown): { name: string; url: string }[] {
	if (!sites || typeof sites !== 'object' || Array.isArray(sites) || !Array.isArray(selected)) {
		return [];
	}
	const links: { name: string; url: string }[] = [];
	const seen = new Set<string>();
	for (const name of selected) {
		if (typeof name !== 'string' || !name.trim() || seen.has(name) || !Object.hasOwn(sites, name)) {
			continue;
		}
		const value: unknown = (sites as Record<string, unknown>)[name];
		if (typeof value !== 'string') {
			continue;
		}
		try {
			const url = new URL(value);
			if (url.protocol !== 'https:' && url.protocol !== 'http:') {
				continue;
			}
			links.push({ name, url: url.href });
			seen.add(name);
		} catch {
			// Ignore invalid entries from manually edited settings.
		}
	}
	return links;
}
