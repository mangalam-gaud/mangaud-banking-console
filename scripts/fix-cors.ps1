<#
.SYNOPSIS
    Ensure CLIENT_URL in server\.env includes this machine's LAN origin.

.DESCRIPTION
    `start.bat` calls this just before launching the API. A phone on the same
    Wi-Fi can only load the app if its Origin is on the API's CORS allowlist;
    the address changes more often than anyone expects (new Wi-Fi, a VPN, a new
    DHCP lease), and the API then answers the browser's preflight with "origin
    not allowed" -- which presents as a broken app, not a config error.

    This used to be a giant inline `powershell -Command` line inside start.bat.
    cmd interprets the `^` inside that string (`'^CLIENT_URL='`) as its own
    escape character, which unbalances the -Command argument and leaves
    PowerShell waiting on a continuation prompt -- the exact hang that made a
    doubled-click of start.bat freeze partway through.
#>
param(
    [Parameter(Mandatory)][string]$EnvPath,
    [Parameter(Mandatory)][string]$Origin
)

if (-not (Test-Path $EnvPath)) {
    Write-Host "        [WARN] server\.env not found at $EnvPath"
    exit 0
}

$lines = [System.IO.File]::ReadAllLines($EnvPath)
$i = -1
for ($n = 0; $n -lt $lines.Count; $n++) {
    if ($lines[$n] -match '^CLIENT_URL=') { $i = $n; break }
}
if ($i -lt 0) {
    Write-Host '        [WARN] no CLIENT_URL line in server\.env'
    exit 0
}

$cur = $lines[$i] -replace '^CLIENT_URL=', ''
if ($cur -split ',' -contains $Origin) {
    Write-Host "        [OK] CLIENT_URL already permits $Origin"
    exit 0
}
$lines[$i] = 'CLIENT_URL=' + $cur + ',' + $Origin
[System.IO.File]::WriteAllLines($EnvPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "        [OK] added $Origin to CLIENT_URL"
