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
	'VISION.md',
	'README.md',
	'README.en.md',
	'SECURITY.md',
	'docs/README.md',
	'docs/getting-started.md',
	'docs/development.md',
	'docs/distribution.md',
	'licenses/README.md'
)

foreach ($relativePath in $requiredFiles) {
	if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot $relativePath) -PathType Leaf)) {
		$errors.Add("Missing required documentation file: $relativePath")
	}
}

$readme = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'README.en.md') -Raw -Encoding UTF8
$readmeCn = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'README.md') -Raw -Encoding UTF8
foreach ($requiredText in @('Code - OSS', 'Open VSX', 'github.com/Bc408/BeCoder-IDE/issues')) {
	if ($readme -notmatch [regex]::Escape($requiredText)) {
		$errors.Add("English README does not mention: $requiredText")
	}
}
foreach ($requiredText in @('Code - OSS', 'Open VSX', 'github.com/Bc408/BeCoder-IDE/issues')) {
	if ($readmeCn -notmatch [regex]::Escape($requiredText)) {
		$errors.Add("Simplified-Chinese README does not mention: $requiredText")
	}
}

if ($readme -notmatch 'README\.md' -or $readmeCn -notmatch 'README\.en\.md') {
	$errors.Add('The Chinese and English README entry points must link to each other.')
}

if ($errors.Count -gt 0) {
	foreach ($message in $errors) {
		Write-Error $message
	}
	exit 1
}

Write-Host 'BeCoder documentation structure validation passed.'
