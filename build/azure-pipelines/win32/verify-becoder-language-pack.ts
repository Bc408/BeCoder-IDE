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
