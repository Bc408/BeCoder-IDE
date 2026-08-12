/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';

import {
  bundledCompilerPath,
  managedClangdArguments,
  managedClangdCompileCommand,
  managedClangdFallbackFlags
} from './becoder-toolchain';
import {
  provideDocumentFormattingEdits,
  provideDocumentRangeFormattingEdits
} from './formatting';
import * as inactiveRegions from './inactive-regions';
import * as install from './install';

export const clangdDocumentSelector = [
  {scheme: 'file', language: 'c'},
  {scheme: 'file', language: 'cpp'},
  {scheme: 'file', language: 'cuda-cpp'},
  {scheme: 'file', language: 'objective-c'},
  {scheme: 'file', language: 'objective-cpp'},
];

export const approvedTextDocumentFeatureMethods = new Set([
  'textDocument/didOpen',
  'textDocument/didChange',
  'textDocument/didClose',
  'textDocument/didSave',
  'textDocument/completion',
  'textDocument/signatureHelp',
  'textDocument/hover',
  'textDocument/definition',
  'textDocument/references',
  'textDocument/rename',
  'textDocument/inlayHint',
  'textDocument/semanticTokens',
  'textDocument/formatting',
  'textDocument/rangeFormatting'
]);

export const approvedStaticFeatureNames = new Set([
  'EnableEditsNearCursorFeature',
  'InactiveRegionsFeature',
  'ProgressFeature'
]);

function beCoderCompilerPath(clangdPath: string): string|undefined {
  if (process.platform === 'win32') {
    return bundledCompilerPath(clangdPath);
  }
  return vscode.workspace.getConfiguration('becoder.toolchain')
      .get<string>('compilerPath') || undefined;
}

