@echo off
title MANGAUD Banking Console - Diagnostics
color 0E

set ROOT=%~dp0
set BASE=http://localhost:5000/api/v1

echo.
echo ============================================================
echo   MANGAUD BANKING CONSOLE - DIAGNOSTICS
echo ============================================================
echo.

echo [1/8] MongoDB
netstat -ano | findstr ":27017" | find "LISTENING" >nul
if errorlevel 1 (
    echo   [FAIL] not listening on 27017
    echo          fix: net start MongoDB
) else (
    echo   [OK]   listening on 27017
)

echo.
echo [2/8] Database contents
rem The collection list mirrors the seed's KNOWN_COLLECTIONS. A collection that
rem appears here but is not in that set is a leftover from an older schema and
rem reads in Compass like a feature that was never built.
mongosh "mongodb://localhost:27017/mangaud" --quiet --eval "
  ['users','customers','accounts','transactions','loans','loanpayments','cards',
   'beneficiaries','notifications','auditlogs','statements','fixeddeposits',
   'standinginstructions','nominees','kycsubmissions','savingsinterestpostings',
   'refreshtokens','passwordresettokens'].forEach(function(c){
    var n = db.getCollection(c).countDocuments();
    print('   ' + (n > 0 ? '[OK]  ' : '[EMPTY]') + ' ' + c + ' = ' + n);
  });
" 2>nul
if errorlevel 1 echo   [WARN] could not query mongosh

echo.
echo [3/8] Environment
if exist "%ROOT%server\.env" (echo   [OK]   server\.env) else (echo   [MISSING] server\.env)
if exist "%ROOT%client\.env" (echo   [OK]   client\.env) else (echo   [MISSING] client\.env)

echo.
echo [4/8] Dependencies
if exist "%ROOT%server\node_modules" (echo   [OK]   server\node_modules) else (echo   [MISSING] server\node_modules  -> cd server ^&^& npm install)
if exist "%ROOT%client\node_modules" (echo   [OK]   client\node_modules) else (echo   [MISSING] client\node_modules  -> cd client ^&^& npm install)

echo.
echo [5/8] Ports
netstat -ano | findstr ":5000" | find "LISTENING" >nul
if errorlevel 1 (echo   [WARN] port 5000 (API) not in use) else (echo   [OK]   port 5000 (API) in use)
netstat -ano | findstr ":3000" | find "LISTENING" >nul
if errorlevel 1 (echo   [WARN] port 3000 (client) not in use) else (echo   [OK]   port 3000 (client) in use)

echo.
echo [6/8] API health
rem `/ready` rather than `/health`: `/health` answers before Mongo is reachable,
rem so it reports a healthy API attached to a database it cannot talk to.
rem `/ready` pings and names the database, which is also how you confirm you are
rem on `mangaud` and not one of the other projects on this shared MongoDB.
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri '%BASE%/ready' -TimeoutSec 5; Write-Host ('   [OK]   db=' + $r.database.name + ' host=' + $r.database.host + ' state=' + $r.database.state) } catch { Write-Host '   [FAIL] API not responding (is it running?)' }" 2>nul

echo.
echo [7/8] Type checks
pushd "%ROOT%server"
call npx tsc --noEmit >nul 2>&1
if errorlevel 1 (echo   [FAIL] server tsc reported errors  -> cd server ^&^& npx tsc --noEmit) else (echo   [OK]   server tsc clean)
popd
pushd "%ROOT%client"
call npx tsc --noEmit >nul 2>&1
if errorlevel 1 (echo   [FAIL] client tsc reported errors  -> cd client ^&^& npx tsc --noEmit) else (echo   [OK]   client tsc clean)
call node scripts\check-tokens.mjs >nul 2>&1
if errorlevel 1 (echo   [FAIL] colour-utility lint failed  -> cd client ^&^& node scripts\check-tokens.mjs) else (echo   [OK]   every colour utility resolves)
popd

echo.
echo [8/8] Unit tests
rem No server and no database needed: these cover the pure logic -- rail
rem selection, the rate card, the day-of-month cap, the money-endpoint schemas.
pushd "%ROOT%server"
call npx vitest run >nul 2>&1
if errorlevel 1 (echo   [FAIL] unit tests failed  -> cd server ^&^& npm test) else (echo   [OK]   unit tests pass)
popd

echo.
echo ============================================================
echo   App  http://localhost:3000
echo   API  %BASE%
echo   MongoDB Compass: mongodb://localhost:27017  (db: mangaud)
echo.
echo   Start:   start.bat
echo   Start + verify first:   start.bat --verify
echo   Start without wiping data:  start.bat --no-seed
echo   Reseed (destructive):  cd server ^&^& npm run db:seed
echo   API suites (need the server up): see MEMORY.md
echo ============================================================
echo.
pause
