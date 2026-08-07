// --- CONFIGURATION & TOKEN UTILITIES ---
const TOKEN_KEY = 'jwtToken';

// In-memory cache for client-side search & filtering
let allStudentsCache = [];
let assignedSubjectsCache = []; // Global cache for active semester mappings

/**
 * Utility to escape HTML and prevent XSS injections
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Standard fetch helper that auto-injects JWT Authorization headers
 * and safely handles empty or non-JSON server responses.
 */
async function apiFetch(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type': 'application/json' };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);

    if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('adminDepartment');
        window.location.href = '/login.html';
        throw new Error('Unauthorized session. Redirecting to login.');
    }

    // Read response text first to safely check for empty responses
    const text = await response.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(text || `Server error (${response.status})`);
        }
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initDeptBadge();
    initNavigation();
    initModalControls();
    initFilterListeners();
    initFormListeners();
    loadDashboardData();
});

function initDeptBadge() {
    const dept = localStorage.getItem('adminDepartment') || 'DEPT_ADMIN';
    const badge = document.getElementById('dept-badge');
    if (badge) badge.textContent = dept;
}

// Navigation Handling
function initNavigation() {
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const views = document.querySelectorAll('.admin-view');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            tabBtns.forEach(b => {
                b.classList.remove('bg-slate-800', 'text-white', 'font-bold');
                b.classList.add('text-slate-400', 'font-semibold');
            });

            btn.classList.add('bg-slate-800', 'text-white', 'font-bold');
            btn.classList.remove('text-slate-400', 'font-semibold');

            views.forEach(view => view.classList.add('hidden'));
            const activeView = document.getElementById(`view-${targetTab}`);
            if (activeView) {
                activeView.classList.remove('hidden');
            }

            if (targetTab === 'attendance-logs') {
                fetchAttendanceLogs();
            }
        });
    });
}

// Modal Toggle Logic
function initModalControls() {
    const modal = document.getElementById('crud-modal');
    const openBtn = document.getElementById('open-modal-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');

    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
}

// Search & Filter Listeners
function initFilterListeners() {
    document.getElementById('student-search')?.addEventListener('input', applyStudentFilters);
    document.getElementById('student-batch-filter')?.addEventListener('change', applyStudentFilters);

    // Active semester mapping filters
    document.getElementById('filter-assigned-batch')?.addEventListener('change', renderAssignedSubjectsTable);
    document.getElementById('filter-assigned-semester')?.addEventListener('change', renderAssignedSubjectsTable);
}

// Global Alerts
function showAlert(message, isError = false) {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;

    banner.textContent = message;
    banner.className = `mb-6 p-4 rounded-xl text-xs font-bold border transition-all duration-200 ${
        isError
            ? 'bg-red-500/10 border-red-500/20 text-red-600'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
    }`;
    banner.classList.remove('hidden');

    setTimeout(() => {
        banner.classList.add('hidden');
    }, 4000);
}

// Reusable Custom Confirmation Dialog Helper
function requestConfirmation({ title, message, onConfirm }) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const proceedBtn = document.getElementById('confirm-proceed-btn');

    if (!modal) return;

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');

    cancelBtn.onclick = closeModal;
    proceedBtn.onclick = async () => {
        closeModal();
        await onConfirm();
    };
}

// Initial Data Fetching
async function loadDashboardData() {
    await Promise.all([
        fetchStudents(),
        fetchBatches(),
        fetchTeachers(),
        fetchPendingLogs(),
        fetchSubjects(),
        fetchAssignedSubjects()
    ]);
}

