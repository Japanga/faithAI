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

set "ROOT=%~dp0"
set "LLAMA=%ROOT%llama-server.exe"
if not exist "%LLAMA%" set "LLAMA=%ROOT%bin\llama-server.exe"
set "MODEL=%ROOT%models\qwen2-0_5b-instruct-q4_k_m.gguf"

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

rem Give llama-server a moment to initialize. Faith also checks /health itself.
timeout /t 3 /nobreak >nul

echo Starting Faith on 127.0.0.1:4567...
start "Faith Ruby :4567" /min cmd /c "bundle exec ruby server.rb > "%ROOT%faith-server.log" 2>&1"

timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:4567

echo.
echo Faith is starting.
echo.
echo DIRECT CHAT RELAY: Browser :4567 -> Qwen :8080 -> Browser
echo Relay logs: %ROOT%faith-server.log
echo.
echo Faith log: %ROOT%faith-server.log
echo Qwen log:  %ROOT%qwen-server.log
echo.
echo Normal chat path:
echo   Browser :4567 -> /api/qwen-chat -> Qwen :8080 -> Faith -> Browser
echo.
echo This window can be closed. The two minimized processes will continue running.
endlocal
exit /b 0
