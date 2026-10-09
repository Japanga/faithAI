@echo off
setlocal EnableExtensions
title Faith Launcher
cd /d "%~dp0"

echo Starting Faith...

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
