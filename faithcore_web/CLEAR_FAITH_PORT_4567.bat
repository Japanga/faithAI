@echo off
setlocal EnableExtensions
title Faith - Clear Port 4567
echo.
echo ============================================================
echo  Faith emergency cleanup - TCP port 4567
echo ============================================================
echo.
echo Finding processes LISTENING on local port 4567...
echo.

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /I "LISTENING" ^| findstr /C:":4567"') do call :KILLPID %%P

echo.
echo Checking port 4567 again...
netstat -ano -p tcp | findstr /I "LISTENING" | findstr /C:":4567"
if errorlevel 1 echo No listener remains on port 4567.
echo.
pause
endlocal
exit /b

:KILLPID
if "%~1"=="0" exit /b
echo Attempting to stop PID %~1 listening on port 4567...
taskkill /PID %~1 /F
exit /b
