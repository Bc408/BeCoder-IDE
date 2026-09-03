param(
	[Parameter(Mandatory = $true)]
	[string]$PackagePath,

	[Parameter(Mandatory = $true)]
	[bool]$IncludeCompiler
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path

if (-not (Test-Path -LiteralPath $PackagePath -PathType Container)) {
	throw "Packaged application was not found at $PackagePath."
}

$requiredFiles = @(
	'BeCoder.exe',
	'data\.becoder-data-root',
	'data\.becoder-open-hello-coder',
	'coding\helloCoder.cpp',
	'data\toolchains\becoder-toolchain-manifest.json',
	'data\toolchains\becoder-ucrt64\bin\g++.exe',
	'data\toolchains\becoder-ucrt64\bin\gcc.exe',
	'data\toolchains\clangd\clangd_22.1.6\bin\clangd.exe',
	'resources\app\ThirdPartyNotices.txt',
	'resources\app\licenses\MIT-VSCode.txt',
	'resources\app\licenses\MIT-Electron.txt',
	'resources\app\package.json',
	'resources\app\product.json',
	'resources\app\extensions\aadityanarayan.code-snap\package.json',
	'resources\app\extensions\aadityanarayan.code-snap\LICENSE',
	'resources\app\extensions\becoder.setup\LICENSE',
	'resources\app\extensions\becoder.setup\package.json',
	'resources\app\extensions\becoder.setup\package.nls.json',
	'resources\app\extensions\becoder.setup\package.nls.zh-cn.json',
	'resources\app\extensions\becoder.setup\out\extension.js',
	'resources\app\extensions\becoder.setup\out\fileVisibility.js',
	'resources\app\extensions\becoder.setup\out\toolchain.js',
	'resources\app\extensions\becoder.setup\out\toolchainDiagnostics.js',
	'resources\app\extensions\becoder.setup\out\toolchainManifest.js',
	'resources\app\node_modules.asar',
	'resources\app\node_modules.asar.unpacked\@vscode\sqlite3\build\Release\vscode-sqlite3.node',
	'resources\app\node_modules.asar.unpacked\@vscode\windows-mutex\build\Release\CreateMutex.node',
	'resources\app\extensions\becoder.gcc-diagnostics\LICENSE',
	'resources\app\extensions\becoder.gcc-diagnostics\package.json',
	'resources\app\extensions\becoder.gcc-diagnostics\package.nls.json',
	'resources\app\extensions\becoder.gcc-diagnostics\package.nls.zh-cn.json',
	'resources\app\extensions\becoder.gcc-diagnostics\out\extension.js',
	'resources\app\extensions\becoder.one-monokai\package.json',
	'resources\app\extensions\becoder.one-monokai\themes\OneMonokai-color-theme.json',
	'resources\app\extensions\becoder.one-monokai\LICENSE',
	'resources\app\extensions\cpp\better-cpp-syntax-license.txt',
	'resources\app\extensions\cpp\syntaxes\cpp.tmLanguage.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\package.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\package.nls.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\package.nls.zh-cn.json',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\dist\extension.js',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\package.json',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\README.md',
	'resources\app\extensions\llvm-vs-code-extensions.vscode-clangd\out\bundle.js',
	'resources\app\out\main.js',
	'resources\app\resources\oi-defaults\BUNDLED-COMPONENTS.json',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-packages.json',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\gcc-libs\COPYING3',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\gmp\COPYING.LESSERv3',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\isl\LICENSE',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\mpc\COPYING.LESSER',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\mpdecimal\COPYRIGHT.txt',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\mpfr\COPYING.LESSER',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\python\LICENSE.txt',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\python-fonttools\LICENSE',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\python-pip\LICENSE.txt',
	'resources\app\resources\oi-defaults\toolchains\ucrt64-licenses\tk\license.terms',
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

$onboardingSourceHash = (Get-FileHash -LiteralPath (Join-Path $repositoryRoot 'resources\oi-defaults\onboarding\helloCoder.cpp') -Algorithm SHA256).Hash
$onboardingPackageHash = (Get-FileHash -LiteralPath (Join-Path $PackagePath 'coding\helloCoder.cpp') -Algorithm SHA256).Hash
if ($onboardingPackageHash -ne $onboardingSourceHash -or $onboardingPackageHash.ToLowerInvariant() -ne '0d47c180bbb64866f3a805b958306c268597c64f21d10458dc919740714cf1d9') {
	throw 'The packaged helloCoder.cpp does not match the approved onboarding sample.'
}
$onboardingMarker = Get-Content -LiteralPath (Join-Path $PackagePath 'data\.becoder-open-hello-coder') -Raw -Encoding utf8
if ($onboardingMarker -ne "BeCoder onboarding v1`n") {
	throw 'The packaged one-time onboarding marker is invalid.'
}

foreach ($removedUserDataTransferFile in @(
	'resources\app\extensions\becoder.setup\out\storageDatabase.js',
	'resources\app\extensions\becoder.setup\out\userDataArchive.js',
	'resources\app\extensions\becoder.setup\out\userDataImportHelper.js',
	'resources\app\extensions\becoder.setup\out\userDataPayload.js',
	'resources\app\extensions\becoder.setup\out\userDataPortability.js'
)) {
	if (Test-Path -LiteralPath (Join-Path $PackagePath $removedUserDataTransferFile)) {
		throw "The Windows package contains a removed BeCoder user-data transfer module: $removedUserDataTransferFile"
	}
}

$appPath = Join-Path $PackagePath 'resources\app'
$packagedNotices = Get-Content -LiteralPath (Join-Path $appPath 'ThirdPartyNotices.txt') -Raw
foreach ($requiredNotice in @(
	'BeCoder Runner 0.3.0',
	'CodeSnap 1.3.4',
	'clangd 22.1.6 Windows binary bundle',
	'BeCoder UCRT64 GCC 14.1.0 bundle',
	'jsonc-parser 3.3.1'
)) {
	if (-not $packagedNotices.Contains($requiredNotice)) {
		throw "The packaged third-party notices are missing the required entry: $requiredNotice"
	}
}
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
foreach ($requiredBoundary in @('BeCoder Runner Trace', '-Wall', '-DDEBUG', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always', 'taskkill.exe', 'runtime-error', 'publishedExecutable', 'performWhileOpen', 'Compilation Successful, Running', 'Run Complete', 'Runtime Error', 'Executable Program Removed', 'Unable to Start', 'Old .exe is in use, run cancelled, close it and retry', 'Compilation Failed', 'No executable remains, build artifacts removed', 'Executable Creation Failed', 'New .exe creation failed, build artifacts removed, no stale executable will run', 'Cleanup Failed', 'Could not remove .exe, close the related process and retry', '===== ', ']633;')) {
	if (-not $runnerBundle.Contains($requiredBoundary)) {
		throw "The packaged Runner extension is missing boundary content: $requiredBoundary"
	}
}
foreach ($obsoleteRunnerBoundary in @('cleanupExecutable', 'No executable generated, build artifacts and old .exe removed', 'canRemove')) {
	if ($runnerBundle.Contains($obsoleteRunnerBoundary)) {
		throw "The packaged Runner extension still contains obsolete executable cleanup behavior: $obsoleteRunnerBoundary"
	}
}
$runnerProperties = $runnerManifest.contributes.configuration.properties.PSObject.Properties.Name
if ($runnerProperties -contains 'becoder.runner.cleanupExecutable') {
	throw 'The packaged Runner still exposes the obsolete executable cleanup setting.'
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
if ($setupDefaults.PSObject.Properties.Name -contains 'files.exclude') {
	throw 'The packaged BeCoder defaults must not hide Explorer files before an explicit user command.'
}
if ((@($setupDefaults.'becoder.runner.cppFlags') -join ',') -ne '-O2,-Wall,-DDEBUG' -or
	(@($setupDefaults.'becoder.runner.cFlags') -join ',') -ne '-O2,-Wall,-DDEBUG') {
	throw 'The packaged BeCoder Runner defaults do not match the accepted contest profile.'
}
if ($setupDefaults.PSObject.Properties.Name -contains 'becoder.runner.cleanupExecutable') {
	throw 'The packaged BeCoder defaults still expose executable cleanup as an optional setting.'
}
$setupProperties = $setupManifest.contributes.configuration.properties.PSObject.Properties.Name
if ($setupProperties -contains 'becoder.setup.completed' -or $setupProperties -contains 'becoder.setup.pending') {
	throw 'The packaged Setup extension still exposes removed first-launch state.'
}
$setupCommands = @($setupManifest.contributes.commands | ForEach-Object { $_.command })
if ($setupCommands -contains 'becoder.rerunFirstRunSetup') {
	throw 'The packaged Setup extension still exposes the removed first-launch command.'
}
foreach ($requiredExplorerCommand in @('becoder.showAllFiles', 'becoder.hideSetupFiles')) {
	if ($setupCommands -notcontains $requiredExplorerCommand) {
		throw "The packaged Setup extension is missing Explorer command: $requiredExplorerCommand"
	}
}
$setupExplorerMenu = @($setupManifest.contributes.menus.'view/title')
if (-not ($setupExplorerMenu | Where-Object { $_.command -eq 'becoder.showAllFiles' -and $_.when -eq 'view == workbench.explorer.fileView && becoder.filesHiddenByBeCoder' }) -or
	-not ($setupExplorerMenu | Where-Object { $_.command -eq 'becoder.hideSetupFiles' -and $_.when -eq 'view == workbench.explorer.fileView && !becoder.filesHiddenByBeCoder' })) {
	throw 'The packaged Setup extension does not expose the owned Explorer hide/show menu states.'
}
$setupNls = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\package.nls.json') -Encoding utf8 -Raw | ConvertFrom-Json
$setupNlsZhCn = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\package.nls.zh-cn.json') -Encoding utf8 -Raw | ConvertFrom-Json
foreach ($requiredExplorerLabel in @('command.showAllFiles', 'command.hideSetupFiles')) {
	if (-not $setupNls.$requiredExplorerLabel -or -not $setupNlsZhCn.$requiredExplorerLabel) {
		throw "The packaged Setup extension is missing a bilingual Explorer label: $requiredExplorerLabel"
	}
}
$setupBundle = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\out\extension.js') -Raw
if (-not $setupBundle.Contains('becoder.filesHiddenByBeCoder')) {
	throw 'The packaged Setup extension is missing the Explorer ownership context.'
}
if ($setupBundle -notmatch 'require\(["'']\./fileVisibility["'']\)') {
	throw 'The packaged Setup extension does not load its Explorer visibility implementation.'
}
$fileVisibilityBundle = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\out\fileVisibility.js') -Raw
$managedExplorerFilesMatch = [regex]::Match(
	$fileVisibilityBundle,
	'exports\.beCoderHiddenFiles\s*=\s*\{(?<body>[\s\S]*?)\};'
)
if (-not $managedExplorerFilesMatch.Success) {
	throw 'The packaged Setup extension is missing its managed Explorer pattern object.'
}
$managedExplorerPatterns = @([regex]::Matches(
	$managedExplorerFilesMatch.Groups['body'].Value,
	'["''](?<pattern>[^"'']+)["'']\s*:\s*true'
) | ForEach-Object { $_.Groups['pattern'].Value })
$requiredExplorerPatterns = @('**/.*', '**/*.exe', '**/*.bin', '**/*.bin.dSYM', '**/*.dSYM')
if (($managedExplorerPatterns -join ',') -ne ($requiredExplorerPatterns -join ',')) {
	throw "The packaged Setup extension has an unexpected managed Explorer pattern set: $($managedExplorerPatterns -join ',')"
}
foreach ($removedSetupBoundary in @('becoder.setup.completed', 'becoder.setup.pending', 'rerunFirstRunSetup', 'first-run.html', 'first-run-preload.js')) {
	if ($setupBundle.Contains($removedSetupBoundary)) {
		throw "The packaged Setup extension contains a removed first-launch boundary: $removedSetupBoundary"
	}
}
$setupOutRoot = Join-Path $appPath 'extensions\becoder.setup\out'
$setupJavaScript = ((Get-ChildItem -LiteralPath $setupOutRoot -Filter '*.js' -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n")
foreach ($removedPreparationBoundary in @('.becoder-repair-requested', '.becoder-preparation-error', '.becoder-toolchain-ready', 'prepareBeCoderWindowsToolchain', '.becoder-asset-ready.json')) {
	if ($setupJavaScript.Contains($removedPreparationBoundary)) {
		throw "The packaged Setup extension contains a removed runtime toolchain-preparation boundary: $removedPreparationBoundary"
	}
}
foreach ($requiredSetupCommand in @('becoder.openToolchainDiagnostics')) {
	if ($setupCommands -notcontains $requiredSetupCommand) {
		throw "The packaged Setup extension is missing command: $requiredSetupCommand"
	}
}
foreach ($removedSetupCommand in @('becoder.exportUserData', 'becoder.importUserData')) {
	if ($setupCommands -contains $removedSetupCommand) {
		throw "The packaged Setup extension still contributes a removed BeCoder user-data transfer command: $removedSetupCommand"
	}
}
$toolchainBundle = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\out\toolchain.js') -Raw
$toolchainDiagnosticsBundle = Get-Content -LiteralPath (Join-Path $appPath 'extensions\becoder.setup\out\toolchainDiagnostics.js') -Raw
foreach ($requiredHealthBoundary in @('becoder-toolchain-manifest.json', 'Get BeCoder Setup', 'Open Diagnostics')) {
	if (-not $toolchainBundle.Contains($requiredHealthBoundary)) {
		throw "The packaged installed-toolchain health check is missing: $requiredHealthBoundary"
	}
}
if ($toolchainDiagnosticsBundle -notmatch 'validateInstalledToolchain\)\([^,]+,\s*true\)') {
	throw 'The packaged diagnostics page does not request explicit full toolchain integrity verification.'
}
$displayLanguage = $setupManifest.contributes.configuration.properties.'becoder.displayLanguage'
if ($displayLanguage.default -ne 'zh-cn' -or
	(@($displayLanguage.enum) -join ',') -ne 'zh-cn,en' -or
	$displayLanguage.scope -ne 'application' -or
	$displayLanguage.order -ne 0) {
	throw 'The packaged BeCoder display-language setting is invalid.'
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
if ($product.licenseUrl -ne 'https://github.com/Bc408/BeCoder-IDE/blob/main/LICENSE' -or
	$null -ne $product.PSObject.Properties['reportIssueUrl']) {
	throw 'The packaged product contains stale BeCoder license or issue metadata.'
}
foreach ($removedProductProperty in @(
	'serverLicenseUrl',
	'serverGreeting',
	'serverLicense',
	'serverLicensePrompt',
	'serverApplicationName',
	'serverDataFolderName',
	'tunnelApplicationName',
	'win32TunnelServiceMutex',
	'win32TunnelMutex'
)) {
	if ($null -ne $product.PSObject.Properties[$removedProductProperty]) {
		throw "The packaged product retains the removed Remote product property: $removedProductProperty"
	}
}
$packageManifest = Get-Content -LiteralPath (Join-Path $appPath 'package.json') -Raw | ConvertFrom-Json
if ($packageManifest.repository.url -ne 'https://github.com/Bc408/BeCoder-IDE.git' -or
	$packageManifest.bugs.url -ne 'https://github.com/Bc408/BeCoder-IDE/issues') {
	throw 'The packaged root manifest contains stale repository metadata.'
}
if (-not (@($product.onboardingThemes) | Where-Object { $_.id -eq 'becoder-one-monokai' -and $_.themeId -eq 'BeCoder One Monokai' })) {
	throw 'The packaged onboarding themes do not contain BeCoder One Monokai.'
}
$productText = Get-Content -LiteralPath (Join-Path $appPath 'product.json') -Raw
$gallery = $product.extensionsGallery
if ($gallery.serviceUrl -ne 'https://open-vsx.org/vscode/gallery' -or
	$gallery.itemUrl -ne 'https://open-vsx.org/vscode/item' -or
	$gallery.latestUrlTemplate -ne 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest' -or
	$gallery.controlUrl -ne 'https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json') {
	throw 'The packaged product does not use the approved Open VSX endpoints.'
}
foreach ($endpoint in @('marketplace.visualstudio.com', 'marketplace.vsallin.net', 'vscode-unpkg.net', 'az764295.vo.msecnd.net')) {
	if ($productText.Contains($endpoint)) {
		throw "The packaged product contains a forbidden Microsoft Marketplace endpoint: $endpoint"
	}
}
if ((@($product.extensionBlacklist) -join ',') -ne 'ms-vscode.cpptools,ms-vscode.cpptools-extension-pack') {
	throw 'The packaged product does not retain the complete cpptools blacklist.'
}
$expectedProtectedExtensions = @(
	'becoder.becoder-setup',
	'becoder.runner',
	'becoder.gcc-diagnostics',
	'becoder.one-monokai',
	'llvm-vs-code-extensions.vscode-clangd',
	'adpyke.codesnap',
	'vscode.cpp',
	'ms-ceintl.vscode-language-pack-zh-hans'
)
if ((@($product.protectedExtensions) -join ',') -ne ($expectedProtectedExtensions -join ',')) {
	throw 'The packaged product does not protect the complete BeCoder core extension set.'
}
if (@($product.builtInExtensionsEnabledWithAutoUpdates).Count -ne 0) {
	throw 'The packaged product must not allow gallery updates for built-in extensions.'
}
if ((@($product.linkProtectionTrustedDomains) -join ',') -ne 'https://open-vsx.org') {
	throw 'The packaged product does not trust only the approved Open VSX registry domain.'
}

$appMainBundle = Get-Content -LiteralPath (Join-Path $appPath 'out\main.js') -Raw
foreach ($removedImportRecoveryBoundary in @('.becoder-import-transaction.json', 'userDataImportHelper.js', 'recoverInterruptedBeCoderImport', 'becoderImportRecoveryError')) {
	if ($appMainBundle.Contains($removedImportRecoveryBoundary)) {
		throw "The packaged main process contains a removed BeCoder user-data import recovery boundary: $removedImportRecoveryBoundary"
	}
}
foreach ($removedMainBoundary in @('becoder:onboarding', 'becoder.setup.completed', 'becoder.setup.pending', 'first-run.html', 'first-run-preload.js')) {
	if ($appMainBundle.Contains($removedMainBoundary)) {
		throw "The packaged main process contains a removed first-launch boundary: $removedMainBoundary"
	}
}
foreach ($removedPreparationBoundary in @('.becoder-repair-requested', '.becoder-preparation-error', '.becoder-toolchain-ready', 'prepareBeCoderWindowsToolchain', '.becoder-asset-ready.json')) {
	if ($appMainBundle.Contains($removedPreparationBoundary)) {
		throw "The packaged main process contains a removed runtime toolchain-preparation boundary: $removedPreparationBoundary"
	}
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

$mermaidExtensionPath = Join-Path $appPath 'extensions\mermaid-markdown-features'
foreach ($mermaidFile in @(
	'package.json',
	'README.md',
	'ThirdPartyNotices.txt',
	'out\extension.js',
	'diagram-preview-out\index.js',
	'diagram-preview-out\codicon.css',
	'markdown-preview-out\index.js',
	'notebook-out\index.js'
)) {
	if (-not (Test-Path -LiteralPath (Join-Path $mermaidExtensionPath $mermaidFile) -PathType Leaf)) {
		throw "The packaged Mermaid Markdown extension is missing $mermaidFile."
	}
}
$mermaidManifest = Get-Content -LiteralPath (Join-Path $mermaidExtensionPath 'package.json') -Raw | ConvertFrom-Json
if ("$($mermaidManifest.publisher).$($mermaidManifest.name)" -ne 'vscode.mermaid-markdown-features' -or
	-not $mermaidManifest.contributes.'markdown.previewScripts' -or
	-not $mermaidManifest.contributes.notebookRenderer -or
	-not $mermaidManifest.contributes.'markdown.markdownItPlugins' -or
	$mermaidManifest.contributes.chatOutputRenderers -or
	$mermaidManifest.enabledApiProposals) {
	throw 'The packaged Mermaid extension does not match the BeCoder Markdown-only contribution boundary.'
}
if (Test-Path -LiteralPath (Join-Path $mermaidExtensionPath 'chat-webview-out')) {
	throw 'The packaged Mermaid extension contains the removed Chat output bundle.'
}
$mermaidBundle = Get-Content -LiteralPath (Join-Path $mermaidExtensionPath 'out\extension.js') -Raw
foreach ($forbiddenMermaidApi in @('registerChatOutputRenderer', 'text/vnd.mermaid', 'ChatOutputDataItem', 'LanguageModelTextPart', 'LanguageModelToolResult')) {
	if ($mermaidBundle.Contains($forbiddenMermaidApi)) {
		throw "The packaged Mermaid extension contains removed Chat integration: $forbiddenMermaidApi"
	}
}

$languagePackPath = Join-Path $appPath 'extensions\MS-CEINTL.vscode-language-pack-zh-hans'
$languagePackManifest = Get-Content -LiteralPath (Join-Path $languagePackPath 'package.json') -Raw | ConvertFrom-Json
if ("$($languagePackManifest.publisher).$($languagePackManifest.name)".ToLowerInvariant() -ne 'ms-ceintl.vscode-language-pack-zh-hans' -or
	$languagePackManifest.version -ne '1.130.2026072017' -or
	$languagePackManifest.engines.vscode -ne '^1.130.0') {
	throw 'The packaged Simplified Chinese language pack does not match the approved BeCoder 1.130 snapshot.'
}
foreach ($languagePackFile in @('LICENSE.md', 'ThirdPartyNotices.txt', 'translations\main.i18n.json')) {
	if (-not (Test-Path -LiteralPath (Join-Path $languagePackPath $languagePackFile) -PathType Leaf)) {
		throw "The packaged Simplified Chinese language pack is missing $languagePackFile."
	}
}
$languagePackTranslationIds = @($languagePackManifest.contributes.localizations.translations.id)
if ($languagePackTranslationIds -notcontains 'vscode.mermaid-markdown-features' -or
	$languagePackTranslationIds -contains 'vscode.mermaid-chat-features' -or
	-not (Test-Path -LiteralPath (Join-Path $languagePackPath 'translations\extensions\vscode.mermaid-markdown-features.i18n.json') -PathType Leaf)) {
	throw 'The packaged Simplified Chinese language pack does not preserve the Mermaid Markdown-only translation boundary.'
}
foreach ($removedTranslationId in @('vscode.git', 'vscode.git-base', 'vscode.github', 'vscode.terminal-suggest')) {
	if ($languagePackTranslationIds -contains $removedTranslationId -or
		(Test-Path -LiteralPath (Join-Path $languagePackPath "translations\extensions\$removedTranslationId.i18n.json"))) {
		throw "The packaged Simplified Chinese language pack contains a removed Stage 4.6 extension translation: $removedTranslationId"
	}
}
$languagePackBoundaryVerifier = Join-Path $PSScriptRoot 'verify-becoder-language-pack.ts'
& node $languagePackBoundaryVerifier (Join-Path $languagePackPath 'translations\main.i18n.json')
if ($LASTEXITCODE -ne 0) {
	throw 'The packaged Simplified Chinese language pack failed its product-boundary verification.'
}

$expectedClangdHash = 'ce54f16e0b4fd76d450eeda9664420b195360b73febcfe40e661108fa57f2ce1'
$expectedCompilerHash = '8c07ee11610e399e133b9174ced1c78fe157abf1cc57421e1ea9aee79c8a0fc4'
if (-not $IncludeCompiler) {
	throw 'Stage 4.7 Setup-only packages must always include the expanded BeCoder toolchain.'
}
foreach ($obsoleteArchive in @(
	'resources\app\resources\oi-defaults\toolchains\clangd-windows-22.1.6.zip',
	'resources\app\resources\oi-defaults\toolchains\becoder-ucrt64.zip'
)) {
	if (Test-Path -LiteralPath (Join-Path $PackagePath $obsoleteArchive)) {
		throw "The staged package contains a forbidden runtime toolchain archive: $obsoleteArchive"
	}
}

$toolchainRoot = Join-Path $PackagePath 'data\toolchains'
$toolchainManifestPath = Join-Path $toolchainRoot 'becoder-toolchain-manifest.json'
$toolchainManifest = Get-Content -LiteralPath $toolchainManifestPath -Raw | ConvertFrom-Json
if ($toolchainManifest.schemaVersion -ne 2 -or $toolchainManifest.toolchainVersion -ne 'gcc-14.1.0-clangd-22.1.6') {
	throw 'The staged toolchain manifest has an unsupported format or version.'
}
$requiredToolchainFiles = @(
	'becoder-ucrt64/bin/g++.exe',
	'becoder-ucrt64/bin/gcc.exe',
	'becoder-ucrt64/bin/libgcc_s_seh-1.dll',
	'becoder-ucrt64/bin/libstdc++-6.dll',
	'becoder-ucrt64/bin/libwinpthread-1.dll',
	'becoder-ucrt64/bin/libgmp-10.dll',
	'becoder-ucrt64/bin/libisl-23.dll',
	'becoder-ucrt64/bin/libmpc-3.dll',
	'becoder-ucrt64/bin/libmpfr-6.dll',
	'becoder-ucrt64/bin/zlib1.dll',
	'becoder-ucrt64/bin/libzstd.dll',
	'becoder-ucrt64/bin/libintl-8.dll',
	'becoder-ucrt64/bin/libiconv-2.dll',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h.gch',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/debugger.h',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/cc1.exe',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/cc1plus.exe',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/collect2.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/as.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/ld.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libiconv-2.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libintl-8.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libwinpthread-1.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libzstd.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/zlib1.dll',
	'clangd/clangd_22.1.6/bin/clangd.exe',
	'clangd/clangd_22.1.6/LICENSE.TXT'
)
$manifestPaths = @($toolchainManifest.files.path)
foreach ($requiredToolchainFile in $requiredToolchainFiles) {
	if ($manifestPaths -notcontains $requiredToolchainFile) {
		throw "The staged toolchain manifest is missing a critical component: $requiredToolchainFile"
	}
}
if ($manifestPaths.Count -lt 3500 -or (@($manifestPaths | Sort-Object -Unique)).Count -ne $manifestPaths.Count -or
	(@($manifestPaths | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)).Count -ne $manifestPaths.Count) {
	throw 'The staged toolchain manifest is incomplete or contains duplicate paths.'
}
foreach ($file in @($toolchainManifest.files)) {
	if ($file.path -notmatch '^[^\\/:*?""<>|]+(?:/[^\\/:*?""<>|]+)*$' -or $file.path -match '(^|/)\.\.(/|$)' -or
		$file.size -lt 0 -or $file.sha256 -notmatch '^[0-9a-f]{64}$') {
		throw "The staged toolchain manifest contains an invalid entry: $($file.path)"
	}
	$filePath = Join-Path $toolchainRoot $file.path.Replace('/', '\')
	if (-not (Test-Path -LiteralPath $filePath -PathType Leaf) -or
		(Get-Item -LiteralPath $filePath).Length -ne $file.size -or
		(Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
		throw "The staged toolchain file does not match its manifest: $($file.path)"
	}
}
$actualToolchainPaths = @(Get-ChildItem -LiteralPath $toolchainRoot -Recurse -File | Where-Object {
	$_.FullName -ne $toolchainManifestPath
} | ForEach-Object {
	$_.FullName.Substring($toolchainRoot.Length + 1).Replace('\', '/')
})
[Array]::Sort($actualToolchainPaths, [StringComparer]::Ordinal)
$sortedManifestPaths = @($manifestPaths)
[Array]::Sort($sortedManifestPaths, [StringComparer]::Ordinal)
if (($actualToolchainPaths -join "`n") -ne ($sortedManifestPaths -join "`n")) {
	throw 'The staged toolchain tree does not exactly match its full integrity manifest.'
}

$compilerRoot = Join-Path $toolchainRoot 'becoder-ucrt64'
foreach ($forbiddenCompilerEntry in @(
	'bin\python.exe',
	'bin\objdump.exe',
	'lib\gcc\x86_64-w64-mingw32\14.1.0\plugin',
	'lib\gcc\x86_64-w64-mingw32\14.1.0\lto1.exe',
	'lib\gcc\x86_64-w64-mingw32\14.1.0\lto-wrapper.exe'
)) {
	if (Test-Path -LiteralPath (Join-Path $compilerRoot $forbiddenCompilerEntry)) {
		throw "The staged compiler contains a forbidden non-runtime payload: $forbiddenCompilerEntry"
	}
}
$compilerSize = (Get-ChildItem -LiteralPath $compilerRoot -File -Recurse | Measure-Object Length -Sum).Sum
if ($compilerSize -gt 400MB) {
	throw "The staged compiler exceeds the audited 400 MiB boundary: $compilerSize bytes"
}

$componentInventory = Get-Content -LiteralPath (Join-Path $appPath 'resources\oi-defaults\BUNDLED-COMPONENTS.json') -Raw | ConvertFrom-Json
$expectedComponentIds = @(
	'code-oss',
	'electron',
	'becoder.runner',
	'vscode.vscode-theme-seti',
	'becoder.becoder-setup',
	'becoder.gcc-diagnostics',
	'llvm-vs-code-extensions.vscode-clangd',
	'adpyke.codesnap',
	'becoder.one-monokai',
	'vscode.cpp',
	'vscode.mermaid-markdown-features',
	'ms-ceintl.vscode-language-pack-zh-hans',
	'clangd-windows',
	'becoder-ucrt64'
)
if ((@($componentInventory.components.id) -join ',') -ne ($expectedComponentIds -join ',')) {
	throw 'The bundled component inventory does not contain the exact approved component set.'
}
$requiredComponentFields = @('id', 'version', 'source', 'modificationStatus', 'spdxIdentifier', 'copyrightNotice')
foreach ($component in @($componentInventory.components)) {
	foreach ($field in $requiredComponentFields) {
		if (-not $component.$field) {
			throw "The bundled component inventory is missing $field for $($component.id)."
		}
	}
	if ($component.licensePath) {
		$licensePath = Join-Path $appPath $component.licensePath
		if (-not (Test-Path -LiteralPath $licensePath)) {
			throw "The bundled component inventory references a missing license path for $($component.id): $($component.licensePath)"
		}
	}
	if ($component.thirdPartyNoticesPath) {
		$thirdPartyNoticesPath = Join-Path $appPath $component.thirdPartyNoticesPath
		if (-not (Test-Path -LiteralPath $thirdPartyNoticesPath -PathType Leaf)) {
			throw "The bundled component inventory references missing third-party notices for $($component.id): $($component.thirdPartyNoticesPath)"
		}
	}
}
$clangdComponent = @($componentInventory.components) | Where-Object { $_.id -eq 'clangd-windows' }
$electronComponent = @($componentInventory.components) | Where-Object { $_.id -eq 'electron' }
$ucrt64Component = @($componentInventory.components) | Where-Object { $_.id -eq 'becoder-ucrt64' }
$languagePackComponent = @($componentInventory.components) | Where-Object { $_.id -eq 'ms-ceintl.vscode-language-pack-zh-hans' }
$mermaidComponent = @($componentInventory.components) | Where-Object { $_.id -eq 'vscode.mermaid-markdown-features' }
if ($clangdComponent.sha256 -ne $expectedClangdHash -or $ucrt64Component.sha256 -ne $expectedCompilerHash) {
	throw 'The bundled component inventory does not pin the audited source toolchain archives.'
}
if ($electronComponent.version -ne '42.6.0' -or
	$electronComponent.spdxIdentifier -ne 'MIT' -or
	$electronComponent.licensePath -ne 'licenses/MIT-Electron.txt' -or
	(Get-Content -LiteralPath (Join-Path $appPath $electronComponent.licensePath) -Raw -Encoding utf8) -notmatch 'Copyright \(c\) Electron contributors') {
	throw 'The bundled component inventory does not preserve the Electron runtime license boundary.'
}
if ($languagePackComponent.version -ne $languagePackManifest.version -or
	$languagePackComponent.sha256 -ne '265536b3db2bdcc01e764679da8fb6d7ceaa7a7f3bb35c8b53dd0db51e8707f0' -or
	$languagePackComponent.contentSha256 -ne '0f2b889acd2d1d09eaca3e17473f54b450fd593aaba0857fd8efd6888c13058a' -or
	$languagePackComponent.packagedContentSha256 -ne '4c207c39074d08ab54b215ee34a7c18d51dabb4e348f2fe66f28d2004a83d685') {
	throw 'The bundled component inventory does not pin the approved Simplified Chinese language pack snapshot.'
}
if ($mermaidComponent.version -ne '10.0.0' -or
	$mermaidComponent.licensePath -ne 'licenses/MIT-VSCode.txt' -or
	$mermaidComponent.thirdPartyNoticesPath -ne 'extensions/mermaid-markdown-features/ThirdPartyNotices.txt') {
	throw 'The bundled component inventory does not preserve the Mermaid Markdown license boundary.'
}
$ucrt64Inventory = Get-Content -LiteralPath (Join-Path $appPath 'resources\oi-defaults\toolchains\ucrt64-packages.json') -Raw | ConvertFrom-Json
if (@($ucrt64Inventory.packages).Count -ne 36 -or @($ucrt64Inventory.auxiliaryPackageSources).Count -ne 2) {
	throw 'The UCRT64 package inventory is incomplete.'
}
$ucrt64LicenseRoot = Join-Path $appPath $ucrt64Inventory.licenseFilesRoot
$retainedLicenseFiles = @(Get-ChildItem -LiteralPath $ucrt64LicenseRoot -Recurse -File)
if ($ucrt64Inventory.licenseFilesRoot -ne 'resources/oi-defaults/toolchains/ucrt64-licenses' -or
	$retainedLicenseFiles.Count -ne $ucrt64Inventory.evidence.retainedLicenseFileCount -or
	$retainedLicenseFiles.Count -lt 63) {
	throw 'The packaged UCRT64 license bundle is incomplete.'
}
$ucrt64RecipeRoot = Join-Path $appPath $ucrt64Inventory.recipeFilesRoot
$retainedRecipeFiles = @(Get-ChildItem -LiteralPath $ucrt64RecipeRoot -Recurse -File)
if ($ucrt64Inventory.recipeFilesRoot -ne 'resources/oi-defaults/toolchains/ucrt64-sources/recipes' -or
	$retainedRecipeFiles.Count -ne $ucrt64Inventory.evidence.retainedRecipeFileCount -or
	$retainedRecipeFiles.Count -lt 290) {
	throw 'The packaged UCRT64 source recipe bundle is incomplete.'
}

function Get-DirectoryFilesSha256 {
	param([Parameter(Mandatory = $true)][string]$DirectoryPath)

	$resolvedDirectoryPath = (Get-Item -LiteralPath $DirectoryPath).FullName
	$relativePaths = @(Get-ChildItem -LiteralPath $resolvedDirectoryPath -Recurse -File | ForEach-Object {
		$_.FullName.Substring($resolvedDirectoryPath.Length + 1).Replace('\', '/')
	})
	[Array]::Sort($relativePaths, [StringComparer]::Ordinal)
	$manifest = (($relativePaths | ForEach-Object {
		$pathHash = (Get-FileHash -LiteralPath (Join-Path $resolvedDirectoryPath $_) -Algorithm SHA256).Hash.ToLowerInvariant()
		"$_`t$pathHash"
	}) -join "`n")
	if ($relativePaths.Count) {
		$manifest += "`n"
	}

	$utf8 = New-Object System.Text.UTF8Encoding($false)
	$sha256 = [System.Security.Cryptography.SHA256]::Create()
	try {
		return [BitConverter]::ToString($sha256.ComputeHash($utf8.GetBytes($manifest))).Replace('-', '').ToLowerInvariant()
	} finally {
		$sha256.Dispose()
	}
}

$languagePackContentHash = Get-DirectoryFilesSha256 -DirectoryPath $languagePackPath
if ($languagePackContentHash -ne $languagePackComponent.packagedContentSha256) {
	throw 'The packaged Simplified Chinese language pack content differs from the approved deterministic package snapshot.'
}

$recipeDirectoryNames = @(Get-ChildItem -LiteralPath $ucrt64RecipeRoot -Directory | Sort-Object Name -CaseSensitive | ForEach-Object { $_.Name })
$inventoryRecipeNames = @($ucrt64Inventory.recipes.PSObject.Properties.Name | Sort-Object -CaseSensitive)
if (($recipeDirectoryNames -join ',') -ne ($inventoryRecipeNames -join ',')) {
	throw 'The packaged UCRT64 recipe directories do not match the pinned recipe inventory.'
}
foreach ($recipeName in $inventoryRecipeNames) {
	$recipe = $ucrt64Inventory.recipes.($recipeName)
	if ($recipe.filesSha256 -notmatch '^[0-9a-f]{64}$' -or
		(Get-DirectoryFilesSha256 -DirectoryPath (Join-Path $ucrt64RecipeRoot $recipeName)) -ne $recipe.filesSha256) {
		throw "The packaged UCRT64 recipe files do not match the pinned digest for $recipeName."
	}
}
foreach ($package in @($ucrt64Inventory.packages) + @($ucrt64Inventory.auxiliaryPackageSources)) {
	$recipe = $ucrt64Inventory.recipes.($package.recipe)
	if (-not $package.name -or -not $package.version -or -not $package.license -or
		$recipe.commit -notmatch '^[0-9a-f]{40}$' -or $recipe.pkgbuildSha256 -notmatch '^[0-9a-f]{64}$') {
		throw "The UCRT64 package inventory contains incomplete provenance for $($package.name)."
	}
	$pkgbuildPath = Join-Path $ucrt64RecipeRoot "$($package.recipe)\PKGBUILD"
	if (-not (Test-Path -LiteralPath $pkgbuildPath -PathType Leaf) -or
		(Get-FileHash -LiteralPath $pkgbuildPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $recipe.pkgbuildSha256) {
		throw "The packaged UCRT64 recipe does not match its pinned PKGBUILD for $($package.name)."
	}
	$licensePaths = @($ucrt64Inventory.licenseMappings.($package.name))
	if (-not $licensePaths.Count) {
		throw "The UCRT64 package inventory is missing a license mapping for $($package.name)."
	}
	foreach ($relativeLicensePath in $licensePaths) {
		$mappedLicensePath = Join-Path $ucrt64LicenseRoot $relativeLicensePath
		if (-not (Test-Path -LiteralPath $mappedLicensePath -PathType Leaf) -or (Get-Item -LiteralPath $mappedLicensePath).Length -eq 0) {
			throw "The UCRT64 package inventory references a missing license for $($package.name): $relativeLicensePath"
		}
	}
}

$forbiddenPaths = @(
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\dist\debugger.js',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\becoder-runner.ps1',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\runner-init.ps1',
	'resources\app\extensions\danielpinto8zz6.c-cpp-compile-run\resources\run.cmd',
	'resources\app\extensions\jeff-hykin.better-cpp-syntax',
	'resources\app\extensions\ms-vscode.js-debug',
	'resources\app\extensions\ms-vscode.js-debug-companion',
	'resources\app\extensions\ms-vscode.vscode-js-profile-table',
	'resources\app\extensions\prompt-basics',
	'resources\app\extensions\git',
	'resources\app\extensions\git-base',
	'resources\app\extensions\github',
	'resources\app\extensions\terminal-suggest',
	'resources\app\resources\oi-defaults\first-run.html',
	'resources\app\resources\oi-defaults\first-run-preload.js',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\ms-vscode.js-debug.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.debug-auto-launch.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.debug-server-ready.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.mermaid-chat-features.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.prompt.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.git.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.git-base.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.github.i18n.json',
	'resources\app\extensions\MS-CEINTL.vscode-language-pack-zh-hans\translations\extensions\vscode.terminal-suggest.i18n.json',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\chatEditModifiedFile.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\chatUserActionRequired.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\requestSent.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\responseReceived1.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\responseReceived2.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\responseReceived3.mp3',
	'resources\app\out\vs\platform\accessibilitySignal\browser\media\responseReceived4.mp3',
	'resources\app\out\vs\sessions',
	'resources\app\out\vs\platform\agentHost',
	'resources\app\out\vs\platform\mcp',
	'resources\app\out\vs\platform\networkFilter',
	'resources\app\out\vs\platform\webContentExtractor',
	'resources\app\out\vs\workbench\contrib\chat',
	'resources\app\out\vs\workbench\contrib\debug',
	'resources\app\out\vs\workbench\contrib\inlineChat',
	'resources\app\out\vs\workbench\contrib\mcp',
	'resources\app\out\vs\workbench\contrib\remoteCodingAgents',
	'resources\app\out\vs\workbench\contrib\welcomeAgentSessions',
	'resources\app\out\vs\workbench\services\agentHost',
	'resources\app\out\vs\workbench\services\chat',
	'resources\app\out\vs\workbench\services\mcp',
	'resources\app\out\vs\workbench\contrib\welcomeOnboarding',
	'resources\app\out\vs\platform\git',
	'resources\app\out\vs\workbench\contrib\git',
	'resources\app\out\vs\workbench\contrib\scm',
	'resources\app\out\vs\workbench\contrib\terminalContrib\inlineHint',
	'resources\app\out\vs\workbench\contrib\terminalContrib\suggest',
	'resources\app\out\vs\workbench\api\browser\mainThreadGitExtensionService.js',
	'resources\app\out\vs\workbench\api\browser\mainThreadQuickDiff.js',
	'resources\app\out\vs\workbench\api\browser\mainThreadSCM.js',
	'resources\app\out\vs\workbench\api\common\extHostGitExtensionService.js',
	'resources\app\out\vs\workbench\api\common\extHostQuickDiff.js',
	'resources\app\out\vs\workbench\api\common\extHostSCM.js',
	'resources\app\resources\oi-defaults\.clangd',
	'resources\app\resources\oi-defaults\portable-data\toolchains\.gitkeep',
	'resources\app\resources\oi-defaults\toolchains\gdb.exe',
	'resources\app\resources\oi-defaults\toolchains\winlibs-x86_64-posix-seh-gcc-16.1.0-mingw-w64ucrt-14.0.0-r3.zip'
)
foreach ($relativePath in $forbiddenPaths) {
	if (Test-Path -LiteralPath (Join-Path $PackagePath $relativePath)) {
		throw "Forbidden legacy BeCoder package entry was produced: $relativePath"
	}
}
if (Get-ChildItem -LiteralPath $PackagePath -Filter 'gdb.exe' -File -Recurse | Select-Object -First 1) {
	throw 'The packaged application contains a forbidden gdb.exe.'
}

Write-Host "Verified staged BeCoder package at $PackagePath (IncludeCompiler=$IncludeCompiler)"
