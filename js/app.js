// Configuration
const REQUIRED_SCRIPT_VERSION = '2.3'; // Bump this to force update prompts

// ── Quarter definitions ───────────────────────────────────────────
const QUARTERS = {
    Q1: {
        label: 'Q1',
        display: 'Q1 · Apr 27 – Jul 31, 2026',
        start: new Date(2026, 3, 27),
        end:   new Date(2026, 6, 31),
        target: 39,
        holidays: [
            { date: '2026-05-01', name: 'May Day' },
            { date: '2026-05-28', name: 'Bakrid' },
            { date: '2026-07-06', name: 'Global Wellbeing Day' },
        ]
    },
    Q2: {
        label: 'Q2',
        display: 'Q2 · Aug 3 – Oct 30, 2026',
        start: new Date(2026, 7, 3),
        end:   new Date(2026, 9, 30),
        target: 39,
        holidays: [
            { date: '2026-08-15', name: 'Independence Day' },
            { date: '2026-09-04', name: 'Global Wellbeing Day' },
            { date: '2026-09-14', name: 'Varasiddhi Vinayaka Vrata' },
            { date: '2026-10-02', name: 'Gandhi Jayanthi' },
            { date: '2026-10-21', name: 'Vijaya Dasham' },
        ]
    },
    Q3: {
        label: 'Q3',
        display: 'Q3 · Nov 2, 2026 – Jan 29, 2027',
        start: new Date(2026, 10, 2),
        end:   new Date(2027, 0, 29),
        target: 36,
        holidays: [
            { date: '2026-11-10', name: 'Deepavali' },
            { date: '2026-12-25', name: 'Christmas Day' },
            { date: '2026-12-28', name: 'Global Shutdown' },
            { date: '2026-12-29', name: 'Global Shutdown' },
            { date: '2026-12-30', name: 'Global Shutdown' },
            { date: '2026-12-31', name: 'Global Shutdown' },
        ]
    },
    Q4: {
        label: 'Q4',
        display: 'Q4 · Feb 1 – Apr 30, 2027',
        start: new Date(2027, 1, 1),
        end:   new Date(2027, 3, 30),
        target: 39,
        holidays: []
    }
};

// ── Active quarter ────────────────────────────────────────────────
let currentQKey = localStorage.getItem('oatCurrentQuarter') || autoDetectQuarter();

function autoDetectQuarter() {
    const today = new Date();
    for (const [key, q] of Object.entries(QUARTERS)) {
        if (today >= q.start && today <= q.end) return key;
    }
    // Default to the closest future quarter, or Q1 if all past
    const future = Object.entries(QUARTERS).find(([, q]) => today < q.start);
    return future ? future[0] : 'Q1';
}

function getQ() { return QUARTERS[currentQKey]; }

// ── Derived quarter values (replaces old constants) ───────────────
function TARGET()    { return getQ().target; }
function startDate() { return getQ().start; }
function endDate()   { return getQ().end; }
function holidays()  { return getQ().holidays; }

function getMonthsForQuarter(q) {
    const months = [];
    let y = q.start.getFullYear();
    let m = q.start.getMonth();
    const endY = q.end.getFullYear();
    const endM = q.end.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
        const name = new Date(y, m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        months.push({ year: y, month: m, name });
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
}

// ── Quarter-namespaced localStorage ──────────────────────────────
function qKey(base) { return `${base}_${currentQKey}`; }

// ── Migrate legacy data (pre-multi-quarter users) ─────────────────
(function migrateOldData() {
    if (!localStorage.getItem('officeDays_Q1') && localStorage.getItem('officeDays')) {
        localStorage.setItem('officeDays_Q1', localStorage.getItem('officeDays'));
    }
    if (!localStorage.getItem('autoMarkedDays_Q1') && localStorage.getItem('autoMarkedDays')) {
        localStorage.setItem('autoMarkedDays_Q1', localStorage.getItem('autoMarkedDays'));
    }
})();

// State
let checkedDays    = JSON.parse(localStorage.getItem(qKey('officeDays'))     || '{}');
let autoMarkedDays = JSON.parse(localStorage.getItem(qKey('autoMarkedDays')) || '{}');
let leaveDays      = JSON.parse(localStorage.getItem(qKey('leaveDays'))     || '{}');
const OFFICE_WIFI_SSID = 'corp'; // Fixed — NetApp office WiFi
let settings = JSON.parse(localStorage.getItem('oatSettings') || '{"autoMarkEnabled":true,"allowWeekendMark":false}');
settings.wifiSSID = OFFICE_WIFI_SSID; // Always enforce corp, regardless of saved value
let autoMarkLog = JSON.parse(localStorage.getItem('autoMarkLog') || '[]');

// Utility functions
function isHoliday(dateStr) {
    return holidays().some(h => h.date === dateStr);
}

function getHolidayName(dateStr) {
    const h = holidays().find(h => h.date === dateStr);
    return h ? h.name : '';
}

function isInRange(date) {
    return date >= startDate() && date <= endDate();
}

function formatDate(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTodayStr() {
    const today = new Date();
    return formatDate(today.getFullYear(), today.getMonth(), today.getDate());
}

function isTodayWorkday() {
    const today = new Date();
    const todayStr = getTodayStr();
    // Weekends are valid for auto-mark (WiFi detected = always register)
    // The allowWeekendMark toggle only controls manual calendar clicks
    return isInRange(today) && !isHoliday(todayStr);
}

// ---- Quarter Switcher ────────────────────────────────────────────
function switchQuarter(key) {
    if (!QUARTERS[key]) return;
    currentQKey = key;
    localStorage.setItem('oatCurrentQuarter', key);
    checkedDays    = JSON.parse(localStorage.getItem(qKey('officeDays'))     || '{}');
    autoMarkedDays = JSON.parse(localStorage.getItem(qKey('autoMarkedDays')) || '{}');
    leaveDays      = JSON.parse(localStorage.getItem(qKey('leaveDays'))     || '{}');
    updateQuarterBadge();
    closeQuarterDropdown();
    renderCalendars();
}

function updateQuarterBadge() {
    const badge = document.getElementById('quarterBadge');
    if (badge) badge.textContent = currentQKey + ' ▾';
}

function toggleQuarterDropdown() {
    const dd = document.getElementById('quarterDropdown');
    if (!dd) return;
    const open = dd.classList.toggle('open');
    if (open) {
        dd.innerHTML = Object.values(QUARTERS).map(q =>
            `<button class="q-option${q.label === currentQKey ? ' active' : ''}"
                     onclick="switchQuarter('${q.label}')">${q.label}<span class="q-display">${q.display.replace(/^Q\d · /, '')}</span></button>`
        ).join('');
    }
}

function closeQuarterDropdown() {
    const dd = document.getElementById('quarterDropdown');
    if (dd) dd.classList.remove('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('#quarterBadge') && !e.target.closest('#quarterDropdown')) {
        closeQuarterDropdown();
    }
});

// ---- Auto-Mark Logic ----
function autoMarkToday() {
    const todayStr = getTodayStr();

    if (!isTodayWorkday()) {
        showNotification('📅 Today is not a working day — no auto-mark needed.', 'info');
        return;
    }

    if (checkedDays[todayStr]) {
        if (autoMarkedDays[todayStr]) {
            showNotification('🤖 Today was already auto-marked! You\'re all set.', 'already');
        } else {
            showNotification('✅ Today was already manually marked. No changes made.', 'already');
        }
        return;
    }

    // Mark today
    checkedDays[todayStr] = true;
    autoMarkedDays[todayStr] = true;
    // Attendance overrides leave
    if (leaveDays[todayStr]) {
        delete leaveDays[todayStr];
        saveLeaveDays();
    }
    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));

    // Log it
    const logEntry = `${new Date().toLocaleString()} — Auto-marked ${todayStr} (WiFi: ${settings.wifiSSID})`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 30) autoMarkLog.pop();
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));

    showNotification(`🤖 Auto-marked attendance for today (${todayStr}) via office WiFi!`, 'success');
    renderCalendars();
}

function showNotification(message, type) {
    const notif = document.getElementById('wifiNotification');
    const text = document.getElementById('wifiNotifText');
    if (notif && text) {
        text.textContent = message;
        notif.className = `wifi-notification ${type}`;
        notif.style.display = 'flex';
        // Auto-dismiss after 8 seconds
        setTimeout(() => { notif.style.display = 'none'; }, 8000);
    }
}

function dismissNotification() {
    document.getElementById('wifiNotification').style.display = 'none';
}

