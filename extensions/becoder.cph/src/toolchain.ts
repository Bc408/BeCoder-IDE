/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type { ImportedProblem } from './problem';

export interface CphToolchain {
	readonly compiler: string;
	readonly compilerDirectory: string;
	readonly environment: NodeJS.ProcessEnv;
}

function existing(candidate: string): string {
	const resolved = path.resolve(candidate);
	const stat = fs.statSync(resolved);
	if (!stat.isFile()) {
		throw new Error(`Bundled compiler is not a file: ${resolved}`);
	}
	return resolved;
}

/** Resolve only the compiler shipped with this BeCoder installation. */
export function resolveBundledCompiler(extensionPath: string, language: 'c' | 'cpp', portableRoot = process.env.VSCODE_PORTABLE): string {
	const executable = language === 'c' ? 'gcc.exe' : 'g++.exe';
	const candidates = [
		path.resolve(extensionPath, '..', '..', '..', '..', 'data', 'toolchains', 'ucrt64', 'bin', executable),
		portableRoot && path.join(portableRoot, 'toolchains', 'ucrt64', 'bin', executable),
	].filter((candidate): candidate is string => !!candidate);
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return existing(candidate);
		}
	}
	throw new Error(`BeCoder bundled ${executable} was not found.`);
}

export function createCphToolchain(extensionPath: string, sessionRoot: string, language: 'c' | 'cpp'): CphToolchain {
	const compiler = resolveBundledCompiler(extensionPath, language);
	const compilerDirectory = path.dirname(compiler);
	const systemRoot = process.env.SystemRoot ?? process.env.windir;
	if (!systemRoot) {
		throw new Error('Windows SystemRoot is unavailable.');
	}
	const environment: NodeJS.ProcessEnv = {
		SystemRoot: systemRoot,
		windir: process.env.windir,
		SystemDrive: process.env.SystemDrive,
		ComSpec: process.env.ComSpec,
		OS: process.env.OS,
		PATHEXT: process.env.PATHEXT,
		TEMP: path.join(sessionRoot, 'tmp'),
		TMP: path.join(sessionRoot, 'tmp'),
		USERPROFILE: path.join(sessionRoot, 'user'),
		HOME: path.join(sessionRoot, 'user'),
		LANG: 'C',
		LC_ALL: 'C',
		PATH: [compilerDirectory, path.join(systemRoot, 'System32')].join(path.delimiter)
	};
	for (const key of Object.keys(environment)) {
		if (environment[key] === undefined) {
			delete environment[key];
		}
	}
	return { compiler, compilerDirectory, environment };
}

export function compilerArguments(problem: ImportedProblem, sourcePath: string, executablePath: string, additional = ''): string[] {
	if (!/\.(c|cpp|cc|cxx)$/i.test(sourcePath) || problem.interactive || problem.input.type !== 'stdin' || problem.output.type !== 'stdout') {
		throw new Error('Only non-interactive C/C++ stdin/stdout problems are supported.');
	}
	const languageFlags = /\.c$/i.test(sourcePath) ? [] : ['-DCPH', '-static-libstdc++'];
	// Preserve CPH's whitespace-separated Args setting; process launch never uses a shell.
	const args = additional.split(/\s+/).filter(Boolean);
	for (const arg of args) {
		if (/ONLINE_JUDGE|^-UDEBUG|^-DDEBUG(?:=|$)|^@|^-B|^-specs|^--sysroot|^-wrapper|^-fplugin|^-fuse-ld|^-Wl,|^-Xlinker|^-Xassembler/.test(arg)
			|| /^(?:-o.*|-c|-S|-E|-M.*|-shared|-save-temps.*|-dump.*|--output.*)$/.test(arg)) {
			throw new Error(`CPH compiler argument changes a BeCoder-owned build boundary: ${arg}`);
		}
	}
	return [sourcePath, ...languageFlags, '-O2', '-Wall', ...args, '-DDEBUG', '-static', '-static-libgcc', '-o', executablePath];
}
