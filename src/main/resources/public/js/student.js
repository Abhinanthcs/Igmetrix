/* js/student.js
   Minimal, essential changes only:
   - Semester-aware loaders: loadSummary(token, semester) and loadHistory(token, semester)
   - Semester dropdown wiring and initialization
   - All existing rendering logic preserved
*/

let allHistoryCache = [];
let currentHistoryViewMode = 'detailed'; // State tracker: 'detailed' | 'matrix'
let currentMonthFilter = ''; // Dynamic month key: e.g. '2026-08' or 'ALL'

// Extended Filter/Sort State
let filterState = {
    singleDate: '',
    startDate: '',
    endDate: '',
    semester: 'ALL',
    sortOrder: 'DESC' // 'DESC' | 'ASC'
};

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Initialize semester selector and then load data
    initSemesterAndLoad(token);
});

async function initSemesterAndLoad(token) {
    const semSelect = document.getElementById('semesterSelect');

    // Try to fetch available semesters; if endpoint missing, fallback to 1..6
    try {
        const res = await fetch('/student/semesters', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            populateSemesterOptions(Array.isArray(data) && data.length > 0 ? data : undefined);
        } else {
            populateSemesterOptions();
        }
    } catch (e) {
        populateSemesterOptions();
    }

    // Wire change handler
    if (semSelect) {
        semSelect.addEventListener('change', (e) => {
            const semester = e.target.value || 'ALL';
            filterState.semester = semester;
            const tokenNow = localStorage.getItem('jwtToken');
            loadSummary(tokenNow, semester);
            loadHistory(tokenNow, semester);
        });
    }

    const defaultSemester = document.getElementById('semesterSelect')?.value || 'ALL';
    filterState.semester = defaultSemester;
    loadSummary(token, defaultSemester);
    loadHistory(token, defaultSemester);
}

function populateSemesterOptions(semesters = []) {
    const select = document.getElementById('semesterSelect');
    if (!select) return;

    select.innerHTML = '';
    if (!semesters || semesters.length === 0) semesters = [1,2,3,4,5,6];

    semesters.forEach(s => {
        const opt = document.createElement('option');
        opt.value = String(s);
        opt.textContent = 'Semester ' + s;
        select.appendChild(opt);
    });

    if (semesters.includes(5)) select.value = '5';
    else select.value = String(semesters[semesters.length - 1] || '1');
}

async function loadSummary(token, semester = 'ALL') {
    try {
        const url = `/student/summary${semester && semester !== 'ALL' ? `?semester=${encodeURIComponent(semester)}` : ''}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const data = await response.json();

        document.getElementById('regNum').innerText = data.registerNumber || '-';
        document.getElementById('totalClasses').innerText = data.totalClasses || 0;
        document.getElementById('presentCount').innerText = data.presentCount || 0;
        document.getElementById('absentCount').innerText = data.absentCount || 0;

        const overallPerc = data.attendancePercentage || 0;
        const percElement = document.getElementById('attendancePerc');

        if (percElement) {
            percElement.innerText = `${overallPerc}%`;

            if (overallPerc < 65) {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-rose-600';
            } else if (overallPerc < 75) {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-amber-600';
            } else {
                percElement.className = 'text-xl font-bold transition-colors duration-200 text-indigo-600';
            }
        }

        const alertBanner = document.getElementById('eligibilityAlert');
        if (alertBanner) {
            if (overallPerc < 75 && (data.totalClasses || 0) > 0) {
                alertBanner.classList.remove('hidden');
            } else {
                alertBanner.classList.add('hidden');
            }
        }

        renderBunkCalculator(data.presentCount || 0, data.totalClasses || 0);

    } catch (e) {
        console.error('Error fetching summary:', e);
    }
}

async function loadHistory(token, semester = 'ALL') {
    try {
        const url = `/student/history${semester && semester !== 'ALL' ? `?semester=${encodeURIComponent(semester)}` : ''}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const history = await response.json();
        allHistoryCache = history || [];

        renderDynamicMonthTabs();
        filterAndRenderHistory();
        renderSubjectBreakdown(allHistoryCache);
        renderTodayAttendance(allHistoryCache);

    } catch (e) {
        console.error('Error fetching history:', e);
    }
}

