#!/bin/bash
# ============================================================
# OAT - Office Attendance Tracker — WiFi Auto-Mark Script
# ============================================================
# This script checks if you're connected to the office WiFi
# and automatically opens the attendance tracker to mark today.
#
# Usage:
#   chmod +x auto-attendance.sh
#   ./auto-attendance.sh
#
# The script is designed to be triggered by a macOS LaunchAgent
# whenever the network configuration changes.
# ============================================================

# --- Configuration ---
SCRIPT_VERSION="2.5"
OFFICE_WIFI="corp"
OFFICE_DNS_DOMAIN="wlan.netapp.com"
TRACKER_URL="https://tripathigaurav.github.io/OAT/?automark=true&scriptver=$SCRIPT_VERSION"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-attendance.log"
LOCK_FILE="/tmp/oat-automark-$(date +%Y-%m-%d).lock"

# --- Functions ---
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

get_wifi_ssid() {
    # macOS WiFi SSID detection (multiple methods for compatibility)
    local ssid=""

    # Method 1: Use the Swift CoreWLAN helper (most reliable on modern macOS)
    local script_dir
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    if [ -x "$script_dir/wifi-ssid" ]; then
        ssid=$("$script_dir/wifi-ssid" 2>/dev/null)
    fi

    # Method 2: Use system_profiler (slower but doesn't require compilation)
    if [ -z "$ssid" ] || [ "$ssid" = "<redacted>" ]; then
        ssid=$(system_profiler SPAirPortDataType 2>/dev/null | awk '/Current Network Information:/{getline; gsub(/^[[:space:]]+|:$/,""); print; exit}')
    fi

    # Method 3: Try airport command (removed on macOS 15 but safe to attempt)
    if [ -z "$ssid" ] || [ "$ssid" = "<redacted>" ]; then
        ssid=$(/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport -I 2>/dev/null | awk -F': ' '/ SSID/{print $2}')
    fi

    # Method 4: networksetup — try all common WiFi interfaces (en0, en1, en2)
    if [ -z "$ssid" ] || [ "$ssid" = "<redacted>" ]; then
        for iface in en0 en1 en2 en3; do
            local raw
            raw=$(networksetup -getairportnetwork "$iface" 2>/dev/null)
            # Output is "Current Wi-Fi Network: <ssid>" — strip the prefix
            local candidate
            candidate=$(echo "$raw" | sed 's/^Current Wi-Fi Network: //')
            if [ -n "$candidate" ] && [ "$candidate" != "$raw" ] && [ "$candidate" != "<redacted>" ]; then
                ssid="$candidate"
                break
            fi
        done
    fi

    echo "$ssid"
}

# Log rotation — keep last 500 lines to prevent unbounded growth
trim_log() {
    if [ -f "$LOG_FILE" ]; then
        local lines
        lines=$(wc -l < "$LOG_FILE")
        if [ "$lines" -gt 500 ]; then
            tail -400 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
        fi
    fi
}

# --- Main Logic ---
# Prefer BOTH signals: WiFi SSID = 'corp' AND the DHCP-assigned domain
# 'wlan.netapp.com'. Together they rule out:
#   - VPN from home        (domain may match, SSID is the home network)
#   - Home WiFi named corp (SSID matches, no NetApp DHCP domain)
#
# macOS often refuses to hand over the SSID (Location Services denied, or the
# SSID comes back "<redacted>"), so an unreadable SSID falls back to the DNS
# evidence alone. That evidence comes in two tiers of very different quality —
# see the ALLOW_SEARCH_LIST_FALLBACK block below, which is where the real
# subtlety of this script lives.

ON_OFFICE_NET=false
DETECTED_VIA=""

# DHCP option 15 (domain_name) per active interface. Location-dependent: it is
# supplied by the network you just joined and gone when you leave it.
get_dhcp_domains() {
    local iface d
    for iface in $(ifconfig -l 2>/dev/null); do
        case "$iface" in lo0|gif*|stf*|utun*|awdl*|llw*) continue ;; esac
        ifconfig "$iface" 2>/dev/null | grep -q "status: active" || continue
        d=$(ipconfig getoption "$iface" domain_name 2>/dev/null)
        [ -n "$d" ] && echo "$d"
    done
}

# Resolver search domains — the tier 2 signal. This used to be the SOLE DNS
# signal, which meant a Mac carrying an MDM-pinned search domain matched the
# office check from anywhere. It is now only consulted when tier 1 is silent.
get_search_domains() {
    scutil --dns 2>/dev/null | grep "search domain" | awk '{print $NF}' \
        | tr '[:upper:]' '[:lower:]' | sort -u
}

CURRENT_WIFI=$(get_wifi_ssid)
DHCP_DOMAINS=$(get_dhcp_domains)
SEARCH_DOMAINS=$(get_search_domains)

SSID_MATCH=false
DNS_MATCH=false
STATIC_ONLY=false

