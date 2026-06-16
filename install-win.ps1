# ============================================================
# OAT - One-Line Installer for Windows
# ============================================================
# Run this in PowerShell:
#   irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex
#
# Or: powershell -ExecutionPolicy Bypass -File install-win.ps1
# ============================================================

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "  OAT - Office Attendance Tracker" -ForegroundColor Cyan
Write-Host "  One-Line Installer for Windows" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

# --- Configuration ---
$SCRIPT_VERSION = "2.3"
$GITHUB_BASE = "https://tripathigaurav.github.io/OAT"
# Install to %LOCALAPPDATA%\OAT (local path) - NOT Desktop which may be
# synced to OneDrive. Windows blocks scheduled tasks from cloud-synced dirs.
$OAT_DIR = "$env:LOCALAPPDATA\OAT"
$PS_SCRIPT = "auto-attendance.ps1"
$TASK_XML = "auto-attendance-task.xml"

# --- Step 1: Create directory ---
Write-Host "  [1/5] Creating folder: $OAT_DIR"
New-Item -ItemType Directory -Force -Path $OAT_DIR | Out-Null
Write-Host "        Done" -ForegroundColor Green
Write-Host ""

# --- Step 2: Download files ---
Write-Host "  [2/5] Downloading files from GitHub..."
try {
    Invoke-WebRequest -Uri "$GITHUB_BASE/$PS_SCRIPT" -OutFile "$OAT_DIR\$PS_SCRIPT" -ErrorAction Stop
    Write-Host "        Downloaded $PS_SCRIPT" -ForegroundColor Green
} catch {
    Write-Host "        Failed to download $PS_SCRIPT" -ForegroundColor Red
    Write-Host "        Please check your internet connection." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

try {
    Invoke-WebRequest -Uri "$GITHUB_BASE/$TASK_XML" -OutFile "$OAT_DIR\$TASK_XML" -ErrorAction Stop
    Write-Host "        Downloaded $TASK_XML" -ForegroundColor Green
} catch {
    Write-Host "        Failed to download $TASK_XML" -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host ""

# --- Step 3: Fix path in XML ---
Write-Host "  [3/5] Configuring task with your path..."
$xmlContent = Get-Content "$OAT_DIR\$TASK_XML" -Raw -Encoding UTF8
# Replace all occurrences of the placeholder path with the real install path
$xmlContent = $xmlContent -replace [regex]::Escape('%LOCALAPPDATA%\OAT'), $OAT_DIR
$xmlContent = $xmlContent -replace 'C:\\Users\\YOUR_USERNAME\\Desktop\\OAT', $OAT_DIR
$xmlContent = $xmlContent -replace '\$env:USERPROFILE\\Desktop\\OAT', $OAT_DIR
$xmlContent | Set-Content "$OAT_DIR\$TASK_XML" -Encoding UTF8
Write-Host "        Done" -ForegroundColor Green
Write-Host ""

# --- Step 4: Install Scheduled Task ---
Write-Host "  [4/5] Installing Scheduled Task..."

$taskInstalled = $false

# Pre-check: Ensure WLAN event log is enabled (EventTrigger needs it)
try {
    $wlanLog = Get-WinEvent -ListLog "Microsoft-Windows-WLAN-AutoConfig/Operational" -ErrorAction Stop
    if (-not $wlanLog.IsEnabled) {
        Write-Host "        Enabling WLAN event log..." -ForegroundColor Yellow
        try { wevtutil sl "Microsoft-Windows-WLAN-AutoConfig/Operational" /e:true 2>$null } catch {}
    }
} catch {
    Write-Host "        Note: WLAN event log not accessible (non-admin)" -ForegroundColor Gray
}

# Method 1: schtasks.exe with full XML (EventTrigger + LogonTrigger)
try {
    $result = schtasks /Create /TN "OAT-WiFiAttendance" /XML "$OAT_DIR\$TASK_XML" /F 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "        Scheduled Task installed (WiFi trigger + logon)!" -ForegroundColor Green
        $taskInstalled = $true
    } else {
        Write-Host "        Method 1 (schtasks /XML): $result" -ForegroundColor Gray
    }
} catch {
    Write-Host "        Method 1 (schtasks /XML): $($_.Exception.Message)" -ForegroundColor Gray
}

# Method 2: Register-ScheduledTask with full XML
if (-not $taskInstalled) {
    try {
        Register-ScheduledTask -Xml (Get-Content "$OAT_DIR\$TASK_XML" -Raw -Encoding UTF8) `
            -TaskName "OAT-WiFiAttendance" -Force -ErrorAction Stop | Out-Null
        Write-Host "        Scheduled Task installed (WiFi trigger + logon)!" -ForegroundColor Green
        $taskInstalled = $true
    } catch {
        Write-Host "        Method 2 (Register XML): $($_.Exception.Message)" -ForegroundColor Gray
    }
}

# Method 3: Fallback - Create task programmatically WITHOUT EventTrigger
# EventTrigger often fails on corporate PCs (needs admin or WLAN log enabled)
# This uses LogonTrigger + repeating every 15 min as a reliable alternative
if (-not $taskInstalled) {
    Write-Host "        WiFi event trigger unavailable, using logon + interval mode..." -ForegroundColor Yellow
    try {
        $action = New-ScheduledTaskAction `
            -Execute "powershell.exe" `
            -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$OAT_DIR\$PS_SCRIPT`"" `
            -WorkingDirectory $OAT_DIR

        # Trigger at logon (30s delay) with repetition every 15 min for 12 hours
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $trigger.Delay = "PT30S"
        try {
            $repSource = New-ScheduledTaskTrigger -Once -At "00:00" `
                -RepetitionInterval (New-TimeSpan -Minutes 15) `
                -RepetitionDuration (New-TimeSpan -Hours 12)
            $trigger.Repetition = $repSource.Repetition
        } catch {
            # Repetition not supported on this OS version - logon-only is fine,
            # the script's lock file prevents double-marking anyway
        }

        $settings = New-ScheduledTaskSettingsSet `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName "OAT-WiFiAttendance" `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -RunLevel Limited `
            -Force -ErrorAction Stop | Out-Null

        Write-Host "        Scheduled Task installed (logon + every 15 min)!" -ForegroundColor Green
        $taskInstalled = $true
    } catch {
        Write-Host "        Method 3 (programmatic): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Method 4: Last resort - schtasks.exe simple command (no XML, most compatible)
if (-not $taskInstalled) {
    try {
        $psCmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$OAT_DIR\$PS_SCRIPT`""
        $result = schtasks /Create /TN "OAT-WiFiAttendance" /TR $psCmd /SC ONLOGON /DELAY 0001:00 /F 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "        Scheduled Task installed (logon only)!" -ForegroundColor Green
            $taskInstalled = $true
        } else {
            Write-Host "        Method 4 (schtasks /SC): $result" -ForegroundColor Red
        }
    } catch {
        Write-Host "        Method 4 (schtasks /SC): $($_.Exception.Message)" -ForegroundColor Red
    }
}

if (-not $taskInstalled) {
    Write-Host ""
    Write-Host "        All methods failed. Try running PowerShell as Admin" -ForegroundColor Red
    Write-Host "        and re-run the installer." -ForegroundColor Red
}
Write-Host ""

# --- Step 5: Verify & Summary ---
Write-Host "  [5/5] Installation Summary..."
$task = Get-ScheduledTask -TaskName "OAT-WiFiAttendance" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "        Scheduled Task is registered!" -ForegroundColor Green
    $fullySetup = $true
} else {
    Write-Host "        Running in manual mode" -ForegroundColor Yellow
    $fullySetup = $false
}
Write-Host ""

# --- Summary & Next Steps ---
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "  INSTALLATION SUMMARY" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Files installed to: $OAT_DIR" -ForegroundColor White

if ($fullySetup) {
    Write-Host "  Scheduled Task: OAT-WiFiAttendance (ACTIVE)" -ForegroundColor Green
    Write-Host "  Status: COMPLETE - Auto-tracking enabled" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Your attendance WILL auto-mark when you connect to" -ForegroundColor White
    Write-Host "  office WiFi. No further action needed!" -ForegroundColor White
} else {
    Write-Host "  Status: Ready - Manual mode" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Scheduled task could not be installed." -ForegroundColor Yellow
    Write-Host "  Try: Run PowerShell as Administrator and re-run:" -ForegroundColor Yellow
    Write-Host '  powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"' -ForegroundColor White
    Write-Host ""
    Write-Host "  You can still use the app:" -ForegroundColor White
    Write-Host "     * Mark days manually on the calendar" -ForegroundColor White
    Write-Host "     * Run auto-attendance.ps1 --backfill to scan WiFi history" -ForegroundColor White
}

Write-Host ""
Write-Host "  WiFi trigger: 'corp' network (NetApp DNS required)" -ForegroundColor White
Write-Host "  Tracker: $GITHUB_BASE" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""

# Open the tracker
$trackerUrl = "$GITHUB_BASE/?automark=true" + "&scriptver=$SCRIPT_VERSION"
Start-Process $trackerUrl
Write-Host "  Opening tracker in browser..."
Write-Host ""
