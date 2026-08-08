/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AuthenticationSessionAccount, IAuthenticationExtensionsService, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../common/authentication.js';
import {
	IAccountExtensionQuery,
	IAccountExtensionsQuery,
	IAccountQuery,
	IAuthenticationQueryService,
	IBaseQuery,
	IExtensionQuery,
	IProviderExtensionQuery,
	IProviderQuery
} from '../common/authenticationQuery.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { IAuthenticationUsageService } from './authenticationUsageService.js';

abstract class BaseQuery implements IBaseQuery {
	constructor(
		public readonly providerId: string,
		protected readonly queryService: AuthenticationQueryService
	) { }
}

class AccountExtensionQuery extends BaseQuery implements IAccountExtensionQuery {
	readonly extensionId: string;

	constructor(
		providerId: string,
		public readonly accountName: string,
		extensionId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
		this.extensionId = ExtensionIdentifier.toKey(extensionId);
	}

	isAccessAllowed(): boolean | undefined {
		return this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, this.extensionId);
	}

	setAccessAllowed(allowed: boolean, extensionName: string = this.extensionId): void {
		this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, [{
			id: this.extensionId,
			name: extensionName,
			allowed
		}]);
	}

	getUsage() {
		return this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName)
			.filter(usage => ExtensionIdentifier.equals(usage.extensionId, this.extensionId))
			.map(usage => ({
				extensionId: usage.extensionId,
				extensionName: usage.extensionName,
				scopes: usage.scopes ?? [],
				lastUsed: usage.lastUsed
			}));
	}

	isPreferred(): boolean {
		return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId) === this.accountName;
	}

	setAsPreferred(): void {
		this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, {
			id: this.accountName,
			label: this.accountName
		});
	}

	isTrusted(): boolean {
		return this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName)
			.some(extension => ExtensionIdentifier.equals(extension.id, this.extensionId) && extension.trusted === true);
	}
}

class AccountExtensionsQuery extends BaseQuery implements IAccountExtensionsQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	getAllowedExtensions() {
		const extensions = new Map(this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName)
			.map(extension => [ExtensionIdentifier.toKey(extension.id), { ...extension }]));

		for (const usage of this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName)) {
			const extensionId = ExtensionIdentifier.toKey(usage.extensionId);
			const existing = extensions.get(extensionId);
			if (existing) {
				existing.lastUsed = usage.lastUsed;
				if (existing.name === existing.id) {
					existing.name = usage.extensionName;
				}
			} else {
				extensions.set(extensionId, {
					id: extensionId,
					name: usage.extensionName,
					allowed: this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, extensionId),
					lastUsed: usage.lastUsed
				});
			}
		}

		return [...extensions.values()];
	}

	allowAccess(extensionIds: string[]): void {
		for (const extensionId of extensionIds) {
			this.queryService.provider(this.providerId).account(this.accountName).extension(extensionId).setAccessAllowed(true);
		}
	}

	removeAccess(extensionIds: string[]): void {
		for (const extensionId of extensionIds) {
			this.queryService.provider(this.providerId).account(this.accountName).extension(extensionId).setAccessAllowed(false);
		}
	}

	forEach(callback: (extensionQuery: IAccountExtensionQuery) => void): void {
		for (const extension of this.getAllowedExtensions()) {
			callback(this.queryService.provider(this.providerId).account(this.accountName).extension(extension.id));
		}
	}
}

class AccountQuery extends BaseQuery implements IAccountQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	extension(extensionId: string): IAccountExtensionQuery {
		return new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
	}

	extensions(): IAccountExtensionsQuery {
		return new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
	}
}

class ProviderExtensionQuery extends BaseQuery implements IProviderExtensionQuery {
	readonly extensionId: string;

	constructor(providerId: string, extensionId: string, queryService: AuthenticationQueryService) {
		super(providerId, queryService);
		this.extensionId = ExtensionIdentifier.toKey(extensionId);
	}

	getPreferredAccount(): string | undefined {
		return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
	}

	setPreferredAccount(account: AuthenticationSessionAccount): void {
		this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, account);
	}

	removeAccountPreference(): void {
		this.queryService.authenticationExtensionsService.removeAccountPreference(this.extensionId, this.providerId);
	}
}

class ProviderQuery extends BaseQuery implements IProviderQuery {
	account(accountName: string): IAccountQuery {
		return new AccountQuery(this.providerId, accountName, this.queryService);
	}

	extension(extensionId: string): IProviderExtensionQuery {
		return new ProviderExtensionQuery(this.providerId, extensionId, this.queryService);
	}
}

class ExtensionQuery implements IExtensionQuery {
	readonly extensionId: string;

	constructor(extensionId: string, private readonly queryService: AuthenticationQueryService) {
		this.extensionId = ExtensionIdentifier.toKey(extensionId);
	}

	async getProvidersWithAccess(includeInternal: boolean = false): Promise<string[]> {
		const providers: string[] = [];
		for (const providerId of this.queryService.getProviderIds()) {
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}
			const preferredAccount = this.provider(providerId).getPreferredAccount();
			const accounts = await this.queryService.authenticationService.getAccounts(providerId);
			if (preferredAccount || accounts.some(account => this.queryService.authenticationAccessService.isAccessAllowed(providerId, account.label, this.extensionId) === true)) {
				providers.push(providerId);
			}
		}
		return providers;
	}

	getAllAccountPreferences(includeInternal: boolean = false): Map<string, string> {
		const preferences = new Map<string, string>();
		for (const providerId of this.queryService.getProviderIds()) {
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}
			const account = this.provider(providerId).getPreferredAccount();
			if (account) {
				preferences.set(providerId, account);
			}
		}
		return preferences;
	}

	provider(providerId: string): IProviderExtensionQuery {
		return new ProviderExtensionQuery(providerId, this.extensionId, this.queryService);
	}
}

export class AuthenticationQueryService extends Disposable implements IAuthenticationQueryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangePreferences = this._register(new Emitter<{ providerId: string; extensionIds: string[] }>());
	readonly onDidChangePreferences = this._onDidChangePreferences.event;

	private readonly _onDidChangeAccess = this._register(new Emitter<{ providerId: string; accountName: string }>());
	readonly onDidChangeAccess = this._onDidChangeAccess.event;

	constructor(
		@IAuthenticationService public readonly authenticationService: IAuthenticationService,
		@IAuthenticationUsageService public readonly authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationAccessService public readonly authenticationAccessService: IAuthenticationAccessService,
		@IAuthenticationExtensionsService public readonly authenticationExtensionsService: IAuthenticationExtensionsService
	) {
		super();
		this._register(authenticationExtensionsService.onDidChangeAccountPreference(event => this._onDidChangePreferences.fire(event)));
		this._register(authenticationAccessService.onDidChangeExtensionSessionAccess(event => this._onDidChangeAccess.fire(event)));
	}

	provider(providerId: string): IProviderQuery {
		return new ProviderQuery(providerId, this);
	}

	extension(extensionId: string): IExtensionQuery {
		return new ExtensionQuery(extensionId, this);
	}

	getProviderIds(): string[] {
		return this.authenticationService.getProviderIds();
	}
}

registerSingleton(IAuthenticationQueryService, AuthenticationQueryService, InstantiationType.Delayed);
