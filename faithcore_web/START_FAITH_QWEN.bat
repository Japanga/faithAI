@echo off
setlocal EnableExtensions
title Faith Simple Launcher
cd /d "%~dp0"

echo ==========================================
echo Faith - Simple Launcher
echo ==========================================
echo.

rem Start the Ruby backend in its own visible window so startup errors remain readable.
echo [1/3] Starting Faith Ruby backend...
start "Faith Ruby Server" cmd /k "cd /d ""%~dp0"" && bundle exec ruby server.rb"

rem Give the backend a moment to initialize before opening the frontend.
timeout /t 2 /nobreak >nul

rem Open the HTML frontend on port 8080 in the default browser.
echo [2/3] Opening the HTML frontend at http://127.0.0.1:8080 ...
start "" "http://127.0.0.1:8080"

rem Launch the regular-chat GGUF using its dedicated BAT.
echo [3/3] Launching regular chat model...
if exist "%~dp0Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat" (
    start "Faith Qwen Regular Chat" cmd /k "cd /d ""%~dp0"" && call ""%~dp0Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat"""
) else (
    echo WARNING: Test_Qwen2-0_5B-Instruct_Q4_K_M_Win7.bat was not found beside this launcher.
    echo Place the regular-chat BAT in this folder and run this launcher again.
)

echo.
echo Launch commands have been issued.
echo This launcher does not start the coding GGUF or modify any AI settings.
echo.
pause
endlocal
