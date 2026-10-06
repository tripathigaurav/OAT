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
#   1. Right-click this file -> Run with PowerShell (to test)
#   2. Import the scheduled task (see auto-attendance-task.xml)
#
# Or run manually: powershell -ExecutionPolicy Bypass -File auto-attendance.ps1
# ============================================================

# --- Configuration ---
$SCRIPT_VERSION = "2.5"
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
    # Keep the log bounded. Watch mode (see oat-watcher.ps1) calls this every
    # 15 minutes, which would otherwise grow the file without limit. Checking
    # the size first avoids reading the contents on every single call.
    try {
        if ((Get-Item $LOG_FILE -ErrorAction Stop).Length -gt 200KB) {
            $keep = Get-Content $LOG_FILE -Tail 400
            $keep | Set-Content $LOG_FILE -Encoding utf8
        }
    } catch { }
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
    # Returns TWO lists, deliberately kept apart, because they are not
    # equally trustworthy as evidence of where the machine physically is:
    #
    #   Connection - the per-adapter "connection-specific DNS suffix". Handed
    #                out by DHCP by the network you are actually attached to,
    #                so it appears when you join that network and disappears
    #                when you leave. This is the only real location signal.
    #
    #   Static     - the DNS suffix search list (DNSDomainSuffixSearchOrder,
    #                Get-DnsClientGlobalSetting). Normally pushed by group
    #                policy and therefore IDENTICAL at the office, at home and
    #                on a plane. It says what the machine knows how to resolve,
    #                not where it is.
    #
    # These used to be pooled into one flat list that the caller substring
    # matched. On any machine whose GPO happens to list an office suffix that
    # made the office check permanently true - it would mark attendance every
    # day from anywhere, which is the exact failure this script exists to avoid.
    # Static is now collected for display in --dry-run only.
    $conn   = @()
    $static = @()

    # Source 1: WMI per-adapter config (most reliable when available)
    try {
        $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction Stop
        foreach ($a in $adapters) {
            if ($a.DNSDomain)                  { $conn   += $a.DNSDomain }
            if ($a.DNSDomainSuffixSearchOrder) { $static += $a.DNSDomainSuffixSearchOrder }
        }
    } catch {}

    # Source 2: modern DNS client cmdlet, connection suffix per interface
    try {
        foreach ($i in (Get-DnsClient -ErrorAction Stop)) {
            if ($i.ConnectionSpecificSuffix) { $conn += $i.ConnectionSpecificSuffix }
        }
    } catch {}

    # Source 3: global suffix search list - static, display only
    try {
        $global = Get-DnsClientGlobalSetting -ErrorAction Stop
        if ($global.SuffixSearchList) { $static += $global.SuffixSearchList }
    } catch {}

    # Source 4: ipconfig /all, in case the cmdlets above are blocked by policy.
    # The value sits behind a dotted leader ("Suffix . . . . . : netapp.com").
    # The old pattern used '\s*[:.]+\s*' as the separator, which stopped at the
    # FIRST dot and swallowed the rest of the leader into the captured value -
    # that is where the junk entries (". . . . . : netapp.com", ":") in the
    # --dry-run output came from. '[\s.]*:' consumes the whole leader instead.
    # The search list is also the one block ipconfig wraps: only the FIRST
    # suffix sits on the labelled line, the rest arrive as unlabelled indented
    # continuations, so a naive per-line match captures one entry and drops
    # the others. That matters most on exactly the machines this source exists
    # for (cmdlets blocked by policy), where a missed continuation would leave
    # $staticOnly false and hide the group-policy explanation below.
    try {
        $inList = $false
        foreach ($line in (ipconfig /all 2>$null)) {
            if ($line -match 'Connection-specific DNS Suffix[\s.]*:\s*(.+)') {
                $inList = $false
                $val = $matches[1].Trim()
                if ($val) { $conn += $val }
            } elseif ($line -match 'DNS Suffix Search List[\s.]*:\s*(.+)') {
                $inList = $true
                $val = $matches[1].Trim()
                if ($val) { $static += $val }
            } elseif ($inList -and $line -match '^\s+(\S+)\s*$') {
                # A lone indented token = continuation of the search list.
                # Safe: every labelled line carries a colon and several tokens,
                # and section headers start at column 0.
                $static += $matches[1]
            } elseif ($line -match '\S') {
                $inList = $false
            }
        }
    } catch {}

    # Lower-cased before de-duplicating: WMI, Get-DnsClient and ipconfig do not
    # agree on casing, and Select-Object -Unique is case-SENSITIVE on PS 5.1
    # (-CaseInsensitive is 7.1+), so the raw lists would show near-duplicates.
    return [pscustomobject]@{
        Connection = @($conn   | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique)
        Static     = @($static | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique)
    }
}

