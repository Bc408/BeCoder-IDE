param(
	[Parameter(Mandatory = $true)]
	[string]$StatePath,
	[string]$SourcePath,
	[switch]$WithInput
)

$ErrorActionPreference = 'Stop'

function Write-RunnerResult {
	param(
		[string]$Path,
		[string]$RequestId,
		[string]$Status,
		[int]$ExitCode = 0,
		[string]$Message = '',
		[System.Collections.IDictionary]$Timings = $null
	)

	if ([string]::IsNullOrWhiteSpace($Path)) {
		return
	}

	try {
		$parent = Split-Path -Parent $Path
		if ($parent) {
			[IO.Directory]::CreateDirectory($parent) | Out-Null
		}
		$result = [ordered]@{
			requestId = $RequestId
			status = $Status
			exitCode = $ExitCode
			message = $Message
			time = [DateTime]::UtcNow.ToString('o')
		}
		if ($Timings) {
			$result.timings = $Timings
		}
		$json = $result | ConvertTo-Json -Compress
		[IO.File]::WriteAllText($Path, $json, [Text.UTF8Encoding]::new($false))
	} catch {
		# A result file is diagnostic only and must not break the terminal session.
	}
}

function Write-RunnerBanner {
	param(
		[string]$Text,
		[ConsoleColor]$Color = [ConsoleColor]::Green
	)

	Write-Host "===== $Text =====" -ForegroundColor $Color
}

function Get-RunnerRequest {
	if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
		throw "BeCoder Runner request was not found: $StatePath"
	}
	return Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
}

function Get-RequestedCompiler {
	param($Request, [string]$Extension)

	$compiler = if ($Extension -eq '.c') { $Request.cCompilerPath } else { $Request.compilerPath }
	if ([string]::IsNullOrWhiteSpace([string]$compiler)) {
		throw "TOOLCHAIN_ERROR: BeCoder's integrated compiler is not configured. Run BeCoder setup first."
	}
	$toolchainRoot = [string]$Request.toolchainRoot
	if ([string]::IsNullOrWhiteSpace($toolchainRoot)) {
		throw "TOOLCHAIN_ERROR: BeCoder's integrated toolchain root is not configured. Run BeCoder setup first."
	}
	$expectedName = if ($Extension -eq '.c') { 'gcc.exe' } else { 'g++.exe' }
	$expectedCompiler = [IO.Path]::GetFullPath((Join-Path $toolchainRoot (Join-Path 'becoder-ucrt64' (Join-Path 'bin' $expectedName))))
	$requestedCompiler = [IO.Path]::GetFullPath([string]$compiler)
	if (-not [string]::Equals($requestedCompiler, $expectedCompiler, [StringComparison]::OrdinalIgnoreCase)) {
		throw "TOOLCHAIN_ERROR: Run uses only BeCoder's bundled compiler: $expectedCompiler"
	}
	if (-not (Test-Path -LiteralPath $expectedCompiler -PathType Leaf)) {
		throw "TOOLCHAIN_ERROR: BeCoder's bundled compiler was not found: $expectedCompiler"
	}
	return $expectedCompiler
}

function Get-BeCoderCompilerFlags {
	param($RequestedFlags)

	$flags = @()
	foreach ($candidate in @($RequestedFlags)) {
		$flag = [string]$candidate
		$isWarning = $flag -cmatch '^-W(?:no-)?[A-Za-z0-9][A-Za-z0-9+_.=-]*$' -and
			$flag -cnotmatch '^-W[alp](?:,|=|$)'
		$isAllowed = $flag -cmatch '^-O(?:0|1|2|3|g|s|fast)$' -or
			$isWarning -or
			$flag -cmatch '^-D[A-Za-z_][A-Za-z0-9_]*(?:=[A-Za-z0-9_+.-]+)?$' -or
			$flag -cmatch '^-U[A-Za-z_][A-Za-z0-9_]*$' -or
			$flag -cmatch '^-g(?:0|1|2|3)?$' -or
			@('-pipe', '-pedantic', '-pedantic-errors', '-pthread') -ccontains $flag
		if (-not $isAllowed) {
			throw "TOOLCHAIN_ERROR: Unsupported compiler flag in BeCoder Runner: $flag"
		}
		$flags += $flag
	}
	return $flags
}

function Enter-BeCoderChildEnvironment {
	param([string]$CompilerBin)

	$systemDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::System)
	if ([string]::IsNullOrWhiteSpace($systemDirectory)) {
		throw 'TOOLCHAIN_ERROR: Windows system directory is unavailable.'
	}
	$variableNames = @(
		'PATH', 'CPATH', 'CPLUS_INCLUDE_PATH', 'C_INCLUDE_PATH',
		'OBJC_INCLUDE_PATH', 'GCC_EXEC_PREFIX', 'COMPILER_PATH',
		'LIBRARY_PATH', 'LIB', 'INCLUDE', 'CFLAGS', 'CXXFLAGS',
		'CPPFLAGS', 'LDFLAGS', 'GXX_INCLUDE_PATH',
		'DEPENDENCIES_OUTPUT', 'SUNPRO_DEPENDENCIES'
	)
	$state = @{}
	foreach ($name in $variableNames) {
		$item = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
		$state[$name] = if ($null -eq $item) { $null } else { [string]$item.Value }
		Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
	}
	$env:PATH = "$CompilerBin$([IO.Path]::PathSeparator)$systemDirectory"
	return $state
}

