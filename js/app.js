// Configuration
const REQUIRED_SCRIPT_VERSION = '2.4'; // Latest shipped script version

// Oldest script version still considered correct. The update prompt appears
// ONLY when the installed script is older than this — bump it for genuine
// correctness fixes, not for cosmetic changes. Nagging users who won't act
// just trains them to ignore the banner.
const MIN_SCRIPT_VERSION = '2.4';

// What changed, per script version. Single source of truth: the update dialog
// renders the entry for REQUIRED_SCRIPT_VERSION. Two hardcoded feature lists
// (one in index.html, one rebuilt in reopenUpdatePopup) had drifted to
// describe two different older releases.
const SCRIPT_CHANGELOG = {
    '2.4': [
        '🛡️ No more false weekend marks when a laptop is left docked on office WiFi',
        '📶 Windows backfill now matches the exact "corp" SSID, not any name containing it',
        '📅 Windows quarter &amp; holiday dates now match the app exactly',
    ],
    '2.3': [
        '🍎 Mac: browser opens automatically on office WiFi connect',
        '🔍 Improved SSID detection — 4-method fallback for macOS Ventura+',
        '🛡️ Stronger VPN false-positive protection (SSID + DNS both required)',
        '⚡ Health check confirms your setup is working correctly',
    ],
};