# --- Main Logic ---
# Prefer BOTH signals: WiFi SSID = 'corp' AND the DHCP-assigned DNS suffix
# 'wlan.netapp.com'. Together they rule out:
#   - VPN from home        (suffix may match, SSID is the home network)
#   - Home WiFi named corp (SSID matches, no NetApp DHCP suffix)
#
# The SSID is not always readable though - docked on ethernet, WLAN service
# stopped, or a GPO that blocks netsh - and on those machines it is empty every
# single time. So an unreadable SSID falls back to the DHCP suffix alone, which
# is legitimate location evidence because DHCP only hands it out on that
# network. What is NOT evidence is the DNS suffix SEARCH LIST: group policy
# pushes it everywhere, so it matches at home too. Keeping those two apart is
# the whole point of Get-DNSDomains returning two lists.

$onOfficeNet = $false
$detectedVia = ""

$currentWifi = Get-WiFiSSID
$dns = Get-DNSDomains
$ssidMatch = $currentWifi -and ($currentWifi -ieq $OFFICE_WIFI)

# Two tiers of DNS evidence, strongest first.
#
# Tier 1 - the connection-specific suffix. DHCP hands it out per network, so
# its presence is proof of attachment and it vanishes on leaving. Always trusted.
#
# Tier 2 - the suffix search list. Group policy can pin this identically
# everywhere, which is why it must never be the ONLY thing consulted. But field
# evidence from a managed NetApp laptop shows '$OFFICE_DNS_DOMAIN' genuinely
# appearing and disappearing with the network there, while the broader
# 'netapp.com' and 'eng.netapp.com' persisted off-site - which is exactly why
# OFFICE_DNS_DOMAIN is a WLAN-specific subdomain and not the bare company
# domain. Rejecting tier 2 outright would therefore trade a false-mark risk for
# a WORSE failure: silently never marking again, which nobody notices for days.
#
# So tier 2 still counts, but it is recorded as a weak detection in the log so
# that any false mark is traceable to it. Set this to $false to demand tier 1.
$ALLOW_SEARCH_LIST_FALLBACK = $true

$dnsStrong = @($dns.Connection | Where-Object { $_ -like "*$OFFICE_DNS_DOMAIN*" }).Count -gt 0
$dnsWeak   = (-not $dnsStrong) -and
             @($dns.Static | Where-Object { $_ -like "*$OFFICE_DNS_DOMAIN*" }).Count -gt 0

$dnsMatch   = $dnsStrong -or ($dnsWeak -and $ALLOW_SEARCH_LIST_FALLBACK)
$staticOnly = $dnsWeak -and -not $ALLOW_SEARCH_LIST_FALLBACK

$dnsVia = ""
if ($dnsStrong)     { $dnsVia = "DHCP-assigned suffix" }
elseif ($dnsMatch)  { $dnsVia = "DNS search list - WEAK signal" }

Write-Log "WiFi SSID: '$currentWifi' | SSID match: $ssidMatch | DNS strong: $dnsStrong | DNS weak: $dnsWeak | DNS match: $dnsMatch"
if ($dnsWeak -and $dnsMatch) {
    Write-Log "NOTE: '$OFFICE_DNS_DOMAIN' was found only in the DNS suffix search list, not in a DHCP-assigned suffix. Treating it as office presence, but if attendance is ever marked on a day you were not in the office, this is the line to blame."
}

