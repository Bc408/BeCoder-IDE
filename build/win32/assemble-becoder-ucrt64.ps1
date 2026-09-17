param(
	[string]$PackageCache = 'C:\msys64\var\cache\pacman\pkg',
	[string]$MsysRoot = 'C:\msys64',
	[string]$OutputArchive,
	[string]$DebuggerHeader
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutputArchive) {
	$OutputArchive = Join-Path $repositoryRoot 'resources\oi-defaults\toolchains\becoder-ucrt64.zip'
}
if (-not $DebuggerHeader) {
	$DebuggerHeader = Join-Path $repositoryRoot 'resources\oi-defaults\toolchains\becoder-debugger.h'
}

$packageFiles = @(
	'mingw-w64-ucrt-x86_64-binutils-2.47-3-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-crt-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-gcc-16.2.0-3-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-gcc-libs-16.2.0-3-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-gettext-runtime-1.0-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-gmp-6.3.0-2-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-headers-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-isl-0.28-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-libiconv-1.19-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-mpc-1.4.1-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-mpfr-4.2.2-3-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-windows-default-manifest-20260815-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-winpthreads-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-xz-5.8.4-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-zlib-1.3.2-2-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-zstd-1.5.7-2-any.pkg.tar.zst'
)
$rootHeaderPackages = @(
	'mingw-w64-ucrt-x86_64-crt-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-headers-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst',
	'mingw-w64-ucrt-x86_64-winpthreads-14.0.0.r375.g9c1abbbf5-1-any.pkg.tar.zst'
)
$binFiles = @(
	'g++.exe',
	'gcc.exe',
	'libgcc_s_seh-1.dll',
	'libstdc++-6.dll',
	'libwinpthread-1.dll',
	'libgmp-10.dll',
	'libisl-23.dll',
	'libmpc-3.dll',
	'libmpfr-6.dll',
	'zlib1.dll',
	'libzstd.dll',
	'libintl-8.dll',
	'libiconv-2.dll'
)
$includeDirectories = @('c++', 'ddk', 'gdiplus', 'GL', 'KHR', 'isl', 'libiberty', 'lzma', 'psdk_inc', 'sys', 'wrl')
$targetBinFiles = @(
	'ar.exe', 'as.exe', 'dlltool.exe', 'ld.bfd.exe', 'ld.exe',
	'nm.exe', 'objcopy.exe', 'ranlib.exe', 'readelf.exe', 'strip.exe'
)
$targetRuntimeDllFiles = @('libiconv-2.dll', 'libintl-8.dll', 'libwinpthread-1.dll', 'libzstd.dll', 'zlib1.dll')
$rootLibraryFiles = @(
	'crt2.o', 'crt2u.o', 'default-manifest.o', 'libadvapi32.a', 'libgcc_s.a',
	'libkernel32.a', 'libmingw32.a', 'libmingwex.a', 'libmsvcrt.a', 'libpthread.a',
	'libshell32.a', 'libstdc++.a', 'libstdc++.dll.a', 'libuser32.a'
)
$gccFiles = @(
	'cc1.exe', 'cc1plus.exe', 'collect2.exe', 'crtbegin.o', 'crtend.o',
	'crtfastmath.o', 'libgcc.a', 'libgcc_eh.a', 'libgcov.a', 'liblto_plugin.dll'
)

$bsdtar = Join-Path $MsysRoot 'usr\bin\bsdtar.exe'
$bash = Join-Path $MsysRoot 'usr\bin\bash.exe'
foreach ($requiredFile in @($bsdtar, $bash, $DebuggerHeader)) {
	if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
		throw "Required toolchain assembly input is missing: $requiredFile"
	}
}

$buildRoot = Join-Path $repositoryRoot '.build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$resolvedBuildRoot = (Resolve-Path $buildRoot).Path
$workRoot = Join-Path $resolvedBuildRoot "becoder-ucrt64-$([Guid]::NewGuid().ToString('N'))"
if ([IO.Path]::GetDirectoryName($workRoot) -ne $resolvedBuildRoot) {
	throw "Unsafe compiler assembly root: $workRoot"
}
$expandedRoot = Join-Path $workRoot 'expanded'
$payloadRoot = Join-Path $expandedRoot 'ucrt64'
$stagedRoot = Join-Path $workRoot 'ucrt64'
$candidateArchive = Join-Path $workRoot 'becoder-ucrt64.zip'
$fileList = Join-Path $workRoot 'archive-files.txt'

function Copy-RequiredFile {
	param(
		[Parameter(Mandatory = $true)][string]$RelativePath,
		[string]$DestinationRelativePath = $RelativePath
	)
	$source = Join-Path $payloadRoot $RelativePath
	$destination = Join-Path $stagedRoot $DestinationRelativePath
	if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-Item -LiteralPath $source).Length -eq 0) {
		throw "Required compiler file is missing from the signed packages: $RelativePath"
	}
	New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
	Copy-Item -LiteralPath $source -Destination $destination
}

