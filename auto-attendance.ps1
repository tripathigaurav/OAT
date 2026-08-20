# ============================================================
# OAT - Office Attendance Tracker - WiFi Auto-Mark Script
# For Windows (PowerShell)
# ============================================================
# This script checks if you're connected to the office WiFi
# and automatically opens the attendance tracker to mark today.
#
# Usage:
#   auto-attendance.ps1                  - Normal mode (auto-mark today)
#   auto-attendance.ps1 --dry-run        - Test without making changes
#
# Setup:
#   1. Right-click this file → Run with PowerShell (to test)
#   2. Import the scheduled task (see auto-attendance-task.xml)
#
# Or run manually: powershell -ExecutionPolicy Bypass -File auto-attendance.ps1
# ============================================================

# --- Configuration ---
$SCRIPT_VERSION = "2.4"
$OFFICE_WIFI = "corp"
$OFFICE_DNS_DOMAIN = "wlan.netapp.com"
$TRACKER_URL = "https://tripathigaurav.github.io/OAT/?automark=true&scriptver=$SCRIPT_VERSION"
$LOG_FILE = "$PSScriptRoot\auto-attendance.log"
$LOCK_FILE = "$env:TEMP\oat-automark-$(Get-Date -Format 'yyyy-MM-dd').lock"

# --- Functions ---
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $Message" | Out-File -Append -FilePath $LOG_FILE -Encoding utf8
}

function Get-WiFiSSID {
    # Method 1: netsh wlan show interfaces (works for WiFi connections)
    try {
        $output = netsh wlan show interfaces | Select-String "^\s+SSID\s+:" | Select-Object -First 1
        if ($output) {
            $ssid = ($output -replace '^\s+SSID\s+:\s+', '').Trim()
            if ($ssid) { return $ssid }
        }
    } catch {}
    return ""
}

function Get-DNSDomains {
    $found = @()

    # Method 1: Per-adapter DNS suffix (most reliable for corporate DHCP)
    try {
        $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction Stop
        foreach ($a in $adapters) {
            if ($a.DNSDomain)          { $found += $a.DNSDomain }
            if ($a.DNSDomainSuffixSearchOrder) { $found += $a.DNSDomainSuffixSearchOrder }
        }
    } catch {}

    # Method 2: Global DNS suffix search list
    try {
        $global = Get-DnsClientGlobalSetting -ErrorAction Stop
        if ($global.SuffixSearchList) { $found += $global.SuffixSearchList }
    } catch {}

    # Method 3: ipconfig /all - catches anything missed above
    try {
        $lines = ipconfig /all 2>$null
        foreach ($line in $lines) {
            if ($line -match '(DNS Suffix Search List|Connection-specific DNS Suffix)\s*[:.]+\s*(.+)') {
                $val = $matches[2].Trim()
                if ($val) { $found += $val }
            }
        }
    } catch {}

    return $found | Where-Object { $_ } | Select-Object -Unique
}

# --- Main Logic ---
# Require BOTH WiFi SSID = 'corp' AND DNS domain = 'wlan.netapp.com'
# This prevents false triggers from:
#   - VPN from home (DNS matches but SSID is home WiFi)
#   - Home WiFi renamed to 'corp' (SSID matches but no NetApp DNS)

$onOfficeNet = $false
$detectedVia = ""

$currentWifi = Get-WiFiSSID
$dnsDomains = Get-DNSDomains
$ssidMatch = $currentWifi -and ($currentWifi -ieq $OFFICE_WIFI)
$dnsMatch = ($dnsDomains | Where-Object { $_ -like "*$OFFICE_DNS_DOMAIN*" }).Count -gt 0

Write-Log "WiFi SSID: '$currentWifi' | DNS match: $dnsMatch | SSID match: $ssidMatch"

if ($ssidMatch -and $dnsMatch) {
    $onOfficeNet = $true
    $detectedVia = "WiFi SSID ($currentWifi) + DNS ($OFFICE_DNS_DOMAIN)"
} elseif ($ssidMatch -and -not $dnsMatch) {
    Write-Log "SSID matches 'corp' but NetApp DNS not found (home WiFi named corp?). Skipping."
    exit 0
} elseif ($dnsMatch -and -not $ssidMatch) {
    # SSID empty = WiFi adapter off, ethernet, or corporate GPO hides SSID - trust DNS alone
    if (-not $currentWifi) {
        $onOfficeNet = $true
        $detectedVia = "DNS domain ($OFFICE_DNS_DOMAIN) - WiFi SSID undetectable (ethernet/adapter off?)"
    } else {
        Write-Log "NetApp DNS found but SSID '$currentWifi' != 'corp' (VPN from home?). Skipping."
        exit 0
    }
}

if (-not $onOfficeNet) {
    Write-Log "Not on office network. Skipping."
    exit 0
}

Write-Log "Office network detected via: $detectedVia"

# Guard: the installer's fallback trigger repeats through the night, so a machine
# left on office WiFi over the weekend would mark Sat/Sun - and auto-marks are
# permanently locked in the app. Skip early-morning weekend runs; the WiFi-connect
# trigger still fires if you genuinely arrive later that day.
$nowLocal = Get-Date
if ($nowLocal.Hour -lt 5 -and ($nowLocal.DayOfWeek -eq 'Saturday' -or $nowLocal.DayOfWeek -eq 'Sunday')) {
    Write-Log "Early-morning weekend run (overnight-connected machine?). Skipping to avoid a false weekend mark."
    exit 0
}

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
    Write-Host "     WiFi SSID:    $(if($currentWifi){$currentWifi}else{'(not detected)'})"
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
