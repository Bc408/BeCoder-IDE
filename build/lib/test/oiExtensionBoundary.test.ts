/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';

interface IExtensionManifest {
	readonly name?: string;
	readonly publisher?: string;
	readonly categories?: readonly string[];
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly contributes?: {
		readonly grammars?: readonly {
			readonly path?: string;
			readonly scopeName?: string;
		}[];
		readonly themes?: readonly {
			readonly id?: string;
			readonly path?: string;
		}[];
		readonly configurationDefaults?: Record<string, Record<string, unknown>>;
		readonly configuration?: {
			readonly properties?: Record<string, unknown>;
		};
		readonly colors?: readonly { readonly id?: string }[];
		readonly commands?: readonly { readonly command?: string }[];
		readonly keybindings?: readonly unknown[];
		readonly menus?: Record<string, unknown>;
		readonly views?: Record<string, unknown>;
	};
}

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const extensionsRoot = path.join(repositoryRoot, 'extensions');

function readJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertSameLocalizationKeys(extensionFolder: string): void {
	const english = readJson<Record<string, string>>(path.join(extensionsRoot, extensionFolder, 'package.nls.json'));
	const chinese = readJson<Record<string, string>>(path.join(extensionsRoot, extensionFolder, 'package.nls.zh-cn.json'));
	assert.deepStrictEqual(Object.keys(chinese).sort(), Object.keys(english).sort(), `${extensionFolder} localization keys differ`);
}

function computeDirectoryFilesSha256(directoryPath: string, transform?: (relativePath: string, contents: Buffer) => Buffer): string {
	const files: string[] = [];
	const collectFiles = (directory: string): void => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				collectFiles(entryPath);
			} else if (entry.isFile()) {
				files.push(path.relative(directoryPath, entryPath).split(path.sep).join('/'));
			}
		}
	};
	collectFiles(directoryPath);
	files.sort();

	const manifest = files.map(relativePath => {
		const contents = fs.readFileSync(path.join(directoryPath, relativePath));
		const fileHash = createHash('sha256').update(transform?.(relativePath, contents) ?? contents).digest('hex');
		return `${relativePath}\t${fileHash}\n`;
	}).join('');
	return createHash('sha256').update(manifest, 'utf8').digest('hex');
}

