/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscodelc from 'vscode-languageclient/node';

import {reclassifyCallableVariables} from '../src/callable-semantic-tokens';
import {
  approvedStaticFeatureNames,
  ClangdLanguageClient,
  configureManagedDocumentBeforeOpen
} from '../src/clangd-context';

suite('BeCoder clangd capability boundary', () => {
  test('classifies callable variables as functions without changing values', () => {
    const source = [
      'int n = 0;',
      'auto value = 1;',
      'auto update = []() {};',
      'function<void()> traceback = []() {};',
      'std::function<int(int)> transform;',
      'Callable cmp;',
      'n++; value++; ranges::sort(value); cmp();',
      'update(update); traceback(traceback); transform(transform, 1); object.update();'
    ].join('\n');
    const variableType = 1;
    const functionType = 0;
    const declaration = 1;
    const entries = [
      {line: 0, character: 4, text: 'n', declaration: true},
      {line: 1, character: 5, text: 'value', declaration: true},
      {line: 2, character: 5, text: 'update', declaration: true},
      {line: 3, character: 17, text: 'traceback', declaration: true},
      {line: 4, character: 24, text: 'transform', declaration: true},
      {line: 5, character: 9, text: 'cmp', declaration: true},
      {line: 6, character: 0, text: 'n', declaration: false},
      {line: 6, character: 5, text: 'value', declaration: false},
      {line: 6, character: 22, text: 'sort', declaration: false},
      {line: 6, character: 27, text: 'value', declaration: false},
      {line: 6, character: 35, text: 'cmp', declaration: false},
      {line: 7, character: 0, text: 'update', declaration: false},
      {line: 7, character: 7, text: 'update', declaration: false},
      {line: 7, character: 16, text: 'traceback', declaration: false},
      {line: 7, character: 26, text: 'traceback', declaration: false},
      {line: 7, character: 38, text: 'transform', declaration: false},
      {line: 7, character: 48, text: 'transform', declaration: false},
      {line: 7, character: 70, text: 'update', declaration: false}
    ];
    const lines = source.split('\n');
    const data: number[] = [];
    let previousLine = 0;
    let previousCharacter = 0;
    for (const entry of entries) {
      const deltaLine = entry.line - previousLine;
      data.push(
          deltaLine,
          deltaLine === 0 ? entry.character - previousCharacter : entry.character,
          entry.text.length, variableType, entry.declaration ? declaration : 0);
      previousLine = entry.line;
      previousCharacter = entry.character;
    }

    const result = reclassifyCallableVariables(
        source, new Uint32Array(data), {
          tokenTypes: ['function', 'variable'],
          tokenModifiers: ['declaration', 'definition', 'functionScope']
        });
    const resultTypes = [];
    for (let index = 3; index < result.length; index += 5) {
      resultTypes.push(result[index]);
    }
    assert.deepStrictEqual(resultTypes, [
      variableType,
      variableType,
      functionType,
      functionType,
      functionType,
      variableType,
      variableType,
      variableType,
      variableType,
      variableType,
      variableType,
      functionType,
      functionType,
      functionType,
      functionType,
      functionType,
      functionType,
      variableType
    ]);
  });

  test('keeps semantic tokens unchanged without a usable legend', () => {
    const tokens = new Uint32Array([0, 0, 4, 0, 0]);
    assert.strictEqual(
        reclassifyCallableVariables(
            'name();', tokens,
            {tokenTypes: ['variable'], tokenModifiers: []}),
        tokens);
  });

  test('does not classify qualified names inside callable arguments', () => {
    const source = 'auto dfs = []() {};\ndfs(dfs, object.dfs());';
    const variableType = 1;
    const functionType = 0;
    const declaration = 1;
    const tokens = new Uint32Array([
      0, 5, 3, variableType, declaration,
      1, 0, 3, variableType, 0,
      0, 4, 3, variableType, 0,
      0, 12, 3, variableType, 0
    ]);

    const result = reclassifyCallableVariables(source, tokens, {
      tokenTypes: ['function', 'variable'],
      tokenModifiers: ['declaration', 'definition', 'functionScope']
    });
    assert.deepStrictEqual(
        [result[3], result[8], result[13], result[18]],
        [functionType, functionType, functionType, variableType]);
  });

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
      vscodelc.InlayHintRequest.method,
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
      vscodelc.DocumentDiagnosticRequest.method,
      vscodelc.ExecuteCommandRequest.method
    ]) {
      assert.strictEqual(client.getFeature(method as any), undefined, method);
    }

    const registeredFeatureNames =
        ((client as any)._features as Array<{constructor: {name: string}}>)
            .map(feature => feature.constructor.name);
    assert.ok(registeredFeatureNames.includes('ProgressFeature'));
    assert.ok(!registeredFeatureNames.includes('EnableEditsNearCursorFeature'));
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
