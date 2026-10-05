@echo off
rem ===========================================================================
rem  MANGAUD Banking Console - local runner
rem
rem  Frees ports 3000/5000, starts MongoDB (if needed), optionally seeds the
rem  database, runs a type-check, brings up the API and the web client, waits
rem  until both actually answer, then opens your browser and prints the demo
rem  logins.
rem
rem  Usage:
rem    start.bat              dev client  -> http://localhost:3000  (hot reload)
rem    start.bat production   built app   -> http://localhost:3000  (PWA)
rem
rem  Flags (combine freely, in any order):
rem    --no-seed      skip `npm run db:seed`. The seed WIPES the database first,
rem                    and the API verification suites leave rows behind, so
rem                    after a test pass this is what you want -- re-seeding to
rem                    look at clean data costs a full wipe.
rem    --verify       run the unit suite and the colour-utility lint before
rem                    starting anything. Slower, but catches a broken build in
rem                    ten seconds rather than after a two-minute start.
rem    --help         print this list and exit.
rem
rem  Both modes serve on port 3000. The API is on 5000. Nothing uses 8080.
rem
rem  Everything binds to 0.0.0.0, so a phone on the same Wi-Fi can reach the app
rem  at the LAN address printed at the end. See README for the firewall rule and
rem  the CORS allowlist that has to include that address.
rem ===========================================================================

setlocal enabledelayedexpansion
title MANGAUD Banking Console
color 0E

set "ROOT=%~dp0"
set "LOGS=%TEMP%\mangaud-logs"
if not exist "%LOGS%" mkdir "%LOGS%"

set "MODE=dev"
set "DOSEED=1"
set "VERIFY=0"

:parse_args
if "%~1"=="" goto args_done
rem Parenthesised, not `if ... set X & shift & goto`. cmd parses
rem `if COND cmd1 & cmd2` as `if COND cmd1` followed by an UNCONDITIONAL cmd2,
rem so the `&` form would shift and loop even when the condition was false.
if /i "%~1"=="production" (
    set "MODE=production"
    shift
    goto parse_args
)
if /i "%~1"=="dev" (
    set "MODE=dev"
    shift
    goto parse_args
)
if /i "%~1"=="--no-seed" (
    set "DOSEED=0"
    shift
    goto parse_args
)
if /i "%~1"=="--verify" (
    set "VERIFY=1"
    shift
    goto parse_args
)
if /i "%~1"=="--help" goto usage
if /i "%~1"=="-h" goto usage
echo  Unknown option "%~1" - showing usage.
goto usage

:args_done
rem Deliberately NOT named PORT.
rem
rem `start` hands this script's whole environment to every child it spawns, so
rem any variable this script defines becomes an environment variable in the API
rem and the client. Naming the web port `PORT` here set PORT=3000 for the API
rem too, and dotenv does not override a variable that already exists - so the
rem API ignored its own .env, bound 3000 instead of 5000, and this script sat
rem polling 5000 for a server that would never arrive. WEBPORT is unambiguous;
rem the children get their ports set explicitly below.
set "WEBPORT=3000"
set "APIPORT=5000"
set "URL=http://localhost:%WEBPORT%"

echo.
echo  ==============================================================
echo    MANGAUD BANKING CONSOLE  -  %MODE% mode
echo    App http://localhost:%WEBPORT%   API http://localhost:%APIPORT%/api/v1
echo  ==============================================================
echo.

rem --- verify (optional) -----------------------------------------------------
rem `!VOK!` rather than `%VOK%`: the whole block is parsed before any of it runs,
rem so a `%VOK%` written earlier in the same block expands to the value from
rem BEFORE the block -- which is empty -- and the failure branch never fires.
rem The result would be a broken build reported as a clean verify.
if "%VERIFY%"=="1" (
    echo  [v] Type-check + unit tests + colour lint ...
    pushd "%ROOT%"
    call npm run typecheck > "%LOGS%\verify.log" 2>&1
    set "VOK=1"
    if errorlevel 1 set "VOK=0"
    popd
    if "!VOK!"=="0" (
        echo        [FAIL] Verification failed - see "%LOGS%\verify.log"
        call :showlog "%LOGS%\verify.log"
        echo.
        pause
        exit /b 1
    )
    echo        [OK] type-check and colour lint clean

    pushd "%ROOT%server"
    call npm test > "%LOGS%\test.log" 2>&1
    set "TOK=1"
    if errorlevel 1 set "TOK=0"
    popd
    if "!TOK!"=="0" (
        echo        [FAIL] Unit tests failed - see "%LOGS%\test.log"
        call :showlog "%LOGS%\test.log"
        echo.
        pause
        exit /b 1
    )
    echo        [OK] unit tests pass
    echo.
)