// Compare dotted version strings. Non-numeric parts (e.g. the 'legacy'
// sentinel) count as 0, so they sort older than any real version.
function cmpVersion(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

// True when the installed script predates MIN_SCRIPT_VERSION.
function scriptNeedsUpdate() {
    const installed = localStorage.getItem('oatScriptVersion');
    if (!installed) return false;            // never ran — that's the setup reminder's job
    return cmpVersion(installed, MIN_SCRIPT_VERSION) < 0;
}

// Dismissal is remembered per target version, so "Maybe Later" sticks across
// sessions but a genuinely newer fix can still surface.
function updateDismissedKey() { return 'oatUpdateDismissed_' + MIN_SCRIPT_VERSION; }

function renderUpdateFeatures() {
    const items = SCRIPT_CHANGELOG[REQUIRED_SCRIPT_VERSION] || [];
    return items.map(t => `<li>${t}</li>`).join('');
}

// Quarter we've already fired confetti for (per session)
let _celebratedQuarter = null;

// ── Team Birthdays (MM-DD, year-agnostic) ────────────────────────
const BIRTHDAYS = [
    { mmdd: '02-26', name: 'Abhijeet Chauhan' },
    { mmdd: '03-22', name: 'Srinidhi M' },
    { mmdd: '04-13', name: 'Chetan Teja Gurrala' },
    { mmdd: '04-19', name: 'Rahul Agarwal' },
    { mmdd: '06-25', name: 'Mohak Ahuja' },
    { mmdd: '07-10', name: 'Amartya Om' },
    { mmdd: '07-17', name: 'Sneha Priya' },
    { mmdd: '07-22', name: 'Avinash S' },
    { mmdd: '08-19', name: 'Luv Gupta' },
    { mmdd: '11-09', name: 'Gaurav Tripathi' },
    { mmdd: '11-13', name: 'Divya Naiga' },
    { mmdd: '11-25', name: 'Vijayarajan R' },
];

function getBirthdayPeople(dateStr) {
    // dateStr is YYYY-MM-DD
    const mmdd = dateStr.slice(5); // MM-DD
    return BIRTHDAYS.filter(b => b.mmdd === mmdd);
}

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

// ── Date helpers ──────────────────────────────────────────────────
// Quarter start/end are midnight Date objects. Any date compared against them
// MUST be normalised to midnight too, otherwise "10am on the last day of the
// quarter" reads as being past the quarter end (and auto-mark silently fails).
function atMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function todayMid() { return atMidnight(new Date()); }

// Escape a string for safe use inside a double-quoted HTML attribute.
// Newlines are deliberately preserved — data-tip renders with pre-line.
function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Active quarter ────────────────────────────────────────────────
// Always land on the quarter that contains today. A saved quarter is only
// honoured while it still contains today — otherwise peeking at a future
// quarter (e.g. Q4) would stick permanently and show an empty calendar.
let currentQKey = (function() {
    const saved = localStorage.getItem('oatCurrentQuarter');
    const today = todayMid();
    if (saved && QUARTERS[saved] && today >= QUARTERS[saved].start && today <= QUARTERS[saved].end) {
        return saved;
    }
    const detected = autoDetectQuarter();
    localStorage.setItem('oatCurrentQuarter', detected);
    return detected;
})();

function autoDetectQuarter() {
    const today = todayMid();
    for (const [key, q] of Object.entries(QUARTERS)) {
        if (today >= q.start && today <= q.end) return key;
    }
    // Default to the closest future quarter, or Q1 if all past
    const future = Object.entries(QUARTERS).find(([, q]) => today < q.start);
    return future ? future[0] : 'Q1';
}

// Count only genuine WiFi-verified auto-marks. Older builds wrote `false` into
// autoMarkedDays for manual marks, so key count alone over-reports.
function autoMarkCount(map) {
    const m = map || autoMarkedDays;
    return Object.keys(m).filter(d => m[d]).length;
}
function autoMarkDates(map) {
    const m = map || autoMarkedDays;
    return Object.keys(m).filter(d => m[d]).sort();
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

// ── Strip falsy autoMarkedDays entries left behind by older builds ─
// "Mark Today" without WiFi used to store `false`, which still counted as a key
// and made manual marks look like locked WiFi auto-marks.
(function cleanFalsyAutoMarks() {
    if (localStorage.getItem('oatAutoMarkCleaned') === '1') return;
    Object.keys(QUARTERS).forEach(qk => {
        const raw = localStorage.getItem('autoMarkedDays_' + qk);
        if (!raw) return;
        let map;
        try { map = JSON.parse(raw); } catch (e) { return; }
        let changed = false;
        Object.keys(map).forEach(d => { if (!map[d]) { delete map[d]; changed = true; } });
        if (changed) localStorage.setItem('autoMarkedDays_' + qk, JSON.stringify(map));
    });
    localStorage.setItem('oatAutoMarkCleaned', '1');
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
    const d = atMidnight(date);
    return d >= startDate() && d <= endDate();
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
    // The legend's date range was static HTML holding Q1's dates, so it kept
    // claiming "Apr 27 – Jul 31, 2026" no matter which quarter was showing.
    const range = document.getElementById('legendDateRange');
    if (range) range.textContent = getQ().display.replace(/^Q\d · /, '');
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
    if (autoMarkLog.length > 120) autoMarkLog.pop();
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

// ── Fancy Confirm Modal ───────────────────────────────────
let _oatConfirmCb = null;
function showConfirm({ icon, title, body, confirmText = 'Confirm', cancelText = 'Cancel', type = 'success', onConfirm }) {
    _oatConfirmCb = onConfirm;
    document.getElementById('oatConfirmIcon').textContent = icon;
    document.getElementById('oatConfirmTitle').textContent = title;
    document.getElementById('oatConfirmBody').textContent = body;
    document.getElementById('oatConfirmBtn').textContent = confirmText;
    document.getElementById('oatConfirmCancelBtn').textContent = cancelText;
    document.getElementById('oatConfirmModal').className = `oat-confirm-modal ${type}`;
    document.getElementById('oatConfirmOverlay').style.display = 'flex';
}
function oatConfirmProceed() {
    document.getElementById('oatConfirmOverlay').style.display = 'none';
    if (_oatConfirmCb) { _oatConfirmCb(); _oatConfirmCb = null; }
}
function oatConfirmCancel() {
    document.getElementById('oatConfirmOverlay').style.display = 'none';
    _oatConfirmCb = null;
}
function oatConfirmBackdropClick(e) {
    if (e.target === document.getElementById('oatConfirmOverlay')) oatConfirmCancel();
}

function rescanToday() {
    // Ensure we're on the quarter today actually belongs to (user may be browsing another)
    const todaysQuarter = autoDetectQuarter();
    if (todaysQuarter !== currentQKey) {
        switchQuarter(todaysQuarter);
    }

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

    // Mark today. Only record an auto-mark when WiFi actually confirmed it —
    // storing `false` would make a manual mark look like a locked auto-mark.
    checkedDays[todayStr] = true;
    if (wifiConfirmedToday) {
        autoMarkedDays[todayStr] = true;
    } else {
        delete autoMarkedDays[todayStr];
    }
    if (leaveDays[todayStr]) {
        delete leaveDays[todayStr];
        saveLeaveDays();
    }
    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
    const source = wifiConfirmedToday ? 'WiFi confirmed' : 'Manual override (no WiFi)';
    const logEntry = `${new Date().toLocaleString()} — Mark Today: ${todayStr} (${source})`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 120) autoMarkLog.pop();
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

    // Legacy (pre multi-quarter) keys
    localStorage.removeItem('officeDays');
    localStorage.removeItem('autoMarkedDays');
    // Quarter-scoped attendance, auto-mark and leave keys — these hold the
    // actual data, so missing them meant "delete all" deleted nothing.
    Object.keys(QUARTERS).forEach(qk => {
        localStorage.removeItem('officeDays_' + qk);
        localStorage.removeItem('autoMarkedDays_' + qk);
        localStorage.removeItem('leaveDays_' + qk);
    });
    localStorage.removeItem('oatCurrentQuarter');
    localStorage.removeItem('oatSettings');
    localStorage.removeItem('autoMarkLog');
    localStorage.removeItem('oatOnboarded');
    localStorage.removeItem('oatScriptActive');
    localStorage.removeItem('oatScriptVersion');
    localStorage.removeItem('oatTheme');
    localStorage.removeItem('oatUserName');
    localStorage.removeItem('oatUpdateDismissed');
    Object.keys(SCRIPT_CHANGELOG).forEach(v => localStorage.removeItem('oatUpdateDismissed_' + v));
    localStorage.removeItem('oatAutoMarkCleaned');
    localStorage.removeItem('oat-nf-dismissed');
    // Birthday "seen" markers accumulate one key per day — collect then remove
    // (removing while iterating would shift the indices).
    const bdayKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('oatBdaySeen_') === 0) bdayKeys.push(k);
    }
    bdayKeys.forEach(k => localStorage.removeItem(k));
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
    const totalAutoMarks = autoMarkCount();
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
        const label = scriptVer === 'legacy'
            ? `Pre-v${REQUIRED_SCRIPT_VERSION} ⚠ (update script)`
            : `v${scriptVer}${ok ? ' ✓ (current)' : ` ⚠ (need v${REQUIRED_SCRIPT_VERSION})`}`;
        rows.push(diagRow('🔢', 'Script version', label, ok ? 'ok' : 'warn'));
    } else {
        rows.push(diagRow('🔢', 'Script version', `Unknown — script not yet run`, 'warn'));
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
    // If day is on leave, first ask to remove leave
    if (leaveDays[dateStr] && !checkedDays[dateStr]) {
        showConfirm({
            icon: '🌴',
            title: 'Remove Leave?',
            body: `${dateStr} is marked as leave. Remove it to mark attendance instead.`,
            confirmText: 'Remove Leave', cancelText: 'Keep', type: 'warn',
            onConfirm: () => {
                delete leaveDays[dateStr];
                saveLeaveDays();
                renderCalendars();
                showNotification(`Removed leave for ${dateStr}. Click again to mark attendance.`, 'info');
            }
        });
        return;
    }
    if (checkedDays[dateStr]) {
        if (autoMarkedDays[dateStr]) {
            showNotification('🔒 This day was auto-marked via office WiFi and cannot be removed.', 'info');
            return;
        }
        showConfirm({
            icon: '🗑️',
            title: 'Remove Attendance?',
            body: `Remove your office day mark for ${dateStr}?`,
            confirmText: 'Remove', cancelText: 'Keep', type: 'danger',
            onConfirm: () => {
                delete checkedDays[dateStr];
                localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
                localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
                renderCalendars();
            }
        });
    } else {
        showConfirm({
            icon: '✅',
            title: 'Mark Office Day?',
            body: `Mark ${dateStr} as an office day?`,
            confirmText: 'Mark It', cancelText: 'Cancel', type: 'success',
            onConfirm: () => {
                checkedDays[dateStr] = true;
                localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
                localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
                renderCalendars();
            }
        });
    }
}

// Reset only manual selections (auto-marked days are preserved)
function resetAll() {
    const autoDates = autoMarkDates();
    const autoCount = autoDates.length;
    const manualCount = Object.keys(checkedDays).filter(d => !autoMarkedDays[d]).length;
    const leaveCount = Object.keys(leaveDays).length;
    if (manualCount === 0 && leaveCount === 0) {
        showNotification('Nothing to reset — all marked days are WiFi auto-marks (locked).', 'info');
        return;
    }
    const extra = leaveCount > 0 ? ` + ${leaveCount} leave day(s)` : '';
    const preservedNote = autoCount > 0 ? ` ${autoCount} WiFi auto-mark(s) will be preserved.` : '';
    showConfirm({
        icon: '🔄',
        title: 'Reset Manual Marks?',
        body: `Clear ${manualCount} manually marked day(s)${extra}.${preservedNote}`,
        confirmText: 'Reset', cancelText: 'Cancel', type: 'danger',
        onConfirm: () => {
            const preserved = {};
            for (const d of autoDates) { preserved[d] = true; }
            checkedDays = preserved;
            leaveDays = {};
            localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
            saveLeaveDays();
            renderCalendars();
            showNotification(`🔄 Reset ${manualCount} manual mark(s)${leaveCount > 0 ? ` + ${leaveCount} leave(s)` : ''}. ${autoCount} auto-mark(s) preserved.`, 'success');
        }
    });
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
            const bdayPeople = getBirthdayPeople(dateStr);

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
                    tooltip = date > _tdn ? '' : 'Weekend — click to mark';
                } else {
                    tooltip = 'Weekend';
                }
            } else if (inRange) {
                const today2 = new Date();
                today2.setHours(0, 0, 0, 0);
                if (date > today2) {
                    tooltip = onLeave ? '🌴 Leave/PTO (planned)' : '';
                } else if (checked) {
                    tooltip = autoMarkedDays[dateStr] ? '🔒 Auto-marked (WiFi verified)' : '✅ Office day (click to remove)';
                } else if (onLeave) {
                    tooltip = '🌴 Leave/PTO';
                } else {
                    tooltip = 'Workday (not marked)';
                }
            }

            const clickHandler = (!inRange || holiday || (isWeekend && !settings.allowWeekendMark)) ? '' : `onclick="toggleDay('${dateStr}')"`;
            if (bdayPeople.length > 0) cellClass += ' bday';
            const bdayTip = bdayPeople.length > 0 ? `🎂 ${bdayPeople.map(b => b.name).join(' & ')}` : '';
            // Newline (rendered via white-space: pre-line) rather than " | " —
            // status on one line, birthday on the next, so it stays narrow.
            const finalTooltip = bdayTip ? (tooltip ? `${tooltip}\n${bdayTip}` : bdayTip) : tooltip;
            const tipAttr = finalTooltip ? `data-tip="${escapeAttr(finalTooltip)}"` : '';

            daysHTML += `<div class="${cellClass}" ${clickHandler} ${tipAttr}>${day}</div>`;
        }

        card.dataset.monthSlot = months.indexOf(m);
        // Colours live in CSS (not inline) so body.light-mode can override them.
        const leaveHTML = monthLeaveDays > 0
            ? `<div class="summary-leaves">🌴 Leaves: <strong>${monthLeaveDays}</strong></div>`
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
                <div>📊 Working Days: <strong class="summary-workdays">${monthWorkDays}</strong></div>
                <div class="summary-office">✅ Office: <strong>${monthOfficeDays}</strong></div>
                ${leaveHTML}
                <div class="${monthHolidays > 0 ? 'summary-holidays' : 'summary-holidays summary-holidays--none'}">🎉 Holidays: <strong>${monthHolidays > 0 ? monthHolidays : '—'}</strong></div>
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
                if (dow !== 0 && dow !== 6 && !isHoliday(ds) && !leaveDays[ds] && !checkedDays[ds]) wdLeft++;
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

    // Update trends panel (recalculates silently, shown only when panel is open)
    updateTrendsPanel(totalOfficeDays);

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
        // Celebrate once per quarter per session — renderCalendars() runs on
        // every click, and re-launching stacked a new animation loop each time.
        if (_celebratedQuarter !== currentQKey) {
            _celebratedQuarter = currentQKey;
            launchConfettiCanvas();
        }
    } else if (totalOfficeDays >= TARGET() * 0.75) {
        _celebratedQuarter = null;
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        renderFlipCounter(status, remaining, '🔥 Almost there!', 'Keep pushing — you\'re so close!', '#fdcb6e');
    } else {
        _celebratedQuarter = null;
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        renderFlipCounter(status, remaining, 'DAYS TO GO', 'Keep showing up 💪', '#74b9ff');
    }
}

