@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Faith - Qwen3 Story (port 8072) - Story Relay Diagnostics

REM Keep this BAT beside the Faith project and its .\models folder.
REM Uses the Windows 7-compatible llama-server.exe supplied with your setup.
REM Writes timestamped launcher and server logs to .\logs\qwen3-story-8072-YYYYMMDD-HHMMSS.log

set "ROOT=%~dp0"
set "MODEL_DIR=%ROOT%models"
set "LOG_DIR=%ROOT%logs"
set "SERVER="
set "MODEL="
set "PORT=8072"

if not exist "%LOG_DIR%\" mkdir "%LOG_DIR%" 2>nul

REM Build a timestamp for the log filename without relying on PowerShell.
set "STAMP="
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul ^| find "="') do set "STAMP=%%I"
if defined STAMP (
    set "STAMP=!STAMP:~0,8!-!STAMP:~8,6!"
) else (
    set "STAMP=%DATE%_%TIME%"
    set "STAMP=!STAMP:/=-!"
    set "STAMP=!STAMP:\=-!"
    set "STAMP=!STAMP::=-!"
    set "STAMP=!STAMP: =0!"
)
set "LOG=%LOG_DIR%\qwen3-story-%PORT%-!STAMP!.log"

call :log ============================================================
call :log Faith Qwen3 Story GPU-Optimized Launcher
call :log Started: %DATE% %TIME%
call :log Root: "%ROOT%"
call :log Port: %PORT%
call :log ============================================================

echo.
echo Faith - Qwen3 Short Story GPU-Optimized Launcher
echo Port: %PORT%
echo Log:  "%LOG%"
echo.

if not exist "%MODEL_DIR%\" (
    call :log [ERROR] Models folder not found: "%MODEL_DIR%"
    goto :fail
)

REM Match the requested model by its expected filename terms.
for /r "%MODEL_DIR%" %%F in (*Qwen3*Short*Story*4B*.gguf) do (
    if not defined MODEL set "MODEL=%%~fF"
)

if not defined MODEL (
    call :log [ERROR] No matching GGUF found in "%MODEL_DIR%".
    call :log Expected filename containing Qwen3, Short, Story, and 4B.
    goto :fail
)
call :log [OK] Model: "%MODEL%"

REM Use the Windows 7-compatible llama-server.exe from this project folder,
REM or common folders. No llama.cpp installation/build is assumed.
if exist "%ROOT%llama-server.exe" set "SERVER=%ROOT%llama-server.exe"
if not defined SERVER if exist "%ROOT%bin\llama-server.exe" set "SERVER=%ROOT%bin\llama-server.exe"
if not defined SERVER if exist "%ROOT%llama\llama-server.exe" set "SERVER=%ROOT%llama\llama-server.exe"
if not defined SERVER if exist "%ROOT%server\llama-server.exe" set "SERVER=%ROOT%server\llama-server.exe"

REM Finally check PATH for the already-installed executable.
if not defined SERVER (
    where llama-server.exe >nul 2>nul
    if not errorlevel 1 set "SERVER=llama-server.exe"
)

if not defined SERVER (
    call :log [ERROR] Windows-compatible llama-server.exe not found.
    call :log Looked beside BAT, in .\bin, .\llama, .\server, and PATH.
    goto :fail
)
call :log [OK] Server executable: "%SERVER%"

REM Record basic environment information useful when diagnosing compatibility.
call :log Windows version:
ver >> "%LOG%" 2>&1
call :log Server version output:
"%SERVER%" --version >> "%LOG%" 2>&1
call :log Version command exit code: !ERRORLEVEL!

call :log Starting server: context=4096, threads=2, parallel=1, GPU layers=99, batch=256, ubatch=128, KV cache=Q8_0
call :log Server stdout and stderr will be appended to this log.
echo Starting server with GPU offload enabled (if supported). Output is saved to:
echo "%LOG%"
echo.
echo Keep this window open while the server runs.
echo Press Ctrl+C to stop the server.
echo If startup reports an unsupported GPU/cache option, see the log for the exact error.
echo.

REM Redirect both standard output and errors into the diagnostic log.
"%SERVER%" --model "%MODEL%" --host 127.0.0.1 --port %PORT% --ctx-size 4096 --cache-type-k q8_0 --cache-type-v q8_0 >> "%LOG%" 2>&1
set "RC=!ERRORLEVEL!"

call :log Server process exited with code !RC!
call :log Ended: %DATE% %TIME%

echo.
echo Server exited with code !RC!.
echo Diagnostic log:
echo "%LOG%"
echo.
echo If it failed, send this log file back for diagnosis.
pause
exit /b !RC!

:fail
call :log Launcher stopped because of the error above.
echo.
echo Launcher could not start. See the log:
echo "%LOG%"
pause
exit /b 1

:log
echo [%DATE% %TIME%] %*>> "%LOG%"
echo %*
exit /b 0
