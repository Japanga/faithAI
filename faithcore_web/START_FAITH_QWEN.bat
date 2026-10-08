@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ================================================
echo FAITH + LOCAL QWEN STARTUP
echo ================================================
echo.

rem Kill stale Faith/Qwen listeners so the files in THIS folder are definitely
rem the processes serving :4567 and :8080. This prevents an older server.rb
rem from returning the HTML page instead of the JSON relay response.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4567" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8090" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1

set "ROOT=%~dp0"
set "LLAMA=%ROOT%llama-server.exe"
if not exist "%LLAMA%" set "LLAMA=%ROOT%bin\llama-server.exe"
set "MODEL=%ROOT%models\qwen2-0_5b-instruct-q4_k_m.gguf"
set "CODER_MODEL=%ROOT%models\qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
rem Optional override if the coding GGUF is stored somewhere else.
if defined FAITH_CODER_MODEL set "CODER_MODEL=%FAITH_CODER_MODEL%"

if not exist "%LLAMA%" (
  echo ERROR: llama-server.exe was not found.
  echo Put llama-server.exe beside this BAT or in .\bin\
  pause
  exit /b 1
)

if not exist "%MODEL%" (
  echo ERROR: Qwen model was not found:
  echo %MODEL%
  echo Put qwen2-0_5b-instruct-q4_k_m.gguf in .\models\
  pause
  exit /b 1
)

set "FAITH_LOCAL_AI_URL=http://127.0.0.1:8080/v1/chat/completions"
set "FAITH_LOCAL_AI_MODEL=local"
set "FAITH_LOCAL_AI_TIMEOUT=600"
set "FAITH_LOCAL_AI_OPEN_TIMEOUT=30"
set "FAITH_LOCAL_CONTEXT=4096"

if exist "%ROOT%qwen-server.log" del /q "%ROOT%qwen-server.log"
if exist "%ROOT%coder-server.log" del /q "%ROOT%coder-server.log"
if exist "%ROOT%faith-server.log" del /q "%ROOT%faith-server.log"

rem The Ruby server serves the WEB UI from .\public, not from the Faith root.
rem Keep the frontend used by the browser synchronized with the relay app.js.
if not exist "%ROOT%public" mkdir "%ROOT%public"
if exist "%ROOT%app.js" copy /Y "%ROOT%app.js" "%ROOT%public\app.js" >nul
if not exist "%ROOT%public\index.html" if exist "%ROOT%index.html" copy /Y "%ROOT%index.html" "%ROOT%public\index.html" >nul

rem Prevent a cached old frontend from hiding the new relay. Add a harmless
rem cache-busting query to the script tag if an index.html contains app.js.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%ROOT%public\index.html'; if (Test-Path $p) { $s=Get-Content -Raw $p; $s=$s -replace 'app\.js(?:\?v=[^"'' ]+)?', 'app.js?v=53'; Set-Content -NoNewline -Encoding UTF8 $p $s }" >nul 2>&1

echo Starting llama-server on 127.0.0.1:8080...
start "Faith Qwen :8080" /min cmd /c ""%LLAMA%" --model "%MODEL%" --host 127.0.0.1 --port 8080 --ctx-size 4096 > "%ROOT%qwen-server.log" 2>&1"

rem Start the dedicated coding model on :8090 using the EXACT performance settings
rem from Test_Qwen2.5-Coder-0.5B-Instruct_Q4_K_M_4Threads_KVQ8_GPU99_Win7.bat.
if exist "%CODER_MODEL%" (
  echo Starting Faith coding GGUF on 127.0.0.1:8090 with the tested performance settings...
  start "Faith Coding GGUF :8090" /min cmd /c ""%LLAMA%" --model "%CODER_MODEL%" --host 127.0.0.1 --port 8090 --alias coding-local --ctx-size 4096 --threads 4 --parallel 1 --batch-size 128 --ubatch-size 64 --cache-type-k q8_0 --cache-type-v q8_0 --n-gpu-layers 99 --cache-ram 0 > "%ROOT%coder-server.log" 2>&1"
) else (
  echo ERROR: Coding GGUF was not found:
  echo %CODER_MODEL%
  echo Put qwen2.5-coder-0.5b-instruct-q4_k_m.gguf in .\models\ or set FAITH_CODER_MODEL.
  pause
  exit /b 1
)

rem Give both model servers a moment to initialize. Faith checks their health itself.
timeout /t 3 /nobreak >nul

echo Starting Faith on 127.0.0.1:4567...
start "Faith Ruby :4567" /min cmd /c "bundle exec ruby server.rb > "%ROOT%faith-server.log" 2>&1"

timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:4567

echo.
echo Faith is starting.
echo.
echo DIRECT CHAT RELAY: Browser :4567 -> Qwen :8080 -> Browser
echo TROUBLESHOOTING RELAY: Faith -> Coding GGUF :8090 -> Browser
echo Relay logs: %ROOT%faith-server.log
echo.
echo Faith log: %ROOT%faith-server.log
echo Qwen log:  %ROOT%qwen-server.log
echo Coder log: %ROOT%coder-server.log
echo.
echo Normal chat path:
echo   Browser :4567 -> /api/qwen-chat -> Qwen :8080 -> Faith -> Browser
echo.
echo This window can be closed. The two minimized processes will continue running.
endlocal
exit /b 0
