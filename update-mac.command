#!/bin/bash
# ============================================================
# OAT — Update Script for Mac (existing users)
# ============================================================
# Run this to get the latest version of the auto-attendance
# scripts and restart the LaunchAgent.
#
# Usage:
#   curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash
# ============================================================

IS_INTERACTIVE=false
[[ -t 0 ]] && IS_INTERACTIVE=true

$IS_INTERACTIVE && clear
echo ""
echo "  ======================================================"
echo "  📅 OAT — Office Attendance Tracker"
echo "  🔄 Mac Update Script"
echo "  ======================================================"
echo ""

# --- Configuration ---
GITHUB_BASE="https://tripathigaurav.github.io/OAT"
OAT_DIR="$HOME/.oat"
PLIST_NAME="com.oat.wifiattendance.plist"
SCRIPT_NAME="auto-attendance.sh"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

# --- Check if OAT is already installed ---
echo "  [1/4] Checking existing installation..."
if [ ! -d "$OAT_DIR" ]; then
    echo "        ⚠️  OAT not found at $OAT_DIR"
    echo "        Looks like you haven't installed OAT yet."
    echo ""
    echo "        Run the installer instead:"
    echo "        curl -sL $GITHUB_BASE/install-mac.command | bash"
    echo ""
    $IS_INTERACTIVE && read -p "  Press Enter to exit..."
    exit 1
fi

# Show current script version if available
OLD_VERSION=""
if [ -f "$OAT_DIR/$SCRIPT_NAME" ]; then
    OLD_VERSION=$(grep 'SCRIPT_VERSION=' "$OAT_DIR/$SCRIPT_NAME" 2>/dev/null | head -1 | tr -d '"' | awk -F= '{print $2}')
fi

if [ -n "$OLD_VERSION" ]; then
    echo "        📦 Current version: $OLD_VERSION"
else
    echo "        📦 Current version: (unknown)"
fi
echo "        ✅ Installation found at $OAT_DIR"
echo ""

# --- Step 2: Download latest files ---
echo "  [2/4] Downloading latest files from GitHub..."

curl -sL "$GITHUB_BASE/$SCRIPT_NAME" -o "$OAT_DIR/$SCRIPT_NAME.new"
if [ $? -eq 0 ] && [ -s "$OAT_DIR/$SCRIPT_NAME.new" ]; then
    mv "$OAT_DIR/$SCRIPT_NAME.new" "$OAT_DIR/$SCRIPT_NAME"
    echo "        ✅ Updated $SCRIPT_NAME"
else
    rm -f "$OAT_DIR/$SCRIPT_NAME.new"
    echo "        ❌ Failed to download $SCRIPT_NAME"
    echo "        Please check your internet connection."
    $IS_INTERACTIVE && read -p "  Press Enter to exit..."; exit 1
fi

curl -sL "$GITHUB_BASE/$PLIST_NAME" -o "$OAT_DIR/$PLIST_NAME.new"
if [ $? -eq 0 ] && [ -s "$OAT_DIR/$PLIST_NAME.new" ]; then
    mv "$OAT_DIR/$PLIST_NAME.new" "$OAT_DIR/$PLIST_NAME"
    echo "        ✅ Updated $PLIST_NAME"
else
    rm -f "$OAT_DIR/$PLIST_NAME.new"
    echo "        ❌ Failed to download $PLIST_NAME"
    $IS_INTERACTIVE && read -p "  Press Enter to exit..."; exit 1
fi

# Show new version
NEW_VERSION=$(grep 'SCRIPT_VERSION=' "$OAT_DIR/$SCRIPT_NAME" 2>/dev/null | head -1 | tr -d '"' | awk -F= '{print $2}')
if [ -n "$NEW_VERSION" ]; then
    echo "        🆕 New version: $NEW_VERSION"
fi
echo ""

# --- Step 3: Set permissions & restart LaunchAgent ---
echo "  [3/4] Restarting LaunchAgent..."

