import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  bundledClangdPath,
  bundledCompilerPath,
  managedClangdArguments,
  managedClangdFallbackFlags
} from './becoder-toolchain';

const CACHE_KEY = 'becoder.semanticTokens.v2';
const CACHE_FINGERPRINT_VERSION = '3';
const MAX_CACHE_ENTRIES = 32;
const MAX_ENTRY_TOKEN_INTS = 50000;
const MAX_TOTAL_TOKEN_INTS = 200000;
const MANAGED_CONFIG_MARKER = '# BeCoder managed clangd configuration.';
const MANAGED_CONFIG_SIGNATURE = '# BeCoder managed clangd SHA-256: ';
const SAFE_FALLBACK_FLAGS = new Set([
  '--target=x86_64-w64-windows-gnu',
  '-DDEBUG',
  '-Wall',
  '-Wextra',
  '-Wno-deprecated-declarations',
  '-Drsize_t=size_t',
  '-D__STDC_WANT_LIB_EXT1__=1',
  '-D__float128=long double',
  '-U__SIZEOF_FLOAT128__'
]);

interface CachedSemanticTokens {
  uri: string;
  languageId: string;
  fingerprint: string;
  data: number[];
  lastUsed: number;
}

interface PendingRefresh {
  fingerprint: string;
  cancellation: vscode.CancellationTokenSource;
  result?: vscode.SemanticTokens;
}

export interface SemanticTokensRuntimeConfiguration {
  clangdPath: string;
  useScriptAsExecutable: boolean;
  arguments: string[];
  fallbackFlags: string[];
  compilerPath: string|undefined;
  cCompilerPath: string|undefined;
  standardIncludePath: string|undefined;
  userConfigPath: string|undefined;
}

type RuntimeConfigurationProvider =
    (document: vscode.TextDocument) =>
        SemanticTokensRuntimeConfiguration|undefined;

function runtimeConfiguration(
    document: vscode.TextDocument):
    SemanticTokensRuntimeConfiguration|undefined {
  const configuration = vscode.workspace.getConfiguration(
      'clangd', document.uri);
  const toolchain = vscode.workspace.getConfiguration(
      'becoder.toolchain', document.uri);
  if (process.platform === 'win32') {
    const clangdPath = bundledClangdPath();
    if (!clangdPath) return undefined;
    const compilerPath = bundledCompilerPath(clangdPath);
    const toolchainRoot = path.dirname(path.dirname(compilerPath));
    return {
      clangdPath,
      useScriptAsExecutable: false,
      arguments: managedClangdArguments(),
      fallbackFlags: managedClangdFallbackFlags(compilerPath),
      compilerPath,
      cCompilerPath: compilerPath.replace(/g\+\+\.exe$/i, 'gcc.exe'),
      standardIncludePath: path.join(
          toolchainRoot, 'include', 'c++', '14.1.0'),
      userConfigPath: undefined
    };
  }
  const clangdPath = configuration.get<string>('path');
  if (!clangdPath) return undefined;
  return {
    clangdPath,
    useScriptAsExecutable:
        configuration.get<boolean>('useScriptAsExecutable') ?? false,
    arguments: configuration.get<string[]>('arguments') ?? [],
    fallbackFlags: configuration.get<string[]>('fallbackFlags') ?? [],
    compilerPath: toolchain.get<string>('compilerPath'),
    cCompilerPath: toolchain.get<string>('cCompilerPath'),
    standardIncludePath: toolchain.get<string>('stdIncludePath'),
    userConfigPath: undefined
  };
}

type FullTokensNext =
    (document: vscode.TextDocument, token: vscode.CancellationToken) =>
        vscode.ProviderResult<vscode.SemanticTokens>;

type TokenEditsNext =
    (document: vscode.TextDocument, previousResultId: string,
     token: vscode.CancellationToken) =>
        vscode.ProviderResult<vscode.SemanticTokensEdits|vscode.SemanticTokens>;

function isValidEntry(value: unknown): value is CachedSemanticTokens {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CachedSemanticTokens>;
  return typeof entry.uri === 'string' &&
      typeof entry.languageId === 'string' &&
      typeof entry.fingerprint === 'string' &&
      typeof entry.lastUsed === 'number' && Array.isArray(entry.data) &&
      entry.data.length <= MAX_ENTRY_TOKEN_INTS && entry.data.length % 5 === 0 &&
      entry.data.every(item => Number.isInteger(item) && item >= 0 &&
          item <= 0xffffffff);
}

