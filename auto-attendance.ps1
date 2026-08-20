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
#   auto-attendance.ps1 --backfill       - Scan WiFi logs & backfill past days
#   auto-attendance.ps1 --backfill-dry   - Preview backfill without opening browser
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
$TRACKER_BACKFILL_URL = "https://tripathigaurav.github.io/OAT/?backfill="
$LOG_FILE = "$PSScriptRoot\auto-attendance.log"
$LOCK_FILE = "$env:TEMP\oat-automark-$(Get-Date -Format 'yyyy-MM-dd').lock"

# OAT Quarter Ranges - MUST stay in sync with the QUARTERS table in js/app.js.
# These are the real OAT quarter boundaries, not calendar months. Getting them
# wrong makes the backfill scanner drop or offer the wrong dates.
function New-Day { param([string]$s)
    return [DateTime]::ParseExact($s, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
}

$OAT_QUARTERS = @(
    @{ Key = 'Q1'; Start = (New-Day '2026-04-27'); End = (New-Day '2026-07-31')
       Holidays = @('2026-05-01','2026-05-28','2026-07-06') },
    @{ Key = 'Q2'; Start = (New-Day '2026-08-03'); End = (New-Day '2026-10-30')
       Holidays = @('2026-08-15','2026-09-04','2026-09-14','2026-10-02','2026-10-21') },
    @{ Key = 'Q3'; Start = (New-Day '2026-11-02'); End = (New-Day '2027-01-29')
       Holidays = @('2026-11-10','2026-12-25','2026-12-28','2026-12-29','2026-12-30','2026-12-31') },
    @{ Key = 'Q4'; Start = (New-Day '2027-02-01'); End = (New-Day '2027-04-30')
       Holidays = @() }
)

function Get-OATQuarter {
    param([DateTime]$Date = (Get-Date))
    $d = $Date.Date
    foreach ($q in $OAT_QUARTERS) { if ($d -ge $q.Start -and $d -le $q.End) { return $q } }
    # Between quarters - fall forward to the next one starting
    foreach ($q in $OAT_QUARTERS) { if ($d -lt $q.Start) { return $q } }
    return $OAT_QUARTERS[0]
}

$quarter       = Get-OATQuarter
$QUARTER_KEY   = $quarter.Key
$QUARTER_START = $quarter.Start
$QUARTER_END   = $quarter.End

# Holidays for the active quarter (won't be marked)
$HOLIDAYS = $quarter.Holidays

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

# --- Backfill Functions ---
function Is-Workday {
    param([DateTime]$Date)
    $d = $Date.Date
    $dateStr = $d.ToString("yyyy-MM-dd")
    $dow = $d.DayOfWeek
    return ($dow -ne "Saturday" -and $dow -ne "Sunday" -and
            $d -ge $QUARTER_START -and $d -le $QUARTER_END -and
            $dateStr -notin $HOLIDAYS)
}

# Pull the SSID out of a WLAN event message and compare it exactly.
# Previously this was `$msg -match "corp"`, a substring regex that also matched
# "corporate-guest", "MyCorpNet", or the word "corp" anywhere in the message -
# and every false positive became a permanently locked auto-mark in the app.
function Get-EventSSID {
    param([string]$Message)
    if ($Message -match '(?m)^\s*(?:Network\s+)?SSID\s*:\s*(.+)$') { return $matches[1].Trim() }
    return $null
}

function Test-OfficeSSID {
    param([string]$Message)
    $ssid = Get-EventSSID $Message
    if ($ssid) { return ($ssid -ieq $OFFICE_WIFI) }
    # No SSID field (localised Windows) - fall back to a whole-word match
    return ($Message -match "(?i)\b$([regex]::Escape($OFFICE_WIFI))\b")
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

            # Check if this was a connection to office WiFi (exact SSID match)
            if (Test-OfficeSSID $msg) {
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

            # Require an exact office SSID or the office-specific DNS domain.
            # A bare "netapp" match also hit VPN-from-home network profiles.
            if (((Test-OfficeSSID $msg) -or ($msg -match [regex]::Escape($OFFICE_DNS_DOMAIN))) -and
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
    Write-Host "  Quarter: $QUARTER_KEY  $($QUARTER_START.ToString('MMM dd')) - $($QUARTER_END.ToString('MMM dd yyyy'))" -ForegroundColor Gray
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