function Exit-BeCoderChildEnvironment {
	param([System.Collections.IDictionary]$State)

	foreach ($name in $State.Keys) {
		if ($null -eq $State[$name]) {
			Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
		} else {
			Set-Item -LiteralPath "Env:$name" -Value ([string]$State[$name])
		}
	}
}

function Invoke-BeCoderRun {
	param([switch]$WithInput)

	$request = $null
	$tempExecutable = $null
	$phase = 'setup'
	$timings = [ordered]@{}
	$totalTimer = [Diagnostics.Stopwatch]::StartNew()
	try {
		$request = Get-RunnerRequest
		$requestedSourcePath = if ([string]::IsNullOrWhiteSpace($SourcePath)) { [string]$request.sourcePath } else { $SourcePath }
		$sourcePath = [IO.Path]::GetFullPath($requestedSourcePath)
		if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
			throw "Source file was not found: $sourcePath"
		}

		$extension = [IO.Path]::GetExtension($sourcePath).ToLowerInvariant()
		if ($extension -ne '.c' -and $extension -notin @('.cc', '.cpp', '.cxx')) {
			throw 'BeCoder Runner supports only C and C++ source files.'
		}
		$sourceDirectory = Split-Path -Parent $sourcePath

		$baseName = [IO.Path]::GetFileNameWithoutExtension($sourcePath)
		$executablePath = Join-Path $sourceDirectory "$baseName.exe"
		$tempExecutable = Join-Path $sourceDirectory ".becoder-$baseName-$PID-$([Guid]::NewGuid().ToString('N')).exe"
		$compiler = Get-RequestedCompiler $request $extension
		$compilerBin = Split-Path -Parent $compiler
		$flags = Get-BeCoderCompilerFlags $(if ($extension -eq '.c') { $request.cFlags } else { $request.cppFlags })
		$arguments = @()
		if ($extension -eq '.c') {
			$standard = if ([string]::IsNullOrWhiteSpace([string]$request.cStandard)) { 'c17' } else { [string]$request.cStandard }
			if ($standard -notin @('c11', 'c17', 'c23')) {
				throw "TOOLCHAIN_ERROR: Unsupported BeCoder C standard: $standard"
			}
			$arguments += @($flags | ForEach-Object { [string]$_ })
			$arguments += "-std=$standard"
		} else {
			$standard = if ([string]::IsNullOrWhiteSpace([string]$request.cppStandard)) { 'c++20' } else { [string]$request.cppStandard }
			if ($standard -notin @('c++11', 'c++14', 'c++17', 'c++20', 'c++23')) {
				throw "TOOLCHAIN_ERROR: Unsupported BeCoder C++ standard: $standard"
			}
			$arguments += @($flags | ForEach-Object { [string]$_ })
			$arguments += "-std=$standard"
		}
		$arguments += @($sourcePath, '-o', $tempExecutable)

		# Keep the interactive Runner PATH minimal. The compiler child process
		# temporarily receives its private bin directory for GCC DLL/tool lookup.
		$phase = 'compile'
		$compileTimer = [Diagnostics.Stopwatch]::StartNew()
		$environmentState = Enter-BeCoderChildEnvironment $compilerBin
		try {
			$compileOutput = @(& $compiler @arguments 2>&1)
			$compileExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
		} finally {
			Exit-BeCoderChildEnvironment $environmentState
		}
		$timings.compileMs = [int][math]::Round($compileTimer.Elapsed.TotalMilliseconds)
		foreach ($line in $compileOutput) {
			Write-Host ([string]$line)
		}
		if ($compileExitCode -ne 0 -or -not (Test-Path -LiteralPath $tempExecutable -PathType Leaf)) {
			Write-RunnerBanner 'Compilation Error' ([ConsoleColor]::Red)
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult -Path $request.resultPath -RequestId ([string]$request.requestId) -Status 'compile-error' -ExitCode $compileExitCode -Message 'Compiler rejected the source file.' -Timings $timings
			return 1
		}

		$phase = 'publish'
		if (Test-Path -LiteralPath $executablePath -PathType Leaf) {
			Remove-Item -LiteralPath $executablePath -Force
		}
		Move-Item -LiteralPath $tempExecutable -Destination $executablePath -Force
		$tempExecutable = $null

		if ([string]$request.mode -eq 'compile') {
			Write-RunnerBanner 'Compilation Successful'
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult -Path $request.resultPath -RequestId ([string]$request.requestId) -Status 'compiled' -ExitCode 0 -Message 'Compilation completed.' -Timings $timings
			return 0
		}

		Write-RunnerBanner 'Compilation Successful, Running...'
		$phase = 'input'
		$runTimer = [Diagnostics.Stopwatch]::StartNew()
		$environmentState = Enter-BeCoderChildEnvironment $compilerBin
		try {
			$inputPath = [string]$request.inputPath
			if ($WithInput) {
				$inputDirectory = if ([string]::IsNullOrWhiteSpace($inputPath)) { '' } else { [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($inputPath)) }
				if ([string]::IsNullOrWhiteSpace($inputPath) -or -not (Test-Path -LiteralPath $inputPath -PathType Leaf) -or -not [string]::Equals([IO.Path]::GetFileName($inputPath), 'input', [StringComparison]::Ordinal) -or -not [string]::Equals($inputDirectory, $sourceDirectory, [StringComparison]::OrdinalIgnoreCase)) {
					throw 'INPUT_ERROR: Run With File requires one ordinary file named input beside the source file.'
				}
				$phase = 'run'
				$runExitCode = Invoke-BeCoderInput $executablePath $inputPath $sourceDirectory
			} else {
				$phase = 'run'
				$runExitCode = Invoke-BeCoderProcess $executablePath $sourceDirectory
			}
		} finally {
			Exit-BeCoderChildEnvironment $environmentState
		}
		$timings.runMs = [int][math]::Round($runTimer.Elapsed.TotalMilliseconds)
		$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
		Write-RunnerBanner 'Run Complete' ($(if ($runExitCode -eq 0) { [ConsoleColor]::Green } else { [ConsoleColor]::Yellow }))
		Write-RunnerResult -Path $request.resultPath -RequestId ([string]$request.requestId) -Status 'completed' -ExitCode $runExitCode -Message 'Program execution completed.' -Timings $timings

		if ([bool]$request.cleanupExecutable) {
			Remove-Item -LiteralPath $executablePath -Force
			Write-RunnerBanner 'Executable Program Removed'
		}
		return [int]$runExitCode
	} catch {
		$message = $_.Exception.Message
		$status = 'runner-error'
		if ($message.StartsWith('TOOLCHAIN_ERROR:')) {
			$message = $message.Substring('TOOLCHAIN_ERROR:'.Length).Trim()
			$status = 'toolchain-error'
			Write-RunnerBanner 'BeCoder Toolchain Error' ([ConsoleColor]::Red)
		} elseif ($message.StartsWith('INPUT_ERROR:')) {
			$message = $message.Substring('INPUT_ERROR:'.Length).Trim()
			$status = 'input-error'
			Write-RunnerBanner 'Input Error' ([ConsoleColor]::Red)
		} elseif ($phase -eq 'compile') {
			$status = 'compile-error'
			Write-RunnerBanner 'Compilation Error' ([ConsoleColor]::Red)
		} elseif ($phase -eq 'run') {
			$status = 'runtime-error'
			Write-RunnerBanner 'Runtime Error' ([ConsoleColor]::Red)
		} else {
			Write-RunnerBanner 'Runner Error' ([ConsoleColor]::Red)
		}
		Write-Host $message -ForegroundColor Red
		if ($request) {
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult -Path $request.resultPath -RequestId ([string]$request.requestId) -Status $status -ExitCode 1 -Message $message -Timings $timings
		}
		return 1
	} finally {
		if ($tempExecutable -and (Test-Path -LiteralPath $tempExecutable -PathType Leaf)) {
			Remove-Item -LiteralPath $tempExecutable -Force -ErrorAction SilentlyContinue
		}
	}
}