$skipReason = ""
if ($ssidMatch -and $dnsMatch) {
    $onOfficeNet = $true
    $detectedVia = "WiFi SSID ($currentWifi) + $OFFICE_DNS_DOMAIN via $dnsVia"
} elseif ($ssidMatch -and -not $dnsMatch) {
    # $staticOnly is reported here rather than given its own branch further
    # down: this test would catch the combination first and swallow it, but
    # moving the $staticOnly branch above this one would hijack the genuine
    # "home WiFi happens to be named corp" case, which is the common one on a
    # policy-managed laptop. So append the detail instead of reordering.
    $skipReason = "SSID matches '$OFFICE_WIFI' but no NetApp DHCP DNS suffix (home WiFi named '$OFFICE_WIFI'?)"
    if ($staticOnly) {
        $skipReason += " - '$OFFICE_DNS_DOMAIN' is present only in the policy-pushed search list, which looks identical everywhere"
    }
} elseif ($dnsMatch -and -not $ssidMatch) {
    # SSID empty = adapter off, docked on ethernet, WLAN service stopped, or a
    # GPO that blocks netsh. The DHCP-assigned suffix is still location proof
    # on its own, so this branch is safe now that the static search list is no
    # longer folded into $dnsMatch.
    if (-not $currentWifi) {
        $onOfficeNet = $true
        $detectedVia = "$OFFICE_DNS_DOMAIN via $dnsVia - SSID unreadable (ethernet/adapter off/GPO)"
    } else {
        $skipReason = "'$OFFICE_DNS_DOMAIN' found ($dnsVia) but SSID '$currentWifi' != '$OFFICE_WIFI'"
    }
} elseif ($staticOnly) {
    # The give-away for the bug this replaced: the office suffix is present,
    # but only in the policy-pushed search list, which looks the same at home.
    $skipReason = "'$OFFICE_DNS_DOMAIN' appears only in the DNS suffix search list (group policy), which is the same everywhere - not proof of being at the office"
} else {
    $skipReason = "Not on office network"
}

$nowLocal = Get-Date
# The app decides whether a weekend counts - it owns the "Allow marking
# attendance on weekends & holidays" setting. This script only detects the network and
# opens the tracker; if the setting is off the app declines and explains why.
# Blanket-skipping weekends here would override that setting instead of
# honouring it, and the setting could then never produce real automation.
#
# The one case the app cannot judge is a machine left on office WiFi overnight:
# the fallback watcher polls straight through, so it would fire on the new day
# while nobody is there. So skip only the early hours of a weekend.
$weekendOvernight = ($nowLocal.Hour -lt 5 -and ($nowLocal.DayOfWeek -eq 'Saturday' -or $nowLocal.DayOfWeek -eq 'Sunday'))
$alreadyMarked = Test-Path $LOCK_FILE

