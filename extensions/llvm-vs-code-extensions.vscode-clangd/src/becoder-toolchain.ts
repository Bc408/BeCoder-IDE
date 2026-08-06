import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function bundledToolchainRoot(
    globalStoragePath?: string): string|undefined {
  const extensionPath = vscode.extensions.getExtension(
      'llvm-vs-code-extensions.vscode-clangd')?.extensionPath;
  if (!extensionPath) return undefined;
  const packagedRoot = path.resolve(
      extensionPath, '..', '..', '..', '..', 'data', 'toolchains');
  if (fs.existsSync(packagedRoot)) return packagedRoot;
  const portableRoot = process.env['VSCODE_PORTABLE'];
  if (portableRoot) return path.join(portableRoot, 'toolchains');
  return globalStoragePath
      ? path.resolve(
          globalStoragePath, '..', '..', '..', 'toolchains')
      : undefined;
}

export function bundledClangdPath(
    globalStoragePath?: string): string|undefined {
  const toolchainRoot = bundledToolchainRoot(globalStoragePath);
  if (!toolchainRoot) return undefined;
  const executable = process.platform === 'win32' ? 'clangd.exe' : 'clangd';
  const clangdPath = path.join(
      toolchainRoot, 'clangd', 'clangd_22.1.6', 'bin', executable);
  return fs.existsSync(clangdPath) ? clangdPath : undefined;
}

export function bundledCompilerPath(clangdPath: string): string {
  const toolchainRoot = path.resolve(
      path.dirname(clangdPath), '..', '..', '..');
  return path.join(toolchainRoot, 'becoder-ucrt64', 'bin', 'g++.exe');
}

export function managedClangdArguments(): string[] {
  return [
    '--compile_args_from=lsp',
    '--enable-config=false',
    '--fallback-style=Google',
    '--header-insertion=never',
    '--clang-tidy=false'
  ];
}

export function managedClangdFallbackFlags(compilerPath: string): string[] {
  const toolchainRoot = path.dirname(path.dirname(compilerPath));
  const standardInclude = path.join(
      toolchainRoot, 'include', 'c++', '14.1.0');
  const targetInclude = path.join(
      standardInclude, 'x86_64-w64-mingw32');
  const gccInclude = path.join(
      toolchainRoot, 'lib', 'gcc', 'x86_64-w64-mingw32', '14.1.0',
      'include');
  const includeFixed = path.join(
      toolchainRoot, 'lib', 'gcc', 'x86_64-w64-mingw32', '14.1.0',
      'include-fixed');
  const includeFlags = [
    standardInclude,
    targetInclude,
    path.join(standardInclude, 'backward'),
    gccInclude,
    path.join(toolchainRoot, 'include'),
    path.join(toolchainRoot, 'x86_64-w64-mingw32', 'include'),
    path.join(targetInclude, 'bits'),
    includeFixed
  ].filter(includePath => fs.existsSync(includePath))
       .map(includePath => `-isystem${includePath}`);
  return [
    '--target=x86_64-w64-windows-gnu',
    '-DDEBUG',
    '-Wall',
    '-Wextra',
    '-Wno-deprecated-declarations',
    '-Drsize_t=size_t',
    '-D__STDC_WANT_LIB_EXT1__=1',
    '-D__float128=long double',
    '-U__SIZEOF_FLOAT128__',
    ...includeFlags
  ];
}

export interface ManagedClangdCompileCommand {
  workingDirectory: string;
  compilationCommand: string[];
}

export function managedClangdCompileCommand(
    filePath: string, languageId: string,
    compilerPath: string,
    baseFlags: readonly string[] = managedClangdFallbackFlags(compilerPath)):
    ManagedClangdCompileCommand {
  const isC = languageId === 'c' || languageId === 'objective-c';
  const compiler = isC
      ? compilerPath
            .replace(/g\+\+(-\d+)?(\.exe)?$/i, 'gcc$1$2')
            .replace(/clang\+\+(-\d+)?(\.exe)?$/i, 'clang$1$2')
      : compilerPath;
  const language = languageId === 'objective-c'
      ? 'objective-c'
      : languageId === 'objective-cpp' ? 'objective-c++' : isC ? 'c' : 'c++';
  return {
    workingDirectory: path.dirname(filePath),
    compilationCommand: [
      compiler,
      ...baseFlags,
      `-x${language}`,
      isC ? '-std=c17' : '-std=c++20',
      filePath
    ]
  };
}
