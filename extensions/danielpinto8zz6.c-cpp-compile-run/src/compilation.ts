/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import type { BeCoderSource, RunnerSettings } from './compiler';

export function buildCompilerArguments(source: Pick<BeCoderSource, 'path' | 'language'>, settings: RunnerSettings, outputPath: string): readonly string[] {
	const standard = source.language === 'c' ? settings.cStandard : settings.cppStandard;
	const allowedStandards = source.language === 'c' ? ['c11', 'c17', 'c23'] : ['c++11', 'c++14', 'c++17', 'c++20', 'c++23'];
	if (!allowedStandards.includes(standard)) {
		throw new Error(`Unsupported BeCoder ${source.language === 'c' ? 'C' : 'C++'} standard: ${standard}`);
	}
	const requestedFlags = source.language === 'c' ? settings.cFlags : settings.cppFlags;
	const requiredFlags = ['-O2', '-Wall', '-DDEBUG'];
	const flags = requestedFlags.map(validateCompilerFlag).filter(flag => !requiredFlags.includes(flag));
	return [
		...requiredFlags,
		...flags,
		`-std=${standard}`,
		'-finput-charset=UTF-8',
		'-fexec-charset=UTF-8',
		'-fdiagnostics-color=always',
		// Load the PCH before any parsed declarations; the second include supplies debug on fallback.
		...(source.language === 'cpp' ? ['-include', 'bits/stdc++.h', '-include', 'bits/debugger.h'] : []),
		source.path,
		'-o',
		outputPath
	];
}

export function privateRunnerEnvironment(sessionRoot: string, compilerPath: string): Record<string, string> {
	const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
	if (!systemRoot) {
		throw new Error('Windows SystemRoot is unavailable.');
	}
	const environment: Record<string, string> = {};
	for (const name of [
		'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'OS', 'PATHEXT',
		'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
	]) {
		const value = process.env[name];
		if (value) {
			environment[name] = value;
		}
	}
	const temporaryDirectory = path.join(sessionRoot, 'tmp');
	const userRoot = path.join(sessionRoot, 'user');
	environment['TEMP'] = temporaryDirectory;
	environment['TMP'] = temporaryDirectory;
	environment['USERPROFILE'] = userRoot;
	environment['HOMEDRIVE'] = path.parse(userRoot).root.slice(0, 2);
	environment['HOMEPATH'] = userRoot.slice(2);
	environment['HOME'] = userRoot;
	environment['LOCALAPPDATA'] = path.join(userRoot, 'AppData', 'Local');
	environment['APPDATA'] = path.join(userRoot, 'AppData', 'Roaming');
	environment['LANG'] = 'C';
	environment['LC_ALL'] = 'C';
	environment['PATH'] = [path.dirname(compilerPath), path.join(systemRoot, 'System32')].join(path.delimiter);
	return environment;
}

function validateCompilerFlag(candidate: string): string {
	if ((candidate.startsWith('-O') && candidate !== '-O2')
		|| candidate === '-UDEBUG'
		|| candidate.startsWith('-DDEBUG=')
		|| candidate === '-Wno-all') {
		throw new Error(`Compiler flag cannot override a required BeCoder Runner flag: ${candidate}`);
	}
	const warning = /^-W(?:no-)?[A-Za-z0-9][A-Za-z0-9+_.=-]*$/.test(candidate) && !/^-W[alp](?:,|=|$)/.test(candidate);
	const allowed = /^-O(?:0|1|2|3|g|s|fast)$/.test(candidate)
		|| warning
		|| /^-D[A-Za-z_][A-Za-z0-9_]*(?:=[A-Za-z0-9_+.-]+)?$/.test(candidate)
		|| /^-U[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)
		|| /^-g(?:0|1|2|3)?$/.test(candidate)
		|| ['-pipe', '-pedantic', '-pedantic-errors', '-pthread'].includes(candidate);
	if (!allowed) {
		throw new Error(`Unsupported compiler flag in BeCoder Runner: ${candidate}`);
	}
	return candidate;
}
