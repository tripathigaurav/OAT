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
SCRIPT_VERSION="2.3"
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
# Require BOTH WiFi SSID = 'corp' AND DNS domain = 'wlan.netapp.com'
# This prevents false triggers from:
#   - VPN from home (DNS matches but SSID is home WiFi)
#   - Home WiFi renamed to 'corp' (SSID matches but no NetApp DNS)

ON_OFFICE_NET=false
DETECTED_VIA=""

CURRENT_WIFI=$(get_wifi_ssid)
DNS_DOMAINS=$(scutil --dns 2>/dev/null | grep "search domain" | awk '{print $NF}')

SSID_MATCH=false
DNS_MATCH=false

if [ -n "$CURRENT_WIFI" ] && [ "$CURRENT_WIFI" != "<redacted>" ]; then
    CURRENT_WIFI_LOWER=$(echo "$CURRENT_WIFI" | tr '[:upper:]' '[:lower:]')
    OFFICE_WIFI_LOWER=$(echo "$OFFICE_WIFI" | tr '[:upper:]' '[:lower:]')
    [ "$CURRENT_WIFI_LOWER" = "$OFFICE_WIFI_LOWER" ] && SSID_MATCH=true
fi

echo "$DNS_DOMAINS" | grep -qi "$OFFICE_DNS_DOMAIN" && DNS_MATCH=true

log_msg "WiFi SSID: '$CURRENT_WIFI' | SSID match: $SSID_MATCH | DNS match: $DNS_MATCH"

if [ "$SSID_MATCH" = true ] && [ "$DNS_MATCH" = true ]; then
    ON_OFFICE_NET=true
    DETECTED_VIA="WiFi SSID ($CURRENT_WIFI) + DNS ($OFFICE_DNS_DOMAIN)"
elif [ "$SSID_MATCH" = true ] && [ "$DNS_MATCH" = false ]; then
    log_msg "SSID matches 'corp' but NetApp DNS not found (home WiFi named corp?). Skipping."
    exit 0
elif [ "$DNS_MATCH" = true ] && [ "$SSID_MATCH" = false ]; then
    # SSID undetectable or doesn't match — do NOT auto-mark without confirming 'corp' WiFi
    # (prevents false positives when on VPN from home with undetectable SSID)
    log_msg "DNS matches but SSID '$CURRENT_WIFI' != 'corp' or undetectable. Cannot confirm office network. Skipping."
    exit 0
fi

if [ "$ON_OFFICE_NET" = false ]; then
    log_msg "Not on office network. Skipping."
    exit 0
fi

log_msg "✅ Office network detected via: $DETECTED_VIA"

# Check if already marked today (prevent multiple opens)
if [ -f "$LOCK_FILE" ]; then
    log_msg "Already auto-marked today. Lock file exists: $LOCK_FILE"
    exit 0
fi

# Connected to office WiFi — trigger auto-mark!
log_msg "✅ Connected to office WiFi '$OFFICE_WIFI'. Triggering auto-mark..."

# Dry-run mode: just print what would happen, don't actually open browser
if [ "$1" = "--dry-run" ]; then
    echo "========================================="
    echo "  🧪 OAT DRY RUN — $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================="
    echo ""
    echo "  📡 Network Detection:"
    echo "     Detected via: $DETECTED_VIA"
    echo "     WiFi SSID:    ${CURRENT_WIFI:-(not detected / redacted)}"
    echo ""
    echo "  📋 What would happen:"
    echo "     ✅ Create lock file: $LOCK_FILE"
    echo "     ✅ Open tracker:     $TRACKER_URL"
    echo "     ✅ Auto-mark today:  $(date +%Y-%m-%d)"
    echo ""
    echo "  📂 Config:"
    echo "     Office WiFi SSID:  $OFFICE_WIFI"
    echo "     Office DNS Domain: $OFFICE_DNS_DOMAIN"
    echo "     Tracker URL:       $TRACKER_URL"
    echo "     Log file:          $LOG_FILE"
    echo ""
    echo "  ✅ DRY RUN PASSED — Everything looks good!"
    echo "========================================="
    log_msg "🧪 Dry run completed successfully."
    exit 0
fi

# Create lock file for today
touch "$LOCK_FILE"

# Open the tracker in default browser with automark parameter
open "$TRACKER_URL"

log_msg "✅ Opened attendance tracker with auto-mark. Done!"

# Clean up old lock files (older than 2 days)
find /tmp -name "oat-automark-*.lock" -mtime +2 -delete 2>/dev/null

# Rotate log file (keep last 400 lines)
trim_log

exit 0
