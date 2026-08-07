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
	'resources\app\extensions\becoder.gcc-diagnostics\package.json',
	'resources\app\extensions\becoder.gcc-diagnostics\out\extension.js',
	'resources\app\extensions\becoder.one-monokai\package.json',
	'resources\app\extensions\becoder.one-monokai\themes\OneMonokai-color-theme.json',
	'resources\app\extensions\becoder.one-monokai\LICENSE',
	'resources\app\extensions\cpp\better-cpp-syntax-license.txt',
	'resources\app\extensions\cpp\syntaxes\cpp.tmLanguage.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\package.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\dist\extension.js',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\package.json',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\README.md',
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

$appPath = Join-Path $PackagePath 'resources\app'
$gccDiagnosticsPath = Join-Path $appPath 'extensions\becoder.gcc-diagnostics'
$gccDiagnosticsManifest = Get-Content -LiteralPath (Join-Path $gccDiagnosticsPath 'package.json') -Raw | ConvertFrom-Json
if ("$($gccDiagnosticsManifest.publisher).$($gccDiagnosticsManifest.name)" -ne 'becoder.gcc-diagnostics' -or
	$gccDiagnosticsManifest.main -ne './out/extension.js') {
	throw 'The packaged GCC diagnostics extension has an unexpected identity or entry point.'
}
if (-not (@($gccDiagnosticsManifest.extensionDependencies) -contains 'becoder.becoder-setup')) {
	throw 'The packaged GCC diagnostics extension does not depend on BeCoder Setup toolchain readiness.'
}
$gccDiagnosticsBundle = Get-Content -LiteralPath (Join-Path $gccDiagnosticsPath 'out\compilerRunner.js') -Raw
foreach ($requiredBoundary in @('-fsyntax-only', '-O2', '-x', '-std=c17', '-std=c++20', '-fdiagnostics-format=json', '-fdiagnostics-color=never', '-iquote')) {
	if (-not $gccDiagnosticsBundle.Contains($requiredBoundary)) {
		throw "The packaged GCC diagnostics extension is missing boundary argument: $requiredBoundary"
	}
}

