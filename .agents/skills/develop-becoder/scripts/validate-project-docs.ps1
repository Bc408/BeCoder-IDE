param(
	[string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
	$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
}

$errors = [System.Collections.Generic.List[string]]::new()

$requiredFiles = @(
	'AGENTS.md',
	'BECODER_HANDOFF.md',
	'BECODER_PHILOSOPHY.md',
	'BECODER_CURRENT.md',
	'docs\DOCUMENTATION_RULES.md',
	'docs\contracts\README.md',
	'docs\archive\README.md',
	'docs\archive\stage4-development-record.md'
)

foreach ($relativePath in $requiredFiles) {
	if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot $relativePath) -PathType Leaf)) {
		$errors.Add("Missing required documentation file: $relativePath")
	}
}

$contractFiles = @(
	'runner.md',
	'native-powershell.md',
	'cpp-visual-system.md',
	'clangd.md',
	'gcc-diagnostics.md',
	'extension-governance.md',
	'setup-distribution.md',
	'workspace-and-user-data.md',
	'product-removal-boundary.md'
)

$contractIndexPath = Join-Path $RepositoryRoot 'docs\contracts\README.md'
if (Test-Path -LiteralPath $contractIndexPath) {
	$contractIndex = Get-Content -LiteralPath $contractIndexPath -Raw -Encoding UTF8
	foreach ($fileName in $contractFiles) {
		if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot "docs\contracts\$fileName") -PathType Leaf)) {
			$errors.Add("Missing product contract: $fileName")
		}
		if ($contractIndex -notmatch [regex]::Escape($fileName)) {
			$errors.Add("Contract index does not reference: $fileName")
		}
	}
}

$archiveFiles = @(
	'stage4.md',
	'stage4.1.md',
	'stage4.2.md',
	'stage4.3.md',
	'stage4.4.md',
	'stage4.4.1.md',
	'stage4.5.md',
	'stage4.6.md'
)

$archiveIndexPath = Join-Path $RepositoryRoot 'docs\archive\README.md'
if (Test-Path -LiteralPath $archiveIndexPath) {
	$archiveIndex = Get-Content -LiteralPath $archiveIndexPath -Raw -Encoding UTF8
	foreach ($fileName in $archiveFiles) {
		if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot "docs\archive\$fileName") -PathType Leaf)) {
			$errors.Add("Missing archive record: $fileName")
		}
		if ($archiveIndex -notmatch [regex]::Escape($fileName)) {
			$errors.Add("Archive index does not reference: $fileName")
		}
	}
}

$handoffPath = Join-Path $RepositoryRoot 'BECODER_HANDOFF.md'
if (Test-Path -LiteralPath $handoffPath) {
	$handoff = Get-Content -LiteralPath $handoffPath -Raw -Encoding UTF8
	foreach ($requiredReference in @('AGENTS.md', 'BECODER_PHILOSOPHY.md', 'BECODER_CURRENT.md', 'docs/contracts/README.md', 'docs/archive/README.md')) {
		if ($handoff -notmatch [regex]::Escape($requiredReference)) {
			$errors.Add("Handoff does not reference: $requiredReference")
		}
	}
}

$currentPath = Join-Path $RepositoryRoot 'BECODER_CURRENT.md'
if (Test-Path -LiteralPath $currentPath) {
	$current = Get-Content -LiteralPath $currentPath -Raw -Encoding UTF8
	$activeStageMatches = [regex]::Matches($current, '\*\*Stage [^*]+ is in progress\.')
	if ($activeStageMatches.Count -ne 1) {
		$errors.Add("Expected exactly one active stage statement; found $($activeStageMatches.Count).")
	}
}

$historicalPath = Join-Path $RepositoryRoot 'docs\archive\stage4-development-record.md'
if (Test-Path -LiteralPath $historicalPath) {
	$historical = Get-Content -LiteralPath $historicalPath -Raw -Encoding UTF8
	if ($historical -notmatch 'Historical archive') {
		$errors.Add('Former monolithic handoff is not marked as a historical archive.')
	}
}

if ($errors.Count -gt 0) {
	foreach ($message in $errors) {
		Write-Error $message
	}
	exit 1
}

Write-Host 'BeCoder documentation structure validation passed.'
