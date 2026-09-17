import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  bundledCompilerPath,
  managedClangdArguments,
  managedClangdCompileCommand
} from '../src/becoder-toolchain';
import {workspaceClangFormatForFile} from '../src/formatting';

suite('BeCoder toolchain isolation', () => {
  test('uses a closed clangd argument set on Windows', () => {
    assert.deepStrictEqual(managedClangdArguments(), [
      '--compile_args_from=lsp',
      '--enable-config=false',
      '--fallback-style=Google',
      '--header-insertion=never',
      '--clang-tidy=false'
    ]);
  });

  test('derives GCC only from the bundled clangd tree', () => {
    const clangd = path.join(
        'C:\\BeCoder', 'data', 'toolchains', 'clangd', 'clangd_22.1.6',
        'bin', 'clangd.exe');
    assert.strictEqual(
        bundledCompilerPath(clangd),
        path.join('C:\\BeCoder', 'data', 'toolchains', 'ucrt64',
                  'bin', 'g++.exe'));
  });

  test('supplies private language-specific compile commands through LSP', () => {
    const compiler = path.join('C:\\BeCoder', 'toolchains', 'bin', 'g++.exe');
    const cFile = path.join('C:\\workspace', 'main.c');
    const cppFile = path.join('C:\\workspace', 'main.cpp');
    const cCommand = managedClangdCompileCommand(cFile, 'c', compiler);
    const cppCommand = managedClangdCompileCommand(cppFile, 'cpp', compiler);

    assert.strictEqual(cCommand.workingDirectory, path.dirname(cFile));
    assert.strictEqual(cCommand.compilationCommand[0],
                       compiler.replace(/g\+\+\.exe$/i, 'gcc.exe'));
    assert.ok(cCommand.compilationCommand.includes('-xc'));
    assert.ok(cCommand.compilationCommand.includes('-std=c17'));
    assert.ok(!cCommand.compilationCommand.includes('bits/debugger.h'));
    assert.strictEqual(
        cCommand.compilationCommand[cCommand.compilationCommand.length - 1],
        cFile);

    assert.strictEqual(cppCommand.compilationCommand[0], compiler);
    assert.ok(cppCommand.compilationCommand.includes('-xc++'));
    assert.ok(cppCommand.compilationCommand.includes('-std=c++20'));
    const debuggerFlagIndex = cppCommand.compilationCommand.indexOf('-include');
    assert.ok(debuggerFlagIndex >= 0);
    assert.strictEqual(cppCommand.compilationCommand[debuggerFlagIndex + 1],
                       'bits/debugger.h');
    assert.strictEqual(
        cppCommand.compilationCommand[cppCommand.compilationCommand.length - 1],
        cppFile);

    const posixCompiler = '/opt/homebrew/bin/g++-16';
    const posixCommand = managedClangdCompileCommand(
        '/tmp/main.c', 'c', posixCompiler, ['-Wall']);
    assert.strictEqual(posixCommand.compilationCommand[0],
                       '/opt/homebrew/bin/gcc-16');
    assert.deepStrictEqual(posixCommand.compilationCommand.slice(1), [
      '-Wall', '-xc', '-std=c17', '/tmp/main.c'
    ]);
  });

  test('accepts only a workspace-contained .clang-format', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-format-'));
    try {
      const workspace = path.join(root, 'workspace');
      const source = path.join(workspace, 'src', 'main.cpp');
      fs.mkdirSync(path.dirname(source), {recursive: true});
      fs.writeFileSync(source, 'int main(){}');
      fs.writeFileSync(path.join(root, '.clang-format'), 'BasedOnStyle: LLVM');
      assert.strictEqual(
          workspaceClangFormatForFile(source, workspace), undefined);

      const workspaceConfig = path.join(workspace, '.clang-format');
      fs.writeFileSync(workspaceConfig, 'BasedOnStyle: Google');
      assert.strictEqual(
          workspaceClangFormatForFile(source, workspace), workspaceConfig);

      fs.writeFileSync(workspaceConfig, 'BasedOnStyle: InheritParentConfig');
      assert.strictEqual(
          workspaceClangFormatForFile(source, workspace), undefined);

      fs.rmSync(workspaceConfig);
      fs.writeFileSync(path.join(workspace, '_clang-format'),
                       'BasedOnStyle: LLVM');
      assert.strictEqual(
          workspaceClangFormatForFile(source, workspace), undefined);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