function managedClangdEnvironment(
    clangdPath: string, compilerPath: string|undefined,
    globalStoragePath: string): Record<string, string>|undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }

  const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
  if (!systemRoot) {
    throw new Error('Windows SystemRoot is unavailable.');
  }

  const environment: Record<string, string> = {};
  for (const name of [
    'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'OS', 'PATHEXT',
    'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
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
  const managedConfig = path.join(managedUserRoot, '.config');
  for (const directory of [
    temporaryDirectory, managedLocalAppData, managedAppData, managedConfig
  ]) {
    fs.mkdirSync(directory, {recursive: true});
  }

  environment['TEMP'] = temporaryDirectory;
  environment['TMP'] = temporaryDirectory;
  environment['USERPROFILE'] = managedUserRoot;
  environment['HOMEDRIVE'] = path.parse(managedUserRoot).root.slice(0, 2);
  environment['HOMEPATH'] = managedUserRoot.slice(2);
  environment['LOCALAPPDATA'] = managedLocalAppData;
  environment['APPDATA'] = managedAppData;
  environment['HOME'] = managedUserRoot;
  environment['XDG_CONFIG_HOME'] = managedConfig;
  environment['PATH'] = [
    path.dirname(clangdPath),
    compilerPath ? path.dirname(compilerPath) : undefined,
    path.join(systemRoot, 'System32')
  ].filter((entry): entry is string => Boolean(entry)).join(path.delimiter);
  return environment;
}

export class ClangdLanguageClient extends vscodelc.LanguageClient {
  override registerFeature(
      feature: vscodelc.StaticFeature|vscodelc.DynamicFeature<any>): void {
    const registrationMethod =
        (feature as {registrationType?: {method?: string}})
            .registrationType?.method;
    if (!registrationMethod &&
        !approvedStaticFeatureNames.has(feature.constructor.name)) {
      return;
    }
    if (registrationMethod?.startsWith('textDocument/') &&
        !approvedTextDocumentFeatureMethods.has(registrationMethod)) {
      return;
    }
    if (registrationMethod?.startsWith('workspace/') ||
        registrationMethod?.startsWith('notebookDocument/')) {
      return;
    }
    super.registerFeature(feature);
  }
}

class EnableEditsNearCursorFeature implements vscodelc.StaticFeature {
  initialize() {}
  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {
    const completionCapabilities: any = capabilities.textDocument?.completion;
    completionCapabilities.editsNearCursor = true;
  }
  getState(): vscodelc.FeatureState { return {kind: 'static'}; }
  clear() {}
}

const stopHandlers = new WeakMap<ClangdContext, () => Promise<void>>();
const pendingStops = new WeakMap<ClangdContext, Promise<void>>();

interface ManagedDocumentConfiguration {
  settings: {
    compilationDatabaseChanges: Record<string, {
      workingDirectory: string;
      compilationCommand: string[];
    }>;
  };
}

export async function configureManagedDocumentBeforeOpen(
    document: Pick<vscode.TextDocument, 'uri'|'languageId'>,
    compilerPath: string|undefined, fallbackFlags: readonly string[],
    sendConfiguration: (configuration: ManagedDocumentConfiguration) =>
        Promise<void>,
    openDocument: () => Promise<void>): Promise<void> {
  if (compilerPath && document.uri.scheme === 'file') {
    await sendConfiguration({
      settings: {
        compilationDatabaseChanges: {
          [document.uri.fsPath]: managedClangdCompileCommand(
              document.uri.fsPath, document.languageId, compilerPath,
              fallbackFlags)
        }
      }
    });
  }
  await openDocument();
}

export async function stopClangdContext(context: ClangdContext): Promise<void> {
  const pending = pendingStops.get(context);
  if (pending) {
    await pending;
    return;
  }
  const stop = stopHandlers.get(context);
  if (!stop) {
    return;
  }
  const stopping = stop();
  pendingStops.set(context, stopping);
  await stopping;
}

export class ClangdContext implements vscode.Disposable {
  static async create(globalStoragePath: string,
                      outputChannel: vscode.OutputChannel):
      Promise<ClangdContext|null> {
    const clangdPath = install.activate(globalStoragePath);
    if (!clangdPath) {
      return null;
    }
    const compilerPath = beCoderCompilerPath(clangdPath);
    if (process.platform === 'win32' &&
        (!fs.existsSync(clangdPath) || !compilerPath ||
         !fs.existsSync(compilerPath))) {
      vscode.window.showErrorMessage(
          'BeCoder bundled clangd or GCC is unavailable. The built-in language service was not started.');
      return null;
    }

    const client = ClangdContext.createClient(
        clangdPath, compilerPath, outputChannel, globalStoragePath);
    const context = new ClangdContext(client);
    await client.start();
    return context;
  }

  private static createClient(
      clangdPath: string, compilerPath: string|undefined,
      outputChannel: vscode.OutputChannel,
      globalStoragePath: string): ClangdLanguageClient {
    const environment = managedClangdEnvironment(
        clangdPath, compilerPath, globalStoragePath);
    const serverOptions: vscodelc.ServerOptions = {
      command: clangdPath,
      args: managedClangdArguments(),
      options: {
        cwd: vscode.workspace.rootPath || process.cwd(),
        ...(environment ? {env: environment} : {})
      }
    };
    const fallbackFlags = process.platform === 'win32' && compilerPath
        ? managedClangdFallbackFlags(compilerPath)
        : ['-Wall', '-Wextra', '-Wno-deprecated-declarations'];

    let client: ClangdLanguageClient;
    const clientOptions: vscodelc.LanguageClientOptions = {
      documentSelector: clangdDocumentSelector,
      initializationOptions: {fallbackFlags},
      outputChannel,
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
      middleware: {
        didOpen: (document, next) => configureManagedDocumentBeforeOpen(
            document, compilerPath, fallbackFlags,
            configuration => client.sendNotification(
                vscodelc.DidChangeConfigurationNotification.type,
                configuration),
            () => next(document)),
        handleDiagnostics: (uri, _diagnostics, next) => next(uri, []),
        provideInlayHints: (document, range, token, next) => {
          const enabled = vscode.workspace
                              .getConfiguration(
                                  'becoder.inlayHints', document.uri)
                              .get<boolean>('enabled', false);
          return enabled ? next(document, range, token) : [];
        },
        provideCompletionItem: async (document, position, context, token,
                                      next) => {
          const provided = await next(document, position, context, token);
          const items = !provided ? [] :
              Array.isArray(provided) ? provided : provided.items;
          for (const item of items) {
            let prefix = '';
            if (item.range) {
              const start = item.range instanceof vscode.Range
                  ? item.range.start
                  : item.range.inserting.start;
              prefix = document.getText(new vscode.Range(start, position));
            }
            if (prefix) {
              item.filterText = `${prefix}_${item.filterText ?? item.label}`;
            }
            item.commitCharacters = [];
            item.additionalTextEdits = undefined;
            if (item.insertText instanceof vscode.SnippetString &&
                !item.command &&
                item.insertText.value.match(/[([{<,] ?\$\{?[01]\D/)) {
              item.command = {
                title: 'Signature help',
                command: 'editor.action.triggerParameterHints'
              };
            }
          }
          return new vscode.CompletionList(items, /*isIncomplete=*/ true);
        },
        provideDocumentFormattingEdits: (...args) =>
            provideDocumentFormattingEdits(client, ...args),
        provideDocumentRangeFormattingEdits: (...args) =>
            provideDocumentRangeFormattingEdits(client, ...args)
      }
    };

    client = new ClangdLanguageClient(
        'BeCoder C/C++ Intelligence', serverOptions, clientOptions);
    client.clientOptions.errorHandler = client.createDefaultErrorHandler(4);
    client.registerFeature(new EnableEditsNearCursorFeature);
    return client;
  }

  private stopping = false;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(readonly client: ClangdLanguageClient) {
    inactiveRegions.activate(this);
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('becoder.inlayHints.enabled')) {
        return;
      }
      const feature = this.client.getFeature(vscodelc.InlayHintRequest.method);
      for (const editor of vscode.window.visibleTextEditors) {
        feature.getProvider(editor.document)?.onDidChangeInlayHints.fire();
      }
    }));
    stopHandlers.set(this, async () => {
      if (this.stopping) {
        return;
      }
      this.stopping = true;
      await this.client.stop();
    });
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    void stopClangdContext(this);
  }
}
