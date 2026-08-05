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

function Invoke-BeCoderRun {
	param([switch]$WithInput)

	$request = $null
	$tempExecutable = $null
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
		Set-Location -LiteralPath $sourceDirectory

		$baseName = [IO.Path]::GetFileNameWithoutExtension($sourcePath)
		$executablePath = Join-Path $sourceDirectory "$baseName.exe"
		$tempExecutable = Join-Path $sourceDirectory ".becoder-$baseName-$PID-$([Guid]::NewGuid().ToString('N')).exe"
		$compiler = Get-RequestedCompiler $request $extension
		$compilerBin = Split-Path -Parent $compiler
		$flags = if ($extension -eq '.c') { @($request.cFlags) } else { @($request.cppFlags) }
		$arguments = @()
		if ($extension -ne '.c') {
			$standard = if ([string]::IsNullOrWhiteSpace([string]$request.cppStandard)) { 'c++20' } else { [string]$request.cppStandard }
			$arguments += "-std=$standard"
		}
		$arguments += @($flags | ForEach-Object { [string]$_ })
		$arguments += @($sourcePath, '-o', $tempExecutable)

		# Keep the interactive Runner PATH minimal. The compiler child process
		# temporarily receives its private bin directory for GCC DLL/tool lookup.
		$compileTimer = [Diagnostics.Stopwatch]::StartNew()
		$previousPath = $env:PATH
		try {
			$env:PATH = "$compilerBin$([IO.Path]::PathSeparator)$previousPath"
			$compileOutput = @(& $compiler @arguments 2>&1)
		} finally {
			$env:PATH = $previousPath
		}
		$timings.compileMs = [int][math]::Round($compileTimer.Elapsed.TotalMilliseconds)
		foreach ($line in $compileOutput) {
			Write-Host ([string]$line)
		}
		$compileExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
		if ($compileExitCode -ne 0 -or -not (Test-Path -LiteralPath $tempExecutable -PathType Leaf)) {
			Write-RunnerBanner 'Syntax Error' ([ConsoleColor]::Red)
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult $request.resultPath 'compile-error' $compileExitCode 'Compiler rejected the source file.' -Timings $timings
			return
		}

		if (Test-Path -LiteralPath $executablePath -PathType Leaf) {
			Remove-Item -LiteralPath $executablePath -Force
		}
		Move-Item -LiteralPath $tempExecutable -Destination $executablePath -Force
		$tempExecutable = $null

		if ([string]$request.mode -eq 'compile') {
			Write-RunnerBanner 'Compilation Successful'
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult $request.resultPath 'compiled' 0 'Compilation completed.' -Timings $timings
			return
		}

		Write-RunnerBanner 'Compilation Successful, Running...'
		$runTimer = [Diagnostics.Stopwatch]::StartNew()
		$previousPath = $env:PATH
		try {
			$env:PATH = "$compilerBin$([IO.Path]::PathSeparator)$previousPath"
			$inputPath = [string]$request.inputPath
			if ($WithInput) {
				$inputDirectory = if ([string]::IsNullOrWhiteSpace($inputPath)) { '' } else { [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($inputPath)) }
				if ([string]::IsNullOrWhiteSpace($inputPath) -or -not (Test-Path -LiteralPath $inputPath -PathType Leaf) -or [IO.Path]::GetFileName($inputPath) -ne 'input' -or $inputDirectory -ne $sourceDirectory) {
					throw 'Run With File requires one ordinary file named input beside the source file.'
				}
				$runExitCode = Invoke-BeCoderInput $executablePath $inputPath $sourceDirectory
			} else {
				& $executablePath
				$runExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
			}
		} finally {
			$env:PATH = $previousPath
		}
		$timings.runMs = [int][math]::Round($runTimer.Elapsed.TotalMilliseconds)
		$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
		Write-RunnerBanner 'Run Complete' ($(if ($runExitCode -eq 0) { [ConsoleColor]::Green } else { [ConsoleColor]::Yellow }))
		Write-RunnerResult $request.resultPath 'completed' $runExitCode 'Program execution completed.' -Timings $timings

		if ([bool]$request.cleanupExecutable) {
			Remove-Item -LiteralPath $executablePath -Force
			Write-RunnerBanner 'Executable Program Removed'
		}
	} catch {
		$message = $_.Exception.Message
		if ($message.StartsWith('TOOLCHAIN_ERROR:')) {
			$message = $message.Substring('TOOLCHAIN_ERROR:'.Length).Trim()
			Write-RunnerBanner 'BeCoder Toolchain Error' ([ConsoleColor]::Red)
		} else {
			Write-RunnerBanner 'Syntax Error' ([ConsoleColor]::Red)
		}
		Write-Host $message -ForegroundColor Red
		if ($request) {
			$timings.totalMs = [int][math]::Round($totalTimer.Elapsed.TotalMilliseconds)
			Write-RunnerResult $request.resultPath 'error' 1 $message -Timings $timings
		}
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

function run {
	param([switch]$WithInput)
	Invoke-BeCoderRun -WithInput:$WithInput
}

Invoke-BeCoderRun -WithInput:$WithInput