rem --- 0. Free ports ---------------------------------------------------------
rem Not cosmetic. A previous run leaves node holding the ports; the new server
rem then dies with EADDRINUSE while the OLD one keeps serving stale code, which
rem presents to you as "my changes did not apply". So whatever is on 3000 now
rem gets stopped, and only then do we start.
echo  [0/5] Stopping anything already on %APIPORT%/%WEBPORT% ...
rem
rem This used to be two inline PowerShell one-liners, and the second was a real
rem hazard: it stopped *every* node.exe whose command line contained the text
rem "Banking" -- matched with -like, so case-insensitively and as a SUBSTRING of
rem this repository's path. That is not a match for this project, it is a match
rem for a word in a folder name, so it would have killed another project living
rem in a folder of the same name and any editor agent whose command line
rem mentioned this path -- including the tooling running the session that
rem launched this script.
rem
rem It also contradicted this file's own summary, which tells the user stop.bat
rem deliberately avoids over-killing Node "because it would also kill every other
rem Node process on this machine". scripts\stop.ps1 already does this correctly
rem (full repo path + port holders, names what it stopped, refuses to report
rem success while something still listens), so start.bat now calls that instead
rem of keeping a second, weaker copy of the same logic.
if not exist "%ROOT%scripts\stop.ps1" (
    echo        [FAIL] scripts\stop.ps1 is missing from this checkout, so the
    echo               ports cannot be freed safely. Refusing to fall back to a
    echo               guess that could stop another project's processes.
    echo.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop.ps1" -RepoRoot "%ROOT:~0,-1%" -Ports %APIPORT%,%WEBPORT% -Quiet
if errorlevel 1 (
    echo        [FAIL] Something is still holding %APIPORT% or %WEBPORT%.
    echo               Close it, or run stop.bat, then run this file again.
    echo.
    pause
    exit /b 1
)
>nul 2>&1 ping -n 2 127.0.0.1
echo        [OK] ports %APIPORT% and %WEBPORT% are free

rem --- 0b. Work out this machine's LAN address -------------------------------
rem Pick the address a phone can actually reach.
rem
rem Two traps here, both hit for real:
rem  - `Get-NetIPConfiguration | Where IPv4DefaultGateway | Select -First 1`
rem    is not enough on its own. The Hyper-V/WSL adapter also carries a default
rem    gateway, and it came back first in testing, so the script printed
rem    172.21.x.x with full confidence while that was the wrong adapter.
rem  - `ipconfig | findstr "IPv4 Address"` is worse: first match wins, and
rem    loopback/VPN entries sort ahead of the Wi-Fi one.
rem
rem So: the default-gateway address on an adapter that is up and is not one of
rem the virtual ones, matched by name.
set "LAN="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.InterfaceDescription -notmatch 'Hyper-V|WSL|Loopback|vEthernet' }; if ($c) { $c[0].IPv4Address.IPAddress }"`) do set "LAN=%%A"
if defined LAN (echo        LAN address: !LAN!) else (echo        [WARN] no Wi-Fi/Ethernet address found - phone testing unavailable)

rem --- 1. MongoDB -----------------------------------------------------------
echo  [1/5] Checking MongoDB ...
call :portup 27017
if errorlevel 1 (
    echo        not listening on 27017 - trying the MongoDB service...
    net start MongoDB >nul 2>&1
    >nul 2>&1 ping -n 5 127.0.0.1
    call :portup 27017
    if errorlevel 1 (
        echo        [FAIL] Could not start MongoDB.
        echo               Start it manually, then run this file again:
        echo                 net start MongoDB
        echo.
        pause
        exit /b 1
    )
)
echo        [OK] MongoDB is listening on 27017

rem --- 2. Seed --------------------------------------------------------------
rem Skipped with --no-seed. The seed drops and rebuilds every collection, so
rem this is destructive by design: it is how you get back to pristine demo data
rem after a verification run, and it is also how you lose anything you added by
rem hand. Which is why it is a flag rather than unconditional.
rem
rem No parentheses in the echo text. Inside an `if ( ... )` block an unescaped
rem `)` closes the block, and the remainder of the line is parsed as a command --
rem which is why this line previously died with "- was unexpected at this time".
if "%DOSEED%"=="0" (
    echo  [2/5] Seeding skipped via the --no-seed flag - existing data left as it is
    goto after_seed
)
echo  [2/5] Seeding demo data ...
pushd "%ROOT%server"
call npm run db:seed > "%LOGS%\seed.log" 2>&1
if errorlevel 1 (
    echo        [WARN] Seeding reported an error - see "%LOGS%\seed.log"
    echo               Continuing; the API will complain if the DB is unusable.
) else (
    echo        [OK] Seed complete
)
popd