// ── Trends Panel ──────────────────────────────────────────
function toggleTrends() {
    const panel = document.getElementById('trendsPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    // Draw chart when panel becomes visible (canvas needs non-zero size)
    if (isOpen) drawWeeklyChart();
}

function calculatePrediction(officeDays) {
    const target    = TARGET();
    const remaining = Math.max(0, target - officeDays);
    const months    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (remaining === 0) return { text: 'Done! 🏆', status: 'done', overallRate: null, recentRate: null, wdNeeded: 0, projDate: null };

    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    const qStart = startDate();
    const qEnd   = endDate();

    if (todayMid > qEnd)   return { text: 'Q ended',   status: 'risk',    overallRate: null, recentRate: null, wdNeeded: null, projDate: null };
    if (todayMid < qStart) return { text: '—',         status: 'waiting', overallRate: null, recentRate: null, wdNeeded: null, projDate: null };

    // Working days elapsed so far (qStart → today inclusive)
    let wdElapsed = 0;
    for (let d = new Date(qStart); d <= todayMid; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay(), ds = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
        if (dow !== 0 && dow !== 6 && !isHoliday(ds) && !leaveDays[ds]) wdElapsed++;
    }

    if (wdElapsed < 3 || officeDays === 0) return { text: '—', status: 'waiting', overallRate: null, recentRate: null, wdNeeded: null, projDate: null };

    const overallRate = officeDays / wdElapsed;

    // Recent velocity: last 14 calendar days
    const twoWeeksAgo = new Date(todayMid); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const recentStart = twoWeeksAgo < qStart ? new Date(qStart) : twoWeeksAgo;
    let recentWd = 0, recentOffice = 0;
    for (let d = new Date(recentStart); d <= todayMid; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay(), ds = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
        if (dow !== 0 && dow !== 6 && !isHoliday(ds) && !leaveDays[ds]) {
            recentWd++;
            if (checkedDays[ds]) recentOffice++;
        }
    }
    const recentRate   = recentWd >= 3 ? recentOffice / recentWd : overallRate;
    // 70% recent + 30% overall for smarter projection
    const weightedRate = recentWd >= 5 ? (0.7 * recentRate + 0.3 * overallRate) : overallRate;

    if (weightedRate <= 0) return { text: 'At risk ⚠️', status: 'risk', overallRate, recentRate, wdNeeded: null, projDate: null };

    const wdNeeded = Math.ceil(remaining / weightedRate);

    // Walk forward wdNeeded working days from today
    let counted = 0, projDate = new Date(todayMid);
    while (counted < wdNeeded) {
        projDate.setDate(projDate.getDate() + 1);
        const dow = projDate.getDay(), ds = formatDate(projDate.getFullYear(), projDate.getMonth(), projDate.getDate());
        if (dow !== 0 && dow !== 6 && !isHoliday(ds) && !leaveDays[ds]) counted++;
        if (projDate.getFullYear() - todayMid.getFullYear() > 1) break;
    }

    if (projDate > qEnd) return { text: 'At risk ⚠️', status: 'risk', overallRate, recentRate, wdNeeded, projDate };

    const mon  = months[projDate.getMonth()];
    const week = Math.ceil(projDate.getDate() / 7);
    return { text: `${mon} Wk ${week}`, status: 'ontrack', overallRate, recentRate, wdNeeded, projDate };
}

function updateTrendsPanel(officeDays) {
    const pred = calculatePrediction(officeDays);

    const setVal = (id, text, cls) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.className   = 'trend-value' + (cls ? ' ' + cls : '');
    };

    // Expected completion date as a clear sentence
    const statusClass = pred.status === 'risk' ? 'risk' : pred.status === 'done' ? 'done' : '';
    if (pred.projDate && pred.status === 'ontrack') {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const pd = pred.projDate;
        const dateStr = months[pd.getMonth()] + ' ' + pd.getDate();
        const el = document.getElementById('trendPredictVal');
        if (el) {
            el.innerHTML = "You'll hit <strong>" + TARGET() + "</strong> by <strong>" + dateStr + "</strong>";
            el.className = 'trend-value trend-value--big';
        }
    } else {
        const el = document.getElementById('trendPredictVal');
        if (el) {
            el.textContent = pred.text;
            el.className = 'trend-value trend-value--big' + (statusClass ? ' ' + statusClass : '');
        }
    }

    // Draw weekly visits chart (only if panel is visible)
    const trendsPanel = document.getElementById('trendsPanel');
    if (trendsPanel && trendsPanel.classList.contains('open')) drawWeeklyChart();
}

