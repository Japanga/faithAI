@echo off
setlocal
 title Faith - Qwen3 Story 512-token API Test
set "ROOT=%~dp0"
set "PS1=%ROOT%Test_Qwen3_Story_512.ps1"
if not exist "%PS1%" (
  echo ERROR: Missing test script: "%PS1%"
  pause
  exit /b 2
)
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows PowerShell was not found.
  pause
  exit /b 3
)
echo.
echo This test sends ONE direct request to http://127.0.0.1:8072/v1/chat/completions.
echo It does not modify Faith, Ruby, normal Qwen chat, or the running model server.
echo Ensure the Story llama-server is running on port 8072 first.
echo This test uses live SSE streaming and has NO request timeout.
echo Press Ctrl+C to stop it manually if needed.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo TEST PASSED. See the test log and raw response in the logs folder.
) else (
  echo TEST FAILED with exit code %RC%. See the test log in the logs folder.
)
echo.
pause
exit /b %RC%
