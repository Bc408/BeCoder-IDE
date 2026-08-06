import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import * as fs from 'fs';
import * as path from 'path';

import * as ast from './ast';
import * as config from './config';
import * as configFileWatcher from './config-file-watcher';
import * as fileStatus from './file-status';
import * as inactiveRegions from './inactive-regions';
import * as inlayHints from './inlay-hints';
import * as install from './install';
import * as memoryUsage from './memory-usage';
import * as openConfig from './open-config';
import * as switchSourceHeader from './switch-source-header';
import * as typeHierarchy from './type-hierarchy';

export const clangdDocumentSelector = [
  {scheme: 'file', language: 'c'},
  {scheme: 'file', language: 'cpp'},
  {scheme: 'file', language: 'cuda-cpp'},
  {scheme: 'file', language: 'objective-c'},
  {scheme: 'file', language: 'objective-cpp'},
];

function beCoderCompilerPath(clangdPath: string): string | undefined {
  if (process.platform === 'win32') {
    const toolchainRoot = path.resolve(
        path.dirname(clangdPath), '..', '..', '..');
    return path.join(toolchainRoot, 'becoder-ucrt64', 'bin', 'g++.exe');
  }
  const configuration = vscode.workspace.getConfiguration('becoder.toolchain');
  return configuration.get<string>('compilerPath') || undefined;
}

function managedClangdEnvironment(
    clangdPath: string, compilerPath: string | undefined,
    globalStoragePath: string): Record<string, string> | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }

  const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
  if (!systemRoot) {
    return undefined;
  }

  const environment: Record<string, string> = {};
  for (const name of [
    'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'USERPROFILE',
    'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'ProgramData',
    'OS', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
  ]) {
    const value = process.env[name];
    if (value) {
      environment[name] = value;
    }
  }

  const temporaryDirectory = path.join(globalStoragePath, 'clangd-tmp');
  const managedUserRoot = path.join(globalStoragePath, 'clangd-user');
  const managedLocalAppData = path.join(managedUserRoot, 'AppData', 'Local');
  const managedAppData = path.join(managedUserRoot, 'AppData', 'Roaming');
  fs.mkdirSync(managedLocalAppData, {recursive: true});
  fs.mkdirSync(managedAppData, {recursive: true});
  fs.mkdirSync(temporaryDirectory, {recursive: true});
  environment['TEMP'] = temporaryDirectory;
  environment['TMP'] = temporaryDirectory;
  environment['USERPROFILE'] = managedUserRoot;
  environment['HOMEDRIVE'] = path.parse(managedUserRoot).root.slice(0, 2);
  environment['HOMEPATH'] = managedUserRoot.slice(2);
  environment['LOCALAPPDATA'] = managedLocalAppData;
  environment['APPDATA'] = managedAppData;
  environment['HOME'] = managedUserRoot;
  environment['XDG_CONFIG_HOME'] = path.join(managedUserRoot, '.config');

  const pathEntries = [
    path.dirname(clangdPath),
    compilerPath ? path.dirname(compilerPath) : undefined,
    path.join(systemRoot, 'System32')
  ].filter((entry): entry is string => Boolean(entry));
  environment['PATH'] = [...new Set(pathEntries)].join(path.delimiter);
  return environment;
}

export function isClangdDocument(document: vscode.TextDocument) {
  if (vscode.languages.match(clangdDocumentSelector, document)) {
    return true;
  }
  return document.uri.scheme === 'file' &&
      /\.(c|m|cc|cp|cpp|cxx|c\+\+|h|hh|hpp|hxx|inl|cu|mm)$/i.test(
          path.extname(document.uri.fsPath));
}

function isCompetitiveToolchainHeader(uri: vscode.Uri): boolean {
  return /[\\/]include[\\/]c\+\+[\\/]14\.1\.0[\\/]/i.test(uri.fsPath);
}

function isKnownGccHeaderFalsePositive(uri: vscode.Uri,
                                       diagnostic: vscode.Diagnostic): boolean {
  const code = typeof diagnostic.code === 'string' ? diagnostic.code : '';
  if (code !== 'typecheck_expression_not_modifiable_lvalue' &&
      code !== 'clang(typecheck_expression_not_modifiable_lvalue)')
    return false;

  if (isCompetitiveToolchainHeader(uri))
    return true;

  // clangd may publish an "In included file" diagnostic on the user's source
  // line and put the actual GCC header location in relatedInformation.
  return diagnostic.relatedInformation?.some(info =>
      isCompetitiveToolchainHeader(info.location.uri)) ?? false;
}

