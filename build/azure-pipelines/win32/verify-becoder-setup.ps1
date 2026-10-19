param(
	[Parameter(Mandatory = $true)]
	[string]$SetupPath,

	[Parameter(Mandatory = $true)]
	[string]$StagedPackagePath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$verificationBaseRoot = 'C:\BeCoderSetupVerification'
if (-not (Test-Path -LiteralPath $SetupPath -PathType Leaf)) {
	throw "BeCoder Setup was not found: $SetupPath"
}
if (-not (Test-Path -LiteralPath $StagedPackagePath -PathType Container)) {
	throw "Staged BeCoder package was not found: $StagedPackagePath"
}

$setupScriptPath = Join-Path $repositoryRoot 'build\win32\becoder.iss'
$setupScript = Get-Content -LiteralPath $setupScriptPath -Raw -Encoding utf8
foreach ($requiredDirective in @(
	'(?im)^\s*PrivilegesRequired=lowest\s*$',
	'(?im)^\s*UninstallDisplayIcon=\{app\}\\\{#ExeBasename\}\.exe\s*$',
	'(?im)^\s*ChangesAssociations=no\s*$',
	'(?im)^\s*ChangesEnvironment=no\s*$'
)) {
	if ($setupScript -notmatch $requiredDirective) {
		throw "BeCoder Setup is missing a required zero-integration directive: $requiredDirective"
	}
}
foreach ($requiredModeDirective in @(
	'(?im)^\s*Uninstallable\s*=\s*not IsPortableMode\(\)\s*$',
	'(?im)^\s*CreateUninstallRegKey\s*=\s*not IsPortableMode\(\)\s*$'
)) {
	if ($setupScript -notmatch $requiredModeDirective) {
		throw "BeCoder Setup is missing a required mode-aware uninstall directive: $requiredModeDirective"
	}
}
foreach ($previousSetting in @('AppDir', 'Group', 'Language', 'Privileges', 'SetupType', 'Tasks', 'UserInfo')) {
	if ($setupScript -notmatch "(?im)^\s*UsePrevious$previousSetting=no\s*$") {
		throw "BeCoder Setup may persist previous installer state: UsePrevious$previousSetting=no is missing."
	}
}

function Get-InnoSection {
	param([string]$Name)
	$section = [regex]::Match($setupScript, "(?ims)^\s*\[$Name\]\s*$\r?\n(?<body>.*?)(?=^\s*\[[^\]]+\]\s*$|\z)")
	if (-not $section.Success) {
		throw "BeCoder Setup is missing the required [$Name] section."
	}
	return $section.Groups['body'].Value
}

$tasksSection = Get-InnoSection -Name 'Tasks'
$taskEntries = @($tasksSection -split '\r?\n' | Where-Object { $_ -match '^\s*Name:' })
if ($taskEntries.Count -ne 1 -or
	$taskEntries[0] -notmatch '^\s*Name:\s*"desktopicon";\s*Description:\s*"\{cm:CreateDesktopShortcut\}"\s*$') {
	throw 'BeCoder Setup must expose exactly one desktop-shortcut task, selected by default.'
}

$iconsSection = Get-InnoSection -Name 'Icons'
$iconEntries = @($iconsSection -split '\r?\n' | Where-Object { $_ -match '^\s*Name:' })
$desktopIconEntries = @($iconEntries | Where-Object { $_ -match '^\s*Name:\s*"\{userdesktop\}\\\{#NameLong\}";' })
if ($iconEntries.Count -ne 1 -or $desktopIconEntries.Count -ne 1 -or
	$desktopIconEntries[0] -notmatch '^\s*Name:\s*"\{userdesktop\}\\\{#NameLong\}";\s*Filename:\s*"\{app\}\\\{#ExeBasename\}\.exe";\s*WorkingDir:\s*"\{app\}";\s*Tasks:\s*desktopicon\s*$') {
	throw 'BeCoder Setup must keep the selected-by-default current-user desktop shortcut.'
}
foreach ($requiredShortcutBoundary in @(
	"not IsPortableMode\(\) and RunStartMenuShortcut\('create'\)",
	"RunStartMenuShortcut\('remove'\)",
	'ShortcutHelperSHA256',
	"ShellExec\('runas'"
)) {
	if ($setupScript -notmatch $requiredShortcutBoundary) {
		throw "BeCoder Setup is missing the public Start-menu helper boundary: $requiredShortcutBoundary"
	}
}

foreach ($requiredShortcutMessage in @(
	'(?im)^\s*english\.CreateDesktopShortcut=Create a desktop shortcut \(not recommended when installing BeCoder on removable storage\)\s*$',
	'(?im)^\s*simplifiedChinese\.CreateDesktopShortcut=.+$'
)) {
	if ($setupScript -notmatch $requiredShortcutMessage) {
		throw "BeCoder Setup is missing required desktop-shortcut text: $requiredShortcutMessage"
	}
}
foreach ($forbiddenPattern in @(
	'(?im)^\s*AppId=',
	'(?im)^\s*DefaultGroupName=',
	'(?im)^\s*\[(Registry|UninstallRun)\]\s*$',
	'(?i)\{(?:auto|common)desktop\}|\{group\}|\{userstartmenu\}|\{commonstartmenu\}',
	'(?i)\bReg(?:Write|Delete)\w*\s*\('
)) {
	if ($setupScript -match $forbiddenPattern) {
		throw "BeCoder Setup contains forbidden system integration: $forbiddenPattern"
	}
}

if (Test-Path -LiteralPath $verificationBaseRoot) {
	$verificationBase = Get-Item -LiteralPath $verificationBaseRoot -Force
	if (-not $verificationBase.PSIsContainer -or ($verificationBase.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
		throw "Unsafe Setup verification directory: $verificationBaseRoot"
	}
} else {
	New-Item -ItemType Directory -Path $verificationBaseRoot | Out-Null
}
$verificationRoot = Join-Path $verificationBaseRoot ('r' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory -Path $verificationRoot | Out-Null
$installRoot = Join-Path $verificationRoot 'BeCoder A'
$secondInstallRoot = Join-Path $verificationRoot 'BeCoder B'
$nativeInstallRoot = Join-Path $verificationRoot 'Native'
$movedInstallRoot = Join-Path $verificationRoot 'Moved A'
$foreignRoot = Join-Path $verificationRoot 'foreign'
# allow-any-unicode-next-line
$unicodeRoot = Join-Path $verificationRoot '中文'
$longRoot = Join-Path $verificationRoot ('x' * (71 - $verificationRoot.Length - 1))
# allow-any-unicode-next-line
$unicodeJunctionTarget = Join-Path $verificationRoot 'junction-target-中文'
$longJunctionTarget = Join-Path $verificationRoot ('y' * (71 - $verificationRoot.Length - 1))
$unicodeJunction = Join-Path $verificationRoot 'ju'
$longJunction = Join-Path $verificationRoot 'jl'
$externalProject = Join-Path $verificationRoot 'external-project.cpp'
Set-Content -LiteralPath $externalProject -Value 'int main() { return 0; }' -Encoding ascii
foreach ($target in @($unicodeJunctionTarget, $longJunctionTarget)) {
	New-Item -ItemType Directory -Path $target | Out-Null
	Set-Content -LiteralPath (Join-Path $target 'must-survive.txt') -Value 'junction target must survive' -Encoding ascii
}
New-Item -ItemType Junction -Path $unicodeJunction -Target $unicodeJunctionTarget | Out-Null
New-Item -ItemType Junction -Path $longJunction -Target $longJunctionTarget | Out-Null

function Invoke-Setup {
	param([string]$Target, [string]$LogName, [switch]$AllowDataLoss, [switch]$UseDefaultTasks, [switch]$Portable)
	$arguments = @(
		'/VERYSILENT',
		'/SUPPRESSMSGBOXES',
		'/NORESTART',
		"/DIR=`"$Target`"",
		"/LOG=`"$(Join-Path $verificationRoot $LogName)`""
	)
	if ($AllowDataLoss) {
		$arguments += '/BECODERALLOWDATALOSS=1'
	}
	if ($Portable) {
		$arguments += '/BECODERPORTABLE=1'
	}
	if (-not $UseDefaultTasks) {
		$arguments += '/TASKS=""'
	}
	$process = Start-Process -FilePath $SetupPath -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
	return $process.ExitCode
}

function Assert-SetupLogHasNoRegistryWrites {
	param([string]$LogName)
	$logPath = Join-Path $verificationRoot $LogName
	if (-not (Test-Path -LiteralPath $logPath -PathType Leaf)) {
		throw "BeCoder Setup log was not created: $logPath"
	}
	$log = Get-Content -LiteralPath $logPath -Raw
	foreach ($forbiddenLogPattern in @(
		'(?im)Creating new uninstall (?:log|key)',
		'(?im)Saving uninstall information',
		'(?im)Writing uninstall key values',
		'(?im)(?:Creating|Deleting) registry key',
		'(?im)(?:Setting|Deleting) registry value'
	)) {
		if ($log -match $forbiddenLogPattern) {
			throw "BeCoder Setup log records a forbidden registry or uninstall write: $forbiddenLogPattern"
		}
	}
}

function Get-ShortcutSnapshot {
	param(
		[string[]]$Paths = @(
			[Environment]::GetFolderPath('Desktop'),
			[Environment]::GetFolderPath('StartMenu'),
			[Environment]::GetFolderPath('CommonDesktopDirectory'),
			[Environment]::GetFolderPath('CommonStartMenu')
		)
	)
	return @($Paths | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | ForEach-Object {
		Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
			'{0}|{1}' -f $_.FullName, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
		}
	} | Sort-Object -Unique)
}

function Get-RegistryIntegrationSnapshot {
	$roots = @(
		'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths',
		'HKCU:\Software\RegisteredApplications',
		'HKLM:\Software\RegisteredApplications',
		'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
		'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
		'HKCU:\Environment',
		'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
		'HKCU:\Software\Classes\Applications',
		'HKLM:\Software\Classes\Applications',
		'HKCU:\Software\Classes\Directory\shell',
		'HKCU:\Software\Classes\Directory\Background\shell',
		'HKCU:\Software\Classes\*\shell',
		'HKLM:\Software\Classes\Directory\shell',
		'HKLM:\Software\Classes\Directory\Background\shell',
		'HKLM:\Software\Classes\*\shell'
	)
	return @($roots | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
		@(Get-Item -LiteralPath $_) + @(Get-ChildItem -LiteralPath $_ -Recurse -ErrorAction Stop)
	} | ForEach-Object {
		$key = $_
		foreach ($valueName in @($key.GetValueNames()) | Sort-Object) {
			$value = $key.GetValue($valueName, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
			$valueJson = ConvertTo-Json -InputObject $value -Compress -Depth 5
			"$($key.Name)|$valueName|$($key.GetValueKind($valueName))|$valueJson"
		}
		if ($key.ValueCount -eq 0) {
			"$($key.Name)|<empty>"
		}
	} | Sort-Object -Unique)
}

function Get-BeCoderNamedRegistrySnapshot {
	$lines = @()
	foreach ($hive in @('HKCU\Software', 'HKLM\Software')) {
		foreach ($term in @('BeCoder', 'Bc408')) {
			$output = & reg.exe query $hive /f $term /k /s 2>$null
			if ($LASTEXITCODE -notin @(0, 1)) {
				throw "Unable to inspect $hive for registry term $term."
			}
			$lines += @(Get-RegistrySearchKeys -SearchOutput $output -TemporaryRegistrationName $nativeRegistryBackupName | ForEach-Object { "$hive|$term|$_" })
		}
	}
	return @($lines | Sort-Object -Unique)
}

Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class BeCoderSetupVerificationRegistry {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern int RegRenameKey(SafeRegistryHandle parent, string oldName, string newName);
}
'@

function Rename-VerificationUninstallKey {
	param([string]$SourceName, [string]$DestinationName)
	$parent = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall', $true)
	if (-not $parent) { throw 'The current-user uninstall registry root is unavailable.' }
	try {
		# RegRenameKey fails if DestinationName exists; never copy over another registration.
		$status = [BeCoderSetupVerificationRegistry]::RegRenameKey($parent.Handle, $SourceName, $DestinationName)
		if ($status -ne 0) { throw "Unable to rename uninstall registration $SourceName to $DestinationName (code $status)." }
	} finally {
		$parent.Dispose()
	}
}

function Get-RegistrySearchKeys {
	param([string[]]$SearchOutput, [string]$TemporaryRegistrationName)
	# Windows caches temporary uninstall-key names in CloudStore even after restoration.
	# Exclude only that derived verification metadata, retaining real backup keys and all product entries.
	$temporaryMetadata = '(?!)'
	if (-not [string]::IsNullOrEmpty($TemporaryRegistrationName)) {
		$temporaryMetadata = '^HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\(?:Cloud|Current)\\[^\\]+\$windows\.data\.apps\.appmetadata\$appmetadatalist\\windows\.data\.apps\.appmetadata\$' + [regex]::Escape($TemporaryRegistrationName) + '$'
	}
	return @($SearchOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() } | Where-Object {
		$_ -match '^HKEY_(?:CURRENT_USER|LOCAL_MACHINE)\\' -and $_ -notmatch $temporaryMetadata
	})
}

$shortcutsBefore = Get-ShortcutSnapshot
$registryBefore = Get-RegistryIntegrationSnapshot
$namedRegistryBefore = Get-BeCoderNamedRegistrySnapshot

$stagedProduct = Get-Content -LiteralPath (Join-Path $StagedPackagePath 'resources\app\product.json') -Raw -Encoding utf8 | ConvertFrom-Json
$nativeDesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) ($stagedProduct.nameLong + '.lnk')
$nativeStartMenuShortcut = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) ($stagedProduct.nameLong + '.lnk')
$nativeRegistrationName = $stagedProduct.nameLong + '_is1'
$nativeRegistrationPath = Join-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' $nativeRegistrationName
if (Test-Path -LiteralPath $nativeStartMenuShortcut) {
	throw 'Setup verification requires no existing BeCoder public Start-menu shortcut.'
}
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) ($stagedProduct.nameLong + '.lnk')
$shortcutExisted = Test-Path -LiteralPath $shortcutPath -PathType Leaf
if ((Invoke-Setup -Target $installRoot -LogName 'portable-install.log' -Portable) -ne 0) {
	throw 'BeCoder Setup failed to install Portable mode into the isolated verification directory.'
}
if (-not $shortcutExisted -and (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
	throw 'BeCoder Portable mode created a desktop shortcut despite explicit opt-out.'
}
if ((Invoke-Setup -Target $secondInstallRoot -LogName 'second-portable-install.log' -Portable) -ne 0) {
	throw 'BeCoder Setup failed to create a second independent Portable installation.'
}
Assert-SetupLogHasNoRegistryWrites -LogName 'portable-install.log'
Assert-SetupLogHasNoRegistryWrites -LogName 'second-portable-install.log'

$onboardingRelativePaths = @('coding\helloCoder.cpp', 'data\.becoder-open-hello-coder')
foreach ($root in @($installRoot, $secondInstallRoot)) {
	foreach ($relativePath in $onboardingRelativePaths) {
		if (-not (Test-Path -LiteralPath (Join-Path $root $relativePath) -PathType Leaf)) {
			throw "BeCoder Setup omitted onboarding content: $relativePath"
		}
	}
}
$onboardingHash = (Get-FileHash -LiteralPath (Join-Path $installRoot 'coding\helloCoder.cpp') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($onboardingHash -ne '0d47c180bbb64866f3a805b958306c268597c64f21d10458dc919740714cf1d9') {
	throw 'BeCoder Setup installed an unexpected helloCoder.cpp.'
}

if ((Invoke-Setup -Target $unicodeRoot -LogName 'unicode-path.log') -eq 0 -or (Test-Path -LiteralPath $unicodeRoot)) {
	throw 'BeCoder Setup accepted a non-ASCII installation path.'
}
if ($longRoot.Length -ne 71 -or (Invoke-Setup -Target $longRoot -LogName 'long-path.log') -eq 0 -or (Test-Path -LiteralPath $longRoot)) {
	throw 'BeCoder Setup accepted an installation path longer than 70 characters.'
}
foreach ($junctionCase in @(
	@{ Alias = $unicodeJunction; Target = $unicodeJunctionTarget; Log = 'unicode-junction.log' },
	@{ Alias = $longJunction; Target = $longJunctionTarget; Log = 'long-junction.log' }
)) {
	$installPath = Join-Path $junctionCase.Alias 'BeCoder'
	if ((Invoke-Setup -Target $installPath -LogName $junctionCase.Log) -eq 0 -or
		(Test-Path -LiteralPath $installPath) -or
		-not (Test-Path -LiteralPath (Join-Path $junctionCase.Target 'must-survive.txt') -PathType Leaf)) {
		throw "BeCoder Setup accepted or modified a reparse-point installation path: $($junctionCase.Alias)"
	}
}
$ownershipMarker = Join-Path $installRoot '.becoder-installation.json'
$ownership = Get-Content -LiteralPath $ownershipMarker -Raw | ConvertFrom-Json
$secondOwnershipMarker = Join-Path $secondInstallRoot '.becoder-installation.json'
$secondOwnership = Get-Content -LiteralPath $secondOwnershipMarker -Raw | ConvertFrom-Json
$installationIdPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
if ($ownership.schemaVersion -ne 2 -or $ownership.product -ne 'BeCoder' -or $ownership.installationId -notmatch $installationIdPattern -or
	$secondOwnership.schemaVersion -ne 2 -or $secondOwnership.product -ne 'BeCoder' -or $secondOwnership.installationId -notmatch $installationIdPattern -or
	$ownership.installationId -eq $secondOwnership.installationId) {
	throw 'BeCoder Setup did not create a valid ownership marker.'
}
$originalInstallationId = $ownership.installationId
foreach ($root in @($installRoot, $secondInstallRoot)) {
	if (Get-ChildItem -LiteralPath $root -Filter 'unins*' -Force -ErrorAction SilentlyContinue) {
		throw "BeCoder Portable Setup generated forbidden uninstall files in: $root"
	}
}

$stagedRoot = (Resolve-Path $StagedPackagePath).Path
foreach ($sourceFile in Get-ChildItem -LiteralPath $stagedRoot -File -Recurse) {
	$relativePath = $sourceFile.FullName.Substring($stagedRoot.Length + 1)
	$installedFile = Join-Path $installRoot $relativePath
	if (-not (Test-Path -LiteralPath $installedFile -PathType Leaf) -or
		(Get-Item -LiteralPath $installedFile).Length -ne $sourceFile.Length -or
		(Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash) {
		throw "Installed payload differs from the staged package: $relativePath"
	}
}

$sentinel = Join-Path $installRoot 'data\user-data\must-be-deleted.txt'
$secondSentinel = Join-Path $secondInstallRoot 'data\user-data\must-survive-other-install.txt'
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($sentinel)) -Force | Out-Null
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($secondSentinel)) -Force | Out-Null
Set-Content -LiteralPath $sentinel -Value 'reinstall must remove this file' -Encoding ascii
Set-Content -LiteralPath $secondSentinel -Value 'other installation must not modify this file' -Encoding ascii
if ((Invoke-Setup -Target $installRoot -LogName 'reinstall-without-consent.log' -Portable) -eq 0 -or -not (Test-Path -LiteralPath $sentinel)) {
	throw 'BeCoder Setup replaced user data silently without explicit data-loss consent.'
}
if ((Invoke-Setup -Target $installRoot -LogName 'reinstall.log' -AllowDataLoss -Portable) -ne 0 -or (Test-Path -LiteralPath $sentinel)) {
	throw 'BeCoder Setup did not completely replace the previous owned installation.'
}
Assert-SetupLogHasNoRegistryWrites -LogName 'reinstall.log'
foreach ($relativePath in $onboardingRelativePaths) {
	if (-not (Test-Path -LiteralPath (Join-Path $installRoot $relativePath) -PathType Leaf)) {
		throw "BeCoder Setup did not restore onboarding content during replacement: $relativePath"
	}
}
$replacementOwnership = Get-Content -LiteralPath $ownershipMarker -Raw | ConvertFrom-Json
if ($replacementOwnership.installationId -ne $originalInstallationId -or -not (Test-Path -LiteralPath $secondSentinel -PathType Leaf)) {
	throw 'BeCoder Setup did not preserve same-directory identity or modified another installation.'
}

New-Item -ItemType Directory -Path $foreignRoot | Out-Null
Set-Content -LiteralPath (Join-Path $foreignRoot 'user-file.txt') -Value 'must survive' -Encoding ascii
if ((Invoke-Setup -Target $foreignRoot -LogName 'foreign.log') -eq 0) {
	throw 'BeCoder Setup accepted a nonempty directory without a valid ownership marker.'
}
if (-not (Test-Path -LiteralPath (Join-Path $foreignRoot 'user-file.txt') -PathType Leaf)) {
	throw 'BeCoder Setup modified a rejected foreign directory.'
}

$markerContents = Get-Content -LiteralPath $ownershipMarker -Raw
Set-Content -LiteralPath $ownershipMarker -Value '{}' -Encoding ascii -NoNewline
if ((Invoke-Setup -Target $installRoot -LogName 'invalid-marker-replacement.log' -AllowDataLoss -Portable) -eq 0 -or -not (Test-Path -LiteralPath $installRoot -PathType Container)) {
	throw 'BeCoder Setup replaced a directory with an invalid ownership marker.'
}
Set-Content -LiteralPath $ownershipMarker -Value $markerContents -Encoding ascii -NoNewline

Move-Item -LiteralPath $installRoot -Destination $movedInstallRoot
$movedOwnership = Get-Content -LiteralPath (Join-Path $movedInstallRoot '.becoder-installation.json') -Raw | ConvertFrom-Json
if ($movedOwnership.installationId -ne $originalInstallationId -or
	-not (Test-Path -LiteralPath (Join-Path $movedInstallRoot 'BeCoder.exe') -PathType Leaf) -or
	-not (Test-Path -LiteralPath $secondSentinel -PathType Leaf)) {
	throw 'Moving a complete BeCoder directory did not preserve its identity or installation isolation.'
}

if (-not (Test-Path -LiteralPath $externalProject -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $foreignRoot 'user-file.txt') -PathType Leaf)) {
	throw 'BeCoder Setup modified external user files.'
}

