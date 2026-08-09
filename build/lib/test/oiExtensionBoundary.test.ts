/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import fs from 'fs';
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
	test('does not build or package AI, local transcription, sessions, or debug workbench entrypoints', () => {
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
			path.join(repositoryRoot, 'build', 'gulpfile.vscode.web.ts'),
			path.join(repositoryRoot, 'build', 'lib', 'i18n.resources.json')
		]) {
			assert.ok(!fs.readFileSync(buildBoundaryPath, 'utf8').includes('welcomeOnboarding'), `Unsupported onboarding build entry remains: ${buildBoundaryPath}`);
		}
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
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'localTranscription'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'networkFilter'),
			path.join(repositoryRoot, 'src', 'vs', 'platform', 'webContentExtractor'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'search', 'browser', 'AISearch'),
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'agentEditorComments')
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
			path.join(repositoryRoot, 'src', 'vs', 'workbench', 'api', 'common', 'extHostAgentEditorComments.ts')
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
		assert.match(sourceTsconfig, /vs\/workbench\/services\/assignment\/common\/assignmentFilters\.ts/);
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
		assert.strictEqual(packageManifest.allowScripts?.['cpu-features'], false);
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
		const cpuFeatures = packageLock.packages?.['node_modules/cpu-features'];
		assert.strictEqual(cpuFeatures?.version, '0.0.10');
		assert.strictEqual(cpuFeatures?.resolved, 'https://registry.npmjs.org/cpu-features/-/cpu-features-0.0.10.tgz');
		assert.strictEqual(cpuFeatures?.optional, true);
		assert.deepStrictEqual(cpuFeatures?.dependencies, { buildcheck: '~0.0.6', nan: '^2.19.0' });
		assert.strictEqual(packageLock.packages?.['node_modules/ssh2']?.optionalDependencies?.['cpu-features'], '~0.0.10');

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
			'contrib/timeline/browser/timeline.contribution.js',
			'contrib/localHistory/browser/localHistory.contribution.js',
			'contrib/tasks/browser/task.contribution.js',
			'contrib/markdown/browser/markdown.contribution.js',
		]) {
			assert.ok(commonWorkbench.includes(retainedContribution), `Ordinary Workbench contribution was lost: ${retainedContribution}`);
		}
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
		const packageBuildSource = fs.readFileSync(path.join(repositoryRoot, 'build', 'gulpfile.vscode.ts'), 'utf8');
		assert.match(packageBuildSource, /const beCoderOnboarding = gulp\.src\(\[[\s\S]*'resources\/oi-defaults\/\*\*',[\s\S]*'!resources\/oi-defaults\/portable-data\/\*\*'[\s\S]*\], \{ base: '\.' \}\);/);
		assert.match(packageBuildSource, /const beCoderRecipeDotfiles = gulp\.src\('resources\/oi-defaults\/toolchains\/ucrt64-sources\/recipes\/\*\*\/\.gitignore', \{ base: '\.', dot: true \}\);/);

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /countMatchingProtectedExtensions[\s\S]*createFilteredExtensionPager/);
		assert.match(gallerySource, /private async getVersions[\s\S]*isProtectedExtensionId\(extensionIdentifier\.id/);
		assert.match(gallerySource, /private async getAsset[\s\S]*Gallery resources are unavailable for protected BeCoder extension/);

		const extensionManagementSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'node', 'extensionManagementService.ts'), 'utf8');
		assert.match(extensionManagementSource, /installExtensionsFromProfile[\s\S]*allowedExtensionsService\.isAllowed\(extension\)[\s\S]*addExtensionsToProfile/);
	});

	test('bundles Mermaid Markdown and Notebook rendering without Chat output integration', () => {
		const extensionPath = path.join(extensionsRoot, 'mermaid-markdown-features');
		const manifest = readJson<{
			publisher?: string;
			name?: string;
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
			'becoder.runner',
			'becoder.becoder-setup',
			'becoder.gcc-diagnostics',
			'llvm-vs-code-extensions.vscode-clangd',
			'adpyke.codesnap',
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
		const ucrt64 = components.find(component => component.id === 'becoder-ucrt64');
		assert.strictEqual(ucrt64?.sha256, '730e8169f9984dbe0f1c952a110b16616350a26bdc693e7b7ff9e5f59fba70b2');
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
		assert.strictEqual(languagePack?.contentSha256, '003524d3dd4b4c9ddf294f47aa3456394758d5f61daeed589b60d77e272b3d72');
		assert.strictEqual(computeDirectoryFilesSha256(path.join(extensionsRoot, 'MS-CEINTL.vscode-language-pack-zh-hans')), languagePack?.contentSha256);
		assert.strictEqual(languagePack?.packagedContentSha256, '6c84cf72ad88a4e65b6a91fd87fb0005adaf414ce34388390927d4c8bd02634c');
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
		assert.ok(retainedLicenseFiles.length >= 63);
		assert.strictEqual(packages.recipeFilesRoot, 'resources/oi-defaults/toolchains/ucrt64-sources/recipes');
		const retainedRecipeFiles = fs.readdirSync(path.join(repositoryRoot, packages.recipeFilesRoot), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
		assert.strictEqual(retainedRecipeFiles.length, packages.evidence?.retainedRecipeFileCount);
		assert.ok(retainedRecipeFiles.length >= 290);
		assert.strictEqual(packages.packages?.length, 36);
		assert.strictEqual(packages.auxiliaryPackageSources?.length, 2);
		assert.strictEqual(new Set(packages.packages?.map(pkg => pkg.name)).size, 36);
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
		assert.ok(packages.unownedArchiveEntries?.includes('include/c++/14.1.0/x86_64-w64-mingw32/bits/debugger.h'));
		assert.ok(packages.unownedArchiveEntries?.includes('include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h.gch'));

		const notices = fs.readFileSync(path.join(repositoryRoot, 'ThirdPartyNotices.txt'), 'utf8');
		assert.match(notices, /BeCoder Runner 0\.3\.0/);
		assert.match(notices, /CodeSnap 1\.3\.4[\s\S]*Copyright \(c\) 2019 Adrien Pyke/);
		assert.match(notices, /Mermaid Markdown Features 10\.0\.0[\s\S]*extensions\/mermaid-markdown-features\/ThirdPartyNotices\.txt/);
		assert.match(notices, /clangd 22\.1\.6 Windows binary bundle/);
		assert.match(notices, /BeCoder UCRT64 GCC 14\.1\.0 bundle/);
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
		assert.match(setupSettingsSource, /@ext:becoder\.becoder-setup/);
		const displayLanguageSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'contrib', 'becoder', 'electron-browser', 'beCoderDisplayLanguage.contribution.ts'), 'utf8');
		assert.match(displayLanguageSource, /ConfigurationTarget\.USER_LOCAL/);
		assert.match(displayLanguageSource, /BeCoderSimplifiedChineseLanguagePackId/);
		assert.match(displayLanguageSource, /setLocale\(languagePack, false, \(\) => this\.controller\.isLatestRequest\(language\)\)/);

		const localeServiceSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'workbench', 'services', 'localization', 'electron-browser', 'localeService.ts'), 'utf8');
		assert.match(localeServiceSource, /cancelButton: localize\('later', "Later"\)/);
		assert.ok(localeServiceSource.indexOf('writeLocaleValue(locale)') < localeServiceSource.indexOf('showRestartDialog(languagePackItem.label)'));

		const gallerySource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'platform', 'extensionManagement', 'common', 'extensionGalleryService.ts'), 'utf8');
		assert.match(gallerySource, /isProtectedExtensionId\(extensionIdentifier\.id, this\.productService\.protectedExtensions\)/);
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
		assert.strictEqual(theme.semanticTokenColors?.['type:cpp'], '#61afef');
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
			'inactive-regions.ts',
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
		assert.doesNotMatch(contextSource, /provideDocumentSemanticTokens/);
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
		assert.deepStrictEqual(setupManifest.contributes?.configurationDefaults, {
			'editor.unicodeHighlight.nonBasicASCII': false,
			'editor.unicodeHighlight.ambiguousCharacters': false,
			'editor.unicodeHighlight.invisibleCharacters': true
		});
		const mainSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'vs', 'code', 'electron-main', 'app.ts'), 'utf8');
		assert.doesNotMatch(mainSource, /createBeCoderClangdConfig|createBeCoderClangFormatConfig/);
		assert.doesNotMatch(mainSource, /'clangd\.(?:path|arguments|fallbackFlags|enable)'/);
		const firstRunSource = fs.readFileSync(path.join(repositoryRoot, 'resources', 'oi-defaults', 'first-run.html'), 'utf8');
		assert.doesNotMatch(firstRunSource, /create \.clangd|创建 \.clangd|clangdVariableTypeHints/);
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

		const terminalSource = fs.readFileSync(path.join(extensionPath, 'src', 'bcTerminal.ts'), 'utf8');
		assert.match(terminalSource, /implements vscode\.Pseudoterminal/);
		assert.match(terminalSource, /osc633CommandFinished/);
		assert.match(terminalSource, /renderBcCommand/);
		const managerSource = fs.readFileSync(path.join(extensionPath, 'src', 'compile-run-manager.ts'), 'utf8');
		assert.match(managerSource, /createTerminal\(\{[\s\S]*pty: pseudoterminal/);
		assert.match(managerSource, /panelReadyMs = await pseudoterminal\.waitForOpen\(panelStartedAt\)/);
		assert.match(managerSource, /request\.exitCode = 1;[\s\S]*await this\.executor\.cancel\(\)/);
		assert.doesNotMatch(managerSource, /sendText|createTerminal\([^\{]/);
		const processSource = fs.readFileSync(path.join(extensionPath, 'src', 'runnerProcess.ts'), 'utf8');
		assert.match(processSource, /shell: false/);
		for (const argument of ['-O2', '-Wall', '-DDEBUG', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always']) {
			assert.ok(processSource.includes(argument), `Missing Runner compiler argument ${argument}`);
		}
		assert.doesNotMatch(processSource, /powershell(?:\.exe)?|cmd(?:\.exe)?/i);
		assert.match(processSource, /'runtime-error'/);
		assert.match(processSource, /new Osc633Filter\(\)/);
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
});
