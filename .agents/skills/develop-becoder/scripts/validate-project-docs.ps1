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
	'BECODER_PHILOSOPHY.md',
	'README.md',
	'README_cn.md',
	'SECURITY.md'
)

foreach ($relativePath in $requiredFiles) {
	if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot $relativePath) -PathType Leaf)) {
		$errors.Add("Missing required documentation file: $relativePath")
	}
}

$readme = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'README.md') -Raw -Encoding UTF8
$readmeCn = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'README_cn.md') -Raw -Encoding UTF8
foreach ($requiredText in @('1.0.0', 'Code - OSS 1.130', 'Open VSX', 'GitHub Issues')) {
	if ($readme -notmatch [regex]::Escape($requiredText)) {
		$errors.Add("English README does not mention: $requiredText")
	}
}
foreach ($requiredText in @('1.0.0', 'Code - OSS 1.130', 'Open VSX', 'GitHub Issues')) {
	if ($readmeCn -notmatch [regex]::Escape($requiredText)) {
		$errors.Add("Simplified-Chinese README does not mention: $requiredText")
	}
}

if ($errors.Count -gt 0) {
	foreach ($message in $errors) {
		Write-Error $message
	}
	exit 1
}

Write-Host 'BeCoder documentation structure validation passed.'
