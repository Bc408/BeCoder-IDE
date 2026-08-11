import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';

import {ClangdContext} from './clangd-context';

interface InactiveRegionsParams {
  textDocument: vscodelc.VersionedTextDocumentIdentifier;
  regions: vscodelc.Range[];
}

const notificationType =
    new vscodelc.NotificationType<InactiveRegionsParams>(
        'textDocument/inactiveRegions');

export function activate(context: ClangdContext): void {
  const feature = new InactiveRegionsFeature(context);
  context.client.registerFeature(feature);
  context.client.onNotification(
      notificationType, params => feature.handleNotification(params));
}

export class InactiveRegionsFeature implements vscodelc.StaticFeature {
  private readonly files = new Map<string, vscode.Range[]>();
  private readonly listeners: vscode.Disposable[] = [];
  private decorationType: vscode.TextEditorDecorationType|undefined;

  constructor(private readonly context: ClangdContext) {}

  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {
    if (capabilities.textDocument) {
      const textDocumentCapabilities = capabilities.textDocument as
          vscodelc.TextDocumentClientCapabilities&{
            inactiveRegionsCapabilities?: {inactiveRegions: boolean}
          };
      textDocumentCapabilities.inactiveRegionsCapabilities = {
        inactiveRegions: true
      };
    }
  }

  initialize(capabilities: vscodelc.ServerCapabilities): void {
    const serverCapabilities = capabilities as
        vscodelc.ServerCapabilities&{inactiveRegionsProvider?: boolean};
    if (!serverCapabilities.inactiveRegionsProvider) {
      return;
    }

    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      opacity: '0.55'
    });
    this.listeners.push(vscode.window.onDidChangeVisibleTextEditors(
        editors => editors.forEach(
            editor => this.applyHighlights(editor.document.fileName))));
  }

  handleNotification(params: InactiveRegionsParams): void {
    const filePath = vscode.Uri.parse(params.textDocument.uri, true).fsPath;
    this.files.set(
        filePath,
        params.regions.map(
            region => this.context.client.protocol2CodeConverter.asRange(
                region)));
    this.applyHighlights(filePath);
  }

  private applyHighlights(filePath: string): void {
    const ranges = this.files.get(filePath);
    if (!ranges || !this.decorationType) {
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.fileName === filePath) {
        editor.setDecorations(this.decorationType, ranges);
      }
    }
  }

  getState(): vscodelc.FeatureState {
    return {kind: 'static'};
  }

  clear(): void {
    this.decorationType?.dispose();
    for (const listener of this.listeners) {
      listener.dispose();
    }
    this.listeners.length = 0;
    this.files.clear();
  }
}
