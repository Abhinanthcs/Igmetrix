document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

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
        document.getElementById('regNum').innerText = data.registerNumber || '-';
        document.getElementById('totalClasses').innerText = data.totalClasses || 0;
        document.getElementById('presentCount').innerText = data.presentCount || 0;
        document.getElementById('absentCount').innerText = data.absentCount || 0;
        document.getElementById('attendancePerc').innerText = `${data.attendancePercentage || 0}%`;
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
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';

        if (!history || history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">No attendance records found.</td></tr>`;
            return;
        }

        history.forEach(item => {
            const isPresent = item.status === 'P';
            const badgeClass = isPresent
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200';

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition-colors';
            row.innerHTML = `
                <td class="px-4 py-3">${item.id}</td>
                <td class="px-4 py-3 font-semibold text-slate-800">${item.subjectCode}</td>
                <td class="px-4 py-3">${item.subjectName}</td>
                <td class="px-4 py-3">${item.date}</td>
                <td class="px-4 py-3">${item.hour}</td>
                <td class="px-4 py-3">
                    <span class="inline-block px-2 py-0.5 text-xs font-semibold rounded border ${badgeClass}">
                        ${item.status}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (e) {
        console.error('Error fetching history:', e);
    }
}