import * as assert from 'assert';
import * as vscodelc from 'vscode-languageclient/node';

import {
  approvedStaticFeatureNames,
  ClangdLanguageClient,
  configureManagedDocumentBeforeOpen
} from '../src/clangd-context';

suite('BeCoder clangd capability boundary', () => {
  test('registers only approved language providers', () => {
    const client = new ClangdLanguageClient(
        'BeCoder capability test', {command: process.execPath},
        {documentSelector: []});

    for (const method of [
      vscodelc.CompletionRequest.method,
      vscodelc.SignatureHelpRequest.method,
      vscodelc.HoverRequest.method,
      vscodelc.DefinitionRequest.method,
      vscodelc.ReferencesRequest.method,
      vscodelc.RenameRequest.method,
      vscodelc.SemanticTokensRegistrationType.method,
      vscodelc.DocumentFormattingRequest.method,
      vscodelc.DocumentRangeFormattingRequest.method
    ]) {
      assert.ok(client.getFeature(method as any), method);
    }

    for (const method of [
      vscodelc.DocumentHighlightRequest.method,
      vscodelc.DocumentSymbolRequest.method,
      vscodelc.WorkspaceSymbolRequest.method,
      vscodelc.CodeActionRequest.method,
      vscodelc.CodeLensRequest.method,
      vscodelc.DocumentOnTypeFormattingRequest.method,
      vscodelc.DocumentLinkRequest.method,
      vscodelc.TypeDefinitionRequest.method,
      vscodelc.ImplementationRequest.method,
      vscodelc.DeclarationRequest.method,
      vscodelc.FoldingRangeRequest.method,
      vscodelc.SelectionRangeRequest.method,
      vscodelc.CallHierarchyPrepareRequest.method,
      vscodelc.LinkedEditingRangeRequest.method,
      vscodelc.TypeHierarchyPrepareRequest.method,
      vscodelc.InlineValueRequest.method,
      vscodelc.InlayHintRequest.method,
      vscodelc.DocumentDiagnosticRequest.method,
      vscodelc.ExecuteCommandRequest.method
    ]) {
      assert.strictEqual(client.getFeature(method as any), undefined, method);
    }

    const registeredFeatureNames =
        ((client as any)._features as Array<{constructor: {name: string}}>)
            .map(feature => feature.constructor.name);
    assert.ok(registeredFeatureNames.includes('ProgressFeature'));
    assert.ok(
        registeredFeatureNames.includes('EnableEditsNearCursorFeature'));
    assert.ok(!registeredFeatureNames.includes('ConfigurationFeature'));
    assert.deepStrictEqual([...approvedStaticFeatureNames].sort(), [
      'EnableEditsNearCursorFeature',
      'InactiveRegionsFeature',
      'ProgressFeature'
    ]);
  });

  test('sends each managed compile command before opening its document',
       async () => {
         const events: string[] = [];
         const compiler = 'C:\\BeCoder\\toolchains\\bin\\g++.exe';
         const cppDocument = {
           uri: {scheme: 'file', fsPath: 'C:\\workspace\\main.cpp'},
           languageId: 'cpp'
         } as any;
         const cDocument = {
           uri: {scheme: 'file', fsPath: 'C:\\workspace\\main.c'},
           languageId: 'c'
         } as any;

         for (const document of [cppDocument, cDocument]) {
           await configureManagedDocumentBeforeOpen(
               document, compiler, ['-Wall'], async configuration => {
                 const command =
                     configuration.settings.compilationDatabaseChanges[
                         document.uri.fsPath].compilationCommand;
                 events.push(`configure:${command.join(' ')}`);
               }, async () => { events.push(`open:${document.languageId}`); });
         }

         assert.deepStrictEqual(events, [
           'configure:C:\\BeCoder\\toolchains\\bin\\g++.exe -Wall -xc++ -std=c++20 C:\\workspace\\main.cpp',
           'open:cpp',
           'configure:C:\\BeCoder\\toolchains\\bin\\gcc.exe -Wall -xc -std=c17 C:\\workspace\\main.c',
           'open:c'
         ]);
       });
});
