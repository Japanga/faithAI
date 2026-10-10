@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Faith Emotion GGUF Direct Prompt Test

set "MODEL_PATH=%~dp0models\Faith_Emotions_v2_Q4_K_M.gguf"
if exist "%~dp0llama-server.exe" (
  set "LLAMA_SERVER_EXE=%~dp0llama-server.exe"
) else (
  set "LLAMA_SERVER_EXE=llama-server.exe"
)
set "TEST_RB=%~dp0Faith_Emotion_GGUF_Test.rb"

echo ============================================================
echo Faith Emotion GGUF - Direct Prompt Test
echo ============================================================
echo This test generates replies with the GGUF model itself.
echo It does NOT require faith_emotions_v2_5000.jsonl.
echo.

if not exist "%MODEL_PATH%" (
  echo ERROR: Model not found:
  echo "%MODEL_PATH%"
  echo Put Faith_Emotions_v2_Q4_K_M.gguf inside the models folder.
  pause
  exit /b 2
)
if not exist "%TEST_RB%" (
  echo ERROR: Ruby tester not found:
  echo "%TEST_RB%"
  pause
  exit /b 2
)
where ruby.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: ruby.exe was not found on PATH.
  pause
  exit /b 3
)

echo Checking whether llama-server is already running on port 8070...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8070/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo GGUF server is not ready. Launching llama-server directly in a new window...
  if not exist "%LLAMA_SERVER_EXE%" if "%LLAMA_SERVER_EXE%"=="llama-server.exe" (
    where llama-server.exe >nul 2>nul
    if errorlevel 1 (
      echo ERROR: llama-server.exe was not found beside this BAT or on PATH.
      pause
      exit /b 4
    )
  )
  start "Faith Emotion GGUF Server" /D "%~dp0" "%LLAMA_SERVER_EXE%" --model "%MODEL_PATH%" --host 127.0.0.1 --port 8070 -ngl 99 --ctx-size 8192 --threads 2 --log-file "%~dp0faith-emotions-server.log"
) else (
  echo GGUF server is already responding.
)

echo.
if /I "%FAITH_EMOTION_BRIDGE_MODE%"=="1" (
  echo Starting the GGUF bridge for Faith's HTML frontend.
  echo Prompts and replies will be printed in this console window.
  echo.
  set "FAITH_EMOTION_BRIDGE_PORT=8071"
  set "FAITH_TEST_TIMEOUT=300"
  ruby.exe "%TEST_RB%" --bridge
  set "RESULT=%ERRORLEVEL%"
  echo.
  if not "%RESULT%"=="0" echo Bridge exited with code %RESULT%.
  exit /b %RESULT%
)

echo Starting the interactive direct-model tester.
echo Wait for the model health check, then enter prompts.
echo.
set "FAITH_EMOTION_AI_URL=http://127.0.0.1:8070/v1/chat/completions"
set "FAITH_EMOTION_AI_MODEL=faith-emotions"
set "FAITH_TEST_MAX_TOKENS=180"
set "FAITH_TEST_TIMEOUT=240"
ruby.exe "%TEST_RB%"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Tester exited with code %RESULT%.
pause
exit /b %RESULT%