if [ -n "$CURRENT_WIFI" ] && [ "$CURRENT_WIFI" != "<redacted>" ]; then
    CURRENT_WIFI_LOWER=$(echo "$CURRENT_WIFI" | tr '[:upper:]' '[:lower:]')
    OFFICE_WIFI_LOWER=$(echo "$OFFICE_WIFI" | tr '[:upper:]' '[:lower:]')
    [ "$CURRENT_WIFI_LOWER" = "$OFFICE_WIFI_LOWER" ] && SSID_MATCH=true
fi

# Two tiers of DNS evidence, strongest first. Tier 1 is the DHCP-assigned
# domain: handed out per network, so it proves attachment and vanishes on
# leaving. Tier 2 is the resolver search domains, which an MDM profile can pin
# identically everywhere — never trustworthy alone in principle, but field
# evidence from a managed NetApp machine shows "$OFFICE_DNS_DOMAIN" really does
# come and go with the network while the broader netapp.com persists off-site.
# Rejecting tier 2 outright would swap a false-mark risk for a worse failure:
# silently never marking again. So tier 2 counts, and is logged as weak.
# Set to false to demand tier 1.
ALLOW_SEARCH_LIST_FALLBACK=true

DNS_STRONG=false
DNS_WEAK=false
echo "$DHCP_DOMAINS"   | grep -qi "$OFFICE_DNS_DOMAIN" && DNS_STRONG=true
if [ "$DNS_STRONG" = false ] && echo "$SEARCH_DOMAINS" | grep -qi "$OFFICE_DNS_DOMAIN"; then
    DNS_WEAK=true
fi

DNS_VIA=""
if [ "$DNS_STRONG" = true ]; then
    DNS_MATCH=true
    DNS_VIA="DHCP-assigned domain"
elif [ "$DNS_WEAK" = true ] && [ "$ALLOW_SEARCH_LIST_FALLBACK" = true ]; then
    DNS_MATCH=true
    DNS_VIA="resolver search domains — WEAK signal"
elif [ "$DNS_WEAK" = true ]; then
    STATIC_ONLY=true
fi

log_msg "WiFi SSID: '$CURRENT_WIFI' | SSID match: $SSID_MATCH | DNS strong: $DNS_STRONG | DNS weak: $DNS_WEAK | DNS match: $DNS_MATCH"
if [ "$DNS_WEAK" = true ] && [ "$DNS_MATCH" = true ]; then
    log_msg "NOTE: '$OFFICE_DNS_DOMAIN' was found only in the resolver search domains, not in a DHCP-assigned domain. Treating it as office presence, but if attendance is ever marked on a day you were not in the office, this is the line to blame."
fi

SKIP_REASON=""
if [ "$SSID_MATCH" = true ] && [ "$DNS_MATCH" = true ]; then
    ON_OFFICE_NET=true
    DETECTED_VIA="WiFi SSID ($CURRENT_WIFI) + $OFFICE_DNS_DOMAIN via $DNS_VIA"
elif [ "$SSID_MATCH" = true ] && [ "$DNS_MATCH" = false ]; then
    # STATIC_ONLY is reported here rather than in its own branch below, which
    # this test would otherwise swallow. Reordering is not the fix: putting the
    # STATIC_ONLY branch first would hijack the genuine "home WiFi is named
    # corp" case, which is the common one on an MDM-managed laptop.
    SKIP_REASON="SSID matches '$OFFICE_WIFI' but no NetApp DHCP domain (home WiFi named '$OFFICE_WIFI'?)"
    if [ "$STATIC_ONLY" = true ]; then
        SKIP_REASON="$SKIP_REASON — '$OFFICE_DNS_DOMAIN' is present only in the resolver search domains, which look identical everywhere"
    fi
elif [ "$DNS_MATCH" = true ] && [ "$SSID_MATCH" = false ]; then
    if [ -z "$CURRENT_WIFI" ] || [ "$CURRENT_WIFI" = "<redacted>" ]; then
        ON_OFFICE_NET=true
        DETECTED_VIA="$OFFICE_DNS_DOMAIN via $DNS_VIA — SSID unreadable (location permission denied)"
    else
        SKIP_REASON="'$OFFICE_DNS_DOMAIN' found ($DNS_VIA) but SSID '$CURRENT_WIFI' != '$OFFICE_WIFI'"
    fi
elif [ "$STATIC_ONLY" = true ]; then
    SKIP_REASON="'$OFFICE_DNS_DOMAIN' appears only in the resolver search domains (MDM profile), which is the same everywhere — not proof of being at the office"
else
    SKIP_REASON="Not on office network"
fi