$shortcutsAfter = Get-ShortcutSnapshot
$registryAfter = Get-RegistryIntegrationSnapshot
$namedRegistryAfter = Get-BeCoderNamedRegistrySnapshot
if (Compare-Object $shortcutsBefore $shortcutsAfter) {
	throw 'BeCoder Setup changed a desktop or Start-menu shortcut after default-shortcut verification and explicit opt-out installs.'
}
if (Compare-Object $registryBefore $registryAfter) {
	throw 'BeCoder Setup changed a monitored Windows integration registry key.'
}
if (Compare-Object $namedRegistryBefore $namedRegistryAfter) {
	throw 'BeCoder Setup created or modified a BeCoder-named registry entry.'
}

Remove-Item -LiteralPath $movedInstallRoot -Recurse -Force
Remove-Item -LiteralPath $secondInstallRoot -Recurse -Force
if ((Test-Path -LiteralPath $movedInstallRoot) -or (Test-Path -LiteralPath $secondInstallRoot) -or
	-not (Test-Path -LiteralPath $externalProject -PathType Leaf) -or
	-not (Test-Path -LiteralPath (Join-Path $foreignRoot 'user-file.txt') -PathType Leaf)) {
	throw 'Manual installation-directory deletion did not remain isolated from external files.'
}

