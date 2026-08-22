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
$SCRIPT_VERSION = "2.4"
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

# Encoding matters here, and getting it wrong is what made both XML methods
# fail with "The task XML is malformed".
#
# schtasks /XML reads a FILE. Set-Content -Encoding UTF8 on PowerShell 5.1
# emits UTF-8 *with BOM*, which schtasks rejects at (1,2). Writing UTF-16LE
# and declaring encoding="UTF-16" keeps the declaration consistent with the
# actual bytes, which is the combination schtasks reliably accepts.
$xmlFile = "$OAT_DIR\$TASK_XML"
($xmlContent -replace 'encoding="UTF-8"', 'encoding="UTF-16"') |
    Set-Content $xmlFile -Encoding Unicode

# Register-ScheduledTask -Xml takes a .NET STRING, which is UTF-16 in memory.
# A declaration claiming UTF-8 makes the parser fail with "unable to switch
# the encoding" at (1,40) - the end of the declaration. Strip it entirely.
$xmlForApi = $xmlContent -replace '^\s*<\?xml[^>]*\?>\s*', ''

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

# Method 2: Register-ScheduledTask with full XML (declaration stripped)
if (-not $taskInstalled) {
    try {
        Register-ScheduledTask -Xml $xmlForApi `
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

# Method 5: No Scheduled Task at all - install a session watcher.
# Corporate policy commonly denies task creation ("Access is denied" from both
# Register-ScheduledTask and schtasks). The per-user Startup folder needs no
# admin rights.
#
# A Startup entry that runs ONCE would barely help: Startup fires on sign-in,
# and closing a laptop lid then unlocking it is not a sign-in. Most people go
# weeks without a real logon, so a one-shot check would run about as often as
# Windows Update forces a restart.
#
# Instead the Startup entry launches a watcher that stays alive for the whole
# session and re-checks every 15 minutes. A session survives sleep/wake, so it
# is still running when the laptop is opened at the office days later. It exits
# on its own at sign-out. The daily lock file already prevents double-marking,
# and it invokes auto-attendance.ps1 unchanged - no duplicated detection logic.
$startupInstalled = $false
if (-not $taskInstalled) {
    try {
        $watcherPath = "$OAT_DIR\oat-watcher.ps1"
        $watcherLog  = "$OAT_DIR\watcher.log"
        # The watcher logs its own start and any failure. Without that, a
        # machine where AppLocker/WDAC blocks running .ps1 files from disk
        # would loop forever doing nothing, and we'd report success.
        $watcher = @"
# OAT session watcher - installed because Scheduled Tasks are blocked here.
#
# Two triggers:
#   1. Workstation unlock (Win+L unlock, or opening the laptop lid). This is
#      the moment you actually arrive at your desk, so it is the useful one.
#      Needs no admin rights - it is a per-session .NET notification.
#   2. A 15 minute timer, as a floor in case unlock events are unavailable.
#
# Sign-in alone would be near useless: unlocking a laptop is NOT a sign-in, and
# most people go weeks without a real one.
`$ErrorActionPreference = 'Stop'
`$log = '$watcherLog'
function Note(`$m) {
    try { "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] `$m" | Out-File -Append -FilePath `$log -Encoding utf8 } catch { }
}
# One watcher per session; a second Startup run just exits quietly.
`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\OAT-Watcher')
if (-not `$mutex.WaitOne(0)) { Note 'another watcher already running - exiting'; exit }
Note "started (pid `$PID)"
`$target = '$OAT_DIR\$PS_SCRIPT'

# Subscribe to lock/unlock. If this fails for any reason we degrade to the
# timer rather than dying.
`$useEvents = `$false
try {
    Register-ObjectEvent -InputObject ([Microsoft.Win32.SystemEvents]) ``
        -EventName SessionSwitch -SourceIdentifier OatSession -ErrorAction Stop | Out-Null
    `$useEvents = `$true
    Note 'unlock detection enabled'
} catch {
    Note "unlock detection unavailable, using timer only: `$(`$_.Exception.Message)"
}

function Wait-Trigger {
    if (-not `$useEvents) { Start-Sleep -Seconds 900; return }
    `$deadline = (Get-Date).AddSeconds(900)
    while ((Get-Date) -lt `$deadline) {
        `$remain = [int][math]::Max(1, (`$deadline - (Get-Date)).TotalSeconds)
        `$ev = Wait-Event -SourceIdentifier OatSession -Timeout `$remain
        if (-not `$ev) { return }   # timed out - do the periodic check
        `$reason = [string]`$ev.SourceEventArgs.Reason
        Remove-Event -EventIdentifier `$ev.EventIdentifier -ErrorAction SilentlyContinue
        if (`$reason -eq 'SessionUnlock') { Note 'unlock detected'; return }
        # SessionLock / remote connect / etc: keep waiting, do not re-check
    }
}

`$fails = 0
while (`$true) {
    try {
        # Run as a CHILD PROCESS, not `& `$target. auto-attendance.ps1 ends every
        # path with 'exit 0'; invoking it in-process relies on exit being scoped
        # to the script, and if that assumption is wrong the watcher dies after
        # one check and silently stops. A child process cannot kill its parent,
        # so this removes the question entirely. Cost is one short-lived
        # powershell every 15 minutes, which is nothing.
        # Single quoted string, not an array: Start-Process joins array elements
        # with spaces WITHOUT quoting them, so a username containing a space
        # ("C:\Users\John Smith\...") would split the -File path and fail.
        `$p = Start-Process powershell ``
            -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File ```"`$target```"" ``
            -WindowStyle Hidden -PassThru -Wait
        if (`$p.ExitCode -ne 0) { throw "check exited with code `$(`$p.ExitCode)" }
        `$fails = 0
    } catch {
        `$fails++
        Note "check failed: `$(`$_.Exception.Message)"
        # If the script cannot run at all (blocked by policy), stop after a few
        # tries rather than spinning silently for the rest of the session.
        if (`$fails -ge 3) { Note 'giving up after 3 consecutive failures'; exit 1 }
    }
    Wait-Trigger
}
"@
        [System.IO.File]::WriteAllText($watcherPath, $watcher, [System.Text.Encoding]::ASCII)

        # Startup folder may itself be blocked by GPO - verify, don't assume
        $startupDir = [Environment]::GetFolderPath('Startup')
        $startupCmd = Join-Path $startupDir "OAT-WiFiAttendance.cmd"
        $launcher = "@echo off`r`nstart `"`" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcherPath`"`r`n"
        [System.IO.File]::WriteAllText($startupCmd, $launcher, [System.Text.Encoding]::ASCII)

        if (-not (Test-Path $startupCmd)) {
            Write-Host "        Startup folder is not writable on this machine" -ForegroundColor Red
        } elseif (-not (Test-Path $watcherPath)) {
            Write-Host "        Could not write the watcher script" -ForegroundColor Red
        } else {
            # Prove it can actually run here, rather than trusting it will
            Remove-Item $watcherLog -Force -ErrorAction SilentlyContinue
            Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcherPath`"" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            if ((Test-Path $watcherLog) -and ((Get-Content $watcherLog -Raw) -match 'started')) {
                Write-Host "        Scheduled Task blocked - installed a session watcher instead" -ForegroundColor Yellow
                Write-Host "        Checks when you unlock your screen, plus every 15 min" -ForegroundColor Gray
                $startupInstalled = $true
            } else {
                Write-Host "        Watcher was installed but did not start - scripts may be" -ForegroundColor Red
                Write-Host "        blocked by policy (AppLocker). Manual mode it is." -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "        Method 5 (session watcher): $($_.Exception.Message)" -ForegroundColor Red
    }
}

if (-not $taskInstalled -and -not $startupInstalled) {
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
} elseif ($startupInstalled) {
    Write-Host "  Session watcher: installed (no admin needed)" -ForegroundColor Green
    Write-Host "  Status: ACTIVE - checks every 15 minutes" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Your company's policy blocks Scheduled Tasks, so OAT runs a" -ForegroundColor White
    Write-Host "  small background check instead. It checks the moment you" -ForegroundColor White
    Write-Host "  unlock your screen - so opening your laptop at the office is" -ForegroundColor White
    Write-Host "  enough - and again every 15 minutes as a backstop." -ForegroundColor White
} else {
    Write-Host "  Status: Ready - Manual mode" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Scheduled task could not be installed." -ForegroundColor Yellow
    Write-Host "  Try: Run PowerShell as Administrator and re-run:" -ForegroundColor Yellow
    Write-Host '  powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"' -ForegroundColor White
}
Write-Host ""
Write-Host "  Verify detection any time:" -ForegroundColor White
Write-Host "     powershell -ExecutionPolicy Bypass -File `"$OAT_DIR\$PS_SCRIPT`" --dry-run" -ForegroundColor Gray

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
