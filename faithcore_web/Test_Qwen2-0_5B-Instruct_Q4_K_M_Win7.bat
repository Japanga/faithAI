@echo off
setlocal EnableExtensions
title Test Qwen2-0_5B-Instruct-Q4_K_M - Faith Chat :8080
cd /d "%~dp0"

echo ============================================================
echo  TEST QWEN REGULAR CHAT MODEL
echo  Model: qwen2-0_5b-instruct-q4_k_m.gguf
echo  Endpoint: http://127.0.0.1:8080
echo ============================================================
echo.
echo Launcher folder:
echo %~dp0
echo.

set "MODEL_NAME=qwen2-0_5b-instruct-q4_k_m.gguf"
set "LLAMA="
set "MODEL="

rem First look beside this BAT, then in common subfolders.
if exist "%~dp0llama-server.exe" set "LLAMA=%~dp0llama-server.exe"
if not defined LLAMA if exist "%~dp0bin\llama-server.exe" set "LLAMA=%~dp0bin\llama-server.exe"
if not defined LLAMA if exist "%~dp0llama.cpp\build\bin\llama-server.exe" set "LLAMA=%~dp0llama.cpp\build\bin\llama-server.exe"

rem If not found in the common locations, search below the BAT's folder.
if not defined LLAMA (
  for /r "%~dp0" %%F in (llama-server.exe) do (
    if not defined LLAMA set "LLAMA=%%~fF"
  )
)

rem Search for the exact GGUF filename anywhere below the BAT's folder.
for /r "%~dp0" %%F in (%MODEL_NAME%) do (
  if not defined MODEL set "MODEL=%%~fF"
)

if not defined LLAMA (
  echo ERROR: Could not find llama-server.exe.
  echo Put this BAT in your Faith/llama.cpp folder, or edit the launcher
  echo to point to the correct llama-server.exe location.
  echo.
  pause
  exit /b 1
)

if not defined MODEL (
  echo ERROR: Could not find the model file:
  echo %MODEL_NAME%
  echo.
  echo Place the GGUF somewhere inside this BAT's folder tree, or edit
  echo this BAT to set MODEL to its full path.
  echo.
  pause
  exit /b 1
)

echo Found server:
echo "%LLAMA%"
echo.
echo Found model:
echo "%MODEL%"
echo.

rem Do not start a duplicate server if port 8080 is already listening.
netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul
if not errorlevel 1 (
  echo WARNING: Port 8080 already has a listening process.
  echo This launcher will not start a second server on the same port.
  echo Check http://127.0.0.1:8080/health or stop the existing process first.
  echo.
  pause
  exit /b 0
)

echo Starting the regular chat GGUF on 127.0.0.1:8080...
echo Keep this window open while Faith uses the regular chat model.
echo Press Ctrl+C to stop the server.
echo.
echo ------------------------------------------------------------
echo Launch command:
echo "%LLAMA%" --model "%MODEL%" --host 127.0.0.1 --port 8080 --ctx-size 4096
echo ------------------------------------------------------------
echo.

"%LLAMA%" --model "%MODEL%" --host 127.0.0.1 --port 8080 --ctx-size 4096

echo.
echo llama-server.exe has exited. If it failed, review the error above.
pause
endlocal
