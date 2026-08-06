import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import {
  SemanticTokensCache,
  SemanticTokensRuntimeConfiguration
} from '../src/semantic-tokens-cache';
import {MockTextDocument} from './mocks';

class TestMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  keys(): readonly string[] { return [...this.values.keys()]; }

  get<T>(key: string): T|undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T|undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }
}

class BlockingMemento extends TestMemento {
  updateCount = 0;
  private releaseFirst: (() => void)|undefined;
  private readonly firstUpdate = new Promise<void>(resolve => {
    this.releaseFirst = resolve;
  });

  override async update(key: string, value: unknown): Promise<void> {
    this.updateCount++;
    if (this.updateCount === 1) await this.firstUpdate;
    await super.update(key, value);
  }

  releaseFirstUpdate(): void { this.releaseFirst!(); }
}

const testRuntime: SemanticTokensRuntimeConfiguration = {
  clangdPath: path.join('C:\\BeCoder', 'clangd', 'bin', 'clangd.exe'),
  useScriptAsExecutable: false,
  arguments: [
    '--background-index',
    '--compile_args_from=lsp',
    '--enable-config=true'
  ],
  fallbackFlags: [
    '--target=x86_64-w64-windows-gnu',
    '-DDEBUG',
    '-Wall',
    '-Wextra',
    '-Wno-deprecated-declarations',
    '-Drsize_t=size_t',
    '-D__STDC_WANT_LIB_EXT1__=1',
    '-D__float128=long double',
    '-U__SIZEOF_FLOAT128__'
  ],
  compilerPath: path.join('C:\\BeCoder', 'gcc', 'bin', 'g++.exe'),
  cCompilerPath: path.join('C:\\BeCoder', 'gcc', 'bin', 'gcc.exe'),
  standardIncludePath: path.join(
      'C:\\BeCoder', 'gcc', 'include', 'c++', '14.1.0'),
  userConfigPath: undefined
};

function createCache(storage: vscode.Memento): SemanticTokensCache {
  return new SemanticTokensCache(storage, () => testRuntime);
}

