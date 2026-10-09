@echo off
setlocal EnableExtensions
title Qwen2.5-Coder 0.5B Performance Test - 2 Threads, Q8 KV, GPU Layers 99
cd /d "%~dp0"

rem Standalone test only. Faith and port 8080 are not modified.
rem Put qwen2.5-coder-0.5b-instruct-q4_k_m.gguf in .\models\ or beside this BAT.

set "MODEL="
set "MODEL_NAME=qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
if exist "%~dp0%MODEL_NAME%" set "MODEL=%~dp0%MODEL_NAME%"
if not defined MODEL if exist "%~dp0models\%MODEL_NAME%" set "MODEL=%~dp0models\%MODEL_NAME%"
if not defined MODEL if exist "%~dp0qwen2.5-coder-0.5b-instruct-q4_k_m.gguf" set "MODEL=%~dp0qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
if not defined MODEL if exist "%~dp0models\qwen2.5-coder-0.5b-instruct-q4_k_m.gguf" set "MODEL=%~dp0models\qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"

if not defined MODEL (
  echo.
  echo ERROR: Qwen2.5-Coder 0.5B model file was not found.
  echo Expected: %MODEL_NAME%
  echo Put it in "%~dp0models\" or beside this BAT.
  echo If needed, rename the downloaded GGUF to the expected filename.
  echo.
  pause
  exit /b 1
)

set "SERVER="
if exist "%~dp0llama-server.exe" set "SERVER=%~dp0llama-server.exe"
if not defined SERVER if exist "%~dp0bin\llama-server.exe" set "SERVER=%~dp0bin\llama-server.exe"
if not defined SERVER if exist "%~dp0llama.cpp\llama-server.exe" set "SERVER=%~dp0llama.cpp\llama-server.exe"
if not defined SERVER if exist "%~dp0..\llama-server.exe" set "SERVER=%~dp0..\llama-server.exe"
if not defined SERVER if exist "%~dp0..\bin\llama-server.exe" set "SERVER=%~dp0..\bin\llama-server.exe"

if not defined SERVER (
  echo.
  echo ERROR: llama-server.exe was not found.
  echo Put this BAT beside llama-server.exe, or in the parent folder of bin\llama-server.exe.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Qwen2.5-Coder 0.5B standalone server...
echo Model: %MODEL%
echo Server: %SERVER%
echo URL: http://127.0.0.1:8090
echo.
echo PERFORMANCE TEST: context 4096, 2 threads, Q8_0 KV cache, GPU layers 99.
echo This does not change Faith or its normal server on port 8080.
echo If startup reports unknown cache-type options, remove both --cache-type lines and retry.
echo If GPU offload fails or no compatible GPU backend exists, remove --n-gpu-layers 99 and retry.
echo Press Ctrl+C to stop the server.
echo.

rem Keep console output visible for Windows 7 troubleshooting.
rem If --cache-ram is unsupported by your llama.cpp build, remove that line.
"%SERVER%" ^
  --model "%MODEL%" ^
  --host 127.0.0.1 ^
  --port 8090 ^
  --alias coding-local ^
  --ctx-size 4096 ^
  --threads 2 ^
  --parallel 1 ^
  --batch-size 128 ^
  --ubatch-size 64 ^
  --cache-type-k q8_0 ^
  --cache-type-v q8_0 ^
  --n-gpu-layers 99 ^
  --cache-ram 0

set "EXITCODE=%ERRORLEVEL%"
echo.
echo llama-server stopped with exit code %EXITCODE%.
pause
exit /b %EXITCODE%
