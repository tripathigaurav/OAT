# ============================================================
# OAT - Office Attendance Tracker — WiFi Auto-Mark Script
# For Windows (PowerShell)
# ============================================================
# This script checks if you're connected to the office WiFi
# and automatically opens the attendance tracker to mark today.
#
# Usage:
#   auto-attendance.ps1                  — Normal mode (auto-mark today)
#   auto-attendance.ps1 --dry-run        — Test without making changes
#   auto-attendance.ps1 --backfill       — Scan WiFi logs & backfill past days
#   auto-attendance.ps1 --backfill-dry   — Preview backfill without opening browser
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
$TRACKER_BACKFILL_URL = "https://tripathigaurav.github.io/OAT/?backfill="
$LOG_FILE = "$PSScriptRoot\auto-attendance.log"
$LOCK_FILE = "$env:TEMP\oat-automark-$(Get-Date -Format 'yyyy-MM-dd').lock"

# OAT Quarter Range
$QUARTER_START = [DateTime]"2026-04-27"
$QUARTER_END = [DateTime]"2026-07-31"

# Holidays (won't be marked)
$HOLIDAYS = @("2026-05-01", "2026-05-28")

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

# --- Backfill Functions ---
function Is-Workday {
    param([DateTime]$Date)
    $dateStr = $Date.ToString("yyyy-MM-dd")
    $dow = $Date.DayOfWeek
    return ($dow -ne "Saturday" -and $dow -ne "Sunday" -and
            $Date -ge $QUARTER_START -and $Date -le $QUARTER_END -and
            $dateStr -notin $HOLIDAYS)
}

function Get-WiFiHistory {
    # Scan Windows WLAN Event Log for connections to office WiFi
    # Event ID 8001 = Successfully connected to a wireless network
    $officeDates = @()

    Write-Host ""
    Write-Host "  Scanning Windows WiFi Event Log..." -ForegroundColor Cyan
    Write-Host ""

    try {
        # Get all WLAN connection events
        $events = Get-WinEvent -LogName "Microsoft-Windows-WLAN-AutoConfig/Operational" -ErrorAction Stop |
            Where-Object { $_.Id -eq 8001 }

        Write-Host "  Found $($events.Count) total WiFi connection events." -ForegroundColor Gray

        foreach ($event in $events) {
            $msg = $event.Message
            $eventDate = $event.TimeCreated.Date
            $dateStr = $eventDate.ToString("yyyy-MM-dd")

            # Check if this was a connection to office WiFi
            if ($msg -match $OFFICE_WIFI) {
                if ((Is-Workday $eventDate) -and ($dateStr -notin $officeDates)) {
                    $officeDates += $dateStr
                    Write-Host "    Found: $dateStr ($($eventDate.ToString('dddd'))) - Connected to '$OFFICE_WIFI'" -ForegroundColor Green
                }
            }
        }
    }
    catch {
        Write-Host "  Could not read WLAN event log. Trying alternative method..." -ForegroundColor Yellow

        # Fallback: Try netsh wlan show history (limited but doesn't need elevation)
        try {
            $output = netsh wlan show wlanreport 2>$null
            Write-Host "  Generated WLAN report. Check: C:\ProgramData\Microsoft\Windows\WlanReport\wlan-report-latest.html" -ForegroundColor Yellow
        }
        catch {
            Write-Host "  WiFi history not accessible." -ForegroundColor Red
        }
    }

    # Also scan Event ID 10000 from NetworkProfile (network connected events) as backup
    try {
        $netEvents = Get-WinEvent -LogName "Microsoft-Windows-NetworkProfile/Operational" -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -eq 10000 }

        foreach ($event in $netEvents) {
            $msg = $event.Message
            $eventDate = $event.TimeCreated.Date
            $dateStr = $eventDate.ToString("yyyy-MM-dd")

            if (($msg -match $OFFICE_WIFI -or $msg -match "netapp" -or $msg -match $OFFICE_DNS_DOMAIN) -and
                (Is-Workday $eventDate) -and ($dateStr -notin $officeDates)) {
                $officeDates += $dateStr
                Write-Host "    Found: $dateStr ($($eventDate.ToString('dddd'))) - Network profile match" -ForegroundColor Green
            }
        }
    }
    catch { }

    return $officeDates | Sort-Object
}

function Run-Backfill {
    param([bool]$DryRun = $false)

    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  OAT BACKFILL - WiFi Log Scanner" -ForegroundColor Cyan
    Write-Host "  Scanning WiFi history for past office days..." -ForegroundColor Cyan
    Write-Host "  Quarter: $($QUARTER_START.ToString('MMM dd')) - $($QUARTER_END.ToString('MMM dd yyyy'))" -ForegroundColor Gray
    Write-Host "  Office WiFi: '$OFFICE_WIFI'" -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Cyan

    $dates = Get-WiFiHistory

    if ($dates.Count -eq 0) {
        Write-Host ""
        Write-Host "  No past office WiFi connections found in the logs." -ForegroundColor Yellow
        Write-Host "  This could mean:" -ForegroundColor Gray
        Write-Host "    - Logs have been cleared" -ForegroundColor Gray
        Write-Host "    - WiFi was named differently" -ForegroundColor Gray
        Write-Host "    - You used ethernet instead of WiFi" -ForegroundColor Gray
        Write-Host ""
        Write-Log "Backfill: No WiFi history found."
        return
    }

    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host "  Found $($dates.Count) office days from WiFi logs:" -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host ""

    foreach ($d in $dates) {
        $dt = [DateTime]$d
        Write-Host "    $d ($($dt.ToString('dddd')))" -ForegroundColor White
    }

    Write-Host ""

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would open tracker to backfill these $($dates.Count) days." -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Run without --backfill-dry to apply." -ForegroundColor Yellow
        Write-Log "Backfill dry run: Found $($dates.Count) days."
    }
    else {
        # Build comma-separated date list and open tracker
        $dateList = $dates -join ","
        $backfillUrl = "$TRACKER_BACKFILL_URL$dateList"

        Write-Host "  Opening tracker to mark $($dates.Count) days..." -ForegroundColor Cyan
        Start-Process $backfillUrl
        Write-Log "Backfill: Opened tracker with $($dates.Count) days: $dateList"
        Write-Host ""
        Write-Host "  DONE! Check the tracker in your browser." -ForegroundColor Green
        Write-Host "  Dates marked: $dateList" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
}

# --- Check for Backfill Mode ---
if ($args -contains "--backfill") {
    Run-Backfill -DryRun $false
    Read-Host "  Press Enter to close"
    exit 0
}

if ($args -contains "--backfill-dry") {
    Run-Backfill -DryRun $true
    Read-Host "  Press Enter to close"
    exit 0
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
