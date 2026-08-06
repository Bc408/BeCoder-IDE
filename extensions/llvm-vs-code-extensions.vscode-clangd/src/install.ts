import * as vscode from 'vscode';

import {bundledClangdPath} from './becoder-toolchain';

export function activate(globalStoragePath: string): string|null {
  const bundledPath = bundledClangdPath(globalStoragePath);
  if (bundledPath) {
    return bundledPath;
  }
  vscode.window.showErrorMessage(
      'BeCoder bundled clangd is unavailable. The built-in language service was not started.');
  return null;
}