function rescanToday() {
    const todayStr = getTodayStr();
    if (!isTodayWorkday()) {
        showNotification('📅 Today is not a working day — nothing to mark.', 'info');
        return;
    }
    if (checkedDays[todayStr]) {
        const type = autoMarkedDays[todayStr] ? '🤖 auto-marked' : '✅ manually marked';
        showNotification(`Already ${type} for today. You're all set!`, 'already');
        return;
    }

    // Check if WiFi script confirmed office connection today
    const scriptActive = localStorage.getItem('oatScriptActive');
    let wifiConfirmedToday = false;
    if (scriptActive) {
        const activeDate = new Date(scriptActive);
        const today = new Date();
        wifiConfirmedToday = activeDate.toDateString() === today.toDateString();
    }

    // Mark today
    checkedDays[todayStr] = true;
    autoMarkedDays[todayStr] = wifiConfirmedToday;
    if (leaveDays[todayStr]) {
        delete leaveDays[todayStr];
        saveLeaveDays();
    }
    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
    const source = wifiConfirmedToday ? 'WiFi confirmed' : 'Manual override (no WiFi)';
    const logEntry = `${new Date().toLocaleString()} — Mark Today: ${todayStr} (${source})`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 30) autoMarkLog.pop();
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));
    const icon = wifiConfirmedToday ? '📡' : '✅';
    showNotification(`${icon} Marked today (${todayStr}) as office day!`, 'success');
    renderCalendars();
}

// ---- Settings ----
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const infoPanel = document.getElementById('infoMiniPanel');
    if (infoPanel) infoPanel.style.display = 'none';
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
        loadSettingsUI();
    }
}

function toggleInfoMini() {
    const panel = document.getElementById('infoMiniPanel');
    const settings = document.getElementById('settingsPanel');
    if (!panel) return;
    if (settings) settings.style.display = 'none';
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function loadSettingsUI() {
    document.getElementById('autoMarkEnabled').checked = settings.autoMarkEnabled !== false;
    document.getElementById('allowWeekendMark').checked = settings.allowWeekendMark === true;

    // Show "Run WiFi Check Now" only for Windows users
    const os = detectOS();
    const runBox = document.getElementById('winManualRunBox');
    if (runBox) runBox.style.display = os === 'windows' ? 'block' : 'none';

    // ---- Auto-tracking status for Windows ----
    if (os === 'windows') {
        const hasScheduledTask = localStorage.getItem('oatScheduledTaskInstalled') === 'true';
        const statusBox = document.getElementById('autoTrackStatusBox');
        const statusIndicator = document.getElementById('statusIndicator');
        const manualModeNote = document.getElementById('manualModeNote');
        const manualModeGuide = document.getElementById('manualModeGuide');
        const autoMarkModeHint = document.getElementById('autoMarkModeHint');

        if (hasScheduledTask) {
            // Automatic mode
            if (statusBox) statusBox.style.display = 'block';
            if (statusIndicator) statusIndicator.innerHTML = '✅ <strong>Auto-Tracking Active</strong> — Runs automatically on WiFi connect';
            if (statusIndicator) statusIndicator.className = 'status-indicator active';
            if (manualModeNote) manualModeNote.style.display = 'none';
            if (manualModeGuide) manualModeGuide.style.display = 'none';
            if (autoMarkModeHint) autoMarkModeHint.textContent = '(automatic)';
        } else {
            // Manual mode
            if (statusBox) statusBox.style.display = 'block';
            if (statusIndicator) statusIndicator.innerHTML = '⚠️ <strong>Manual Mode</strong> — Use buttons to check/backfill';
            if (statusIndicator) statusIndicator.className = 'status-indicator manual';
            if (manualModeNote) manualModeNote.style.display = 'block';
            if (manualModeGuide) manualModeGuide.style.display = 'block';
            if (autoMarkModeHint) autoMarkModeHint.textContent = '(not active — scheduled task not installed)';
        }
    }

    const logEl = document.getElementById('autoMarkLog');
    const logBtn = document.getElementById('checkAutoLogBtn');
    if (logEl) logEl.style.display = 'none';
    if (logBtn) logBtn.textContent = '📋 Check Log';

    renderAutoMarkLog();
}

function saveSettings() {
    settings.wifiSSID = OFFICE_WIFI_SSID; // Always corp
    settings.autoMarkEnabled = document.getElementById('autoMarkEnabled').checked;
    settings.allowWeekendMark = document.getElementById('allowWeekendMark').checked;
    localStorage.setItem('oatSettings', JSON.stringify(settings));
    renderCalendars();
    showNotification('⚙️ Settings saved!', 'success');
}

function clearAutoMarkLog() {
    if (!confirm('Clear the auto-mark activity log? This only removes the log display — your attendance data is not changed.')) return;
    autoMarkLog = [];
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));
    renderAutoMarkLog();
    showNotification('🗑 Auto-mark log cleared.', 'info');
}

function toggleAutoMarkLog() {
    const logEl = document.getElementById('autoMarkLog');
    const logBtn = document.getElementById('checkAutoLogBtn');
    if (!logEl || !logBtn) return;

    const hidden = logEl.style.display === 'none' || logEl.style.display === '';
    logEl.style.display = hidden ? 'block' : 'none';
    logBtn.textContent = hidden ? '🙈 Hide Log' : '📋 Check Log';
}

function copyUninstallCommand() {
    const os = detectOS();
    const statusEl = document.getElementById('uninstallStatus');
    const cmd = os === 'windows'
        ? 'Unregister-ScheduledTask -TaskName "OAT-WiFiAttendance" -Confirm:$false -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force "$env:LOCALAPPDATA\\OAT" -ErrorAction SilentlyContinue'
        : 'launchctl unload ~/Library/LaunchAgents/com.oat.wifiattendance.plist 2>/dev/null; rm -f ~/Library/LaunchAgents/com.oat.wifiattendance.plist; rm -rf ~/.oat';

    navigator.clipboard.writeText(cmd).then(() => {
        if (statusEl) {
            statusEl.textContent = os === 'windows'
                ? '✅ Command copied. Paste in PowerShell and press Enter.'
                : '✅ Command copied. Paste in Terminal and press Enter.';
            statusEl.style.color = '#55efc4';
        }
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (statusEl) {
            statusEl.textContent = os === 'windows'
                ? '✅ Command copied. Paste in PowerShell and press Enter.'
                : '✅ Command copied. Paste in Terminal and press Enter.';
            statusEl.style.color = '#55efc4';
        }
    });
}

function wipeOATBrowserData() {
    const ok = confirm('Delete all OAT data from this browser?\n\nThis will remove attendance marks, logs, settings, and onboarding state.');
    if (!ok) return;

    localStorage.removeItem('officeDays');
    localStorage.removeItem('autoMarkedDays');
    // Remove quarter-scoped leave keys
    Object.keys(QUARTERS).forEach(qk => {
        localStorage.removeItem('leaveDays_' + qk);
    });
    localStorage.removeItem('oatSettings');
    localStorage.removeItem('autoMarkLog');
    localStorage.removeItem('oatOnboarded');
    localStorage.removeItem('oatScriptActive');
    localStorage.removeItem('oatScriptVersion');
    localStorage.removeItem('oatScheduledTaskInstalled');
    localStorage.removeItem('oatTheme');
    localStorage.removeItem('oatUserName');
    localStorage.removeItem('oatUpdateDismissed');
    sessionStorage.removeItem('oatPopupDismissed');

    alert('OAT browser data deleted. The page will reload now.');
    window.location.href = window.location.pathname + '?newuser=true';
}

// ── Diagnostic Panel ─────────────────────────────────────
function toggleDiagnostic() {
    const panel = document.getElementById('diagPanel');
    if (!panel) return;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) renderDiagnostic();
}

