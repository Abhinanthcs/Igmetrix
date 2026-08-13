let allHistoryCache = [];

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Attach listener for optional history date filtering
    document.getElementById('historyDateFilter')?.addEventListener('change', (e) => {
        filterAndRenderHistory(e.target.value);
    });

    loadSummary(token);
    loadHistory(token);
});

// Navigation Drawer Toggle Function
function toggleMenu() {
    const drawer = document.getElementById('menuDrawer');
    const overlay = document.getElementById('menuOverlay');

    if (!drawer || !overlay) return;

    if (drawer.classList.contains('-translate-x-full')) {
        drawer.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        drawer.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

async function loadSummary(token) {
    try {
        const response = await fetch('/student/summary', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const data = await response.json();

        // Existing DOM assignments
        document.getElementById('regNum').innerText = data.registerNumber || '-';
        document.getElementById('totalClasses').innerText = data.totalClasses || 0;
        document.getElementById('presentCount').innerText = data.presentCount || 0;
        document.getElementById('absentCount').innerText = data.absentCount || 0;

        const overallPerc = data.attendancePercentage || 0;
        const percElement = document.getElementById('attendancePerc');

        if (percElement) {
            percElement.innerText = `${overallPerc}%`;

            // Update color according to percentage threshold
            if (overallPerc < 65) {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-rose-600';
            } else if (overallPerc < 75) {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-amber-600';
            } else {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-indigo-600';
            }
        }

        // Eligibility alert check (< 75%)
        const alertBanner = document.getElementById('eligibilityAlert');
        if (alertBanner) {
            if (overallPerc < 75 && (data.totalClasses || 0) > 0) {
                alertBanner.classList.remove('hidden');
            } else {
                alertBanner.classList.add('hidden');
            }
        }

        // Attendance Target Calculator Simulator
        renderBunkCalculator(data.presentCount || 0, data.totalClasses || 0);

    } catch (e) {
        console.error('Error fetching summary:', e);
    }
}

async function loadHistory(token) {
    try {
        const response = await fetch('/student/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const history = await response.json();
        allHistoryCache = history || [];

        // Render history table
        filterAndRenderHistory();

        // Process and render subject-wise breakdown from attendance history
        renderSubjectBreakdown(allHistoryCache);

        // Process and render today's attendance circle indicators
        renderTodayAttendance(allHistoryCache);

    } catch (e) {
        console.error('Error fetching history:', e);
    }
}

function renderTodayAttendance(history) {
    const dateEl = document.getElementById('todayDateText');
    const badgeEl = document.getElementById('todaySummaryBadge');
    const container = document.getElementById('todayHoursContainer');

    if (!container) return;

    const todayObj = new Date();
    // Local date formatted string (e.g. "2026-08-13")
    const year = todayObj.getFullYear();
    const month = String(todayObj.getMonth() + 1).padStart(2, '0');
    const day = String(todayObj.getDate()).padStart(2, '0');
    const todayIso = `${year}-${month}-${day}`;

    if (dateEl) {
        dateEl.innerText = todayObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    }

    // Filter attendance entries for today
    const todayRecords = (history || []).filter(item => item.date === todayIso);

    // Map hour status for hours 1 to 5
    const hourMap = {};
    todayRecords.forEach(r => {
        const h = parseInt(String(r.hour || '').replace(/\D/g, '') || 0, 10);
        if (h > 0) hourMap[h] = r.status;
    });

    let presentCount = 0;
    let totalClassesToday = 0;
    const maxHours = 5; // Set to strictly 5 hours
    let html = '';

    for (let h = 1; h <= maxHours; h++) {
        const status = hourMap[h] ? String(hourMap[h]).toUpperCase() : null;

        // Default: Unmarked / No Class
        let circleClass = 'bg-slate-50 border-slate-200 text-slate-400';

        if (status === 'P' || status === 'PRESENT') {
            circleClass = 'bg-emerald-100/80 border-emerald-400 text-emerald-800 font-bold shadow-xs';
            presentCount++;
            totalClassesToday++;
        } else if (status === 'L' || status === 'LATE') {
            circleClass = 'bg-amber-100/80 border-amber-400 text-amber-800 font-bold shadow-xs';
            totalClassesToday++;
        } else if (status === 'A' || status === 'ABSENT') {
            circleClass = 'bg-rose-100/80 border-rose-400 text-rose-800 font-bold shadow-xs';
            totalClassesToday++;
        }

        html += `
            <div class="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center ${circleClass} text-xs font-semibold transition-all">
                ${h} hr
            </div>
        `;
    }

    if (badgeEl) {
        badgeEl.innerText = `${presentCount}/${totalClassesToday}`;
    }

    container.innerHTML = html;
}

function filterAndRenderHistory(selectedDate = '') {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let filtered = selectedDate
        ? allHistoryCache.filter(item => item.date === selectedDate)
        : [...allHistoryCache];

    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found.</td></tr>`;
        return;
    }

    // --- MULTI-LEVEL SORTING ---
    // 1. Date (Descending - Newest first)
    // 2. Hour (Ascending - Hour 1, Hour 2...)
    filtered.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;

        const hourA = parseInt(String(a.hour || '').replace(/\D/g, '') || 0, 10);
        const hourB = parseInt(String(b.hour || '').replace(/\D/g, '') || 0, 10);
        return hourA - hourB;
    });

    filtered.forEach(item => {
        const isPresent = item.status === 'P' || item.status === 'PRESENT';
        const badgeClass = isPresent
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
            : 'bg-rose-50 text-rose-700 border-rose-200/80';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs text-slate-400">${item.id}</td>
            <td class="px-4 py-3 font-bold text-slate-800 tracking-wide">${escapeHtml(item.subjectCode)}</td>
            <td class="px-4 py-3 text-slate-600">${escapeHtml(item.subjectName)}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-500">${escapeHtml(item.date)}</td>
            <td class="px-4 py-3 text-slate-700 font-semibold">${escapeHtml(String(item.hour))}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold rounded border ${badgeClass}">
                    ${isPresent ? 'P' : 'A'}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderSubjectBreakdown(history) {
    const container = document.getElementById('subjectBreakdownContainer');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic col-span-2">No subject data available.</p>`;
        return;
    }

    // Group history entries by subject code
    const subjectMap = {};
    history.forEach(item => {
        const code = item.subjectCode || 'UNKNOWN';
        if (!subjectMap[code]) {
            subjectMap[code] = {
                name: item.subjectName || code,
                total: 0,
                present: 0
            };
        }
        subjectMap[code].total += 1;
        if (item.status === 'P' || item.status === 'PRESENT') {
            subjectMap[code].present += 1;
        }
    });

    container.innerHTML = Object.keys(subjectMap).map(code => {
        const sub = subjectMap[code];
        const perc = sub.total > 0 ? Math.round((sub.present / sub.total) * 100) : 0;

        // Define color tiers: <65% (Red), 65%-74% (Amber), >=75% (Green)
        let barColor = 'bg-emerald-500';
        let badgeStyle = 'bg-emerald-100 text-emerald-800';
        let borderStyle = 'border-slate-200/80';

        if (perc < 65) {
            barColor = 'bg-rose-500';
            badgeStyle = 'bg-rose-100 text-rose-800';
            borderStyle = 'border-l-4 border-l-rose-500 border-slate-200/80';
        } else if (perc < 75) {
            barColor = 'bg-amber-500';
            badgeStyle = 'bg-amber-100 text-amber-800';
            borderStyle = 'border-l-4 border-l-amber-500 border-slate-200/80';
        }

        return `
            <div class="p-3.5 border ${borderStyle} rounded-lg bg-slate-50/50 space-y-2.5 shadow-xs">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-xs font-bold text-slate-800 tracking-wide">${escapeHtml(code)}</p>
                        <p class="text-[11px] text-slate-500 font-medium">${escapeHtml(sub.name)}</p>
                    </div>
                    <span class="text-xs font-bold font-mono px-2 py-0.5 rounded ${badgeStyle}">${perc}%</span>
                </div>
                <div class="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                    <div class="${barColor} h-2 rounded-full transition-all duration-300" style="width: ${perc}%"></div>
                </div>
                <p class="text-[10px] text-slate-400 text-right font-medium">${sub.present} / ${sub.total} Classes Attended</p>
            </div>
        `;
    }).join('');
}

function renderBunkCalculator(present, total) {
    const adviceEl = document.getElementById('calculatorAdvice');
    if (!adviceEl) return;

    if (total === 0) {
        adviceEl.className = "p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `No classes recorded yet to compute attendance target status.`;
        return;
    }

    const currentPerc = (present / total) * 100;
    const target = 75;

    if (currentPerc >= target) {
        // Calculate how many future classes can be skipped while staying >= 75%
        const skippable = Math.floor((present - (target / 100) * total) / (target / 100));
        adviceEl.className = "p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `
            You are in the <strong class="text-emerald-700 font-bold">Safe Zone (${currentPerc.toFixed(1)}%)</strong>.
            You can skip up to <strong class="text-slate-900 font-bold">${Math.max(0, skippable)}</strong> upcoming class(es) without falling below the 75% requirement.
        `;
    } else {
        // Calculate how many consecutive classes must be attended to reach 75%
        const needed = Math.ceil(((target / 100) * total - present) / (1 - (target / 100)));
        adviceEl.className = "p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `
            You are below target at <strong class="text-amber-700 font-bold">${currentPerc.toFixed(1)}%</strong>.
            You need to attend the next <strong class="text-indigo-600 font-bold">${needed}</strong> consecutive class(es) to reach 75% attendance.
        `;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function logout() {
    localStorage.removeItem('jwtToken');
    window.location.href = 'login.html';
}

// --- EXPORT TO CSV ---
function exportStudentHistoryCSV() {
    if (!allHistoryCache || allHistoryCache.length === 0) {
        alert('No attendance history available to export.');
        return;
    }

    const regNum = document.getElementById('regNum')?.innerText || 'Student';
    const headers = ['Log ID', 'Subject Code', 'Subject Name', 'Date', 'Hour', 'Status'];

    const rows = allHistoryCache.map(item => [
        item.id,
        item.subjectCode || 'N/A',
        item.subjectName || 'N/A',
        item.date,
        item.hour,
        (item.status === 'P' || item.status === 'PRESENT') ? 'PRESENT' : 'ABSENT'
    ]);

    const filename = `Attendance_History_${regNum}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function downloadCSV(filename, headers, rows) {
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}