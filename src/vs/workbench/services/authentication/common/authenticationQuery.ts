/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AuthenticationSessionAccount } from './authentication.js';

export interface IBaseQuery {
	readonly providerId: string;
}

export interface IAccountExtensionQuery extends IBaseQuery {
	readonly accountName: string;
	readonly extensionId: string;
	isAccessAllowed(): boolean | undefined;
	setAccessAllowed(allowed: boolean, extensionName?: string): void;
	getUsage(): {
		readonly extensionId: string;
		readonly extensionName: string;
		readonly scopes: readonly string[];
		readonly lastUsed: number;
	}[];
	isPreferred(): boolean;
	setAsPreferred(): void;
	isTrusted(): boolean;
}

export interface IAccountExtensionsQuery extends IBaseQuery {
	readonly accountName: string;
	getAllowedExtensions(): { id: string; name: string; allowed?: boolean; lastUsed?: number; trusted?: boolean }[];
	allowAccess(extensionIds: string[]): void;
	removeAccess(extensionIds: string[]): void;
	forEach(callback: (extensionQuery: IAccountExtensionQuery) => void): void;
}

export interface IAccountQuery extends IBaseQuery {
	readonly accountName: string;
	extension(extensionId: string): IAccountExtensionQuery;
	extensions(): IAccountExtensionsQuery;
}

export interface IProviderExtensionQuery extends IBaseQuery {
	readonly extensionId: string;
	getPreferredAccount(): string | undefined;
	setPreferredAccount(account: AuthenticationSessionAccount): void;
	removeAccountPreference(): void;
}

export interface IProviderQuery extends IBaseQuery {
	account(accountName: string): IAccountQuery;
	extension(extensionId: string): IProviderExtensionQuery;
}

export interface IExtensionQuery {
	readonly extensionId: string;
	getProvidersWithAccess(includeInternal?: boolean): Promise<string[]>;
	getAllAccountPreferences(includeInternal?: boolean): Map<string, string>;
	provider(providerId: string): IProviderExtensionQuery;
}

export const IAuthenticationQueryService = createDecorator<IAuthenticationQueryService>('IAuthenticationQueryService');
export interface IAuthenticationQueryService {
	readonly _serviceBrand: undefined;
	readonly onDidChangePreferences: Event<{
		readonly providerId: string;
		readonly extensionIds: string[];
	}>;
	readonly onDidChangeAccess: Event<{
		readonly providerId: string;
		readonly accountName: string;
	}>;
	provider(providerId: string): IProviderQuery;
	extension(extensionId: string): IExtensionQuery;
	getProviderIds(): string[];
}
