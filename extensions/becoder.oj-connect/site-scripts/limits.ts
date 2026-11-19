/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Adapted from vscode-luogu v4.20.0 src/utils/stringUtils.ts.
// Copyright (c) 2018 yltx. MIT License; see ThirdPartyNotices.txt.
export function formatTime(time: number): string {
	if (time < 1e3) { return `${time}ms`; }
	if (time < 60 * 1e3) { return `${(time / 1e3).toFixed(2)}s`; }
	if (time < 60 * 60 * 1e3) { return `${(time / (60 * 1e3)).toFixed(2)}min`; }
	if (time < 24 * 60 * 60 * 1e3) { return `${(time / (60 * 60 * 1e3)).toFixed(2)}h`; }
	return `${(time / (24 * 60 * 60 * 1e3)).toFixed(2)}d`;
}
export function formatMemory(memory: number): string {
	if (memory < 2 ** 10) { return `${memory}B`; }
	if (memory < 2 ** 20) { return `${(memory / 2 ** 10).toFixed(2)}KiB`; }
	if (memory < 2 ** 30) { return `${(memory / 2 ** 20).toFixed(2)}MiB`; }
	return `${(memory / 2 ** 30).toFixed(2)}GiB`;
}
