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
        logEl.innerHTML = autoMarkLog.map(entry => `<div>${entry}</div>`).join('');
    }
}

// Toggle day selection
function toggleDay(dateStr) {
    if (checkedDays[dateStr]) {
        // Unchecking — confirm before removing
        if (!confirm(`Remove attendance for ${dateStr}? Are you sure?`)) return;
        delete checkedDays[dateStr];
        delete autoMarkedDays[dateStr];
    } else {
        // Checking — confirm before marking
        if (!confirm(`Mark ${dateStr} as office day? Are you sure?`)) return;
        checkedDays[dateStr] = true;
    }
    localStorage.setItem('officeDays', JSON.stringify(checkedDays));
    localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));
    renderCalendars();
}

// Reset all selections
function resetAll() {
    if (confirm('Are you sure you want to reset all office days?')) {
        checkedDays = {};
        autoMarkedDays = {};
        localStorage.setItem('officeDays', JSON.stringify(checkedDays));
        localStorage.setItem('autoMarkedDays', JSON.stringify(autoMarkedDays));
        renderCalendars();
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

            const clickHandler = (!inRange || holiday || isWeekend) ? '' : `onclick="toggleDay('${dateStr}')"`;

            daysHTML += `<div class="${cellClass}" ${clickHandler}>${day}</div>`;
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
    renderCalendars();

    // Check for auto-mark trigger via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('automark') === 'true') {
        if (settings.autoMarkEnabled !== false) {
            autoMarkToday();
        }
        // Clean up URL (remove ?automark=true) without reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Show onboarding for first-time visitors (or ?newuser=true for demo)
    const urlParams2 = new URLSearchParams(window.location.search);
    if (!localStorage.getItem('oatOnboarded') || urlParams2.get('newuser') === 'true') {
        showOnboarding();
    }
});

// OS tab switching in settings
function showOS(os) {
    document.querySelectorAll('.os-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.os-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('os-' + os).style.display = 'block';
    event.target.classList.add('active');
}

// ---- Onboarding Flow ----
function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('linux')) return 'linux';
    return 'unknown';
}

function showOnboarding() {
    document.getElementById('onboardOverlay').style.display = 'flex';
    document.getElementById('onboardStep1').style.display = 'block';
    document.getElementById('onboardStep2').style.display = 'none';
}

function onboardSkip() {
    localStorage.setItem('oatOnboarded', 'skipped');
    document.getElementById('onboardOverlay').style.display = 'none';
}

function onboardYes() {
    const os = detectOS();
    document.getElementById('onboardStep1').style.display = 'none';
    document.getElementById('onboardStep2').style.display = 'block';

    const cmdsEl = document.getElementById('setupCommands');

    if (os === 'windows') {
        document.getElementById('osIcon').textContent = '\uD83E\uDE9F';
        document.getElementById('osTitle').textContent = 'Windows Setup';
        document.getElementById('osName').textContent = 'Windows';
        document.getElementById('terminalName').textContent = 'PowerShell (Run as Admin)';
        document.getElementById('downloadBtn1').textContent = '\uD83D\uDCE5 Download auto-attendance.ps1';
        document.getElementById('downloadBtn2').textContent = '\uD83D\uDCE5 Download Task XML';
        cmdsEl.innerHTML = `
            <code>cd $env:USERPROFILE\\Downloads</code>
            <code>mkdir -Force $env:USERPROFILE\\Desktop\\OAT</code>
            <code>Move-Item auto-attendance.ps1, auto-attendance-task.xml $env:USERPROFILE\\Desktop\\OAT\\</code>
            <code>Register-ScheduledTask -Xml (Get-Content "$env:USERPROFILE\\Desktop\\OAT\\auto-attendance-task.xml" | Out-String) -TaskName "OAT-WiFiAttendance"</code>
        `;
        window._oatCmds = `cd $env:USERPROFILE\\Downloads\nmkdir -Force $env:USERPROFILE\\Desktop\\OAT\nMove-Item auto-attendance.ps1, auto-attendance-task.xml $env:USERPROFILE\\Desktop\\OAT\\\nRegister-ScheduledTask -Xml (Get-Content "$env:USERPROFILE\\Desktop\\OAT\\auto-attendance-task.xml" | Out-String) -TaskName "OAT-WiFiAttendance"`;
    } else {
        // Mac / Linux
        document.getElementById('osIcon').textContent = '\uD83C\uDF4E';
        document.getElementById('osTitle').textContent = 'Mac Setup';
        document.getElementById('osName').textContent = 'macOS';
        document.getElementById('terminalName').textContent = 'Terminal';
        document.getElementById('downloadBtn1').textContent = '\uD83D\uDCE5 Download auto-attendance.sh';
        document.getElementById('downloadBtn2').textContent = '\uD83D\uDCE5 Download LaunchAgent plist';
        cmdsEl.innerHTML = `
            <code>mkdir -p ~/Desktop/OAT</code>
            <code>mv ~/Downloads/auto-attendance.sh ~/Downloads/com.oat.wifiattendance.plist ~/Desktop/OAT/</code>
            <code>chmod +x ~/Desktop/OAT/auto-attendance.sh</code>
            <code>cp ~/Desktop/OAT/com.oat.wifiattendance.plist ~/Library/LaunchAgents/</code>
            <code>launchctl load ~/Library/LaunchAgents/com.oat.wifiattendance.plist</code>
        `;
        window._oatCmds = `mkdir -p ~/Desktop/OAT\nmv ~/Downloads/auto-attendance.sh ~/Downloads/com.oat.wifiattendance.plist ~/Desktop/OAT/\nchmod +x ~/Desktop/OAT/auto-attendance.sh\ncp ~/Desktop/OAT/com.oat.wifiattendance.plist ~/Library/LaunchAgents/\nlaunchctl load ~/Library/LaunchAgents/com.oat.wifiattendance.plist`;
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

function onboardDone() {
    localStorage.setItem('oatOnboarded', 'completed');
    document.getElementById('onboardOverlay').style.display = 'none';
    showNotification('\uD83C\uDF89 Setup complete! Your attendance will auto-track when you connect to office WiFi.', 'success');
}
