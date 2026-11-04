param(
    [string]$Apk = (Join-Path $PSScriptRoot '../app/build/outputs/apk/debug/app-debug.apk'),
    [Parameter(Mandatory = $true)][string]$Zipalign
)
$ErrorActionPreference = 'Stop'
$apkFile = (Resolve-Path -LiteralPath $Apk).Path
& $Zipalign -c -P 16 4 $apkFile
if ($LASTEXITCODE -ne 0) { throw 'APK shared-library ZIP alignment failed' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apkFile)
$libraries = @()
try {
    foreach ($entry in $archive.Entries | Where-Object FullName -match '^lib/.+\.so$') {
        $stream = $entry.Open()
        try {
            $header = [byte[]]::new(16384)
            $read = 0
            while ($read -lt $header.Length) {
                $amount = $stream.Read($header, $read, $header.Length - $read)
                if ($amount -eq 0) { break }
                $read += $amount
            }
        } finally { $stream.Dispose() }
        if ($read -lt 64 -or $header[0] -ne 127 -or $header[1] -ne 69 -or $header[2] -ne 76 -or $header[3] -ne 70 -or $header[5] -ne 1) {
            throw "Unsupported ELF header: $($entry.FullName)"
        }
        $is64 = $header[4] -eq 2
        if ($is64) {
            $offset = [BitConverter]::ToUInt64($header, 32)
            $size = [BitConverter]::ToUInt16($header, 54)
            $count = [BitConverter]::ToUInt16($header, 56)
        } elseif ($header[4] -eq 1) {
            $offset = [BitConverter]::ToUInt32($header, 28)
            $size = [BitConverter]::ToUInt16($header, 42)
            $count = [BitConverter]::ToUInt16($header, 44)
        } else { throw "Unknown ELF class: $($entry.FullName)" }
        if ($offset + $size * $count -gt $read) { throw "ELF program headers exceed inspected prefix: $($entry.FullName)" }
        $alignments = @()
        for ($index = 0; $index -lt $count; $index++) {
            $position = [int]($offset + $index * $size)
            if ([BitConverter]::ToUInt32($header, $position) -ne 1) { continue }
            $alignment = if ($is64) { [BitConverter]::ToUInt64($header, $position + 48) } else { [BitConverter]::ToUInt32($header, $position + 28) }
            $minimum = if ($is64) { 16384 } else { 4096 }
            if ($alignment -lt $minimum) { throw "Insufficient LOAD alignment: $($entry.FullName)" }
            $alignments += $alignment
        }
        if ($alignments.Count -eq 0) { throw "ELF has no LOAD segments: $($entry.FullName)" }
        $libraries += [ordered]@{ library = $entry.FullName; bits = $(if ($is64) { 64 } else { 32 }); loadAlignments = $alignments }
    }
} finally { $archive.Dispose() }
if ($libraries.Count -eq 0) { throw 'No native libraries found in APK' }
$report = [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); artifact = [IO.Path]::GetFileName($apkFile); sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkFile).Hash; zip16KbAligned = $true; elfLoadAlignmentPassed = $true; libraries = $libraries }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../verification/apk-packaging.json') -Encoding utf8
Write-Output "PASS ZIP alignment and ELF LOAD alignment for $($libraries.Count) libraries"
