/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plain transport DTOs: bundled consumers need no platform services or model SDK.
// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs, type-only and without runtime imports.
export type { IBeaconCollectionScope, IBeaconAcquisition, IBeaconOjCapture } from 'becoder-beacon';
// eslint-disable-next-line local/code-import-patterns -- Internal type-only transport.
export type { BeaconRecordKind, IBeaconRecordByKind, IBeaconRecordWrite, IBeaconProblemRecord, IBeaconRunRecord, IBeaconVerdictRecord, IBeaconCurrentCodeFile } from 'becoder-beacon';
export type BeaconMode = 'blackout' | 'spot' | 'flood';
export type BeaconWorkspaceState = 'none' | 'ready' | 'blackout' | 'unavailable';
export interface IBeaconWindowSelection { slot: string; root?: string; mode: BeaconMode; identity?: string }
export interface IBeaconContext {
	slot: string;
	root?: string;
	usable: boolean;
	workspaceState: BeaconWorkspaceState;
	mode: BeaconMode;
	epoch: number;
	busy: boolean;
	runtimeBusy: boolean;
	collectionPending: boolean;
	activeId?: string;
	recent: string[];
}
export interface IBeaconConversation {
	id: string;
	title: string;
	updatedAt: number;
	messages: unknown[];
	error: string;
	workspace: { name: string; path: string }[];
	draft?: { text: string; attachments: unknown[] };
	draftOnly?: boolean;
	[key: string]: unknown;
}
export interface IBeaconResume { screen: 'home' | 'conversation'; id?: string; homeId?: string }
export interface IBeaconStoredConversation { revision: number; data: IBeaconConversation }
export interface IBeaconHistoryItem { id: string; title: string; updatedAt: number; revision: number; workspace: { name: string; path: string }[] }
export interface IBeaconPage { id: string; kind: 'text' | 'browser' | 'notebook' | 'unsupported'; title: string; uri?: string; version: string; languageId?: string; dirty?: boolean; reason?: string; active?: boolean; visible?: boolean }
export interface IBeaconPageRead extends IBeaconPage { contents: string; nextOffset?: number; totalCharacters: number }
export const beaconContextChannel = 'becoderBeaconContext';
export const beaconContextCommand = '_becoder.beacon.context';