$runnerPath = Join-Path $appPath 'extensions\danielpinto8zz6.c-cpp-compile-run'
$runnerManifest = Get-Content -LiteralPath (Join-Path $runnerPath 'package.json') -Raw | ConvertFrom-Json
if ("$($runnerManifest.publisher).$($runnerManifest.name)" -ne 'becoder.runner' -or
	$runnerManifest.main -ne './dist/extension.js') {
	throw 'The packaged Runner extension has an unexpected identity or entry point.'
}
if (-not (@($runnerManifest.extensionDependencies) -contains 'becoder.becoder-setup') -or
	$runnerManifest.capabilities.untrustedWorkspaces.supported -ne $false) {
	throw 'The packaged Runner does not enforce toolchain readiness and workspace trust.'
}
$runnerCommands = @($runnerManifest.contributes.commands | ForEach-Object { $_.command })
if (($runnerCommands -join ',') -ne 'becoder.runner.openPanel,becoder.runner.run,becoder.runner.runWithInput') {
	throw "The packaged Runner exposes an unexpected command set: $($runnerCommands -join ',')"
}
$runnerEditorActions = @($runnerManifest.contributes.menus.'editor/title' | ForEach-Object { $_.command })
if (($runnerEditorActions -join ',') -ne 'becoder.runner.run,becoder.runner.runWithInput') {
	throw "The packaged editor title must contain exactly the two BC Run actions: $($runnerEditorActions -join ',')"
}
$runnerBundle = Get-Content -LiteralPath (Join-Path $runnerPath 'dist\extension.js') -Raw
foreach ($requiredBoundary in @('BeCoder Runner Trace', '-Wall', '-DDEBUG', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always', 'taskkill.exe', 'runtime-error', 'Compilation Successful, Running', 'Run Complete', 'Runtime Error', 'Executable Program Removed', '===== ', ']633;')) {
	if (-not $runnerBundle.Contains($requiredBoundary)) {
		throw "The packaged Runner extension is missing boundary content: $requiredBoundary"
	}
}
foreach ($requiredDiagnosticBoundary in @('-DDEBUGER_H', 'diagnostic-include')) {
	if (-not $gccDiagnosticsBundle.Contains($requiredDiagnosticBoundary)) {
		throw "The packaged GCC diagnostics extension is missing namespace-isolation content: $requiredDiagnosticBoundary"
	}
}
$diagnosticDebuggerHeader = Join-Path $gccDiagnosticsPath 'resources\diagnostic-include\bits\debugger.h'
if (-not (Test-Path -LiteralPath $diagnosticDebuggerHeader -PathType Leaf)) {
	throw 'The packaged GCC diagnostics extension is missing its debugger isolation header.'
}
foreach ($obsoleteRunnerFile in @('becoder-runner.ps1', 'runner-init.ps1', 'run.cmd')) {
	if (Get-ChildItem -LiteralPath $runnerPath -Filter $obsoleteRunnerFile -File -Recurse | Select-Object -First 1) {
		throw "The packaged Runner still contains obsolete shell infrastructure: $obsoleteRunnerFile"
	}
}
foreach ($forbiddenBoundary in @('-Wall', '-Werror', '-pedantic')) {
	if ($gccDiagnosticsBundle.Contains($forbiddenBoundary)) {
		throw "The packaged GCC diagnostics extension contains forbidden warning argument: $forbiddenBoundary"
	}
}
$themeExtensionPath = Join-Path $appPath 'extensions\becoder.one-monokai'
$themeManifest = Get-Content -LiteralPath (Join-Path $themeExtensionPath 'package.json') -Raw | ConvertFrom-Json
if ("$($themeManifest.publisher).$($themeManifest.name)" -ne 'becoder.one-monokai') {
	throw 'The packaged One Monokai extension has an unexpected identity.'
}
$themeContribution = @($themeManifest.contributes.themes)
if ($themeContribution.Count -ne 1 -or
	$themeContribution[0].id -ne 'BeCoder One Monokai' -or
	$themeContribution[0].path -ne './themes/OneMonokai-color-theme.json') {
	throw 'The packaged One Monokai theme contribution is invalid.'
}
$languageDefaults = $themeManifest.contributes.configurationDefaults.'[c][cpp][cuda-cpp]'
if ($languageDefaults.'editor.semanticHighlighting.enabled' -ne $true) {
	throw 'The packaged C/C++ language defaults do not enable semantic refinement.'
}
$theme = Get-Content -LiteralPath (Join-Path $themeExtensionPath 'themes\OneMonokai-color-theme.json') -Raw | ConvertFrom-Json
if ($theme.semanticHighlighting -ne $true -or
	$theme.semanticTokenColors.'function:cpp' -ne '#98c379' -or
	$theme.semanticTokenColors.'type:cpp' -ne '#61afef' -or
	$theme.semanticTokenColors.'parameter:cpp'.foreground -ne '#d19a66' -or
	$theme.semanticTokenColors.'parameter:cpp'.fontStyle -ne 'italic' -or
	$theme.semanticTokenColors.'variable:cpp' -ne '#abb2bf') {
	throw 'The packaged One Monokai theme does not contain the bounded C/C++ semantic refinement.'
}
$themeLicense = Get-Content -LiteralPath (Join-Path $themeExtensionPath 'LICENSE') -Raw
if (-not $themeLicense.Contains('Copyright (c) 2018 Joshua Azemoh')) {
	throw 'The packaged One Monokai license is missing its upstream copyright notice.'
}

$setupManifest = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\package.json') -Raw | ConvertFrom-Json
$setupDefaults = $setupManifest.contributes.configurationDefaults
if ($setupDefaults.'editor.unicodeHighlight.nonBasicASCII' -ne $false -or
	$setupDefaults.'editor.unicodeHighlight.ambiguousCharacters' -ne $false -or
	$setupDefaults.'editor.unicodeHighlight.invisibleCharacters' -ne $true) {
	throw 'The packaged BeCoder Unicode highlighting defaults are invalid.'
}

$cppExtensionPath = Join-Path $appPath 'extensions\cpp'
$cppGrammar = Get-Content -LiteralPath (Join-Path $cppExtensionPath 'syntaxes\cpp.tmLanguage.json') -Raw | ConvertFrom-Json
$expectedGrammarVersion = 'https://github.com/jeff-hykin/better-cpp-syntax/commit/071dd6ecc9eda347bd84c8aa0e0b557396cb6a40'
if ($cppGrammar.version -ne $expectedGrammarVersion) {
	throw 'The packaged C++ grammar is not the selected Better C++ Syntax snapshot.'
}
$grammarLicense = Get-Content -LiteralPath (Join-Path $cppExtensionPath 'better-cpp-syntax-license.txt') -Raw
if (-not $grammarLicense.Contains('Copyright (c) 2019 Jeff Hykin')) {
	throw 'The packaged Better C++ Syntax license is missing its upstream copyright notice.'
}

