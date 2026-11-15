/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { SiteDirectories, SiteId } from './settings';
import type { ProblemRef } from 'becoder-oj-connect';

export type ProblemResolution = { kind: 'problem'; problem: ProblemRef } | { kind: 'inputRequired'; site?: SiteId } | { kind: 'unsupported'; site: SiteId };

export function resolveProblem(filePath: string, directories: SiteDirectories, adapters: readonly { site: SiteId; resolve(input: string): ProblemRef | undefined }[]): ProblemResolution {
	const parent = path.basename(path.dirname(filePath)).toLowerCase();
	const site = (Object.keys(directories) as SiteId[]).find(key => directories[key].toLowerCase() === parent);
	const name = path.basename(filePath);
	if (site) {
		const adapter = adapters.find(item => item.site === site);
		if (!adapter) { return { kind: 'unsupported', site }; }
		const problem = adapter.resolve(name);
		return problem ? { kind: 'problem', problem } : { kind: 'inputRequired', site };
	}
	const matches = adapters.map(adapter => adapter.resolve(name)).filter((value): value is ProblemRef => !!value);
	return matches.length === 1 ? { kind: 'problem', problem: matches[0] } : { kind: 'inputRequired' };
}
