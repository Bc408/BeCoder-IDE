import * as vscode from 'vscode';

import {ClangdContext} from './clangd-context';

export async function activate(context: vscode.ExtensionContext):
    Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
      'BeCoder C/C++ Intelligence');
  context.subscriptions.push(outputChannel);

  const clangdContext = await ClangdContext.create(
      context.globalStoragePath, outputChannel);
  if (clangdContext) {
    context.subscriptions.push(clangdContext);
  }
}