$grammarOwners = @()
Get-ChildItem -LiteralPath (Join-Path $appPath 'extensions') -Directory | ForEach-Object {
	$extensionDirectoryName = $_.Name
	$manifestPath = Join-Path $_.FullName 'package.json'
	if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
		$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
		@($manifest.contributes.grammars) | Where-Object { $_.scopeName -eq 'source.cpp' } | ForEach-Object {
			$grammarOwners += [PSCustomObject]@{ Extension = $extensionDirectoryName; GrammarPath = $_.path }
		}
	}
}
if ($grammarOwners.Count -ne 1 -or
	$grammarOwners[0].Extension -ne 'cpp' -or
	$grammarOwners[0].GrammarPath -ne './syntaxes/cpp.tmLanguage.json') {
	throw "The packaged application must contain exactly one source.cpp owner in extensions/cpp. Found: $($grammarOwners | ConvertTo-Json -Compress)"
}

$product = Get-Content -LiteralPath (Join-Path $appPath 'product.json') -Raw | ConvertFrom-Json
if (-not (@($product.onboardingThemes) | Where-Object { $_.id -eq 'becoder-one-monokai' -and $_.themeId -eq 'BeCoder One Monokai' })) {
	throw 'The packaged onboarding themes do not contain BeCoder One Monokai.'
}

$clangdExtensionPath = Join-Path $appPath 'extensions\llvm-vs-code-extensions.vscode-clangd'
$clangdManifest = Get-Content -LiteralPath (Join-Path $clangdExtensionPath 'package.json') -Raw | ConvertFrom-Json
foreach ($contribution in @('configuration', 'commands', 'keybindings', 'menus', 'views', 'colors')) {
	if ($clangdManifest.contributes.PSObject.Properties.Name -contains $contribution) {
		throw "The packaged clangd extension still exposes the forbidden '$contribution' contribution."
	}
}
$clangdDefaults = $clangdManifest.contributes.configurationDefaults.'[c][cpp][cuda-cpp][objective-c][objective-cpp]'
if ($clangdDefaults.'editor.defaultFormatter' -ne 'llvm-vs-code-extensions.vscode-clangd' -or
	$clangdDefaults.'editor.formatOnSave' -ne $false -or
	$clangdDefaults.'editor.formatOnType' -ne $false) {
	throw 'The packaged clangd formatter defaults are invalid.'
}
if ($clangdManifest.dependencies.PSObject.Properties.Name -contains '@clangd/install' -or
	$clangdManifest.devDependencies.PSObject.Properties.Name -contains 'clang-format') {
	throw 'The packaged clangd manifest still depends on a downloader or separate clang-format package.'
}

$clangdBundle = Get-Content -LiteralPath (Join-Path $clangdExtensionPath 'out\bundle.js') -Raw
foreach ($argument in @(
	'--compile_args_from=lsp',
	'--enable-config=false',
	'--fallback-style=Google',
	'--header-insertion=never',
	'--clang-tidy=false'
)) {
	if (-not $clangdBundle.Contains($argument)) {
		throw "The packaged clangd bundle is missing managed argument: $argument"
	}
}
foreach ($compileBoundary in @('compilationDatabaseChanges', '-std=c17', '-std=c++20')) {
	if (-not $clangdBundle.Contains($compileBoundary)) {
		throw "The packaged clangd bundle is missing its LSP compile-command boundary: $compileBoundary"
	}
}
foreach ($argument in @('--background-index', '--enable-config=true', '--query-driver', '--compile-commands-dir')) {
	if ($clangdBundle.Contains($argument)) {
		throw "The packaged clangd bundle contains a forbidden argument: $argument"
	}
}

foreach ($module in @(
	'ast.js',
	'config-file-watcher.js',
	'config.js',
	'file-status.js',
	'memory-usage.js',
	'open-config.js',
	'switch-source-header.js',
	'type-hierarchy.js'
)) {
	if (Test-Path -LiteralPath (Join-Path $clangdExtensionPath "out\$module")) {
		throw "The packaged clangd extension contains a removed module: $module"
	}
}
if (Get-ChildItem -LiteralPath $appPath -Filter 'clang-format.exe' -File -Recurse | Select-Object -First 1) {
	throw 'The packaged application contains a forbidden separate clang-format.exe.'
}
if (Test-Path -LiteralPath (Join-Path $clangdExtensionPath 'api')) {
	throw 'The packaged clangd extension still exposes the removed raw LanguageClient API.'
}
if (Test-Path -LiteralPath (Join-Path $clangdExtensionPath 'doc-assets')) {
	throw 'The packaged clangd extension still contains screenshots for removed features.'
}
$clangdReadme = Get-Content -LiteralPath (Join-Path $clangdExtensionPath 'README.md') -Raw
if (-not $clangdReadme.Contains("Visible C/C++ diagnostics belong to BeCoder's bundled GCC") -or
	$clangdReadme.Contains('You will be prompted to download it') -or
	$clangdReadme.Contains('Format on Type')) {
	throw 'The packaged clangd README does not describe the BeCoder capability boundary.'
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
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\becoder-runner.ps1',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\runner-init.ps1',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\run.cmd',
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
