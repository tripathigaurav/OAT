#!/bin/bash
# ============================================================
# OAT — One-Click Installer for Mac
# ============================================================
# Works two ways:
#   1. curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash
#   2. chmod +x install-mac.command && ./install-mac.command
# ============================================================

# Only clear/prompt if running interactively (not piped)
IS_INTERACTIVE=false
[[ -t 0 ]] && IS_INTERACTIVE=true

$IS_INTERACTIVE && clear
echo ""
echo "  ======================================================"
echo "  📅 OAT — Office Attendance Tracker"
echo "  🚀 One-Click Installer for Mac"
echo "  ======================================================"
echo ""

# --- Configuration ---
GITHUB_BASE="https://tripathigaurav.github.io/OAT"
OAT_DIR="$HOME/Desktop/OAT"
PLIST_NAME="com.oat.wifiattendance.plist"
SCRIPT_NAME="auto-attendance.sh"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

# --- Step 1: Create directory ---
echo "  [1/5] Creating folder: $OAT_DIR"
mkdir -p "$OAT_DIR"
echo "        ✅ Done"
echo ""

# --- Step 2: Download files ---
echo "  [2/5] Downloading files from GitHub..."

curl -sL "$GITHUB_BASE/$SCRIPT_NAME" -o "$OAT_DIR/$SCRIPT_NAME"
if [ $? -eq 0 ]; then
    echo "        ✅ Downloaded $SCRIPT_NAME"
else
    echo "        ❌ Failed to download $SCRIPT_NAME"
    echo "        Please check your internet connection."
    $IS_INTERACTIVE && read -p "  Press Enter to exit..."; exit 1
fi

curl -sL "$GITHUB_BASE/$PLIST_NAME" -o "$OAT_DIR/$PLIST_NAME"
if [ $? -eq 0 ]; then
    echo "        ✅ Downloaded $PLIST_NAME"
else
    echo "        ❌ Failed to download $PLIST_NAME"
    $IS_INTERACTIVE && read -p "  Press Enter to exit..."; exit 1
fi
echo ""

# --- Step 3: Set permissions ---
echo "  [3/5] Setting permissions..."
chmod +x "$OAT_DIR/$SCRIPT_NAME"
echo "        ✅ Made script executable"
echo ""

# --- Step 4: Install LaunchAgent ---
echo "  [4/5] Installing LaunchAgent..."
mkdir -p "$LAUNCH_AGENTS"

# Unload old one if exists
launchctl unload "$LAUNCH_AGENTS/$PLIST_NAME" 2>/dev/null

# Update plist with correct path
# The plist references a hardcoded script path — update it to match this user's directory
sed -i '' "s|<string>/.*auto-attendance.sh</string>|<string>$OAT_DIR/$SCRIPT_NAME</string>|g" "$OAT_DIR/$PLIST_NAME"

cp "$OAT_DIR/$PLIST_NAME" "$LAUNCH_AGENTS/"
launchctl load "$LAUNCH_AGENTS/$PLIST_NAME"

if [ $? -eq 0 ]; then
    echo "        ✅ LaunchAgent installed and loaded"
else
    echo "        ⚠️  LaunchAgent may need manual loading"
fi
echo ""

# --- Step 5: Verify ---
echo "  [5/5] Verifying installation..."
AGENT_LOADED=$(launchctl list | grep "com.oat.wifiattendance" 2>/dev/null)
if [ -n "$AGENT_LOADED" ]; then
    echo "        ✅ LaunchAgent is running!"
else
    echo "        ⚠️  LaunchAgent not detected (may need restart)"
fi
echo ""

# --- Done! ---
echo "  ======================================================"
echo "  🎉 SETUP COMPLETE!"
echo "  ======================================================"
echo ""
echo "  📁 Files installed to: $OAT_DIR"
echo "  🔄 LaunchAgent: Active"
echo "  📡 WiFi trigger: 'corp' network (NetApp)"
echo ""
echo "  ✅ Your attendance will auto-mark every time"
echo "     you connect to office WiFi. No action needed!"
echo ""
echo "  🌐 Tracker: $GITHUB_BASE"
echo "  ======================================================"
echo ""

# Open the tracker to confirm
open "$GITHUB_BASE/?automark=true"

echo "  Opening tracker in browser..."
echo ""
if $IS_INTERACTIVE; then
    read -p "  Press Enter to close this window..."
else
    echo "  ✅ All done! You can close this terminal."
fi
