// Configuration
const TARGET = 39;
const startDate = new Date(2026, 3, 27);
const endDate = new Date(2026, 6, 31);

const holidays = [
    { date: '2026-05-01', name: 'May Day' },
    { date: '2026-05-28', name: 'Bakrid' }
];

const months = [
    { year: 2026, month: 3, name: 'April 2026' },
    { year: 2026, month: 4, name: 'May 2026' },
    { year: 2026, month: 5, name: 'June 2026' },
    { year: 2026, month: 6, name: 'July 2026' }
];

// State
let checkedDays = JSON.parse(localStorage.getItem('officeDays') || '{}');
let autoMarkedDays = JSON.parse(localStorage.getItem('autoMarkedDays') || '{}');
let settings = JSON.parse(localStorage.getItem('oatSettings') || '{"wifiSSID":"corp","autoMarkEnabled":true}');
let autoMarkLog = JSON.parse(localStorage.getItem('autoMarkLog') || '[]');

// Utility functions
function isHoliday(dateStr) {
    return holidays.some(h => h.date === dateStr);
}

function getHolidayName(dateStr) {
    const h = holidays.find(h => h.date === dateStr);
    return h ? h.name : '';
}

function isInRange(date) {
    return date >= startDate && date <= endDate;
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
    const dayOfWeek = today.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return isInRange(today) && !isWeekend && !isHoliday(todayStr);
}

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
    localStorage.setItem('officeDays', JSON.stringify(checkedDays));
    localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));

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

    if (!wifiConfirmedToday) {
        // Not on office WiFi (or script hasn't run today) — warn user
        const override = confirm(
            '⚠️ Office WiFi not detected!\n\n' +
            'The auto-tracking script hasn\'t confirmed an office WiFi connection today.\n\n' +
            'Are you sure you\'re at the office? Click OK to mark anyway, or Cancel to skip.'
        );
        if (!override) return;
    }

    // Mark today
    checkedDays[todayStr] = true;
    autoMarkedDays[todayStr] = wifiConfirmedToday;
    localStorage.setItem('officeDays', JSON.stringify(checkedDays));
    localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));
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
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
        loadSettingsUI();
    }
}

function loadSettingsUI() {
    document.getElementById('wifiSSID').value = settings.wifiSSID || '';
    document.getElementById('autoMarkEnabled').checked = settings.autoMarkEnabled !== false;
    renderAutoMarkLog();
}

function saveSettings() {
    settings.wifiSSID = document.getElementById('wifiSSID').value.trim();
    settings.autoMarkEnabled = document.getElementById('autoMarkEnabled').checked;
    localStorage.setItem('oatSettings', JSON.stringify(settings));

    // Also write SSID to a config file accessible by the shell script
    // (The script reads from localStorage via this page, so this is for display only)
    showNotification('⚙️ Settings saved! WiFi SSID: ' + settings.wifiSSID, 'success');
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
    if (checkedDays[dateStr]) {
        // Auto-marked days are locked — WiFi-verified, can't undo
        if (autoMarkedDays[dateStr]) {
            showNotification('🔒 This day was auto-marked via office WiFi and cannot be removed.', 'info');
            return;
        }
        // Unchecking manual mark — confirm before removing
        if (!confirm(`Remove attendance for ${dateStr}? Are you sure?`)) return;
        delete checkedDays[dateStr];
    } else {
        // Checking — confirm before marking
        if (!confirm(`Mark ${dateStr} as office day? Are you sure?`)) return;
        checkedDays[dateStr] = true;
    }
    localStorage.setItem('officeDays', JSON.stringify(checkedDays));
    localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));
    renderCalendars();
}