suite('OI extension boundary', () => {
	test('packages the BeCoder Welcome tab icon through the Getting Started resource route', () => {
		const iconPath = path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeGettingStarted', 'common', 'media', 'becoder-icon.png');
		assert.ok(fs.existsSync(iconPath), 'BeCoder Welcome tab icon is missing');

		const inputSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeGettingStarted', 'browser', 'gettingStartedInput.ts'), 'utf8');
		assert.match(inputSource, /FileAccess\.asBrowserUri\('vs\/workbench\/contrib\/welcomeGettingStarted\/common\/media\/becoder-icon\.png'\)/);

		const gulpfile = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.ts'), 'utf8');
		assert.match(gulpfile, /out-build\/vs\/workbench\/contrib\/welcomeGettingStarted\/common\/media\/becoder-icon\.png/);
		assert.doesNotMatch(gulpfile, /welcomeGettingStarted\/common\/media\/\*\*/);
	});

	test('keeps Welcome while removing walkthrough runtime and extension injection', () => {
		const welcomeRoot = path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeGettingStarted', 'browser');
		const page = fs.readFileSync(path.join(welcomeRoot, 'gettingStarted.ts'), 'utf8');
		const contribution = fs.readFileSync(path.join(welcomeRoot, 'gettingStarted.contribution.ts'), 'utf8');
		const input = fs.readFileSync(path.join(welcomeRoot, 'gettingStartedInput.ts'), 'utf8');
		const startup = fs.readFileSync(path.join(welcomeRoot, 'startupPage.ts'), 'utf8');
		const help = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'browser', 'actions', 'helpActions.ts'), 'utf8');
		const notebookLayout = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'controller', 'layoutActions.ts'), 'utf8');
		const notebookStartup = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'contrib', 'gettingStarted', 'notebookGettingStarted.ts'), 'utf8');

		assert.match(contribution, /workbench\.action\.openWelcomePage/);
		assert.doesNotMatch(`${page}\n${contribution}\n${input}\n${startup}`, /IWalkthroughsService|openWalkthrough|walkthroughsExtensionPoint|selectedCategory|selectedStep|restorableWalkthroughs|showAllWalkthroughs|walkthroughs\.openOnInstall|experimentalOnboarding/);
		assert.doesNotMatch(`${help}\n${notebookLayout}\n${notebookStartup}`, /IWalkthroughsService|workbench\.action\.openWalkthrough/);
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'remote')));
		assert.ok(!fs.existsSync(path.join(welcomeRoot, 'gettingStartedAccessibleView.ts')));
		assert.match(page, /buildStartList\(\)/);
		assert.match(page, /buildRecentlyOpenedList\(\)/);
		assert.match(page, /Show welcome page on startup/);
	});

	test('keeps the native user snippets configuration flow', () => {
		const workbenchMain = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		const configureSnippets = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'snippets', 'browser', 'commands', 'configureSnippets.ts'), 'utf8');

		assert.match(workbenchMain, /contrib\/snippets\/browser\/snippets\.contribution\.js/);
		assert.match(configureSnippets, /id: 'workbench\.action\.openSnippets'/);
		assert.match(configureSnippets, /snippetService\.getSnippetFiles\(\)/);
		assert.match(configureSnippets, /currentProfile\.snippetsHome/);
		assert.match(configureSnippets, /workspaceService\.getWorkspace\(\)\.folders/);
		assert.doesNotMatch(configureSnippets, /becoder\.configureCppSnippets/);
	});

	test('does not build or package AI, local transcription, sessions, or debug workbench entrypoints', () => {
		for (const removedSourcePath of [
			'src/vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalDebuggerContribution.ts',
			'src/vs/workbench/contrib/editSessions',
			'src/vs/workbench/contrib/extensions/electron-browser/debugExtensionHostAction.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/debug',
			'src/vs/workbench/api/browser/mainThreadAiEmbeddingVector.ts',
			'src/vs/workbench/api/browser/mainThreadAiRelatedInformation.ts',
			'src/vs/workbench/api/browser/mainThreadAiSettingsSearch.ts',
			'src/vs/workbench/api/browser/mainThreadDebugService.ts',
			'src/vs/workbench/api/browser/mainThreadEmbeddings.ts',
			'src/vs/workbench/api/common/extHostAiRelatedInformation.ts',
			'src/vs/workbench/api/common/extHostAiSettingsSearch.ts',
			'src/vs/workbench/api/common/extHostDebugService.ts',
			'src/vs/workbench/api/common/extHostEmbedding.ts',
			'src/vs/workbench/api/common/extHostEmbeddingVector.ts',
			'src/vs/workbench/api/node/extHostDebugService.ts'
		]) {
			assert.ok(!fs.existsSync(path.join(repositoryRoot, removedSourcePath)), `Removed source remains: ${removedSourcePath}`);
		}

		const product = readJson<Record<string, unknown>>(path.join(repositoryRoot, 'product.json'));
		for (const property of ['agentsTelemetryAppName', 'agentSdks', 'defaultChatAgent', 'sessionsWindowAllowedExtensions', 'voiceWsUrl']) {
			assert.ok(!(property in product), `Unsupported product property remains: ${property}`);
		}
		const packageManifest = readJson<{
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		}>(path.join(repositoryRoot, 'package.json'));
		for (const dependency of ['@huggingface/transformers', 'onnxruntime-node']) {
			assert.ok(!(dependency in (packageManifest.dependencies ?? {})), `AI runtime remains a product dependency: ${dependency}`);
		}
		assert.ok('@playwright/test' in (packageManifest.devDependencies ?? {}), 'Playwright should remain available only as development test infrastructure');

		const buildfile = fs.readFileSync(path.join(repositoryRoot, 'build', 'buildfile.ts'), 'utf8');
		for (const entrypoint of [
			'vs/sessions/',
			'vs/platform/agentHost/',
			'vs/platform/localTranscription/',
			'vs/workbench/contrib/debug/node/telemetryApp'
		]) {
			assert.ok(!buildfile.includes(entrypoint), `Unsupported build entrypoint remains: ${entrypoint}`);
		}

		const gulpfile = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.ts'), 'utf8');
		for (const packagedResource of [
			'out-build/vs/sessions/',
			'out-build/vs/workbench/contrib/debug/browser/media/',
			'onnxruntime-node',
			'readAgentSdkResults',
			'json.agentSdks'
		]) {
			assert.ok(!gulpfile.includes(packagedResource), `Unsupported packaged resource remains: ${packagedResource}`);
		}
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeOnboarding')));
		for (const buildBoundaryPath of [
			path.join(repositoryRoot, 'src', 'tsconfig.json'),
			path.join(repositoryRoot, 'build', 'next', 'index.ts'),
			path.join(repositoryRoot, 'build', 'lib', 'i18n.resources.json')
		]) {
			assert.ok(!fs.readFileSync(buildBoundaryPath, 'utf8').includes('welcomeOnboarding'), `Unsupported onboarding build entry remains: ${buildBoundaryPath}`);
		}
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.web.ts')));
		const eslintConfig = fs.readFileSync(path.join(repositoryRoot, 'eslint.config.js'), 'utf8');
		const extensionGulpfile = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.extensions.ts'), 'utf8');
		assert.match(extensionGulpfile, /extensions\/simple-browser\/tsconfig\.json/);
		assert.doesNotMatch(`${eslintConfig}\n${extensionGulpfile}`, /mermaid-markdown-features\/preview-src\/chat/);
		const packageVerifier = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-package.ps1'), 'utf8');
		assert.match(packageVerifier, /resources\\app\\out\\vs\\workbench\\contrib\\welcomeOnboarding'/);
		assert.doesNotMatch(packageVerifier, /welcomeOnboarding\\browser\\media/);
		for (const excludedIcon of [
			'agent*.svg',
			'chat*.svg',
			'copilot*.svg',
			'mcp*.svg',
			'new-session.svg',
			'send-to-remote-agent.svg',
			'session-in-progress*.svg',
			'share-window.svg',
			'terminal-secure.svg'
		]) {
			assert.ok(gulpfile.includes(`!**/@vscode/codicons/src/icons/${excludedIcon}`), `AI codicon source is not excluded from packaging: ${excludedIcon}`);
		}

		const entrypointPaths = [
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.desktop.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.web.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'extensionHost.contribution.ts')
		];
		const entrypoints = entrypointPaths.map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		for (const unsupportedRegistration of [
			'/sessions/',
			'/agentHost/',
			'/mcp/',
			'/chat/',
			'/inlineChat/',
			'/agentsVoice/',
			'/aiEmbeddingVector/',
			'/aiRelatedInformation/',
			'/aiSettingsSearch/',
			'/editTelemetry/',
			'/localTranscription/',
			'/remoteCodingAgents/',
			'/debug/'
		]) {
			assert.ok(!entrypoints.includes(unsupportedRegistration), `Unsupported runtime registration remains: ${unsupportedRegistration}`);
		}

		for (const removedPath of [
			path.join(repositoryRoot, 'build', 'agent-sdk'),
			path.join(repositoryRoot, 'build', 'npm', 'stubs', 'sharp'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'agentHost'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'agentPlugins'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'localTranscription'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'mcp'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'networkFilter'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'webContentExtractor'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'chat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'editTelemetry'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'inlineChat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'contrib', 'chat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'view', 'cellParts', 'chat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'mcp'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'remoteCodingAgents'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'search', 'browser', 'AISearch'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'terminalContrib', 'chat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'terminalContrib', 'chatAgentTools'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeAgentSessions'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'agentEditorComments'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'agentHost'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'aiEmbeddingVector'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'aiRelatedInformation'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'aiSettingsSearch'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'chat'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'mcp')
		]) {
			const files = fs.existsSync(removedPath) ? fs.readdirSync(removedPath, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()) : [];
			assert.deepStrictEqual(files, [], `Removed product resource still contains files: ${removedPath}`);
		}

		const accessibilitySources = [
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'accessibilitySignal', 'browser', 'accessibilitySignalService.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'accessibility', 'browser', 'accessibilityConfiguration.ts')
		].map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		for (const unsupportedSetting of [
			'accessibility.signals.chatUserActionRequired',
			'accessibility.signals.chatResponsePending',
			'audioCues.chatResponsePending',
			'accessibility.debugWatchVariableAnnouncements',
			'accessibility.replEditor.readLastExecutionOutput'
		]) {
			assert.ok(!accessibilitySources.includes(unsupportedSetting), `Unsupported accessibility setting remains: ${unsupportedSetting}`);
		}
		for (const removedAudio of [
			'chatEditModifiedFile.mp3',
			'chatUserActionRequired.mp3',
			'requestSent.mp3',
			'responseReceived1.mp3',
			'responseReceived2.mp3',
			'responseReceived3.mp3',
			'responseReceived4.mp3'
		]) {
			assert.ok(!fs.existsSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'accessibilitySignal', 'browser', 'media', removedAudio)), `Unsupported Chat audio remains: ${removedAudio}`);
		}

		const stableApi = fs.readFileSync(path.join(repositoryRoot, 'src', 'vscode-dts', 'vscode.d.ts'), 'utf8');
		for (const removedNamespace of ['namespace chat', 'namespace debug', 'namespace lm']) {
			assert.ok(!stableApi.includes(removedNamespace), `Unsupported extension API remains: ${removedNamespace}`);
		}
		const unsupportedProposals = fs.readdirSync(path.join(repositoryRoot, 'src', 'vscode-dts'))
			.filter(file => /^vscode\.proposed\.(?:agent|ai|browser|chat|interactive\.|languageModel|mappedEditsProvider|mcp)/i.test(file));
		assert.deepStrictEqual(unsupportedProposals, []);
		for (const removedSource of [
			path.join(repositoryRoot, 'src', 'typings', 'copilot-api.d.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'endpoint', 'common', 'licenseAgreement.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'mainThreadAgentEditorComments.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHostAgentEditorComments.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'markers', 'browser', 'markersChatContext.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'search', 'browser', 'searchChatContext.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'surveys', 'browser', 'survey.contribution.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'terminal', 'browser', 'chatTerminalCommandMirror.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'assignment', 'common', 'assignmentFilters.ts'),
			path.join(repositoryRoot, 'test', 'automation', 'src', 'agentsWindow.ts'),
			path.join(repositoryRoot, 'test', 'automation', 'src', 'chat.ts'),
			path.join(repositoryRoot, 'test', 'smoke', 'src', 'areas', 'chat', 'chatDisabled.test.ts')
		]) {
			assert.ok(!fs.existsSync(removedSource), `Unsupported AI source remains: ${removedSource}`);
		}

		const mixedCoreBoundaries: readonly [string, readonly RegExp[]][] = [
			['src/vs/editor/common/standaloneStrings.ts', [/quickChatCommand/, /startInlineChatCommand/, /chatEditorModification/, /chatEditing\.navigation/]],
			['src/vs/editor/common/textModelEditSource.ts', [/function isAiEdit/, /chatApplyEdits/, /inlineChatApplyEdit/, /EditSuggestionId/]],
			['src/vs/platform/accessibility/browser/accessibleView.ts', [/TerminalChat\s*=/, /PanelChat\s*=/, /AgentChat\s*=/, /QuickChat\s*=/, /SessionsChat\s*=/]],
			['src/vs/workbench/api/common/extHost.api.impl.ts', [/ExtHostChatAgents/, /ExtHostLanguageModels/, /ExtHostLanguageModelTools/, /ExtHostMpcService/, /ExtHostDebugService/]],
			['src/vs/workbench/api/common/extHostCommands.ts', [/MappedEdits/, /CodeMapper/]],
			['src/vs/workbench/api/common/extHost.protocol.ts', [/MainThreadChat/, /ExtHostChat/, /MainThreadLanguageModels/, /ExtHostLanguageModels/, /MainThreadMcp/, /ExtHostMcp/]],
			['src/vs/workbench/api/common/extHostTypes.ts', [/ChatResponse/, /LanguageModelChat/, /DebugConsoleMode/, /DebugVisualization/]],
			['src/vs/workbench/api/browser/viewsExtensionPoint.ts', [/contrib\/debug\/common\/debug/, /'debug'\s*:\s*\{/, /RequiresChatSessionsProposedAPI/]],
			['src/vs/workbench/contrib/notebook/browser/notebookBrowser.ts', [/chatHeight\??:/, /ChatInput/]],
			['src/vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel.ts', [/IInlineChatSessionService/, /chatHeight/]],
			['src/vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel.ts', [/IInlineChatSessionService/, /chatHeight/]],
			['src/vs/workbench/contrib/notebook/browser/diff/inlineDiff/notebookCellDiffDecorator.ts', [/chat-edit/, /chat-editing/]],
			['src/vs/workbench/contrib/notebook/browser/diff/inlineDiff/notebookOriginalCellModelFactory.ts', [/chat-edit/, /chat-editing/]],
			['src/vs/workbench/contrib/surveys/browser/surveyEditorInput.ts', [/code\.copilot/, /panel\.agent/, /agent\.codeEdit/]],
			['src/vs/workbench/contrib/surveys/browser/surveyQuestions.ts', [/CopilotPMFSurvey/, /survey\.copilotPmf/]],
		];
		for (const [relativePath, removedPatterns] of mixedCoreBoundaries) {
			const source = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
			for (const removedPattern of removedPatterns) {
				assert.doesNotMatch(source, removedPattern, `Unsupported product coupling remains in ${relativePath}: ${removedPattern}`);
			}
		}

		const apiProposals = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensions', 'common', 'extensionsApiProposals.ts'), 'utf8');
		assert.doesNotMatch(apiProposals, /(?:mappedEditsProvider|vscode\.proposed\.interactive\.d\.ts)/);

		const jsonClientTsconfig = readJson<{ compilerOptions?: { skipLibCheck?: boolean } }>(
			path.join(extensionsRoot, 'json-language-features', 'client', 'tsconfig.json'));
		assert.strictEqual(jsonClientTsconfig.compilerOptions?.skipLibCheck, true);
		for (const jsonClientMain of [
			path.join(extensionsRoot, 'json-language-features', 'client', 'src', 'node', 'jsonClientMain.ts'),
			path.join(extensionsRoot, 'json-language-features', 'client', 'src', 'browser', 'jsonClientMain.ts')
		]) {
			const source = fs.readFileSync(jsonClientMain, 'utf8');
			assert.match(source, /class BeCoderJSONLanguageClient extends LanguageClient/);
			assert.match(source, /registrationType\?\.method === 'textDocument\/inlineValue'/);
		}
	});

	test('keeps Jupyter notebook APIs compatible without restoring Debug or Remote capabilities', () => {
		const apiFactory = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHost.api.impl.ts'), 'utf8');
		assert.match(apiFactory, /const debug = \{/);
		assert.match(apiFactory, /onDidTerminateDebugSession: Event\.None/);
		assert.match(apiFactory, /async startDebugging\(\) \{\s*return false;/);
		assert.match(apiFactory, /registerDebugAdapterDescriptorFactory\(\) \{\s*return Disposable\.None;/);
		assert.match(apiFactory, /\bdebug,\s*\r?\n\s*env,/);
		assert.match(apiFactory, /registerPortAttributesProvider: \(\) => \{\s*checkProposedApiEnabled\(extension, 'portsAttributes'\);\s*return Disposable\.None;/);
		assert.doesNotMatch(apiFactory, /extHostTunnelService|registerPortsAttributesProvider/);
		assert.match(apiFactory, /const lm = \{/);
		assert.match(apiFactory, /async selectChatModels\(\) \{\s*return \[\];/);
		assert.match(apiFactory, /onDidChangeChatModels: Event\.None/);
		assert.match(apiFactory, /registerTool\(\) \{\s*return Disposable\.None;/);
		assert.match(apiFactory, /async invokeTool\(\) \{\s*throw new Error\('Language model tools are not available in BeCoder\.'\);/);
		assert.match(apiFactory, /tools: \[\]/);
		assert.match(apiFactory, /\blm,\s*\r?\n\s*notebooks,/);
		assert.doesNotMatch(apiFactory, /ExtHostLanguageModels|ExtHostLanguageModelTools|registerLanguageModelTool/);

		const ipynbManifest = readJson<{
			contributes?: {
				commands?: { command?: string }[];
				menus?: Record<string, { command?: string }[]>;
				notebooks?: { type?: string; selector?: { filenamePattern?: string }[] }[];
			};
		}>(path.join(extensionsRoot, 'ipynb', 'package.json'));
		assert.ok(ipynbManifest.contributes?.notebooks?.some(notebook =>
			notebook.type === 'jupyter-notebook' && notebook.selector?.some(selector => selector.filenamePattern === '*.ipynb')));
		assert.ok(!ipynbManifest.contributes?.commands?.some(command => command.command === 'notebook.cellOutput.addToChat'));
		assert.ok(!Object.values(ipynbManifest.contributes?.menus ?? {}).flat().some(menu => menu.command === 'notebook.cellOutput.addToChat'));

		const rendererManifest = readJson<{
			contributes?: { notebookRenderer?: { id?: string }[] };
		}>(path.join(extensionsRoot, 'notebook-renderers', 'package.json'));
		assert.ok(rendererManifest.contributes?.notebookRenderer?.some(renderer => renderer.id === 'vscode.builtin-renderer'));

		const notebookContribution = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'notebook.contribution.ts'), 'utf8');
		assert.doesNotMatch(notebookContribution, /notebookService\.getContributedNotebookTypes\(\);|notebookService\.getEditorTypes\(\);/);
		assert.doesNotMatch(notebookContribution, /controller\/chat|contrib\/debug|NotebookVariables/);

		const runtimeScanner = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'extensions', 'electron-browser', 'cachedExtensionScanner.ts'), 'utf8');
		const runtimeExcludedExtensions = /const excludedOIDistributionExtensions = new Set\(\[([\s\S]*?)\n\]\);/.exec(runtimeScanner)?.[1] ?? '';
		assert.doesNotMatch(runtimeExcludedExtensions, /'ipynb'|'notebook-renderers'/);

		const product = readJson<{
			extensionEnabledApiProposals?: Record<string, string[]>;
		}>(path.join(repositoryRoot, 'product.json'));
		assert.deepStrictEqual(product.extensionEnabledApiProposals?.['ms-toolsai.jupyter'], [
			'notebookDeprecated',
			'notebookMessaging',
			'notebookMime',
			'contribNotebookStaticPreloads',
			'portsAttributes',
			'quickPickSortByLabel',
			'notebookKernelSource',
			'interactiveWindow',
			'quickPickItemTooltip',
			'notebookExecution',
			'notebookCellExecution',
			'notebookVariableProvider',
			'notebookReplDocument'
		]);
		assert.deepStrictEqual(product.extensionEnabledApiProposals?.['ms-toolsai.jupyter-renderers'], [
			'contribNotebookStaticPreloads'
		]);
		assert.deepStrictEqual(product.extensionEnabledApiProposals?.['ms-python.python'], [
			'contribEditorContentMenu',
			'quickPickSortByLabel',
			'testObserver',
			'quickPickItemTooltip',
			'terminalDataWriteEvent',
			'terminalExecuteCommandEvent',
			'notebookReplDocument',
			'notebookVariableProvider'
		]);
		assert.ok(!product.extensionEnabledApiProposals?.['ms-python.python']?.includes('codeActionAI'));
	});

	test('keeps generic authentication without AI or MCP account policy', () => {
		const commonWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		assert.match(commonWorkbench, /contrib\/authentication\/browser\/authentication\.contribution\.js/);

		const stableApi = fs.readFileSync(path.join(repositoryRoot, 'src', 'vscode-dts', 'vscode.d.ts'), 'utf8');
		assert.match(stableApi, /namespace authentication[\s\S]*registerAuthenticationProvider/);

		const authenticationPaths = [
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'mainThreadAuthentication.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHostAuthentication.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'authentication', 'common', 'authentication.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'authentication', 'browser', 'authenticationService.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'authentication', 'browser', 'authentication.contribution.ts')
		];
		const authenticationSources = authenticationPaths.map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		assert.doesNotMatch(authenticationSources, /(?:chat|agent|copilot|language.?model|mcp|defaultAccount|entitlement|quota|sku|tracking.?id)/i);
		assert.match(authenticationSources, /registerAuthenticationProvider/);

		for (const removedPath of [
			path.join(repositoryRoot, 'src', 'vs', 'base', 'common', 'defaultAccount.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'defaultAccount'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'policies', 'browser', 'accountPolicyGate.contribution.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'policy', 'common', 'copilotManagedSettings.ts')
		]) {
			const remainingFiles = !fs.existsSync(removedPath)
				? []
				: fs.statSync(removedPath).isDirectory()
					? fs.readdirSync(removedPath, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
					: [removedPath];
			assert.deepStrictEqual(remainingFiles, [], `AI account implementation remains: ${removedPath}`);
		}
	});

	test('keeps ordinary Browser View access without extraction or automation channels', () => {
		const desktopWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.desktop.main.ts'), 'utf8');
		assert.match(desktopWorkbench, /contrib\/browserView\/electron-browser\/browserView\.contribution\.js/);
		const appSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.match(appSource, /BrowserViewMainService/);
		assert.match(appSource, /ipcBrowserViewChannelName/);

		for (const ordinaryBrowserFeature of [
			'browserNavigationFeatures.ts',
			'browserHistoryFeature.ts',
			'browserFavoritesFeature.ts',
			'browserPermissionsFeature.ts',
			'browserEditorFindFeature.ts',
			'browserEditorZoomFeature.ts',
			'browserDevToolsFeature.ts'
		]) {
			assert.ok(fs.existsSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'browserView', 'electron-browser', 'features', ordinaryBrowserFeature)));
		}

		for (const removedAutomationPath of [
			path.join(repositoryRoot, 'src', 'vscode-dts', 'vscode.proposed.browser.d.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'mainThreadBrowsers.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHostBrowsers.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'browserView', 'common', 'playwrightService.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'browserView', 'node', 'playwrightService.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'browserView', 'node', 'playwrightChannel.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'browserView', 'common', 'browserViewGroup.ts')
		]) {
			assert.ok(!fs.existsSync(removedAutomationPath), `Browser automation entry remains: ${removedAutomationPath}`);
		}

		const browserSources = [
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHost.protocol.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'extensionHost.contribution.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts')
		].map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		assert.doesNotMatch(browserSources, /MainThreadBrowsers|ExtHostBrowsers|IBrowserViewCDPService|browserViewGroup|startCDPSession/);
	});

	test('keeps generic assignment and Notebook diagnostics without AI actions', () => {
		const commonWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		assert.match(commonWorkbench, /services\/assignment\/common\/assignmentService\.js/);

		const assignmentService = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'assignment', 'common', 'assignmentService.ts'), 'utf8');
		assert.match(assignmentService, /class WorkbenchAssignmentService/);
		assert.doesNotMatch(assignmentService, /CopilotAssignmentFilterProvider|defaultAccount|chatEntitlement/);

		const sourceTsconfig = fs.readFileSync(path.join(repositoryRoot, 'src', 'tsconfig.json'), 'utf8');
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'assignment', 'common', 'assignmentFilters.ts')));
		assert.doesNotMatch(sourceTsconfig, /vs\/workbench\/services\/assignment\/common\/assignmentFilters\.ts/);
		assert.doesNotMatch(sourceTsconfig, /vs\/workbench\/services\/assignment\/\*\*/);
		assert.doesNotMatch(sourceTsconfig, /contrib\/notebook\/browser\/contrib\/cellDiagnostics\/\*\*/);

		const notebookContribution = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'notebook.contribution.ts'), 'utf8');
		assert.match(notebookContribution, /contrib\/cellDiagnostics\/cellDiagnostics\.js/);
		assert.match(notebookContribution, /\[NotebookSetting\.cellFailureDiagnostics\][\s\S]*default: true/);

		const diagnosticsRoot = path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'notebook', 'browser', 'contrib', 'cellDiagnostics');
		const diagnosticsSource = [
			'cellDiagnosticEditorContrib.ts',
			'cellDiagnosticsActions.ts',
			'diagnosticCellStatusBarContrib.ts'
		].map(file => fs.readFileSync(path.join(diagnosticsRoot, file), 'utf8')).join('\n');
		assert.match(diagnosticsSource, /markerService\.changeOne/);
		assert.match(diagnosticsSource, /CodeActionController\.get/);
		assert.doesNotMatch(diagnosticsSource, /IChatAgentService|InlineChatController|IChatWidgetService|notebook\.cell\.chat\./);

		const standaloneStrings = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'editor', 'common', 'standaloneStrings.ts'), 'utf8');
		const editorAccessibilityHelp = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'accessibility', 'browser', 'editorAccessibilityHelp.ts'), 'utf8');
		assert.doesNotMatch(standaloneStrings, /debug\.startDebugging|debugConsole\.(?:setBreakpoint|addToWatch|executeSelection)/);
		assert.doesNotMatch(editorAccessibilityHelp, /AccessibilityHelpNLS\.(?:startDebugging|setBreakpoint|addToWatch|debugExecuteSelection)/);
	});

	test('keeps ordinary Images Preview without Chat integration', () => {
		const commonWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		assert.match(commonWorkbench, /contrib\/imageCarousel\/browser\/imageCarousel\.contribution\.js/);

		const sourceTsconfig = fs.readFileSync(path.join(repositoryRoot, 'src', 'tsconfig.json'), 'utf8');
		assert.doesNotMatch(sourceTsconfig, /vs\/workbench\/contrib\/imageCarousel\/\*\*/);
		assert.doesNotMatch(sourceTsconfig, /componentFixtures\/imageCarousel\.fixture\.ts/);

		const contributionSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'imageCarousel', 'browser', 'imageCarousel.contribution.ts'), 'utf8');
		assert.match(contributionSource, /workbench\.action\.openImagesInCarousel/);
		assert.match(contributionSource, /imageCarousel\.explorerContextMenu\.enabled/);
		assert.doesNotMatch(contributionSource, /workbench\.action\.chat|imageCarousel\.chat\.enabled/);
	});

	test('keeps ordinary terminal shell identification without Agent CLI branding', () => {
		const shellTypes = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'terminal', 'common', 'terminal.ts'), 'utf8');
		const windowsShellHelper = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'terminal', 'node', 'windowsShellHelper.ts'), 'utf8');
		for (const retainedShell of ['PowerShell', 'Python', 'Julia', 'Node', 'NuShell', 'Xonsh']) {
			assert.match(shellTypes, new RegExp(`\\b${retainedShell}\\s*=`), `Missing ordinary shell type: ${retainedShell}`);
		}
		for (const retainedExecutable of ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'bash.exe', 'git-cmd.exe', 'python', 'wsl.exe']) {
			assert.ok(windowsShellHelper.includes(retainedExecutable), `Missing ordinary Windows shell identification: ${retainedExecutable}`);
		}
		assert.doesNotMatch(shellTypes, /\b(?:Claude|Codex|CommandCode|Copilot|Gemini)\s*=/);
		assert.doesNotMatch(windowsShellHelper, /(?:claude|codex|commandcode|copilot|gemini)\.exe/);
	});

	test('removes Remote products while retaining ordinary local and network infrastructure', () => {
		const product = readJson<Record<string, unknown>>(path.join(repositoryRoot, 'product.json'));
		for (const property of [
			'serverLicenseUrl',
			'serverGreeting',
			'serverLicense',
			'serverLicensePrompt',
			'serverApplicationName',
			'serverDataFolderName',
			'tunnelApplicationName',
			'win32TunnelServiceMutex',
			'win32TunnelMutex'
		]) {
			assert.ok(!(property in product), `Remote product property remains: ${property}`);
		}

		for (const removedPath of [
			path.join(repositoryRoot, 'cli'),
			path.join(repositoryRoot, 'remote'),
			path.join(repositoryRoot, 'resources', 'server'),
			path.join(repositoryRoot, 'src', 'vs', 'sessions'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'agentsVoice'),
			path.join(repositoryRoot, 'src', 'vs', 'server'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'remote'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'remoteTunnel'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'tunnel'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'remote'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'remoteTunnel'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'remote'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'tunnel'),
			path.join(repositoryRoot, 'build', 'gulpfile.reh.ts'),
			path.join(repositoryRoot, 'build', 'gulpfile.cli.ts'),
			path.join(repositoryRoot, 'build', 'gulpfile.vscode.web.ts'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'cli'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'web'),
			path.join(repositoryRoot, 'scripts', 'code-server.js'),
			path.join(repositoryRoot, 'scripts', 'code-agent-host.sh'),
			path.join(repositoryRoot, 'scripts', 'code-sessions-web.sh'),
			path.join(repositoryRoot, 'scripts', 'code-web.js'),
			path.join(repositoryRoot, 'scripts', 'code-web.sh'),
			path.join(repositoryRoot, 'scripts', 'code-web.bat'),
			path.join(repositoryRoot, 'build', 'vite', 'mobile-multi-diff.ts'),
			path.join(repositoryRoot, 'build', 'vite', 'mobile-multi-diff-worker.ts'),
			path.join(repositoryRoot, 'build', 'vite', 'mobile-multi-diff.html'),
			path.join(repositoryRoot, 'scripts', 'test-remote-integration.sh'),
			path.join(repositoryRoot, 'scripts', 'test-web-integration.sh')
		]) {
			if (!fs.existsSync(removedPath)) {
				continue;
			}
			assert.ok(fs.statSync(removedPath).isDirectory(), `Remote product file remains: ${removedPath}`);
			const files = fs.readdirSync(removedPath, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
			assert.deepStrictEqual(files, [], `Remote product directory still contains files: ${removedPath}`);
		}

		const entrypoints = [
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.desktop.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.web.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'electron-browser', 'desktop.main.ts'),
			path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-utility', 'sharedProcess', 'sharedProcessMain.ts')
		].map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		assert.doesNotMatch(entrypoints, /(?:platform|services|contrib)\/(?:remote|remoteTunnel|tunnel)\//);

		const pipelineSources = [
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'product-build.yml'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'product-build-template.yml'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'product-build-variables.yml'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'darwin', 'product-build-darwin-ci.yml'),
			path.join(repositoryRoot, 'build', 'azure-pipelines', 'linux', 'product-build-linux-ci.yml')
		].map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
		assert.doesNotMatch(pipelineSources, /VSCODE_(?:BUILD_(?:ALPINE|WEB)|BUILD_STAGE_(?:ALPINE|WEB)|RUN_REMOTE_TESTS)|VSCODE_TEST_SUITE:\s*Remote/);

		const publisher = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'common', 'publish.ts'), 'utf8');
		assert.match(publisher, /product !== 'client'/);
		assert.doesNotMatch(publisher, /server-(?:win32|linux|darwin|alpine)|cli-(?:win32|linux|darwin|alpine)|web-standalone/);

		const preinstall = fs.readFileSync(path.join(repositoryRoot, 'build', 'npm', 'preinstall.ts'), 'utf8');
		assert.match(preinstall, /if \(!fs\.existsSync\(rcFile\)\) \{\s*return undefined;\s*\}/);

		const launchConfiguration = fs.readFileSync(path.join(repositoryRoot, '.vscode', 'launch.json'), 'utf8');
		for (const removedLaunchName of [
			'Attach to Agent Host Process',
			'Launch VS Code Agents Internal',
			'VS Code Server (Web)',
			'VS Code Server (Web, Chrome)',
			'VS Code Server (Web, Edge)',
			'VS Code Web (Chrome)',
			'VS Code Web (Edge)',
			'VS Code Agent Host',
			'VS Code Agents',
			'Renderer and Agent Host processes'
		]) {
			assert.doesNotMatch(launchConfiguration, new RegExp(`"name"\\s*:\\s*"${removedLaunchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
		}
		assert.doesNotMatch(launchConfiguration, /"program"\s*:\s*"[^"]*(?:code-(?:server|web|sessions-web|agent-host)|server-main|server-cli)[^"]*"/);
		assert.doesNotMatch(launchConfiguration, /"args"\s*:\s*\[[^\]]*"--agents"/s);

		const workspaceTasks = fs.readFileSync(path.join(repositoryRoot, '.vscode', 'tasks.json'), 'utf8');
		for (const removedTaskLabel of [
			'Web Ext - Build',
			'Kill Web Ext - Build',
			'Run Dev Agents',
			'Run and Compile Agents - OSS',
			'Run code server',
			'Run code web',
			'Run VS Code (Web)',
			'Launch MCP Server'
		]) {
			assert.doesNotMatch(workspaceTasks, new RegExp(`"label"\\s*:\\s*"${removedTaskLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
		}
		assert.doesNotMatch(workspaceTasks, /"(?:command|script)"\s*:\s*"(?:compile-cli|watch-cli|compile-web|watch-web|[^"]*code-(?:server|web|sessions-web|agent-host)[^"]*)"/);

		const workspaceSettings = fs.readFileSync(path.join(repositoryRoot, '.vscode', 'settings.json'), 'utf8');
		assert.doesNotMatch(workspaceSettings, /"[^"]*(?:remote|tunnel|agentHost|agentSessions)[^"]*"\s*:/i);

		const packageManifest = readJson<{ readonly scripts?: Record<string, string> }>(path.join(repositoryRoot, 'package.json'));
		for (const removedScript of ['compile-cli', 'watch-cli', 'compile-web', 'watch-web']) {
			assert.equal(packageManifest.scripts?.[removedScript], undefined, `Removed product script remains: ${removedScript}`);
		}
		for (const [scriptName, scriptCommand] of Object.entries(packageManifest.scripts ?? {})) {
			assert.doesNotMatch(scriptCommand, /(?:scripts\/code-(?:server|web|sessions-web|agent-host)|build\/gulpfile\.(?:cli|reh|vscode\.web))/, `Removed product command remains in script ${scriptName}`);
		}

		const network = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'base', 'common', 'network.ts'), 'utf8');
		assert.match(network, /export const http = 'http'/);
		assert.match(network, /export const https = 'https'/);
		assert.match(network, /export const file = 'file'/);
		assert.match(network, /export const vscodeBrowser = 'vscode-browser'/);
		assert.doesNotMatch(network, /vscodeRemote\s*=|vscode-remote/);

		const commonMain = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		const desktopMain = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.desktop.main.ts'), 'utf8');
		const extensionContribution = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'extensions', 'browser', 'extensions.contribution.ts'), 'utf8');
		const processExplorer = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'processExplorer', 'browser', 'processExplorerControl.ts'), 'utf8');
		const browserFileDialog = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'dialogs', 'browser', 'fileDialogService.ts'), 'utf8');
		const gettingStartedContent = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeGettingStarted', 'common', 'gettingStartedContent.ts'), 'utf8');
		assert.match(commonMain, /services\/authentication\/browser\/authenticationService\.js/);
		assert.match(commonMain, /contrib\/tasks\/browser\/task\.contribution\.js/);
		assert.match(desktopMain, /contrib\/browserView\/electron-browser\/browserView\.contribution\.js/);
		assert.match(desktopMain, /contrib\/terminal\/electron-browser\/terminal\.contribution\.js/);
		assert.match(extensionContribution, /id: SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID/);
		assert.match(extensionContribution, /id: INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID/);
		assert.match(extensionContribution, /when: CONTEXT_HAS_LOCAL_SERVER/);
		assert.match(processExplorer, /id: 'killProcess'/);
		assert.match(processExplorer, /id: 'copyAll'/);
		assert.doesNotMatch(processExplorer, /debug\.startFromConfig|id: 'debug'|isDebuggable|attachTo/);
		assert.match(browserFileDialog, /triggerDownload/);
		assert.match(browserFileDialog, /triggerUpload/);
		assert.doesNotMatch(browserFileDialog, /Open Remote|workbench\.action\.remote\.showMenu/);
		assert.doesNotMatch(gettingStartedContent, /topLevelRemoteOpen|topLevelOpenTunnel|workbench\.action\.remote\.show(?:Menu|WebStartEntryActions)/);
	});

	test('owns the Stage 4.6 dependency, terminal, SCM, and workspace boundary', () => {
		const packageManifest = readJson<{
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			overrides?: Record<string, unknown>;
			allowScripts?: Record<string, boolean>;
		}>(path.join(repositoryRoot, 'package.json'));
		assert.ok(!('cpu-features' in (packageManifest.dependencies ?? {})));
		assert.ok(!('cpu-features' in (packageManifest.devDependencies ?? {})));
		assert.ok(!('cpu-features' in (packageManifest.overrides ?? {})));
		assert.ok(!('cpu-features' in (packageManifest.allowScripts ?? {})));
		assert.ok(!('ssh2' in (packageManifest.dependencies ?? {})));
		assert.ok(!('@types/ssh2' in (packageManifest.devDependencies ?? {})));
		assert.ok(!('ssh2' in (packageManifest.allowScripts ?? {})));
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'build', 'npm', 'stubs', 'cpu-features')));

		const packageLock = readJson<{
			packages?: Record<string, {
				version?: string;
				resolved?: string;
				optional?: boolean;
				dependencies?: Record<string, string>;
				optionalDependencies?: Record<string, string>;
			}>;
		}>(path.join(repositoryRoot, 'package-lock.json'));
		assert.ok(!packageLock.packages?.['node_modules/ssh2']);
		assert.ok(!packageLock.packages?.['node_modules/cpu-features']);

		for (const removedPath of [
			'src/vs/workbench/contrib/terminalContrib/inlineHint',
			'src/vs/workbench/contrib/terminalContrib/suggest',
			'src/vs/workbench/contrib/scm',
			'src/vs/workbench/contrib/git',
			'src/vs/platform/git',
			'src/vs/workbench/api/browser/mainThreadSCM.ts',
			'src/vs/workbench/api/common/extHostSCM.ts',
		]) {
			assert.ok(!fs.existsSync(path.join(repositoryRoot, removedPath)), `Removed Stage 4.6 source remains: ${removedPath}`);
		}

		const commonWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.common.main.ts'), 'utf8');
		const desktopWorkbench = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'workbench.desktop.main.ts'), 'utf8');
		assert.doesNotMatch(commonWorkbench, /contrib\/(?:git|scm)\//);
		assert.doesNotMatch(commonWorkbench, /terminalContrib\/(?:inlineHint|suggest)\//);
		for (const retainedContribution of [
			'contrib/multiDiffEditor/browser/multiDiffEditor.contribution.js',
			'contrib/timeline/browser/timeline.service.contribution.js',
			'contrib/localHistory/browser/localHistory.contribution.js',
			'contrib/tasks/browser/task.contribution.js',
			'contrib/markdown/browser/markdown.contribution.js',
		]) {
			assert.ok(commonWorkbench.includes(retainedContribution), `Ordinary Workbench contribution was lost: ${retainedContribution}`);
		}
		assert.doesNotMatch(commonWorkbench, /contrib\/timeline\/browser\/timeline\.contribution\.js/);
		assert.match(desktopWorkbench, /contrib\/tasks\/electron-browser\/taskService\.js/);
		assert.match(desktopWorkbench, /contrib\/browserView\/electron-browser\/browserView\.contribution\.js/);

		const publicApi = fs.readFileSync(path.join(repositoryRoot, 'src', 'vscode-dts', 'vscode.d.ts'), 'utf8');
		assert.doesNotMatch(publicApi, /namespace scm|SourceControl|withScmProgress|ProgressLocation\.SourceControl/);
		assert.doesNotMatch(publicApi, /TerminalCompletionProvider|registerTerminalCompletionProvider/);
		const progressTypes = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'progress', 'common', 'progress.ts'), 'utf8');
		const progressService = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'progress', 'browser', 'progressService.ts'), 'utf8');
		const welcomeViews = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'welcomeViews', 'common', 'viewsWelcomeExtensionPoint.ts'), 'utf8');
		const extensionCategories = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensions', 'common', 'extensions.ts'), 'utf8');
		const viewGroups = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'common', 'views.ts'), 'utf8');
		const viewsSchema = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'browser', 'viewsExtensionPoint.ts'), 'utf8');
		assert.doesNotMatch(progressTypes, /\bScm\s*=/);
		assert.doesNotMatch(progressService, /ProgressLocation\.Scm|workbench\.scm/);
		assert.doesNotMatch(welcomeViews, /workbench\.(?:scm|debug\.welcome)|Clone Repository/);
		assert.doesNotMatch(extensionCategories, /'SCM Providers'/);
		assert.doesNotMatch(viewGroups, /\bSCM\s*=/);
		assert.doesNotMatch(viewsSchema, /explorer and scm/);

		const searchView = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'search', 'browser', 'searchView.ts'), 'utf8');
		assert.doesNotMatch(searchView, /ISCMService|onlySearchInChangedFiles|changedFileUris/);
		assert.match(searchView, /onlySearchInOpenEditors/);
		const timelinePane = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'timeline', 'browser', 'timelinePane.ts'), 'utf8');
		assert.doesNotMatch(timelinePane, /scm\.providerCount|timeline\.noSCM/);
		assert.match(timelinePane, /workbench\.localHistory\.enabled/);

		const workspaceConfiguration = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'configuration', 'browser', 'configuration.ts'), 'utf8');
		const workspaceRecommendations = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'extensionRecommendations', 'common', 'workspaceExtensionsConfig.ts'), 'utf8');
		const taskService = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'tasks', 'browser', 'abstractTaskService.ts'), 'utf8');
		assert.match(workspaceConfiguration, /FOLDER_SETTINGS_NAME/);
		assert.match(workspaceConfiguration, /TASKS_CONFIGURATION_KEY/);
		assert.match(workspaceRecommendations, /\.vscode\/extensions\.json/);
		assert.match(taskService, /\.vscode\/tasks\.json/);
		const settingsEditor = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'preferences', 'browser', 'settingsEditor2.ts'), 'utf8');
		const preferenceTerms = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'preferences', 'common', 'preferences.ts'), 'utf8');
		const listService = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'list', 'browser', 'listService.ts'), 'utf8');
		assert.doesNotMatch(settingsEditor, /FEATURE_SETTING_TAG}scm|@feature:scm/);
		assert.doesNotMatch(preferenceTerms, /['"]scm['"]/);
		assert.doesNotMatch(listService, /scm view/);
		for (const integrationScriptPath of ['scripts/test-integration.sh', 'scripts/test-integration.bat']) {
			const integrationScript = fs.readFileSync(path.join(repositoryRoot, ...integrationScriptPath.split('/')), 'utf8');
			assert.doesNotMatch(integrationScript, /terminal-suggest|git-base|--suite git\b|\bcopilot\b|chat\.notifyWindow/);
		}

		const extensionBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'lib', 'extensions.ts'), 'utf8');
		for (const removedExtension of ['git', 'git-base', 'github', 'terminal-suggest']) {
			assert.match(extensionBuildSource, new RegExp(`'${removedExtension}'`), `Stage 4.6 package denylist is missing ${removedExtension}`);
		}
		assert.match(extensionBuildSource, /'github-authentication'/);
	});

	test('uses only Open VSX and protects the complete BeCoder core set', () => {
		const productPath = path.join(repositoryRoot, 'product.json');
		const productText = fs.readFileSync(productPath, 'utf8');
		const product = JSON.parse(productText) as {
			extensionsGallery?: Record<string, string>;
			extensionBlacklist?: readonly string[];
			protectedExtensions?: readonly string[];
			builtInExtensions?: readonly { name?: string }[];
			linkProtectionTrustedDomains?: readonly string[];
		};
		assert.deepStrictEqual(product.extensionsGallery, {
			serviceUrl: 'https://open-vsx.org/vscode/gallery',
			itemUrl: 'https://open-vsx.org/vscode/item',
			latestUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
			controlUrl: 'https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json'
		});
		assert.deepStrictEqual(product.extensionBlacklist, [
			'ms-vscode.cpptools',
			'ms-vscode.cpptools-extension-pack'
		]);
		assert.deepStrictEqual(product.protectedExtensions, [
			'becoder.becoder-setup',
			'becoder.runner',
			'becoder.gcc-diagnostics',
			'becoder.one-monokai',
			'llvm-vs-code-extensions.vscode-clangd',
			'adpyke.codesnap',
			'mathematic.vscode-pdf',
			'vscode.cpp',
			'ms-ceintl.vscode-language-pack-zh-hans'
		]);
		assert.deepStrictEqual(product.linkProtectionTrustedDomains, ['https://open-vsx.org']);
		assert.deepStrictEqual(product.builtInExtensions, []);
		for (const endpoint of ['marketplace.visualstudio.com', 'marketplace.vsallin.net', 'vscode-unpkg.net', 'az764295.vo.msecnd.net']) {
			assert.ok(!productText.includes(endpoint), `Microsoft Marketplace endpoint remains in product.json: ${endpoint}`);
		}

		const extensionBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'lib', 'extensions.ts'), 'utf8');
		const excludedExtensions = /export const excludedForOIDistribution = new Set\(\[([\s\S]*?)\n\]\);/.exec(extensionBuildSource)?.[1] ?? '';
		assert.doesNotMatch(excludedExtensions, /'mermaid-markdown-features'/);
		assert.doesNotMatch(excludedExtensions, /'ipynb'|'notebook-renderers'/);
		const packageBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.ts'), 'utf8');
		assert.match(packageBuildSource, /const beCoderOnboarding = gulp\.src\(\[[\s\S]*'resources\/oi-defaults\/\*\*',[\s\S]*'!resources\/oi-defaults\/onboarding\/\*\*',[\s\S]*'!resources\/oi-defaults\/portable-data\/\*\*'[\s\S]*\], \{ base: '\.' \}\);/);
		assert.match(packageBuildSource, /const beCoderOnboardingWorkspace = gulp\.src\('resources\/oi-defaults\/onboarding\/\*\*', \{ base: 'resources\/oi-defaults\/onboarding', dot: true \}\)[\s\S]*path\.join\('coding'/);
		assert.ok(fs.existsSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'onboarding', 'helloCoder.cpp')));
		assert.ok(fs.existsSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'portable-data', '.becoder-open-hello-coder')));
		assert.match(packageBuildSource, /const beCoderRecipeDotfiles = gulp\.src\('resources\/oi-defaults\/toolchains\/ucrt64-sources\/recipes\/\*\*\/\.gitignore', \{ base: '\.', dot: true \}\);/);

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /countMatchingProtectedExtensions[\s\S]*createFilteredExtensionPager/);
		assert.match(gallerySource, /private async getVersions[\s\S]*isProtectedExtensionId\(extensionIdentifier\.id/);
		assert.match(gallerySource, /private async getAsset[\s\S]*Gallery resources are unavailable for protected BeCoder extension/);

		const extensionManagementSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'node', 'extensionManagementService.ts'), 'utf8');
		assert.match(extensionManagementSource, /installExtensionsFromProfile[\s\S]*allowedExtensionsService\.isAllowed\(extension\)[\s\S]*addExtensionsToProfile/);
		assert.match(extensionManagementSource, /verifySignature = isBoolean\(value\) \? value : false/);

		const extensionsContribution = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'extensions', 'browser', 'extensions.contribution.ts'), 'utf8');
		assert.match(extensionsContribution, /\[VerifyExtensionSignatureConfigKey\]: \{[\s\S]*?default: false,[\s\S]*?scope: ConfigurationScope\.APPLICATION/);

		const packageManifest = readJson<{ dependencies?: Record<string, string> }>(path.join(repositoryRoot, 'package.json'));
		assert.ok(!Object.hasOwn(packageManifest.dependencies ?? {}, '@vscode/vsce-sign'), 'The proprietary Microsoft signature verifier must not be distributed with BeCoder');
	});

	test('bundles Mermaid Markdown and Notebook rendering without Chat output integration', () => {
		const extensionPath = path.join(extensionsRoot, 'mermaid-markdown-features');
		const manifest = readJson<{
			publisher?: string;
			name?: string;
			main?: string;
			browser?: string;
			enabledApiProposals?: readonly string[];
			contributes?: {
				commands?: readonly { command?: string }[];
				menus?: Record<string, readonly { when?: string }[]>;
				'markdown.previewScripts'?: readonly { path?: string }[];
				notebookRenderer?: readonly { entrypoint?: { path?: string } }[];
				'markdown.markdownItPlugins'?: boolean;
				chatOutputRenderers?: unknown;
			};
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'vscode.mermaid-markdown-features');
		assert.strictEqual(manifest.main, './out/extension');
		assert.strictEqual(manifest.browser, './dist/browser/extension');
		assert.deepStrictEqual(manifest.enabledApiProposals, undefined);
		assert.strictEqual(manifest.contributes?.chatOutputRenderers, undefined);
		assert.deepStrictEqual(manifest.contributes?.['markdown.previewScripts']?.map(item => item.path), ['./markdown-preview-out/index.js']);
		assert.deepStrictEqual(manifest.contributes?.notebookRenderer?.map(item => item.entrypoint?.path), ['./notebook-out/index.js']);
		assert.strictEqual(manifest.contributes?.['markdown.markdownItPlugins'], true);
		assert.ok(manifest.contributes?.commands?.some(command => command.command === '_mermaid-markdown.openInEditor'));
		for (const menu of Object.values(manifest.contributes?.menus ?? {})) {
			for (const item of menu) {
				assert.doesNotMatch(item.when ?? '', /chatOutputItem/);
			}
		}

		const extensionSource = fs.readFileSync(path.join(extensionPath, 'src', 'extension.ts'), 'utf8');
		const editorSource = fs.readFileSync(path.join(extensionPath, 'src', 'editorManager.ts'), 'utf8');
		const webviewBuild = fs.readFileSync(path.join(extensionPath, 'esbuild.webview.mts'), 'utf8');
		const gitIgnore = fs.readFileSync(path.join(extensionPath, '.gitignore'), 'utf8');
		const renderingSource = fs.readFileSync(path.join(extensionPath, 'preview-src', 'shared', 'index.ts'), 'utf8');
		const combinedSource = `${extensionSource}\n${editorSource}\n${webviewBuild}`;
		assert.doesNotMatch(combinedSource, /registerChatOutputRenderer|text\/vnd\.mermaid|ChatOutputDataItem|LanguageModelTextPart|LanguageModelToolResult|chat-webview-out|preview-src[\\/]chat/);
		assert.match(extensionSource, /extendMarkdownItWithMermaid/);
		assert.match(editorSource, /diagram-preview-out/);
		assert.match(webviewBuild, /diagram-preview-out/);
		assert.match(webviewBuild, /markdown-preview-out/);
		assert.match(webviewBuild, /notebook-out/);
		assert.match(gitIgnore, /^diagram-preview-out$/m);
		assert.doesNotMatch(gitIgnore, /^chat-webview-out$/m);
		assert.match(renderingSource, /createMermaidErrorElement/);
		assert.match(renderingSource, /function isAbortError\(error: unknown\)/);
		assert.match(renderingSource, /if \(isAbortError\(error\)\) \{\s*throw error;\s*\}[\s\S]*markVsCodeContextAsError\(mermaidContainer\);[\s\S]*writeOut\(mermaidContainer, createMermaidErrorElement\(error\)\.outerHTML, true\);/);
		assert.match(renderingSource, /renderMermaidBlocksInElement/);
		assert.ok(!fs.existsSync(path.join(extensionPath, 'src', 'chatOutputRenderer.ts')));
		assert.ok(!fs.existsSync(path.join(extensionPath, 'preview-src', 'chat')));
		for (const retainedPath of [
			'preview-src/diagram-preview/index.ts',
			'preview-src/diagram-preview/mermaidWebview.ts',
			'preview-src/markdown/index.ts',
			'preview-src/notebook/index.ts',
			'ThirdPartyNotices.txt'
		]) {
			assert.ok(fs.existsSync(path.join(extensionPath, retainedPath)), `Missing retained Mermaid component: ${retainedPath}`);
		}
	});

	test('pins bundled component licenses and toolchain provenance', () => {
		const inventory = readJson<{
			components?: readonly {
				id?: string;
				version?: string;
				source?: string;
				modificationStatus?: string;
				spdxIdentifier?: string;
				copyrightNotice?: string;
				archive?: string;
				sha256?: string;
				contentSha256?: string;
				packagedContentSha256?: string;
				licensePath?: string;
				archiveLicenseEntry?: string;
				packageInventory?: string;
				correspondingSource?: string;
				thirdPartyNoticesPath?: string;
			}[];
		}>(path.join(repositoryRoot, 'resources', 'oi-defaults', 'BUNDLED-COMPONENTS.json'));
		const components = inventory.components ?? [];
		assert.deepStrictEqual(components.map(component => component.id), [
			'code-oss',
			'electron',
			'becoder.runner',
			'vscode.vscode-theme-seti',
			'becoder.becoder-setup',
			'becoder.gcc-diagnostics',
			'llvm-vs-code-extensions.vscode-clangd',
			'adpyke.codesnap',
			'mathematic.vscode-pdf',
			'becoder.one-monokai',
			'vscode.cpp',
			'vscode.mermaid-markdown-features',
			'ms-ceintl.vscode-language-pack-zh-hans',
			'clangd-windows',
			'becoder-ucrt64'
		]);
		for (const component of components) {
			assert.ok(component.id && component.version && component.source);
			assert.ok(component.modificationStatus && component.spdxIdentifier && component.copyrightNotice, `Incomplete redistribution metadata for ${component.id}`);
			if (component.licensePath) {
				const licensePath = path.join(repositoryRoot, component.licensePath);
				const licenseStat = fs.statSync(licensePath);
				assert.ok(licenseStat.isDirectory() ? fs.readdirSync(licensePath).length > 0 : licenseStat.size > 0, `Missing license for ${component.id}`);
			}
		}
		const clangd = components.find(component => component.id === 'clangd-windows');
		assert.strictEqual(clangd?.sha256, 'ce54f16e0b4fd76d450eeda9664420b195360b73febcfe40e661108fa57f2ce1');
		assert.strictEqual(clangd?.archiveLicenseEntry, 'clangd_22.1.6/LICENSE.TXT');
		const electron = components.find(component => component.id === 'electron');
		assert.strictEqual(electron?.version, '42.6.0');
		assert.strictEqual(electron?.spdxIdentifier, 'MIT');
		assert.strictEqual(electron?.licensePath, 'licenses/MIT-Electron.txt');
		assert.match(fs.readFileSync(path.join(repositoryRoot, electron.licensePath), 'utf8'), /Copyright \(c\) Electron contributors/);
		const ucrt64 = components.find(component => component.id === 'becoder-ucrt64');
		assert.strictEqual(ucrt64?.sha256, '21d04b7cda3889a7946e9049ef039c001373d966e53ebe59493e5b28cbe3c6a2');
		assert.strictEqual(ucrt64?.packageInventory, 'resources/oi-defaults/toolchains/ucrt64-packages.json');
		assert.ok(ucrt64?.correspondingSource);
		const languagePack = components.find(component => component.id === 'ms-ceintl.vscode-language-pack-zh-hans');
		const mermaid = components.find(component => component.id === 'vscode.mermaid-markdown-features');
		assert.strictEqual(mermaid?.version, '10.0.0');
		assert.strictEqual(mermaid?.licensePath, 'licenses/MIT-VSCode.txt');
		assert.strictEqual(mermaid?.thirdPartyNoticesPath, 'extensions/mermaid-markdown-features/ThirdPartyNotices.txt');
		assert.ok(fs.statSync(path.join(repositoryRoot, mermaid.thirdPartyNoticesPath)).size > 0);
		assert.strictEqual(languagePack?.version, '1.130.2026072017');
		assert.strictEqual(languagePack?.sha256, '265536b3db2bdcc01e764679da8fb6d7ceaa7a7f3bb35c8b53dd0db51e8707f0');
		assert.strictEqual(languagePack?.contentSha256, '0f2b889acd2d1d09eaca3e17473f54b450fd593aaba0857fd8efd6888c13058a');
		assert.strictEqual(computeDirectoryFilesSha256(path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans')), languagePack?.contentSha256);
		assert.strictEqual(languagePack?.packagedContentSha256, '4c207c39074d08ab54b215ee34a7c18d51dabb4e348f2fe66f28d2004a83d685');
		assert.strictEqual(computeDirectoryFilesSha256(
			path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans'),
			(relativePath, contents) => relativePath.endsWith('.json') ? Buffer.from(JSON.stringify(JSON.parse(contents.toString('utf8')))) : contents,
		), languagePack?.packagedContentSha256);
		const gitAttributes = fs.readFileSync(path.join(repositoryRoot, '.gitattributes'), 'utf8');
		assert.match(gitAttributes, /^extensions\/MS-CEINTL\.vscode-language-pack-zh-hans\/\*\* -text whitespace=-trailing-space$/m);
		const languagePackManifest = readJson<{
			version?: string;
			engines?: { vscode?: string };
			contributes?: { localizations?: readonly { translations?: readonly { id?: string; path?: string }[] }[] };
		}>(path.join(repositoryRoot, 'extensions', 'MS-CEINTL.vscode-language-pack-zh-hans', 'package.json'));
		assert.strictEqual(languagePackManifest.version, languagePack?.version);
		assert.strictEqual(languagePackManifest.engines?.vscode, '^1.130.0');
		const languagePackTranslations = languagePackManifest.contributes?.localizations?.flatMap(localization => localization.translations ?? []) ?? [];
		for (const removedTranslationId of [
			'ms-vscode.js-debug',
			'vscode.debug-auto-launch',
			'vscode.debug-server-ready',
			'vscode.git',
			'vscode.git-base',
			'vscode.github',
			'vscode.mermaid-chat-features',
			'vscode.prompt',
			'vscode.terminal-suggest'
		]) {
			assert.ok(!languagePackTranslations.some(translation => translation.id === removedTranslationId), `Unsupported language-pack contribution remains: ${removedTranslationId}`);
			assert.ok(!fs.existsSync(path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans', 'translations', 'extensions', `${removedTranslationId}.i18n.json`)), `Unsupported language-pack translation remains: ${removedTranslationId}`);
		}
		assert.ok(languagePackTranslations.some(translation => translation.id === 'vscode.mermaid-markdown-features'));
		assert.ok(fs.existsSync(path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans', 'translations', 'extensions', 'vscode.mermaid-markdown-features.i18n.json')));
		const mainTranslation = readJson<{ contents?: Record<string, Record<string, string>> }>(
			path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans', 'translations', 'main.i18n.json'));
		const translatedModules = Object.keys(mainTranslation.contents ?? {});
		for (const forbiddenModulePattern of [
			/^vs\/sessions\//,
			/^vs\/platform\/(?:agentHost|agentPlugins|defaultAccount|localTranscription|mcp|networkFilter|otel|sandbox|webContentExtractor)\//,
			/^vs\/workbench\/contrib\/(?:agentsVoice|chat|debug|editTelemetry|inlineChat|mcp|remoteCodingAgents|replNotebook|welcomeAgentSessions|welcomeOnboarding)\//,
			/^vs\/workbench\/services\/(?:agentHost|aiEmbeddingVector|aiRelatedInformation|aiSettingsSearch|chat|mcp)\//,
			/(?:^|\/)(?:mainThread|extHost)(?:Agent|Ai|Chat|CodeMapper|Debug|Embedding|LanguageModel|Mcp)/i,
			/^vs\/platform\/git\//,
			/^vs\/workbench\/contrib\/(?:git|scm)\//,
			/^vs\/workbench\/contrib\/terminalContrib\/(?:inlineHint|suggest)\//,
			/(?:^|\/)(?:mainThread|extHost)(?:GitExtensionService|QuickDiff|SCM)$/
		]) {
			assert.ok(!translatedModules.some(moduleName => forbiddenModulePattern.test(moduleName)), `Unsupported language-pack module remains: ${forbiddenModulePattern}`);
		}
		const imageCarouselTranslations = mainTranslation.contents?.['vs/workbench/contrib/imageCarousel/browser/imageCarousel.contribution'] ?? {};
		assert.strictEqual(imageCarouselTranslations.openImagesInCarousel, '\u5728\u56fe\u50cf\u9884\u89c8\u4e2d\u6253\u5f00');
		const updateTranslations = mainTranslation.contents?.['vs/platform/update/common/update.config.contribution'] ?? {};
		assert.strictEqual(updateTranslations.updateMode, '配置 BeCoder 是否接收应用程序自动更新。更新将从 BeCoder 更新服务获取。');
		assert.strictEqual(updateTranslations.default, '启用自动更新检查。BeCoder 将定期自动检查更新。');
		assert.strictEqual(updateTranslations.enableWindowsBackgroundUpdates, '启用在后台下载和安装新的 BeCoder 版本。');
		assert.strictEqual(updateTranslations.showReleaseNotes, '在更新后显示发行说明。发行说明将从 BeCoder 更新服务获取。');
		assert.ok(!('imageCarousel.chat.enabled' in imageCarouselTranslations));
		assert.ok(!('openImageInCarousel' in imageCarouselTranslations));
		const packageVerifier = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-package.ps1'), 'utf8');
		const languagePackVerifier = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-language-pack.ts'), 'utf8');
		assert.match(packageVerifier, /verify-becoder-language-pack\.ts/);
		assert.doesNotMatch(packageVerifier, /main\.i18n\.json'\) -Raw[^\n]*ConvertFrom-Json/);
		assert.match(languagePackVerifier, /Object\.hasOwn\(imageCarouselTranslations, 'imageCarousel\.chat\.enabled'\)/);
		const authenticationTranslations = mainTranslation.contents?.['vs/workbench/api/browser/mainThreadAuthentication'] ?? {};
		for (const removedAuthenticationKey of ['xaaResourceSecretPlaceholder', 'xaaResourceSecretPrompt', 'xaaResourceSecretTitle']) {
			assert.ok(!(removedAuthenticationKey in authenticationTranslations), `MCP-specific authentication translation remains: ${removedAuthenticationKey}`);
		}
		for (const [moduleName, removedKeys] of [
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
		] as const) {
			const moduleTranslations = mainTranslation.contents?.[moduleName] ?? {};
			for (const removedKey of removedKeys) {
				assert.ok(!(removedKey in moduleTranslations), `Removed Stage 4.6 translation remains: ${moduleName}.${removedKey}`);
			}
		}
		assert.doesNotMatch(mainTranslation.contents?.['vs/platform/list/browser/listService']?.multiSelectModifier ?? '', /\bscm\b|\u6e90\u4ee3\u7801\u7ba1\u7406/i);
		const searchTranslations = mainTranslation.contents?.['vs/workbench/contrib/search/browser/search.contribution'] ?? {};
		assert.strictEqual(typeof searchTranslations['search.defaultViewMode.list'], 'string');
		assert.strictEqual(typeof searchTranslations['search.defaultViewMode.tree'], 'string');
		assert.ok(!('scm.defaultViewMode.list' in searchTranslations));
		assert.ok(!('scm.defaultViewMode.tree' in searchTranslations));
		assert.strictEqual(
			mainTranslation.contents?.['vs/workbench/contrib/issue/browser/baseIssueReporterService']?.internalPreviewMessage,
			'\u5982\u679c\u8bca\u65ad\u65e5\u5fd7\u5305\u542b\u79c1\u4eba\u4fe1\u606f\uff1a'
		);

		const packages = readJson<{
			archiveSha256?: string;
			licenseFilesRoot?: string;
			recipeFilesRoot?: string;
			evidence?: { retainedLicenseFileCount?: number; retainedRecipeFileCount?: number };
			packages?: readonly { name?: string; version?: string; license?: string; recipe?: string }[];
			auxiliaryPackageSources?: readonly { name?: string; version?: string; license?: string; recipe?: string }[];
			licenseMappings?: Record<string, readonly string[]>;
			recipes?: Record<string, { commit?: string; pkgbuildSha256?: string; filesSha256?: string }>;
			unownedArchiveEntries?: readonly string[];
		}>(path.join(repositoryRoot, 'resources', 'oi-defaults', 'toolchains', 'ucrt64-packages.json'));
		assert.strictEqual(packages.archiveSha256, ucrt64?.sha256);
		assert.strictEqual(packages.licenseFilesRoot, 'resources/oi-defaults/toolchains/ucrt64-licenses');
		const retainedLicenseFiles = fs.readdirSync(path.join(repositoryRoot, packages.licenseFilesRoot), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
		assert.strictEqual(retainedLicenseFiles.length, packages.evidence?.retainedLicenseFileCount);
		assert.strictEqual(retainedLicenseFiles.length, 41);
		assert.strictEqual(packages.recipeFilesRoot, 'resources/oi-defaults/toolchains/ucrt64-sources/recipes');
		const retainedRecipeFiles = fs.readdirSync(path.join(repositoryRoot, packages.recipeFilesRoot), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
		assert.strictEqual(retainedRecipeFiles.length, packages.evidence?.retainedRecipeFileCount);
		assert.strictEqual(retainedRecipeFiles.length, 64);
		assert.strictEqual(packages.packages?.length, 17);
		assert.strictEqual(packages.auxiliaryPackageSources?.length, 0);
		assert.strictEqual(new Set(packages.packages?.map(pkg => pkg.name)).size, 17);
		const recipeRoot = path.join(repositoryRoot, packages.recipeFilesRoot);
		const recipeDirectoryNames = fs.readdirSync(recipeRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
		assert.deepStrictEqual(recipeDirectoryNames, Object.keys(packages.recipes ?? {}).sort());
		for (const [recipeName, recipe] of Object.entries(packages.recipes ?? {})) {
			assert.match(recipe.filesSha256 ?? '', /^[0-9a-f]{64}$/);
			assert.strictEqual(computeDirectoryFilesSha256(path.join(recipeRoot, recipeName)), recipe.filesSha256, `Retained recipe files changed for ${recipeName}`);
		}
		for (const pkg of [...(packages.packages ?? []), ...(packages.auxiliaryPackageSources ?? [])]) {
			assert.ok(pkg.name && pkg.version && pkg.license && pkg.recipe);
			const recipe = packages.recipes?.[pkg.recipe];
			assert.match(recipe?.commit ?? '', /^[0-9a-f]{40}$/);
			assert.match(recipe?.pkgbuildSha256 ?? '', /^[0-9a-f]{64}$/);
			const pkgbuildPath = path.join(recipeRoot, pkg.recipe, 'PKGBUILD');
			assert.strictEqual(createHash('sha256').update(fs.readFileSync(pkgbuildPath)).digest('hex'), recipe?.pkgbuildSha256);
			const licensePaths = packages.licenseMappings?.[pkg.name];
			assert.ok(licensePaths?.length, `Missing license mapping for ${pkg.name}`);
			for (const relativeLicensePath of licensePaths) {
				assert.ok(fs.statSync(path.join(repositoryRoot, packages.licenseFilesRoot, relativeLicensePath)).size > 0, `Missing mapped license for ${pkg.name}: ${relativeLicensePath}`);
			}
		}
		assert.deepStrictEqual(packages.unownedArchiveEntries, [
			'ucrt64/include/c++/16.2.0/x86_64-w64-mingw32/bits/debugger.h',
			'ucrt64/include/c++/16.2.0/x86_64-w64-mingw32/bits/stdc++.h.gch',
			'ucrt64/x86_64-w64-mingw32/bin/libiconv-2.dll',
			'ucrt64/x86_64-w64-mingw32/bin/libintl-8.dll',
			'ucrt64/x86_64-w64-mingw32/bin/libwinpthread-1.dll',
			'ucrt64/x86_64-w64-mingw32/bin/libzstd.dll',
			'ucrt64/x86_64-w64-mingw32/bin/zlib1.dll'
		]);

		const notices = fs.readFileSync(path.join(repositoryRoot, 'ThirdPartyNotices.txt'), 'utf8');
		assert.match(notices, /BeCoder Runner 0\.3\.0/);
		assert.match(notices, /CodeSnap 1\.3\.4[\s\S]*Copyright \(c\) 2019 Adrien Pyke/);
		assert.match(notices, /Mathematic PDF Viewer 0\.2\.5 with Mozilla PDF\.js 6\.2\.108[\s\S]*extensions\/mathematic\.vscode-pdf\/ThirdPartyNotices\.txt/);
		assert.match(notices, /Mermaid Markdown Features 10\.0\.0[\s\S]*extensions\/mermaid-markdown-features\/ThirdPartyNotices\.txt/);
		assert.match(notices, /clangd 22\.1\.6 Windows binary bundle/);
		assert.match(notices, /BeCoder UCRT64 GCC 16\.2\.0 bundle/);
	});

	test('bundles protected Simplified Chinese and keeps BeCoder UI bilingual', () => {
		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8');
		assert.match(mainSource, /resolveUserLocale\(args\['locale'\], argvConfig\.locale, 'zh-cn'\)/);

		const nlsSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'base', 'node', 'nls.ts'), 'utf8');
		assert.match(nlsSource, /MS-CEINTL\.vscode-language-pack-zh-hans/);
		assert.match(nlsSource, /languagePacks\['zh-cn'\] = builtInPack/);

		const setupManifest = readJson<{
			contributes?: { configuration?: { properties?: Record<string, { default?: unknown; enum?: unknown; scope?: unknown; order?: unknown }> } };
		}>(path.join(extensionsRoot, 'becoder.setup', 'package.json'));
		const displayLanguage = setupManifest.contributes?.configuration?.properties?.['becoder.displayLanguage'];
		assert.deepStrictEqual(displayLanguage?.enum, ['zh-cn', 'en']);
		assert.strictEqual(displayLanguage?.default, 'zh-cn');
		assert.strictEqual(displayLanguage?.scope, 'application');
		assert.strictEqual(displayLanguage?.order, 0);

		for (const extensionFolder of ['becoder.setup', 'danielpinto8zz6.c-cpp-compile-run', 'becoder.gcc-diagnostics']) {
			assertSameLocalizationKeys(extensionFolder);
		}

		const setupSettingsSource = fs.readFileSync(path.join(extensionsRoot, 'becoder.setup', 'src', 'simpleSettings.ts'), 'utf8');
		assert.match(setupSettingsSource, /executeCommand\('workbench\.action\.openSettings'\)/);
		assert.doesNotMatch(setupSettingsSource, /@ext:becoder\.becoder-setup/);
		const displayLanguageSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'becoder', 'electron-browser', 'beCoderDisplayLanguage.contribution.ts'), 'utf8');
		assert.match(displayLanguageSource, /ConfigurationTarget\.USER_LOCAL/);
		assert.match(displayLanguageSource, /BeCoderSimplifiedChineseLanguagePackId/);
		assert.match(displayLanguageSource, /await this\.extensionService\.whenInstalledExtensionsRegistered\(\)/);
		assert.ok(displayLanguageSource.indexOf('whenInstalledExtensionsRegistered()') < displayLanguageSource.indexOf('await this.updateSetting(toBeCoderDisplayLanguage(Language.value()))'));
		assert.match(displayLanguageSource, /BeCoderSetupExtensionId/);
		assert.match(displayLanguageSource, /this\.logService\.error/);
		assert.match(displayLanguageSource, /setLocale\(languagePack, false, \(\) => this\.controller\.isLatestRequest\(language\)\)/);

		const localeServiceSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'localization', 'electron-browser', 'localeService.ts'), 'utf8');
		assert.match(localeServiceSource, /cancelButton: localize\('later', "Later"\)/);
		assert.ok(localeServiceSource.indexOf('writeLocaleValue(locale)') < localeServiceSource.indexOf('showRestartDialog(languagePackItem.label)'));

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /isProtectedExtensionId\(extensionIdentifier\.id, this\.productService\.protectedExtensions\)/);
		const updateConfigurationSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'update', 'common', 'update.config.contribution.ts'), 'utf8');
		assert.match(updateConfigurationSource, /configurationRegistry\.registerConfigurations\(product\.updateUrl \? \[\{/);
		assert.match(updateConfigurationSource, /new BeCoder versions in the background/);
		assert.match(updateConfigurationSource, /BeCoder update service/);
		assert.doesNotMatch(updateConfigurationSource, /new VS Code versions|Microsoft online service|Code will check for updates/);
	});

	test('owns a protected offline read-only PDF problem statement viewer', () => {
		const extensionPath = path.join(extensionsRoot, 'mathematic.vscode-pdf');
		const manifest = readJson<{
			name?: string;
			publisher?: string;
			version?: string;
			main?: string;
			engines?: { vscode?: string };
			activationEvents?: readonly string[];
			contributes?: {
				configurationDefaults?: Record<string, unknown>;
				customEditors?: readonly { viewType?: string; selector?: readonly { filenamePattern?: string }[] }[];
				configuration?: { properties?: Record<string, { enum?: readonly number[] }> };
			};
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'mathematic.vscode-pdf');
		assert.strictEqual(manifest.version, '0.2.5');
		assert.strictEqual(manifest.main, './src/extension.js');
		assert.strictEqual(manifest.engines?.vscode, '^1.130.0');
		assert.deepStrictEqual(manifest.activationEvents, ['onCustomEditor:pdf.view']);
		assert.deepStrictEqual(manifest.contributes?.configurationDefaults, {
			'workbench.editorAssociations': { '*.pdf': 'pdf.view' }
		});
		assert.deepStrictEqual(manifest.contributes?.customEditors, [{
			viewType: 'pdf.view',
			displayName: '%becoder.editorName%',
			priority: 'default',
			selector: [{ filenamePattern: '*.pdf' }]
		}]);
		assert.deepStrictEqual(manifest.contributes?.configuration?.properties?.['pdf.sidebarViewOnLoad'].enum, [0, 1, 2]);
		assertSameLocalizationKeys('mathematic.vscode-pdf');

		const extensionSource = fs.readFileSync(path.join(extensionPath, 'src', 'extension.js'), 'utf8');
		assert.match(extensionSource, /registerCustomEditorProvider/);
		assert.match(extensionSource, /localResourceRoots: \[resourceRoot, this\.extensionRoot\]/);
		assert.match(extensionSource, /path\.extname\(relativePath\)\.toLowerCase\(\) !== '\.pdf'/);
		assert.doesNotMatch(extensionSource, /globalState|showInformationMessage|openExternal|writeFile|createWriteStream/);

		const viewerSource = fs.readFileSync(path.join(extensionPath, 'assets', 'main.mjs'), 'utf8');
		for (const disabledOption of [
			"supportsDownloading', false",
			"supportsPrinting', false",
			"annotationEditorMode', -1",
			"annotationMode', 1",
			"enableScripting', false",
			"enableXfa', false",
			"enableSignatureEditor', false"
		]) {
			assert.ok(viewerSource.includes(disabledOption), `PDF viewer does not enforce ${disabledOption}`);
		}
		assert.doesNotMatch(viewerSource, /sandboxBundleSrc|openExternal|fetch\(/);
		assert.match(viewerSource, /event\.preventDefault\(\)/);

		for (const forbiddenPayload of [
			'assets/pdf.js/build/pdf.sandbox.mjs',
			'assets/pdf.js/web/wasm/quickjs-eval.wasm',
			'assets/pdf.js/web/wasm/quickjs-eval.js',
			'assets/pdf.js/web/compressed.tracemonkey-pldi-09.pdf',
			'assets/pdf.js/web/debugger.mjs',
			'assets/pdf.js/web/debugger.css'
		]) {
			assert.ok(!fs.existsSync(path.join(extensionPath, ...forbiddenPayload.split('/'))), `PDF viewer retains ${forbiddenPayload}`);
		}
		for (const requiredLicense of [
			'LICENSE',
			'ThirdPartyNotices.txt',
			'assets/pdf.js/LICENSE',
			'assets/pdf.js/web/cmaps/LICENSE',
			'assets/pdf.js/web/iccs/LICENSE',
			'assets/pdf.js/web/standard_fonts/LICENSE_LIBERATION',
			'assets/pdf.js/web/standard_fonts/LICENSE_FOXIT',
			'assets/pdf.js/web/wasm/LICENSE_OPENJPEG',
			'assets/pdf.js/web/wasm/LICENSE_JBIG2',
			'assets/pdf.js/web/wasm/LICENSE_QCMS'
		]) {
			assert.ok(fs.statSync(path.join(extensionPath, ...requiredLicense.split('/'))).size > 0, `PDF viewer is missing ${requiredLicense}`);
		}
	});

	test('keeps a single C++ TextMate grammar owner', () => {
		const contributors: Array<{ extension: string; grammarPath: string | undefined }> = [];

		for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const manifestPath = path.join(extensionsRoot, entry.name, 'package.json');
			if (!fs.existsSync(manifestPath)) {
				continue;
			}
			const manifest = readJson<IExtensionManifest>(manifestPath);
			for (const grammar of manifest.contributes?.grammars ?? []) {
				if (grammar.scopeName === 'source.cpp') {
					contributors.push({ extension: entry.name, grammarPath: grammar.path });
				}
			}
		}

		assert.deepStrictEqual(contributors, [
			{ extension: 'cpp', grammarPath: './syntaxes/cpp.tmLanguage.json' }
		]);
	});

	test('pins the selected Better C++ Syntax grammar snapshot', () => {
		const expectedVersion = 'https://github.com/jeff-hykin/better-cpp-syntax/commit/071dd6ecc9eda347bd84c8aa0e0b557396cb6a40';
		for (const file of ['cpp.tmLanguage.json', 'cpp.embedded.macro.tmLanguage.json']) {
			const grammar = readJson<{ version?: string }>(path.join(extensionsRoot, 'cpp', 'syntaxes', file));
			assert.strictEqual(grammar.version, expectedVersion);
		}

		const manifest = readJson<{ registrations?: Array<{ component?: { git?: { name?: string; commitHash?: string } }; license?: string }> }>(
			path.join(extensionsRoot, 'cpp', 'cgmanifest.json'));
		const registration = manifest.registrations?.find(entry => entry.component?.git?.name === 'jeff-hykin/better-cpp-syntax');
		assert.strictEqual(registration?.component?.git?.commitHash, '071dd6ecc9eda347bd84c8aa0e0b557396cb6a40');
		assert.strictEqual(registration?.license, 'MIT');
	});

	test('owns One Monokai with bounded C/C++ semantic refinement', () => {
		const extensionPath = path.join(extensionsRoot, 'becoder.one-monokai');
		const manifest = readJson<IExtensionManifest>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.one-monokai');
		assert.deepStrictEqual(manifest.contributes?.themes, [{
			id: 'BeCoder One Monokai',
			label: 'BeCoder One Monokai',
			uiTheme: 'vs-dark',
			path: './themes/OneMonokai-color-theme.json'
		}]);
		assert.strictEqual(
			manifest.contributes?.configurationDefaults?.['[c][cpp][cuda-cpp]']?.['editor.semanticHighlighting.enabled'],
			true);

		const theme = readJson<{
			semanticHighlighting?: boolean;
			semanticTokenColors?: Record<string, unknown>;
		}>(
			path.join(extensionPath, 'themes', 'OneMonokai-color-theme.json'));
		assert.strictEqual(theme.semanticHighlighting, true);
		assert.strictEqual(theme.semanticTokenColors?.['function:cpp'], '#98c379');
		assert.strictEqual(theme.semanticTokenColors?.['operator.userDefined:cpp'], '#98c379');
		assert.strictEqual(theme.semanticTokenColors?.['type:cpp'], '#61afef');
		for (const deducedType of ['type', 'class', 'interface', 'struct', 'enum', 'typeParameter', 'concept']) {
			assert.strictEqual(theme.semanticTokenColors?.[`${deducedType}.deduced:cpp`], '#56b6c2');
		}
		assert.deepStrictEqual(theme.semanticTokenColors?.['parameter:cpp'], {
			foreground: '#d19a66',
			fontStyle: 'italic'
		});
		assert.strictEqual(theme.semanticTokenColors?.['variable:cpp'], '#abb2bf');
		assert.strictEqual(theme.semanticTokenColors?.['variable.defaultLibrary:cpp'], '#61afef');
		for (const forbiddenType of ['keyword', 'operator', 'number', 'string', 'comment']) {
			assert.ok(!Object.keys(theme.semanticTokenColors ?? {}).some(selector => selector.startsWith(`${forbiddenType}:`)));
		}
		assert.ok(fs.statSync(path.join(extensionPath, 'LICENSE')).size > 0);

		const themeServiceSource = fs.readFileSync(
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'themes', 'common', 'workbenchThemeService.ts'), 'utf8');
		assert.match(themeServiceSource, /COLOR_THEME_DARK = 'BeCoder One Monokai'/);
		const product = readJson<{ onboardingThemes?: Array<{ id?: string; themeId?: string }> }>(
			path.join(repositoryRoot, 'product.json'));
		assert.ok(product.onboardingThemes?.some(theme =>
			theme.id === 'becoder-one-monokai' && theme.themeId === 'BeCoder One Monokai'));
	});

	test('keeps clangd inside the approved Stage 4.1 capability boundary', () => {
		const extensionPath = path.join(extensionsRoot, 'llvm-vs-code-extensions.vscode-clangd');
		const manifest = readJson<IExtensionManifest>(path.join(extensionPath, 'package.json'));
		const properties = manifest.contributes?.configuration?.properties ?? {};
		assert.deepStrictEqual(properties, {});
		assert.deepStrictEqual(manifest.contributes?.commands ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.colors ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.keybindings ?? [], []);
		assert.deepStrictEqual(manifest.contributes?.menus ?? {}, {});
		assert.deepStrictEqual(manifest.contributes?.views ?? {}, {});
		assert.ok(!manifest.categories?.includes('Linters'));
		assert.ok(!('@clangd/install' in (manifest.dependencies ?? {})));
		assert.ok(!('clang-format' in (manifest.devDependencies ?? {})));
		assert.deepStrictEqual(
			manifest.contributes?.configurationDefaults?.['[c][cpp][cuda-cpp][objective-c][objective-cpp]'],
			{
				'editor.defaultFormatter': 'llvm-vs-code-extensions.vscode-clangd',
				'editor.formatOnSave': false,
				'editor.formatOnType': false
			});

		for (const file of [
			'ast.ts',
			'config-file-watcher.ts',
			'config.ts',
			'file-status.ts',
			'inlay-hints.ts',
			'memory-usage.ts',
			'open-config.ts',
			'semantic-tokens-cache.ts',
			'switch-source-header.ts',
			'type-hierarchy.ts'
		]) {
			assert.ok(!fs.existsSync(path.join(extensionPath, 'src', file)));
		}
		const contextSource = fs.readFileSync(path.join(extensionPath, 'src', 'clangd-context.ts'), 'utf8');
		assert.match(contextSource, /approvedTextDocumentFeatureMethods/);
		assert.match(contextSource, /approvedStaticFeatureNames/);
		assert.match(contextSource, /compilationDatabaseChanges/);
		assert.match(contextSource, /configureManagedDocumentBeforeOpen/);
		assert.match(contextSource, /handleDiagnostics: \(uri, _diagnostics, next\) => next\(uri, \[\]\)/);
		assert.match(contextSource, /provideDocumentSemanticTokens/);
		assert.doesNotMatch(contextSource, /provideDocumentRangeSemanticTokens/);
		assert.match(contextSource, /reclassifyCallableVariables/);
		const callableTokensSource = fs.readFileSync(
			path.join(extensionPath, 'src', 'callable-semantic-tokens.ts'), 'utf8');
		assert.match(callableTokensSource, /hasLambdaInitializer/);
		assert.match(callableTokensSource, /hasFunctionType/);
		assert.doesNotMatch(callableTokensSource, /writeFile|mkdir|workspaceState|globalState|onDidChangeSemanticTokens/);
		assert.match(contextSource, /provideDocumentSemanticTokensEdits/);
		assert.match(contextSource, /SemanticTokensRequest\.type/);
		assert.doesNotMatch(contextSource, /new vscode\.SemanticTokensEdits|asSemanticTokensEdits|semanticTokensCache/);
		const inactiveRegionsSource = fs.readFileSync(path.join(extensionPath, 'src', 'inactive-regions.ts'), 'utf8');
		assert.match(inactiveRegionsSource, /'textDocument\/inactiveRegions'/);
		assert.match(inactiveRegionsSource, /opacity: '0\.55'/);
		const formattingSource = fs.readFileSync(path.join(extensionPath, 'src', 'formatting.ts'), 'utf8');
		assert.match(formattingSource, /return `0:\$\{path\.sep\}`/);
		assert.doesNotMatch(formattingSource, /writeFile|mkdir/);
		const toolchainSource = fs.readFileSync(path.join(extensionPath, 'src', 'becoder-toolchain.ts'), 'utf8');
		assert.match(toolchainSource, /'-std=c17'/);
		assert.match(toolchainSource, /'-std=c\+\+20'/);
		for (const apiFile of [
			path.join(extensionPath, 'src', 'api.ts'),
			path.join(extensionPath, 'api', 'vscode-clangd.d.ts'),
			path.join(extensionPath, 'api', 'package.json')
		]) {
			assert.ok(!fs.existsSync(apiFile));
		}
		const readme = fs.readFileSync(path.join(extensionPath, 'README.md'), 'utf8');
		assert.match(readme, /Visible C\/C\+\+ diagnostics belong to BeCoder's bundled GCC/);
		assert.doesNotMatch(readme, /download it|compile_commands\.json file|Format on Type/);
		const lockfile = readJson<{ packages?: Record<string, unknown> }>(
			path.join(extensionPath, 'package-lock.json'));
		assert.ok(!('node_modules/@clangd/install' in (lockfile.packages ?? {})));
		assert.ok(!('node_modules/clang-format' in (lockfile.packages ?? {})));
		const compatibilityDependencies = (lockfile as { dependencies?: Record<string, unknown> }).dependencies ?? {};
		assert.ok(!('@clangd/install' in compatibilityDependencies));
		assert.ok(!('clang-format' in compatibilityDependencies));
		const vscodeIgnore = fs.readFileSync(path.join(extensionPath, '.vscodeignore'), 'utf8');
		assert.doesNotMatch(vscodeIgnore, /!\*\.png|!doc-assets/);

		const setupSource = fs.readFileSync(path.join(extensionsRoot, 'becoder.setup', 'src', 'extension.ts'), 'utf8');
		assert.doesNotMatch(setupSource, /createDefaultClangdConfig|createDefaultClangFormatConfig|migrateWorkspaceClangdConfig/);
		assert.doesNotMatch(setupSource, /function configureClangd/);
		assert.match(setupSource, /removeLegacyClangdSettings/);
		assert.doesNotMatch(setupSource, /editor\.unicodeHighlight/);
		const setupManifest = readJson<{
			contributes?: { configurationDefaults?: Record<string, unknown> };
		}>(path.join(extensionsRoot, 'becoder.setup', 'package.json'));
		const setupDefaults = setupManifest.contributes?.configurationDefaults ?? {};
		assert.deepStrictEqual({
			nonBasicASCII: setupDefaults['editor.unicodeHighlight.nonBasicASCII'],
			ambiguousCharacters: setupDefaults['editor.unicodeHighlight.ambiguousCharacters'],
			invisibleCharacters: setupDefaults['editor.unicodeHighlight.invisibleCharacters']
		}, {
			nonBasicASCII: false,
			ambiguousCharacters: false,
			invisibleCharacters: true
		});
		assert.ok(!Object.hasOwn(setupDefaults, 'files.exclude'));
		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.doesNotMatch(mainSource, /createBeCoderClangdConfig|createBeCoderClangFormatConfig/);
		assert.doesNotMatch(mainSource, /'clangd\.(?:path|arguments|fallbackFlags|enable)'/);
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'first-run.html')));
		assert.ok(!fs.existsSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'first-run-preload.js')));
	});

	test('owns Stage 4.2 diagnostics in a private bundled GCC extension', () => {
		const extensionPath = path.join(extensionsRoot, 'becoder.gcc-diagnostics');
		const manifest = readJson<{
			name?: string;
			publisher?: string;
			main?: string;
			extensionDependencies?: readonly string[];
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.gcc-diagnostics');
		assert.strictEqual(manifest.main, './out/extension.js');
		assert.deepStrictEqual(manifest.extensionDependencies, ['becoder.becoder-setup']);

		const runnerSource = fs.readFileSync(path.join(extensionPath, 'src', 'compilerRunner.ts'), 'utf8');
		for (const argument of [
			"'-fsyntax-only'",
			"'-O2'",
			"'-x'",
			"'-std=c17'",
			"'-std=c++20'",
			"'-DDEBUGER_H'",
			"'-I'",
			"'-fdiagnostics-format=json'",
			"'-fdiagnostics-color=never'",
			"'-iquote'"
		]) {
			assert.ok(runnerSource.includes(argument), `Missing GCC diagnostics argument ${argument}`);
		}
		assert.doesNotMatch(runnerSource, /['"]-(?:Wall|Werror|pedantic)['"]/);
		assert.ok(fs.existsSync(path.join(extensionPath, 'resources', 'diagnostic-include', 'bits', 'debugger.h')));
		assert.match(runnerSource, /spawn\(compilerPath/);
		assert.match(runnerSource, /shell: false/);

		const extensionSource = fs.readFileSync(path.join(extensionPath, 'src', 'extension.ts'), 'utf8');
		assert.match(extensionSource, /createDiagnosticCollection\(diagnosticSource\)/);
		assert.match(extensionSource, /DiagnosticSeverity\.Error/);
		assert.doesNotMatch(extensionSource, /createTerminal|showErrorMessage|showWarningMessage|showInformationMessage/);
	});

	test('owns Stage 4.3 Runner as a shell-free BC pseudoterminal', () => {
		const extensionPath = path.join(extensionsRoot, 'danielpinto8zz6.c-cpp-compile-run');
		const manifest = readJson<{
			name?: string;
			publisher?: string;
			extensionDependencies?: readonly string[];
			capabilities?: { untrustedWorkspaces?: { supported?: boolean } };
			contributes?: {
				commands?: readonly { command?: string }[];
				menus?: Record<string, readonly { command?: string }[]>;
				keybindings?: readonly { key?: string; command?: string }[];
				configurationDefaults?: Record<string, unknown>;
			};
		}>(path.join(extensionPath, 'package.json'));
		assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.runner');
		assert.deepStrictEqual(manifest.extensionDependencies, ['becoder.becoder-setup']);
		assert.strictEqual(manifest.capabilities?.untrustedWorkspaces?.supported, false);
		assert.deepStrictEqual(manifest.contributes?.commands?.map(command => command.command), [
			'becoder.runner.openPanel',
			'becoder.runner.run',
			'becoder.runner.runWithInput'
		]);
		assert.deepStrictEqual(manifest.contributes?.menus?.['editor/title']?.map(item => item.command), [
			'becoder.runner.run',
			'becoder.runner.runWithInput'
		]);
		assert.strictEqual(manifest.contributes?.configurationDefaults?.['terminal.integrated.defaultProfile.windows'], 'BeCoder Runner');
		assert.strictEqual(manifest.contributes?.configurationDefaults?.['terminal.integrated.enablePersistentSessions'], false);
		assert.ok(!manifest.contributes?.keybindings?.some(keybinding => keybinding.key === 'ctrl+`'));
		const terminalContribution = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'terminal', 'browser', 'terminal.contribution.ts'), 'utf8');
		assert.match(terminalContribution, /id: TerminalCommandId\.Toggle,[\s\S]*primary: KeyMod\.CtrlCmd \| KeyCode\.Backquote/);

		const menuItemSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'actions', 'browser', 'menuEntryActionViewItem.ts'), 'utf8');
		assert.match(menuItemSource, /container\.dataset\.commandId = this\._menuItemAction\.id/);
		const partCss = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'browser', 'media', 'part.css'), 'utf8');
		assert.match(partCss, /\.monaco-workbench\.windows \{\s*--becoder-windows-window-controls-width:/);
		const knownStyleVariables = readJson<{ sizes?: readonly string[] }>(path.join(repositoryRoot, 'build', 'lib', 'stylelint', 'vscode-known-variables.json'));
		assert.ok(knownStyleVariables.sizes?.includes('--becoder-windows-window-controls-width'));
		for (const cssPath of [
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'browser', 'parts', 'editor', 'media', 'multieditortabscontrol.css'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'browser', 'parts', 'editor', 'media', 'singleeditortabscontrol.css')
		]) {
			const css = fs.readFileSync(cssPath, 'utf8');
			assert.match(css, /\.monaco-workbench\.windows [^{]*\.editor-group-container\.window-controls-overlay-right-host [^{]*\[data-command-id="becoder\.runner\.runWithInput"\] \{\s*margin-right: calc\(var\(--becoder-windows-window-controls-width\) - 56px\)/);
			assert.doesNotMatch(css, /custom-titlebar-hidden\.windows [^{]*\[data-command-id="becoder\.runner\.runWithInput"\]/);
		}

		const terminalSource = fs.readFileSync(path.join(extensionPath, 'src', 'bcTerminal.ts'), 'utf8');
		assert.match(terminalSource, /implements vscode\.Pseudoterminal/);
		assert.match(terminalSource, /osc633CommandFinished/);
		assert.match(terminalSource, /renderBcCommand/);
		const managerSource = fs.readFileSync(path.join(extensionPath, 'src', 'compile-run-manager.ts'), 'utf8');
		assert.match(managerSource, /createTerminal\(\{[\s\S]*pty: pseudoterminal/);
		assert.match(managerSource, /panelReadyMs = await pseudoterminal\.waitForOpen\(panelStartedAt\)/);
		assert.match(managerSource, /request\.exitCode = 1;[\s\S]*await this\.executor\.cancel\(\)/);
		assert.match(managerSource, /pendingPseudoterminals = new Set<BcTerminal>\(\)/);
		assert.match(managerSource, /terminals = new Map<BcTerminal, vscode\.Terminal>\(\)/);
		assert.doesNotMatch(managerSource, /previousTerminal[\s\S]*previousTerminal\.dispose\(\)/);
		assert.doesNotMatch(managerSource, /sendText|createTerminal\([^\{]/);
		const processSource = fs.readFileSync(path.join(extensionPath, 'src', 'runnerProcess.ts'), 'utf8');
		assert.match(processSource, /shell: false/);
		for (const argument of ['-O2', '-Wall', '-DDEBUG', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always']) {
			assert.ok(processSource.includes(argument), `Missing Runner compiler argument ${argument}`);
		}
		assert.doesNotMatch(processSource, /powershell(?:\.exe)?|cmd(?:\.exe)?/i);
		assert.match(processSource, /'runtime-error'/);
		assert.match(processSource, /new Osc633Filter\(\)/);
		assert.match(processSource, /finalizePublishedExecutable/);
		assert.match(processSource, /publishedExecutableIdentity/);
		assert.ok(processSource.indexOf('readExecutableIdentity(stagingPath)') < processSource.indexOf('dependencies.rename(stagingPath, destination)'));
		assert.ok(processSource.indexOf('dependencies.rename(stagingPath, destination)') < processSource.indexOf('readExecutableIdentity(destination)'));
		assert.match(processSource, /samePublishedFileIdentity\(stagingIdentity, destinationIdentity\)/);
		assert.match(processSource, /sameExecutableIdentity\(currentIdentity, result\.publishedExecutableIdentity\)[\s\S]*fs\.rmSync\(executablePath/);
		assert.match(processSource, /fs\.rmSync\(executablePath/);
		assert.doesNotMatch(processSource, /finally \{[\s\S]*removePath\(\s*request\.source\.executablePath/);
		assert.match(managerSource, /performWhileOpen/);
		assert.match(managerSource, /finalizePublishedExecutable/);
		assert.match(fs.readFileSync(path.join(extensionPath, 'src', 'terminalVisuals.ts'), 'utf8'), /===== \$\{message\} =====/);
		for (const obsoleteFile of [
			'resources/becoder-runner.ps1',
			'resources/runner-init.ps1',
			'resources/run.cmd'
		]) {
			assert.ok(!fs.existsSync(path.join(extensionPath, obsoleteFile)));
		}

		const explorerSource = fs.readFileSync(path.join(
			repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'files', 'browser', 'views', 'explorerViewer.ts'), 'utf8');
		assert.ok(explorerSource.indexOf('comparePinnedInput(statA, statB)') < explorerSource.indexOf('const reverse ='));
		assert.match(explorerSource, /stat\.name === 'input' && !stat\.isDirectory && !stat\.isSymbolicLink && !stat\.isUnknown/);
	});

	test('owns the Stage 4.7 Explorer, startup, toolchain, and branding boundary', () => {
		const setupPath = path.join(extensionsRoot, 'becoder.setup');
		const setupManifest = readJson<{
			contributes?: {
				configurationDefaults?: Record<string, unknown>;
				configuration?: { properties?: Record<string, unknown> };
				commands?: readonly { command?: string }[];
				menus?: Record<string, readonly { command?: string; when?: string }[]>;
			};
		}>(path.join(setupPath, 'package.json'));
		const defaults = setupManifest.contributes?.configurationDefaults ?? {};
		assert.ok(!Object.hasOwn(defaults, 'files.exclude'));
		assert.deepStrictEqual(defaults['becoder.runner.cppFlags'], ['-O2', '-Wall', '-DDEBUG']);
		assert.deepStrictEqual(defaults['becoder.runner.cFlags'], ['-O2', '-Wall', '-DDEBUG']);
		assert.ok(!Object.hasOwn(setupManifest.contributes?.configuration?.properties ?? {}, 'becoder.setup.completed'));
		assert.ok(!Object.hasOwn(setupManifest.contributes?.configuration?.properties ?? {}, 'becoder.setup.pending'));
		assert.ok(!setupManifest.contributes?.commands?.some(command => command.command === 'becoder.rerunFirstRunSetup'));
		assert.deepStrictEqual(
			setupManifest.contributes?.menus?.['view/title']?.map(item => ({ command: item.command, when: item.when })),
			[
				{ command: 'becoder.showAllFiles', when: 'view == workbench.explorer.fileView && becoder.filesHiddenByBeCoder' },
				{ command: 'becoder.hideSetupFiles', when: 'view == workbench.explorer.fileView && !becoder.filesHiddenByBeCoder' }
			]
		);

		const visibilitySource = fs.readFileSync(path.join(setupPath, 'src', 'fileVisibility.ts'), 'utf8');
		for (const pattern of ['**/.*', '**/*.exe', '**/*.bin', '**/*.bin.dSYM', '**/*.dSYM']) {
			assert.ok(visibilitySource.includes(`'${pattern}'`), `Missing managed Explorer pattern: ${pattern}`);
		}
		assert.match(visibilitySource, /updatedExcludes\[pattern\] !== true/);
		assert.match(visibilitySource, /state\?\.version === 1/);

		const setupSource = fs.readFileSync(path.join(setupPath, 'src', 'extension.ts'), 'utf8');
		assert.match(setupSource, /vscode\.ConfigurationTarget\.Global/);
		assert.doesNotMatch(setupSource, /vscode\.ConfigurationTarget\.(?:Workspace|WorkspaceFolder)/);
		assert.doesNotMatch(setupSource, /becoder\.setup\.(?:completed|pending)|rerunFirstRunSetup|first-run/);
		for (const command of ['becoder.exportUserData', 'becoder.importUserData']) {
			assert.ok(!setupManifest.contributes?.commands?.some(candidate => candidate.command === command));
		}
		assert.ok(!setupManifest.contributes?.commands?.some(command => ['becoder.setupEnvironment', 'becoder.redetectToolchain', 'becoder.repairToolchain'].includes(command.command ?? '')));

		for (const removedResource of ['first-run.html', 'first-run-preload.js']) {
			assert.ok(!fs.existsSync(path.join(repositoryRoot, 'resources', 'oi-defaults', removedResource)));
		}
		for (const obsoleteResource of ['windows.js', 'windows.json', 'mac.js', 'mac.json', 'linux.js', 'linux.json']) {
			assert.ok(!fs.existsSync(path.join(setupPath, 'resources', obsoleteResource)));
		}

		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.doesNotMatch(mainSource, /ipcMain\.(?:on|handle|removeHandler|removeListener)/);
		assert.doesNotMatch(mainSource, /becoder:onboarding|becoder\.setup\.(?:completed|pending)|showBeCoderFirstRun|onboardingWorkspaceFolder/);
		assert.doesNotMatch(mainSource, /prepareBeCoderWindowsToolchain|installBeCoderPortableAssets|extractBeCoderAsset|becoder-(?:repair-requested|preparation-error|toolchain-ready)/);
		const toolchainSource = fs.readFileSync(path.join(setupPath, 'src', 'toolchain.ts'), 'utf8');
		for (const requiredToolchainFile of ['bin/g++.exe', 'bin/gcc.exe', 'x86_64-w64-mingw32/bits/stdc++.h', 'bits/debugger.h', 'clangd_22.1.6/bin/clangd.exe']) {
			assert.ok(toolchainSource.includes(requiredToolchainFile), `Windows toolchain readiness omits ${requiredToolchainFile}`);
		}
		assert.match(toolchainSource, /Get BeCoder Setup/);
		assert.doesNotMatch(toolchainSource, /Repair Toolchain|Retry|extract|download/i);

		const buildToolchainSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'lib', 'becoderToolchain.ts'), 'utf8');
		assert.match(buildToolchainSource, /stageBeCoderWindowsToolchain/);
		assert.match(buildToolchainSource, /stageSlimCompiler/);
		assert.match(buildToolchainSource, /collectToolchainFiles/);
		assert.match(buildToolchainSource, /schemaVersion: 2/);
		assert.match(buildToolchainSource, /const compilerBinFiles = \[/);
		for (const forbiddenCompilerPayload of ['python.exe', 'objdump.exe', 'lto1.exe', 'lto-wrapper.exe']) {
			assert.ok(!buildToolchainSource.match(new RegExp(`compilerBinFiles = \\[\\s\\S]*?'${forbiddenCompilerPayload.replaceAll('.', '\\\.')}'`)));
		}
		assert.match(buildToolchainSource, /becoder-toolchain-manifest\.json/);
		const setupScript = fs.readFileSync(path.join(repositoryRoot, 'build', 'win32', 'becoder.iss'), 'utf8');
		assert.match(setupScript, /PrivilegesRequired=lowest/);
		assert.match(setupScript, /Uninstallable=no/);
		assert.match(setupScript, /CreateUninstallRegKey=no/);
		assert.doesNotMatch(setupScript, /^AppId=/m);
		assert.match(setupScript, /^\[Tasks\]$/m);
		assert.match(setupScript, /^Name: "desktopicon"; Description: "\{cm:CreateDesktopShortcut\}"; Flags: unchecked$/m);
		assert.match(setupScript, /^english\.CreateDesktopShortcut=Create a desktop shortcut \(not recommended when installing BeCoder on removable storage\)$/m);
		assert.match(setupScript, /^simplifiedChinese\.CreateDesktopShortcut=创建桌面快捷方式（当你正在给可移动存储介质安装 BeCoder 时，不建议勾选）$/m);
		assert.match(setupScript, /^\[Icons\]$/m);
		assert.match(setupScript, /^Name: "\{userdesktop\}\\\{#NameLong\}"; Filename: "\{app\}\\\{#ExeBasename\}\.exe"; WorkingDir: "\{app\}"; Tasks: desktopicon$/m);
		assert.doesNotMatch(setupScript, /^\[Registry\]$/m);
		assert.doesNotMatch(setupScript, /^\[UninstallDelete\]$/m);
		assert.doesNotMatch(setupScript, /\{(?:auto|common)desktop\}|\{group\}|\{userstartmenu\}|\{commonstartmenu\}|DefaultGroupName/i);
		assert.doesNotMatch(setupScript, /InitializeUninstall|UninstallWarning|SilentUninstall|uninstallexe|ScheduleMovedInstallationRemoval/);
		assert.doesNotMatch(setupScript, /\bReg(?:Write|Delete)\w*\s*\(/i);
		for (const previousSetting of ['AppDir', 'Group', 'Language', 'Privileges', 'SetupType', 'Tasks', 'UserInfo']) {
			assert.match(setupScript, new RegExp(`UsePrevious${previousSetting}=no`));
		}
		assert.match(setupScript, /\.becoder-installation\.json/);
		assert.match(setupScript, /schemaVersion\\?":2/);
		assert.match(setupScript, /installationId/);
		assert.match(setupScript, /CoCreateGuid/);
		assert.match(setupScript, /TryReadInstallationId/);
		assert.match(setupScript, /MaximumInstallPathLength = 70/);
		assert.match(setupScript, /GetFileAttributesW/);
		assert.match(setupScript, /FileAttributeReparsePoint/);
		assert.match(setupScript, /GetLongPathNameW/);
		assert.match(setupScript, /TryResolveSupportedInstallPath/);
		assert.strictEqual(setupScript.match(/TryResolveSupportedInstallPath\(WizardDirValue, Target\)/g)?.length, 2);
		const nextButtonClick = setupScript.match(/function NextButtonClick\(CurPageID: Integer\): Boolean;[\s\S]*?\r?\nend;\r?\n\r?\nfunction PrepareToInstall/)?.[0];
		assert.ok(nextButtonClick);
		for (const message of ['UnsafeDirectory', 'UnsupportedPath', 'ForeignDirectory']) {
			assert.match(nextButtonClick, new RegExp(`SuppressibleMsgBox\\(ExpandConstant\\('\\{cm:${message}\\}'\\), mbError, MB_OK, IDOK\\)`));
		}
		assert.doesNotMatch(nextButtonClick, /\bMsgBox\(/);
		assert.match(setupScript, /\(not WizardSilent\) and \(MsgBox\(ExpandConstant\('\{cm:ReplaceWarning\}'\), mbConfirmation, MB_YESNO or MB_DEFBUTTON2\) <> IDYES\)/);
		assert.match(setupScript, /Ord\(Value\[Index\]\) > 127/);
		assert.match(setupScript, /DelTree\(Target, True, True, True\)/);
		assert.match(setupScript, /BECODERALLOWDATALOSS=1/);
		assert.match(setupScript, /WizardSilent and not HasDataLossConsent\(\)/);
		assert.match(setupScript, /SaveStringToFile[\s\S]*RaiseException/);
		assert.match(setupScript, /ReplaceDeleteFailed/);
		for (const forbiddenSetupCapability of ['ChangesAssociations=yes', 'ChangesEnvironment=yes', 'addtopath', 'addcontextmenu', 'Software\\Classes', 'App Paths', 'URL Protocol', 'scheduled task']) {
			assert.ok(!setupScript.toLowerCase().includes(forbiddenSetupCapability.toLowerCase()), `Setup contains forbidden integration: ${forbiddenSetupCapability}`);
		}
		const productConfiguration = readJson<Record<string, unknown>>(path.join(repositoryRoot, 'product.json'));
		assert.ok(!Object.hasOwn(productConfiguration, 'win32MutexName'));
		const installationIdentitySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'node', 'beCoderInstallation.ts'), 'utf8');
		assert.match(installationIdentitySource, /schemaVersion !== 2/);
		assert.match(installationIdentitySource, /resolveBeCoderAppUserModelId/);
		assert.match(installationIdentitySource, /resolveBeCoderOnboarding/);
		assert.match(installationIdentitySource, /onboardingFileSha256 = '0d47c180bbb64866f3a805b958306c268597c64f21d10458dc919740714cf1d9'/);
		assert.match(installationIdentitySource, /folderStat\.isSymbolicLink\(\)[\s\S]*fileStat\.isSymbolicLink\(\)[\s\S]*markerStat\.isSymbolicLink\(\)/);
		assert.doesNotMatch(installationIdentitySource, /resolveBeCoderImportRecovery|\.becoder-import-transaction\.json|userDataImportHelper/);
		const startupSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8');
		const packagedDataBinding = startupSource.indexOf('configureBeCoderPackagedDataRoot({');
		assert.ok(packagedDataBinding >= 0);
		assert.ok(packagedDataBinding < startupSource.indexOf('configurePortable(product)'));
		assert.ok(packagedDataBinding < startupSource.indexOf('parseCLIArgs()'));
		assert.ok(packagedDataBinding < startupSource.indexOf('getUserDataPath(args'));
		assert.match(installationIdentitySource, /mkdirSync\(dataRoot, \{ recursive: true \}\)[\s\S]*environment\['VSCODE_PORTABLE'\] = dataRoot[\s\S]*delete options\.environment\['VSCODE_APPDATA'\]/);
		const applicationSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.match(applicationSource, /app\.setAppUserModelId\(resolveBeCoderAppUserModelId\(win32AppUserModelId, process\.execPath\)\)/);
		assert.match(applicationSource, /delete args\['becoder-trust-workspace'\]/);
		assert.match(applicationSource, /resolveBeCoderOnboarding\(process\.execPath\)[\s\S]*folderUri: URI\.file\(onboarding\.folderPath\)[\s\S]*fileUri: URI\.file\(onboarding\.filePath\)[\s\S]*consumeBeCoderOnboarding/);
		assert.ok(!Object.hasOwn(setupManifest.contributes?.configuration?.properties ?? {}, 'becoder.executableCleanupDelaySeconds'));

		for (const removedUserDataTransferFile of [
			'src/storageDatabase.ts',
			'src/userDataArchive.ts',
			'src/userDataImportHelper.ts',
			'src/userDataPayload.ts',
			'src/userDataPortability.ts',
			'test/storageDatabase.test.ts',
			'test/userDataArchive.test.ts',
			'test/userDataPayload.test.ts'
		]) {
			assert.ok(!fs.existsSync(path.join(setupPath, removedUserDataTransferFile)), `Removed BeCoder user-data transfer file still exists: ${removedUserDataTransferFile}`);
		}

		const electronMainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'main.ts'), 'utf8');
		assert.doesNotMatch(electronMainSource, /configureBeCoderPortableMode/);
		assert.doesNotMatch(electronMainSource, /recoverInterruptedBeCoderImport|resolveBeCoderImportRecovery|\.becoder-import-transaction\.json|userDataImportHelper/);
		const profilesEditorModelSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'userDataProfile', 'browser', 'userDataProfilesEditorModel.ts'), 'utf8');
		assert.match(profilesEditorModelSource, /private saveNewProfilePromise: Promise<IUserDataProfile \| undefined> \| undefined/);
		assert.match(profilesEditorModelSource, /if \(this\.saveNewProfilePromise\) \{\s*return this\.saveNewProfilePromise;\s*\}/);
		assert.match(profilesEditorModelSource, /const savePromise = Promise\.resolve\(\)\.then\(\(\) => this\.doSaveNewProfile\(transient, token\)\);\s*this\.saveNewProfilePromise = savePromise/);
		const packageVerifierSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-package.ps1'), 'utf8');
		assert.match(packageVerifierSource, /removed BeCoder user-data transfer module/);
		assert.match(packageVerifierSource, /removed BeCoder user-data transfer command/);
		assert.match(packageVerifierSource, /removed BeCoder user-data import recovery boundary/);
		assert.match(packageVerifierSource, /licenseUrl -ne 'https:\/\/github\.com\/Bc408\/BeCoder-IDE\/blob\/main\/LICENSE'/);
		assert.match(packageVerifierSource, /\$null -ne \$product\.PSObject\.Properties\['reportIssueUrl'\]/);
		const setupVerifierSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-setup.ps1'), 'utf8');
		assert.match(setupVerifierSource, /New-Item -ItemType Junction/);
		assert.match(setupVerifierSource, /unicode-junction\.log/);
		assert.match(setupVerifierSource, /long-junction\.log/);
		assert.match(setupVerifierSource, /junction target must survive/);
		assert.match(setupVerifierSource, /\$verificationBaseRoot = Join-Path \$repositoryRoot '\.build\\si'/);
		assert.match(setupVerifierSource, /\[Guid\]::NewGuid\(\)\.ToString\('N'\)\.Substring\(0, 6\)/);
		assert.match(setupVerifierSource, /Unable to remove the previous Setup verification directory/);
		assert.match(setupVerifierSource, /Unable to remove the completed Setup verification run/);
		assert.match(setupVerifierSource, /reg\.exe query \$hive \/f \$term \/k \/s/);
		const electronBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'lib', 'electron.ts'), 'utf8');
		assert.match(electronBuildSource, /process\.env\['BECODER_ELECTRON_ARCHIVE'\]/);
		assert.match(electronBuildSource, /path\.basename\(archivePath\) !== localElectronArchiveName/);
		assert.match(electronBuildSource, /!stat\.isFile\(\) \|\| stat\.isSymbolicLink\(\)/);
		assert.match(electronBuildSource, /actualHash !== expectedHash/);
		assert.match(electronBuildSource, /fileName === 'SHASUMS256\.txt'[\s\S]*fileResponse\(electronChecksumFile\)/);
		assert.match(electronBuildSource, /: electronFeed[\s\S]*downloadFeedPackage/);

		const checkerBoundary = readJson<{ extends?: string; exclude?: readonly string[] }>(path.join(repositoryRoot, 'build', 'checker', 'tsconfig.becoder.json'));
		assert.strictEqual(checkerBoundary.extends, '../../src/tsconfig.base.json');
		assert.deepStrictEqual(checkerBoundary.exclude, [
			'../../src/**/test/**',
			'../../src/**/fixtures/**',
			'../../src/vs/workbench/contrib/debug/**',
			'../../src/vs/workbench/contrib/replNotebook/**',
			'../../src/vs/workbench/contrib/notebook/browser/contrib/editorHint/emptyCellEditorHint.ts',
			'../../src/vs/workbench/contrib/notebook/browser/contrib/notebookVariables/**',
			'../../src/vs/workbench/contrib/scm/browser/scmHistoryChatContext.ts',
			'../../src/vs/workbench/services/policies/browser/accountPolicyGate.contribution.ts',
			'../../src/vs/workbench/services/policies/browser/accountPolicyGateContribution.ts',
			'../../src/vs/workbench/api/browser/mainThreadAgent*.ts',
			'../../src/vs/workbench/api/browser/mainThreadMcp*.ts',
			'../../src/vs/workbench/api/common/extHostAgent*.ts',
			'../../src/vs/workbench/api/common/extHostMcp*.ts',
			'../../src/vs/workbench/api/node/extHostMcp*.ts',
			'../../src/vs/base/parts/sandbox/electron-browser/preload.ts',
			'../../src/vs/base/parts/sandbox/electron-browser/preload-aux.ts',
			'../../src/vs/platform/browserView/electron-browser/preload-browserView.ts'
		]);
		for (const checkerConfig of ['tsconfig.browser.json', 'tsconfig.worker.json', 'tsconfig.node.json']) {
			assert.strictEqual(
				readJson<{ extends?: string }>(path.join(repositoryRoot, 'build', 'checker', checkerConfig)).extends,
				'./tsconfig.becoder.json'
			);
		}

		const product = readJson<{ licenseUrl?: string; reportIssueUrl?: string }>(path.join(repositoryRoot, 'product.json'));
		assert.strictEqual(product.licenseUrl, 'https://github.com/Bc408/BeCoder-IDE/blob/main/LICENSE');
		assert.strictEqual(product.reportIssueUrl, undefined);
		const packageManifest = readJson<{ repository?: { url?: string }; bugs?: { url?: string } }>(path.join(repositoryRoot, 'package.json'));
		assert.strictEqual(packageManifest.repository?.url, 'https://github.com/Bc408/BeCoder-IDE.git');
		assert.strictEqual(packageManifest.bugs?.url, 'https://github.com/Bc408/BeCoder-IDE/issues');
	});

	test('enumerates only real Windows shortcut files in Setup snapshots', { skip: process.platform !== 'win32' }, () => {
		const verifierSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'win32', 'verify-becoder-setup.ps1'), 'utf8');
		const shortcutFunction = verifierSource.match(/^function Get-ShortcutSnapshot \{[\s\S]*?^\}/m)?.[0];
		assert.ok(shortcutFunction, 'Setup verifier shortcut snapshot function is missing');
		assert.match(shortcutFunction, /GetFolderPath\('Desktop'\)/);
		assert.match(shortcutFunction, /GetFolderPath\('StartMenu'\)/);
		assert.match(shortcutFunction, /-Filter '\*\.lnk' -File -Recurse/);
		assert.match(shortcutFunction, /Get-FileHash -LiteralPath \$_\.FullName -Algorithm SHA256/);
		assert.doesNotMatch(shortcutFunction, /-Filter '\*BeCoder\*'/);
		assert.match(verifierSource, /if \(Compare-Object \$shortcutsBefore \$shortcutsAfter\)/);

		const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-shortcut-snapshot-'));
		const desktopRoot = path.join(testRoot, 'Desktop');
		const startMenuRoot = path.join(testRoot, 'Start Menu');
		fs.mkdirSync(path.join(desktopRoot, 'BeCoder B'), { recursive: true });
		fs.mkdirSync(path.join(startMenuRoot, 'Programs', 'BeCoder'), { recursive: true });
		const ordinaryFile = path.join(desktopRoot, 'BeCoder B.txt');
		const desktopShortcut = path.join(desktopRoot, 'BeCoder.lnk');
		const startMenuShortcut = path.join(startMenuRoot, 'Programs', 'BeCoder', 'BeCoder.lnk');
		fs.writeFileSync(ordinaryFile, 'not a shortcut');
		fs.writeFileSync(desktopShortcut, 'shortcut fixture');
		fs.writeFileSync(startMenuShortcut, 'shortcut fixture');
		const snapshotEntry = (filePath: string): string => `${filePath}|${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase()}`;

		const getSnapshot = (): string[] => {
			const functionBase64 = Buffer.from(shortcutFunction, 'utf8').toString('base64');
			const pathsBase64 = Buffer.from(JSON.stringify([desktopRoot, startMenuRoot]), 'utf8').toString('base64');
			const command = [
				"$ErrorActionPreference = 'Stop'",
				"$functionSource = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:BECODER_SHORTCUT_FUNCTION))",
				'Invoke-Expression $functionSource',
				"$paths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:BECODER_SHORTCUT_PATHS)) | ConvertFrom-Json",
				'$snapshot = @(Get-ShortcutSnapshot -Paths $paths)',
				'ConvertTo-Json -InputObject $snapshot -Compress'
			].join('; ');
			const environment = {
				...process.env,
				BECODER_SHORTCUT_FUNCTION: functionBase64,
				BECODER_SHORTCUT_PATHS: pathsBase64
			};
			delete environment.PSModulePath;
			const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
				encoding: 'utf8',
				env: environment
			});
			assert.ifError(result.error);
			assert.strictEqual(result.status, 0, result.stderr || result.stdout);
			return JSON.parse(result.stdout.trim()) as string[];
		};

		try {
			const before = getSnapshot();
			assert.deepStrictEqual(before, [snapshotEntry(desktopShortcut), snapshotEntry(startMenuShortcut)].sort());
			assert.ok(!before.includes(path.join(desktopRoot, 'BeCoder B')));
			assert.ok(!before.includes(ordinaryFile));

			const addedShortcut = path.join(startMenuRoot, 'BeCoder B.lnk');
			fs.writeFileSync(addedShortcut, 'new shortcut fixture');
			const after = getSnapshot();
			assert.deepStrictEqual(after, [snapshotEntry(addedShortcut), snapshotEntry(desktopShortcut), snapshotEntry(startMenuShortcut)].sort());
			assert.notDeepStrictEqual(after, before);

			fs.writeFileSync(desktopShortcut, 'changed shortcut fixture');
			const changed = getSnapshot();
			assert.deepStrictEqual(changed, [snapshotEntry(addedShortcut), snapshotEntry(desktopShortcut), snapshotEntry(startMenuShortcut)].sort());
			assert.notDeepStrictEqual(changed, after);
		} finally {
			fs.rmSync(testRoot, { recursive: true, force: true });
		}
	});

	test('keeps cloud Release publication explicitly dispatched and stable-only', () => {
		const releaseWorkflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'release.yml'), 'utf8');
		assert.match(releaseWorkflow, /^\s{2}workflow_dispatch:\s*$/m);
		assert.match(releaseWorkflow, /^\s{6}version:\s*$/m);
		assert.match(releaseWorkflow, /^\s{6}commit:\s*$/m);
		assert.doesNotMatch(releaseWorkflow, /^\s{2}(?:push|pull_request|schedule):\s*$/m);
		assert.doesNotMatch(releaseWorkflow, /Release-v|Beta-v|alpha|beta|nightly|--prerelease|--draft/);
		assert.match(releaseWorkflow, /\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
		assert.match(releaseWorkflow, /RELEASE_TAG: v\$\{\{ inputs\.version \}\}/);
		assert.match(releaseWorkflow, /main_sha=.*git ls-remote origin refs\/heads\/main/);
		assert.match(releaseWorkflow, /gh release create "\$RELEASE_TAG" "\$setup"[\s\S]*--target "\$RELEASE_COMMIT"/);
		assert.match(releaseWorkflow, /--title "\$RELEASE_TAG"/);
		assert.doesNotMatch(releaseWorkflow, /--title "BeCoder \$RELEASE_TAG"/);
		assert.ok(releaseWorkflow.indexOf('needs: build') < releaseWorkflow.indexOf('gh release create'));
		assert.match(releaseWorkflow, /^permissions:\s*\n\s{2}contents: read\s*$/m);
		assert.match(releaseWorkflow, /^\s{4}permissions:\s*\n\s{6}contents: write\s*$/m);
	});
});
