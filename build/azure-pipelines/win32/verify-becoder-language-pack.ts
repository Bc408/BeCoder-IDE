/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';

const translationPath = process.argv[2];
if (!translationPath) {
	throw new Error('A language-pack main.i18n.json path is required.');
}

const translation = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
const contents = translation.contents;
if (!contents || typeof contents !== 'object' || Array.isArray(contents)) {
	throw new Error('The Simplified Chinese language pack does not contain a valid contents object.');
}

const forbiddenModulePatterns = [
	/^vs\/sessions\//,
	/^vs\/platform\/(?:agentHost|agentPlugins|defaultAccount|localTranscription|mcp|networkFilter|otel|sandbox|webContentExtractor)\//,
	/^vs\/workbench\/contrib\/(?:agentsVoice|chat|debug|editTelemetry|inlineChat|mcp|remoteCodingAgents|replNotebook|welcomeAgentSessions|welcomeOnboarding)\//,
	/^vs\/workbench\/services\/(?:agentHost|aiEmbeddingVector|aiRelatedInformation|aiSettingsSearch|chat|mcp)\//,
	/(?:^|\/)(?:mainThread|extHost)(?:Agent|Ai|Chat|CodeMapper|Debug|Embedding|LanguageModel|Mcp)/i,
	/^vs\/platform\/git\//,
	/^vs\/workbench\/contrib\/(?:git|scm)\//,
	/^vs\/workbench\/contrib\/terminalContrib\/(?:inlineHint|suggest)\//,
	/(?:^|\/)(?:mainThread|extHost)(?:GitExtensionService|QuickDiff|SCM)$/,
];

for (const moduleName of Object.keys(contents)) {
	if (forbiddenModulePatterns.some(pattern => pattern.test(moduleName))) {
		throw new Error(`The Simplified Chinese language pack contains an unsupported product module: ${moduleName}`);
	}
}

const imageCarouselTranslations = contents['vs/workbench/contrib/imageCarousel/browser/imageCarousel.contribution'];
if (!imageCarouselTranslations
	|| imageCarouselTranslations.openImagesInCarousel !== '\u5728\u56fe\u50cf\u9884\u89c8\u4e2d\u6253\u5f00'
	|| Object.hasOwn(imageCarouselTranslations, 'imageCarousel.chat.enabled')
	|| Object.hasOwn(imageCarouselTranslations, 'openImageInCarousel')) {
	throw new Error('The Simplified Chinese language pack does not preserve the ordinary Images Preview boundary.');
}

const authenticationTranslations = contents['vs/workbench/api/browser/mainThreadAuthentication'];
if (!authenticationTranslations || typeof authenticationTranslations !== 'object') {
	throw new Error('The Simplified Chinese language pack is missing generic Authentication translations.');
}

const removedMixedTranslations = new Map([
	['vs/workbench/contrib/accessibility/browser/accessibilityConfiguration', ['verbosity.scm']],
	['vs/workbench/api/browser/viewsExtensionPoint', ['views.scm']],
	['vs/workbench/contrib/files/browser/files.contribution', ['everything', 'formatOnSaveMode', 'modification', 'modificationIfAvailable']],
	['vs/workbench/contrib/search/browser/patternInputWidget', ['onlySearchInChangedFiles']],
	['vs/workbench/contrib/timeline/browser/timelinePane', ['timeline.noSCM']],
	['vs/workbench/contrib/terminal/common/terminalContextKey', ['terminalSuggestWidgetVisible']],
	['vs/workbench/contrib/terminal/common/terminalColorRegistry', ['terminalInitialHintForeground']],
	['vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibilityHelp', ['suggest', 'suggestCommands', 'suggestCommandsMore', 'suggestConfigure', 'suggestLearnMore', 'suggestTrigger']],
	['vs/workbench/contrib/externalTerminal/electron-browser/externalTerminal.contribution', ['sourceControlRepositories.openInTerminalKind']],
	['vs/workbench/contrib/preferences/browser/settingsEditor2', ['moreThanOneResultWithAiAvailable', 'noAiResults', 'noResultsWithAiAvailable', 'oneResultWithAiAvailable', 'showAiResultsDisabled', 'showAiResultsEnabled']],
	['vs/workbench/contrib/preferences/browser/settingsLayout', ['scm']],
	['vs/workbench/contrib/welcomeOverlay/browser/welcomeOverlay', ['welcomeOverlay.git']],
	['vs/workbench/services/actions/common/menusExtensionPoint', [
		'menus.artifactContext',
		'menus.artifactGroupContext',
		'menus.changeTitle',
		'menus.debugCallstackContext',
		'menus.debugCreateConfiguation',
		'menus.debugToolBar',
		'menus.debugVariablesContext',
		'menus.debugWatchContext',
		'menus.historyItemContext',
		'menus.historyItemRefContext',
		'menus.input',
		'menus.resourceFolderContext',
		'menus.resourceGroupContext',
		'menus.resourceStateContext',
		'menus.scmHistoryTitle',
		'menus.scmSourceControl',
		'menus.scmSourceControlInline',
		'menus.scmSourceControlTitle',
		'menus.scmTitle',
		'searchPanel.aiResultsCommands',
	]],
]);
for (const [moduleName, keys] of removedMixedTranslations) {
	const moduleTranslations = contents[moduleName];
	for (const key of keys) {
		if (moduleTranslations && Object.hasOwn(moduleTranslations, key)) {
			throw new Error(`The Simplified Chinese language pack contains a removed product translation: ${moduleName}.${key}`);
		}
	}
}

const listTranslations = contents['vs/platform/list/browser/listService'];
if (!listTranslations || typeof listTranslations.multiSelectModifier !== 'string' || /\bscm\b|\u6e90\u4ee3\u7801\u7ba1\u7406/i.test(listTranslations.multiSelectModifier)) {
	throw new Error('The Simplified Chinese language pack still describes the removed SCM view in generic list settings.');
}

const searchTranslations = contents['vs/workbench/contrib/search/browser/search.contribution'];
if (!searchTranslations
	|| typeof searchTranslations['search.defaultViewMode.list'] !== 'string'
	|| typeof searchTranslations['search.defaultViewMode.tree'] !== 'string'
	|| Object.hasOwn(searchTranslations, 'scm.defaultViewMode.list')
	|| Object.hasOwn(searchTranslations, 'scm.defaultViewMode.tree')) {
	throw new Error('The Simplified Chinese language pack does not preserve SCM-free Search view-mode translations.');
}
for (const removedAuthenticationKey of ['xaaResourceSecretPlaceholder', 'xaaResourceSecretPrompt', 'xaaResourceSecretTitle']) {
	if (Object.hasOwn(authenticationTranslations, removedAuthenticationKey)) {
		throw new Error(`The Simplified Chinese language pack contains an MCP-specific authentication translation: ${removedAuthenticationKey}`);
	}
}

const issueReporterTranslation = contents['vs/workbench/contrib/issue/browser/baseIssueReporterService']?.internalPreviewMessage;
if (typeof issueReporterTranslation !== 'string' || /copilot|mcp/i.test(issueReporterTranslation)) {
	throw new Error('The Simplified Chinese issue reporter contains an invalid diagnostic-log message.');
}

console.log('Simplified Chinese language-pack boundary verification passed.');