function isCxxSourceUri(uri: vscode.Uri): boolean {
  return /\.(cc|cp|cpp|cxx|c\+\+|hh|hpp|hxx|inl)$/i.test(
      path.extname(uri.fsPath));
}

function isGccVlaExtensionDiagnostic(uri: vscode.Uri,
                                     diagnostic: vscode.Diagnostic): boolean {
  if (!isCxxSourceUri(uri)) {
    return false;
  }
  const code = typeof diagnostic.code === 'string'
      ? diagnostic.code
      : typeof diagnostic.code === 'object' && diagnostic.code !== null &&
          'value' in diagnostic.code
        ? String(diagnostic.code.value)
        : '';
  return code === '-Wvla-extension' ||
      code === '-Wvla-cxx-extension' ||
      code === 'clang(-Wvla-extension)' ||
      code === 'clang(-Wvla-cxx-extension)';
}

class ClangdLanguageClient extends vscodelc.LanguageClient {
  // Override the default implementation for failed requests. The default
  // behavior is just to log failures in the output panel, however output panel
  // is designed for extension debugging purpose, normal users will not open it,
  // thus when the failure occurs, normal users doesn't know that.
  //
  // For user-interactive operations (e.g. applyFixIt, applyTweaks), we will
  // prompt up the failure to users.

  handleFailedRequest<T>(type: vscodelc.MessageSignature, error: any,
                         token: vscode.CancellationToken|undefined,
                         defaultValue: T): T {
    if (error instanceof vscodelc.ResponseError &&
        type.method === 'workspace/executeCommand')
      vscode.window.showErrorMessage(error.message);

    return super.handleFailedRequest(type, token, error, defaultValue);
  }
}

class EnableEditsNearCursorFeature implements vscodelc.StaticFeature {
  initialize() {}
  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {
    const extendedCompletionCapabilities: any =
        capabilities.textDocument?.completion;
    extendedCompletionCapabilities.editsNearCursor = true;
  }
  getState(): vscodelc.FeatureState { return {kind: 'static'}; }
  clear() {}
}

const contextsWithFeatures = new WeakSet<object>();
const stopHandlers = new WeakMap<object, () => Promise<void>>();
const pendingStops = new WeakMap<object, Promise<void>>();
const startPromises = new WeakMap<ClangdContext, Promise<void>>();
const stoppingContexts = new WeakSet<ClangdContext>();

async function waitForClangdStart(context: ClangdContext): Promise<void> {
  await startPromises.get(context);
}

export async function stopClangdContext(context: ClangdContext): Promise<void> {
  const pending = pendingStops.get(context);
  if (pending) {
    await pending;
    return;
  }
  const stop = stopHandlers.get(context);
  if (!stop) {
    context.dispose();
    return;
  }
  const stopping = stop();
  pendingStops.set(context, stopping);
  await stopping;
}

export class ClangdContext implements vscode.Disposable {
  subscriptions: vscode.Disposable[];
  client: ClangdLanguageClient;

  static async create(globalStoragePath: string,
                      outputChannel: vscode.OutputChannel):
      Promise<ClangdContext|null> {
    const subscriptions: vscode.Disposable[] = [];
    const clangdPath = await install.activate(subscriptions, globalStoragePath);
    if (!clangdPath) {
      subscriptions.forEach((d) => { d.dispose(); });
      return null;
    }

    const compilerPath = beCoderCompilerPath(clangdPath);
    if (process.platform === 'win32' &&
        (!fs.existsSync(clangdPath) || !compilerPath ||
         !fs.existsSync(compilerPath))) {
      subscriptions.forEach((d) => { d.dispose(); });
      vscode.window.showErrorMessage(
          'BeCoder bundled clangd or GCC is unavailable. The built-in language service was not started.');
      return null;
    }
    const context = new ClangdContext(
        subscriptions,
        await ClangdContext.createClient(
            clangdPath, outputChannel, globalStoragePath));
    await waitForClangdStart(context);
    return context;
  }

