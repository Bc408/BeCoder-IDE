import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';

let formattingDocumentSequence = 0;

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' &&
       !path.isAbsolute(relative));
}

function containsParentStyle(configPath: string): boolean {
  try {
    return /\bInheritParentConfig\b/i.test(
        fs.readFileSync(configPath, 'utf8'));
  } catch {
    return true;
  }
}

export function workspaceClangFormatForFile(
    filePath: string, workspacePath: string): string|undefined {
  const resolvedFile = path.resolve(filePath);
  const resolvedWorkspace = path.resolve(workspacePath);
  if (!isPathInside(resolvedFile, resolvedWorkspace)) {
    return undefined;
  }

  let directory = path.dirname(resolvedFile);
  while (isPathInside(directory, resolvedWorkspace)) {
    const dotConfig = path.join(directory, '.clang-format');
    const underscoreConfig = path.join(directory, '_clang-format');
    if (fs.existsSync(dotConfig)) {
      try {
        const realWorkspace = fs.realpathSync.native(resolvedWorkspace);
        const realConfig = fs.realpathSync.native(dotConfig);
        if (!isPathInside(realConfig, realWorkspace) ||
            containsParentStyle(dotConfig)) {
          return undefined;
        }
      } catch {
        return undefined;
      }
      return dotConfig;
    }
    if (fs.existsSync(underscoreConfig)) {
      return undefined;
    }
    if (directory === resolvedWorkspace) {
      break;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return undefined;
}

function usesWorkspaceClangFormat(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') {
    return false;
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
    return false;
  }
  return workspaceClangFormatForFile(
             document.uri.fsPath, workspaceFolder.uri.fsPath) !== undefined;
}

function isolatedFormattingRoot(document: vscode.TextDocument): string {
  if (process.platform === 'win32') {
    // clangd accepts this impossible Windows drive for an in-memory file URI.
    // It can never acquire a real root-level formatting configuration.
    return `0:${path.sep}`;
  }

  const volumeRoot = path.parse(document.uri.fsPath || process.cwd()).root;
  for (const name of ['.clang-format', '_clang-format']) {
    if (fs.existsSync(path.join(volumeRoot, name))) {
      throw new Error(
          `BeCoder cannot isolate Google formatting because ${name} exists at ${volumeRoot}.`);
    }
  }
  return volumeRoot;
}

function isolatedFormattingUri(document: vscode.TextDocument): vscode.Uri {
  const volumeRoot = isolatedFormattingRoot(document);
  const sourceExtension = path.extname(document.uri.fsPath);
  const extension = sourceExtension ||
      (document.languageId === 'c' ? '.c' : '.cpp');
  formattingDocumentSequence++;
  return vscode.Uri.file(path.join(
      volumeRoot, '.becoder-format',
      `${process.pid}-${formattingDocumentSequence}${extension}`));
}

function fileFormattingOptions(document: vscode.TextDocument) {
  const configuration = vscode.workspace.getConfiguration('files', document);
  return {
    trimTrailingWhitespace:
        configuration.get<boolean>('trimTrailingWhitespace'),
    trimFinalNewlines: configuration.get<boolean>('trimFinalNewlines'),
    insertFinalNewline: configuration.get<boolean>('insertFinalNewline')
  };
}

async function withIsolatedDocument<T>(
    client: vscodelc.LanguageClient, document: vscode.TextDocument,
    request: (uri: string) => Promise<T>): Promise<T> {
  const uri = isolatedFormattingUri(document).toString();
  await client.sendNotification(vscodelc.DidOpenTextDocumentNotification.type, {
    textDocument: {
      uri,
      languageId: document.languageId,
      version: document.version,
      text: document.getText()
    }
  });
  try {
    return await request(uri);
  } finally {
    try {
      await client.sendNotification(
          vscodelc.DidCloseTextDocumentNotification.type,
          {textDocument: {uri}});
    } catch {
      // The language client may already be stopping.
    }
  }
}

export async function provideDocumentFormattingEdits(
    client: vscodelc.LanguageClient, document: vscode.TextDocument,
    options: vscode.FormattingOptions, token: vscode.CancellationToken,
    next: (document: vscode.TextDocument, options: vscode.FormattingOptions,
           token: vscode.CancellationToken) =>
        vscode.ProviderResult<vscode.TextEdit[]>):
    Promise<vscode.TextEdit[]|null|undefined> {
  if (usesWorkspaceClangFormat(document)) {
    return await next(document, options, token);
  }
  return await withIsolatedDocument(client, document, async uri => {
    const result = await client.sendRequest(
        vscodelc.DocumentFormattingRequest.type, {
          textDocument: {uri},
          options: client.code2ProtocolConverter.asFormattingOptions(
              options, fileFormattingOptions(document))
        }, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return await client.protocol2CodeConverter.asTextEdits(result, token);
  });
}

export async function provideDocumentRangeFormattingEdits(
    client: vscodelc.LanguageClient, document: vscode.TextDocument,
    range: vscode.Range, options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
    next: (document: vscode.TextDocument, range: vscode.Range,
           options: vscode.FormattingOptions, token: vscode.CancellationToken) =>
        vscode.ProviderResult<vscode.TextEdit[]>):
    Promise<vscode.TextEdit[]|null|undefined> {
  if (usesWorkspaceClangFormat(document)) {
    return await next(document, range, options, token);
  }
  return await withIsolatedDocument(client, document, async uri => {
    const result = await client.sendRequest(
        vscodelc.DocumentRangeFormattingRequest.type, {
          textDocument: {uri},
          range: client.code2ProtocolConverter.asRange(range),
          options: client.code2ProtocolConverter.asFormattingOptions(
              options, fileFormattingOptions(document))
        }, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return await client.protocol2CodeConverter.asTextEdits(result, token);
  });
}
