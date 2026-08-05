'use strict';

const compilerArchiveName = 'becoder-ucrt64.zip';
const clangdArchiveName = 'clangd-windows-22.1.6.zip';

exports.getPortableAssets = () => [
	{
		id: 'BeCoder UCRT64 GCC 14.1.0',
		urls: [],
		archiveName: compilerArchiveName,
		bundledArchivePath: `resources/oi-defaults/toolchains/${compilerArchiveName}`,
		targetDirectory: 'becoder-ucrt64',
		requiredFile: 'bin/g++.exe'
	},
	{
		id: 'clangd 22.1.6',
		urls: [],
		archiveName: clangdArchiveName,
		bundledArchivePath: `resources/oi-defaults/toolchains/${clangdArchiveName}`,
		targetDirectory: 'clangd',
		requiredFile: 'clangd_22.1.6/bin/clangd.exe'
	}
];