# --- Dry run -------------------------------------------------------
# Reported BEFORE any of the exit paths below. This used to sit after the
# network check and the lock-file check, so --dry-run printed nothing at all
# unless you happened to be at the office before the day's first trigger -
# which made a working setup look broken.
if ($args -contains "--dry-run") {
    # Values precomputed rather than inlined as $(if(..){".."}) subexpressions:
    # nested double quotes inside a subexpression inside a string are legal but
    # easy to break, and this is the one path people rely on when debugging.
    $ssidLine = "(not detected)"
    if ($currentWifi) { $ssidLine = $currentWifi }
    $dnsLine = "(none found)"
    if ($dns.Connection) { $dnsLine = ($dns.Connection -join ", ") }
    $staticLine = "(none found)"
    if ($dns.Static) { $staticLine = ($dns.Static -join ", ") }
    $netLine = "$onOfficeNet"
    if ($skipReason) { $netLine = "$onOfficeNet - $skipReason" }
    $lockLine = "$alreadyMarked"
    if ($alreadyMarked) { $lockLine = "$alreadyMarked ($LOCK_FILE)" }
    $today = $nowLocal.ToString("yyyy-MM-dd")

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  OAT DRY RUN - $($nowLocal.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Detection"
    Write-Host "     WiFi SSID     : $ssidLine"
    Write-Host "     Expected SSID : $OFFICE_WIFI"
    Write-Host "     SSID match    : $ssidMatch"
    Write-Host "     Expected DNS  : $OFFICE_DNS_DOMAIN"
    Write-Host "     DHCP suffix   : $dnsLine" -ForegroundColor White
    Write-Host "                     ^ tier 1: assigned by the network you are on - strongest proof" -ForegroundColor DarkGray
    Write-Host "     Search list   : $staticLine" -ForegroundColor DarkGray
    Write-Host "                     ^ tier 2: group policy can pin this everywhere - weak proof" -ForegroundColor DarkGray
    Write-Host "     DNS match     : $dnsMatch"
    if ($dnsVia) { Write-Host "     Matched via   : $dnsVia" }
    Write-Host ""
    Write-Host "  Guards"
    Write-Host "     On office net : $netLine"
    Write-Host "     Already marked: $lockLine"
    Write-Host "     Weekend night : $weekendOvernight"
    Write-Host ""
    Write-Host "  Paths"
    Write-Host "     Script dir    : $PSScriptRoot"
    Write-Host "     Log file      : $LOG_FILE"
    Write-Host "     Tracker URL   : $TRACKER_URL"
    Write-Host ""
    if ($onOfficeNet -and -not $alreadyMarked -and -not $weekendOvernight) {
        Write-Host "  RESULT: would mark $today and open the tracker." -ForegroundColor Green
    } elseif (-not $onOfficeNet) {
        Write-Host "  RESULT: would do nothing - $skipReason." -ForegroundColor Yellow
    } elseif ($alreadyMarked) {
        Write-Host "  RESULT: would do nothing - already marked today." -ForegroundColor Yellow
    } else {
        Write-Host "  RESULT: would do nothing - early-morning weekend run." -ForegroundColor Yellow
    }
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Log "Dry run completed."
    exit 0
}

if (-not $onOfficeNet) {
    Write-Log "$skipReason. Skipping."
    # Also print it: a manual run used to produce no output whatsoever, which
    # is indistinguishable from the script being broken.
    Write-Host "  OAT: $skipReason - nothing to mark." -ForegroundColor Yellow
    exit 0
}

Write-Log "Office network detected via: $detectedVia"

if ($weekendOvernight) {
    Write-Log "Early-morning weekend run (overnight-connected machine?). Skipping to avoid a false weekend mark."
    Write-Host "  OAT: early-morning weekend run - skipping to avoid a false weekend mark." -ForegroundColor Yellow
    exit 0
}

if ($alreadyMarked) {
    Write-Log "Already auto-marked today. Lock file exists."
    Write-Host "  OAT: already marked today." -ForegroundColor Green
    exit 0
}

Write-Log "Connected to office WiFi. Triggering auto-mark..."
Write-Host "  OAT: office network detected - opening tracker to mark today." -ForegroundColor Green

# Open the tracker FIRST and claim the day only if the browser actually
# launched. The lock used to be written before this call, so a launch that
# failed - no default browser association, a policy block, Start-Process
# throwing - burned the whole day silently: the lock said "already marked",
# nothing retried, and the next check was tomorrow.
#
# Caveat worth knowing: this proves the browser was LAUNCHED, not that the page
# finished marking. The page owns that step, so a browser that opens but never
# loads the tracker still consumes the day. Closing that gap needs the page to
# report back (e.g. writing a receipt file the script can look for), which is a
# bigger change than this fix.
$opened = $false
try {
    Start-Process $TRACKER_URL -ErrorAction Stop
    $opened = $true
} catch {
    Write-Log "Could not open the tracker: $($_.Exception.Message). Leaving today unlocked so the next check retries."
    Write-Host "  OAT: could not open the browser - will retry on the next check." -ForegroundColor Red
}

if (-not $opened) { exit 0 }

New-Item -Path $LOCK_FILE -ItemType File -Force | Out-Null
Write-Log "Opened attendance tracker with auto-mark. Done!"

# Clean up old lock files (older than 2 days)
Get-ChildItem "$env:TEMP\oat-automark-*.lock" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-2) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit 0