// Reset only manual selections (auto-marked days are preserved)
function resetAll() {
    const autoCount = Object.keys(autoMarkedDays).length;
    const manualCount = Object.keys(checkedDays).length - autoCount;
    if (manualCount === 0) {
        showNotification('Nothing to reset — all marked days are WiFi auto-marks (locked).', 'info');
        return;
    }
    if (confirm(`Reset ${manualCount} manually marked day(s)?\n\n${autoCount} auto-marked day(s) will be preserved (WiFi-verified).`)) {
        // Keep only auto-marked days
        const preserved = {};
        for (const dateStr of Object.keys(autoMarkedDays)) {
            preserved[dateStr] = true;
        }
        checkedDays = preserved;
        localStorage.setItem('officeDays', JSON.stringify(checkedDays));
        renderCalendars();
        showNotification(`🔄 Reset ${manualCount} manual mark(s). ${autoCount} auto-mark(s) preserved.`, 'success');
    }
}

// Render calendars
function renderCalendars() {
    const container = document.getElementById('calendars');
    container.innerHTML = '';

    let totalWorkDays = 0;
    let totalOfficeDays = 0;

    months.forEach(m => {
        const card = document.createElement('div');
        card.className = 'month-card';

        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const firstDay = new Date(m.year, m.month, 1).getDay();
        const startDay = firstDay === 0 ? 6 : firstDay - 1;

        let monthWorkDays = 0;
        let monthOfficeDays = 0;
        let monthHolidays = 0;

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

            let cellClass = 'day-cell';

            if (!inRange) {
                cellClass += ' before-range';
            } else if (holiday) {
                cellClass += ' holiday';
                monthHolidays++;
            } else if (isSaturday) {
                cellClass += ' saturday';
            } else if (isSunday) {
                cellClass += ' sunday';
            } else {
                cellClass += ' weekday';
                // Future dates get a dimmed style
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (date > today) {
                    cellClass += ' future';
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
                }
            }

            // Build tooltip
            let tooltip = '';
            if (holiday) {
                tooltip = `🎉 ${getHolidayName(dateStr)}`;
            } else if (isSaturday || isSunday) {
                tooltip = 'Weekend';
            } else if (inRange) {
                const today2 = new Date();
                today2.setHours(0, 0, 0, 0);
                if (date > today2) {
                    tooltip = 'Future date';
                } else if (checked) {
                    tooltip = autoMarkedDays[dateStr] ? '🔒 Auto-marked (WiFi verified)' : '✅ Office day (click to remove)';
                } else {
                    tooltip = 'Workday (not marked)';
                }
            }

            const clickHandler = (!inRange || holiday || isWeekend) ? '' : `onclick="toggleDay('${dateStr}')"`;
            const tipAttr = tooltip ? `data-tip="${tooltip}"` : '';

            daysHTML += `<div class="${cellClass}" ${clickHandler} ${tipAttr}>${day}</div>`;
        }

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
                <div>📊 Working Days: <strong>${monthWorkDays}</strong></div>
                <div style="color:#00b894">✅ Office: <strong>${monthOfficeDays}</strong></div>
                ${monthHolidays > 0 ? `<div style="color:#e17055">🎉 Holidays: <strong>${monthHolidays}</strong></div>` : ''}
            </div>
        `;

        container.appendChild(card);
    });

    // Update summary
    const remaining = Math.max(0, TARGET - totalOfficeDays);
    const percentage = Math.min(100, Math.round((totalOfficeDays / TARGET) * 100));

    document.getElementById('totalWorkDays').textContent = totalWorkDays;
    document.getElementById('totalOfficeDays').textContent = totalOfficeDays;
    document.getElementById('remainingDays').textContent = remaining;

    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = percentage + '%';
    progressBar.textContent = percentage + '%';

    const confetti = document.getElementById('confetti');
    const status = document.getElementById('targetStatus');

    if (totalOfficeDays >= TARGET) {
        progressBar.className = 'progress-bar complete';
        confetti.style.display = 'block';
        status.innerHTML = '🏆 <strong>Target Achieved!</strong> You are a rockstar! 🌟';
        status.style.color = '#00b894';
    } else if (totalOfficeDays >= TARGET * 0.75) {
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        status.innerHTML = '🔥 <strong>Almost there!</strong> Keep going!';
        status.style.color = '#fdcb6e';
    } else {
        progressBar.className = 'progress-bar';
        confetti.style.display = 'none';
        status.innerHTML = `💪 <strong>${remaining} more days</strong> to hit the target!`;
        status.style.color = '#74b9ff';
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    renderCalendars();

    // Check for auto-mark trigger via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('automark') === 'true') {
        // Record that the background script is working
        localStorage.setItem('oatScriptActive', new Date().toISOString());
        if (settings.autoMarkEnabled !== false) {
            autoMarkToday();
        }
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
    const urlParams2 = new URLSearchParams(window.location.search);
    if (!localStorage.getItem('oatOnboarded') || urlParams2.get('newuser') === 'true') {
        showOnboarding();
    }

    // Update setup status indicator
    updateSetupStatus();

    // Check if existing users need to update their setup
    checkForStaleSetup();

    // Show user greeting if name is saved
    showUserGreeting();
});

// OS tab switching in settings
function showOS(os) {
    document.querySelectorAll('.os-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.os-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('os-' + os).style.display = 'block';
    event.target.classList.add('active');
}

// ---- Feedback ----
const TEAMS_WEBHOOK = 'https://default4b0911a0929b4715944bc03745165b.3a.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/486c0ca0c71548cb9209647f253bd7f0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=N1OnL8F7umiI2e3flX76BAkyGjYTgfsjjOpcO41ZVzg';

let _feedbackRating = 0;

function openFeedback() {
    _feedbackRating = 0;
    document.getElementById('feedbackMsg').value = '';
    document.getElementById('feedbackName').value = localStorage.getItem('oatUserName') || '';
    document.getElementById('feedbackStatus').textContent = '';
    document.getElementById('feedbackStatus').className = 'feedback-status';
    document.getElementById('feedbackOverlay').style.display = 'flex';
}

function closeFeedback() {
    document.getElementById('feedbackOverlay').style.display = 'none';
}

function submitFeedback() {
    const msg = document.getElementById('feedbackMsg').value.trim();
    const name = document.getElementById('feedbackName').value.trim() || 'Anonymous';
    const status = document.getElementById('feedbackStatus');
    const btn = document.querySelector('.feedback-submit-btn');

    if (!msg) {
        status.textContent = 'Please add a message before sending.';
        status.className = 'feedback-status error';
        return;
    }

    const os = detectOS() === 'windows' ? '🪟 Windows' : detectOS() === 'mac' ? '🍎 Mac' : '🖥️ Other';
    const date = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const body = {
        text: `📝 **OAT Feedback**\n\n👤 **From:** ${name} (${os})\n💬 **Message:** ${msg}\n🕐 **Time:** ${date}`
    };

    btn.disabled = true;
    btn.textContent = 'Sending...';

    fetch(TEAMS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(res => {
        status.textContent = '✅ Thanks! Feedback sent successfully.';
        status.className = 'feedback-status success';
        btn.textContent = 'Sent!';
        setTimeout(() => closeFeedback(), 2000);
    }).catch(() => {
        status.textContent = '❌ Could not send. Please try again.';
        status.className = 'feedback-status error';
        btn.disabled = false;
        btn.textContent = 'Send Feedback 🚀';
    });
}

// ---- Theme Toggle ----
function initTheme() {
    const saved = localStorage.getItem('oatTheme');
    const btn = document.getElementById('themeBtn');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        if (btn) btn.textContent = '☀️';
    } else {
        if (btn) btn.textContent = '🌙';
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = isLight ? '☀️' : '🌙';
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
    // Show a small status indicator on the main page if setup is active
    const existing = document.getElementById('setupStatusBadge');
    if (existing) existing.remove();

    if (isSetupAlreadyDone()) {
        const badge = document.createElement('div');
        badge.id = 'setupStatusBadge';
        badge.className = 'setup-status-badge active';
        badge.innerHTML = '🤖 Auto-tracking active';
        badge.title = getSetupStatusText();
        const header = document.querySelector('h1');
        if (header) header.after(badge);
    }
}

// ---- Stale Setup Detection & Reinstall ----
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

    // If the page was opened via ?automark=true, script is working — not stale
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('automark') === 'true') return false;

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

function checkForStaleSetup() {
    if (!isSetupStale()) return;

    // Check if user already dismissed the popup this session
    const dismissed = sessionStorage.getItem('oatPopupDismissed');

    if (!dismissed) {
        // Show the popup modal first
        const popup = document.getElementById('updatePopupOverlay');
        if (popup) {
            const scriptActive = localStorage.getItem('oatScriptActive');
            const desc = popup.querySelector('.update-popup-desc');
            if (desc) {
                desc.textContent = scriptActive
                    ? 'A new version of OAT is ready with important improvements:'
                    : 'Your auto-tracking needs a quick update to get working:';
            }
            popup.style.display = 'flex';
        }
    } else {
        // Popup was dismissed — show the smaller banner as fallback
        showUpdateBanner();
    }
}

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
                <li>🛡️ Fixed auto-tracking on cloud-synced folders (OneDrive/iCloud)</li>
                <li>⚡ Faster &amp; more reliable WiFi detection</li>
                <li>📂 Scripts now install to a safe local path</li>
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
        ? 'irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex'
        : 'curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash';

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
        ? 'curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash'
        : 'irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex';

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
    const cmd = '& "$env:LOCALAPPDATA\OAT\auto-attendance.ps1"';
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

function showWinRunStatus(state) {
    const status = document.getElementById('winManualRunStatus');
    const btn = document.querySelector('.manual-run-btn');
    if (state === 'copied') {
        if (status) {
            status.textContent = '✅ Copied! Open Terminal → paste → press Enter';
            status.style.color = '#55efc4';
        }
        if (btn) btn.textContent = '📋 Copy Again';
        setTimeout(() => {
            if (status) status.textContent = '';
            if (btn) btn.textContent = '▶ Run WiFi Check Now';
        }, 5000);
    }
}

function dismissUpdateBanner() {
    document.getElementById('updateBanner').style.display = 'none';
    localStorage.setItem('oatUpdateDismissed', new Date().toISOString());
}

function triggerAutoPatch() {
    const os = detectOS();
    const cmd = os === 'windows'
        ? 'irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex'
        : 'curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash';

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
            <div class="patch-cmd-box"><code>curl -sL https://tripathigaurav.github.io/OAT/install-mac.command | bash</code></div>
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
            <div class="patch-cmd-box"><code>irm https://tripathigaurav.github.io/OAT/install-win.ps1 | iex</code></div>
            <div class="patch-instructions">
                1. Open <strong>Terminal</strong> &nbsp;<span class="keys">Win+X</span> → Terminal or Command Prompt<br>
                2. Paste &nbsp;<span class="keys">Ctrl+V</span> → press <span class="keys">Enter</span>
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
            if (lastRun.toDateString() === now.toDateString()) {
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
        greetingEl.style.display = 'block';
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

    const cmdsEl = document.getElementById('setupCommands');

    if (os === 'windows') {
        document.getElementById('osIcon').textContent = '\uD83E\uDE9F';
        document.getElementById('osTitle').textContent = 'Windows Setup';
        document.getElementById('osName').textContent = 'Windows';
        document.getElementById('terminalName').textContent = 'Terminal / Command Prompt';
        document.getElementById('downloadBtn1').textContent = '\uD83D\uDCE5 Download auto-attendance.ps1';
        document.getElementById('downloadBtn2').textContent = '\uD83D\uDCE5 Download Task XML';
        // Show Windows one-click, hide Mac
        document.getElementById('oneClickWin').style.display = 'block';
        document.getElementById('oneClickMac').style.display = 'none';
        cmdsEl.innerHTML = `
            <code># Move files to local OAT folder (avoids OneDrive sync issues)</code>
            <code>mkdir -Force $env:LOCALAPPDATA\OAT</code>
            <code>Move-Item -Force $env:USERPROFILE\Downloads\auto-attendance.ps1 $env:LOCALAPPDATA\OAT\</code>
            <code>Move-Item -Force $env:USERPROFILE\Downloads\auto-attendance-task.xml $env:LOCALAPPDATA\OAT\</code>
            <code># Fix path in task config</code>
            <code>(Get-Content "$env:LOCALAPPDATA\OAT\auto-attendance-task.xml") -replace '%LOCALAPPDATA%\\OAT', "$env:LOCALAPPDATA\OAT" | Set-Content "$env:LOCALAPPDATA\OAT\auto-attendance-task.xml"</code>
            <code># Register scheduled task (requires Admin)</code>
            <code>Register-ScheduledTask -Xml (Get-Content "$env:LOCALAPPDATA\OAT\auto-attendance-task.xml" | Out-String) -TaskName "OAT-WiFiAttendance" -Force</code>
        `;
        window._oatCmds = `mkdir -Force $env:LOCALAPPDATA\\OAT\nMove-Item -Force $env:USERPROFILE\\Downloads\\auto-attendance.ps1 $env:LOCALAPPDATA\\OAT\\\nMove-Item -Force $env:USERPROFILE\\Downloads\\auto-attendance-task.xml $env:LOCALAPPDATA\\OAT\\\n(Get-Content "$env:LOCALAPPDATA\\OAT\\auto-attendance-task.xml") -replace '%LOCALAPPDATA%\\\\OAT', "$env:LOCALAPPDATA\\OAT" | Set-Content "$env:LOCALAPPDATA\\OAT\\auto-attendance-task.xml"\nRegister-ScheduledTask -Xml (Get-Content "$env:LOCALAPPDATA\\OAT\\auto-attendance-task.xml" | Out-String) -TaskName "OAT-WiFiAttendance" -Force`;
    } else {
        // Mac / Linux — show terminal command (avoids permission issues)
        document.getElementById('osIcon').textContent = '\uD83C\uDF4E';
        document.getElementById('osTitle').textContent = 'Mac Setup';
        document.getElementById('osName').textContent = 'macOS';
        document.getElementById('terminalName').textContent = 'Terminal';
        document.getElementById('downloadBtn1').textContent = '\uD83D\uDCE5 Download auto-attendance.sh';
        document.getElementById('downloadBtn2').textContent = '\uD83D\uDCE5 Download LaunchAgent plist';
        // Show Mac one-click, hide Windows
        document.getElementById('oneClickMac').style.display = 'block';
        document.getElementById('oneClickWin').style.display = 'none';
        cmdsEl.innerHTML = `
            <code># Move files to ~/.oat/ (local path — avoids cloud-sync issues)</code>
            <code>mkdir -p ~/.oat</code>
            <code>mv ~/Downloads/auto-attendance.sh ~/Downloads/com.oat.wifiattendance.plist ~/.oat/</code>
            <code>chmod +x ~/.oat/auto-attendance.sh</code>
            <code>xattr -cr ~/.oat/auto-attendance.sh 2>/dev/null</code>
            <code># Fix script path in plist to match your user</code>
            <code>sed -i '' "s|/Users/USERNAME/PLACEHOLDER/auto-attendance.sh|$HOME/.oat/auto-attendance.sh|g" ~/.oat/com.oat.wifiattendance.plist</code>
            <code># Install LaunchAgent (unload old one first if exists)</code>
            <code>launchctl unload ~/Library/LaunchAgents/com.oat.wifiattendance.plist 2>/dev/null</code>
            <code>cp ~/.oat/com.oat.wifiattendance.plist ~/Library/LaunchAgents/</code>
            <code>launchctl load ~/Library/LaunchAgents/com.oat.wifiattendance.plist</code>
        `;
        window._oatCmds = `mkdir -p ~/.oat\nmv ~/Downloads/auto-attendance.sh ~/Downloads/com.oat.wifiattendance.plist ~/.oat/\nchmod +x ~/.oat/auto-attendance.sh\nxattr -cr ~/.oat/auto-attendance.sh 2>/dev/null\nsed -i '' "s|/Users/USERNAME/PLACEHOLDER/auto-attendance.sh|$HOME/.oat/auto-attendance.sh|g" ~/.oat/com.oat.wifiattendance.plist\nlaunchctl unload ~/Library/LaunchAgents/com.oat.wifiattendance.plist 2>/dev/null\ncp ~/.oat/com.oat.wifiattendance.plist ~/Library/LaunchAgents/\nlaunchctl load ~/Library/LaunchAgents/com.oat.wifiattendance.plist`;
    }
}

function onboardBack() {
    document.getElementById('onboardStep1').style.display = 'block';
    document.getElementById('onboardStep2').style.display = 'none';
}

function downloadFile1() {
    const os = detectOS();
    const a = document.createElement('a');
    a.href = os === 'windows' ? 'auto-attendance.ps1' : 'auto-attendance.sh';
    a.download = '';
    a.click();
    document.getElementById('downloadBtn1').style.opacity = '0.5';
    document.getElementById('downloadBtn1').textContent = '\u2705 Downloaded!';
    updateDownloadStatus();
}

function downloadFile2() {
    const os = detectOS();
    const a = document.createElement('a');
    a.href = os === 'windows' ? 'auto-attendance-task.xml' : 'com.oat.wifiattendance.plist';
    a.download = '';
    a.click();
    document.getElementById('downloadBtn2').style.opacity = '0.5';
    document.getElementById('downloadBtn2').textContent = '\u2705 Downloaded!';
    updateDownloadStatus();
}

function updateDownloadStatus() {
    const btn1 = document.getElementById('downloadBtn1').textContent;
    const btn2 = document.getElementById('downloadBtn2').textContent;
    if (btn1.includes('\u2705') && btn2.includes('\u2705')) {
        document.getElementById('downloadStatus').textContent = '\u2705 Both files downloaded!';
        document.getElementById('downloadStatus').style.color = '#55efc4';
    }
}

function copyCommands() {
    if (window._oatCmds) {
        navigator.clipboard.writeText(window._oatCmds).then(() => {
            document.getElementById('copyStatus').textContent = '\u2705 Copied!';
            document.getElementById('copyStatus').style.color = '#55efc4';
        }).catch(() => {
            // Fallback for non-HTTPS
            const ta = document.createElement('textarea');
            ta.value = window._oatCmds;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            document.getElementById('copyStatus').textContent = '\u2705 Copied!';
            document.getElementById('copyStatus').style.color = '#55efc4';
        });
    }
}

// ---- Setup Option Tabs ----
function showSetupOption(option) {
    document.getElementById('optionOneClick').style.display = option === 'oneclick' ? 'block' : 'none';
    document.getElementById('optionManual').style.display = option === 'manual' ? 'block' : 'none';
    document.getElementById('tabOneClick').classList.toggle('active', option === 'oneclick');
    document.getElementById('tabManual').classList.toggle('active', option === 'manual');
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
        // Skip already marked
        if (checkedDays[dateStr]) {
            skipCount++;
            return;
        }

        // Mark it!
        checkedDays[dateStr] = true;
        autoMarkedDays[dateStr] = true;
        newCount++;
    });

    localStorage.setItem('officeDays', JSON.stringify(checkedDays));
    localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));

    // Log the backfill
    const logEntry = `${new Date().toLocaleString()} \u2014 Backfilled ${newCount} days from WiFi logs (${skipCount} already marked)`;
    autoMarkLog.unshift(logEntry);
    if (autoMarkLog.length > 30) autoMarkLog.pop();
    localStorage.setItem('autoMarkLog', JSON.stringify(autoMarkLog));

    if (newCount > 0) {
        showNotification(`\uD83D\uDCE1 Backfilled ${newCount} office days from WiFi history!${skipCount > 0 ? ` (${skipCount} already marked)` : ''}`, 'success');
    } else if (skipCount > 0) {
        showNotification(`\u2705 All ${skipCount} days from WiFi history were already marked!`, 'already');
    } else {
        showNotification('\uD83D\uDCCB No valid workdays found in the backfill data.', 'info');
    }

    renderCalendars();
}