function Invoke-BeCoderInput {
	param(
		[string]$ExecutablePath,
		[string]$InputPath,
		[string]$WorkingDirectory
	)

	$startInfo = New-Object System.Diagnostics.ProcessStartInfo
	$startInfo.FileName = $ExecutablePath
	$startInfo.WorkingDirectory = $WorkingDirectory
	$startInfo.UseShellExecute = $false
	$startInfo.RedirectStandardInput = $true
	$process = New-Object System.Diagnostics.Process
	$process.StartInfo = $startInfo
	[void]$process.Start()
	$bytes = [IO.File]::ReadAllBytes($InputPath)
	$process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
	$process.StandardInput.Close()
	$process.WaitForExit()
	return $process.ExitCode
}

function Invoke-BeCoderProcess {
	param(
		[string]$ExecutablePath,
		[string]$WorkingDirectory
	)

	$startInfo = New-Object System.Diagnostics.ProcessStartInfo
	$startInfo.FileName = $ExecutablePath
	$startInfo.WorkingDirectory = $WorkingDirectory
	$startInfo.UseShellExecute = $false
	$process = New-Object System.Diagnostics.Process
	$process.StartInfo = $startInfo
	try {
		[void]$process.Start()
		$process.WaitForExit()
		return $process.ExitCode
	} finally {
		$process.Dispose()
	}
}

function run {
	param([switch]$WithInput)
	Invoke-BeCoderRun -WithInput:$WithInput
}

Invoke-BeCoderRun -WithInput:$WithInput
