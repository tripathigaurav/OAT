# 📅 OAT — Office Attendance Tracker

Auto-track your Q1 office attendance via office WiFi detection.

**Live App:** https://tripathigaurav.github.io/OAT

---

## Features

- 📆 Visual calendar tracker (April–July 2026, target: 39 days)
- 🤖 Auto-marks attendance when connected to office WiFi (`corp`)
- 🛡️ VPN false-positive protection — requires both WiFi SSID **and** NetApp DNS match
- 🌙 Dark / light theme toggle
- 💬 Feedback via email
- 🔄 Stale setup detection with one-click update prompt
- 📡 Backfill past days from WiFi logs (Windows)

---

## Setup — Auto WiFi Tracking

### 🍎 Mac

Open **Terminal** and run:

```bash
curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash
```

- Installs scripts to `~/.oat/` (safe local path, not iCloud/OneDrive synced)
- Registers a LaunchAgent that runs on every network change

### 🪟 Windows

Open **PowerShell** (`Win+R` → type `powershell` → Enter) and run:

```powershell
irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex
```

> ⚠️ Must use **PowerShell** — not Command Prompt or Windows Terminal (unless PowerShell profile)

- Installs scripts to `%LOCALAPPDATA%\OAT\` (safe local path, not OneDrive synced)
- Registers a Scheduled Task that runs on network change and login

---

## How WiFi Detection Works

The scripts require **both** conditions to be true before marking attendance:

| Check | Detail |
|---|---|
| WiFi SSID | Must equal `corp` (case-insensitive) |
| DNS domain | Must resolve `wlan.netapp.com` |

This prevents false positives from:
- **VPN from home** — NetApp DNS is pushed via VPN but SSID stays as home WiFi → ❌ blocked
- **Home WiFi renamed `corp`** — SSID matches but no NetApp DNS → ❌ blocked

If WiFi SSID is undetectable (wired ethernet), DNS alone is used as fallback.

---

## Uninstall

### Mac
```bash
launchctl unload ~/Library/LaunchAgents/com.oat.wifiattendance.plist
rm -rf ~/.oat ~/Library/LaunchAgents/com.oat.wifiattendance.plist
```

### Windows (PowerShell)
```powershell
schtasks /Delete /TN "OAT-WiFiAttendance" /F
Remove-Item -Recurse "$env:LOCALAPPDATA\OAT"
```

---

## Project Structure

```
OAT/
├── index.html              # Main web app
├── css/styles.css          # Styles (dark + light mode)
├── js/app.js               # App logic
├── auto-attendance.sh      # Mac WiFi detection script
├── auto-attendance.ps1     # Windows WiFi detection script
├── auto-attendance-task.xml # Windows Scheduled Task definition
├── com.oat.wifiattendance.plist # macOS LaunchAgent definition
├── install-mac.command     # Mac one-click installer
├── install-win.ps1         # Windows one-click installer
└── install-win.bat         # Windows fallback installer (double-click)
```

---

## Known Issues & Fixes

| Issue | Fix |
|---|---|
| `'irm' is not recognized` error on Windows | Use **PowerShell**, not Command Prompt |
| Attendance marked while working from home | Re-run installer to get VPN fix (requires both SSID + DNS) |
| LaunchAgent blocked on Mac | Scripts must be in `~/.oat/`, not Desktop (OneDrive/iCloud blocks execution) |
| Scheduled Task needs admin on Windows | Use `schtasks /Create` (no admin needed for user-level tasks) |

---

## Contact

Feedback: 💬 button in the app (opens Outlook to gtripath@netapp.com)