suite('SemanticTokensCache', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => { sandbox = sinon.createSandbox(); });
  teardown(() => { sandbox.restore(); });

  test('restores cached tokens and refreshes them in background', async () => {
    const cache = createCache(new TestMemento());
    const document = new MockTextDocument(vscode.Uri.file('/cached.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns('#include<bits/stdc++.h>');
    const initial = new vscode.SemanticTokens(
        new Uint32Array([0, 0, 7, 1, 0]), 'initial');
    const first = await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => initial);
    assert.strictEqual(first, initial);

    let resolveRefresh: ((value: vscode.SemanticTokens) => void)|undefined;
    const refreshed = new vscode.SemanticTokens(
        new Uint32Array([0, 0, 7, 2, 0]), 'refreshed');
    const refreshPromise = new Promise<vscode.SemanticTokens>(resolve => {
      resolveRefresh = resolve;
    });
    const cached = await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => refreshPromise);
    assert.deepStrictEqual([...cached!.data], [...initial.data]);
    assert.strictEqual(cached!.resultId, undefined);

    let refreshEvents = 0;
    const emitter = new vscode.EventEmitter<void>();
    emitter.event(() => refreshEvents++);
    cache.setRefreshEmitter(emitter);
    resolveRefresh!(refreshed);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(refreshEvents, 1);

    const live = await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => assert.fail('The completed background refresh should be reused.'));
    assert.strictEqual(live, refreshed);
    emitter.dispose();
  });

  test('does not reuse tokens after the document content changes', async () => {
    const cache = createCache(new TestMemento());
    const document = new MockTextDocument(vscode.Uri.file('/changed.cpp'), 'cpp');
    let text = '#include<bits/stdc++.h>\nint first;';
    sandbox.stub(document, 'getText').callsFake(() => text);
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([0, 4, 5, 1, 0]), 'first'));

    text = '#include<bits/stdc++.h>\nint second;';
    let liveRequests = 0;
    const expected = new vscode.SemanticTokens(
        new Uint32Array([0, 4, 6, 1, 0]), 'second');
    const result = await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token, async () => {
          liveRequests++;
          return expected;
        });
    assert.strictEqual(liveRequests, 1);
    assert.strictEqual(result, expected);
  });

  test('does not reuse tokens after the BeCoder user config changes', async () => {
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'becoder-clangd-cache-'));
    try {
      const userConfigPath = path.join(temporaryDirectory, 'config.yaml');
      fs.writeFileSync(userConfigPath, 'CompileFlags:\n  Add: [-DFIRST]\n');
      const runtime = {...testRuntime, userConfigPath};
      const storage = new TestMemento();
      const cache = new SemanticTokensCache(storage, () => runtime);
      const document = new MockTextDocument(
          vscode.Uri.file(path.join(temporaryDirectory, 'config.cpp')), 'cpp');
      sandbox.stub(document, 'getText').returns(
          '#include<bits/stdc++.h>\nint value;');
      await cache.provideDocumentSemanticTokens(
          document, new vscode.CancellationTokenSource().token,
          async () => new vscode.SemanticTokens(
              new Uint32Array([1, 4, 5, 1, 0]), 'first'));
      await new Promise(resolve => setTimeout(resolve, 0));

      fs.writeFileSync(userConfigPath, 'CompileFlags:\n  Add: [-DSECOND]\n');
      const reopened = new SemanticTokensCache(storage, () => runtime);
      const expected = new vscode.SemanticTokens(
          new Uint32Array([1, 4, 5, 2, 0]), 'live');
      const result = await reopened.provideDocumentSemanticTokens(
          document, new vscode.CancellationTokenSource().token,
          async () => expected);
      assert.strictEqual(result, expected);
    } finally {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });

  test('drops a stale background refresh after the document changes', async () => {
    const cache = createCache(new TestMemento());
    const document = new MockTextDocument(vscode.Uri.file('/stale.cpp'), 'cpp');
    let text = '#include<bits/stdc++.h>\nint first;';
    sandbox.stub(document, 'getText').callsFake(() => text);
    const initial = new vscode.SemanticTokens(
        new Uint32Array([0, 4, 5, 1, 0]), 'initial');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => initial);

    let resolveRefresh: ((value: vscode.SemanticTokens) => void)|undefined;
    let refreshCancelled = false;
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async (_document, token) => {
          token.onCancellationRequested(() => refreshCancelled = true);
          return new Promise<vscode.SemanticTokens>(resolve => {
            resolveRefresh = resolve;
          });
        });

    text = '#include<bits/stdc++.h>\nint second;';
    const expected = new vscode.SemanticTokens(
        new Uint32Array([0, 4, 6, 1, 0]), 'second');
    const live = await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => expected);
    resolveRefresh!(new vscode.SemanticTokens(
        new Uint32Array([0, 4, 5, 2, 0]), 'stale'));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(refreshCancelled, true);
    assert.strictEqual(live, expected);
  });

  test('ignores a pending refresh from a stopped client', async () => {
    const cache = createCache(new TestMemento());
    const document = new MockTextDocument(vscode.Uri.file('/restart.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns(
        '#include<bits/stdc++.h>\nint value;');
    const initial = new vscode.SemanticTokens(
        new Uint32Array([0, 4, 5, 1, 0]), 'initial');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => initial);

    let resolveRefresh: ((value: vscode.SemanticTokens) => void)|undefined;
    let refreshCancelled = false;
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async (_document, token) => {
          token.onCancellationRequested(() => refreshCancelled = true);
          return new Promise<vscode.SemanticTokens>(resolve => {
            resolveRefresh = resolve;
          });
        });
    cache.resetClient();

    let refreshEvents = 0;
    const emitter = new vscode.EventEmitter<void>();
    emitter.event(() => refreshEvents++);
    cache.setRefreshEmitter(emitter);
    resolveRefresh!(new vscode.SemanticTokens(
        new Uint32Array([0, 4, 5, 2, 0]), 'stopped'));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(refreshCancelled, true);
    assert.strictEqual(refreshEvents, 0);
    emitter.dispose();
  });

  test('reconstructs and persists semantic token edits', async () => {
    const storage = new TestMemento();
    const cache = createCache(storage);
    const document = new MockTextDocument(vscode.Uri.file('/edits.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns(
        '#include<bits/stdc++.h>\nint first, second;');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(new Uint32Array([
          0, 4, 5, 1, 0,
          0, 7, 6, 1, 0
        ]), 'full'));
    await cache.provideDocumentSemanticTokensEdits(
        document, 'full', new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokensEdits([
          new vscode.SemanticTokensEdit(8, 1, new Uint32Array([2]))
        ], 'delta'));
    await new Promise(resolve => setTimeout(resolve, 0));

    const reopened = createCache(storage);
    const restored = await reopened.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new Promise<vscode.SemanticTokens>(() => undefined));
    assert.deepStrictEqual([...restored!.data], [
      0, 4, 5, 1, 0,
      0, 7, 6, 2, 0
    ]);
    reopened.resetClient();
  });

  test('does not persist files with local include dependencies', async () => {
    const storage = new TestMemento();
    const cache = createCache(storage);
    const document = new MockTextDocument(vscode.Uri.file('/local.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns(
        '#include<bits/stdc++.h>\n#include "local.h"\nint value;');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([2, 4, 5, 1, 0]), 'initial'));

    const reopened = createCache(storage);
    const expected = new vscode.SemanticTokens(
        new Uint32Array([2, 4, 5, 2, 0]), 'live');
    const result = await reopened.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => expected);
    assert.strictEqual(result, expected);
  });

  test('does not persist files with additional angle includes', async () => {
    const storage = new TestMemento();
    const cache = createCache(storage);
    const document = new MockTextDocument(vscode.Uri.file('/angle.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns(
        '#include<bits/stdc++.h>\n#include<custom.hpp>\nint value;');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([2, 4, 5, 1, 0]), 'initial'));

    const reopened = createCache(storage);
    const expected = new vscode.SemanticTokens(
        new Uint32Array([2, 4, 5, 2, 0]), 'live');
    const result = await reopened.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => expected);
    assert.strictEqual(result, expected);
  });

  test('does not persist files with implicit include or module dependencies', async () => {
    for (const dependency of [
      '#if __has_include(<optional.hpp>)\n#endif',
      '#if __has_include_next(<optional.hpp>)\n#endif',
      '#include_next "local.hpp"',
      '#import <legacy.hpp>',
      '#embed "resource.bin"',
      'import contest.helpers;',
      'import/**/contest.helpers;',
      'export module contest;',
      'module/**/contest;'
    ]) {
      const storage = new TestMemento();
      const cache = createCache(storage);
      const document = new MockTextDocument(
          vscode.Uri.file(`/implicit-${dependency.length}.cpp`), 'cpp');
      sandbox.stub(document, 'getText').returns(
          `#include<bits/stdc++.h>\n${dependency}\nint value;`);
      await cache.provideDocumentSemanticTokens(
          document, new vscode.CancellationTokenSource().token,
          async () => new vscode.SemanticTokens(
              new Uint32Array([2, 4, 5, 1, 0]), 'initial'));

      const reopened = createCache(storage);
      const expected = new vscode.SemanticTokens(
          new Uint32Array([2, 4, 5, 2, 0]), 'live');
      const result = await reopened.provideDocumentSemanticTokens(
          document, new vscode.CancellationTokenSource().token,
          async () => expected);
      assert.strictEqual(result, expected);
    }
  });

  test('coalesces superseded persistence snapshots', async () => {
    const storage = new BlockingMemento();
    const cache = createCache(storage);
    const document = new MockTextDocument(vscode.Uri.file('/writes.cpp'), 'cpp');
    let text = '#include<bits/stdc++.h>\nint first;';
    sandbox.stub(document, 'getText').callsFake(() => text);
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([1, 4, 5, 1, 0]), 'first'));
    text = '#include<bits/stdc++.h>\nint second;';
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([1, 4, 6, 2, 0]), 'second'));
    text = '#include<bits/stdc++.h>\nint third;';
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([1, 4, 5, 3, 0]), 'third'));

    storage.releaseFirstUpdate();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(storage.updateCount, 2);

    const reopened = createCache(storage);
    const restored = await reopened.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new Promise<vscode.SemanticTokens>(() => undefined));
    assert.deepStrictEqual([...restored!.data], [1, 4, 5, 3, 0]);
    reopened.resetClient();
  });

  test('removes an old entry when a new result exceeds the size limit', async () => {
    const storage = new TestMemento();
    const cache = createCache(storage);
    const document = new MockTextDocument(vscode.Uri.file('/large.cpp'), 'cpp');
    sandbox.stub(document, 'getText').returns(
        '#include<bits/stdc++.h>\nint value;');
    await cache.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(
            new Uint32Array([1, 4, 5, 1, 0]), 'small'));
    await cache.provideDocumentSemanticTokensEdits(
        document, 'small', new vscode.CancellationTokenSource().token,
        async () => new vscode.SemanticTokens(new Uint32Array(50005), 'large'));
    await new Promise(resolve => setTimeout(resolve, 0));

    const reopened = createCache(storage);
    const expected = new vscode.SemanticTokens(
        new Uint32Array([1, 4, 5, 2, 0]), 'live');
    const result = await reopened.provideDocumentSemanticTokens(
        document, new vscode.CancellationTokenSource().token,
        async () => expected);
    assert.strictEqual(result, expected);
  });
});