// roundRect polyfill for older browsers
function fillRoundRect(ctx, x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (radii[0] || 0);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function drawWeeklyChart() {
    const canvas = document.getElementById('trendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Make canvas crisp on high-DPI screens
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width < 10) return; // Panel not visible yet
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 140 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '140px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = 140;

    ctx.clearRect(0, 0, W, H);

    // Canvas can't inherit body.light-mode, so resolve the palette here —
    // white label text was invisible against the light theme.
    const light      = document.body.classList.contains('light-mode');
    const gridColor  = light ? 'rgba(15,23,42,0.10)' : 'rgba(127,219,202,0.1)';
    const trackColor = light ? 'rgba(15,23,42,0.08)' : 'rgba(127,219,202,0.12)';
    const valueColor = light ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.7)';
    const labelColor = light ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.4)';

    const qStart = startDate();
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    const qEnd = endDate();
    const endLoop = todayMid < qEnd ? todayMid : qEnd;

    // Build weekly data
    const weeks = [];
    let weekStart = new Date(qStart);
    // Align to Monday
    while (weekStart.getDay() !== 1 && weekStart <= endLoop) weekStart.setDate(weekStart.getDate() + 1);
    // Leading partial week (quarter starting mid-week)
    let partialVisits = 0, partialWd = 0;
    for (let d = new Date(qStart); d < weekStart && d <= endLoop; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
            partialWd++;
            const ds = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
            if (checkedDays[ds]) partialVisits++;
        }
    }
    if (partialWd > 0 && weeks.length === 0) weeks.push({ label: 'W1', visits: partialVisits, workDays: partialWd });

    let wNum = weeks.length + 1;
    let ws = new Date(weekStart);
    while (ws <= endLoop) {
        const we = new Date(ws); we.setDate(we.getDate() + 4); // Mon-Fri
        let visits = 0, workDays = 0;
        for (let d = new Date(ws); d <= we && d <= endLoop; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) {
                workDays++;
                const ds = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
                if (checkedDays[ds]) visits++;
            }
        }
        if (workDays > 0) weeks.push({ label: 'W' + wNum, visits, workDays });
        wNum++;
        ws.setDate(ws.getDate() + 7);
    }

    if (weeks.length === 0) return;

    const maxVisits = Math.max(5, ...weeks.map(w => w.workDays));
    const padding = { top: 10, bottom: 28, left: 8, right: 8 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;
    const barW = Math.min(32, (chartW / weeks.length) * 0.55);
    const gap = (chartW - barW * weeks.length) / (weeks.length + 1);

    // Draw horizontal grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
        const y = padding.top + chartH - (chartH * (i / 4));
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
    }

    weeks.forEach((w, i) => {
        const x = padding.left + gap + i * (barW + gap);
        const visitH = (w.visits / maxVisits) * chartH;
        const workH = (w.workDays / maxVisits) * chartH;
        const yBase = padding.top + chartH;

        // Background bar (total workdays) — dim
        ctx.fillStyle = trackColor;
        const r = Math.min(3, barW / 4);
        fillRoundRect(ctx, x, yBase - workH, barW, workH, r);

        // Foreground bar (visits) — colored by rate
        const rate = w.visits / w.workDays;
        let barColor;
        if (rate >= 0.8) barColor = 'rgba(127,219,202,0.85)';      // teal
        else if (rate >= 0.5) barColor = 'rgba(236,196,141,0.85)'; // amber
        else barColor = 'rgba(255,99,99,0.7)';                      // red

        ctx.fillStyle = barColor;
        fillRoundRect(ctx, x, yBase - visitH, barW, visitH, r);

        // Visit count on top of bar
        ctx.fillStyle = valueColor;
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(w.visits, x + barW / 2, yBase - visitH - 3);

        // Week label below
        ctx.fillStyle = labelColor;
        ctx.font = '500 9px Inter, sans-serif';
        ctx.fillText(w.label, x + barW / 2, yBase + 14);
    });
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
            const tipAttr = tooltip ? `title="${escapeAttr(tooltip)}"` : '';

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

    // Demo mode: load sample data for testing trends
    if (urlParams.get('demo') === 'true') {
        const demoData = {};
        const today = new Date(); today.setHours(0,0,0,0);
        const qS = startDate();
        let count = 0;
        for (let d = new Date(qS); d <= today && count < 33; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) {
                // Mark ~80% of workdays
                if (Math.random() < 0.8 || count < 10) {
                    demoData[formatDate(d.getFullYear(), d.getMonth(), d.getDate())] = true;
                    count++;
                }
            }
        }
        localStorage.setItem(qKey('officeDays'), JSON.stringify(demoData));
        checkedDays = demoData;
        renderCalendars();
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (urlParams.get('automark') === 'true') {
        // Record that the background script is working
        localStorage.setItem('oatScriptActive', new Date().toISOString());
        // Save script version so update card doesn't show after a successful run
        const sv = urlParams.get('scriptver');
        localStorage.setItem('oatScriptVersion', sv || 'legacy');
        // Hide setup-reminder card since script is now confirmed working
        const reminderCard = document.getElementById('settingsSetupReminder');
        if (reminderCard) reminderCard.style.display = 'none';

        // BUG FIX: User may be browsing a different quarter (e.g. Q2 preview).
        // Always switch to today's actual quarter before auto-marking so
        // isTodayWorkday() / isInRange() check against the right date range.
        const todaysQuarter = autoDetectQuarter();
        if (todaysQuarter !== currentQKey) {
            switchQuarter(todaysQuarter);
        }

        if (settings.autoMarkEnabled !== false) {
            autoMarkToday();
        }
        // If auto-mark is disabled, page still opens (by design) — just don't mark
        // Clean up URL (remove ?automark=true) without reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
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

    // Show birthday popup if today is someone's birthday (once per day)
    checkBirthdayToday();

    // Tooltip edge detection — anchor the tip inside its month card.
    // Measuring against the viewport wasn't enough: the card has a
    // backdrop-filter, which clips absolutely-positioned children to the card,
    // so a mid-card cell (e.g. Aug 19) could still get its tooltip sliced off.
    document.addEventListener('mouseover', function(e) {
        const cell = e.target.closest('.day-cell[data-tip]');
        if (!cell) return;
        cell.classList.remove('tip-left', 'tip-right');
        const rect = cell.getBoundingClientRect();
        const card = cell.closest('.month-card');
        const cardRect = card ? card.getBoundingClientRect() : null;
        // Bound by whichever is tighter: the card or the viewport.
        const leftBound  = Math.max(8, cardRect ? cardRect.left + 8 : 8);
        const rightBound = Math.min(window.innerWidth - 8, cardRect ? cardRect.right - 8 : window.innerWidth - 8);
        const halfTip = 88; // half of the tooltip's 176px max-width
        const centre = rect.left + rect.width / 2;
        if (centre - halfTip < leftBound) {
            cell.classList.add('tip-left');
        } else if (centre + halfTip > rightBound) {
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

// ---- Feedback / Chat Choice Modal ----
function openFeedback() {
    openChatModal();
}

function openChatModal() {
    const overlay = document.getElementById('chatChoiceOverlay');
    if (overlay) overlay.style.display = 'flex';
    const note = document.getElementById('chatChoiceReportNote');
    if (note) note.style.display = 'none';
}

function closeChatModal() {
    const overlay = document.getElementById('chatChoiceOverlay');
    if (overlay) overlay.style.display = 'none';
}

function chatChoiceOverlayClick(e) {
    if (e.target === document.getElementById('chatChoiceOverlay')) closeChatModal();
}

function chatOnTeams() {
    closeChatModal();
    window.open('https://teams.microsoft.com/l/chat/0/0?users=Gaurav.Tripathi@netapp.com', '_blank');
}

function reportIssue() {
    const today = new Date();
    const q = getQ();
    const logLines = [];

    // ── Header ────────────────────────────────────────────────────
    logLines.push('=== OAT Issue Report ===');
    logLines.push(`Date/Time   : ${today.toISOString()}`);
    logLines.push(`Browser     : ${navigator.userAgent}`);
    logLines.push(`Platform    : ${navigator.platform || 'unknown'}`);
    logLines.push(`Quarter     : ${currentQKey} (${q.display})`);
    logLines.push(`User        : ${localStorage.getItem('oatUserName') || 'Not set'}`);
    logLines.push(`Script      : active=${localStorage.getItem('oatScriptActive') ? 'true' : 'false'}`
                + `, version=${localStorage.getItem('oatScriptVersion') || 'unknown'}`
                + `, lastRun=${localStorage.getItem('oatScriptActive') || 'never'}`);
    logLines.push('');

    // ── Settings ─────────────────────────────────────────────────
    logLines.push('--- Settings ---');
    logLines.push(localStorage.getItem('oatSettings') || '{}');
    logLines.push('');

    // ── Office days — full date list ──────────────────────────────
    const officeDays  = JSON.parse(localStorage.getItem(`officeDays_${currentQKey}`)     || '{}');
    const autoMarked  = JSON.parse(localStorage.getItem(`autoMarkedDays_${currentQKey}`) || '{}');
    const officeDates = Object.keys(officeDays).sort();
    logLines.push(`--- Office Days (${currentQKey}) — ${officeDates.length} days ---`);
    logLines.push(`All dates   : ${officeDates.join(', ') || '(none)'}`);
    const autoDateList = Object.keys(autoMarked).filter(d => autoMarked[d]).sort();
    logLines.push(`Auto-marked : ${autoDateList.length} → ${autoDateList.join(', ') || '(none)'}`);
    const manualDates = officeDates.filter(d => !autoMarked[d]);
    logLines.push(`Manual      : ${manualDates.length} → ${manualDates.join(', ') || '(none)'}`);
    logLines.push('');

    // ── Leave days ────────────────────────────────────────────────
    const leaveDays = JSON.parse(localStorage.getItem(`leaveDays_${currentQKey}`) || '{}');
    const leaveDateList = Object.keys(leaveDays).sort();
    logLines.push(`--- Leave Days (${currentQKey}) — ${leaveDateList.length} days ---`);
    logLines.push(leaveDateList.join(', ') || '(none)');
    logLines.push('');

    // ── Full auto mark log ────────────────────────────────────────
    const markLog = JSON.parse(localStorage.getItem('autoMarkLog') || '[]');
    logLines.push(`--- Auto Mark Log (all ${markLog.length} entries) ---`);
    if (markLog.length === 0) {
        logLines.push('(empty)');
    } else {
        markLog.forEach(e => logLines.push(JSON.stringify(e)));
    }
    logLines.push('');

    // ── Unmarked workdays (possible missed office days / WFH) ─────
    // These are weekdays past-or-today within the quarter that have
    // no office mark, no leave, and are not holidays.
    const unmarked = [];
    const qStart = q.start;
    const qEnd   = new Date(Math.min(today.getTime(), q.end.getTime()));
    for (let d = new Date(qStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;                       // skip weekends
        const ds = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
        if (isHoliday(ds))    continue;                             // skip holidays
        if (officeDays[ds])   continue;                             // already marked
        if (leaveDays[ds])    continue;                             // on leave
        unmarked.push(ds);
    }
    logLines.push(`--- Unmarked Workdays (${currentQKey}) — ${unmarked.length} days (WFH or possible missed) ---`);
    logLines.push(unmarked.join(', ') || '(none — all workdays accounted for!)');
    logLines.push('');

    // ── All quarters summary ──────────────────────────────────────
    logLines.push('--- All Quarters Summary ---');
    for (const qk of Object.keys(QUARTERS)) {
        const od = JSON.parse(localStorage.getItem(`officeDays_${qk}`) || '{}');
        const am = JSON.parse(localStorage.getItem(`autoMarkedDays_${qk}`) || '{}');
        const ld = JSON.parse(localStorage.getItem(`leaveDays_${qk}`) || '{}');
        logLines.push(`${qk}: office=${Object.keys(od).length}, auto=${Object.keys(am).filter(d => am[d]).length}, leave=${Object.keys(ld).length}`);
    }
    logLines.push(`Stored quarter key: ${localStorage.getItem('oatCurrentQuarter') || 'none (auto)'}`);

    const report = logLines.join('\n');

    const showNote = () => {
        const note = document.getElementById('chatChoiceReportNote');
        if (note) note.style.display = 'flex';
    };

    const openTeams = () => {
        const msg = encodeURIComponent('Hi Gaurav, reporting an issue with OAT.\n\n[Paste diagnostic logs below — already copied to clipboard]\n\nIssue: ');
        window.open(`https://teams.microsoft.com/l/chat/0/0?users=Gaurav.Tripathi@netapp.com&message=${msg}`, '_blank');
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(report).then(() => {
            showNote();
            setTimeout(openTeams, 600);
        }).catch(() => {
            window.prompt('Copy these diagnostic logs, then paste in Teams chat:', report);
            openTeams();
            closeChatModal();
        });
    } else {
        window.prompt('Copy these diagnostic logs, then paste in Teams chat:', report);
        openTeams();
        closeChatModal();
    }
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
    // The trends chart is canvas-drawn, so it can't restyle itself via CSS —
    // repaint it with the new theme's palette.
    const trendsPanel = document.getElementById('trendsPanel');
    if (trendsPanel && trendsPanel.classList.contains('open')) drawWeeklyChart();
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
    const hasAutoMarks = autoMarkCount() > 0;
    const hasAutoLog = autoMarkLog.length > 0;
    return !!(scriptActive || hasAutoMarks || hasAutoLog);
}

function getSetupStatusText() {
    const scriptActive = localStorage.getItem('oatScriptActive');
    const autoCount = autoMarkCount();

    if (scriptActive) {
        const lastRun = new Date(scriptActive);
        return `Last auto-mark trigger: ${lastRun.toLocaleDateString()} ${lastRun.toLocaleTimeString()}`;
    }
    if (autoCount > 0) {
        return `${autoCount} day(s) auto-marked so far`;
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
function checkForStaleSetup() { return; } // auto-prompts disabled — update card shown in settings only

// Show update option quietly inside Settings only (user-initiated)
// Only shown if script is installed but version is old or unknown
function showSettingsUpdateCard() {
    const scriptActive = localStorage.getItem('oatScriptActive');
    // No script ever ran — nothing to update
    if (!scriptActive) return;
    // Only prompt when the installed script is genuinely too old. The old
    // check was `scriptVer === REQUIRED_SCRIPT_VERSION`, so ANY mismatch
    // nagged — including a script newer than the app expected.
    if (!scriptNeedsUpdate()) return;
    // Respect a previous "Maybe Later" for this same target version
    if (localStorage.getItem(updateDismissedKey())) return;
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

// ── Birthday popup ────────────────────────────────────────────────
function checkBirthdayToday() {
    const todayStr = getTodayStr(); // YYYY-MM-DD
    const people = getBirthdayPeople(todayStr);
    if (people.length === 0) return;
    // Show once per day, survives page refresh
    const seenKey = 'oatBdaySeen_' + todayStr;
    if (localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, '1');
    // Slight delay so page loads first
    setTimeout(() => showBirthdayPopup(people), 900);
}

function showBirthdayPopup(people) {
    const names = people.map(p => p.name);
    const isYou = names.includes('Gaurav Tripathi');
    const nameStr = names.join(' & ');
    const title = isYou && names.length === 1
        ? '🎉 Happy Birthday, Gaurav!'
        : `🎂 ${nameStr}'s Birthday Today!`;
    const msg = isYou && names.length === 1
        ? 'Wishing you a fantastic birthday! Hope this year brings you joy, success, and lots of office check-ins 🎈'
        : `Today is ${nameStr}'s birthday! 🎈 Take a moment to wish them — it'll make their day special! 🥳`;
    document.getElementById('bdayPopupTitle').textContent = title;
    document.getElementById('bdayPopupMsg').textContent = msg;
    document.getElementById('bdayPopupOverlay').style.display = 'flex';
}

function bdayPopupClose(e) {
    if (e.target === document.getElementById('bdayPopupOverlay')) {
        document.getElementById('bdayPopupOverlay').style.display = 'none';
    }
}

function reopenUpdatePopup() {
    sessionStorage.removeItem('oatPopupDismissed');
    const popup = document.getElementById('updatePopupOverlay');
    if (popup) popup.style.display = 'flex';
    // Populate the static list from the changelog (it shipped holding an
    // older release's notes)
    const staticList = popup && popup.querySelector('.update-popup-features');
    if (staticList) staticList.innerHTML = renderUpdateFeatures();
    // Reset modal content in case it was replaced by copied state
    const modal = popup && popup.querySelector('.update-popup-modal');
    if (modal && !modal.querySelector('.update-popup-features')) {
        const scriptActive = localStorage.getItem('oatScriptActive');
        modal.innerHTML = `
            <div class="update-popup-icon">🔄</div>
            <h2>Update Available!</h2>
            <p class="update-popup-desc">${scriptActive ? 'A new version of OAT is ready with important improvements:' : 'Your auto-tracking needs a quick update to get working:'}</p>
            <ul class="update-popup-features">${renderUpdateFeatures()}</ul>
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
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showPopupCopiedState(os);
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
    // Persist so it stays dismissed across sessions, not just this tab
    localStorage.setItem(updateDismissedKey(), new Date().toISOString());
    const card = document.getElementById('settingsUpdateCard');
    if (card) card.style.display = 'none';
    const dot = document.getElementById('settingsUpdateDot');
    if (dot) dot.style.display = 'none';
}

function dismissUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('oatUpdateDismissed', new Date().toISOString());
}

function showOnboarding() {
    const alreadySetup = isSetupAlreadyDone();

    document.getElementById('onboardOverlay').style.display = 'flex';
    document.getElementById('onboardStep2').style.display = 'none';

    // Copy said "Track your Q1 office attendance" as static text — wrong for
    // anyone onboarding in Q2 or later.
    const qLabel = document.getElementById('onboardQuarterLabel');
    if (qLabel) qLabel.textContent = currentQKey;

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

    // Backfill data always describes today's quarter. If the user was browsing
    // another quarter, switch first — otherwise every date fails isInRange()
    // and the whole backfill is silently discarded.
    const todaysQuarter = autoDetectQuarter();
    if (todaysQuarter !== currentQKey) {
        switchQuarter(todaysQuarter);
    }

    let newCount = 0;
    let skipCount = 0;
    let outOfRange = 0;

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
        // Skip out of range (belongs to a different quarter)
        if (!isInRange(date)) { outOfRange++; return; }

        // If already WiFi-verified, skip
        if (autoMarkedDays[dateStr]) {
            skipCount++;
            return;
        }

        checkedDays[dateStr] = true;
        autoMarkedDays[dateStr] = true;
        if (leaveDays[dateStr]) delete leaveDays[dateStr];
        newCount++;
    });

    localStorage.setItem(qKey('officeDays'), JSON.stringify(checkedDays));
    localStorage.setItem(qKey('autoMarkedDays'), JSON.stringify(autoMarkedDays));
    saveLeaveDays();

    // Log the backfill
    const logEntry = `${new Date().toLocaleString()} — Backfilled ${newCount} days from WiFi logs (${skipCount} already marked)`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 120) autoMarkLog.pop();
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));

    if (newCount > 0) {
        showNotification(`📡 Backfilled ${newCount} days from WiFi history!${skipCount > 0 ? ` (${skipCount} already WiFi-verified)` : ''}`, 'success');
    } else if (skipCount > 0) {
        showNotification(`✅ All ${skipCount} days from WiFi history already WiFi-verified!`, 'already');
    } else {
        showNotification(`\uD83D\uDCCB No valid workdays found in the backfill data.${outOfRange > 0 ? ` (${outOfRange} outside ${currentQKey})` : ''}`, 'info');
    }

    renderCalendars();
}

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

