import * as vscode from 'vscode';

import {ClangdExtension} from '../api/vscode-clangd';

import {ClangdExtensionImpl} from './api';
import {ClangdContext, stopClangdContext} from './clangd-context';
import {get, update} from './config';

let apiInstance: ClangdExtensionImpl|undefined;

async function isClangdEnabled(): Promise<boolean> {
  return process.platform === 'win32' || await get<boolean>('enable');
}

/**
 *  This method is called when the extension is activated. The extension is
 *  activated the very first time a command is executed.
 */
export async function activate(context: vscode.ExtensionContext):
    Promise<ClangdExtension> {
  const outputChannel = vscode.window.createOutputChannel('clangd');
  context.subscriptions.push(outputChannel);

  let clangdContext: ClangdContext|null = null;
  let restartPromise: Promise<void>|undefined;

  const isClangdStartingOrRunning = (): boolean =>
      Boolean(clangdContext &&
          (clangdContext.clientIsStarting() || clangdContext.clientIsRunning()));

  context.subscriptions.push(
      vscode.commands.registerCommand('clangd.activate', async () => {
        if (isClangdStartingOrRunning()) {
          return;
        }
        vscode.commands.executeCommand('clangd.restart');
      }));
  context.subscriptions.push(
      vscode.commands.registerCommand('clangd.restart', async () => {
        if (restartPromise) {
          await restartPromise;
          return;
        }
        if (!await isClangdEnabled()) {
          vscode.window
              .showInformationMessage(
                  'Language features from Clangd are currently disabled. Would you like to enable them?',
                  'Enable', 'Close')
              .then(async (choice) => {
                if (choice === 'Enable') {
                  await update<boolean>('enable', true);
                  vscode.commands.executeCommand('clangd.restart');
                }
              });
          return;
        }

        // clangd.restart can be called when the extension is not yet activated.
        // In such a case, vscode will activate the extension and then run this
        // handler. Detect this situation and bail out (doing an extra
        // stop/start cycle in this situation is pointless, and doesn't work
        // anyways because the client can't be stop()-ped when it's still in the
        // Starting state).
        if (clangdContext?.clientIsStarting()) {
          return;
        }
        restartPromise = (async () => {
          if (clangdContext) {
            await stopClangdContext(clangdContext);
          }
          clangdContext = await ClangdContext.create(
              context.globalStoragePath, outputChannel);
          if (clangdContext) {
            context.subscriptions.push(clangdContext);
          }
          if (apiInstance) {
            apiInstance.client = clangdContext?.client;
          }
        })();
        try {
          await restartPromise;
        } finally {
          restartPromise = undefined;
        }
      }));
  context.subscriptions.push(
      vscode.commands.registerCommand('clangd.shutdown', async () => {
        if (clangdContext?.clientIsStarting()) {
          return;
        }
        if (clangdContext) {
          await stopClangdContext(clangdContext);
          clangdContext = null;
        }
        if (apiInstance) {
          apiInstance.client = undefined;
        }
      }));

  if (await isClangdEnabled()) {
    clangdContext = await ClangdContext.create(
        context.globalStoragePath, outputChannel);
    if (clangdContext) {
      context.subscriptions.push(clangdContext);
    }
  }

  apiInstance = new ClangdExtensionImpl(clangdContext?.client);
  return apiInstance;
}
