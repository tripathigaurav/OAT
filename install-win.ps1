# ============================================================
# OAT — One-Line Installer for Windows
# ============================================================
# Run this in PowerShell:
#   irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex
#
# Or: powershell -ExecutionPolicy Bypass -File install-win.ps1
# ============================================================

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "  OAT — Office Attendance Tracker" -ForegroundColor Cyan
Write-Host "  One-Line Installer for Windows" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

# --- Configuration ---
$GITHUB_BASE = "https://tripathigaurav.github.io/OAT"
# Install to %LOCALAPPDATA%\OAT (local path) — NOT Desktop which may be
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
$xmlContent = Get-Content "$OAT_DIR\$TASK_XML" -Raw
$xmlContent = $xmlContent -replace '%LOCALAPPDATA%\\OAT', $OAT_DIR
$xmlContent = $xmlContent -replace 'C:\\Users\\YOUR_USERNAME\\Desktop\\OAT', $OAT_DIR
$xmlContent = $xmlContent -replace '\$env:USERPROFILE\\Desktop\\OAT', $OAT_DIR
$xmlContent | Set-Content "$OAT_DIR\$TASK_XML"
Write-Host "        Done" -ForegroundColor Green
Write-Host ""

# --- Step 4: Install Scheduled Task ---
Write-Host "  [4/5] Installing Scheduled Task..."

$taskInstalled = $false

# Method 1: schtasks.exe — works WITHOUT admin for user-level tasks
try {
    $result = schtasks /Create /TN "OAT-WiFiAttendance" /XML "$OAT_DIR\$TASK_XML" /F 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "        Scheduled Task installed!" -ForegroundColor Green
        $taskInstalled = $true
    }
} catch {}

# Method 2: Register-ScheduledTask (may prompt UAC on some systems)
if (-not $taskInstalled) {
    try {
        Register-ScheduledTask -Xml (Get-Content "$OAT_DIR\$TASK_XML" | Out-String) -TaskName "OAT-WiFiAttendance" -Force -ErrorAction Stop | Out-Null
        Write-Host "        Scheduled Task installed!" -ForegroundColor Green
        $taskInstalled = $true
    } catch {}
}

# Method 3: Elevated PowerShell as last resort
if (-not $taskInstalled) {
    Write-Host "        Trying with admin permissions..." -ForegroundColor Yellow
    try {
        $regCmd = "schtasks /Create /TN 'OAT-WiFiAttendance' /XML '$OAT_DIR\$TASK_XML' /F"
        Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -Command $regCmd" -Verb RunAs -Wait -ErrorAction Stop
        $taskInstalled = $true
        Write-Host "        Scheduled Task installed!" -ForegroundColor Green
    } catch {
        Write-Host "        Admin prompt was dismissed or denied." -ForegroundColor Yellow
    }
}
Write-Host ""

# --- Step 5: Verify & Summary ---
Write-Host "  [5/5] Installation Summary..."
$task = Get-ScheduledTask -TaskName "OAT-WiFiAttendance" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "        ✅ Scheduled Task is registered!" -ForegroundColor Green
    $fullySetup = $true
} else {
    Write-Host "        ⚠️  Scheduled Task NOT installed (admin permissions required)" -ForegroundColor Yellow
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
    Write-Host "  Status: COMPLETE - Auto-tracking enabled ✅" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Your attendance WILL auto-mark when you connect to" -ForegroundColor White
    Write-Host "  office WiFi. No further action needed!" -ForegroundColor White
} else {
    Write-Host "  Scheduled Task: ❌ NOT INSTALLED" -ForegroundColor Red
    Write-Host "  Status: PARTIAL - Manual mode only" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ⚡ TO FIX (REQUIRED for auto-tracking):" -ForegroundColor Yellow
    Write-Host "     1. Close PowerShell completely" -ForegroundColor White
    Write-Host "     2. Press Win+R, type 'powershell', and press Ctrl+Shift+Enter" -ForegroundColor White
    Write-Host "     3. Type (or copy-paste) THIS command:" -ForegroundColor White
    Write-Host ""
    Write-Host "        schtasks /Create /TN ""OAT-WiFiAttendance"" /XML ""$OAT_DIR\$TASK_XML"" /F" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "     4. Press Enter and confirm the admin prompt" -ForegroundColor White
    Write-Host ""
    Write-Host "  🔄 Alternatively: You can still use the app!  Just visit:" -ForegroundColor Cyan
    Write-Host "     • Click '▶ Run WiFi Check Now' in Settings to check manually" -ForegroundColor White
    Write-Host "     • Use '📜 Scan WiFi History' to backfill past office days" -ForegroundColor White
    Write-Host "     • Still mark days manually on the calendar" -ForegroundColor White
}

Write-Host ""
Write-Host "  WiFi trigger: 'corp' network (NetApp DNS required)" -ForegroundColor White
Write-Host "  Tracker: $GITHUB_BASE" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""

# Open the tracker with manual_mode parameter
$trackerUrl = "$GITHUB_BASE/?automark=true&manual_mode="
if ($fullySetup) {
    $trackerUrl += "false"  # Scheduled task installed = not manual
} else {
    $trackerUrl += "true"   # Scheduled task not installed = manual mode
}
Start-Process $trackerUrl
Write-Host "  Opening tracker in browser..."
Write-Host ""