function renderDiagnostic() {
    const os = detectOS();
    const scriptActive   = localStorage.getItem('oatScriptActive');
    const scriptVer      = localStorage.getItem('oatScriptVersion');
    const lastRun        = scriptActive ? new Date(scriptActive) : null;
    const now            = new Date();
    const daysSinceRun   = lastRun ? Math.floor((now - lastRun) / 86400000) : null;
    const autoEnabled    = settings.autoMarkEnabled !== false;
    const totalAutoMarks = Object.keys(autoMarkedDays).length;
    const recentLog      = autoMarkLog.slice(0, 3);

    // ── Status rows ──
    const rows = [];

    // OS
    rows.push(diagRow(os === 'mac' ? '🍎' : os === 'windows' ? '🪟' : '💻',
        'OS detected', os === 'mac' ? 'macOS' : os === 'windows' ? 'Windows' : os, 'ok'));

    // Script ever ran
    if (lastRun) {
        const status = daysSinceRun === 0 ? 'ok' : daysSinceRun <= 3 ? 'warn' : 'err';
        rows.push(diagRow('📡', 'Last script run',
            daysSinceRun === 0 ? 'Today ✓' : `${daysSinceRun} day${daysSinceRun > 1 ? 's' : ''} ago`, status));
    } else {
        rows.push(diagRow('📡', 'Last script run', 'Never — script may not be installed', 'err'));
    }

    // Script version
    if (scriptVer) {
        const ok = scriptVer === REQUIRED_SCRIPT_VERSION;
        rows.push(diagRow('🔢', 'Script version',
            `v${scriptVer}${ok ? ' ✓ (current)' : ` ⚠ (need v${REQUIRED_SCRIPT_VERSION})`}`,
            ok ? 'ok' : 'warn'));
    } else {
        rows.push(diagRow('🔢', 'Script version', 'Unknown — not recorded yet', 'warn'));
    }

    // Auto-mark enabled
    rows.push(diagRow(autoEnabled ? '✅' : '⏸️', 'Auto-mark setting',
        autoEnabled ? 'Enabled' : 'Paused (disabled in settings)', autoEnabled ? 'ok' : 'warn'));

    // Total auto-marks this quarter
    rows.push(diagRow('📅', 'Auto-marks this quarter', `${totalAutoMarks} day${totalAutoMarks !== 1 ? 's' : ''}`,
        totalAutoMarks > 0 ? 'ok' : 'warn'));

    // Recent log
    if (recentLog.length > 0) {
        rows.push(diagRow('📋', 'Recent activity', recentLog[0], 'ok'));
    }

    document.getElementById('diagStatus').innerHTML =
        `<div class="diag-rows">${rows.join('')}</div>`;

    // ── Reinstall command ──
    const RAW = 'https://raw.githubusercontent.com/tripathigaurav/OAT/main';
    let cmd = '', hint = '', openLabel = '';
    if (os === 'mac') {
        cmd = `bash <(curl -fsSL ${RAW}/install-mac.command)`;
        hint = 'Run in Terminal (Spotlight → Terminal)';
        openLabel = 'Open Terminal';
    } else if (os === 'windows') {
        cmd = `powershell -ExecutionPolicy Bypass -Command "irm ${RAW}/install-win.ps1 | iex"`;
        hint = 'Run via Win+R → paste → Enter  (bypasses execution policy)';
        openLabel = 'Open PowerShell';
    } else {
        cmd = `# Download install-mac.command or install-win.ps1 from the repo`;
        hint = 'OS not detected — download the installer manually';
    }

    const cmdEl  = document.getElementById('diagCmd');
    const hintEl = document.getElementById('diagHint');
    if (cmdEl)  cmdEl.textContent  = cmd;
    if (hintEl) hintEl.textContent = hint;

    // Store for copy
    window._diagCmd = cmd;
}

function diagRow(icon, label, value, status) {
    const color = status === 'ok' ? '#ADDB67' : status === 'warn' ? '#ECC48D' : '#FF6363';
    return `<div class="diag-row">
        <span class="diag-icon">${icon}</span>
        <span class="diag-key">${label}</span>
        <span class="diag-val" style="color:${color}">${value}</span>
    </div>`;
}