function Copy-RequiredDirectory {
	param([Parameter(Mandatory = $true)][string]$RelativePath)
	$source = Join-Path $payloadRoot $RelativePath
	$destination = Join-Path $stagedRoot $RelativePath
	if (-not (Test-Path -LiteralPath $source -PathType Container)) {
		throw "Required compiler directory is missing from the signed packages: $RelativePath"
	}
	New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
	Copy-Item -LiteralPath $source -Destination $destination -Recurse
}

New-Item -ItemType Directory -Path $expandedRoot, $stagedRoot | Out-Null
try {
	foreach ($packageFile in $packageFiles) {
		$archivePath = Join-Path $PackageCache $packageFile
		$signaturePath = "$archivePath.sig"
		foreach ($requiredFile in @($archivePath, $signaturePath)) {
			if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
				throw "Pinned MSYS2 package input is missing: $requiredFile"
			}
		}
		& $bash -lc 'gpg --homedir /etc/pacman.d/gnupg --batch --status-fd 1 --verify "$1" "$2"' -- $signaturePath $archivePath | Out-Null
		if ($LASTEXITCODE -ne 0) {
			throw "MSYS2 package signature verification failed: $packageFile"
		}
		& $bsdtar -xf $archivePath -C $expandedRoot ucrt64
		if ($LASTEXITCODE -ne 0) {
			throw "MSYS2 package extraction failed: $packageFile"
		}
	}

	foreach ($name in $binFiles) {
		Copy-RequiredFile -RelativePath (Join-Path 'bin' $name)
	}
	foreach ($name in $includeDirectories) {
		Copy-RequiredDirectory -RelativePath (Join-Path 'include' $name)
	}
	foreach ($packageFile in $rootHeaderPackages) {
		$archivePath = Join-Path $PackageCache $packageFile
		$rootHeaders = @(& $bsdtar -tf $archivePath | Where-Object { $_ -match '^ucrt64/include/[^/]+$' })
		if ($LASTEXITCODE -ne 0) {
			throw "Could not enumerate root headers in $packageFile"
		}
		foreach ($entry in $rootHeaders) {
			Copy-RequiredFile -RelativePath $entry.Substring('ucrt64/'.Length)
		}
	}

	foreach ($name in $targetBinFiles) {
		Copy-RequiredFile -RelativePath (Join-Path 'x86_64-w64-mingw32\bin' $name)
	}
	foreach ($name in $targetRuntimeDllFiles) {
		Copy-RequiredFile -RelativePath (Join-Path 'bin' $name) -DestinationRelativePath (Join-Path 'x86_64-w64-mingw32\bin' $name)
	}
	Copy-RequiredDirectory -RelativePath 'x86_64-w64-mingw32\lib\ldscripts'
	foreach ($name in $rootLibraryFiles) {
		Copy-RequiredFile -RelativePath (Join-Path 'lib' $name)
	}

	$gccRoot = 'lib\gcc\x86_64-w64-mingw32\16.2.0'
	foreach ($name in $gccFiles) {
		Copy-RequiredFile -RelativePath (Join-Path $gccRoot $name)
	}
	foreach ($name in @('include', 'include-fixed')) {
		Copy-RequiredDirectory -RelativePath (Join-Path $gccRoot $name)
	}

	$debuggerDestination = Join-Path $stagedRoot 'include\c++\16.2.0\x86_64-w64-mingw32\bits\debugger.h'
	Copy-Item -LiteralPath $DebuggerHeader -Destination $debuggerDestination -Force
	foreach ($requiredHeader in @('ctype.h', 'pthread.h', 'windows.h')) {
		if (-not (Test-Path -LiteralPath (Join-Path $stagedRoot "include\$requiredHeader") -PathType Leaf)) {
			throw "The slim compiler is missing a required C/Windows/thread header: $requiredHeader"
		}
	}
	$standardHeader = Join-Path $stagedRoot 'include\c++\16.2.0\x86_64-w64-mingw32\bits\stdc++.h'
	$pchPath = "$standardHeader.gch"
	$compiler = Join-Path $stagedRoot 'bin\g++.exe'
	& $compiler '-O2' '-Wall' '-DDEBUG' '-std=c++20' '-finput-charset=UTF-8' '-fexec-charset=UTF-8' '-include' 'bits/debugger.h' '-x' 'c++-header' $standardHeader '-o' $pchPath
	if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pchPath -PathType Leaf)) {
		throw 'GCC 16.2 failed to build the BeCoder stdc++.h precompiled header.'
	}

	$cppProbe = Join-Path $workRoot 'compiler-probe.cpp'
	$cppProbeExecutable = Join-Path $workRoot 'compiler-probe.exe'
	[IO.File]::WriteAllLines($cppProbe, @(
		'#include<bits/stdc++.h>',
		'#include<ext/pb_ds/assoc_container.hpp>',
		'using namespace std;',
		'using namespace __gnu_pbds;',
		'int main() {',
		'  vector<int> a={3,1,2};',
		'  ranges::sort(a);',
		'  tree<int,null_type,less<int>,rb_tree_tag,tree_order_statistics_node_update> t;',
		'  t.insert(2);',
		'  filesystem::path p=".";',
		'  thread worker([] {});',
		'  worker.join();',
		'  __int128 signedValue=-((__int128)1<<100);',
		'  unsigned __int128 unsignedValue=((unsigned __int128)1<<127)+5;',
		'  debug(a);',
		'  debug(signedValue);',
		'  debug(unsignedValue);',
		'  cout<<t.order_of_key(3)<<p.string().size();',
		'  return 0;',
		'}'
	), [Text.UTF8Encoding]::new($false))
	& $compiler '-O2' '-Wall' '-DDEBUG' '-std=c++20' '-finput-charset=UTF-8' '-fexec-charset=UTF-8' $cppProbe '-o' $cppProbeExecutable
	if ($LASTEXITCODE -ne 0) { throw 'The slim compiler failed the C++20 competitive-programming feature probe.' }
	$probeOutput = (& $cppProbeExecutable) -join "`n"
	if ($LASTEXITCODE -ne 0 -or
		-not $probeOutput.Contains('-1267650600228229401496703205376') -or
		-not $probeOutput.Contains('170141183460469231731687303715884105733')) {
		throw 'The slim compiler failed the BeCoder debugger runtime probe.'
	}

	$basicCppProbe = Join-Path $workRoot 'standard-probe.cpp'
	$basicCProbe = Join-Path $workRoot 'standard-probe.c'
	[IO.File]::WriteAllText($basicCppProbe, "int main(){return 0;}`n", [Text.UTF8Encoding]::new($false))
	[IO.File]::WriteAllText($basicCProbe, "int main(void){return 0;}`n", [Text.UTF8Encoding]::new($false))
	foreach ($standard in @('c++11', 'c++14', 'c++17', 'c++20', 'c++23')) {
		& $compiler '-fsyntax-only' "-std=$standard" $basicCppProbe
		if ($LASTEXITCODE -ne 0) { throw "The slim compiler failed the $standard syntax probe." }
	}
	$cCompiler = Join-Path $stagedRoot 'bin\gcc.exe'
	foreach ($standard in @('c11', 'c17', 'c23')) {
		& $cCompiler '-fsyntax-only' "-std=$standard" $basicCProbe
		if ($LASTEXITCODE -ne 0) { throw "The slim compiler failed the $standard syntax probe." }
	}

	$forbiddenEntries = @(
		'bin\gdb.exe', 'bin\make.exe', 'bin\pkg-config.exe', 'bin\python.exe',
		'etc', 'share', 'lib\gcc\x86_64-w64-mingw32\16.2.0\lto1.exe',
		'lib\gcc\x86_64-w64-mingw32\16.2.0\lto-wrapper.exe'
	)
	foreach ($entry in $forbiddenEntries) {
		if (Test-Path -LiteralPath (Join-Path $stagedRoot $entry)) {
			throw "The slim compiler contains a forbidden payload: $entry"
		}
	}

	$fixedTimestamp = [DateTime]::SpecifyKind([DateTime]'2026-08-10T00:00:00', [DateTimeKind]::Utc)
	Get-ChildItem -LiteralPath $stagedRoot -Recurse -Force | ForEach-Object { $_.LastWriteTimeUtc = $fixedTimestamp }
	$archivePaths = @(Get-ChildItem -LiteralPath $stagedRoot -Recurse -File | ForEach-Object {
		'ucrt64/' + $_.FullName.Substring($stagedRoot.Length + 1).Replace('\', '/')
	} | Sort-Object)
	[IO.File]::WriteAllLines($fileList, $archivePaths, [Text.UTF8Encoding]::new($false))
	& $bsdtar --format zip -cf $candidateArchive -C $workRoot -T $fileList
	if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $candidateArchive -PathType Leaf)) {
		throw 'Could not create the slim BeCoder UCRT64 archive.'
	}

	$outputDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($OutputArchive))
	if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
		throw "The compiler archive output directory does not exist: $outputDirectory"
	}
	$temporaryOutput = "$OutputArchive.new"
	Copy-Item -LiteralPath $candidateArchive -Destination $temporaryOutput -Force
	Move-Item -LiteralPath $temporaryOutput -Destination $OutputArchive -Force
	$hash = (Get-FileHash -LiteralPath $OutputArchive -Algorithm SHA256).Hash.ToLowerInvariant()
	Write-Output "Created $OutputArchive"
	Write-Output "Files: $($archivePaths.Count)"
	Write-Output "SHA-256: $hash"
} finally {
	if (Test-Path -LiteralPath $workRoot) {
		Remove-Item -LiteralPath $workRoot -Recurse -Force
	}
}