// --- FORM & BUTTON HANDLERS ---
function initFormListeners() {
    // 1. Register Student Form
    document.getElementById('create-student-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            registerNumber: document.getElementById('modal-reg').value.trim(),
            name: document.getElementById('modal-name').value.trim(),
            batch: document.getElementById('modal-batch').value,
            dateOfBirth: document.getElementById('modal-dob').value,
            phoneNumber: document.getElementById('modal-phone').value.trim() || 'N/A'
        };

        try {
            const res = await apiFetch('/api/admin/create-student', 'POST', payload);
            showAlert(res.message || 'Student registered successfully.');
            document.getElementById('crud-modal')?.classList.add('hidden');
            e.target.reset();
            fetchStudents();
            fetchBatches();
        } catch (err) {
            showAlert(`Failed to register student: ${err.message}`, true);
        }
    });

    // 2. Batch Creation Form
    document.getElementById('create-batch-form')?.addEventListener('submit', handleCreateBatch);

    // 3. Teacher Creation Form
    document.getElementById('create-teacher-form')?.addEventListener('submit', handleCreateTeacher);

    // 4. Subject Creation Form
    document.getElementById('create-subject-form')?.addEventListener('submit', handleCreateSubject);

    // 5. Subject Semester Assignment Form
    document.getElementById('assign-subject-form')?.addEventListener('submit', handleAssignSubject);

    // 6. Rollover Button
    document.getElementById('rollover-btn')?.addEventListener('click', () => {
        requestConfirmation({
            title: 'Execute Semester Rollover?',
            message: 'This action will clear active attendance tracking logs across your department to initialize a fresh cycle.',
            onConfirm: async () => {
                try {
                    const res = await apiFetch('/api/admin/rollover-semester', 'POST');
                    showAlert(res.message || 'Semester rollover complete.');
                    fetchStudents();
                } catch (err) {
                    showAlert(`Rollover failed: ${err.message}`, true);
                }
            }
        });
    });

    // 7. Sign Out Button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('adminDepartment');
        window.location.href = '/login.html';
    });
}

// Handle Batch Creation
async function handleCreateBatch(event) {
    event.preventDefault();
    const startYearInput = document.getElementById('batch-start-year').value.trim();
    const endYearInput = document.getElementById('batch-end-year').value.trim();

    const startYear = parseInt(startYearInput, 10);
    const endYear = parseInt(endYearInput, 10);

    if (isNaN(startYear) || isNaN(endYear)) {
        showAlert('Please provide valid numeric values for Start Year and End Year.', true);
        return;
    }

    try {
        const res = await apiFetch('/api/admin/create-batch', 'POST', { startYear, endYear });
        showAlert(res.message || 'Batch created successfully.');
        document.getElementById('create-batch-form')?.reset();
        fetchBatches();
    } catch (err) {
        showAlert(`Failed to create batch: ${err.message}`, true);
    }
}

// Handle Teacher Creation
async function handleCreateTeacher(event) {
    event.preventDefault();
    const payload = {
        teacherId: document.getElementById('teacher-id').value.trim(),
        name: document.getElementById('teacher-name').value.trim(),
        dateOfBirth: document.getElementById('teacher-dob').value,
        phoneNumber: document.getElementById('teacher-phone').value.trim() || 'N/A'
    };

    try {
        const res = await apiFetch('/api/admin/create-teacher', 'POST', payload);
        showAlert(res.message || 'Teacher created successfully.');
        document.getElementById('create-teacher-form')?.reset();
        fetchTeachers();
    } catch (err) {
        showAlert(`Failed to create teacher: ${err.message}`, true);
    }
}

// Handle Subject Creation
async function handleCreateSubject(event) {
    event.preventDefault();
    const payload = {
        code: document.getElementById('subject-code').value.trim(),
        name: document.getElementById('subject-name').value.trim()
    };

    try {
        const res = await apiFetch('/api/admin/subjects', 'POST', payload);
        showAlert(res.message || 'Subject added to catalog.');
        document.getElementById('create-subject-form')?.reset();
        fetchSubjects();
    } catch (err) {
        showAlert(`Failed to create subject: ${err.message}`, true);
    }
}

// Handle Subject Assignment to Batch & Semester
async function handleAssignSubject(event) {
    event.preventDefault();
    const payload = {
        batch: document.getElementById('assign-batch-select').value,
        semester: parseInt(document.getElementById('assign-semester-select').value, 10),
        subjectCode: document.getElementById('assign-subject-select').value
    };

    try {
        const res = await apiFetch('/api/admin/batches/assign-subject', 'POST', payload);
        showAlert(res.message || 'Subject assigned to semester successfully.');
        document.getElementById('assign-subject-form')?.reset();
        fetchAssignedSubjects(); // Refresh mapping table immediately
    } catch (err) {
        showAlert(`Failed to assign subject: ${err.message}`, true);
    }
}

