document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const subjectCode = urlParams.get('code');

    if (!subjectCode) {
        alert('No subject specified.');
        window.location.href = 'student.html';
        return;
    }

    loadSubjectDetail(token, subjectCode);
});

async function loadSubjectDetail(token, targetCode) {
    try {
        const response = await fetch('/student/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const history = await response.json();

        // Filter history records matching target subject code (case-insensitive)
        const subjectRecords = (history || []).filter(item =>
            String(item.subjectCode || '').toUpperCase() === String(targetCode).toUpperCase()
        );

        if (subjectRecords.length === 0) {
            renderEmptyState(targetCode);
            return;
        }

        // Extract subject metadata
        const subjectName = subjectRecords[0]?.subjectName || targetCode;

        // Sort records descending by date then hour
        subjectRecords.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            const hourA = parseInt(String(a.hour || '').replace(/\D/g, '') || 0, 10);
            const hourB = parseInt(String(b.hour || '').replace(/\D/g, '') || 0, 10);
            return hourB - hourA;
        });

        // Compute Metrics
        const total = subjectRecords.length;
        const present = subjectRecords.filter(r => r.status === 'P' || r.status === 'PRESENT').length;
        const absent = total - present;
        const perc = total > 0 ? (present / total) * 100 : 0;
        const roundedPerc = Math.round(perc * 10) / 10;

        // Render Page Sections
        renderHeader(targetCode, subjectName);
        renderStats(total, present, absent, roundedPerc);
        renderSubjectBunkCalculator(present, total);
        renderSessionTable(subjectRecords);

    } catch (e) {
        console.error('Error fetching subject details:', e);
    }
}

function renderHeader(code, name) {
    const codeEl = document.getElementById('subjectCodeHeader');
    const nameEl = document.getElementById('subjectNameHeader');

    if (codeEl) codeEl.innerText = code;
    if (nameEl) nameEl.innerText = name;
}

function renderStats(total, present, absent, perc) {
    document.getElementById('totalClasses').innerText = total;
    document.getElementById('presentCount').innerText = present;
    document.getElementById('absentCount').innerText = absent;

    const percEl = document.getElementById('attendancePerc');
    if (percEl) {
        percEl.innerText = `${perc}%`;
        if (perc < 65) {
            percEl.className = 'text-2xl font-bold text-rose-600';
        } else if (perc < 75) {
            percEl.className = 'text-2xl font-bold text-amber-600';
        } else {
            percEl.className = 'text-2xl font-bold text-emerald-600';
        }
    }
}

function renderSubjectBunkCalculator(present, total) {
    const adviceEl = document.getElementById('calculatorAdvice');
    if (!adviceEl) return;

    if (total === 0) {
        adviceEl.innerHTML = `No classes recorded for this subject yet.`;
        return;
    }

    const currentPerc = (present / total) * 100;
    const target = 75;

    if (currentPerc >= target) {
        const skippable = Math.floor((present - (target / 100) * total) / (target / 100));
        adviceEl.className = "p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `
            You are in the <strong class="text-emerald-700 font-bold">Safe Zone (${currentPerc.toFixed(1)}%)</strong> for this course.
            You can skip up to <strong class="text-slate-900 font-bold">${Math.max(0, skippable)}</strong> upcoming class(es) without dropping below 75%.
        `;
    } else {
        const needed = Math.ceil(((target / 100) * total - present) / (1 - (target / 100)));
        adviceEl.className = "p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs font-medium text-slate-700 leading-relaxed";
        adviceEl.innerHTML = `
            You are below target at <strong class="text-amber-700 font-bold">${currentPerc.toFixed(1)}%</strong> for this course.
            You need to attend the next <strong class="text-indigo-600 font-bold">${needed}</strong> consecutive class(es) to reach 75% attendance.
        `;
    }
}

function renderSessionTable(records) {
    const tbody = document.getElementById('subjectHistoryTableBody');
    const badge = document.getElementById('sessionCountBadge');

    if (badge) badge.innerText = `${records.length} Sessions`;
    if (!tbody) return;

    tbody.innerHTML = '';

    records.forEach(item => {
        const isPresent = item.status === 'P' || item.status === 'PRESENT';
        const badgeClass = isPresent
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
            : 'bg-rose-50 text-rose-700 border-rose-200/80';

        // Extract day name from date string
        let dayName = '-';
        if (item.date) {
            const dateObj = new Date(item.date);
            if (!isNaN(dateObj.getTime())) {
                dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            }
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs font-semibold text-slate-800">${escapeHtml(item.date)}</td>
            <td class="px-4 py-3 text-slate-500 font-medium">${dayName}</td>
            <td class="px-4 py-3 text-center text-slate-700 font-semibold">${escapeHtml(String(item.hour))}</td>
            <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center justify-center w-7 h-6 text-[11px] font-bold rounded border ${badgeClass}">
                    ${isPresent ? 'P' : 'A'}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderEmptyState(code) {
    renderHeader(code, 'No Records Found');
    renderStats(0, 0, 0, 0);

    const adviceEl = document.getElementById('calculatorAdvice');
    if (adviceEl) adviceEl.innerHTML = `No attendance logs found matching code: <strong>${escapeHtml(code)}</strong>.`;

    const tbody = document.getElementById('subjectHistoryTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 italic">No session history available for this subject.</td></tr>`;
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