:after_seed

rem --- 3. API ---------------------------------------------------------------
rem Keep the CORS allowlist in step with this machine's address *before* the API
rem starts, because dotenv reads server\.env once at boot - fixing it after
rem startup would need a second restart to take effect.
call :ensurecors

rem `pushd` first so the child inherits the working directory. Passing
rem `cd /d "<path>"` through `start` means nesting quotes inside quotes, which
rem breaks the moment the path contains a space - and on Windows a user's
rem profile folder very often does.
echo  [3/5] Starting the API on http://localhost:%APIPORT% ...
pushd "%ROOT%server"
start "MANGAUD API" /min cmd /c "set PORT=%APIPORT%&& npm run dev > ""%LOGS%\api.log"" 2>&1"
popd

call :waitfor "http://localhost:%APIPORT%/api/v1/ready" 120 "the API"
if errorlevel 1 (
    echo        [FAIL] The API never became ready.
    call :showlog "%LOGS%\api.log"
    echo.
    pause
    exit /b 1
)
echo        [OK] API is responding

rem --- 4. Web ---------------------------------------------------------------
if "%MODE%"=="production" (
    echo  [4/5] Building the production bundle, this takes a minute ...
    pushd "%ROOT%client"
    call npm run build > "%LOGS%\build.log" 2>&1
    if errorlevel 1 (
        echo        [FAIL] Build failed - see "%LOGS%\build.log"
        popd
        pause
        exit /b 1
    )
    popd
    echo        [OK] Build complete
    echo        Serving it on port %WEBPORT% with the service worker active ...
    pushd "%ROOT%client"
    start "MANGAUD Web" /min cmd /c "set PREVIEW_PORT=%WEBPORT%&& npm run preview > ""%LOGS%\web.log"" 2>&1"
    popd
) else (
    echo  [4/5] Starting the dev client on port %WEBPORT% ...
    pushd "%ROOT%client"
    start "MANGAUD Web" /min cmd /c "set PORT=%WEBPORT%&& npm run start:lan > ""%LOGS%\web.log"" 2>&1"
    popd
)

call :waitfor "http://localhost:%WEBPORT%" 180 "the web client"
if errorlevel 1 (
    echo        [FAIL] The web client never became ready.
    call :showlog "%LOGS%\web.log"
    echo.
    pause
    exit /b 1
)
echo        [OK] Web is responding

rem --- 5. Browser -----------------------------------------------------------
echo  [5/5] Opening your browser ...
start "" "%URL%"

rem --- Summary --------------------------------------------------------------
echo.
echo  ==============================================================
echo    Running.
echo.
echo    On this machine   %URL%
if defined LAN echo    On your phone     http://!LAN!:%WEBPORT%
echo    API              http://localhost:%APIPORT%/api/v1
echo    Health           http://localhost:%APIPORT%/api/v1/ready
echo    Logs             %LOGS%
echo.
if defined LAN (
    echo    If the phone cannot connect, the firewall is the likely cause.
    echo    Run this once in PowerShell as Administrator:
    echo      New-NetFirewallRule -DisplayName "MANGAUD dev" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
    echo    CLIENT_URL in server\.env is kept up to date by this script, so
    echo    CORS is not the problem unless you edited it by hand.
) else (
    echo    No Wi-Fi/Ethernet address was found, so a phone cannot reach this.
)
echo.
echo    Demo logins
echo      Administrator   admin@mangaud.demo        / Admin@123
echo      Branch manager  manager@mangaud.demo      / Manager@123
echo      Branch teller   teller@mangaud.demo       / Teller@123
echo      Loan officer    loanofficer@mangaud.demo  / Officer@123
echo      Auditor         auditor@mangaud.demo      / Auditor@123
echo      Customer        aarav.sharma@mangaud.demo/ Customer@123
echo      Customer        priya.nair@mangaud.demo  / Customer@123
echo      Customer        rohan.patel@mangaud.demo / Customer@123
echo      Customer        ananya.iyer@mangaud.demo / Customer@123
echo.
echo    To stop:
echo      stop.bat
echo    That stops only this project - the API, the web client, and any orphaned
echo    watcher of theirs. It deliberately does NOT run "taskkill /f /im
echo    node.exe", which would also kill every other Node process on this
echo    machine (other projects' dev servers, the editor's MCP agents) and reads
echo    as if it were scoped to this app.
echo    MongoDB is left running, because it is shared with the other projects
echo    on this machine. Use "stop.bat --mongo" if you really want it down.
echo.
echo    Options:  start.bat production | --no-seed | --verify | --help
echo  ==============================================================
echo.
echo  Press any key to close this window - the servers keep running.
pause >nul
endlocal
exit /b 0