function copyDiagCmd() {
    const cmd = window._diagCmd || document.getElementById('diagCmd').textContent;
    navigator.clipboard.writeText(cmd).then(() => {
        const btn = document.getElementById('diagCopyBtn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
    });
}

function renderAutoMarkLog() {
    const logEl = document.getElementById('autoMarkLog');
    if (autoMarkLog.length === 0) {
        logEl.textContent = 'No auto-marks yet.';
    } else {
        // Use textContent per entry to prevent XSS
        logEl.innerHTML = '';
        autoMarkLog.forEach(entry => {
            const div = document.createElement('div');
            div.textContent = entry;
            logEl.appendChild(div);
        });
    }
}

// Toggle day selection
function toggleDay(dateStr) {
    // Block future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clickedDate = new Date(dateStr + 'T00:00:00');
    if (clickedDate > today) {
        showNotification('⛔ Cannot mark future dates. Come back on that day!', 'info');
        return;
    }
    // Block weekends unless setting is enabled
    const dow = clickedDate.getDay();
    if ((dow === 0 || dow === 6) && !settings.allowWeekendMark) {
        showNotification('⛔ Weekend marking is disabled. Enable it in ⚙️ Settings.', 'info');
        return;
    }
    // If day is on leave, first ask to remove leave (don't auto-mark attendance)
    if (leaveDays[dateStr] && !checkedDays[dateStr]) {
        if (!confirm(`🌴 This day is marked as leave. Remove leave for ${dateStr}?`)) return;
        delete leaveDays[dateStr];
        saveLeaveDays();
        renderCalendars();
        showNotification(`Removed leave for ${dateStr}. Click again to mark attendance.`, 'info');
        return;
    }
    if (checkedDays[dateStr]) {
        if (autoMarkedDays[dateStr]) {
            showNotification('🔒 This day was auto-marked via office WiFi and cannot be removed.', 'info');
            return;
        }
        if (!confirm(`Remove office attendance for ${dateStr}?`)) return;
        delete checkedDays[dateStr];
    } else {
        if (!confirm(`Mark ${dateStr} as an office day?`)) return;
        checkedDays[dateStr] = true;
    }
    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
    renderCalendars();
}

// Reset only manual selections (auto-marked days are preserved)
function resetAll() {
    const autoCount = Object.keys(autoMarkedDays).length;
    const manualCount = Object.keys(checkedDays).length - autoCount;
    const leaveCount = Object.keys(leaveDays).length;
    if (manualCount === 0 && leaveCount === 0) {
        showNotification('Nothing to reset — all marked days are WiFi auto-marks (locked).', 'info');
        return;
    }
    const extra = leaveCount > 0 ? `\n${leaveCount} leave day(s) will also be cleared.` : '';
    if (confirm(`Reset ${manualCount} manually marked day(s)?${extra}\n\n${autoCount} auto-marked day(s) will be preserved (WiFi-verified).`)) {
        const preserved = {};
        for (const dateStr of Object.keys(autoMarkedDays)) {
            preserved[dateStr] = true;
        }
        checkedDays = preserved;
        leaveDays = {};
        localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
        saveLeaveDays();
        renderCalendars();
        showNotification(`🔄 Reset ${manualCount} manual mark(s)${leaveCount > 0 ? ` + ${leaveCount} leave(s)` : ''}. ${autoCount} auto-mark(s) preserved.`, 'success');
    }
}

// Render calendars
function renderCalendars() {
    const container = document.getElementById('calendars');
    container.innerHTML = '';

    const months = getMonthsForQuarter(getQ());
    let totalWorkDays = 0;
    let totalOfficeDays = 0;
    let totalLeaveDays = 0;

    months.forEach(m => {
        const card = document.createElement('div');
        card.className = 'month-card';
        card.dataset.month = m.month;

        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const firstDay = new Date(m.year, m.month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1;

        let monthWorkDays = 0;
        let monthOfficeDays = 0;
        let monthHolidays = 0;
        let monthLeaveDays = 0;

        let daysHTML = '';

        for (let i = 0; i < startDay; i++) {
            daysHTML += `<div class="day-cell empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(m.year, m.month, day);
            const dateStr = formatDate(m.year, m.month, day);
            const dayOfWeek = date.getDay();
            const inRange = isInRange(date);
            const holiday = isHoliday(dateStr);
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;
            const isWeekend = isSaturday || isSunday;
            const checked = checkedDays[dateStr];
            const onLeave = leaveDays[dateStr] && !checked;

            let cellClass = 'day-cell';

            if (!inRange) {
                cellClass += ' before-range';
            } else if (holiday) {
                cellClass += ' holiday';
                monthHolidays++;
            } else if (isSaturday) {
                cellClass += ' saturday';
                if (inRange && checked) {
                    cellClass += autoMarkedDays[dateStr] ? ' auto-checked' : ' checked';
                    monthOfficeDays++; totalOfficeDays++;
                }
            } else if (isSunday) {
                cellClass += ' sunday';
                if (inRange && checked) {
                    cellClass += autoMarkedDays[dateStr] ? ' auto-checked' : ' checked';
                    monthOfficeDays++; totalOfficeDays++;
                }
            } else {
                cellClass += ' weekday';
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (date > today) {
                    cellClass += ' future';
                } else if (date.getTime() === today.getTime()) {
                    cellClass += ' today-cell';
                }
                monthWorkDays++;
                totalWorkDays++;
                if (checked) {
                    if (autoMarkedDays[dateStr]) {
                        cellClass += ' auto-checked';
                    } else {
                        cellClass += ' checked';
                    }
                    monthOfficeDays++;
                    totalOfficeDays++;
                } else if (onLeave) {
                    cellClass += ' leave';
                    monthLeaveDays++;
                    totalLeaveDays++;
                }
            }

            // Build tooltip
            let tooltip = '';
            if (holiday) {
                tooltip = `🎉 ${getHolidayName(dateStr)}`;
            } else if (isSaturday || isSunday) {
                if (checked) {
                    tooltip = autoMarkedDays[dateStr] ? '🔒 Auto-marked (WiFi verified)' : '✅ Weekend office day (click to remove)';
                } else if (settings.allowWeekendMark && inRange) {
                    const _tdn = new Date(); _tdn.setHours(0,0,0,0);
                    tooltip = date > _tdn ? 'Future date' : 'Weekend — click to mark';
                } else {
                    tooltip = 'Weekend';
                }
            } else if (inRange) {
                const today2 = new Date();
                today2.setHours(0, 0, 0, 0);
                if (date > today2) {
                    tooltip = onLeave ? '🌴 Leave/PTO (planned)' : 'Future date';
                } else if (checked) {
                    tooltip = autoMarkedDays[dateStr] ? '🔒 Auto-marked (WiFi verified)' : '✅ Office day (click to remove)';
                } else if (onLeave) {
                    tooltip = '🌴 Leave/PTO';
                } else {
                    tooltip = 'Workday (not marked)';
                }
            }

            const clickHandler = (!inRange || holiday || (isWeekend && !settings.allowWeekendMark)) ? '' : `onclick="toggleDay('${dateStr}')"`;
            const tipAttr = tooltip ? `data-tip="${tooltip}"` : '';

            daysHTML += `<div class="${cellClass}" ${clickHandler} ${tipAttr}>${day}</div>`;
        }

        const slotColors = ['#82aaff', '#c792ea', '#7fdbca', '#ecc48d'];
        const mColor = slotColors[months.indexOf(m)] || '#a5b4fc';
        card.dataset.monthSlot = months.indexOf(m);
        const leaveHTML = monthLeaveDays > 0
            ? `<div style="color:#ecc48d">🌴 Leaves: <strong style="font-family:'JetBrains Mono',monospace">${monthLeaveDays}</strong></div>`
            : '';
        card.innerHTML = `
            <div class="month-title">${m.name}</div>
            <div class="day-headers">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
                <span class="weekend-header">Sat</span>
                <span class="weekend-header">Sun</span>
            </div>
            <div class="days-grid">
                ${daysHTML}
            </div>
            <div class="month-summary">
                <div>📊 Working Days: <strong style="font-family:'JetBrains Mono',monospace;color:${mColor}">${monthWorkDays}</strong></div>
                <div style="color:#00b894">✅ Office: <strong style="font-family:'JetBrains Mono',monospace">${monthOfficeDays}</strong></div>
                ${leaveHTML}
                <div class="${monthHolidays > 0 ? 'summary-holidays' : 'summary-holidays summary-holidays--none'}">🎉 Holidays: <strong style="font-family:'JetBrains Mono',monospace">${monthHolidays > 0 ? monthHolidays : '—'}</strong></div>
            </div>
        `;

        container.appendChild(card);
    });

    // Update summary
    const remaining = Math.max(0, TARGET() - totalOfficeDays);
    const percentage = Math.min(100, Math.round((totalOfficeDays / TARGET()) * 100));

    // Update both pill IDs and any legacy IDs
    ['totalWorkDays', 'totalWorkDaysOld'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = totalWorkDays; });
    ['totalOfficeDays', 'totalOfficeDaysOld'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = totalOfficeDays; });
    ['remainingDays', 'remainingDaysOld'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = remaining; });
    const leaveEl = document.getElementById('totalLeaveDays');
    if (leaveEl) leaveEl.textContent = totalLeaveDays;
    // Update target pill
    const pillTarget = document.getElementById('pillTarget');
    if (pillTarget) { const sv = pillTarget.querySelector('.stat-value'); if (sv) sv.textContent = TARGET(); }

    // Working days left in quarter (today+1 → end, excluding weekends, holidays & leaves)
    const wdLeftEl = document.getElementById('workingDaysLeft');
    if (wdLeftEl) {
        const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
        const qStart = startDate();
        const qEnd   = endDate();
        const loopStart = todayMidnight < qStart ? new Date(qStart) : new Date(todayMidnight);
        let wdLeft = 0;
        if (todayMidnight <= qEnd) {
            for (let d = new Date(loopStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
                const dow = d.getDay();
                const ds  = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
                if (dow !== 0 && dow !== 6 && !isHoliday(ds) && !leaveDays[ds]) wdLeft++;
            }
        }
        wdLeftEl.textContent = wdLeft;
        // Colour: red if ≤10, amber if ≤20, blue otherwise
        const card = document.getElementById('pillWorkingLeft');
        if (card) {
            card.classList.remove('stat-card--rose', 'stat-card--amber', 'stat-card--blue');
            card.classList.add(wdLeft <= 10 ? 'stat-card--rose' : wdLeft <= 20 ? 'stat-card--amber' : 'stat-card--blue');
        }
    }

    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = percentage + '%';
    const progressLabel = document.getElementById('progressLabel');
    if (progressLabel) progressLabel.textContent = percentage + '%';

    const confetti = document.getElementById('confetti');
    const status = document.getElementById('targetStatus');

    if (totalOfficeDays >= TARGET()) {
        progressBar.className = 'progress-bar complete';
        confetti.style.display = 'block';
        status.innerHTML = '🏆 <strong>Target Achieved!</strong> You are a rockstar! 🌟';
        status.style.color = '#00b894';
        launchConfettiCanvas();
    } else if (totalOfficeDays >= TARGET() * 0.75) {
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        renderFlipCounter(status, remaining, '🔥 Almost there!', 'Keep pushing — you\'re so close!', '#fdcb6e');
    } else {
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        renderFlipCounter(status, remaining, 'DAYS TO GO', 'Keep showing up 💪', '#74b9ff');
    }
}

function renderFlipCounter(el, newVal, label, subtext, color) {
    const digits = String(newVal).padStart(2, '0').split('');
    const existing = el.querySelectorAll('.flip-digit');
    const oldDigits = existing.length ? Array.from(existing).map(d => d.textContent) : [];

    el.innerHTML = `
        <div class="flip-counter-wrap">
            <div class="flip-number">
                ${digits.map((d, i) => `<div class="flip-digit${d !== oldDigits[i] ? ' flip-animate' : ''}" style="color:${color};border-color:${color}44;">${d}</div>`).join('')}
                <div class="flip-inline-text">
                    <div class="flip-label" style="color:${color};">${label}</div>
                    <div class="flip-subtext">${subtext}</div>
                </div>
            </div>
        </div>`;
}

// ── New Feature Banner (auto-expires June 17 2026) ─────────────
function renderNewFeatureBanner() {
    const expiry = new Date('2026-06-13T18:00:00');
    if (new Date() > expiry) return;
    if (localStorage.getItem('oat-nf-dismissed')) return;
    const el = document.getElementById('newFeatureBannerC');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
        <div class="new-feature-banner new-feature-banner--big">
            <button class="nf-close" onclick="dismissNewFeature()" title="Dismiss">&times;</button>
            <span class="new-feature-pill">✨ What's New</span>
            <div class="new-feature-items">
                <span class="new-feature-item">🌴 <strong>Leave & PTO Tracking</strong> — Log your time off directly in OAT</span>
                <span class="new-feature-item">📊 <strong>Official Office Visit Dashboard</strong> — View your NetApp attendance data</span>
            </div>
        </div>`;
}
function dismissNewFeature() {
    const el = document.getElementById('newFeatureBannerC');
    if (el) el.style.display = 'none';
    localStorage.setItem('oat-nf-dismissed', '1');
}

// ── Leave / PTO Manager ──────────────────────────────────────────
let _leaveSelection = new Set();
let _leaveShiftAnchor = null;

function toggleLeavePanel() {
    const overlay = document.getElementById('leaveOverlay');
    const infoPanel = document.getElementById('infoMiniPanel');
    const settingsPanel = document.getElementById('settingsPanel');
    if (infoPanel) infoPanel.style.display = 'none';
    if (settingsPanel) settingsPanel.style.display = 'none';

    const isOpen = overlay.style.display === 'flex';
    overlay.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
        _leaveSelection.clear();
        _leaveShiftAnchor = null;
        renderLeaveCalendar();
    }
}

function renderLeaveCalendar() {
    const container = document.getElementById('leaveMonths');
    const q = getQ();
    container.innerHTML = '';

    document.getElementById('leaveQuarterLabel').textContent = q.display;

    const months = getMonthsForQuarter(q);
    months.forEach(m => {
        const card = document.createElement('div');
        card.className = 'leave-month-card';

        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const firstDay = new Date(m.year, m.month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1;

        let daysHTML = '';
        for (let i = 0; i < startDay; i++) {
            daysHTML += '<div class="leave-day leave-day--empty"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(m.year, m.month, day);
            const dateStr = formatDate(m.year, m.month, day);
            const dayOfWeek = date.getDay();
            const inRange = isInRange(date);
            const holiday = isHoliday(dateStr);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const hasLeave = leaveDays[dateStr];
            const hasOffice = checkedDays[dateStr];
            const isSelected = _leaveSelection.has(dateStr);

            let cls = 'leave-day';
            let clickable = true;
            let tooltip = '';

            if (!inRange) {
                cls += ' leave-day--disabled';
                clickable = false;
            } else if (holiday) {
                cls += ' leave-day--holiday leave-day--disabled';
                clickable = false;
                tooltip = getHolidayName(dateStr);
            } else if (isWeekend) {
                cls += ' leave-day--weekend leave-day--disabled';
                clickable = false;
                tooltip = 'Weekend';
            } else if (hasOffice) {
                cls += ' leave-day--has-office';
                clickable = false;
                tooltip = autoMarkedDays[dateStr] ? 'Office (WiFi verified)' : 'Office day';
            } else if (hasLeave) {
                cls += ' leave-day--has-leave';
                tooltip = 'On leave';
            }

            if (isSelected) cls += ' leave-day--selected';

            const onClick = clickable
                ? `onclick="toggleLeaveDate('${dateStr}', event)"`
                : '';
            const tipAttr = tooltip ? `title="${tooltip}"` : '';

            daysHTML += `<div class="${cls}" ${onClick} ${tipAttr}>${day}</div>`;
        }

        card.innerHTML = `
            <div class="leave-month-title">${m.name}</div>
            <div class="leave-day-headers">
                <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
            </div>
            <div class="leave-days-grid">${daysHTML}</div>
        `;
        container.appendChild(card);
    });

    updateLeaveSelectionBar();
    updateLeaveSummary();
}

function toggleLeaveDate(dateStr, event) {
    if (event && event.shiftKey && _leaveShiftAnchor) {
        const allDates = getSelectableLeaveDates();
        const anchorIdx = allDates.indexOf(_leaveShiftAnchor);
        const targetIdx = allDates.indexOf(dateStr);
        if (anchorIdx !== -1 && targetIdx !== -1) {
            const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
            for (let i = from; i <= to; i++) {
                _leaveSelection.add(allDates[i]);
            }
            renderLeaveCalendar();
            return;
        }
    }

    _leaveShiftAnchor = dateStr;

    if (_leaveSelection.has(dateStr)) {
        _leaveSelection.delete(dateStr);
    } else {
        _leaveSelection.add(dateStr);
    }
    renderLeaveCalendar();
}

function getSelectableLeaveDates() {
    const q = getQ();
    const months = getMonthsForQuarter(q);
    const dates = [];
    months.forEach(m => {
        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(m.year, m.month, day);
            const dateStr = formatDate(m.year, m.month, day);
            const dayOfWeek = date.getDay();
            if (!isInRange(date) || isHoliday(dateStr) || dayOfWeek === 0 || dayOfWeek === 6 || checkedDays[dateStr]) continue;
            dates.push(dateStr);
        }
    });
    return dates;
}

function updateLeaveSelectionBar() {
    const count = _leaveSelection.size;
    const el = document.getElementById('leaveSelectionCount');
    if (el) el.textContent = count === 0 ? 'No dates selected' : `${count} date${count > 1 ? 's' : ''} selected`;
}

function updateLeaveSummary() {
    const el = document.getElementById('leaveSummary');
    if (!el) return;
    const count = Object.keys(leaveDays).length;
    if (count === 0) {
        el.innerHTML = 'No leaves marked this quarter.';
        return;
    }
    const sorted = Object.keys(leaveDays).sort();
    const formatted = sorted.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    });
    el.innerHTML = `<strong>${count}</strong> leave day${count > 1 ? 's' : ''} this quarter: ${formatted.join(', ')}`;
}

function saveLeaveDays() {
    localStorage.setItem(qKey('leaveDays'), JSON.stringify(leaveDays));
}

function addSelectedLeaves() {
    if (_leaveSelection.size === 0) {
        showNotification('Select dates first, then click Add Leave.', 'info');
        return;
    }
    let added = 0;
    _leaveSelection.forEach(dateStr => {
        if (!checkedDays[dateStr] && !leaveDays[dateStr]) {
            leaveDays[dateStr] = true;
            added++;
        }
    });
    saveLeaveDays();
    _leaveSelection.clear();
    _leaveShiftAnchor = null;
    renderLeaveCalendar();
    renderCalendars();
    if (added > 0) {
        showNotification(`🌴 Added ${added} leave day${added > 1 ? 's' : ''}!`, 'success');
    } else {
        showNotification('No new leave days to add (already marked or office days).', 'info');
    }
}

function removeSelectedLeaves() {
    if (_leaveSelection.size === 0) {
        showNotification('Select dates first, then click Remove Leave.', 'info');
        return;
    }
    let removed = 0;
    _leaveSelection.forEach(dateStr => {
        if (leaveDays[dateStr]) {
            delete leaveDays[dateStr];
            removed++;
        }
    });
    saveLeaveDays();
    _leaveSelection.clear();
    _leaveShiftAnchor = null;
    renderLeaveCalendar();
    renderCalendars();
    if (removed > 0) {
        showNotification(`Removed ${removed} leave day${removed > 1 ? 's' : ''}.`, 'success');
    } else {
        showNotification('None of the selected dates had leave to remove.', 'info');
    }
}

// Close leave panel on overlay click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('leave-overlay')) {
        toggleLeavePanel();
    }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateQuarterBadge();
    renderCalendars();
    renderNewFeatureBanner();

    // Auto-scroll settings panel when a <details> dropdown opens
    // Uses capture phase because 'toggle' events don't bubble
    document.addEventListener('toggle', function(e) {
        if (!e.target.closest('.settings-panel')) return;
        if (!e.target.open) return;
        setTimeout(() => {
            const scrollContainer = document.querySelector('.settings-panel-scroll');
            if (!scrollContainer) return;
            const elRect = e.target.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            if (elRect.bottom > containerRect.bottom) {
                scrollContainer.scrollBy({ top: elRect.bottom - containerRect.bottom + 16, behavior: 'smooth' });
            }
        }, 100);
    }, true);

    // Check for auto-mark trigger via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('automark') === 'true') {
        // Record that the background script is working
        localStorage.setItem('oatScriptActive', new Date().toISOString());
        // Save script version so update card doesn't show after a successful run
        const sv = urlParams.get('scriptver');
        if (sv) localStorage.setItem('oatScriptVersion', sv);
        // Hide setup-reminder card since script is now confirmed working
        const reminderCard = document.getElementById('settingsSetupReminder');
        if (reminderCard) reminderCard.style.display = 'none';
        if (settings.autoMarkEnabled !== false) {
            autoMarkToday();
        }
        // If auto-mark is disabled, page still opens (by design) — just don't mark
        // Clean up URL (remove ?automark=true) without reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Check if this was opened from installer in manual mode
    const manualMode = urlParams.get('manual_mode');
    if (manualMode === 'true') {
        localStorage.setItem('oatScheduledTaskInstalled', 'false');
    } else if (manualMode === 'false') {
        localStorage.setItem('oatScheduledTaskInstalled', 'true');
    }

    // Check for backfill trigger via URL parameter (?backfill=2026-05-05,2026-05-06,...)
    const backfillDates = urlParams.get('backfill');
    if (backfillDates) {
        handleBackfill(backfillDates);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Show onboarding for first-time visitors (or ?newuser=true for demo)
    // Use original urlParams (before replaceState cleaned the URL)
    if (!localStorage.getItem('oatOnboarded') || urlParams.get('newuser') === 'true') {
        showOnboarding();
    }

    // Update setup status indicator
    updateSetupStatus();

    // Show update option quietly inside Settings (user-initiated, no popup/banner)
    showSettingsUpdateCard();

    // Show setup reminder if onboarded but script never ran
    showSettingsSetupReminder();

    // Check if existing users need to update their setup
    checkForStaleSetup();

    // Show user greeting if name is saved
    showUserGreeting();

    // Tooltip edge detection — prevent clipping at calendar left/right edges
    document.addEventListener('mouseover', function(e) {
        const cell = e.target.closest('.day-cell[data-tip]');
        if (!cell) return;
        cell.classList.remove('tip-left', 'tip-right');
        const rect = cell.getBoundingClientRect();
        const tipEstWidth = 220;
        if (rect.left - tipEstWidth / 2 < 8) {
            cell.classList.add('tip-left');
        } else if (rect.right + tipEstWidth / 2 > window.innerWidth - 8) {
            cell.classList.add('tip-right');
        }
    });
});

