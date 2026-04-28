# ============================================================
# OAT - Office Attendance Tracker — WiFi Auto-Mark Script
# For Windows (PowerShell)
# ============================================================
# This script checks if you're connected to the office WiFi
# and automatically opens the attendance tracker to mark today.
#
# Setup:
#   1. Right-click this file → Run with PowerShell (to test)
#   2. Import the scheduled task (see auto-attendance-task.xml)
#
# Or run manually: powershell -ExecutionPolicy Bypass -File auto-attendance.ps1
# ============================================================

# --- Configuration ---
$OFFICE_WIFI = "corp"
$OFFICE_DNS_DOMAIN = "wlan.netapp.com"
$TRACKER_URL = "https://tripathigaurav.github.io/OAT/?automark=true"
$LOG_FILE = "$PSScriptRoot\auto-attendance.log"
$LOCK_FILE = "$env:TEMP\oat-automark-$(Get-Date -Format 'yyyy-MM-dd').lock"

# --- Functions ---
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $Message" | Out-File -Append -FilePath $LOG_FILE
}

function Get-WiFiSSID {
    try {
        $output = netsh wlan show interfaces | Select-String "^\s+SSID\s+:" | Select-Object -First 1
        if ($output) {
            return ($output -replace '^\s+SSID\s+:\s+', '').Trim()
        }
    } catch {}
    return ""
}

function Get-DNSDomains {
    try {
        $adapters = Get-DnsClientGlobalSetting
        return $adapters.SuffixSearchList
    } catch {}
    try {
        $output = ipconfig /all | Select-String "DNS Suffix Search List|Connection-specific DNS Suffix"
        return ($output -replace '.*:\s+', '').Trim()
    } catch {}
    return @()
}

# --- Main Logic ---

$onOfficeNet = $false
$detectedVia = ""

# Method 1 (Primary): Check DNS search domain
$dnsDomains = Get-DNSDomains
foreach ($domain in $dnsDomains) {
    if ($domain -like "*$OFFICE_DNS_DOMAIN*") {
        $onOfficeNet = $true
        $detectedVia = "DNS domain ($domain)"
        break
    }
}

# Method 2 (Fallback): Check WiFi SSID
if (-not $onOfficeNet) {
    $currentWifi = Get-WiFiSSID
    if ($currentWifi) {
        Write-Log "Current WiFi SSID: '$currentWifi'"
        if ($currentWifi -ieq $OFFICE_WIFI) {
            $onOfficeNet = $true
            $detectedVia = "WiFi SSID ($currentWifi)"
        }
    }
}

if (-not $onOfficeNet) {
    Write-Log "Not on office network. DNS domains: $($dnsDomains -join ', '). Skipping."
    exit 0
}

Write-Log "Office network detected via: $detectedVia"

# Check if already marked today
if (Test-Path $LOCK_FILE) {
    Write-Log "Already auto-marked today. Lock file exists."
    exit 0
}

Write-Log "Connected to office WiFi. Triggering auto-mark..."

# Dry-run mode
if ($args -contains "--dry-run") {
    Write-Host "========================================="
    Write-Host "  OAT DRY RUN - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "========================================="
    Write-Host ""
    Write-Host "  Network Detection:"
    Write-Host "     Detected via: $detectedVia"
    Write-Host "     DNS domains:  $($dnsDomains -join ', ')"
    Write-Host ""
    Write-Host "  What would happen:"
    Write-Host "     Create lock file: $LOCK_FILE"
    Write-Host "     Open tracker:     $TRACKER_URL"
    Write-Host "     Auto-mark today:  $(Get-Date -Format 'yyyy-MM-dd')"
    Write-Host ""
    Write-Host "  DRY RUN PASSED - Everything looks good!"
    Write-Host "========================================="
    Write-Log "Dry run completed successfully."
    exit 0
}

# Create lock file
New-Item -Path $LOCK_FILE -ItemType File -Force | Out-Null

# Open tracker in default browser
Start-Process $TRACKER_URL

Write-Log "Opened attendance tracker with auto-mark. Done!"

# Clean up old lock files (older than 2 days)
Get-ChildItem "$env:TEMP\oat-automark-*.lock" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-2) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit 0