# The app decides whether a weekend counts — it owns the "Allow marking
# attendance on weekends & holidays" setting. This script only detects the network and
# opens the tracker; if the setting is off the app declines and explains why.
# Blanket-skipping weekends here would override that setting instead of
# honouring it, and the setting could then never produce real automation.
#
# The app also refuses off-day auto-marks before 05:00 (it knows the holiday
# list; this script does not). This weekend check is belt-and-braces that also
# saves opening a pointless browser tab at 00:01. A genuine Saturday visit
# later that day still triggers on network change.
HOUR_NOW=$((10#$(date +%H)))
DOW_NOW=$(date +%u)   # 1=Mon ... 6=Sat, 7=Sun
WEEKEND_OVERNIGHT=false
[ "$HOUR_NOW" -lt 5 ] && [ "$DOW_NOW" -ge 6 ] && WEEKEND_OVERNIGHT=true

ALREADY_MARKED=false
[ -f "$LOCK_FILE" ] && ALREADY_MARKED=true

# --- Dry run ------------------------------------------------------
# Reported BEFORE the exit paths below, matching the Windows script. It used to
# sit after the network, weekend and lock checks, so --dry-run printed nothing
# at all unless you happened to be at the office before the day's first
# trigger — which made a perfectly working setup look broken, and gave no way
# to see WHY detection had decided against marking.
if [ "$1" = "--dry-run" ]; then
    echo "========================================="
    echo "  OAT DRY RUN — $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================="
    echo ""
    echo "  Detection"
    echo "     WiFi SSID      : ${CURRENT_WIFI:-(not detected / redacted)}"
    echo "     Expected SSID  : $OFFICE_WIFI"
    echo "     SSID match     : $SSID_MATCH"
    echo "     Expected domain: $OFFICE_DNS_DOMAIN"
    echo "     DHCP domain    : ${DHCP_DOMAINS:-(none found)}"
    echo "                      ^ tier 1: assigned by the network you are on — strongest proof"
    echo "     Search domains : $(echo ${SEARCH_DOMAINS:-(none found)} | tr '\n' ' ')"
    echo "                      ^ tier 2: an MDM profile can pin this everywhere — weak proof"
    echo "     DNS match      : $DNS_MATCH"
    [ -n "$DNS_VIA" ] && echo "     Matched via    : $DNS_VIA"
    echo ""
    echo "  Guards"
    if [ -n "$SKIP_REASON" ]; then
        echo "     On office net  : $ON_OFFICE_NET — $SKIP_REASON"
    else
        echo "     On office net  : $ON_OFFICE_NET via $DETECTED_VIA"
    fi
    echo "     Already marked : $ALREADY_MARKED"
    echo "     Weekend night  : $WEEKEND_OVERNIGHT"
    echo ""
    echo "  Paths"
    echo "     Lock file      : $LOCK_FILE"
    echo "     Log file       : $LOG_FILE"
    echo "     Tracker URL    : $TRACKER_URL"
    echo ""
    if [ "$ON_OFFICE_NET" = true ] && [ "$ALREADY_MARKED" = false ] && [ "$WEEKEND_OVERNIGHT" = false ]; then
        echo "  RESULT: would mark $(date +%Y-%m-%d) and open the tracker."
    elif [ "$ON_OFFICE_NET" = false ]; then
        echo "  RESULT: would do nothing — $SKIP_REASON."
    elif [ "$ALREADY_MARKED" = true ]; then
        echo "  RESULT: would do nothing — already marked today."
    else
        echo "  RESULT: would do nothing — early-morning weekend run."
    fi
    echo "========================================="
    log_msg "Dry run completed."
    exit 0
fi

if [ "$ON_OFFICE_NET" = false ]; then
    log_msg "$SKIP_REASON. Skipping."
    echo "  OAT: $SKIP_REASON — nothing to mark."
    exit 0
fi

log_msg "✅ Office network detected via: $DETECTED_VIA"

if [ "$WEEKEND_OVERNIGHT" = true ]; then
    log_msg "Early-morning weekend run (overnight-connected laptop?). Skipping to avoid a false weekend mark."
    exit 0
fi

if [ "$ALREADY_MARKED" = true ]; then
    log_msg "Already auto-marked today. Lock file exists: $LOCK_FILE"
    exit 0
fi

log_msg "✅ Connected to office WiFi '$OFFICE_WIFI'. Triggering auto-mark..."

# Open the tracker FIRST and claim the day only if it actually launched. The
# lock used to be written before this, so a failed `open` burned the whole day
# silently: the lock said "already marked" and nothing retried until tomorrow.
#
# Caveat: this proves the browser was LAUNCHED, not that the page finished
# marking — the page owns that step.
if open "$TRACKER_URL" 2>/dev/null; then
    touch "$LOCK_FILE"
    log_msg "✅ Opened attendance tracker with auto-mark. Done!"
else
    log_msg "Could not open the tracker. Leaving today unlocked so the next check retries."
    echo "  OAT: could not open the browser — will retry on the next check."
    trim_log
    exit 0
fi

# Clean up old lock files (older than 2 days)
find /tmp -name "oat-automark-*.lock" -mtime +2 -delete 2>/dev/null

# Rotate log file (keep last 400 lines)
trim_log

exit 0
