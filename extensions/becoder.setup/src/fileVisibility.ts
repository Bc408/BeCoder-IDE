/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type FileExcludes = Record<string, unknown>;

export interface StoredFileExcludeValue {
	readonly present: boolean;
	readonly value?: unknown;
}

export interface FileVisibilityState {
	readonly version: 1;
	readonly previous: Record<string, StoredFileExcludeValue>;
}

export const beCoderHiddenFiles: Readonly<Record<string, true>> = {
	'**/.*': true,
	'**/*.exe': true,
	'**/*.bin': true,
	'**/*.bin.dSYM': true,
	'**/*.dSYM': true
};

const legacyBeCoderHiddenFiles = [
	'**/*.exe',
	'**/*.bin',
	'**/*.bin.dSYM',
	'**/*.dSYM'
] as const;

export function hideBeCoderFiles(excludes: FileExcludes, state: FileVisibilityState | undefined): { readonly excludes: FileExcludes; readonly state: FileVisibilityState } {
	const updatedExcludes = { ...excludes };
	const previous = state?.version === 1 ? { ...state.previous } : {};
	for (const pattern of Object.keys(beCoderHiddenFiles)) {
		if (updatedExcludes[pattern] !== true) {
			previous[pattern] = Object.hasOwn(updatedExcludes, pattern)
				? { present: true, value: updatedExcludes[pattern] }
				: { present: false };
		}
		updatedExcludes[pattern] = true;
	}
	return { excludes: updatedExcludes, state: { version: 1, previous } };
}

export function showBeCoderFiles(excludes: FileExcludes, state: FileVisibilityState | undefined): FileExcludes {
	const updatedExcludes = { ...excludes };
	if (state?.version !== 1) {
		if (Object.keys(beCoderHiddenFiles).every(pattern => updatedExcludes[pattern] === true)) {
			for (const pattern of Object.keys(beCoderHiddenFiles)) {
				delete updatedExcludes[pattern];
			}
		}
		return updatedExcludes;
	}
	for (const [pattern, previous] of Object.entries(state.previous)) {
		if (updatedExcludes[pattern] !== true) {
			continue;
		}
		if (previous.present) {
			updatedExcludes[pattern] = previous.value;
		} else {
			delete updatedExcludes[pattern];
		}
	}
	return updatedExcludes;
}

export function isBeCoderHideActive(excludes: FileExcludes, effectiveExcludes: FileExcludes = excludes): boolean {
	return Object.keys(beCoderHiddenFiles).every(pattern => excludes[pattern] === true && effectiveExcludes[pattern] === true);
}

export function isBeCoderHideActiveInAllScopes(excludes: FileExcludes, effectiveExcludes: readonly FileExcludes[]): boolean {
	return effectiveExcludes.length > 0 && effectiveExcludes.every(effective => isBeCoderHideActive(excludes, effective));
}

export function migrateLegacyBeCoderExcludes(excludes: FileExcludes, legacyDefaultsWereApplied: boolean): FileExcludes {
	const updatedExcludes = { ...excludes };
	if (!legacyDefaultsWereApplied || !legacyBeCoderHiddenFiles.every(pattern => updatedExcludes[pattern] === true)) {
		return updatedExcludes;
	}
	for (const pattern of legacyBeCoderHiddenFiles) {
		if (updatedExcludes[pattern] === true) {
			delete updatedExcludes[pattern];
		}
	}
	return updatedExcludes;
}
