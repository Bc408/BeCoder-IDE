/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { BeaconMode, IBeaconContext, IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconWindowSelection, IBeaconResume, BeaconProducer, IBeaconRuntimeItem, IBeaconConsumedRecord } from './beaconContextTypes.js';
export type { BeaconMode, IBeaconContext, IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconWindowSelection, IBeaconResume } from './beaconContextTypes.js';
export { beaconContextChannel, beaconContextCommand } from './beaconContextTypes.js';
export const IBeaconContextService = createDecorator<IBeaconContextService>('beaconContextService');
export interface IBeaconContextService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<number>;
	getContext(windowId: number): Promise<IBeaconContext>;
	getResume(windowId: number): Promise<IBeaconResume | undefined>;
	setView(windowId: number, view: IBeaconResume): Promise<void>;
	selectWorkspace(windowId: number, root: string): Promise<IBeaconContext>;
	clearWorkspace(windowId: number): Promise<IBeaconContext>;
	removeRecentWorkspace(windowId: number, root: string): Promise<IBeaconContext>;
	setMode(windowId: number, mode: BeaconMode): Promise<IBeaconContext>;
	setBusy(windowId: number, busy: boolean): Promise<void>;
	beginRuntimeActivity(windowId: number): Promise<string>;
	endRuntimeActivity(windowId: number, handle: string): Promise<void>;
	beginActivity(windowId: number, source: string): Promise<string | undefined>;
	endActivity(windowId: number, handle: string): Promise<void>;
	reportNotebooks(windowId: number, files: { file: string; dirty: boolean }[]): Promise<void>;
	notebookReadonly(windowId: number, files: string[]): Promise<boolean[]>;
	beginNotebookRun(windowId: number, file: string): Promise<string>;
	beginNotebookEdit(windowId: number, file: string, scope: IBeaconContext): Promise<string>;
	beginNotebookCreate(windowId: number, file: string, scope: IBeaconContext): Promise<string>;
	verifyNotebookEdit(windowId: number, handle: string): Promise<void>;
	endNotebookResource(windowId: number, handle: string): Promise<void>;
	startRuntime(windowId: number, handle: string, producer: BeaconProducer, source: string, code: string, events: unknown[]): Promise<void>;
	appendRuntime(windowId: number, handle: string, sequence: number, events: unknown[]): Promise<boolean>;
	listRuntime(windowId: number, producer: BeaconProducer, scope: IBeaconContext): Promise<IBeaconRuntimeItem[]>;
	consumeRuntime(windowId: number, producer: BeaconProducer, id: string, revision: number, scope: IBeaconContext): Promise<IBeaconConsumedRecord>;
	readConsumed(windowId: number, materialId: string, scope: IBeaconContext): Promise<IBeaconConsumedRecord | undefined>;
	checkPageAccess(windowId: number, file: string): Promise<void>;
	resetWindow(windowId: number): Promise<void>;
	listHistory(windowId: number): Promise<IBeaconHistoryItem[]>;
	openConversation(windowId: number, id: string, create?: boolean): Promise<IBeaconStoredConversation>;
	saveConversation(windowId: number, data: IBeaconConversation, revision: number): Promise<IBeaconStoredConversation>;
	renameConversation(windowId: number, id: string, title: string): Promise<void>;
	deleteConversation(windowId: number, id: string): Promise<void>;
	releaseConversation(windowId: number): Promise<void>;
}

export function restoreBeaconWindowSelection(value: unknown): IBeaconWindowSelection | undefined {
	if (!value || typeof value !== 'object') { return undefined; }
	const selection = value as IBeaconWindowSelection;
	if (typeof selection.slot !== 'string' || !/^[\w-]{1,128}$/.test(selection.slot) || !['blackout', 'spot', 'flood'].includes(selection.mode)
		|| (selection.root !== undefined && (typeof selection.root !== 'string' || !selection.root || selection.root.includes('\0')))
		|| (selection.identity !== undefined && typeof selection.identity !== 'string')) { return undefined; }
	if (selection.root === undefined && selection.mode !== 'blackout') { return undefined; }
	return { slot: selection.slot, mode: selection.mode, ...(selection.root === undefined ? {} : { root: selection.root }), ...(selection.identity === undefined ? {} : { identity: selection.identity }) };
}