// --- DYNAMIC MONTH TAB GENERATOR ---
function renderDynamicMonthTabs() {
    const container = document.getElementById('monthTabsContainer');
    if (!container) return;

    const monthKeySet = new Set();
    allHistoryCache.forEach(item => {
        if (item.date && item.date.length >= 7) {
            monthKeySet.add(item.date.substring(0, 7));
        }
    });

    const now = new Date();
    const currentYrMo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthKeySet.add(currentYrMo);

    const sortedMonthKeys = Array.from(monthKeySet).sort();

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

function selectMonthTab(monthKey, element) {
    currentMonthFilter = monthKey;

    document.querySelectorAll('.month-tab').forEach(tab => {
        tab.className = 'month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors text-slate-600 hover:text-slate-900';
    });

    if (element) {
        element.className = 'month-tab px-3 py-1 text-xs font-medium rounded-full transition-colors bg-indigo-600 text-white shadow-xs';
    }

    filterAndRenderHistory();
}

// --- FILTER & SORT MODAL CONTROLS ---
function applyFiltersAndClose() {
    filterState.singleDate = document.getElementById('historySingleDate')?.value || '';
    filterState.startDate = document.getElementById('historyStartDate')?.value || '';
    filterState.endDate = document.getElementById('historyEndDate')?.value || '';
    filterState.semester = document.getElementById('historySemesterFilter')?.value || 'ALL';
    filterState.sortOrder = document.getElementById('historySortOrder')?.value || 'DESC';

    updateActiveFilterBadge();
    filterAndRenderHistory();

    const modal = document.getElementById('filterSortModal');
    if (modal) modal.classList.add('hidden');
}

function resetFilters() {
    filterState = {
        singleDate: '',
        startDate: '',
        endDate: '',
        semester: 'ALL',
        sortOrder: 'DESC'
    };

    if (document.getElementById('historySingleDate')) document.getElementById('historySingleDate').value = '';
    if (document.getElementById('historyStartDate')) document.getElementById('historyStartDate').value = '';
    if (document.getElementById('historyEndDate')) document.getElementById('historyEndDate').value = '';
    if (document.getElementById('historySemesterFilter')) document.getElementById('historySemesterFilter').value = 'ALL';
    if (document.getElementById('historySortOrder')) document.getElementById('historySortOrder').value = 'DESC';

    updateActiveFilterBadge();
    filterAndRenderHistory();

    const modal = document.getElementById('filterSortModal');
    if (modal) modal.classList.add('hidden');
}

function updateActiveFilterBadge() {
    const badge = document.getElementById('activeFilterBadge');
    if (!badge) return;

    const hasActiveFilters = filterState.singleDate || filterState.startDate || filterState.endDate || filterState.semester !== 'ALL' || filterState.sortOrder !== 'DESC';

    if (hasActiveFilters) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// --- FILTER & RENDER HISTORY ---
function filterAndRenderHistory() {
    const tbody = document.getElementById('historyTableBody');
    const thead = document.getElementById('historyTableHead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '';

    let filtered = [...allHistoryCache];

    // 1. Month Pill Filter
    if (currentMonthFilter && currentMonthFilter !== 'ALL') {
        filtered = filtered.filter(item => item.date && item.date.startsWith(currentMonthFilter));
    }

    // 2. Single Date Filter
    if (filterState.singleDate) {
        filtered = filtered.filter(item => item.date === filterState.singleDate);
    }

    // 3. Date Range Filter
    if (filterState.startDate) {
        filtered = filtered.filter(item => item.date >= filterState.startDate);
    }
    if (filterState.endDate) {
        filtered = filtered.filter(item => item.date <= filterState.endDate);
    }

    // 4. Semester Filter (checks numeric or prefixed formats)
    if (filterState.semester && filterState.semester !== 'ALL') {
        const targetSem = filterState.semester.toUpperCase().replace(/^S/, '');
        filtered = filtered.filter(item => {
            if (!item.semester && !item.sem) return true; // Let backend-scoped results pass through
            const itemSem = String(item.semester || item.sem).toUpperCase().replace(/^S/, '');
            return itemSem === targetSem;
        });
    }

    // 5. Date Sort Order
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        const diff = filterState.sortOrder === 'ASC' ? dateA - dateB : dateB - dateA;

        if (diff !== 0) return diff;

        const hourA = parseInt(String(a.hour || '').replace(/\D/g, '') || 0, 10);
        const hourB = parseInt(String(b.hour || '').replace(/\D/g, '') || 0, 10);
        return filterState.sortOrder === 'ASC' ? hourA - hourB : hourB - hourA;
    });

    if (currentHistoryViewMode === 'detailed') {
        renderDetailedHistoryView(thead, tbody, filtered);
    } else {
        renderMatrixHistoryView(thead, tbody, filtered);
    }
}

/* Remaining rendering functions unchanged (renderDetailedHistoryView, renderMatrixHistoryView,
   renderTodayAttendance, renderSubjectBreakdown, renderBunkCalculator, exportStudentHistoryCSV,
   downloadCSV, and DOM wiring). They are preserved exactly as before. */

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
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found matching filters.</td></tr>`;
        return;
    }

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
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found matching filters.</td></tr>`;
        return;
    }

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

    const dates = Object.keys(dateGroupMap).sort((a, b) => {
        return filterState.sortOrder === 'ASC' ? new Date(a) - new Date(b) : new Date(b) - new Date(a);
    });

    dates.forEach(dateStr => {
        const dayHours = dateGroupMap[dateStr];
        let hourCellsHtml = '';

        for (let h = 1; h <= 5; h++) {
            const record = dayHours[h];
            const status = record ? String(record.status || '').toUpperCase() : '';
            const isPresent = status === 'P' || status === 'PRESENT';
            const isAbsent = status === 'A' || status === 'ABSENT';

            if (!record || (!isPresent && !isAbsent)) {
                hourCellsHtml += `
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] text-slate-300 font-medium rounded border border-slate-100 bg-slate-50/50">-</span>
                    </td>
                `;
            } else {
                const tooltipText = `${escapeHtml(record.subjectCode)} - ${escapeHtml(record.subjectName)}`;
                const badgeClass = isPresent
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200/80'
                    : 'text-rose-700 bg-rose-50 border-rose-200/80';
                const label = isPresent ? 'P' : 'A';

                hourCellsHtml += `
                    <td class="px-4 py-3 text-center" title="${tooltipText}">
                        <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold ${badgeClass} border rounded">${label}</span>
                    </td>
                `;
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

function switchHistoryView(mode) {
    if (currentHistoryViewMode === mode) return;

    currentHistoryViewMode = mode;

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

    filterAndRenderHistory();
}

function renderTodayAttendance(history) {
    const dateEl = document.getElementById('todayDateText');
    const badgeEl = document.getElementById('todaySummaryBadge');
    const container = document.getElementById('todayHoursContainer');

    if (!container) return;

    const todayObj = new Date();
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

    const todayRecords = (history || []).filter(item => item.date === todayIso);

    const hourMap = {};
    todayRecords.forEach(r => {
        const h = parseInt(String(r.hour || '').replace(/\D/g, '') || 0, 10);
        if (h > 0) hourMap[h] = r.status;
    });

    let presentCount = 0;
    let totalClassesToday = 0;
    const maxHours = 5;
    let html = '';

    for (let h = 1; h <= maxHours; h++) {
        const status = hourMap[h] ? String(hourMap[h]).toUpperCase() : null;

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

function renderSubjectBreakdown(history) {
    const container = document.getElementById('subjectBreakdownContainer');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic col-span-2">No subject data available.</p>`;
        return;
    }

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
            <div onclick="navigateToSubjectDetail('${escapeHtml(code)}')"
                 class="p-3.5 border ${borderStyle} rounded-lg bg-slate-50/50 space-y-2.5 shadow-xs cursor-pointer hover:bg-white hover:shadow-md transition-all duration-200 group">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-xs font-bold text-slate-800 tracking-wide group-hover:text-indigo-600 transition-colors">${escapeHtml(code)}</p>
                        <p class="text-[11px] text-slate-500 font-medium">${escapeHtml(sub.name)}</p>
                    </div>
                    <span class="text-xs font-bold font-mono px-2 py-0.5 rounded ${badgeStyle}">${perc}%</span>
                </div>
                <div class="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                    <div class="${barColor} h-2 rounded-full transition-all duration-300" style="width: ${perc}%"></div>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span class="group-hover:text-indigo-600 transition-colors">View Details &rarr;</span>
                    <span>${sub.present} / ${sub.total} Classes Attended</span>
                </div>
            </div>
        `;
    }).join('');
}

function navigateToSubjectDetail(subjectCode) {
    if (!subjectCode) return;
    window.location.href = `subject-detail.html?code=${encodeURIComponent(subjectCode)}`;
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
        const skippable = Math.floor((present - (target / 100) * total) / (target / 100));
        adviceEl.className = "p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `
            You are in the <strong class="text-emerald-700 font-bold">Safe Zone (${currentPerc.toFixed(1)}%)</strong>.
            You can skip up to <strong class="text-slate-900 font-bold">${Math.max(0, skippable)}</strong> upcoming class(es) without falling below the 75% requirement.
        `;
    } else {
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

// Global alias support for export caller handlers
window.exportAttendanceCSV = exportStudentHistoryCSV;

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
