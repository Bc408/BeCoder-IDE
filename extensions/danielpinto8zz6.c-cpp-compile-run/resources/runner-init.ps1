function global:run {
	param(
		[Parameter(Position = 0)]
		[string]$SourcePath,
		[switch]$WithInput
	)

	if ([string]::IsNullOrWhiteSpace($SourcePath)) {
		Write-Host 'BeCoder Runner requires a C or C++ source path.' -ForegroundColor Red
		return
	}

	$arguments = @{
		StatePath = $env:BECODER_RUNNER_STATE_PATH
		SourcePath = $SourcePath
	}
	if ($WithInput) {
		$arguments['WithInput'] = $true
	}
	& $env:BECODER_RUNNER_SCRIPT_PATH @arguments
}
