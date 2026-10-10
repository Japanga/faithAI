@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Faith Emotions GGUF - Fast Configuration - localhost:8070

REM Launch Faith's emotion model on localhost:8070.
REM Uses the same performance-oriented configuration as the Qwen Coder test BAT.
REM This is the dedicated emotion server; it does not change Faith's port 8080 server.

if not defined LLAMA_SERVER_EXE (
  if exist "%~dp0llama-server.exe" (
    set "LLAMA_SERVER_EXE=%~dp0llama-server.exe"
  ) else if exist "%~dp0bin\llama-server.exe" (
    set "LLAMA_SERVER_EXE=%~dp0bin\llama-server.exe"
  ) else if exist "%~dp0llama.cpp\llama-server.exe" (
    set "LLAMA_SERVER_EXE=%~dp0llama.cpp\llama-server.exe"
  ) else (
    set "LLAMA_SERVER_EXE=llama-server.exe"
  )
)

set "MODEL_PATH=%~dp0models\Faith_Emotions_v2_Q4_K_M.gguf"
if not exist "%MODEL_PATH%" (
  echo.
  echo ERROR: Emotion model not found:
  echo "%MODEL_PATH%"
  echo Place Faith_Emotions_v2_Q4_K_M.gguf in the models folder beside this BAT.
  echo.
  pause
  exit /b 1
)

if not exist "%LLAMA_SERVER_EXE%" if "%LLAMA_SERVER_EXE%"=="llama-server.exe" (
  where llama-server.exe >nul 2>nul
  if errorlevel 1 (
    echo.
    echo ERROR: llama-server.exe was not found.
    echo Put it beside this BAT, in bin\, in llama.cpp\, or set LLAMA_SERVER_EXE to its full path.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting Faith Emotions GGUF on http://127.0.0.1:8070
echo Model: "%MODEL_PATH%"
echo Server: "%LLAMA_SERVER_EXE%"
echo Log: "%~dp0faith-emotions-server.log"
echo.
echo PERFORMANCE CONFIG: context 4096, 2 threads, parallel 1,
echo Q8_0 K/V cache, CPU execution, batch 128, ubatch 64.
echo Faith should wait for the emotion model health endpoint before sending requests.
echo Keep this window open while the emotion model is running.
echo.
echo If llama-server reports unknown --cache-type options, remove both --cache-type lines.
echo If --cache-ram is unsupported, remove that line.
echo Press Ctrl+C to stop the server.
echo.

"%LLAMA_SERVER_EXE%" ^
  --model "%MODEL_PATH%" ^
  --host 127.0.0.1 ^
  --port 8070 ^
  --alias faith-emotions ^
  --ctx-size 4096 ^
  --threads 2 ^
  --parallel 1 ^
  --batch-size 128 ^
  --ubatch-size 64 ^
  --cache-type-k q8_0 ^
  --cache-type-v q8_0 ^
  --cache-ram 0 ^
  --log-file "%~dp0faith-emotions-server.log"

set "EXITCODE=%ERRORLEVEL%"
echo.
echo Faith emotion server stopped with exit code %EXITCODE%.
if not "%EXITCODE%"=="0" (
  echo Review: "%~dp0faith-emotions-server.log"
  pause
)
endlocal & exit /b %EXITCODE%