function applySemanticTokenEdits(
    source: Uint32Array, edits: readonly vscode.SemanticTokensEdit[]):
    Uint32Array|undefined {
  let deltaLength = 0;
  let previousEnd = 0;
  for (const edit of edits) {
    if (edit.start < previousEnd || edit.start > source.length ||
        edit.start + edit.deleteCount > source.length) {
      return undefined;
    }
    previousEnd = edit.start + edit.deleteCount;
    deltaLength += (edit.data?.length ?? 0) - edit.deleteCount;
  }
  const result = new Uint32Array(source.length + deltaLength);
  let sourceOffset = 0;
  let resultOffset = 0;
  for (const edit of edits) {
    result.set(source.subarray(sourceOffset, edit.start), resultOffset);
    resultOffset += edit.start - sourceOffset;
    if (edit.data) {
      result.set(edit.data, resultOffset);
      resultOffset += edit.data.length;
    }
    sourceOffset = edit.start + edit.deleteCount;
  }
  result.set(source.subarray(sourceOffset), resultOffset);
  return result;
}

function isCacheableSource(document: vscode.TextDocument, text: string): boolean {
  if (document.uri.scheme !== 'file' || document.languageId !== 'cpp') {
    return false;
  }
  if (/^\s*#\s*(?:include_next|import|embed)\b/m.test(text) ||
      /\b__has_include(?:_next)?\s*\(/.test(text) ||
      /^\s*(?:export(?:\s|\/\*[^]*?\*\/)+)?(?:import|module)(?:\s|\/\*|;|<|")/m.test(
          text)) {
    return false;
  }
  let includesBits = false;
  for (const match of text.matchAll(/^\s*#\s*include\s*(.+)$/gm)) {
    const include = /^<([^>]+)>\s*(?:\/\/.*)?$/.exec(match[1].trim());
    if (!include) return false;
    if (include[1].replace(/\\/g, '/') !== 'bits/stdc++.h') return false;
    includesBits = true;
  }
  return includesBits;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' &&
       !path.isAbsolute(relative));
}

function isSafeIncludeFlag(flag: string, toolchainRoot: string|undefined):
    boolean {
  const systemInclude = /^-isystem(.+)$/.exec(flag);
  if (systemInclude) {
    return Boolean(toolchainRoot &&
        isPathInside(toolchainRoot, systemInclude[1]));
  }
  return SAFE_FALLBACK_FLAGS.has(flag);
}

function isAuthenticManagedConfig(content: string): boolean {
  const signatureStart = content.lastIndexOf(MANAGED_CONFIG_SIGNATURE);
  if (signatureStart < 0) return false;
  const body = content.slice(0, signatureStart);
  const signature = content.slice(
      signatureStart + MANAGED_CONFIG_SIGNATURE.length).trim();
  return body.includes(MANAGED_CONFIG_MARKER) &&
      /^[0-9a-f]{64}$/.test(signature) &&
      crypto.createHash('sha256').update(body).digest('hex') === signature;
}

export class SemanticTokensCache {
  private readonly entries = new Map<string, CachedSemanticTokens>();
  private readonly liveData = new Map<string, Uint32Array>();
  private readonly pendingRefreshes = new Map<string, PendingRefresh>();
  private refreshEmitter: vscode.EventEmitter<void>|undefined;
  private persistence: Promise<void>|undefined;
  private persistRequested = false;
  private activeRuntimeConfiguration:
      SemanticTokensRuntimeConfiguration|undefined;

  constructor(
      private readonly storage: vscode.Memento,
      private readonly getRuntimeConfiguration:
          RuntimeConfigurationProvider = runtimeConfiguration) {
    const stored = storage.get<unknown[]>(CACHE_KEY, []);
    for (const entry of stored) {
      if (isValidEntry(entry)) this.entries.set(entry.uri, entry);
    }
    this.trim();
  }

  setRefreshEmitter(emitter: vscode.EventEmitter<void>): void {
    this.refreshEmitter = emitter;
    if ([...this.pendingRefreshes.values()].some(refresh => refresh.result)) {
      emitter.fire();
    }
  }

  setRuntimeConfiguration(
      configuration: SemanticTokensRuntimeConfiguration): void {
    this.activeRuntimeConfiguration = configuration;
  }

  resetClient(): void {
    for (const refresh of this.pendingRefreshes.values()) {
      refresh.cancellation.cancel();
    }
    this.liveData.clear();
    this.pendingRefreshes.clear();
    this.refreshEmitter = undefined;
    this.activeRuntimeConfiguration = undefined;
  }

  async provideDocumentSemanticTokens(
      document: vscode.TextDocument, token: vscode.CancellationToken,
      next: FullTokensNext): Promise<vscode.SemanticTokens|null|undefined> {
    const uri = document.uri.toString();
    const fingerprint = this.fingerprint(document);
    const pending = this.pendingRefreshes.get(uri);
    if (fingerprint && pending?.result &&
        pending.fingerprint === fingerprint) {
      this.pendingRefreshes.delete(uri);
      return pending.result;
    }
    if (pending && pending.fingerprint !== fingerprint) {
      pending.cancellation.cancel();
      this.pendingRefreshes.delete(uri);
    }

    const cached = this.entries.get(uri);
    if (fingerprint && cached && cached.languageId === document.languageId &&
        cached.fingerprint === fingerprint) {
      cached.lastUsed = Date.now();
      if (!pending || pending.fingerprint !== fingerprint) {
        this.refreshInBackground(document, fingerprint, next);
      }
      return new vscode.SemanticTokens(Uint32Array.from(cached.data));
    }

    const version = document.version;
    const result = await next(document, token);
    if (result && document.version === version) {
      this.cacheFullResult(document, fingerprint, result);
    }
    return result;
  }

  async provideDocumentSemanticTokensEdits(
      document: vscode.TextDocument, previousResultId: string,
      token: vscode.CancellationToken,
      next: TokenEditsNext):
       Promise<vscode.SemanticTokensEdits|vscode.SemanticTokens|null|undefined> {
    const uri = document.uri.toString();
    const pending = this.pendingRefreshes.get(uri);
    if (pending) {
      pending.cancellation.cancel();
      this.pendingRefreshes.delete(uri);
    }
    const version = document.version;
    const result = await next(document, previousResultId, token);
    if (!result || document.version !== version) return result;

    const fingerprint = this.fingerprint(document);
    if (result instanceof vscode.SemanticTokens) {
      this.cacheFullResult(document, fingerprint, result);
    } else {
      const previous = this.liveData.get(uri);
      const data = previous && applySemanticTokenEdits(previous, result.edits);
      if (data) this.cacheData(document, fingerprint, data);
    }
    return result;
  }

  private refreshInBackground(
      document: vscode.TextDocument, fingerprint: string,
      next: FullTokensNext): void {
    const uri = document.uri.toString();
    const version = document.version;
    const previous = this.pendingRefreshes.get(uri);
    previous?.cancellation.cancel();
    const cancellation = new vscode.CancellationTokenSource();
    const refresh: PendingRefresh = {fingerprint, cancellation};
    this.pendingRefreshes.set(uri, refresh);
    Promise.resolve(next(document, cancellation.token)).then(result => {
      if (!result || document.version !== version ||
          this.fingerprint(document) !== fingerprint) {
        if (this.pendingRefreshes.get(uri) === refresh) {
          this.pendingRefreshes.delete(uri);
        }
        return;
      }
      if (this.pendingRefreshes.get(uri) !== refresh) return;
      this.cacheFullResult(document, fingerprint, result);
      refresh.result = result;
      this.refreshEmitter?.fire();
    }, () => {
      if (this.pendingRefreshes.get(uri) === refresh) {
        this.pendingRefreshes.delete(uri);
      }
    }).finally(() => cancellation.dispose());
  }

  private cacheFullResult(
      document: vscode.TextDocument, fingerprint: string|undefined,
      result: vscode.SemanticTokens): void {
    this.cacheData(document, fingerprint, result.data);
  }

  private cacheData(
      document: vscode.TextDocument, fingerprint: string|undefined,
      data: Uint32Array): void {
    const uri = document.uri.toString();
    const copied = data.slice();
    this.liveData.set(uri, copied);
    const removed = this.entries.delete(uri);
    if (!fingerprint || copied.length > MAX_ENTRY_TOKEN_INTS) {
      if (removed) this.persist();
      return;
    }
    this.entries.set(uri, {
      uri,
      languageId: document.languageId,
      fingerprint,
      data: Array.from(copied),
      lastUsed: Date.now()
    });
    this.trim();
    this.persist();
  }

  private trim(): void {
    const oldest = [...this.entries.values()]
                       .sort((left, right) => left.lastUsed - right.lastUsed);
    let totalTokenInts = oldest.reduce(
        (total, entry) => total + entry.data.length, 0);
    let index = 0;
    while ((this.entries.size > MAX_CACHE_ENTRIES ||
            totalTokenInts > MAX_TOTAL_TOKEN_INTS) && index < oldest.length) {
      const entry = oldest[index++];
      this.entries.delete(entry.uri);
      totalTokenInts -= entry.data.length;
    }
  }

  private persist(): void {
    this.persistRequested = true;
    if (!this.persistence) {
      this.persistence = this.flushPersistence();
    }
  }

  private async flushPersistence(): Promise<void> {
    do {
      this.persistRequested = false;
      const entries = [...this.entries.values()];
      try {
        await this.storage.update(CACHE_KEY, entries);
      } catch {
        // The live clangd result remains authoritative if workspace storage
        // is unavailable. A later token update will try persistence again.
      }
    } while (this.persistRequested);
    this.persistence = undefined;
  }

  private fingerprint(document: vscode.TextDocument): string|undefined {
    const text = document.getText();
    if (!isCacheableSource(document, text)) return undefined;
    const hash = crypto.createHash('sha256');
    hash.update(CACHE_FINGERPRINT_VERSION);
    hash.update('\0');
    hash.update(document.languageId);
    hash.update('\0');
    hash.update(text);
    hash.update('\0');
    const runtime = this.activeRuntimeConfiguration ??
        this.getRuntimeConfiguration(document);
    if (!runtime) return undefined;
    const {
      clangdPath, useScriptAsExecutable, arguments: clangdArguments,
      fallbackFlags, compilerPath, cCompilerPath, standardIncludePath,
      userConfigPath
    } = runtime;
    const toolchainRoot = compilerPath &&
        path.dirname(path.dirname(compilerPath));
    if (fallbackFlags?.some(
            flag => !isSafeIncludeFlag(flag, toolchainRoot))) {
      return undefined;
    }
    hash.update(JSON.stringify({
      path: clangdPath,
      useScriptAsExecutable,
      arguments: clangdArguments,
      fallbackFlags
    }));
    this.addFileMetadata(hash, clangdPath);
    this.addFileContent(hash, userConfigPath);
    this.addFileMetadata(hash, compilerPath);
    this.addFileMetadata(hash, cCompilerPath);
    this.addFileMetadata(
        hash, standardIncludePath &&
            path.join(standardIncludePath, 'bits', 'stdc++.h'));
    this.addFileMetadata(
        hash, standardIncludePath && path.join(
            standardIncludePath, 'x86_64-w64-mingw32', 'bits',
            'c++config.h'));
    if (!this.addProjectInputs(hash, document)) return undefined;
    return hash.digest('hex');
  }

  private addFileMetadata(hash: crypto.Hash, candidate: string|undefined): void {
    if (!candidate) return;
    hash.update(candidate);
    try {
      const stat = fs.statSync(candidate);
      hash.update(`${stat.size}:${stat.mtimeMs}`);
    } catch (error) {
      hash.update(String(error));
    }
  }

  private addFileContent(hash: crypto.Hash, candidate: string|undefined): void {
    if (!candidate) return;
    hash.update(candidate);
    try {
      hash.update(fs.readFileSync(candidate));
    } catch (error) {
      hash.update(String(error));
    }
  }

  private addProjectInputs(
      hash: crypto.Hash, document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== 'file') return false;
    let current = path.resolve(path.dirname(document.uri.fsPath));
    while (true) {
      const configPath = path.join(current, '.clangd');
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        hash.update(configPath);
        hash.update(content);
        if (!isAuthenticManagedConfig(content)) {
          return false;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return false;
        }
      }
      for (const database of ['compile_commands.json', 'compile_flags.txt']) {
        const databasePath = path.join(current, database);
        try {
          fs.statSync(databasePath);
          return false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            return false;
          }
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return true;
  }
}
