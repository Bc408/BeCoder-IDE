@echo off
setlocal
if "%~1"=="" (
  echo BeCoder Runner requires a C or C++ source path.
  exit /b 2
)
set "BECODER_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%BECODER_POWERSHELL%" (
  echo BeCoder Runner could not find Windows PowerShell.
  exit /b 2
)
if /I "%~2"=="-WithInput" (
  "%BECODER_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BECODER_RUNNER_SCRIPT_PATH%" -StatePath "%BECODER_RUNNER_STATE_PATH%" -SourcePath "%~1" -WithInput
) else if not "%~2"=="" (
  echo BeCoder Runner accepts only the optional -WithInput switch.
  exit /b 2
) else (
  "%BECODER_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BECODER_RUNNER_SCRIPT_PATH%" -StatePath "%BECODER_RUNNER_STATE_PATH%" -SourcePath "%~1"
)
exit /b %ERRORLEVEL%
