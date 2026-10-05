<#
.SYNOPSIS
    Stops the MANGAUD Banking Console's servers, and nothing else.

.DESCRIPTION
    Scoped deliberately. This machine runs several projects at once and the
    editor's own MCP agents run under Node, so `taskkill /f /im node.exe` -- the
    advice the launcher used to print -- stops all of it: other projects' dev
    servers, browser-automation agents, and the tooling running the session that
    invoked it. It also reads like it is scoped to this app, which is the part
    that makes it dangerous rather than merely rude.

    What this does instead, in order:
      1. names whatever currently holds the app's ports, so the output is
         evidence rather than a claim;
      2. stops Node processes whose command line is inside this repository,
         plus any Node process holding one of the app's ports;
      3. stops a non-Node process still holding one of those ports;
      4. re-checks the ports and reports anything left, because a stop that
         cannot fail is a stop you cannot trust.

    MongoDB is left alone. It is a shared local instance: `show databases`
    lists data belonging to several other projects, and stopping the service
    would take every one of them down. -StopMongo is opt-in for that reason.

.PARAMETER Ports
    Ports the app binds. 3000 (web), 5000 (API) and 8080 (the production
    preview server used by `npm run preview`).

.PARAMETER RepoRoot
    This repository. Used to recognise our own processes by command line.

.PARAMETER StopMongo
    Also stop the MongoDB Windows service. Off by default; see above.

.PARAMETER Quiet
    Suppress the closing summary banner. Used when `start.bat` calls this to free
    the ports before launching -- printing "Start again with start.bat" from
    inside start.bat reads like the script told itself to go away.
    The verification result is still reported either way, because a start that
    cannot fail is a start you cannot trust.

.PARAMETER Ports
    Ports the app binds: 3000 (web), 5000 (API) and 8080 (the production preview
    server used by `npm run preview`).

    A COMMA-SEPARATED STRING, not `[int[]]`, and that is not a style choice.

    These scripts are launched as `powershell -File stop.ps1 -Ports 5000,3000`.
    With an `[int[]]` parameter the comma does not survive the trip: `-Ports
    5000,3000` binds to the single value 50003000. Every port check then looks at
    a port nothing listens on, so verification finds nothing and reports success
    -- while a stale server is still holding 3000. That is the exact failure this
    script exists to make impossible, and it was failing silently in BOTH
    start.bat and stop.bat, because both passed the list the same wrong way.

    A `[string]` receives the argument intact and is split below, where a bad
    value can be reported instead of silently reinterpreted.
#>
[CmdletBinding()]
param(
    [string] $Ports = '5000,3000,8080',
    [string] $RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [switch] $StopMongo,
    [switch] $Quiet
)

# Split on commas OR whitespace, and complain about anything left over.
#
# Both are accepted because `powershell.exe -File` does not deliver a list
# faithfully, and it mangles it differently depending on the parameter type:
# bound to `[int[]]` the separators vanish entirely ("5000,3000" -> 50003000),
# and bound to `[string]` they arrive as spaces ("5000,3000" -> "5000 3000").
# Splitting on `[\s,]+` is correct for the mangled form, the intact form, and a
# human typing either.
#
# Entries are dropped rather than coerced: [int]'5000x' is 5000, which would
# check the wrong port and report so with a straight face.
$portList = @()
foreach ($raw in ($Ports -split '[\s,]+')) {
    $t = $raw.Trim()
    if ($t -eq '') { continue }
    $n = 0
    if ([int]::TryParse($t, [ref] $n) -and $n -gt 0 -and $n -le 65535) {
        $portList += $n
    } else {
        Write-Host " [WARN] ignoring invalid port entry '$t'"
    }
}
if ($portList.Count -eq 0) {
    Write-Host ' [FAIL] no usable ports given - nothing can be checked. Aborting.'
    exit 1
}
# Deliberately NOT `$Ports = $portList`. `$Ports` is declared [string], so
# assigning the array back to it stringifies the array into "5000 3000 8080" and
# every loop below tries to bind that to an [int] parameter. PowerShell enforces
# the declared type on assignment, so the parsed list has to live in its own
# variable -- which is what the rest of the script iterates.