// OS tab switching in settings
function showOS(os, btn) {
    document.querySelectorAll('.os-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.os-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('os-' + os).style.display = 'block';
    if (btn) btn.classList.add('active');
}

// ---- Feedback ----
function openFeedback() {
    window.open('https://teams.microsoft.com/l/chat/0/0?users=Gaurav.Tripathi@netapp.com', '_blank');
}

// ---- Theme Toggle ----
function initTheme() {
    const saved = localStorage.getItem('oatTheme');
    const btn = document.getElementById('themeBtn');
    const icon = btn && (btn.querySelector('span') || btn);
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        if (icon) icon.textContent = '☀️';
    } else {
        if (icon) icon.textContent = '🌙';
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    const btn = document.getElementById('themeBtn');
    const icon = btn && (btn.querySelector('span') || btn);
    if (icon) icon.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('oatTheme', isLight ? 'light' : 'dark');
}

// ---- Onboarding Flow ----
function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('linux')) return 'linux';
    return 'unknown';
}

// ── Credit card 3D mouse tilt ────────────────────────────
(function initCreditCard() {
    function setup() {
        const card = document.getElementById('creditCard');
        if (!card) return;
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width  - 0.5;  // -0.5 to 0.5
            const y = (e.clientY - r.top)  / r.height - 0.5;
            card.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 14}deg) scale(1.04)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();

function isSetupAlreadyDone() {
    // Check multiple signals that suggest the script is already installed
    const scriptActive = localStorage.getItem('oatScriptActive');
    const hasAutoMarks = Object.keys(autoMarkedDays).length > 0;
    const hasAutoLog = autoMarkLog.length > 0;
    return !!(scriptActive || hasAutoMarks || hasAutoLog);
}

function getSetupStatusText() {
    const scriptActive = localStorage.getItem('oatScriptActive');
    const autoMarkCount = Object.keys(autoMarkedDays).length;

    if (scriptActive) {
        const lastRun = new Date(scriptActive);
        return `Last auto-mark trigger: ${lastRun.toLocaleDateString()} ${lastRun.toLocaleTimeString()}`;
    }
    if (autoMarkCount > 0) {
        return `${autoMarkCount} day(s) auto-marked so far`;
    }
    return '';
}

function updateSetupStatus() {
    const badge = document.getElementById('setupStatusBadge');
    if (!badge) return;

    const onboarded = localStorage.getItem('oatOnboarded');
    const scriptActive = localStorage.getItem('oatScriptActive');

    if (isSetupAlreadyDone()) {
        if (settings.autoMarkEnabled === false) {
            badge.className = 'setup-status-badge paused';
            badge.innerHTML = '⏸️ Auto-tracking paused';
            badge.title = 'Auto-marking is disabled. Enable it in ⚙️ Settings.';
            badge.style.display = 'inline-flex';
            badge.style.cursor = 'pointer';
            badge.onclick = () => toggleSettings();
        } else {
            badge.className = 'setup-status-badge active';
            badge.innerHTML = '🤖 Auto-tracking active';
            badge.title = getSetupStatusText();
            badge.style.display = 'inline-flex';
            badge.onclick = null;
        }
    } else if (onboarded === 'completed' && !scriptActive) {
        // User finished onboarding but script has never fired — silent failure
        badge.className = 'setup-status-badge stale';
        badge.innerHTML = '⚠️ Setup not confirmed';
        badge.title = 'The auto-tracking script has not run yet. Open ⚙️ Settings to verify.';
        badge.style.display = 'inline-flex';
        badge.style.cursor = 'pointer';
        badge.onclick = () => toggleSettings();
    } else {
        badge.style.display = 'none';
        badge.onclick = null;
    }
}

// ---- Stale Setup Detection & Reinstall ----
function checkForStaleSetup() { return; } // v2.2: auto-prompts disabled — update card shown in settings only

// Show update option quietly inside Settings only (user-initiated)
// Only shown if script is installed but version is old or unknown
function showSettingsUpdateCard() {
    const scriptActive = localStorage.getItem('oatScriptActive');
    const scriptVer = localStorage.getItem('oatScriptVersion');
    // No script ever ran — nothing to update
    if (!scriptActive) return;
    // Script is already on the required version — hide the card
    if (scriptVer === REQUIRED_SCRIPT_VERSION) return;
    const card = document.getElementById('settingsUpdateCard');
    if (card) card.style.display = 'flex';
    const dot = document.getElementById('settingsUpdateDot');
    if (dot) dot.style.display = 'block';
}

// Show a reminder card in Settings when user onboarded but script never ran
function showSettingsSetupReminder() {
    const onboarded = localStorage.getItem('oatOnboarded');
    const scriptActive = localStorage.getItem('oatScriptActive');
    if (onboarded === 'completed' && !scriptActive) {
        const card = document.getElementById('settingsSetupReminder');
        if (card) card.style.display = 'flex';
        const dot = document.getElementById('settingsUpdateDot');
        if (dot) dot.style.display = 'block';
    }
}
function isSetupStale() {
    // Check if user had setup before but it hasn't triggered recently
    const scriptActive = localStorage.getItem('oatScriptActive');
    const onboarded = localStorage.getItem('oatOnboarded');
    const dismissed = localStorage.getItem('oatUpdateDismissed');

    // Not an existing user — skip
    if (!onboarded && !scriptActive && Object.keys(autoMarkedDays).length === 0) return false;

    // User dismissed the banner today — don't nag
    if (dismissed) {
        const dismissDate = new Date(dismissed);
        const today = new Date();
        if (dismissDate.toDateString() === today.toDateString()) return false;
    }

    // If the page was opened via ?automark=true, script is working — save version & not stale
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('automark') === 'true') {
        const sv = urlParams.get('scriptver');
        if (sv) localStorage.setItem('oatScriptVersion', sv);
        return false;
    }

    // Windows users with an old script version need to update
    const scriptVer = localStorage.getItem('oatScriptVersion');
    const onWindows = /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
    const onMac = /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
    if (onWindows && scriptVer && scriptVer !== REQUIRED_SCRIPT_VERSION) return true;
    // Windows users who have run the old script (no version stored) also need update
    if (onWindows && scriptActive && !scriptVer) return true;
    // Mac users who have an old script (no version stored) need update
    if (onMac && scriptVer && scriptVer !== REQUIRED_SCRIPT_VERSION) return true;
    if (onMac && scriptActive && !scriptVer) return true;

    // If last auto-mark trigger was more than 3 days ago on a workday, setup is likely broken
    if (scriptActive) {
        const lastRun = new Date(scriptActive);
        const now = new Date();
        const daysSince = Math.floor((now - lastRun) / (1000 * 60 * 60 * 24));
        // Count how many workdays have passed since last trigger
        if (daysSince >= 3) return true;
    }

    // User completed onboarding but script never triggered at all
    if (onboarded === 'completed' && !scriptActive) return true;

    return false;
}

