param(
	[Parameter(Mandatory = $true)]
	[string]$ToolchainRoot
)

$ErrorActionPreference = 'Stop'

$compilerRoot = Join-Path $ToolchainRoot 'bin'
$cppCompiler = Join-Path $compilerRoot 'g++.exe'
$cCompiler = Join-Path $compilerRoot 'gcc.exe'
foreach ($compiler in @($cppCompiler, $cCompiler)) {
	if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
		throw "Bundled compiler not found: $compiler"
	}
}

$validationRoot = Join-Path ([IO.Path]::GetTempPath()) ("becoder-gcc-diagnostics-validation-" + [Guid]::NewGuid().ToString('N'))
$sourceRoot = Join-Path $validationRoot 'source'
$mirrorRoot = Join-Path $validationRoot 'mirror'
[IO.Directory]::CreateDirectory($sourceRoot) | Out-Null
[IO.Directory]::CreateDirectory($mirrorRoot) | Out-Null

function Write-Utf8File([string]$Path, [string]$Content) {
	[IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function ConvertTo-WindowsProcessArgument([string]$Value) {
	if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
		return $Value
	}
	$builder = [Text.StringBuilder]::new()
	[void]$builder.Append('"')
	$backslashes = 0
	foreach ($character in $Value.ToCharArray()) {
		if ($character -eq '\') {
			$backslashes++
			continue
		}
		if ($character -eq '"') {
			[void]$builder.Append('\' * ($backslashes * 2 + 1))
			[void]$builder.Append('"')
			$backslashes = 0
			continue
		}
		[void]$builder.Append('\' * $backslashes)
		$backslashes = 0
		[void]$builder.Append($character)
	}
	[void]$builder.Append('\' * ($backslashes * 2))
	[void]$builder.Append('"')
	return $builder.ToString()
}

function Invoke-GccDiagnostic(
	[string]$Compiler,
	[string]$Language,
	[string]$Standard,
	[string]$SourceName,
	[string[]]$AdditionalArguments = @()
) {
	$mirrorPath = Join-Path $mirrorRoot $SourceName
	$arguments = @(
		'-fsyntax-only',
		'-O2',
		'-x', $Language,
		"-std=$Standard",
		'-DDEBUG',
		'-finput-charset=UTF-8',
		'-fexec-charset=UTF-8',
		'-fdiagnostics-format=json',
		'-fdiagnostics-color=never',
		'-fdiagnostics-column-origin=1',
		'-fdiagnostics-column-unit=byte',
		'-iquote', $sourceRoot,
		"-fmacro-prefix-map=$mirrorRoot=$sourceRoot"
	) + $AdditionalArguments + @($mirrorPath)

	$startInfo = [Diagnostics.ProcessStartInfo]::new()
	$startInfo.FileName = $Compiler
	$startInfo.WorkingDirectory = $sourceRoot
	$startInfo.UseShellExecute = $false
	$startInfo.CreateNoWindow = $true
	$startInfo.RedirectStandardOutput = $true
	$startInfo.RedirectStandardError = $true
	$startInfo.Environment.Clear()
	$systemRoot = [Environment]::GetEnvironmentVariable('SystemRoot')
	$startInfo.Environment['SystemRoot'] = $systemRoot
	$startInfo.Environment['PATH'] = "$compilerRoot;$systemRoot\System32"
	$startInfo.Environment['TEMP'] = $validationRoot
	$startInfo.Environment['TMP'] = $validationRoot
	$startInfo.Arguments = ($arguments | ForEach-Object { ConvertTo-WindowsProcessArgument $_ }) -join ' '

	$process = [Diagnostics.Process]::new()
	$process.StartInfo = $startInfo
	if (-not $process.Start()) {
		throw "Failed to start bundled compiler: $Compiler"
	}
	$stderrTask = $process.StandardError.ReadToEndAsync()
	$stdoutTask = $process.StandardOutput.ReadToEndAsync()
	$process.WaitForExit()
	$stderr = $stderrTask.GetAwaiter().GetResult()
	$stdout = $stdoutTask.GetAwaiter().GetResult()
	$exitCode = $process.ExitCode
	$process.Dispose()
	if ($stdout.Length -ne 0) {
		throw "Unexpected GCC stdout for ${SourceName}: $stdout"
	}
	try {
		$decoded = $stderr | ConvertFrom-Json
	} catch {
		throw "Malformed GCC JSON for ${SourceName}: $stderr"
	}
	$diagnostics = @()
	if ($null -ne $decoded) {
		if ($decoded -is [Collections.IList]) {
			for ($index = 0; $index -lt $decoded.Count; $index++) {
				$diagnostics += $decoded[$index]
			}
		} else {
			$diagnostics = @($decoded)
		}
	}
	return [PSCustomObject]@{ ExitCode = $exitCode; Diagnostics = $diagnostics }
}

function Assert-Clean($Result, [string]$CaseName) {
	$errors = @($Result.Diagnostics | Where-Object { $_.kind -in @('error', 'fatal error') })
	$errorCount = ($errors | Measure-Object).Count
	if ($Result.ExitCode -ne 0 -or $errorCount -ne 0) {
		throw "$CaseName was expected to be error-clean. Exit=$($Result.ExitCode), Errors=$errorCount"
	}
}

function Assert-HasError($Result, [string]$CaseName) {
	$errors = @($Result.Diagnostics | Where-Object { $_.kind -in @('error', 'fatal error') })
	$errorCount = ($errors | Measure-Object).Count
	if ($Result.ExitCode -eq 0 -or $errorCount -eq 0) {
		$kinds = @($Result.Diagnostics | ForEach-Object { $_.kind }) -join ','
		$encoded = $Result.Diagnostics | ConvertTo-Json -Compress -Depth 10
		throw "$CaseName was expected to produce a structured GCC error. Exit=$($Result.ExitCode), Kinds=$kinds, Diagnostics=$encoded"
	}
}

try {
	Write-Utf8File (Join-Path $sourceRoot 'valid.cpp') @'
#include <bits/stdc++.h>
template <typename T> concept Number = std::is_arithmetic_v<T>;
int main() { Number auto value = 1; debug(value); return 0; }
'@
	Copy-Item -LiteralPath (Join-Path $sourceRoot 'valid.cpp') -Destination (Join-Path $mirrorRoot 'valid.Cpp')
	Assert-Clean (Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'valid.Cpp') 'C++20 bits/debugger/concept'

	Write-Utf8File (Join-Path $sourceRoot 'valid.c') @'
#include <stdio.h>
int main(void) { int n = 1; int values[n]; return scanf("%d", &values[0]) < 0; }
'@
	Copy-Item -LiteralPath (Join-Path $sourceRoot 'valid.c') -Destination (Join-Path $mirrorRoot 'valid.C')
	Assert-Clean (Invoke-GccDiagnostic $cCompiler 'c' 'c17' 'valid.C') 'C17 VLA/stdio/scanf'

	Write-Utf8File (Join-Path $mirrorRoot 'syntax.cpp') 'int main() { return missing_name }'
	Assert-HasError (Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'syntax.cpp') 'syntax and undeclared identifier'

	Write-Utf8File (Join-Path $mirrorRoot 'type.cpp') 'int main() { int value = "text"; return value; }'
	Assert-HasError (Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'type.cpp') 'type mismatch'

	Write-Utf8File (Join-Path $mirrorRoot 'missing.cpp') "#include `"missing-header.h`"`nint main() {}"
	Assert-HasError (Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'missing.cpp') 'missing include'

	Write-Utf8File (Join-Path $sourceRoot 'local.h') 'inline int local() { return unknown_local; }'
	Write-Utf8File (Join-Path $mirrorRoot 'relative.cpp') "#include `"local.h`"`nint main() { return local(); }"
	$relative = Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'relative.cpp'
	Assert-HasError $relative 'relative include'
	if (-not (@($relative.Diagnostics.locations.caret.file) -match 'local\.h')) {
		throw 'Relative include diagnostics did not retain the real header location.'
	}

	Write-Utf8File (Join-Path $mirrorRoot 'warning.cpp') 'int main() { int unused = 0; return 0; }'
	Assert-Clean (Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'warning.cpp') 'Stage 4.2 warning-only input'
	$warningProbe = Invoke-GccDiagnostic $cppCompiler 'c++' 'c++20' 'warning.cpp' @('-Wall')
	$warningCount = ($warningProbe.Diagnostics | Where-Object { $_.kind -eq 'warning' } | Measure-Object).Count
	if ($warningCount -eq 0) {
		throw 'The warning probe did not produce a structured GCC warning.'
	}
	$warningErrorCount = ($warningProbe.Diagnostics | Where-Object { $_.kind -in @('error', 'fatal error') } | Measure-Object).Count
	if ($warningErrorCount -ne 0) {
		throw 'The warning probe unexpectedly produced a GCC error.'
	}

	Write-Host 'Validated bundled GCC Stage 4.2 diagnostic matrix.'
} finally {
	$resolvedValidationRoot = [IO.Path]::GetFullPath($validationRoot)
	$resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
	if (-not $resolvedValidationRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
		throw "Refusing to clean validation path outside TEMP: $resolvedValidationRoot"
	}
	Remove-Item -LiteralPath $resolvedValidationRoot -Recurse -Force -ErrorAction SilentlyContinue
}
