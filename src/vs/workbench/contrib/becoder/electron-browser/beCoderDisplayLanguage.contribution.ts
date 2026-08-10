/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILanguagePackItem, ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';

export const BeCoderDisplayLanguageSetting = 'becoder.displayLanguage';
export const BeCoderSimplifiedChineseLanguagePackId = 'ms-ceintl.vscode-language-pack-zh-hans';
const BeCoderSetupExtensionId = 'becoder.becoder-setup';

export type BeCoderDisplayLanguage = 'en' | 'zh-cn';

export function isBeCoderDisplayLanguage(language: unknown): language is BeCoderDisplayLanguage {
	return language === 'en' || language === 'zh-cn';
}

export function toBeCoderDisplayLanguage(language: string): BeCoderDisplayLanguage {
	return language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

export function findBeCoderLanguagePack(languages: readonly ILanguagePackItem[], language: BeCoderDisplayLanguage): ILanguagePackItem | undefined {
	return languages.find(candidate => candidate.id?.toLowerCase() === language
		&& (language === 'en' || candidate.extensionId?.toLowerCase() === BeCoderSimplifiedChineseLanguagePackId));
}

export class BeCoderDisplayLanguageController {

	private pendingLanguage: BeCoderDisplayLanguage | undefined;
	private processingPromise: Promise<void> | undefined;

	constructor(
		private selectedLanguage: BeCoderDisplayLanguage,
		private readonly applyLanguage: (language: BeCoderDisplayLanguage) => Promise<boolean>,
		private readonly updateSetting: (language: BeCoderDisplayLanguage) => Promise<void>,
	) { }

	get selected(): BeCoderDisplayLanguage {
		return this.selectedLanguage;
	}

	isLatestRequest(language: BeCoderDisplayLanguage): boolean {
		return this.pendingLanguage === undefined || this.pendingLanguage === language;
	}

	request(language: BeCoderDisplayLanguage): Promise<void> {
		this.pendingLanguage = language;
		this.processingPromise ??= this.process();
		return this.processingPromise;
	}

	whenIdle(): Promise<void> {
		return this.processingPromise ?? Promise.resolve();
	}

	private async process(): Promise<void> {
		try {
			while (this.pendingLanguage) {
				const language = this.pendingLanguage;
				this.pendingLanguage = undefined;
				if (language === this.selectedLanguage) {
					continue;
				}

				if (await this.applyLanguage(language)) {
					this.selectedLanguage = language;
				} else if (!this.pendingLanguage) {
					await this.updateSetting(this.selectedLanguage);
				}
			}
		} finally {
			this.processingPromise = undefined;
			if (this.pendingLanguage) {
				this.processingPromise = this.process();
			}
		}
	}
}

class BeCoderDisplayLanguageContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.beCoderDisplayLanguage';

	private updatingSetting = false;
	private initialized = false;
	private readonly controller: BeCoderDisplayLanguageController;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
		@ILocaleService private readonly localeService: ILocaleService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.controller = new BeCoderDisplayLanguageController(
			toBeCoderDisplayLanguage(Language.value()),
			language => this.applyLanguage(language),
			language => this.updateSetting(language),
		);
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (this.initialized && !this.updatingSetting && event.affectsConfiguration(BeCoderDisplayLanguageSetting)) {
				void this.requestConfiguredLanguage().catch(onUnexpectedError);
			}
		}));
		void this.initialize().catch(onUnexpectedError);
	}

	private async initialize(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const setupExtensionInstalled = this.extensionService.extensions.some(extension => extension.identifier.value.toLowerCase() === BeCoderSetupExtensionId);
		if (!setupExtensionInstalled || !this.configurationService.inspect(BeCoderDisplayLanguageSetting)) {
			const message = localize(
				'becoderDisplayLanguageRegistrationMissing',
				"BeCoder's protected Setup extension is missing or damaged. Display language settings are unavailable. Reinstall BeCoder with the official Setup package."
			);
			this.logService.error(`[BeCoder] ${message}`);
			this.notificationService.error(message);
			return;
		}
		await this.updateSetting(toBeCoderDisplayLanguage(Language.value()));
		this.initialized = true;
	}

	private async requestConfiguredLanguage(): Promise<void> {
		const language = this.configurationService.getValue<unknown>(BeCoderDisplayLanguageSetting);
		if (!isBeCoderDisplayLanguage(language)) {
			await this.updateSetting(this.controller.selected);
			return;
		}
		await this.controller.request(language);
	}

	private async applyLanguage(language: BeCoderDisplayLanguage): Promise<boolean> {
		try {
			const installedLanguages = await this.languagePackService.getInstalledLanguages();
			const languagePack = findBeCoderLanguagePack(installedLanguages, language);
			return !!languagePack && await this.localeService.setLocale(languagePack, false, () => this.controller.isLatestRequest(language));
		} catch (error) {
			onUnexpectedError(error);
			return false;
		}
	}

	private async updateSetting(language: BeCoderDisplayLanguage): Promise<void> {
		const configuredLanguage = this.configurationService.inspect<BeCoderDisplayLanguage>(BeCoderDisplayLanguageSetting)?.userLocalValue;
		if (configuredLanguage === language) {
			return;
		}
		this.updatingSetting = true;
		try {
			await this.configurationService.updateValue(BeCoderDisplayLanguageSetting, language, ConfigurationTarget.USER_LOCAL);
		} finally {
			this.updatingSetting = false;
		}
	}
}

registerWorkbenchContribution2(BeCoderDisplayLanguageContribution.ID, BeCoderDisplayLanguageContribution, WorkbenchPhase.AfterRestored);
