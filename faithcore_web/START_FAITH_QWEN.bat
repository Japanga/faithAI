@echo off
setlocal EnableExtensions
title Faith Launcher
cd /d "%~dp0"

echo Starting Faith...
echo.
echo Clearing any old process listening on TCP port 4567...

rem Kill only processes that NETSTAT reports as LISTENING on local TCP port 4567.
rem This avoids killing ordinary client connections that merely connect to port 4567.
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /I "LISTENING" ^| findstr /C:":4567"') do (
    if not "%%P"=="0" (
        echo Stopping old Faith/server listener PID %%P...
        taskkill /PID %%P /F >nul 2>&1
    )
)

timeout /t 1 /nobreak >nul

rem Verify whether anything still owns port 4567; warn rather than silently continue.
netstat -ano -p tcp | findstr /I "LISTENING" | findstr /C:":4567" >nul
if not errorlevel 1 (
    echo WARNING: A process is still listening on port 4567:
    netstat -ano -p tcp | findstr /I "LISTENING" | findstr /C:":4567"
    echo If Faith does not start correctly, run CLEAR_FAITH_PORT_4567.bat as Administrator.
    pause
)

rem Start the Ruby backend without opening another visible Command Prompt window.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -WorkingDirectory '%~dp0' -ArgumentList '/c','bundle exec ruby server.rb'"

rem Give the backend a moment to initialize, then open Faith's Ruby frontend on port 4567.
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4567"

rem Run the regular-chat BAT directly in this window (do not create another CMD window).
if exist "%~dp0Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat" (
    call "%~dp0Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat"
) else (
    echo ERROR: Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat was not found beside this launcher.
    pause
    exit /b 1
)

endlocal