chmod +x "$OAT_DIR/$SCRIPT_NAME"
xattr -cr "$OAT_DIR/$SCRIPT_NAME" 2>/dev/null
xattr -cr "$OAT_DIR/$PLIST_NAME" 2>/dev/null

# Unload old agent
launchctl unload "$LAUNCH_AGENTS/$PLIST_NAME" 2>/dev/null

# Update plist with correct path (in case it changed)
sed -i '' "s|<string>/.*auto-attendance.sh</string>|<string>$OAT_DIR/$SCRIPT_NAME</string>|g" "$OAT_DIR/$PLIST_NAME"
cp "$OAT_DIR/$PLIST_NAME" "$LAUNCH_AGENTS/"

# Reload agent
launchctl load "$LAUNCH_AGENTS/$PLIST_NAME"
if [ $? -eq 0 ]; then
    echo "        ✅ LaunchAgent restarted"
else
    echo "        ⚠️  LaunchAgent may need a logout/login to restart"
fi
echo ""

# --- Step 4: Health Check ---
echo "  [4/4] Running health check..."

PASS=true

# Check LaunchAgent is loaded
AGENT_LOADED=$(launchctl list | grep "com.oat.wifiattendance" 2>/dev/null)
if [ -n "$AGENT_LOADED" ]; then
    echo "        ✅ LaunchAgent: Running"
else
    echo "        ⚠️  LaunchAgent: Not detected (try logging out and back in)"
    PASS=false
fi

# Check script is executable
if [ -x "$OAT_DIR/$SCRIPT_NAME" ]; then
    echo "        ✅ Script: Executable"
else
    echo "        ❌ Script: Not executable"
    PASS=false
fi

# Check plist exists in LaunchAgents
if [ -f "$LAUNCH_AGENTS/$PLIST_NAME" ]; then
    echo "        ✅ Plist: Installed"
else
    echo "        ❌ Plist: Missing from LaunchAgents"
    PASS=false
fi

# Quick WiFi detection test
echo ""
echo "        🔍 Testing WiFi detection..."
CURRENT_WIFI=$(system_profiler SPAirPortDataType 2>/dev/null | awk '/Current Network Information:/{getline; gsub(/^[[:space:]]+|:$/,""); print; exit}')
DNS_DOMAINS=$(scutil --dns 2>/dev/null | grep "search domain" | awk '{print $NF}')

if [ -n "$CURRENT_WIFI" ] && [ "$CURRENT_WIFI" != "<redacted>" ]; then
    echo "        📶 WiFi SSID detected: '$CURRENT_WIFI'"
elif [ "$CURRENT_WIFI" = "<redacted>" ]; then
    echo "        📶 WiFi SSID: <redacted> (enable Location Services for Terminal to fix)"
else
    echo "        📶 WiFi SSID: not detected (wired/ethernet?)"
fi

if echo "$DNS_DOMAINS" | grep -qi "wlan.netapp.com"; then
    echo "        🌐 NetApp DNS: ✅ Detected (you're on office network!)"
else
    echo "        🌐 NetApp DNS: not detected (not on office WiFi right now — that's OK)"
fi

echo ""

# --- Summary ---
echo "  ======================================================"
if [ "$PASS" = true ]; then
    echo "  ✅ UPDATE COMPLETE — Everything looks good!"
else
    echo "  ⚠️  UPDATE DONE — Some checks need attention (see above)"
fi
echo "  ======================================================"
echo ""
echo "  📁 Install path: $OAT_DIR"
[ -n "$NEW_VERSION" ] && echo "  📦 Version: $NEW_VERSION"
echo "  📡 Trigger: Connects to 'corp' WiFi + NetApp DNS"
echo "  🌐 Tracker: $GITHUB_BASE"
echo ""
echo "  ✅ Next time you connect to office WiFi,"
echo "     OAT will open automatically in your browser."
echo "  ======================================================"
echo ""

if $IS_INTERACTIVE; then
    read -p "  Press Enter to close this window..."
else
    echo "  ✅ Done! You can close this terminal."
fi