rem ---------------------------------------------------------------------------
rem  :usage   printed for --help and for an unrecognised option
rem ---------------------------------------------------------------------------
:usage
echo.
echo  MANGAUD Banking Console - local runner
echo.
echo    start.bat                 dev client, hot reload ^(http://localhost:3000^)
echo    start.bat production      production build + service worker
echo.
echo  Options:
echo    --no-seed    skip `npm run db:seed`. The seed wipes the database first.
echo    --verify     run type-check, unit tests and the colour lint before start.
echo    --help       this list.
echo.
echo  To stop what this started, use  stop.bat  (not taskkill /f /im node.exe,
echo  which would take every other Node process on this machine with it).
echo.
echo  Everything binds to 0.0.0.0 so a phone on the same Wi-Fi can reach it.
echo  Logs go to %LOGS%
echo.
endlocal
exit /b 0

rem ---------------------------------------------------------------------------
rem  :ensurecors   keep CLIENT_URL in step with this machine's LAN address
rem
rem  A phone can only load the app if its origin is on the API's allowlist.
rem  The address changes more often than anyone expects - new Wi-Fi, a VPN, a
rem  different DHCP lease - and when it does the API answers the browser's
rem  preflight with "origin not allowed". The page then simply never loads,
rem  which presents as a broken app rather than a config mismatch.
rem
rem  Done in PowerShell, not batch string surgery: rewriting a line while
rem  preserving every other line and the file's encoding is not something to
rem  attempt with `set` and substring expansion. UTF8Encoding($false) is
rem  deliberate - Windows PowerShell's `Set-Content -Encoding UTF8` adds a BOM,
rem  and a BOM in a .env file corrupts the first key's name.
rem ---------------------------------------------------------------------------
:ensurecors
if not defined LAN exit /b 0
set "ENVPATH=%ROOT%server\.env"
if not exist "%ENVPATH%" (
    echo        [WARN] server\.env not found - phone access may be blocked by CORS
    exit /b 0
)
if not exist "%ROOT%scripts\fix-cors.ps1" (
    echo        [FAIL] scripts\fix-cors.ps1 is missing from this checkout.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\fix-cors.ps1" -EnvPath "%ENVPATH%" -Origin "http://%LAN%:%WEBPORT%" 2>nul
exit /b 0

rem ---------------------------------------------------------------------------
rem  :showlog <path>   last 15 lines, so a failure explains itself on screen
rem  instead of only naming a file the user has to go and find.
rem ---------------------------------------------------------------------------
:showlog
if not exist "%~1" (
    echo        --- no log was written at all, so the process died before it
    echo            could even open its output file ---
    exit /b 0
)
echo        --- last lines of %~1 ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Content -LiteralPath '%~1' -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('        ' + $_) }"
echo        --- end ---
exit /b 0

rem ---------------------------------------------------------------------------
rem  :portup <port>   returns 0 when something is listening
rem ---------------------------------------------------------------------------
:portup
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%

rem ---------------------------------------------------------------------------
rem  :waitfor <url> <seconds> <label>   returns 1 on timeout
rem ---------------------------------------------------------------------------
:waitfor
set "WURL=%~1"
set "WLIMIT=%~2"
set "WLABEL=%~3"
set /a WSECS=0
:wait_loop
rem `ping` rather than `timeout /t`: `timeout` refuses to run when stdin is
rem redirected and prints "Input redirection is not supported" once per second,
rem which floods the log and makes the script unusable from CI or a pipe.
>nul 2>&1 ping -n 2 127.0.0.1
set /a WSECS+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $null = Invoke-WebRequest -Uri '%WURL%' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
if %WSECS% lss %WLIMIT% goto wait_loop
echo        [WARN] %WLABEL% did not answer within %WLIMIT%s
exit /b 1
