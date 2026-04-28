@echo off
REM ============================================================
REM OAT - One-Click Installer for Windows
REM ============================================================
REM Just double-click this file to set up auto-attendance!
REM ============================================================

title OAT - Office Attendance Tracker Installer
cls
echo.
echo  ======================================================
echo  📅 OAT — Office Attendance Tracker
echo  🚀 One-Click Installer for Windows
echo  ======================================================
echo.

set GITHUB_BASE=https://tripathigaurav.github.io/OAT
set OAT_DIR=%USERPROFILE%\Desktop\OAT
set PS_SCRIPT=auto-attendance.ps1
set TASK_XML=auto-attendance-task.xml

REM --- Step 1: Create directory ---
echo  [1/5] Creating folder: %OAT_DIR%
if not exist "%OAT_DIR%" mkdir "%OAT_DIR%"
echo         Done
echo.

REM --- Step 2: Download files ---
echo  [2/5] Downloading files from GitHub...

powershell -Command "Invoke-WebRequest -Uri '%GITHUB_BASE%/%PS_SCRIPT%' -OutFile '%OAT_DIR%\%PS_SCRIPT%'" 2>nul
if %errorlevel%==0 (
    echo         Downloaded %PS_SCRIPT%
) else (
    echo         Failed to download %PS_SCRIPT%
    echo         Please check your internet connection.
    pause
    exit /b 1
)

powershell -Command "Invoke-WebRequest -Uri '%GITHUB_BASE%/%TASK_XML%' -OutFile '%OAT_DIR%\%TASK_XML%'" 2>nul
if %errorlevel%==0 (
    echo         Downloaded %TASK_XML%
) else (
    echo         Failed to download %TASK_XML%
    pause
    exit /b 1
)
echo.

REM --- Step 3: Update XML path ---
echo  [3/5] Configuring task with your path...
powershell -Command "(Get-Content '%OAT_DIR%\%TASK_XML%') -replace 'C:\\Users\\YOUR_USERNAME\\Desktop\\OAT', '%OAT_DIR%' | Set-Content '%OAT_DIR%\%TASK_XML%'"
echo         Done
echo.

REM --- Step 4: Install Scheduled Task ---
echo  [4/5] Installing Scheduled Task...
echo         (This may ask for Admin permission)
powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -Command Register-ScheduledTask -Xml (Get-Content \"%OAT_DIR%\%TASK_XML%\" | Out-String) -TaskName \"OAT-WiFiAttendance\" -Force' -Verb RunAs -Wait" 2>nul
if %errorlevel%==0 (
    echo         Scheduled Task installed!
) else (
    echo         Note: If you declined Admin prompt, run manually:
    echo         Register-ScheduledTask -TaskName "OAT-WiFiAttendance" ...
)
echo.

REM --- Step 5: Verify ---
echo  [5/5] Verifying installation...
powershell -Command "if (Get-ScheduledTask -TaskName 'OAT-WiFiAttendance' -ErrorAction SilentlyContinue) { Write-Host '        Task is registered!' } else { Write-Host '        Task not found (may need manual setup)' }"
echo.

REM --- Done! ---
echo  ======================================================
echo  🎉 SETUP COMPLETE!
echo  ======================================================
echo.
echo  Files installed to: %OAT_DIR%
echo  Scheduled Task: OAT-WiFiAttendance
echo  WiFi trigger: "corp" network (NetApp)
echo.
echo  Your attendance will auto-mark every time
echo  you connect to office WiFi. No action needed!
echo.
echo  Tracker: %GITHUB_BASE%
echo  ======================================================
echo.

REM Open the tracker
start "" "%GITHUB_BASE%/?automark=true"
echo  Opening tracker in browser...
echo.
pause
