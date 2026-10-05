@echo off
rem ===========================================================================
rem  MANGAUD Banking Console - stop
rem
rem  Stops THIS project's servers. Nothing else.
rem
rem  Usage:
rem    stop.bat            stop the API and the web client
rem    stop.bat --mongo    also stop the MongoDB *service*
rem    stop.bat --help     this list
rem
rem  Why this is a wrapper around scripts\stop.ps1 rather than a big batch file:
rem
rem  cmd cannot express this logic without lying to you. The obvious version --
rem  nested FOR over ports, calling a PowerShell one-liner inside a parenthesised
rem  block -- dies with "was unexpected at this time", because nested FOR loops
rem  that reuse a variable name break cmd's parser outright. Working around that
rem  needs escaping layers that make the file unreadable, and an unreadable stop
rem  script is one you cannot trust to have stopped anything.
rem
rem  So the real work is PowerShell, invoked with -File. That also means the
rem  repository path is passed as an ordinary argument instead of being spliced
rem  into a quoted command line, which is what breaks on a profile folder with a
rem  space in it (OneDrive puts those under "C:\Users\First Last\").
rem
rem  Why not `taskkill /f /im node.exe`, which the launcher used to recommend:
rem  it kills every Node process on the machine. That includes other projects'
rem  dev servers and the editor's MCP agents -- including the tooling running the
rem  session that ran it. It also reads like it is scoped to this app, which is
rem  what makes it dangerous rather than merely rude.
rem
rem  MongoDB is NOT stopped by default. It is a shared local instance holding
rem  data for several other projects on this machine. Use --mongo if you mean it.
rem ===========================================================================

setlocal
title MANGAUD Banking Console - stop

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%scripts\stop.ps1"

if not exist "%SCRIPT%" (
    echo.
    echo  [FAIL] scripts\stop.ps1 is missing from this checkout.
    echo         Expected: "%SCRIPT%"
    echo.
    pause
    exit /b 1
)

set "STOPMONGO="
if /i "%~1"=="--mongo" set "STOPMONGO=-StopMongo"

if /i "%~1"=="--help" goto usage
if /i "%~1"=="-h" goto usage
if not "%~1"=="" (
    echo  Unknown option "%~1" -- showing usage.
    goto usage
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -RepoRoot "%ROOT:~0,-1%" -Ports 5000,3000,8080 %STOPMONGO%
set "RC=%ERRORLEVEL%"

rem Exit 0 when the app is down. A non-zero code is kept for scripts that care,
rem but the window still closes normally -- a stop that leaves a window open
rem reads as "it did not finish".
if not "%RC%"=="0" (
    echo  Note: something is still listening -- see above.
    echo.
    timeout /t 4 >nul
)
endlocal & exit /b %RC%

rem ---------------------------------------------------------------------------
rem  :usage
rem ---------------------------------------------------------------------------
:usage
echo.
echo  MANGAUD Banking Console - stop
echo.
echo    stop.bat            stop the API and the web client for THIS project
echo    stop.bat --mongo    also stop the MongoDB service ^(shared - read first^)
echo    stop.bat --help     this list
echo.
echo  Scoped to this repository and to ports 3000, 5000 and 8080. Other Node
echo  processes on this machine, and MongoDB itself, are left alone.
echo.
endlocal
exit /b 0
