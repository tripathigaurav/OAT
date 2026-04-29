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
$OAT_DIR = "$env:USERPROFILE\Desktop\OAT"
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
$xmlContent = $xmlContent -replace 'C:\\Users\\YOUR_USERNAME\\Desktop\\OAT', $OAT_DIR
$xmlContent | Set-Content "$OAT_DIR\$TASK_XML"
Write-Host "        Done" -ForegroundColor Green
Write-Host ""

# --- Step 4: Install Scheduled Task ---
Write-Host "  [4/5] Installing Scheduled Task..."
Write-Host "        (This may ask for Admin permission)" -ForegroundColor Yellow

try {
    # Try direct registration first (works if already admin)
    Register-ScheduledTask -Xml (Get-Content "$OAT_DIR\$TASK_XML" | Out-String) -TaskName "OAT-WiFiAttendance" -Force -ErrorAction Stop | Out-Null
    Write-Host "        Scheduled Task installed!" -ForegroundColor Green
} catch {
    # Need elevation — launch admin PowerShell
    try {
        $regCmd = "Register-ScheduledTask -Xml (Get-Content '$OAT_DIR\$TASK_XML' | Out-String) -TaskName 'OAT-WiFiAttendance' -Force"
        Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -Command $regCmd" -Verb RunAs -Wait -ErrorAction Stop
        Write-Host "        Scheduled Task installed (via Admin)!" -ForegroundColor Green
    } catch {
        Write-Host "        Could not register task. You may need to run manually:" -ForegroundColor Yellow
        Write-Host "        Register-ScheduledTask -Xml (Get-Content '$OAT_DIR\$TASK_XML' | Out-String) -TaskName 'OAT-WiFiAttendance' -Force" -ForegroundColor Gray
    }
}
Write-Host ""

# --- Step 5: Verify ---
Write-Host "  [5/5] Verifying installation..."
$task = Get-ScheduledTask -TaskName "OAT-WiFiAttendance" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "        Task is registered!" -ForegroundColor Green
} else {
    Write-Host "        Task not found (may need admin re-run)" -ForegroundColor Yellow
}
Write-Host ""

# --- Done! ---
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Files installed to: $OAT_DIR" -ForegroundColor White
Write-Host "  Scheduled Task: OAT-WiFiAttendance" -ForegroundColor White
Write-Host "  WiFi trigger: 'corp' network (NetApp)" -ForegroundColor White
Write-Host ""
Write-Host "  Your attendance will auto-mark every time" -ForegroundColor White
Write-Host "  you connect to office WiFi. No action needed!" -ForegroundColor White
Write-Host ""
Write-Host "  Tracker: $GITHUB_BASE" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""

# Open the tracker
Start-Process "$GITHUB_BASE/?automark=true"
Write-Host "  Opening tracker in browser..."
Write-Host ""
