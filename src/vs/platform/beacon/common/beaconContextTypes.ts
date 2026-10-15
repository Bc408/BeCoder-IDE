/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plain transport DTOs: bundled consumers need no platform services or model SDK.
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
export type BeaconProducer = 'runner' | 'cph' | 'notebook';
export interface IBeaconRuntimeRecord { id: string; code: string; startedAt: number; events: unknown[]; revision: number; sequence: number }
export interface IBeaconConsumedRecord extends IBeaconRuntimeRecord { materialId: string }
export interface IBeaconRuntimeItem { id: string; producer: BeaconProducer; revision: number; startedAt: number; source?: string; sha256?: string; finished: boolean }
export interface IBeaconPage { id: string; kind: 'text' | 'browser' | 'notebook' | 'unsupported'; title: string; uri?: string; version: string; dirty?: boolean; reason?: string }
export interface IBeaconPageRead extends IBeaconPage { contents: string; nextOffset?: number; totalCharacters: number }
export const beaconContextChannel = 'becoderBeaconContext';
export const beaconContextCommand = '_becoder.beacon.context';