// checkForStaleSetup() is defined above (stub) — auto-prompts disabled in v2.2

function showUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (!banner) return;

    const scriptActive = localStorage.getItem('oatScriptActive');
    const detail = document.getElementById('updateBannerDetail');
    if (detail) {
        if (scriptActive) {
            detail.textContent = 'A new update is available that improves auto-tracking reliability. Quick one-click fix!';
        } else {
            detail.textContent = 'A new update is available to get your auto-tracking working. Quick one-click fix!';
        }
    }
    banner.style.display = 'block';

    // Show notification dot on settings gear + card inside settings
    const dot = document.getElementById('settingsUpdateDot');
    if (dot) dot.style.display = 'block';
    const card = document.getElementById('settingsUpdateCard');
    if (card) card.style.display = 'flex';

    // Also update the status badge to show warning
    const badge = document.getElementById('setupStatusBadge');
    if (badge) {
        badge.className = 'setup-status-badge stale';
        badge.innerHTML = '🔄 Update available';
    }
}

function reopenUpdatePopup() {
    sessionStorage.removeItem('oatPopupDismissed');
    const popup = document.getElementById('updatePopupOverlay');
    if (popup) popup.style.display = 'flex';
    // Reset modal content in case it was replaced by copied state
    const modal = popup && popup.querySelector('.update-popup-modal');
    if (modal && !modal.querySelector('.update-popup-features')) {
        const scriptActive = localStorage.getItem('oatScriptActive');
        modal.innerHTML = `
            <div class="update-popup-icon">🔄</div>
            <h2>Update Available!</h2>
            <p class="update-popup-desc">${scriptActive ? 'A new version of OAT is ready with important improvements:' : 'Your auto-tracking needs a quick update to get working:'}</p>
            <ul class="update-popup-features">
                <li>🍎 Mac: Browser now opens automatically on office WiFi connect</li>
                <li>🔍 Improved SSID detection — 4-method fallback for macOS Ventura+</li>
                <li>🛡️ Stronger VPN false-positive protection (SSID + DNS both required)</li>
                <li>⚡ Health check confirms your setup is working correctly</li>
            </ul>
            <p class="update-popup-note">It's a quick one-command update — takes less than 10 seconds.</p>
            <div class="update-popup-actions">
                <button class="update-popup-btn primary" onclick="updatePopupNow()">🚀 Update Now</button>
                <button class="update-popup-btn secondary" onclick="updatePopupLater()">Maybe Later</button>
            </div>
        `;
    }
}

function updatePopupNow() {
    const os = detectOS();
    const cmd = os === 'windows'
        ? 'powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"'
        : 'curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash';

    navigator.clipboard.writeText(cmd).then(() => {
        showPopupCopiedState(os);
        startPatchVerification();
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showPopupCopiedState(os);
        startPatchVerification();
    });
}

