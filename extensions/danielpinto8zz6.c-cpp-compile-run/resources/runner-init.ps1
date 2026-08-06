function Write-BeCoderRunnerCancellation {
	try {
		$statePath = $env:BECODER_RUNNER_STATE_PATH
		if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
			return
		}
		$request = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
		if ([string]::IsNullOrWhiteSpace([string]$request.resultPath)) {
			return
		}
		$result = [ordered]@{
			requestId = [string]$request.requestId
			status = 'cancelled'
			exitCode = 130
			message = 'BeCoder Runner command was cancelled.'
			time = [DateTime]::UtcNow.ToString('o')
		}
		[IO.File]::WriteAllText([string]$request.resultPath, ($result | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
	} catch {
		# Cancellation reporting must not interfere with the interactive terminal.
	}
}

function global:run {
	param(
		[Parameter(Position = 0)]
		[string]$SourcePath,
		[switch]$WithInput
	)

	if ([string]::IsNullOrWhiteSpace($SourcePath)) {
		Write-Host 'BeCoder Runner requires a C or C++ source path.' -ForegroundColor Red
		$global:LASTEXITCODE = 1
		Write-Error 'BeCoder Runner requires a source path.' -ErrorAction SilentlyContinue
		return
	}

	$arguments = @{
		StatePath = $env:BECODER_RUNNER_STATE_PATH
		SourcePath = $SourcePath
	}
	if ($WithInput) {
		$arguments['WithInput'] = $true
	}
	$runnerExitCode = $null
	try {
		$runnerOutput = @(& $env:BECODER_RUNNER_SCRIPT_PATH @arguments)
		$runnerExitCode = if ($runnerOutput.Count -gt 0) { [int]$runnerOutput[-1] } else { 0 }
	} catch {
		$runnerExitCode = 1
		if ($_.Exception -is [System.Management.Automation.PipelineStoppedException]) {
			Write-BeCoderRunnerCancellation
		}
	} finally {
		if ($null -eq $runnerExitCode) {
			Write-BeCoderRunnerCancellation
			$runnerExitCode = 130
		}
	}
	$global:LASTEXITCODE = $runnerExitCode
	if ($runnerExitCode -ne 0) {
		Write-Error 'BeCoder Runner command failed.' -ErrorAction SilentlyContinue
	}
}
