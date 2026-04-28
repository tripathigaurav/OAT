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
OFFICE_WIFI="corp"
OFFICE_DNS_DOMAIN="wlan.netapp.com"
TRACKER_PATH="$HOME/Library/CloudStorage/OneDrive-NetAppInc/Desktop/OAT/index.html"
LOG_FILE="$HOME/Library/CloudStorage/OneDrive-NetAppInc/Desktop/OAT/auto-attendance.log"
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

    # Method 3: Try airport command
    if [ -z "$ssid" ] || [ "$ssid" = "<redacted>" ]; then
        ssid=$(/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport -I 2>/dev/null | awk -F': ' '/ SSID/{print $2}')
    fi

    # Method 4: Fallback to networksetup
    if [ -z "$ssid" ] || [ "$ssid" = "<redacted>" ]; then
        ssid=$(networksetup -getairportnetwork en0 2>/dev/null | awk -F': ' '{print $2}')
    fi

    echo "$ssid"
}

# --- Main Logic ---

# Method 1 (Primary): Detect office network via DNS search domain
# This is the most reliable method — macOS redacts SSID but DNS is always visible.
DNS_DOMAINS=$(scutil --dns 2>/dev/null | grep "search domain" | awk '{print $NF}')
ON_OFFICE_NET=false
DETECTED_VIA=""

if echo "$DNS_DOMAINS" | grep -qi "$OFFICE_DNS_DOMAIN"; then
    ON_OFFICE_NET=true
    DETECTED_VIA="DNS domain ($OFFICE_DNS_DOMAIN)"
fi

# Method 2 (Fallback): Try WiFi SSID if DNS didn't match
if [ "$ON_OFFICE_NET" = false ]; then
    CURRENT_WIFI=$(get_wifi_ssid)
    if [ -n "$CURRENT_WIFI" ] && [ "$CURRENT_WIFI" != "<redacted>" ]; then
        log_msg "Current WiFi SSID: '$CURRENT_WIFI'"
        if [ "$(echo "$CURRENT_WIFI" | tr '[:upper:]' '[:lower:]')" = "$(echo "$OFFICE_WIFI" | tr '[:upper:]' '[:lower:]')" ]; then
            ON_OFFICE_NET=true
            DETECTED_VIA="WiFi SSID ($CURRENT_WIFI)"
        fi
    fi
fi

if [ "$ON_OFFICE_NET" = false ]; then
    log_msg "Not on office network. DNS domains: $(echo $DNS_DOMAINS | tr '\n' ', '). Skipping."
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
    echo "     DNS domains:  $(echo $DNS_DOMAINS | tr '\n' ', ')"
    echo ""
    echo "  📋 What would happen:"
    echo "     ✅ Create lock file: $LOCK_FILE"
    echo "     ✅ Open tracker:     file://${TRACKER_PATH}?automark=true"
    echo "     ✅ Auto-mark today:  $(date +%Y-%m-%d)"
    echo ""
    echo "  📂 Config:"
    echo "     Office WiFi SSID:  $OFFICE_WIFI"
    echo "     Office DNS Domain: $OFFICE_DNS_DOMAIN"
    echo "     Tracker path:      $TRACKER_PATH"
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
open "file://${TRACKER_PATH}?automark=true"

log_msg "✅ Opened attendance tracker with auto-mark. Done!"

# Clean up old lock files (older than 2 days)
find /tmp -name "oat-automark-*.lock" -mtime +2 -delete 2>/dev/null

exit 0