$ErrorActionPreference = 'Continue'
$root = $RepoRoot.TrimEnd('\')
Write-Host ''
Write-Host ' =============================================================='
Write-Host '   MANGAUD Banking Console - stopping'
Write-Host ' =============================================================='
Write-Host ''

function Get-Listeners([int] $Port) {
    try { Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue }
    catch { @() }
}

function Get-ProcessInfo([int] $ProcessId) {
    try {
        Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    } catch { $null }
}

# --- 1. What is holding the ports now -----------------------------------------
Write-Host " [1/3] Checking ports $($portList -join ', ') ..."
$portHolders = @{}
foreach ($port in $portList) {
    foreach ($conn in @(Get-Listeners $port)) {
        $pid_ = [int]$conn.OwningProcess
        $portHolders[$pid_] = $true
        $info = Get-ProcessInfo $pid_
        if ($info) {
            # Trim the path so the line is readable; the executable is the point.
            $name = Split-Path -Leaf $info.ExecutablePath
            Write-Host "        port ${port}: $($info.Name) (pid $pid_) $name"
        } else {
            Write-Host "        port ${port}: pid $pid_"
        }
    }
}
if ($portHolders.Count -eq 0) { Write-Host '        [OK] nothing is listening' }
Write-Host ''

# --- 2. Stop this project's Node processes -------------------------------------
# Two independent signals, because either alone misses a case:
#   - inside this repository's path, which catches an orphaned `tsx watch`
#     holding no port at all: "the process is running" is true, nothing answers,
#     and nothing is logged. That is the worst failure shape to debug.
#   - holding one of the app's ports, which catches the reverse: a real server
#     whose command line no longer mentions the repo (a preview started by hand).
Write-Host ' [2/3] Stopping this project''s processes ...'
$stopped = @()
foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)) {
    $pid_ = [int]$proc.ProcessId
    if ($pid_ -eq $PID) { continue }

    $inRepo = $false
    if ($proc.CommandLine) {
        $inRepo = $proc.CommandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    if (-not ($inRepo -or $portHolders.ContainsKey($pid_))) { continue }

    Write-Host "        stopping node pid $pid_"
    try {
        Stop-Process -Id $pid_ -Force -ErrorAction Stop
        $stopped += $pid_
    } catch {
        # The common case here is a race, not a failure: `tsx watch` exits on its
        # own the moment its worker dies, so between listing it and killing it the
        # process is often already gone. That is the outcome we wanted, and
        # reporting it as "[WARN] could not stop" makes a clean stop look broken.
        if (Get-Process -Id $pid_ -ErrorAction SilentlyContinue) {
            Write-Host "        [WARN] could not stop pid ${pid_}: $($_.Exception.Message)"
        } else {
            Write-Host "        [OK] pid ${pid_} had already exited"
            $stopped += $pid_
        }
    }
}

# --- 3. Anything still holding a port that is not Node -------------------------
# A leftover `cmd` wrapper, or something started by hand. It is on our port, so
# it is ours to clear -- but it is named first, because killing an unexpected
# process silently is how you lose an unrelated thing.
foreach ($pid_ in @($portHolders.Keys)) {
    if ($stopped -contains $pid_) { continue }
    $info = Get-ProcessInfo $pid_
    if (-not $info) { continue }
    Write-Host "        stopping $($info.Name) pid $pid_ (still holding a port)"
    try { Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue } catch { }
}
Start-Sleep -Milliseconds 700
Write-Host "        [OK] stopped $($stopped.Count) node process(es)"
Write-Host ''

# --- 4. Verify -----------------------------------------------------------------
Write-Host ' [3/3] Verifying ...'
$stillListening = @()
foreach ($port in $portList) {
    foreach ($conn in @(Get-Listeners $port)) {
        $info = Get-ProcessInfo ([int]$conn.OwningProcess)
        $label = if ($info) { "$($info.Name) pid $($conn.OwningProcess)" } else { "pid $($conn.OwningProcess)" }
        $stillListening += "port ${port} ($label)"
    }
}

if ($StopMongo) {
    Write-Host ''
    Write-Host ' Stopping the MongoDB service ...'
    $svc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Stopped') {
        try {
            Stop-Service -Name MongoDB -Force -ErrorAction Stop
            Write-Host '        [OK] MongoDB stopped. Other projects on this machine use it,'
            Write-Host '            so their database is unavailable until it is started again.'
        } catch {
            Write-Host "        [WARN] could not stop MongoDB: $($_.Exception.Message)"
        }
    } else {
        Write-Host '        [OK] MongoDB was not running'
    }
}

Write-Host ''
Write-Host ' =============================================================='
if ($stillListening.Count -eq 0) {
    if (-not $Quiet) {
        Write-Host '   Stopped. MongoDB left running on purpose -- it is shared with'
        Write-Host '   the other projects on this machine. Use "stop.bat --mongo" to'
        Write-Host '   stop it as well.'
        Write-Host '   Start again with  start.bat'
    } else {
        Write-Host '   Stopped. Ports are free.'
    }
} else {
    Write-Host '   Stopped, but something is STILL listening:'
    foreach ($line in $stillListening) { Write-Host "     $line" }
    Write-Host '   Look it up with:  netstat -ano | findstr LISTENING'
}
Write-Host ' =============================================================='
Write-Host ''

if ($stillListening.Count -gt 0) { exit 1 }
exit 0
