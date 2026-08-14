let allHistoryCache = [];
let currentHistoryViewMode = 'detailed'; // State tracker: 'detailed' | 'matrix'
let currentMonthFilter = ''; // Dynamic tracker: e.g. '2026-08' or 'ALL'

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

        // Build month tabs dynamically up to current date
        renderDynamicMonthTabs();

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

// --- DYNAMIC MONTH TAB GENERATOR ---
function renderDynamicMonthTabs() {
    const container = document.getElementById('monthTabsContainer');
    if (!container) return;

    // Collect all unique YYYY-MM entries from history data
    const monthKeySet = new Set();
    allHistoryCache.forEach(item => {
        if (item.date && item.date.length >= 7) {
            monthKeySet.add(item.date.substring(0, 7)); // e.g. "2026-08"
        }
    });

    // Also include the current month if not present
    const now = new Date();
    const currentYrMo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthKeySet.add(currentYrMo);

    // Convert to array and sort chronologically (Ascending)
    const sortedMonthKeys = Array.from(monthKeySet).sort();

    // Default active month to the latest/current month if not set
    if (!currentMonthFilter || !sortedMonthKeys.includes(currentMonthFilter)) {
        currentMonthFilter = sortedMonthKeys[sortedMonthKeys.length - 1] || 'ALL';
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    let html = `
        <button onclick="selectMonthTab('ALL', this)" class="month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors ${currentMonthFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
            All
        </button>
    `;

    sortedMonthKeys.forEach(yrMo => {
        const [year, monthNum] = yrMo.split('-');
        const monthIndex = parseInt(monthNum, 10) - 1;
        const monthLabel = monthNames[monthIndex] || yrMo;

        const isActive = currentMonthFilter === yrMo;
        const activeClass = isActive ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900';

        html += `
            <button onclick="selectMonthTab('${yrMo}', this)" class="month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeClass}">
                ${monthLabel}
            </button>
        `;
    });

    container.innerHTML = html;
}

// --- MONTH FILTER TAB SELECTION ---
function selectMonthTab(monthKey, element) {
    currentMonthFilter = monthKey;

    // Reset date picker filter when month pill is clicked
    const dateInput = document.getElementById('historyDateFilter');
    if (dateInput) dateInput.value = '';

    // Update button styling
    document.querySelectorAll('.month-tab').forEach(tab => {
        tab.className = 'month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors text-slate-600 hover:text-slate-900';
    });

    if (element) {
        element.className = 'month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors bg-indigo-600 text-white shadow-xs';
    }

    filterAndRenderHistory();
}

function renderTodayAttendance(history) {
    const dateEl = document.getElementById('todayDateText');
    const badgeEl = document.getElementById('todaySummaryBadge');
    const container = document.getElementById('todayHoursContainer');

    if (!container) return;

    const todayObj = new Date();
    // Local date formatted string (e.g. "2026-08-14")
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

// --- VIEW SWITCHER FUNCTIONALITY ---
function switchHistoryView(mode) {
    if (currentHistoryViewMode === mode) return;

    currentHistoryViewMode = mode;

    // Toggle button UI active styles
    const btnDetailed = document.getElementById('btnViewDetailed');
    const btnMatrix = document.getElementById('btnViewMatrix');

    if (mode === 'detailed') {
        btnDetailed?.classList.add('bg-white', 'text-slate-900', 'shadow-xs');
        btnDetailed?.classList.remove('text-slate-600');

        btnMatrix?.classList.remove('bg-white', 'text-slate-900', 'shadow-xs');
        btnMatrix?.classList.add('text-slate-600');
    } else {
        btnMatrix?.classList.add('bg-white', 'text-slate-900', 'shadow-xs');
        btnMatrix?.classList.remove('text-slate-600');

        btnDetailed?.classList.remove('bg-white', 'text-slate-900', 'shadow-xs');
        btnDetailed?.classList.add('text-slate-600');
    }

    const selectedDate = document.getElementById('historyDateFilter')?.value || '';
    filterAndRenderHistory(selectedDate);
}

function filterAndRenderHistory(selectedDate = '') {
    const tbody = document.getElementById('historyTableBody');
    const thead = document.getElementById('historyTableHead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '';

    let filtered = [...allHistoryCache];

    // Priority 1: Specific Date Filter selected in Date Picker
    if (selectedDate) {
        filtered = filtered.filter(item => item.date === selectedDate);
    }
    // Priority 2: Month Filter Tab selected
    else if (currentMonthFilter && currentMonthFilter !== 'ALL') {
        filtered = filtered.filter(item => item.date && item.date.startsWith(currentMonthFilter));
    }

    if (currentHistoryViewMode === 'detailed') {
        renderDetailedHistoryView(thead, tbody, filtered);
    } else {
        renderMatrixHistoryView(thead, tbody, filtered);
    }
}

function renderDetailedHistoryView(thead, tbody, filtered) {
    thead.innerHTML = `
        <tr>
            <th class="px-4 py-3">Subject Code</th>
            <th class="px-4 py-3">Subject Name</th>
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3">Hour</th>
            <th class="px-4 py-3">Status</th>
        </tr>
    `;

    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found.</td></tr>`;
        return;
    }

    // Sort: Date (Descending), Hour (Ascending)
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

function renderMatrixHistoryView(thead, tbody, filtered) {
    thead.innerHTML = `
        <tr>
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3 text-center">Hour 1</th>
            <th class="px-4 py-3 text-center">Hour 2</th>
            <th class="px-4 py-3 text-center">Hour 3</th>
            <th class="px-4 py-3 text-center">Hour 4</th>
            <th class="px-4 py-3 text-center">Hour 5</th>
        </tr>
    `;

    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found.</td></tr>`;
        return;
    }

    // Group items by date
    const dateGroupMap = {};
    filtered.forEach(item => {
        if (!dateGroupMap[item.date]) {
            dateGroupMap[item.date] = {};
        }
        const hourNum = parseInt(String(item.hour || '').replace(/\D/g, '') || 0, 10);
        if (hourNum >= 1 && hourNum <= 5) {
            dateGroupMap[item.date][hourNum] = item;
        }
    });

    const dates = Object.keys(dateGroupMap).sort((a, b) => new Date(b) - new Date(a));

    dates.forEach(dateStr => {
        const dayHours = dateGroupMap[dateStr];
        let hourCellsHtml = '';

        for (let h = 1; h <= 5; h++) {
            const record = dayHours[h];
            if (!record) {
                hourCellsHtml += `
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] text-slate-300 font-medium rounded border border-slate-100 bg-slate-50/50">-</span>
                    </td>
                `;
            } else {
                const status = String(record.status || '').toUpperCase();
                const isPresent = status === 'P' || status === 'PRESENT';

                if (isPresent) {
                    hourCellsHtml += `
                        <td class="px-4 py-3 text-center" title="${escapeHtml(record.subjectCode)} - ${escapeHtml(record.subjectName)}">
                            <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded">P</span>
                        </td>
                    `;
                } else {
                    hourCellsHtml += `
                        <td class="px-4 py-3 text-center" title="${escapeHtml(record.subjectCode)} - ${escapeHtml(record.subjectName)}">
                            <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 rounded">A</span>
                        </td>
                    `;
                }
            }
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs font-semibold text-slate-800">${escapeHtml(dateStr)}</td>
            ${hourCellsHtml}
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