// --- API FETCH & RENDER HELPERS ---

async function fetchStudents() {
    try {
        const students = await apiFetch('/api/admin/students', 'GET');
        allStudentsCache = students || [];
        applyStudentFilters();
    } catch (err) {
        console.error('Error fetching students:', err);
    }
}

function applyStudentFilters() {
    const searchTerm = (document.getElementById('student-search')?.value || '').toLowerCase().trim();
    const selectedBatch = document.getElementById('student-batch-filter')?.value || 'ALL';

    const filtered = allStudentsCache.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm) ||
                              s.registerNumber.toLowerCase().includes(searchTerm);
        const matchesBatch = selectedBatch === 'ALL' || s.batch === selectedBatch;
        return matchesSearch && matchesBatch;
    });

    renderStudentTable(filtered);
}

function renderStudentTable(students) {
    const tbody = document.getElementById('student-table-body');
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 px-6 text-center text-slate-400 italic">No matching students found.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.registerNumber)}</td>
            <td class="py-3 px-6 font-medium text-slate-700">${escapeHtml(s.name)}</td>
            <td class="py-3 px-6 text-slate-500">${escapeHtml(s.department)} / ${escapeHtml(s.batch)}</td>
            <td class="py-3 px-6 font-mono font-bold text-slate-800">${s.attendancePercentage}%</td>
            <td class="py-3 px-6 text-right">
                <button onclick="confirmDeleteStudent('${escapeHtml(s.registerNumber)}')" class="text-red-500 hover:text-red-700 font-bold">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function fetchBatches() {
    try {
        const batches = await apiFetch('/api/admin/batches', 'GET');

        const tbody = document.getElementById('batch-table-body');
        if (tbody) {
            if (!batches || batches.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="py-4 px-6 text-center text-slate-400 italic">No batches created.</td></tr>`;
            } else {
                tbody.innerHTML = batches.map(b => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-6 font-mono font-bold text-slate-800 flex items-center gap-3">
                            <span>${escapeHtml(b.batch)}</span>
                            <button onclick="viewBatchRoster('${escapeHtml(b.batch)}')" title="View Students" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </button>
                        </td>
                        <td class="py-3 px-6 text-center font-mono font-bold text-slate-600">
                            <span class="px-2 py-1 bg-slate-100 rounded-md text-xs">${b.studentCount || 0}</span>
                        </td>
                        <td class="py-3 px-6 text-right">
                            <button onclick="confirmDeleteBatch('${escapeHtml(b.batch)}', ${b.studentCount || 0})" class="text-red-500 hover:text-red-700 font-bold">Delete</button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Populate dropdowns for Batch Filters and Modals/Forms
        const filterSelect = document.getElementById('student-batch-filter');
        const modalSelect = document.getElementById('modal-batch');
        const assignBatchSelect = document.getElementById('assign-batch-select');
        const filterAssignedBatchSelect = document.getElementById('filter-assigned-batch');
        const logFilterBatchSelect = document.getElementById('log-filter-batch');

        if (filterSelect) {
            const currentVal = filterSelect.value;
            filterSelect.innerHTML = '<option value="ALL">All Batches</option>' +
                batches.map(b => `<option value="${escapeHtml(b.batch)}">${escapeHtml(b.batch)}</option>`).join('');
            filterSelect.value = currentVal || 'ALL';
        }

        if (filterAssignedBatchSelect) {
            const currentVal = filterAssignedBatchSelect.value;
            filterAssignedBatchSelect.innerHTML = '<option value="ALL">All Batches</option>' +
                batches.map(b => `<option value="${escapeHtml(b.batch)}">${escapeHtml(b.batch)}</option>`).join('');
            filterAssignedBatchSelect.value = currentVal || 'ALL';
        }

        if (logFilterBatchSelect) {
            const currentVal = logFilterBatchSelect.value;
            logFilterBatchSelect.innerHTML = '<option value="ALL">All Batches</option>' +
                batches.map(b => `<option value="${escapeHtml(b.batch)}">${escapeHtml(b.batch)}</option>`).join('');
            logFilterBatchSelect.value = currentVal || 'ALL';
        }

        if (modalSelect) {
            modalSelect.innerHTML = '<option value="" disabled selected>Select Batch</option>' +
                batches.map(b => `<option value="${escapeHtml(b.batch)}">${escapeHtml(b.batch)}</option>`).join('');
        }

        if (assignBatchSelect) {
            assignBatchSelect.innerHTML = '<option value="" disabled selected>Select Batch</option>' +
                batches.map(b => `<option value="${escapeHtml(b.batch)}">${escapeHtml(b.batch)}</option>`).join('');
        }
    } catch (err) {
        console.error('Error fetching batches:', err);
    }
}

async function fetchSubjects() {
    try {
        const subjects = await apiFetch('/api/admin/subjects', 'GET');

        // 1. Populate Subject Catalog Table
        const tbody = document.getElementById('subject-table-body');
        if (tbody) {
            tbody.innerHTML = (subjects && subjects.length > 0)
                ? subjects.map(s => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.code)}</td>
                        <td class="py-3 px-6 text-slate-700">${escapeHtml(s.name)}</td>
                        <td class="py-3 px-6 text-right">
                            <span class="px-2 py-1 bg-green-500/10 text-green-600 rounded text-[10px] font-bold font-mono">ACTIVE</span>
                        </td>
                    </tr>
                `).join('')
                : `<tr><td colspan="3" class="py-4 text-center text-slate-400 italic">No subjects in catalog.</td></tr>`;
        }

        // 2. Populate 'Assign Subject' Dropdown
        const assignSelect = document.getElementById('assign-subject-select');
        if (assignSelect) {
            assignSelect.innerHTML = `<option value="" disabled selected>Select Subject</option>` +
                (subjects || []).map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} - ${escapeHtml(s.name)}</option>`).join('');
        }
    } catch (err) {
        console.error('Error fetching subjects:', err);
        showAlert(`Failed to load subject catalog: ${err.message}`, true);
    }
}

// --- ACTIVE SEMESTER MAPPINGS FUNCTIONS ---

async function fetchAssignedSubjects() {
    try {
        const assigned = await apiFetch('/api/admin/assigned-subjects', 'GET');
        assignedSubjectsCache = assigned || [];
        renderAssignedSubjectsTable();
    } catch (err) {
        console.error('Error fetching assigned subjects:', err);
    }
}

function renderAssignedSubjectsTable() {
    const tbody = document.getElementById('assigned-subjects-table-body');
    const selectedBatch = document.getElementById('filter-assigned-batch')?.value || 'ALL';
    const selectedSemester = document.getElementById('filter-assigned-semester')?.value || 'ALL';

    if (!tbody) return;

    const filtered = assignedSubjectsCache.filter(item => {
        const matchesBatch = selectedBatch === 'ALL' || String(item.batch) === String(selectedBatch);
        const matchesSem = selectedSemester === 'ALL' || String(item.semester) === String(selectedSemester);
        return matchesBatch && matchesSem;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 px-6 text-center text-slate-400 italic">No active subject mappings found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(item.batch)}</td>
            <td class="py-3 px-6 font-medium text-slate-700">Sem ${item.semester}</td>
            <td class="py-3 px-6 font-mono font-bold text-indigo-600">${escapeHtml(item.subjectCode)}</td>
            <td class="py-3 px-6 font-medium text-slate-800">${escapeHtml(item.subjectName)}</td>
            <td class="py-3 px-6 text-right">
                <button onclick="confirmUnlinkSubject('${item.id}')" class="text-red-500 hover:text-red-700 font-bold">Unlink</button>
            </td>
        </tr>
    `).join('');
}

function confirmUnlinkSubject(assignmentId) {
    requestConfirmation({
        title: 'Unlink Subject?',
        message: 'Are you sure you want to remove this subject mapping from the active semester cycle?',
        onConfirm: async () => {
            try {
                const res = await apiFetch(`/api/admin/assigned-subjects/${assignmentId}`, 'DELETE');
                showAlert(res.message || 'Subject unlinked successfully.');
                fetchAssignedSubjects();
            } catch (err) {
                showAlert(`Error unlinking subject: ${err.message}`, true);
            }
        }
    });
}

// Handler for fetching and opening batch roster modal
async function viewBatchRoster(batchName) {
    const modal = document.getElementById('roster-modal');
    const title = document.getElementById('roster-title');
    const tbody = document.getElementById('roster-table-body');
    const closeBtn = document.getElementById('close-roster-btn');

    if (!modal || !tbody) return;

    title.textContent = `Students in Batch ${batchName}`;
    tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400 italic">Loading students...</td></tr>`;
    modal.classList.remove('hidden');

    closeBtn.onclick = () => modal.classList.add('hidden');

    try {
        const students = await apiFetch(`/api/admin/batch-students?batch=${encodeURIComponent(batchName)}`, 'GET');

        if (!students || students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400 italic">No students registered in this batch.</td></tr>`;
            return;
        }

        tbody.innerHTML = students.map(s => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2.5 font-mono font-bold text-slate-800">${escapeHtml(s.registerNumber)}</td>
                <td class="px-4 py-2.5 font-medium text-slate-700">${escapeHtml(s.name)}</td>
                <td class="px-4 py-2.5 text-slate-500">${escapeHtml(s.phoneNumber || 'N/A')}</td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-red-500">Failed to load students: ${err.message}</td></tr>`;
    }
}

async function fetchTeachers() {
    try {
        const teachers = await apiFetch('/api/admin/teachers', 'GET');
        const tbody = document.getElementById('teacher-table-body');
        if (!tbody) return;

        if (!teachers || teachers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-4 px-6 text-center text-slate-400 italic">No teachers found.</td></tr>`;
            return;
        }

        tbody.innerHTML = teachers.map(t => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(t.teacherId)}</td>
                <td class="py-3 px-6 font-medium text-slate-700">${escapeHtml(t.name)}</td>
                <td class="py-3 px-6 text-slate-500">${escapeHtml(t.dateOfBirth)}</td>
                <td class="py-3 px-6 text-slate-500">${escapeHtml(t.phoneNumber || 'N/A')}</td>
                <td class="py-3 px-6 text-right">
                    <button onclick="confirmDeleteTeacher('${escapeHtml(t.teacherId)}')" class="text-red-500 hover:text-red-700 font-bold">Remove</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error fetching teachers:', err);
    }
}

async function fetchPendingLogs() {
    try {
        const logs = await apiFetch('/api/admin/pending', 'GET');
        const container = document.getElementById('corrections-container');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic">No pending logs requiring approval.</p>`;
            return;
        }

        container.innerHTML = logs.map(l => `
            <div class="p-4 bg-white border border-slate-200 rounded-xl flex justify-between items-center text-xs shadow-sm">
                <div>
                    <span class="font-bold text-slate-800">${escapeHtml(l.subjectName)} (${escapeHtml(l.subjectCode)})</span> - Hour ${l.hour}
                    <span class="font-mono text-slate-600">(${escapeHtml(l.date)})</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="approvePendingLog(${l.id})" class="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all">Approve</button>
                    <button onclick="confirmRejectPendingLog(${l.id})" class="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-all">Reject</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error fetching pending logs:', err);
    }
}

async function approvePendingLog(id) {
    try {
        const res = await apiFetch('/api/admin/approve-log', 'POST', { id });
        showAlert(res.message || 'Log approved successfully.');
        fetchPendingLogs();
    } catch (err) {
        showAlert(`Approval failed: ${err.message}`, true);
    }
}

function confirmRejectPendingLog(id) {
    requestConfirmation({
        title: 'Reject Attendance Log?',
        message: 'Are you sure you want to reject and clear this unauthenticated log entry?',
        onConfirm: async () => {
            try {
                const res = await apiFetch('/api/admin/reject-log', 'POST', { id });
                showAlert(res.message || 'Log rejected.');
                fetchPendingLogs();
            } catch (err) {
                showAlert(`Rejection failed: ${err.message}`, true);
            }
        }
    });
}

function confirmDeleteStudent(registerNumber) {
    requestConfirmation({
        title: 'Remove Student?',
        message: `Are you sure you want to delete student account ${registerNumber}? This cannot be undone.`,
        onConfirm: async () => {
            try {
                const res = await apiFetch('/api/admin/delete-student', 'POST', { registerNumber });
                showAlert(res.message || 'Student removed.');
                fetchStudents();
                fetchBatches();
            } catch (err) {
                showAlert(`Error removing student: ${err.message}`, true);
            }
        }
    });
}

function confirmDeleteBatch(batchName, studentCount) {
    requestConfirmation({
        title: `Delete Batch ${batchName}?`,
        message: `This will permanently remove batch ${batchName} along with all ${studentCount} registered student profiles and attendance records.`,
        onConfirm: async () => {
            try {
                const res = await apiFetch('/api/admin/delete-batch', 'POST', { batch: batchName });
                showAlert(res.message || 'Batch removed.');
                fetchBatches();
                fetchStudents();
            } catch (err) {
                showAlert(`Error removing batch: ${err.message}`, true);
            }
        }
    });
}

function confirmDeleteTeacher(teacherId) {
    requestConfirmation({
        title: 'Remove Faculty Account?',
        message: `Are you sure you want to delete teacher account ${teacherId}?`,
        onConfirm: async () => {
            try {
                const res = await apiFetch('/api/admin/delete-teacher', 'POST', { teacherId });
                showAlert(res.message || 'Teacher account removed.');
                fetchTeachers();
            } catch (err) {
                showAlert(`Error removing teacher account: ${err.message}`, true);
            }
        }
    });
}

// --- ATTENDANCE LOGS AUDIT & EDIT FUNCTIONS ---

async function fetchAttendanceLogs() {
    const date = document.getElementById('log-filter-date')?.value || '';
    const batch = document.getElementById('log-filter-batch')?.value || 'ALL';
    const subject = document.getElementById('log-filter-subject')?.value.trim() || '';
    const hour = document.getElementById('log-filter-hour')?.value || 'ALL';
    const status = document.getElementById('log-filter-status')?.value || 'ALL';

    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (batch !== 'ALL') params.append('batch', batch);
    if (subject) params.append('subjectCode', subject);
    if (hour !== 'ALL') params.append('hour', hour);
    if (status !== 'ALL') params.append('status', status);

    const tbody = document.getElementById('attendance-logs-table-body');
    if (!tbody) return;

    try {
        const logs = await apiFetch(`/api/admin/attendance-logs?${params.toString()}`, 'GET');

        // Update Stat Cards
        const total = logs.length;
        const present = logs.filter(l => l.status === 'P').length;
        const absent = logs.filter(l => l.status === 'A').length;
        const rate = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

        document.getElementById('stat-total-logs').textContent = total;
        document.getElementById('stat-present-logs').textContent = present;
        document.getElementById('stat-absent-logs').textContent = absent;
        document.getElementById('stat-rate-logs').textContent = `${rate}%`;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400 italic">No logs found matching selected criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-mono font-bold text-slate-800">${escapeHtml(l.registerNumber)}</td>
                <td class="py-3 px-4 font-medium text-slate-700">${escapeHtml(l.subjectCode)}</td>
                <td class="py-3 px-4 text-center font-bold font-mono text-slate-600">${l.hour}</td>
                <td class="py-3 px-4 text-center font-mono text-slate-500">${escapeHtml(l.date)}</td>
                <td class="py-3 px-4 text-center">
                    <span class="px-2.5 py-1 rounded text-[10px] font-bold font-mono ${
                        l.status === 'P'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                    }">
                        ${l.status === 'P' ? 'PRESENT' : 'ABSENT'}
                    </span>
                </td>
                <td class="py-3 px-4 text-right">
                    <button onclick="updateAttendanceStatus(${l.id}, '${l.status === 'P' ? 'A' : 'P'}')" class="px-2.5 py-1 rounded font-bold text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all">
                        Mark ${l.status === 'P' ? 'Absent' : 'Present'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error fetching attendance logs:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-500 font-medium">Failed to load logs: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function updateAttendanceStatus(logId, newStatus) {
    try {
        const res = await apiFetch('/api/admin/attendance-logs/update', 'PATCH', { id: logId, status: newStatus });
        showAlert(res.message || 'Attendance status updated.');
        fetchAttendanceLogs();
    } catch (err) {
        showAlert(`Failed to update status: ${err.message}`, true);
    }
}