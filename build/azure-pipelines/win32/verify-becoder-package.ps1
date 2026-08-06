param(
	[Parameter(Mandatory = $true)]
	[string]$PackagePath,

	[Parameter(Mandatory = $true)]
	[bool]$IncludeCompiler
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $PackagePath -PathType Container)) {
	throw "Packaged application was not found at $PackagePath."
}

$requiredFiles = @(
	'BeCoder.exe',
	'data\toolchains\.gitkeep',
	'resources\app\extensions\becoder.setup\out\extension.js',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\dist\extension.js',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\out\bundle.js',
	'resources\app\node_modules.asar.unpacked\windows-foreground-love\build\Release\foreground_love.node',
	'resources\app\node_modules.asar.unpacked\node-pty\build\Release\conpty.node',
	'resources\app\node_modules.asar.unpacked\node-pty\build\Release\conpty_console_list.node',
	'resources\app\node_modules.asar.unpacked\node-pty\build\Release\conpty\conpty.dll',
	'resources\app\node_modules.asar.unpacked\node-pty\build\Release\conpty\OpenConsole.exe',
	'resources\app\node_modules.asar.unpacked\node-pty\lib\worker\conoutSocketWorker.js',
	'resources\app\node_modules.asar.unpacked\node-pty\lib\shared\conout.js',
	'resources\app\node_modules.asar.unpacked\node-pty\package.json'
)

foreach ($relativePath in $requiredFiles) {
	$path = Join-Path $PackagePath $relativePath
	if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
		throw "Required Windows package file was not produced: $relativePath"
	}
	if ((Get-Item -LiteralPath $path).Length -eq 0) {
		throw "Required Windows package file is empty: $relativePath"
	}
}

$clangdArchiveRelativePath = 'resources\app\resources\oi-defaults\toolchains\clangd-windows-22.1.6.zip'
$clangdArchivePath = Join-Path $PackagePath $clangdArchiveRelativePath
if (-not (Test-Path -LiteralPath $clangdArchivePath -PathType Leaf)) {
	throw "The Windows package is missing the bundled BeCoder clangd archive: $clangdArchiveRelativePath"
}
if ((Get-Item -LiteralPath $clangdArchivePath).Length -lt 10MB) {
	throw "The bundled BeCoder clangd archive is unexpectedly small: $clangdArchiveRelativePath"
}

$compilerRelativePath = 'resources\app\resources\oi-defaults\toolchains\becoder-ucrt64.zip'
$compilerPath = Join-Path $PackagePath $compilerRelativePath
if ($IncludeCompiler) {
	if (-not (Test-Path -LiteralPath $compilerPath -PathType Leaf)) {
		throw "The Include Compiler package is missing the bundled BeCoder compiler archive: $compilerRelativePath"
	}
	if ((Get-Item -LiteralPath $compilerPath).Length -lt 100MB) {
		throw "The bundled BeCoder compiler archive is unexpectedly small: $compilerRelativePath"
	}
} elseif (Test-Path -LiteralPath $compilerPath) {
	throw "The Exclude Compiler package unexpectedly contains the bundled compiler: $compilerRelativePath"
}

$forbiddenPaths = @(
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\dist\debugger.js',
	'resources\app\extensions\jeff-hykin.better-cpp-syntax',
	'resources\app\resources\oi-defaults\toolchains\gdb.exe',
	'resources\app\resources\oi-defaults\toolchains\winlibs-x86_64-posix-seh-gcc-16.1.0-mingw-w64ucrt-14.0.0-r3.zip'
)
foreach ($relativePath in $forbiddenPaths) {
	if (Test-Path -LiteralPath (Join-Path $PackagePath $relativePath)) {
		throw "Forbidden legacy BeCoder package entry was produced: $relativePath"
	}
}

Write-Host "Verified staged BeCoder package at $PackagePath (IncludeCompiler=$IncludeCompiler)"