  private static async createClient(clangdPath: string,
                                    outputChannel: vscode.OutputChannel,
                                    globalStoragePath: string):
      Promise<ClangdLanguageClient> {
    const useScriptAsExecutable =
        await config.get<boolean>('useScriptAsExecutable');
    let clangdArguments = [...await config.get<string[]>('arguments')];
    if (process.platform === 'win32') {
      clangdArguments = clangdArguments.filter(argument =>
          !/^--enable-config(?:=.*)?$/i.test(argument));
      clangdArguments.push('--enable-config=true');
    }
    const compilerPath = beCoderCompilerPath(clangdPath);
    const environment = managedClangdEnvironment(
        clangdPath, compilerPath, globalStoragePath);
    if (useScriptAsExecutable) {
      let quote = (str: string) => { return `"${str}"`; };
      clangdPath = quote(clangdPath)
      for (var i = 0; i < clangdArguments.length; i++) {
        clangdArguments[i] = quote(clangdArguments[i]);
      }
    }
    const clangd: vscodelc.Executable = {
      command: clangdPath,
      args: clangdArguments,
      options: {
        cwd: vscode.workspace.rootPath || process.cwd(),
        shell: useScriptAsExecutable,
        ...(environment ? {env: environment} : {})
      }
    };
    const traceFile = await config.get<string>('trace');
    if (!!traceFile) {
      const trace = {CLANGD_TRACE: traceFile};
      const options = clangd.options ?? {};
      clangd.options = {
        ...options,
        env: {...options.env, ...trace}
      };
    }
    const serverOptions: vscodelc.ServerOptions = clangd;

    const clientOptions: vscodelc.LanguageClientOptions = {
      // Register the single server for all c-family and cuda files.
      documentSelector: clangdDocumentSelector,
      initializationOptions: {
        clangdFileStatus: true,
        fallbackFlags: await config.get<string[]>('fallbackFlags')
      },
      outputChannel: outputChannel,
      // Do not switch to output window when clangd returns output.
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,

      // We hack up the completion items a bit to prevent VSCode from re-ranking
      // and throwing away all our delicious signals like type information.
      //
      // VSCode sorts by (fuzzymatch(prefix, item.filterText), item.sortText)
      // By adding the prefix to the beginning of the filterText, we get a
      // perfect
      // fuzzymatch score for every item.
      // The sortText (which reflects clangd ranking) breaks the tie.
      // This also prevents VSCode from filtering out any results due to the
      // differences in how fuzzy filtering is applies, e.g. enable dot-to-arrow
      // fixes in completion.
      //
      // We also mark the list as incomplete to force retrieving new rankings.
      // See https://github.com/microsoft/language-server-protocol/issues/898
      middleware: {
        // GCC 14.1.0's unicode.h contains a construct that clangd 22 reports
        // as non-modifiable only while parsing the bundled libstdc++ headers.
        // Keep real diagnostics in user files visible. BeCoder's GCC-based OI
        // profile intentionally accepts the narrow C++ VLA extension used by
        // the bundled compiler, while C and all other diagnostics remain strict.
        handleDiagnostics: (uri, diagnostics, next) => {
          next(uri, diagnostics.filter(diagnostic =>
              !isKnownGccHeaderFalsePositive(uri, diagnostic) &&
              !isGccVlaExtensionDiagnostic(uri, diagnostic)));
        },
        provideCompletionItem: async (document, position, context, token,
                                      next) => {
          if (!await config.get<boolean>('enableCodeCompletion'))
            return new vscode.CompletionList([], /*isIncomplete=*/ false);
          let list = await next(document, position, context, token);
          if (!await config.get<boolean>('serverCompletionRanking'))
            return list;
          let items = (!list ? [] : Array.isArray(list) ? list : list.items);
          items = items.map(item => {
            // Gets the prefix used by VSCode when doing fuzzymatch.
            // item.range is either a Range or {inserting, replacing} (see
            // CompletionItem in the VS Code API); narrow before using.
            let prefix = '';
            if (item.range) {
              const start = item.range instanceof vscode.Range
                                ? item.range.start
                                : item.range.inserting.start;
              prefix = document.getText(new vscode.Range(start, position));
            }
            if (prefix)
              item.filterText = prefix + '_' + item.filterText;
            // Workaround for https://github.com/clangd/vscode-clangd/issues/357
            // clangd's used of commit-characters was well-intentioned, but
            // overall UX is poor. Due to vscode-languageclient bugs, we didn't
            // notice until the behavior was in several releases, so we need
            // to override it on the client.
            item.commitCharacters = [];
            // VSCode won't automatically trigger signature help when entering
            // a placeholder, e.g. if the completion inserted brackets and
            // placed the cursor inside them.
            // https://github.com/microsoft/vscode/issues/164310
            // They say a plugin should trigger this, but LSP has no mechanism.
            // https://github.com/microsoft/language-server-protocol/issues/274
            // (This workaround is incomplete, and only helps the first param).
            if (item.insertText instanceof vscode.SnippetString &&
                !item.command &&
                item.insertText.value.match(/[([{<,] ?\$\{?[01]\D/))
              item.command = {
                title: 'Signature help',
                command: 'editor.action.triggerParameterHints'
              };
            return item;
          })
          return new vscode.CompletionList(items, /*isIncomplete=*/ true);
        },
        provideHover: async (document, position, token, next) => {
          if (!await config.get<boolean>('enableHover'))
            return null;
          return next(document, position, token);
        },
        // VSCode applies fuzzy match only on the symbol name, thus it throws
        // away all results if query token is a prefix qualified name.
        // By adding the containerName to the symbol name, it prevents VSCode
        // from filtering out any results, e.g. enable workspaceSymbols for
        // qualified symbols.
        provideWorkspaceSymbols: async (query, token, next) => {
          let symbols = await next(query, token);
          return symbols?.map(symbol => {
            // Only make this adjustment if the query is in fact qualified.
            // Otherwise, we get a suboptimal ordering of results because
            // including the name's qualifier (if it has one) in symbol.name
            // means vscode can no longer tell apart exact matches from
            // partial matches.
            if (query.includes('::')) {
              if (symbol.containerName)
                symbol.name = `${symbol.containerName}::${symbol.name}`;
              // results from clangd strip the leading '::', so vscode fuzzy
              // match will filter out all results unless we add prefix back in
              if (query.startsWith('::')) {
                symbol.name = `::${symbol.name}`;
              }
              // Clean the containerName to avoid displaying it twice.
              symbol.containerName = '';
            }
            return symbol;
          })
        },
      },
    };

    const client = new ClangdLanguageClient(
        'Clang Language Server', serverOptions, clientOptions);
    client.clientOptions.errorHandler = client.createDefaultErrorHandler(
        // max restart count
        await config.get<boolean>('restartAfterCrash') ? /*default*/ 4 : 0);
    client.registerFeature(new EnableEditsNearCursorFeature);
    return client;
  }

  private constructor(subscriptions: vscode.Disposable[],
                      client: ClangdLanguageClient) {
    this.subscriptions = subscriptions;
    this.client = client;
    contextsWithFeatures.add(this);
    const startPromise = this.startClient();
    startPromises.set(this, startPromise);
    stopHandlers.set(this, async () => {
      stoppingContexts.add(this);
      this.subscriptions.forEach(d => d.dispose());
      this.subscriptions = [];
      await startPromises.get(this)?.catch(() => undefined);
      await this.client.stop();
    });
  }

  async startClient(): Promise<void> {
    if (stoppingContexts.has(this)) {
      return;
    }
    if (contextsWithFeatures.has(this)) {
      typeHierarchy.activate(this);
      inlayHints.activate(this);
      memoryUsage.activate(this);
      ast.activate(this);
      openConfig.activate(this);
      inactiveRegions.activate(this);
      await configFileWatcher.activate(this);
      fileStatus.activate(this);
      switchSourceHeader.activate(this);
    }
    if (stoppingContexts.has(this)) {
      return;
    }
    await this.client.start();
    console.log('Clang Language Server is now active!');
  }

  get visibleClangdEditors(): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter(
        (e) => isClangdDocument(e.document));
  }

  clientIsStarting() {
    return this.client && this.client.state == vscodelc.State.Starting;
  }

  clientIsRunning() {
    return this.client && this.client.state == vscodelc.State.Running;
  }

  dispose() {
    void stopClangdContext(this);
  }
}
