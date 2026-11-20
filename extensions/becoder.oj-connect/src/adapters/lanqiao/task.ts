/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef } from 'becoder-oj-connect';

export function lanqiaoProblem(input: string): ProblemRef | undefined {
	if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(input)) { return undefined; }
	let id = /^([1-9]\d{0,7})(?:\.(?:c|cpp|cc|cxx))?$/i.exec(input)?.[1];
	if (!id) {
		// Check the original authority and path before URL normalizes ports or dot segments.
		if (!/^https:\/\/www\.lanqiao\.cn\/problems\/[1-9]\d{0,7}\/learning\/?(?:\?[^#]*)?$/.test(input)) { return undefined; }
		try {
			const url = new URL(input);
			const entries = [...url.searchParams];
			if (new Set(entries.map(([key]) => key)).size !== entries.length || entries.some(([key, value]) => !['page', 'first_category_id', 'second_category_id'].includes(key) || !/^[1-9]\d{0,7}$/.test(value))) { return undefined; }
			id = /^\/problems\/([1-9]\d{0,7})\/learning\/?$/.exec(url.pathname)?.[1];
		} catch { return undefined; }
	}
	return id ? { site: 'lanqiao', nativeId: id, url: 'https://www.lanqiao.cn/problems/' + id + '/learning/' } : undefined;
}
