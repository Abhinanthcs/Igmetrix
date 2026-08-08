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
        document.getElementById('attendancePerc').innerText = `${overallPerc}%`;

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

    } catch (e) {
        console.error('Error fetching history:', e);
    }
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
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3">${item.id}</td>
            <td class="px-4 py-3 font-semibold text-slate-800">${escapeHtml(item.subjectCode)}</td>
            <td class="px-4 py-3">${escapeHtml(item.subjectName)}</td>
            <td class="px-4 py-3">${escapeHtml(item.date)}</td>
            <td class="px-4 py-3">${escapeHtml(String(item.hour))}</td>
            <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 text-xs font-semibold rounded border ${badgeClass}">
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
        const isLow = perc < 75;
        const barColor = isLow ? 'bg-amber-500' : 'bg-emerald-500';
        const textColor = isLow ? 'text-amber-600' : 'text-emerald-600';

        return `
            <div class="p-3 border border-slate-100 rounded-lg bg-slate-50/50 space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-xs font-bold text-slate-800">${escapeHtml(code)}</p>
                        <p class="text-[11px] text-slate-500 font-medium">${escapeHtml(sub.name)}</p>
                    </div>
                    <span class="text-xs font-bold font-mono ${textColor}">${perc}%</span>
                </div>
                <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div class="${barColor} h-1.5 rounded-full transition-all duration-300" style="width: ${perc}%"></div>
                </div>
                <p class="text-[10px] text-slate-400 text-right">${sub.present} / ${sub.total} Classes Attended</p>
            </div>
        `;
    }).join('');
}

function renderBunkCalculator(present, total) {
    const adviceEl = document.getElementById('calculatorAdvice');
    if (!adviceEl) return;

    if (total === 0) {
        adviceEl.innerHTML = `No classes recorded yet to compute attendance target status.`;
        return;
    }

    const currentPerc = (present / total) * 100;
    const target = 75;

    if (currentPerc >= target) {
        // Calculate how many future classes can be skipped while staying >= 75%
        const skippable = Math.floor((present - (target / 100) * total) / (target / 100));
        adviceEl.innerHTML = `
            You are in the <strong class="text-emerald-600">Safe Zone (${currentPerc.toFixed(1)}%)</strong>.
            You can skip up to <strong class="text-slate-900">${Math.max(0, skippable)}</strong> upcoming class(es) without falling below the 75% requirement.
        `;
    } else {
        // Calculate how many consecutive classes must be attended to reach 75%
        const needed = Math.ceil(((target / 100) * total - present) / (1 - (target / 100)));
        adviceEl.innerHTML = `
            You are below target at <strong class="text-amber-600">${currentPerc.toFixed(1)}%</strong>.
            You need to attend the next <strong class="text-indigo-600">${needed}</strong> consecutive class(es) to reach 75% attendance.
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