function showPopupCopiedState(os) {
    const modal = document.querySelector('.update-popup-modal');
    if (!modal) return;

    const isMac = os !== 'windows';
    const cmd = isMac
        ? 'curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash'
        : 'powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"';

    modal.innerHTML = `
        <div class="update-popup-icon">✅</div>
        <h2>Command Copied!</h2>
        <div class="patch-cmd-box"><code>${cmd}</code></div>
        <div class="patch-instructions">
            ${isMac
                ? '1. Open <strong>Terminal</strong> &nbsp;<span class="keys">Cmd+Space</span> → type "Terminal"<br>2. Paste &nbsp;<span class="keys">Cmd+V</span> → press <span class="keys">Enter</span>'
                : '1. Open <strong>Terminal</strong> &nbsp;<span class="keys">Win+X</span> → Terminal or Command Prompt<br>2. Paste &nbsp;<span class="keys">Ctrl+V</span> → press <span class="keys">Enter</span>'
            }
        </div>
        <div class="update-popup-actions" style="margin-top:18px;">
            <button class="update-popup-btn primary" onclick="updatePopupNow()">📋 Copy Again</button>
            <button class="update-popup-btn secondary" onclick="updatePopupLater()">Later</button>
        </div>
    `;
}

function updatePopupLater() {
    const popup = document.getElementById('updatePopupOverlay');
    if (popup) popup.style.display = 'none';
    sessionStorage.setItem('oatPopupDismissed', '1');
    // Show the smaller banner as fallback
    showUpdateBanner();
}

function copyWinRunNow() {
    const cmd = 'powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\OAT\\auto-attendance.ps1"';
    navigator.clipboard.writeText(cmd).then(() => {
        showWinRunStatus('copied');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showWinRunStatus('copied');
    });
}

function copyWinBackfill() {
    const cmd = 'powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\OAT\\auto-attendance.ps1" --backfill';
    const note = document.getElementById('winScanNote');
    navigator.clipboard.writeText(cmd).then(() => {
        showWinRunStatus('backfill');
        if (note) note.style.display = 'block';
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showWinRunStatus('backfill');
        if (note) note.style.display = 'block';
    });
}

function showWinRunStatus(state) {
    const status = document.getElementById('winManualRunStatus');
    const btn = document.querySelector('.manual-run-btn');
    if (state === 'copied') {
        if (status) {
            status.textContent = '✅ Copied! Paste in PowerShell (Ctrl+V) and press Enter. Uses -ExecutionPolicy Bypass automatically.';
            status.style.color = '#55efc4';
        }
    } else if (state === 'backfill') {
        if (status) {
            status.textContent = '✅ Copied backfill command! Paste in PowerShell → it will open the tracker with past days.';
            status.style.color = '#74b9ff';
        }
    }
}

function dismissUpdateBanner() {
    document.getElementById('updateBanner').style.display = 'none';
    localStorage.setItem('oatUpdateDismissed', new Date().toISOString());
}

function triggerAutoPatch() {
    const os = detectOS();
    const cmd = os === 'windows'
        ? 'powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"'
        : 'curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash';

    // Copy command to clipboard
    navigator.clipboard.writeText(cmd).then(() => {
        showPatchBannerState(os === 'windows' ? 'copied-win' : 'copied-mac');
        startPatchVerification();
    }).catch(() => {
        // Fallback for non-HTTPS or permission denied
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showPatchBannerState(os === 'windows' ? 'copied-win' : 'copied-mac');
        startPatchVerification();
    });
}

function showPatchBannerState(state) {
    const icon = document.getElementById('updateBannerIcon');
    const title = document.getElementById('updateBannerTitle');
    const detail = document.getElementById('updateBannerDetail');
    const actions = document.getElementById('updateBannerActions');

    if (state === 'copied-mac') {
        icon.textContent = '✅';
        title.textContent = 'Command copied to clipboard!';
        detail.innerHTML = `
            <div class="patch-cmd-box"><code>curl -sL https://tripathigaurav.github.io/OAT/update-mac.command | bash</code></div>
            <div class="patch-instructions">
                1. Open <strong>Terminal</strong> &nbsp;<span class="keys">Cmd+Space</span> → type "Terminal"<br>
                2. Paste &nbsp;<span class="keys">Cmd+V</span> → press <span class="keys">Enter</span>
            </div>`;
        actions.innerHTML = '<button class="update-banner-btn primary" onclick="triggerAutoPatch()">📋 Copy Again</button><button class="update-banner-btn dismiss" onclick="dismissUpdateBanner()">Later</button>';
        // Switch to stacked layout
        document.querySelector('.update-banner-content').classList.add('has-command');
    } else if (state === 'copied-win') {
        icon.textContent = '✅';
        title.textContent = 'Command copied to clipboard!';
        detail.innerHTML = `
            <div class="patch-cmd-box"><code>powershell -ExecutionPolicy Bypass -Command "irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex"</code></div>
            <div class="patch-instructions">
                1. Press <strong>Win+R</strong> → paste → press <span class="keys">Enter</span><br>
                2. Or open <strong>PowerShell</strong> &nbsp;<span class="keys">Win+X</span> → paste → <span class="keys">Enter</span>
            </div>`;
        actions.innerHTML = '<button class="update-banner-btn primary" onclick="triggerAutoPatch()">📋 Copy Again</button><button class="update-banner-btn dismiss" onclick="dismissUpdateBanner()">Later</button>';
        document.querySelector('.update-banner-content').classList.add('has-command');
    } else if (state === 'verified') {
        icon.textContent = '✅';
        title.textContent = 'Auto-tracking updated!';
        detail.textContent = 'Your setup has been updated and is working again.';
        actions.innerHTML = '<button class="update-banner-btn dismiss" onclick="dismissUpdateBanner()">Dismiss</button>';
        // Remove pulse animation
        document.getElementById('updateBanner').style.animation = 'none';
        document.getElementById('updateBanner').style.borderColor = 'rgba(0, 184, 148, 0.4)';
        document.getElementById('updateBanner').style.background = 'linear-gradient(135deg, rgba(0,184,148,0.15), rgba(85,239,196,0.08))';
        title.style.color = '#55efc4';
        // Update status badge
        updateSetupStatus();
        localStorage.removeItem('oatUpdateDismissed');
    }
}

function startPatchVerification() {
    // Poll for the fix to take effect (installer opens ?automark=true when done)
    const checkInterval = setInterval(() => {
        const scriptActive = localStorage.getItem('oatScriptActive');
        if (scriptActive) {
            const lastRun = new Date(scriptActive);
            const now = new Date();
            // Use a 10-minute window instead of same-day check — avoids midnight rollover failure
            if ((now - lastRun) < 10 * 60 * 1000) {
                clearInterval(checkInterval);
                showPatchBannerState('verified');
            }
        }
    }, 2000);
    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
}

function showOnboarding() {
    const alreadySetup = isSetupAlreadyDone();

    document.getElementById('onboardOverlay').style.display = 'flex';
    document.getElementById('onboardStep2').style.display = 'none';

    if (alreadySetup) {
        // Setup already detected — show "already active" version
        document.getElementById('onboardStep1').style.display = 'none';
        document.getElementById('onboardStepActive').style.display = 'block';
        const statusDetail = document.getElementById('activeStatusDetail');
        if (statusDetail) statusDetail.textContent = getSetupStatusText();
    } else {
        // Fresh user — show normal onboarding
        document.getElementById('onboardStep1').style.display = 'block';
        const activeStep = document.getElementById('onboardStepActive');
        if (activeStep) activeStep.style.display = 'none';
    }

    // Pre-fill name if already saved
    const savedName = localStorage.getItem('oatUserName');
    if (savedName) {
        document.getElementById('onboardName').value = savedName;
        const activeNameInput = document.getElementById('onboardNameActive');
        if (activeNameInput) activeNameInput.value = savedName;
    }
}

function onboardDoneActive() {
    // Save name from the "active" modal variant
    const nameInput = document.getElementById('onboardNameActive');
    const name = nameInput ? nameInput.value.trim() : '';
    if (name) localStorage.setItem('oatUserName', name);
    showUserGreeting();

    localStorage.setItem('oatOnboarded', 'completed');
    document.getElementById('onboardOverlay').style.display = 'none';
    updateSetupStatus();
    const greeting = name ? `${name}, ` : '';
    showNotification(`\u2705 ${greeting}your auto-tracking is active and working!`, 'success');
}

function saveUserName() {
    const nameInput = document.getElementById('onboardName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (name) {
        localStorage.setItem('oatUserName', name);
    }
    showUserGreeting();
}

function showUserGreeting() {
    const name = localStorage.getItem('oatUserName');
    const greetingEl = document.getElementById('userGreeting');
    const nameEl = document.getElementById('userName');
    if (name && greetingEl && nameEl) {
        nameEl.textContent = name;
        greetingEl.style.display = 'flex';
    }
}

function editUserName() {
    const current = localStorage.getItem('oatUserName') || '';
    const newName = prompt('Enter your name:', current);
    if (newName !== null && newName.trim()) {
        localStorage.setItem('oatUserName', newName.trim());
        showUserGreeting();
    }
}

function onboardSkip() {
    saveUserName();
    localStorage.setItem('oatOnboarded', 'skipped');
    document.getElementById('onboardOverlay').style.display = 'none';
}

