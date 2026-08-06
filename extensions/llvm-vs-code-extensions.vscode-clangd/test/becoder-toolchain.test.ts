import * as assert from 'assert';
import * as path from 'path';

import {
  bundledCompilerPath,
  managedClangdArguments,
  managedClangdUserConfigPath
} from '../src/becoder-toolchain';

suite('BeCoder toolchain isolation', () => {
  test('uses a closed clangd argument set on Windows', () => {
    assert.deepStrictEqual(managedClangdArguments(), [
      '--background-index',
      '--compile_args_from=lsp',
      '--enable-config=true'
    ]);
  });

  test('derives GCC only from the bundled clangd tree', () => {
    const clangd = path.join(
        'C:\\BeCoder', 'data', 'toolchains', 'clangd', 'clangd_22.1.6',
        'bin', 'clangd.exe');
    assert.strictEqual(
        bundledCompilerPath(clangd),
        path.join('C:\\BeCoder', 'data', 'toolchains', 'becoder-ucrt64',
                  'bin', 'g++.exe'));
  });

  test('stores user config under BeCoder extension storage', () => {
    const storage = path.join('C:\\BeCoder', 'data', 'user-data', 'clangd');
    assert.strictEqual(
        managedClangdUserConfigPath(storage),
        path.join(storage, 'clangd-user', 'AppData', 'Local', 'clangd',
                  'config.yaml'));
  });
});
