import * as assert from 'assert';
import * as vscodelc from 'vscode-languageclient/node';

import {ClangdLanguageClient} from '../src/clangd-context';

suite('BeCoder clangd visual feature boundary', () => {
  test('does not register semantic tokens or inlay hints', () => {
    const client = new ClangdLanguageClient(
        'BeCoder visual feature test', {command: process.execPath},
        {documentSelector: []});

    assert.strictEqual(
        client.getFeature(vscodelc.SemanticTokensRegistrationType.method),
        undefined);
    assert.strictEqual(
        client.getFeature(vscodelc.InlayHintRequest.method), undefined);
    assert.ok(client.getFeature(vscodelc.HoverRequest.method));
  });
});