function onboardYes() {
    saveUserName();
    const os = detectOS();
    document.getElementById('onboardStep1').style.display = 'none';
    document.getElementById('onboardStep2').style.display = 'block';

    if (os === 'windows') {
        document.getElementById('osIcon').textContent = '\uD83E\uDE9F';
        document.getElementById('osTitle').textContent = 'Windows Setup';
        document.getElementById('osName').textContent = 'Windows';
        document.getElementById('oneClickWin').style.display = 'block';
        document.getElementById('oneClickMac').style.display = 'none';
    } else {
        document.getElementById('osIcon').textContent = '\uD83C\uDF4E';
        document.getElementById('osTitle').textContent = 'Mac Setup';
        document.getElementById('osName').textContent = 'macOS';
        document.getElementById('oneClickMac').style.display = 'block';
        document.getElementById('oneClickWin').style.display = 'none';
    }
}

function onboardBack() {
    document.getElementById('onboardStep1').style.display = 'block';
    document.getElementById('onboardStep2').style.display = 'none';
}



function downloadInstaller() {
    // Legacy — kept for backward compat; prefer copyWinInstallCmd()
    const a = document.createElement('a');
    a.href = 'install-win.bat';
    a.download = 'install-win.bat';
    a.click();
}

// Listen for cross-tab localStorage changes (installer opens new tab → sets oatScriptActive)
function startSetupVerificationListener() {
    // Check immediately in case it's already set
    if (localStorage.getItem('oatScriptActive')) {
        onSetupVerified();
        return;
    }
    // Listen for storage events from other tabs
    window.addEventListener('storage', function onStorage(e) {
        if (e.key === 'oatScriptActive' && e.newValue) {
            window.removeEventListener('storage', onStorage);
            onSetupVerified();
        }
    });
    // Also poll every 2s as fallback (some browsers don't fire storage for same-origin)
    window._setupPoll = setInterval(() => {
        if (localStorage.getItem('oatScriptActive')) {
            clearInterval(window._setupPoll);
            onSetupVerified();
        }
    }, 2000);
}

function onSetupVerified() {
    if (window._setupPoll) clearInterval(window._setupPoll);
    const os = detectOS();
    if (os === 'windows') {
        const banner = document.getElementById('setupVerifiedWin');
        const steps = document.getElementById('winSteps');
        if (banner) banner.style.display = 'block';
        if (steps) steps.style.display = 'none';
        const status = document.getElementById('winInstallStatus');
        if (status) { status.textContent = '\u2705 Setup is complete!'; status.style.color = '#55efc4'; }
    } else {
        const banner = document.getElementById('setupVerifiedMac');
        const steps = document.getElementById('macSteps');
        if (banner) banner.style.display = 'block';
        if (steps) steps.style.display = 'none';
        document.getElementById('macInstallStatus').textContent = '\u2705 Setup is complete!';
        document.getElementById('macInstallStatus').style.color = '#55efc4';
    }
}

function copyInstallCmd() {
    const cmd = document.getElementById('macInstallCmd').textContent;
    navigator.clipboard.writeText(cmd).then(() => {
        document.getElementById('macInstallStatus').textContent = '\u2705 Copied! Now paste in Terminal (Cmd+V)';
        document.getElementById('macInstallStatus').style.color = '#55efc4';
        startSetupVerificationListener();
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        document.getElementById('macInstallStatus').textContent = '\u2705 Copied! Now paste in Terminal (Cmd+V)';
        document.getElementById('macInstallStatus').style.color = '#55efc4';
        startSetupVerificationListener();
    });
}

function copyWinInstallCmd() {
    const cmd = document.getElementById('winInstallCmd').textContent;
    navigator.clipboard.writeText(cmd).then(() => {
        document.getElementById('winInstallStatus').textContent = '✅ Copied! Now paste in Terminal (Ctrl+V)';
        document.getElementById('winInstallStatus').style.color = '#55efc4';
        startSetupVerificationListener();
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        document.getElementById('winInstallStatus').textContent = '✅ Copied! Now paste in Terminal (Ctrl+V)';
        document.getElementById('winInstallStatus').style.color = '#55efc4';
        startSetupVerificationListener();
    });
}

function onboardDone() {
    saveUserName();
    localStorage.setItem('oatOnboarded', 'completed');
    document.getElementById('onboardOverlay').style.display = 'none';
    showUserGreeting();
    const name = localStorage.getItem('oatUserName');
    const greeting = name ? `Welcome ${name}! ` : '';
    showNotification(`\uD83C\uDF89 ${greeting}Setup complete! Your attendance will auto-track when you connect to office WiFi.`, 'success');
}

// ---- Backfill from WiFi Logs ----
function handleBackfill(dateString) {
    const dates = dateString.split(',').map(d => d.trim()).filter(d => d);
    if (dates.length === 0) return;

    let newCount = 0;
    let skipCount = 0;

    dates.forEach(dateStr => {
        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

        const parts = dateStr.split('-');
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const dayOfWeek = date.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) return;
        // Skip holidays
        if (isHoliday(dateStr)) return;
        // Skip out of range
        if (!isInRange(date)) return;

        // If already WiFi-verified, skip
        if (autoMarkedDays[dateStr]) {
            skipCount++;
            return;
        }

        const wasManual = checkedDays[dateStr] && !autoMarkedDays[dateStr];
        checkedDays[dateStr] = true;
        autoMarkedDays[dateStr] = true;
        if (leaveDays[dateStr]) delete leaveDays[dateStr];
        newCount++;
    });

    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
    saveLeaveDays();

    // Log the backfill
    const logEntry = `${new Date().toLocaleString()} \u2014 Backfilled ${newCount} days from WiFi logs (${skipCount} already marked)`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 30) autoMarkLog.pop();
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));

    if (newCount > 0) {
        showNotification(`📡 Backfilled ${newCount} days from WiFi history!${skipCount > 0 ? ` (${skipCount} already WiFi-verified)` : ''}`, 'success');
    } else if (skipCount > 0) {
        showNotification(`✅ All ${skipCount} days from WiFi history already WiFi-verified!`, 'already');
    } else {
        showNotification('\uD83D\uDCCB No valid workdays found in the backfill data.', 'info');
    }

    renderCalendars();
}

/* ── Typewriter subtitle ──────────────────────────────── */
(function initTypewriter() {
    const el = document.getElementById('twText');
    if (!el) return;

    function getLines() {
        const days = parseInt((document.getElementById('totalOfficeDays') || {}).textContent || '0', 10);
        const rem  = parseInt((document.getElementById('remainingDays')   || {}).textContent || '39', 10);
        const leaves = parseInt((document.getElementById('totalLeaveDays') || {}).textContent || '0', 10);
        const pct  = Math.min(100, Math.round((days / 39) * 100));
        const lines = [
            { text: 'Auto-tracking active...', active: true },
            { text: `${days} / 39 days done`,  active: false },
            { text: `${rem} days to go`,        active: false },
            { text: `${pct}% of target reached`, active: false },
            { text: 'NetApp corp WiFi \u00b7 Apr\u2013Jul 2026', active: false },
        ];
        if (leaves > 0) {
            lines.splice(3, 0, { text: `${leaves} leave day${leaves > 1 ? 's' : ''} taken`, active: false });
        }
        return lines;
    }

    let lineIdx = 0, charIdx = 0, deleting = false;

    function tick() {
        const lines = getLines();
        const line  = lines[lineIdx % lines.length];

        el.classList.toggle('tw-active', line.active);

        if (!deleting) {
            charIdx++;
            el.textContent = line.text.slice(0, charIdx);
            if (charIdx === line.text.length) {
                deleting = true;
                setTimeout(tick, 2200);
                return;
            }
        } else {
            charIdx--;
            el.textContent = line.text.slice(0, charIdx);
            if (charIdx === 0) {
                deleting = false;
                lineIdx++;
                setTimeout(tick, 400);
                return;
            }
        }
        setTimeout(tick, deleting ? 28 : 52);
    }
    setTimeout(tick, 800);
})();

/* ── Canvas confetti burst ────────────────────────────── */
function launchConfettiCanvas() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const colors = ['#c792ea','#82aaff','#7fdbca','#addb67','#ecc48d','#ff6363'];
    const pieces = Array.from({ length: 140 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vy: Math.random() * 3 + 2,
        vx: (Math.random() - 0.5) * 2,
        vr: (Math.random() - 0.5) * 0.15,
    }));
    let frame;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        pieces.forEach(p => {
            p.y  += p.vy;
            p.x  += p.vx;
            p.rot += p.vr;
            if (p.y < canvas.height + 20) alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        if (alive) {
            frame = requestAnimationFrame(draw);
        } else {
            canvas.style.display = 'none';
            cancelAnimationFrame(frame);
        }
    }
    draw();
    setTimeout(() => { canvas.style.display = 'none'; cancelAnimationFrame(frame); }, 4000);
}
