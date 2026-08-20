# 📅 OAT — Office Attendance Tracker

Auto-track your office attendance via office WiFi detection. Covers Q1–Q4 2026–27.

**Live App:** https://tripathigaurav.github.io/OAT

---

## Features

- 📆 Visual calendar tracker across **Q1–Q4 2026–27** (auto-switches quarter when one ends)
- 🤖 Auto-marks attendance when connected to office WiFi (`corp` + NetApp DNS)
- 🛡️ VPN false-positive protection — requires both WiFi SSID **and** NetApp DNS match
- 📝 Mark / unmark days manually on the calendar (with confirmation)
- 🌴 Leave / PTO tracking via the Leave button — supports single days and date ranges
- 🔄 Auto-advance to next quarter when the current one ends (no user action needed)
- 📊 Trends view and Office Data panel per quarter
- 📡 **Mark Today** button — mark today yourself if the WiFi check didn't fire
- 🔓 Unmark a wrongly auto-marked day *(opt-in via ⚙️ Settings)*
- 🎂 Birthday reminders for the team
- 🛠️ Works fully in manual mode if no admin rights *(Windows)*
- 🐛 **Report Issue** button — collects full diagnostic logs and opens Teams chat
  - Full office day list (auto vs manual), leave days, unmarked workdays
  - Complete auto-mark log, script version & last-run time, all quarters summary
- 🔧 Diagnose auto-tracking health from ⚙️ Settings

---

## Setup — Auto WiFi Tracking

### 🍎 Mac

Open **Terminal** and run:

```bash
curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash
```

- Installs scripts to `~/.oat/` (safe local path, not iCloud/OneDrive synced)
- Registers a LaunchAgent that runs on every network change

**Already installed? Update to the latest version:**

```bash
curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash
```

- Re-downloads the latest scripts
- Restarts the LaunchAgent
- Runs a health check and shows the result
- Your attendance data is untouched

### 🪟 Windows

Open **PowerShell** (`Win+R` → type `powershell` → Enter) and run:

```powershell
irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex
```

> ⚠️ Must use **PowerShell** — not Command Prompt or Windows Terminal (unless PowerShell profile)

- Installs scripts to `%LOCALAPPDATA%\OAT\` (safe local path, not OneDrive synced)
- Registers a Scheduled Task that triggers on WiFi connect and login (no admin required)
- Falls back to manual mode silently if task registration isn't available

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

## Manual Mode (Windows)

If the Scheduled Task can't be registered, the app still works fully in **Manual Mode**:

- ✅ Click **📡 Mark Today** in the app → marks today as an office day
- ✅ Manually check/uncheck days on the calendar anytime
- ✅ Test detection any time:
  ```
  powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\OAT\auto-attendance.ps1" --dry-run
  ```
  Prints SSID, DNS match and every guard, then says exactly what it would do.

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
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\OAT" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\Desktop\OAT" -ErrorAction SilentlyContinue
Remove-Item -Force "$env:TEMP\oat-automark-*.lock" -ErrorAction SilentlyContinue
```
> The `Desktop\OAT` path only exists if you used the old `install-win.bat` (now removed).

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
└── install-win.ps1         # Windows one-click installer
```

---

## Known Issues & Fixes

| Issue | Fix |
|---|---|
| `'irm' is not recognized` error on Windows | Use **PowerShell**, not Command Prompt |
| `running scripts is disabled on this system` | Prefix the command with `powershell -ExecutionPolicy Bypass -File ...` |
| Scheduled Task didn't install → manual mode shown | Normal on some corporate machines. Use **📡 Mark Today** in the app, or mark days on the calendar |
| Task installed but nothing ever marks | Check the task's path matches where the script actually is:<br>`(Get-ScheduledTask -TaskName OAT-WiFiAttendance).Actions \| Format-List`<br>then `dir "$env:LOCALAPPDATA\OAT"`. Caused by the old `install-win.bat`, now removed — re-run the PowerShell installer |
| Attendance marked while working from home | Re-run installer — VPN fix requires both SSID `corp` + NetApp DNS to match |
| LaunchAgent blocked on Mac | Scripts must be in `~/.oat/`, not Desktop (OneDrive/iCloud blocks execution) |
| OAT site didn't open on WiFi connect (Windows) | Re-run installer — previous versions had a task XML encoding bug (fixed in May 2026) |

---

## Contact

Use the **🐛 Report** button in the app — choose **Report Issue** to auto-collect diagnostic logs and open a Teams chat, or **Just Chat** to message directly.
