/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

export interface IRecordableLogEntry {
	sourceId: string;
	time: number;
}

export interface IRecordableEditorLogEntry extends IRecordableLogEntry {
	modelUri: URI; // This has to be a URI, so that it gets translated automatically in remote scenarios
	modelVersion: number;
}

export type EditorLogEntryData = IDocumentEventDataSetChangeReason | IDocumentEventFetchStart;
export type LogEntryData = IEventFetchEnd;

export interface IDocumentEventDataSetChangeReason {
	sourceId: 'TextModel.setChangeReason';
	source: 'inlineSuggestion.accept' | 'snippet' | string;
}

interface IDocumentEventFetchStart {
	sourceId: 'InlineCompletions.fetch';
	kind: 'start';
	requestId: number;
}

export interface IEventFetchEnd {
	sourceId: 'InlineCompletions.fetch';
	kind: 'end';
	requestId: number;
	error: string | undefined;
	result: IFetchResult[];
}

interface IFetchResult {
	range: string;
	text: string;
	isInlineEdit: boolean;
	source: string;
}


/**
 * The sourceLabel must not contain '@'!
*/
export function formatRecordableLogEntry<T extends IRecordableLogEntry>(entry: T): string {
	// eslint-disable-next-line local/code-no-any-casts
	return entry.sourceId + ' @@ ' + JSON.stringify({ ...entry, modelUri: (entry as any).modelUri?.toString(), sourceId: undefined });
}