if (Test-Path -LiteralPath $nativeStartMenuShortcut) {
	throw 'Existing Native integration appeared during verification; refusing to overwrite it.'
}
$nativeRegistryBefore = Get-RegistryIntegrationSnapshot
$nativeNamedRegistryBefore = Get-BeCoderNamedRegistrySnapshot
$nativeShortcutsBefore = Get-ShortcutSnapshot
$nativeDesktopBackup = Join-Path $verificationRoot 'saved-desktop.lnk'
$nativeRegistryBackupName = $nativeRegistrationName + '.verification-' + [Guid]::NewGuid().ToString('N')
$nativeRegistrySaved = $false
try {
	if (Test-Path -LiteralPath $nativeRegistrationPath) {
		& reg.exe export "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\$nativeRegistrationName" (Join-Path $verificationRoot 'saved-uninstall.reg') /y | Out-Null
		if ($LASTEXITCODE -ne 0) { throw 'Unable to export the existing uninstall registration for recovery.' }
		Rename-VerificationUninstallKey -SourceName $nativeRegistrationName -DestinationName $nativeRegistryBackupName
		$nativeRegistrySaved = $true
	}
	if (Test-Path -LiteralPath $nativeDesktopShortcut) {
		Move-Item -LiteralPath $nativeDesktopShortcut -Destination $nativeDesktopBackup
	}
	$nativeRegistryDuringTest = Get-RegistryIntegrationSnapshot
	if ((Invoke-Setup -Target $nativeInstallRoot -LogName 'native-install.log' -UseDefaultTasks) -ne 0) {
		throw 'BeCoder Setup failed to install Native application mode.'
	}
	$nativeUninstallFiles = @(Get-ChildItem -LiteralPath $nativeInstallRoot -Filter 'unins*' -Force -ErrorAction Stop)
	if ($nativeUninstallFiles.Count -lt 2) {
		throw 'BeCoder Native application mode did not create its generated uninstaller files.'
	}
	$nativeUninstallEntry = Get-ItemProperty -LiteralPath $nativeRegistrationPath
	if ($nativeUninstallEntry.InstallLocation.TrimEnd('\') -ine $nativeInstallRoot -or
		$nativeUninstallEntry.UninstallString -ine ('"' + (Join-Path $nativeInstallRoot 'unins000.exe') + '"') -or
		$nativeUninstallEntry.DisplayIcon -ine (Join-Path $nativeInstallRoot ($stagedProduct.nameShort + '.exe'))) {
		throw 'BeCoder Native application mode did not register the verified installation uninstaller and display icon.'
	}
	if (-not (Test-Path -LiteralPath $nativeDesktopShortcut -PathType Leaf) -or -not (Test-Path -LiteralPath $nativeStartMenuShortcut -PathType Leaf)) {
		throw 'BeCoder Native application mode did not create its default desktop and Start-menu shortcuts.'
	}
	$nativeShortcutShell = New-Object -ComObject WScript.Shell
	$nativeShortcutLink = $null
	try {
		$nativeShortcutLink = $nativeShortcutShell.CreateShortcut($nativeStartMenuShortcut)
		if ($nativeShortcutLink.TargetPath -ne (Join-Path $nativeInstallRoot ($stagedProduct.nameShort + '.exe')) -or
			$nativeShortcutLink.WorkingDirectory -ne $nativeInstallRoot -or $nativeShortcutLink.Arguments -ne '') {
			throw 'BeCoder Native Start-menu shortcut does not point to this installation with an empty argument list.'
		}
	} finally {
		if ($nativeShortcutLink) { [Runtime.InteropServices.Marshal]::ReleaseComObject($nativeShortcutLink) | Out-Null }
		[Runtime.InteropServices.Marshal]::ReleaseComObject($nativeShortcutShell) | Out-Null
	}
	if (-not (Test-Path -LiteralPath (Join-Path $nativeInstallRoot 'tools\becoder-shortcuts.exe') -PathType Leaf)) {
		throw 'BeCoder Native application mode did not install its shortcut maintenance helper.'
	}
	$nativeRegistryAfterInstall = Get-RegistryIntegrationSnapshot
	$nativeRegistryChanges = @(Compare-Object $nativeRegistryDuringTest $nativeRegistryAfterInstall)
	$unexpectedNativeRegistryChanges = @($nativeRegistryChanges | Where-Object { $_.InputObject -notlike '*\Software\Microsoft\Windows\CurrentVersion\Uninstall\BeCoder_is1|*' })
	if ($unexpectedNativeRegistryChanges.Count -gt 0) {
		throw 'BeCoder Native application mode changed registry state outside its uninstall entry.'
	}
	$nativeDataSentinel = Join-Path $nativeInstallRoot 'data\user-data\must-be-deleted-on-native-uninstall.txt'
	New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($nativeDataSentinel)) -Force | Out-Null
	Set-Content -LiteralPath $nativeDataSentinel -Value 'native uninstall must remove installation data' -Encoding ascii
	$uninstallerPath = Join-Path $nativeInstallRoot 'unins000.exe'
	$uninstallProcess = Start-Process -FilePath $uninstallerPath -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$(Join-Path $verificationRoot 'native-uninstall.log')`"") -Wait -PassThru -WindowStyle Hidden
	if ($uninstallProcess.ExitCode -ne 0 -or
		(Test-Path -LiteralPath $nativeDataSentinel) -or
		(Test-Path -LiteralPath (Join-Path $nativeInstallRoot '.becoder-installation.json')) -or
		(Get-ChildItem -LiteralPath $nativeInstallRoot -Filter 'unins*' -Force -ErrorAction SilentlyContinue)) {
		throw 'BeCoder Native application uninstall did not remove installation data, identity, and uninstaller files.'
	}
	if (Test-Path -LiteralPath $nativeRegistrationPath) {
		throw 'BeCoder Native application uninstall left its Windows uninstall entry behind.'
	}
} finally {
	try {
		if ($nativeRegistrySaved) {
			Rename-VerificationUninstallKey -SourceName $nativeRegistryBackupName -DestinationName $nativeRegistrationName
		}
	} finally {
		if (Test-Path -LiteralPath $nativeDesktopBackup) {
			# Never overwrite an entry that appeared concurrently; keep the backup for recovery.
			if (Test-Path -LiteralPath $nativeDesktopShortcut) {
				throw "Unable to restore the desktop shortcut without overwriting an existing entry. Original preserved at $nativeDesktopBackup"
			}
			Move-Item -LiteralPath $nativeDesktopBackup -Destination $nativeDesktopShortcut
		}
	}
}
$nativeShortcutChanges = @(Compare-Object $nativeShortcutsBefore (Get-ShortcutSnapshot))
$nativeRegistryChangesAfterUninstall = @(Compare-Object $nativeRegistryBefore (Get-RegistryIntegrationSnapshot))
$nativeNamedRegistryChangesAfterUninstall = @(Compare-Object $nativeNamedRegistryBefore (Get-BeCoderNamedRegistrySnapshot))
if ($nativeShortcutChanges.Count -gt 0 -or $nativeRegistryChangesAfterUninstall.Count -gt 0 -or $nativeNamedRegistryChangesAfterUninstall.Count -gt 0) {
	$diagnostics = foreach ($category in @(
		@{ Name = 'Shortcuts'; Changes = $nativeShortcutChanges; IdentityFields = 1 },
		@{ Name = 'Registry'; Changes = $nativeRegistryChangesAfterUninstall; IdentityFields = 3 },
		@{ Name = 'NamedRegistry'; Changes = $nativeNamedRegistryChangesAfterUninstall; IdentityFields = 3 }
	)) {
		foreach ($change in $category.Changes) {
			# Record identities only; registry values can contain credentials.
			$fields = $change.InputObject -split '\|'
			[PSCustomObject]@{ Category = $category.Name; Side = $change.SideIndicator; Identity = ($fields | Select-Object -First $category.IdentityFields) -join '|' }
		}
	}
	$diagnosticPath = Join-Path $verificationRoot 'native-integration-diff.json'
	$diagnostics | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $diagnosticPath -Encoding utf8
	throw "BeCoder Native application uninstall did not restore registry and shortcut state. See $diagnosticPath"
}
Remove-Item -LiteralPath $nativeInstallRoot -Recurse -Force -ErrorAction SilentlyContinue

Remove-Item -LiteralPath $verificationRoot -Recurse -Force
if (Test-Path -LiteralPath $verificationRoot) {
	throw "Unable to remove the completed Setup verification run: $verificationRoot"
}
if (-not (Get-ChildItem -LiteralPath $verificationBaseRoot -Force | Select-Object -First 1)) {
	Remove-Item -LiteralPath $verificationBaseRoot -Force
}

Write-Host "Verified BeCoder Setup at $SetupPath"
