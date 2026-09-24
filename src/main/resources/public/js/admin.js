// --- CONFIGURATION & TOKEN UTILITIES ---
const TOKEN_KEY = 'jwtToken';

// In-memory cache for client-side search & filtering
let allStudentsCache = [];
let assignedSubjectsCache = [];
let currentAttendanceLogs = [];
let globalGroupsCache = [];
let activeDetailRegNum = null;

window.currentAttendanceLogs = window.currentAttendanceLogs || [];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Loading state helper for form submit buttons
function setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        btn.innerHTML = `
            <span class="inline-flex items-center justify-center gap-2">
                <svg class="animate-spin h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>${loadingText}</span>
            </span>
        `;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}

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
    initTimetable();
});

function initDeptBadge() {
    const dept = localStorage.getItem('adminDepartment') || 'DEPT_ADMIN';
    const badge = document.getElementById('dept-badge');
    if (badge) badge.textContent = dept;
}

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
                populateSubjectFilter().then(() => fetchAttendanceLogs());
            }

            if (targetTab === 'subjects' || targetTab === 'subject-manager') {
                if (typeof window.fetchWeeklyMatrix === "function") {
                    window.fetchWeeklyMatrix();
                }
            }
        });
    });

    const defaultTabBtn = document.querySelector('.admin-tab-btn[data-tab="attendance-logs"]');
    if (defaultTabBtn) {
        defaultTabBtn.click();
    }
}

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

function initFilterListeners() {
    document.getElementById('student-search')?.addEventListener('input', applyStudentFilters);
    document.getElementById('student-batch-filter')?.addEventListener('change', applyStudentFilters);

    document.getElementById('filter-assigned-batch')?.addEventListener('change', renderAssignedSubjectsTable);
    document.getElementById('filter-assigned-semester')?.addEventListener('change', renderAssignedSubjectsTable);

    document.getElementById('student-semester-filter')?.addEventListener('change', async () => {
        await fetchStudents();
    });

    document.getElementById('log-filter-date')?.addEventListener('change', fetchAttendanceLogs);

    document.getElementById('log-filter-batch')?.addEventListener('change', async () => {
        await populateSubjectFilter();
        fetchAttendanceLogs();
    });

    document.getElementById('log-filter-semester')?.addEventListener('change', async () => {
        await populateSubjectFilter();
        fetchAttendanceLogs();
    });

    document.getElementById('log-filter-subject')?.addEventListener('change', fetchAttendanceLogs);
    document.getElementById('log-filter-hour')?.addEventListener('change', fetchAttendanceLogs);
    document.getElementById('log-filter-status')?.addEventListener('change', fetchAttendanceLogs);

    document.getElementById('overview-tt-batch-select')?.addEventListener('change', fetchWeeklyMatrix);
    document.getElementById('overview-tt-semester-select')?.addEventListener('change', fetchWeeklyMatrix);
}

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

function requestConfirmation({ title, message, onConfirm }) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const proceedBtn = document.getElementById('confirm-proceed-btn');

    if (!modal) return;

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');

    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (proceedBtn) {
        proceedBtn.onclick = async () => {
            closeModal();
            await onConfirm();
        };
    }
}

async function loadDashboardData() {
    await Promise.all([
        fetchStudents(),
        fetchBatches(),
        fetchTeachers(),
        fetchPendingLogs(),
        fetchSubjects(),
        fetchAssignedSubjects()
    ]);
    await populateSubjectFilter();
}

function initFormListeners() {
    document.getElementById('create-student-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true, 'Registering...');

        const payload = {
            registerNumber: document.getElementById('modal-reg')?.value.trim(),
            name: document.getElementById('modal-name')?.value.trim(),
            batch: document.getElementById('modal-batch')?.value,
            gender: document.getElementById('modal-gender')?.value,
            kreapPrn: document.getElementById('modal-kreap-prn')?.value.trim() || 'N/A',
            applicationNumber: document.getElementById('modal-app-no')?.value.trim() || 'N/A',
            dateOfBirth: document.getElementById('modal-dob')?.value,
            phoneNumber: document.getElementById('modal-phone')?.value.trim() || 'N/A'
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
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });

    document.getElementById('create-batch-form')?.addEventListener('submit', handleCreateBatch);
    document.getElementById('create-teacher-form')?.addEventListener('submit', handleCreateTeacher);
    document.getElementById('create-subject-form')?.addEventListener('submit', handleCreateSubject);
    document.getElementById('assign-subject-form')?.addEventListener('submit', handleAssignSubject);

    document.getElementById('rollover-btn')?.addEventListener('click', () => {
        requestConfirmation({
            title: 'Execute Semester Rollover?',
            message: 'This action will clear active attendance tracking logs across your department to initialize a fresh cycle.',
            onConfirm: async () => {
                const rolloverBtn = document.getElementById('rollover-btn');
                setButtonLoading(rolloverBtn, true, 'Executing...');
                try {
                    const res = await apiFetch('/api/admin/rollover-semester', 'POST');
                    showAlert(res.message || 'Semester rollover complete.');
                    fetchStudents();
                } catch (err) {
                    showAlert(`Rollover failed: ${err.message}`, true);
                } finally {
                    setButtonLoading(rolloverBtn, false);
                }
            }
        });
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('adminDepartment');
        window.location.href = '/login.html';
    });
}

// --- STUDENT DIRECTORY WITH CLICKABLE DETAILS ---
async function fetchStudents() {
    try {
        const batchVal = document.getElementById('student-batch-filter')?.value || 'ALL';
        const semVal = document.getElementById('student-semester-filter')?.value || 'ALL';

        const queryParams = new URLSearchParams();
        if (batchVal !== 'ALL') queryParams.append('batch', batchVal);
        if (semVal !== 'ALL') queryParams.append('semester', semVal);

        const students = await apiFetch(`/api/admin/students?${queryParams.toString()}`, 'GET');
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
        <tr class="hover:bg-slate-50 transition-colors cursor-pointer">
            <td onclick="openStudentDetailModal('${escapeHtml(s.registerNumber)}')" class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.registerNumber)}</td>
            <td onclick="openStudentDetailModal('${escapeHtml(s.registerNumber)}')" class="py-3 px-6 font-bold text-indigo-600 hover:underline">${escapeHtml(s.name)}</td>
            <td onclick="openStudentDetailModal('${escapeHtml(s.registerNumber)}')" class="py-3 px-6 text-slate-500">${escapeHtml(s.department)} / ${escapeHtml(s.batch)}</td>
            <td onclick="openStudentDetailModal('${escapeHtml(s.registerNumber)}')" class="py-3 px-6 font-mono font-bold text-slate-800">${s.attendancePercentage}%</td>
            <td class="py-3 px-6 text-right">
                <button onclick="confirmDeleteStudent('${escapeHtml(s.registerNumber)}')" class="text-red-500 hover:text-red-700 font-bold">Delete</button>
            </td>
        </tr>
    `).join('');
}

// --- INDIVIDUAL STUDENT PROFILE & SEMESTER BREAKDOWN MODAL LOGIC ---
async function openStudentDetailModal(regNumber) {
    activeDetailRegNum = regNumber;
    const modal = document.getElementById('student-detail-modal');
    if (modal) modal.classList.remove('hidden');
    cancelEditMode();
    await fetchStudentDetailWithSem();
}

function closeStudentDetailModal() {
    const modal = document.getElementById('student-detail-modal');
    if (modal) modal.classList.add('hidden');
    activeDetailRegNum = null;
}

async function fetchStudentDetailWithSem() {
    if (!activeDetailRegNum) return;

    const selectedSem = document.getElementById('detail-semester-select')?.value || '5';
    try {
        const student = await apiFetch(`/api/admin/students/${encodeURIComponent(activeDetailRegNum)}/details?semester=${selectedSem}`, 'GET');

        document.getElementById('detail-student-name').textContent = student.name;
        document.getElementById('detail-reg-sub').textContent = `${student.registerNumber} • ${student.department} (${student.batch})`;

        document.getElementById('detail-input-name').value = student.name;
        document.getElementById('detail-input-gender').value = student.gender || 'Male';
        document.getElementById('detail-input-dob').value = student.dateOfBirth;
        document.getElementById('detail-input-kreap').value = student.kreapPrn;
        document.getElementById('detail-input-appno').value = student.applicationNumber;
        document.getElementById('detail-input-phone').value = student.phoneNumber;

        document.getElementById('detail-total-classes').textContent = student.totalClasses;
        document.getElementById('detail-present-classes').textContent = student.presentCount;
        document.getElementById('detail-absent-classes').textContent = student.absentCount;
        document.getElementById('detail-perc').textContent = `${student.attendancePercentage}%`;

        const tbody = document.getElementById('detail-subject-table-body');
        if (tbody) {
            if (!student.subjectBreakdown || student.subjectBreakdown.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-400 italic">No subjects mapped for Semester ${selectedSem}.</td></tr>`;
            } else {
                tbody.innerHTML = student.subjectBreakdown.map(sub => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2.5 px-4 font-mono font-bold text-slate-800">${escapeHtml(sub.subjectCode)}</td>
                        <td class="py-2.5 px-4 font-medium text-slate-800">${escapeHtml(sub.subjectName)}</td>
                        <td class="py-2.5 px-4 text-center font-mono font-bold text-slate-900">${sub.attendedClasses} / ${sub.totalClasses}</td>
                        <td class="py-2.5 px-4 text-right font-mono font-bold ${sub.percentage >= 75 ? 'text-emerald-600' : 'text-rose-600'}">${sub.percentage}%</td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        showAlert(`Failed to fetch student profile: ${err.message}`, true);
    }
}

function toggleEditMode() {
    const inputs = ['detail-input-name', 'detail-input-gender', 'detail-input-dob', 'detail-input-kreap', 'detail-input-appno', 'detail-input-phone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
    document.getElementById('save-edit-actions')?.classList.remove('hidden');
    document.getElementById('toggle-edit-btn')?.classList.add('hidden');
}

function cancelEditMode() {
    const inputs = ['detail-input-name', 'detail-input-gender', 'detail-input-dob', 'detail-input-kreap', 'detail-input-appno', 'detail-input-phone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
    document.getElementById('save-edit-actions')?.classList.add('hidden');
    document.getElementById('toggle-edit-btn')?.classList.remove('hidden');
}

document.getElementById('edit-student-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeDetailRegNum) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, 'Saving...');

    const payload = {
        registerNumber: activeDetailRegNum,
        name: document.getElementById('detail-input-name')?.value.trim(),
        gender: document.getElementById('detail-input-gender')?.value,
        dateOfBirth: document.getElementById('detail-input-dob')?.value,
        kreapPrn: document.getElementById('detail-input-kreap')?.value.trim(),
        applicationNumber: document.getElementById('detail-input-appno')?.value.trim(),
        phoneNumber: document.getElementById('detail-input-phone')?.value.trim(),
        batch: document.getElementById('detail-reg-sub')?.textContent.split('(')[1]?.replace(')', '') || ''
    };

    try {
        const res = await apiFetch('/api/admin/students/update', 'PUT', payload);
        showAlert(res.message || 'Student details updated successfully.');
        cancelEditMode();
        fetchStudentDetailWithSem();
        fetchStudents();
    } catch (err) {
        showAlert(`Failed to update student: ${err.message}`, true);
    } finally {
        setButtonLoading(submitBtn, false);
    }
});

// --- REMAINING MANAGEMENT MODULE HANDLERS ---
async function handleCreateBatch(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const startYearInput = document.getElementById('batch-start-year')?.value.trim() || '';
    const endYearInput = document.getElementById('batch-end-year')?.value.trim() || '';

    const startYear = parseInt(startYearInput, 10);
    const endYear = parseInt(endYearInput, 10);

    if (isNaN(startYear) || isNaN(endYear)) {
        showAlert('Please provide valid numeric values for Start Year and End Year.', true);
        return;
    }

    setButtonLoading(submitBtn, true, 'Adding...');

    try {
        const res = await apiFetch('/api/admin/create-batch', 'POST', { startYear, endYear });
        showAlert(res.message || 'Batch created successfully.');
        document.getElementById('create-batch-form')?.reset();
        fetchBatches();
    } catch (err) {
        showAlert(`Failed to create batch: ${err.message}`, true);
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

async function handleCreateTeacher(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const idInput = document.getElementById('teacher-id')?.value.trim() || '';
    const nameInput = document.getElementById('teacher-name')?.value.trim() || '';
    let dobInput = document.getElementById('teacher-dob')?.value || '';
    const passwordInput = document.getElementById('teacher-password')?.value || '';
    const phoneInput = document.getElementById('teacher-phone')?.value.trim() || 'N/A';

    if (dobInput.includes('-')) {
        const parts = dobInput.split('-');
        if (parts[0].length === 4) {
            dobInput = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    const payload = {
        teacherId: idInput,
        name: nameInput,
        dateOfBirth: dobInput,
        password: passwordInput,
        phoneNumber: phoneInput
    };

    setButtonLoading(submitBtn, true, 'Adding...');

    try {
        const res = await apiFetch('/api/admin/create-teacher', 'POST', payload);
        showAlert(res.message || 'Teacher created successfully.');
        document.getElementById('create-teacher-form')?.reset();
        fetchTeachers();
    } catch (err) {
        showAlert(`Failed to create teacher: ${err.message}`, true);
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

async function handleCreateSubject(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const typeVal = document.getElementById('subject-type')?.value || 'LOCAL';
    const groupCodeVal = document.getElementById('subject-group-code')?.value.trim().toUpperCase();

    const payload = {
        code: document.getElementById('subject-code')?.value.trim(),
        name: document.getElementById('subject-name')?.value.trim(),
        subjectType: typeVal,
        groupCode: typeVal === 'GLOBAL' ? groupCodeVal : null
    };

    setButtonLoading(submitBtn, true, 'Adding...');

    try {
        const res = await apiFetch('/api/admin/subjects', 'POST', payload);
        showAlert(res.message || 'Subject added to catalog.');
        document.getElementById('create-subject-form')?.reset();
        if (typeof toggleGroupCodeInput === 'function') toggleGroupCodeInput();
        await fetchSubjects();
        await populateSubjectFilter();
    } catch (err) {
        showAlert(`Failed to create subject: ${err.message}`, true);
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

async function handleAssignSubject(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const batch = document.getElementById('assign-batch-select')?.value;
    const semester = parseInt(document.getElementById('assign-semester-select')?.value, 10);
    const selectedValue = document.getElementById('assign-subject-select')?.value;

    if (!selectedValue) return;

    setButtonLoading(submitBtn, true, 'Linking...');

    try {
        let res;
        if (selectedValue.startsWith("GROUP:")) {
            const groupCode = selectedValue.replace("GROUP:", "");
            res = await apiFetch('/api/admin/batches/assign-global-group', 'POST', { batch, semester, groupCode });
        } else {
            res = await apiFetch('/api/admin/batches/assign-subject', 'POST', { batch, semester, subjectCode: selectedValue });
        }
        showAlert(res.message || 'Subject linked to semester successfully.');
        document.getElementById('assign-subject-form')?.reset();
        await fetchAssignedSubjects();
        await populateSubjectFilter();
    } catch (err) {
        showAlert(`Failed to assign subject: ${err.message}`, true);
    } finally {
        setButtonLoading(submitBtn, false);
    }
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

        populateBatchDropdowns(batches || []);
    } catch (err) {
        console.error('Error fetching batches:', err);
    }
}

async function fetchSubjects() {
    try {
        const adminDept = localStorage.getItem('adminDepartment') || 'DEPT_ADMIN';
        const [subjects, assignedSubjects, globalGroups] = await Promise.all([
            apiFetch('/api/admin/subjects', 'GET').catch(() => []),
            apiFetch('/api/admin/assigned-subjects', 'GET').catch(() => []),
            apiFetch('/api/admin/global-groups', 'GET').catch(() => [])
        ]);

        window.assignedSubjectsCache = assignedSubjects;
        globalGroupsCache = globalGroups || [];
        const linkedCodes = new Set((assignedSubjects || []).map(a => a.subjectCode));

        const localTbody = document.getElementById('local-subject-table-body');
        const globalTbody = document.getElementById('global-subject-table-body');

        const localSubjects = (subjects || []).filter(s => s.subjectType !== 'GLOBAL');
        const globalSubjects = (subjects || []).filter(s => s.subjectType === 'GLOBAL');

        if (localTbody) {
            localTbody.innerHTML = (localSubjects.length > 0)
                ? localSubjects.map(s => {
                    const isLinked = linkedCodes.has(s.code);
                    return `
                        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                            <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.code)}</td>
                            <td class="py-3 px-6 text-slate-700 font-medium">${escapeHtml(s.name)}</td>
                            <td class="py-3 px-6">
                                <span class="px-2 py-1 bg-green-500/10 text-green-600 rounded text-[10px] font-bold font-mono">ACTIVE</span>
                            </td>
                            <td class="py-3 px-6 text-right">
                                ${isLinked ? `
                                    <span class="text-slate-400 text-xs italic font-semibold cursor-not-allowed">Linked</span>
                                ` : `
                                    <button onclick="deleteSubject('${escapeHtml(s.code)}')" class="text-red-600 hover:text-red-800 font-bold text-xs transition-colors">
                                        Delete
                                    </button>
                                `}
                            </td>
                        </tr>
                    `;
                }).join('')
                : `<tr><td colspan="4" class="py-4 text-center text-slate-400 italic">No local core subjects in catalog.</td></tr>`;
        }

        if (globalTbody) {
            globalTbody.innerHTML = (globalSubjects.length > 0)
                ? globalSubjects.map(s => {
                    const isLinked = linkedCodes.has(s.code);
                    const isOwnedByCurrentDept = s.department === adminDept;

                    return `
                        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                            <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.code)}</td>
                            <td class="py-3 px-6 text-slate-700 font-medium">${escapeHtml(s.name)}</td>
                            <td class="py-3 px-6 font-mono">
                                ${s.groupCode ? `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-xs">${escapeHtml(s.groupCode)}</span>` : '-'}
                            </td>
                            <td class="py-3 px-6 font-mono text-slate-600">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isOwnedByCurrentDept ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}">
                                    ${escapeHtml(s.department || adminDept)}
                                </span>
                            </td>
                            <td class="py-3 px-6">
                                <span class="px-2 py-1 bg-green-500/10 text-green-600 rounded text-[10px] font-bold font-mono">ACTIVE</span>
                            </td>
                            <td class="py-3 px-6 text-right">
                                ${!isOwnedByCurrentDept ? `
                                    <span class="text-slate-400 text-xs italic font-semibold cursor-not-allowed">Read-Only</span>
                                ` : isLinked ? `
                                    <span class="text-slate-400 text-xs italic font-semibold cursor-not-allowed">Linked</span>
                                ` : `
                                    <button onclick="deleteSubject('${escapeHtml(s.code)}')" class="text-red-600 hover:text-red-800 font-bold text-xs transition-colors">
                                        Delete
                                    </button>
                                `}
                            </td>
                        </tr>
                    `;
                }).join('')
                : `<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">No global subjects registered.</td></tr>`;
        }

        const poolGroupSelect = document.getElementById('elective-pool-group');
        if (poolGroupSelect) {
            poolGroupSelect.innerHTML = `<option value="">Select Group Code</option>` +
                globalGroups.map(g => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupCode)}</option>`).join('');
        }

        const assignSelect = document.getElementById('assign-subject-select');
        if (assignSelect) {
            let options = `<option value="" disabled selected>Select Subject / Group</option>`;

            if (globalGroups && globalGroups.length > 0) {
                options += `<optgroup label="AUTO GLOBAL GROUPS">`;
                globalGroups.forEach(g => {
                    options += `<option value="GROUP:${escapeHtml(g.groupCode)}">[GROUP] ${escapeHtml(g.groupCode)}</option>`;
                });
                options += `</optgroup>`;
            }

            options += `<optgroup label="INDIVIDUAL SUBJECTS">`;
            (subjects || []).forEach(s => {
                const deptInfo = (s.subjectType === 'GLOBAL' && s.department !== adminDept) ? ` (${s.department})` : '';
                options += `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} - ${escapeHtml(s.name)}${escapeHtml(deptInfo)}</option>`;
            });
            options += `</optgroup>`;

            assignSelect.innerHTML = options;
        }
    } catch (err) {
        console.error('Error fetching subjects:', err);
    }
}

async function deleteSubject(subjectCode) {
    if (!confirm(`Are you sure you want to remove subject "${subjectCode}" from the catalog?`)) {
        return;
    }

    try {
        const res = await apiFetch(`/api/admin/subjects/${encodeURIComponent(subjectCode)}`, 'DELETE');
        showAlert(res?.message || "Subject removed successfully!");
        await fetchSubjects();
    } catch (error) {
        showAlert(error.message || "Failed to delete subject.", true);
    }
}

async function fetchMasterElectivePool() {
    const batch = document.getElementById('elective-pool-batch')?.value;
    const semester = document.getElementById('elective-pool-semester')?.value;
    const groupCode = document.getElementById('elective-pool-group')?.value;
    const tbody = document.getElementById('elective-pool-table-body');
    const theadRow = document.getElementById('elective-pool-thead-row');

    if (!tbody || !theadRow) return;

    if (!batch || !semester || !groupCode) {
        tbody.innerHTML = `<tr><td colspan="100%" class="py-6 text-center text-slate-400 italic">Select batch, semester, and group code above to manage student electives...</td></tr>`;
        return;
    }

    try {
        const currentGroup = globalGroupsCache.find(g => g.groupCode === groupCode);
        const groupSubjects = currentGroup ? currentGroup.subjects : [];

        if (groupSubjects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="100%" class="py-6 text-center text-slate-400 italic">No global subjects found registered under group code ${escapeHtml(groupCode)}.</td></tr>`;
            return;
        }

        const subjectMap = new Map();
        groupSubjects.forEach(s => subjectMap.set(s.code, s.name));

        const studentData = await apiFetch(`/api/admin/students/electives?batch=${encodeURIComponent(batch)}&semester=${semester}&groupCode=${encodeURIComponent(groupCode)}`, 'GET');

        theadRow.innerHTML = `
            <th class="py-3 px-6">Reg Number</th>
            <th class="py-3 px-6">Student Name</th>
            <th class="py-3 px-6 text-center">Assigned Choice</th>
            <th class="py-3 px-6 text-right">Elective Options (+ / -)</th>
        `;

        if (!studentData || studentData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="100%" class="py-6 text-center text-slate-400 italic">No registered students in batch ${escapeHtml(batch)}.</td></tr>`;
            return;
        }

        tbody.innerHTML = studentData.map(s => {
            const assignedCode = s.assignedSubjectCode;
            const assignedName = assignedCode ? (subjectMap.get(assignedCode) || assignedCode) : null;

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(s.registerNumber)}</td>
                    <td class="py-3 px-6 font-medium text-slate-700">${escapeHtml(s.name)}</td>
                    <td class="py-3 px-6 text-center font-mono font-bold">
                        ${assignedCode
                ? `<span class="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs" title="${escapeHtml(assignedCode)}">${escapeHtml(assignedName)}</span>`
                : `<span class="text-slate-400 font-normal italic font-sans">Unassigned</span>`}
                    </td>
                    <td class="py-3 px-6 text-right">
                        <div class="flex justify-end gap-1.5 flex-wrap">
                            ${groupSubjects.map(subj => {
                const isSelected = s.assignedSubjectCode === subj.code;
                return `
                                    <button onclick="toggleStudentElectiveChoice('${escapeHtml(s.registerNumber)}', '${escapeHtml(batch)}', ${semester}, '${escapeHtml(groupCode)}', '${escapeHtml(subj.code)}', '${isSelected ? 'REMOVE' : 'ADD'}')"
                                            class="px-2.5 py-1 rounded font-sans text-xs font-bold transition-all shadow-sm flex items-center gap-1 ${
                    isSelected
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                }">
                                        <span>${escapeHtml(subj.name)}</span>
                                        <span class="font-extrabold text-sm">${isSelected ? '-' : '+'}</span>
                                    </button>
                                `;
            }).join('')}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="100%" class="py-4 text-center text-red-500 text-xs">Failed to load student elective allocation matrix.</td></tr>`;
    }
}

async function toggleStudentElectiveChoice(regNo, batch, semester, groupCode, subjectCode, action) {
    try {
        await apiFetch('/api/admin/students/toggle-elective', 'POST', {
            registerNumber: regNo,
            batch: batch,
            semester: semester,
            groupCode: groupCode,
            subjectCode: subjectCode,
            action: action
        });
        await fetchMasterElectivePool();
    } catch (err) {
        showAlert(`Failed to update student elective choice: ${err.message}`, true);
    }
}

async function populateSubjectFilter() {
    const subjectSelect = document.getElementById('log-filter-subject');
    if (!subjectSelect) return;

    const selectedBatch = document.getElementById('log-filter-batch')?.value || 'ALL';
    const selectedSemester = document.getElementById('log-filter-semester')?.value || 'ALL';
    const previousValue = subjectSelect.value;

    try {
        let subjects = [];

        if (selectedBatch !== 'ALL' || selectedSemester !== 'ALL') {
            const cache = window.assignedSubjectsCache || [];
            const filteredMappings = cache.filter(item => {
                const matchBatch = selectedBatch === 'ALL' || String(item.batch) === String(selectedBatch);
                const matchSem = selectedSemester === 'ALL' || String(item.semester) === String(selectedSemester);
                return matchBatch && matchSem;
            });

            if (filteredMappings.length > 0) {
                subjects = filteredMappings.map(item => ({
                    code: item.subjectCode,
                    name: item.subjectName
                }));
            }
        }

        if (subjects.length === 0) {
            const catalog = await apiFetch('/api/admin/subjects', 'GET');
            subjects = catalog || [];
        }

        const uniqueSubjects = Array.from(
            new Map(subjects.map(s => [s.code || s.subjectCode, s])).values()
        );

        subjectSelect.innerHTML = '<option value="ALL">All Subjects</option>' +
            uniqueSubjects.map(s => {
                const code = s.code || s.subjectCode;
                const name = s.name || s.subjectName || code;
                return `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(name)}</option>`;
            }).join('');

        if (previousValue && Array.from(subjectSelect.options).some(opt => opt.value === previousValue)) {
            subjectSelect.value = previousValue;
        } else {
            subjectSelect.value = 'ALL';
        }
    } catch (err) {
        console.error('Failed to populate subject filter:', err);
    }
}

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
    const adminDept = localStorage.getItem('adminDepartment') || 'DEPT_ADMIN';

    if (!tbody) return;

    const filtered = assignedSubjectsCache.filter(item => {
        const matchesBatch = selectedBatch === 'ALL' || String(item.batch) === String(selectedBatch);
        const matchesSem = selectedSemester === 'ALL' || String(item.semester) === String(selectedSemester);
        return matchesBatch && matchesSem;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-4 px-6 text-center text-slate-400 italic">No active subject mappings found.</td></tr>`;
        return;
    }

    const localItems = filtered.filter(item => !item.groupCode);
    const globalGroupsMap = new Map();

    filtered.filter(item => item.groupCode).forEach(item => {
        const key = `${item.batch}_${item.semester}_${item.groupCode}`;
        if (!globalGroupsMap.has(key)) {
            globalGroupsMap.set(key, {
                batch: item.batch,
                semester: item.semester,
                groupCode: item.groupCode,
                subjects: []
            });
        }
        globalGroupsMap.get(key).subjects.push(item);
    });

    let html = '';

    localItems.forEach(item => {
        const isGlobal = item.subjectType === 'GLOBAL';
        const isExternal = isGlobal && item.department && item.department !== adminDept;

        let typeBadge = '';
        if (isGlobal) {
            typeBadge = isExternal
                ? `<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold font-mono">GLOBAL (${escapeHtml(item.department)})</span>`
                : `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold font-mono">GLOBAL</span>`;
        } else {
            typeBadge = `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold font-mono">LOCAL</span>`;
        }

        html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(item.batch)}</td>
                <td class="py-3 px-6 font-medium text-slate-700">Sem ${item.semester}</td>
                <td class="py-3 px-6 font-mono font-bold text-indigo-600">${escapeHtml(item.subjectCode)}</td>
                <td class="py-3 px-6 font-medium text-slate-800">${escapeHtml(item.subjectName)}</td>
                <td class="py-3 px-6">${typeBadge}</td>
                <td class="py-3 px-6 text-right">
                    <button onclick="confirmUnlinkSubject('${item.id}')" class="text-red-500 hover:text-red-700 font-bold">Unlink</button>
                </td>
            </tr>
        `;
    });

    globalGroupsMap.forEach((group) => {
        const subjectListDisplay = group.subjects.map(s => {
            const extLabel = (s.department && s.department !== adminDept) ? ` (${s.department})` : '';
            return `
                <span class="inline-block bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[11px] mr-1 mb-1 text-slate-700">
                    ${escapeHtml(s.subjectCode)} - ${escapeHtml(s.subjectName)}${escapeHtml(extLabel)}
                </span>
            `;
        }).join('');

        html += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(group.batch)}</td>
                <td class="py-3 px-6 font-medium text-slate-700">Sem ${group.semester}</td>
                <td class="py-3 px-6 font-mono font-bold text-emerald-600">${escapeHtml(group.groupCode)}</td>
                <td class="py-3 px-6 font-medium text-slate-800">
                    <div class="flex flex-wrap gap-1 mt-1">${subjectListDisplay}</div>
                </td>
                <td class="py-3 px-6">
                    <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold font-mono">GLOBAL GROUP</span>
                </td>
                <td class="py-3 px-6 text-right">
                    <button onclick="confirmUnlinkGroup('${escapeHtml(group.batch)}', ${group.semester}, '${escapeHtml(group.groupCode)}')" class="text-red-500 hover:text-red-700 font-bold">Unlink Group</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function confirmUnlinkSubject(assignmentId) {
    requestConfirmation({
        title: 'Unlink Subject?',
        message: 'Are you sure you want to remove this subject mapping from the active semester cycle?',
        onConfirm: async () => {
            try {
                const res = await apiFetch(`/api/admin/assigned-subjects/${assignmentId}`, 'DELETE');
                showAlert(res.message || 'Subject unlinked successfully.');
                await fetchAssignedSubjects();
                await populateSubjectFilter();
            } catch (err) {
                showAlert(`Error unlinking subject: ${err.message}`, true);
            }
        }
    });
}

function confirmUnlinkGroup(batch, semester, groupCode) {
    requestConfirmation({
        title: 'Unlink Global Subject Group?',
        message: `Are you sure you want to remove all subjects under group code "${groupCode}" from Batch ${batch} Semester ${semester}?`,
        onConfirm: async () => {
            try {
                const res = await apiFetch('/api/admin/assigned-groups/delete', 'POST', { batch, semester, groupCode });
                showAlert(res.message || 'Group unlinked successfully.');
                await fetchAssignedSubjects();
                await populateSubjectFilter();
            } catch (err) {
                showAlert(`Error unlinking group: ${err.message}`, true);
            }
        }
    });
}

async function viewBatchRoster(batchName) {
    const modal = document.getElementById('roster-modal');
    const title = document.getElementById('roster-title');
    const tbody = document.getElementById('roster-table-body');
    const closeBtn = document.getElementById('close-roster-btn');

    if (!modal || !tbody) return;

    if (title) title.textContent = `Students in Batch ${batchName}`;
    tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400 italic">Loading students...</td></tr>`;
    modal.classList.remove('hidden');

    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

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
            tbody.innerHTML = `<tr><td colspan="6" class="py-4 px-6 text-center text-slate-400 italic">No teachers found.</td></tr>`;
            return;
        }

        tbody.innerHTML = teachers.map((t, index) => {
            const pwd = t.password || 'N/A';
            const maskedPwd = pwd !== 'N/A' ? '•'.repeat(pwd.length) : 'N/A';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-6 font-mono font-bold text-slate-800">${escapeHtml(t.teacherId)}</td>
                    <td class="py-3 px-6 font-medium text-slate-700">${escapeHtml(t.name)}</td>
                    <td class="py-3 px-6 text-slate-500">${escapeHtml(t.dateOfBirth)}</td>
                    <td class="py-3 px-6 text-slate-500">${escapeHtml(t.phoneNumber || 'N/A')}</td>
                    <td class="py-3 px-6">
                        <div class="flex items-center gap-2">
                            <span id="teacher-pwd-${index}" class="font-mono text-xs text-slate-600" data-raw-pwd="${escapeHtml(pwd)}" data-masked-pwd="${escapeHtml(maskedPwd)}">${escapeHtml(maskedPwd)}</span>
                            <button type="button" onclick="toggleTeacherPasswordVisibility(${index})" class="p-1 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </button>
                        </div>
                    </td>
                    <td class="py-3 px-6 text-right">
                        <button onclick="confirmDeleteTeacher('${escapeHtml(t.teacherId)}')" class="text-red-500 hover:text-red-700 font-bold">Remove</button>
                    </td>
                </tr>
            `;
        }).join('');
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
                showAlert(res.message || 'Teacher removed.');
                fetchTeachers();
            } catch (err) {
                showAlert(`Error removing teacher: ${err.message}`, true);
            }
        }
    });
}

// --- ATTENDANCE LOGS & PIVOT MATRIX ---
async function fetchAttendanceLogs() {
    const dateModeEl = document.getElementById('log-date-mode');
    const dateMode = dateModeEl ? dateModeEl.value : 'ALL';

    const dateVal = document.getElementById('log-filter-date')?.value;
    const startDateVal = document.getElementById('log-filter-start-date')?.value;
    const endDateVal = document.getElementById('log-filter-end-date')?.value;

    const batchVal = document.getElementById('log-filter-batch')?.value;
    const semVal = document.getElementById('log-filter-semester')?.value;
    const subjectVal = document.getElementById('log-filter-subject')?.value;
    const hourVal = document.getElementById('log-filter-hour')?.value;
    const statusVal = document.getElementById('log-filter-status')?.value;

    const queryParams = new URLSearchParams();

    if (dateMode === 'SPECIFIC' && dateVal) {
        queryParams.append('date', dateVal);
    } else if (dateMode === 'RANGE') {
        if (startDateVal) queryParams.append('startDate', startDateVal);
        if (endDateVal) queryParams.append('endDate', endDateVal);
    }

    if (batchVal && batchVal !== 'ALL') queryParams.append('batch', batchVal);
    if (semVal && semVal !== 'ALL') queryParams.append('semester', semVal);
    if (subjectVal && subjectVal !== 'ALL') queryParams.append('subjectCode', subjectVal);
    if (hourVal && hourVal !== 'ALL') queryParams.append('hour', hourVal);
    if (statusVal && statusVal !== 'ALL') queryParams.append('status', statusVal);

    try {
        const logs = await apiFetch(`/api/admin/attendance-logs?${queryParams.toString()}`, 'GET');
        window.currentAttendanceLogs = logs || [];

        const tbody = document.getElementById('attendance-logs-table-body');
        if (!tbody) return;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="100%" class="py-4 px-6 text-center text-slate-400 italic">No attendance records found matching filters.</td></tr>`;
            return;
        }

        renderPivotAttendanceTable(logs);
    } catch (err) {
        console.error('Error fetching attendance logs:', err);
    }
}

function renderPivotAttendanceTable(logs) {
    const tbody = document.getElementById('attendance-logs-table-body');
    const thead = document.getElementById('attendance-logs-table-head');
    if (!tbody) return;

    if (!Array.isArray(logs) || logs.length === 0) {
        if (thead) thead.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="100%" class="py-4 px-6 text-center text-slate-400 italic">No attendance records found matching filters.</td></tr>`;
        return;
    }

    const studentsMap = new Map();
    const sessionsMap = new Map();

    logs.forEach(log => {
        const reg = log.registerNumber || log.regNumber || log.studentId || 'N/A';
        const name = log.name || log.studentName || 'N/A';
        const date = log.date || 'N/A';
        const hour = log.hour ?? 1;
        const subj = log.subjectCode || 'SUBJ';

        const sessionKey = `${date}_H${hour}_${subj}`;
        const headerLabel = `(H${hour}/${subj})<br/><span class="text-[10px] font-normal text-slate-400">${date}</span>`;

        if (!studentsMap.has(reg)) {
            studentsMap.set(reg, { reg, name, attendance: {} });
        }
        if (!sessionsMap.has(sessionKey)) {
            sessionsMap.set(sessionKey, { header: headerLabel, rawDate: date, rawHour: hour });
        }

        const rawStatus = String(log.status).toUpperCase();
        let formattedStatus = 'A';
        if (rawStatus === 'PRESENT' || rawStatus === 'P') {
            formattedStatus = 'P';
        } else if (rawStatus === 'LATE' || rawStatus === 'L') {
            formattedStatus = 'L';
        }

        studentsMap.get(reg).attendance[sessionKey] = {
            logId: log.id,
            status: formattedStatus
        };
    });

    const sortedSessions = Array.from(sessionsMap.entries()).sort((a, b) => {
        const dateComp = new Date(a[1].rawDate) - new Date(b[1].rawDate);
        if (dateComp !== 0) return dateComp;
        return parseInt(a[1].rawHour, 10) - parseInt(b[1].rawHour, 10);
    });

    const sortedStudents = Array.from(studentsMap.values()).sort((a, b) => a.reg.localeCompare(b.reg));

    if (thead) {
        thead.innerHTML = `
            <tr class="bg-slate-50 border-b border-slate-200 uppercase font-mono font-bold text-slate-600 text-xs">
                <th class="py-3 px-4 text-left">REGISTER NO</th>
                <th class="py-3 px-4 text-left">STUDENT NAME</th>
                ${sortedSessions.map(([_, session]) => `<th class="py-3 px-4 text-center min-w-[110px] whitespace-nowrap">${session.header}</th>`).join('')}
            </tr>
        `;
    }

    tbody.innerHTML = sortedStudents.map(student => `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs font-medium">
            <td class="py-3 px-4 font-mono font-bold text-slate-800">${escapeHtml(student.reg)}</td>
            <td class="py-3 px-4 text-slate-700 font-semibold uppercase">${escapeHtml(student.name)}</td>
            ${sortedSessions.map(([key, _]) => {
                const record = student.attendance[key];
                if (!record) {
                    return `<td class="py-3 px-4 text-center font-mono text-slate-300">-</td>`;
                }

                const current = record.status;
                let nextStatus = 'PRESENT';
                let btnStyle = 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20';

                if (current === 'P') {
                    nextStatus = 'ABSENT';
                    btnStyle = 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20';
                } else if (current === 'A') {
                    nextStatus = 'LATE';
                    btnStyle = 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border border-rose-500/20';
                } else if (current === 'L') {
                    nextStatus = 'PRESENT';
                    btnStyle = 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20';
                }

                return `
                    <td class="py-3 px-4 text-center font-mono font-bold">
                        <button onclick="toggleAttendanceStatus('${record.logId}', '${nextStatus}')"
                                class="w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center ${btnStyle}">
                            ${current}
                        </button>
                    </td>
                `;
            }).join('')}
        </tr>
    `).join('');
}

async function toggleAttendanceStatus(id, newStatus) {
    try {
        await apiFetch(`/api/admin/attendance/${id}`, 'PUT', { id: String(id), status: newStatus });
        showAlert('Attendance status updated.');
        await fetchAttendanceLogs();
    } catch (err) {
        try {
            await apiFetch('/api/admin/update-attendance', 'POST', { id: String(id), status: newStatus });
            showAlert('Attendance status updated.');
            await fetchAttendanceLogs();
        } catch (fallbackErr) {
            showAlert(`Failed to update status: ${fallbackErr.message}`, true);
        }
    }
}

function exportAdminLogsCSV() {
    const logs = window.currentAttendanceLogs;
    if (!logs || logs.length === 0) {
        alert("No attendance logs available to export.");
        return;
    }

    const studentsMap = new Map();
    const sessionsMap = new Map();

    logs.forEach(log => {
        const reg = log.regNumber || log.registerNumber || log.studentId || 'N/A';
        const name = log.studentName || log.name || 'N/A';
        const date = log.date || 'N/A';
        const hour = log.hour || 1;
        const subj = log.subjectCode || 'SUBJ';

        const sessionKey = `${date}_H${hour}_${subj}`;
        const csvHeaderLabel = `(H${hour}/${subj}) ${date}`;

        if (!studentsMap.has(reg)) {
            studentsMap.set(reg, { reg, name, attendance: {} });
        }
        if (!sessionsMap.has(sessionKey)) {
            sessionsMap.set(sessionKey, { label: csvHeaderLabel, rawDate: date, rawHour: hour });
        }

        const isPresent = log.status === 'PRESENT' || log.status === 'P';
        studentsMap.get(reg).attendance[sessionKey] = isPresent ? 'P' : 'A';
    });

    const sortedSessions = Array.from(sessionsMap.entries()).sort((a, b) => {
        const dateComp = new Date(a[1].rawDate) - new Date(b[1].rawDate);
        if (dateComp !== 0) return dateComp;
        return parseInt(a[1].rawHour, 10) - parseInt(b[1].rawHour, 10);
    });

    const sortedStudents = Array.from(studentsMap.values()).sort((a, b) => a.reg.localeCompare(b.reg));

    let csvContent = `Register No,Student Name,` + sortedSessions.map(([_, s]) => `"${s.label}"`).join(',') + `\n`;

    sortedStudents.forEach(student => {
        const row = [
            `"${student.reg}"`,
            `"${student.name}"`,
            ...sortedSessions.map(([key, _]) => `"${student.attendance[key] || '-'}"`)
        ];
        csvContent += row.join(',') + `\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_Matrix_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- TIMETABLE MODULE ---
function getMappedSubjectsForSelectedBatchAndSem() {
    const batchSelect = document.getElementById("tt-batch-select") || document.getElementById("batchSelect");
    const semesterSelect = document.getElementById("tt-semester-select") || document.getElementById("semesterSelect");

    const batch = batchSelect?.value;
    const semester = semesterSelect?.value;

    if (!batch || !semester || batch === "Select Batch") {
        return [];
    }

    const cache = window.assignedSubjectsCache || [];
    return cache.filter(item => {
        const itemSem = String(item.semester).replace(/[^0-9]/g, '');
        const selSem = String(semester).replace(/[^0-9]/g, '');
        return String(item.batch) === String(batch) && itemSem === selSem;
    });
}

function renderTimetableSlots() {
    const tbody = document.getElementById("timetable-slots-body");
    if (!tbody) return;

    const subjects = getMappedSubjectsForSelectedBatchAndSem();

    let optionsHtml = '<option value="">-- SELECT SUBJECT --</option>';

    if (subjects.length > 0) {
        const localSubjects = subjects.filter(s => !s.groupCode);
        const globalSubjects = subjects.filter(s => s.groupCode);

        const uniqueGroupCodes = Array.from(new Set(globalSubjects.map(s => s.groupCode)));

        if (localSubjects.length > 0) {
            optionsHtml += `<optgroup label="CORE / LOCAL SUBJECTS">`;
            localSubjects.forEach(s => {
                optionsHtml += `<option value="${escapeHtml(s.subjectCode)}">${escapeHtml(s.subjectCode)} - ${escapeHtml(s.subjectName)}</option>`;
            });
            optionsHtml += `</optgroup>`;
        }

        if (uniqueGroupCodes.length > 0) {
            optionsHtml += `<optgroup label="GLOBAL ELECTIVE GROUPS">`;
            uniqueGroupCodes.forEach(gCode => {
                optionsHtml += `<option value="${escapeHtml(gCode)}">[GROUP] ${escapeHtml(gCode)}</option>`;
            });
            optionsHtml += `</optgroup>`;
        }
    } else {
        optionsHtml += `<option value="" disabled>No mapped subjects found for this batch/semester</option>`;
    }

    let html = '';
    for (let hour = 1; hour <= 5; hour++) {
        html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-6 font-mono font-bold text-slate-700">Hour ${hour}</td>
                <td class="py-3 px-6">
                    <select id="hour${hour}Input" data-hour="${hour}"
                            class="timetable-slot-input w-full max-w-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer">
                        ${optionsHtml}
                    </select>
                </td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function initTimetable() {
    const batchSelect = document.getElementById("tt-batch-select") || document.getElementById("batchSelect");
    const semesterSelect = document.getElementById("tt-semester-select") || document.getElementById("semesterSelect");
    const daySelect = document.getElementById("tt-day-select") || document.getElementById("daySelect");
    const saveBtn = document.getElementById("save-timetable-btn");

    renderTimetableSlots();

    const checkAndTriggerFetch = () => {
        const batch = batchSelect?.value;
        const sem = semesterSelect?.value;
        const day = daySelect?.value;

        renderTimetableSlots();

        if (batch && batch !== "" && batch !== "Select Batch" && sem && day) {
            fetchTimetable(batch, parseInt(sem, 10), day);
        }
    };

    batchSelect?.addEventListener("change", checkAndTriggerFetch);
    semesterSelect?.addEventListener("change", checkAndTriggerFetch);
    daySelect?.addEventListener("change", checkAndTriggerFetch);

    if (saveBtn) {
        saveBtn.addEventListener("click", (e) => {
            e.preventDefault();
            saveTimetable();
        });
    }

    checkAndTriggerFetch();
    if (typeof fetchWeeklyMatrix === "function") {
        fetchWeeklyMatrix();
    }
}

async function fetchTimetable(batch, semester, day) {
    try {
        renderTimetableSlots();
        let timetableData;
        try {
            timetableData = await apiFetch(`/api/admin/timetable?batch=${encodeURIComponent(batch)}&semester=${semester}&day=${encodeURIComponent(day)}`, 'GET');
        } catch {
            timetableData = await apiFetch(`/api/timetable?batch=${encodeURIComponent(batch)}&semester=${semester}&day=${encodeURIComponent(day)}`, 'GET');
        }
        populateTimetableUI(timetableData || []);
    } catch (error) {
        console.error("Failed to load timetable:", error);
    }
}

async function saveTimetable() {
    const saveBtn = document.getElementById("save-timetable-btn");
    const batchSelect = document.getElementById("tt-batch-select") || document.getElementById("batchSelect");
    const semesterSelect = document.getElementById("tt-semester-select") || document.getElementById("semesterSelect");
    const daySelect = document.getElementById("tt-day-select") || document.getElementById("daySelect");

    const batch = batchSelect?.value;
    const semester = parseInt(semesterSelect?.value, 10);
    const day = daySelect?.value;

    if (!batch || batch === "" || batch === "Select Batch") {
        showAlert("Please select a valid batch.", true);
        return;
    }
    if (isNaN(semester)) {
        showAlert("Please select a valid semester.", true);
        return;
    }
    if (!day) {
        showAlert("Please select a valid day.", true);
        return;
    }

    let slotInputs = document.querySelectorAll(".timetable-slot-input");
    let slots = [];

    if (slotInputs.length > 0) {
        slots = Array.from(slotInputs).map((elem) => ({
            hour: parseInt(elem.dataset.hour || elem.getAttribute("data-hour"), 10),
            subjectCode: elem.value.trim().toUpperCase()
        })).filter(slot => slot.subjectCode !== "" && !isNaN(slot.hour));
    }

    const payload = { batch, semester, day, slots };

    setButtonLoading(saveBtn, true, 'Saving...');

    try {
        let res;
        try {
            res = await apiFetch('/api/admin/timetable', 'POST', payload);
        } catch {
            res = await apiFetch('/api/timetable', 'POST', payload);
        }
        showAlert(res?.message || "Timetable saved successfully!");

        const overviewBatch = document.getElementById("overview-tt-batch-select");
        const overviewSem = document.getElementById("overview-tt-semester-select");
        if (overviewBatch) overviewBatch.value = batch;
        if (overviewSem) overviewSem.value = semester;

        if (typeof window.fetchWeeklyMatrix === "function") {
            window.fetchWeeklyMatrix();
        }
    } catch (error) {
        showAlert(`Failed to save timetable: ${error.message}`, true);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

function populateTimetableUI(slotsData) {
    document.querySelectorAll(".timetable-slot-input, [id^='hour']").forEach(elem => {
        elem.value = "";
    });

    if (Array.isArray(slotsData)) {
        slotsData.forEach(slot => {
            const elem = document.querySelector(`.timetable-slot-input[data-hour="${slot.hour}"]`) ||
                document.getElementById(`hour${slot.hour}Input`);
            if (elem) elem.value = slot.subjectCode || "";
        });
    }
}

async function fetchWeeklyMatrix() {
    const batchSelect = document.getElementById("overview-tt-batch-select");
    const semesterSelect = document.getElementById("overview-tt-semester-select");
    const tbody = document.getElementById("weekly-matrix-body");

    if (!tbody) return;

    const batch = batchSelect?.value;
    const semester = semesterSelect?.value;

    if (!batch || !semester) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-slate-400 italic text-center">Select batch and semester to load full week timetable...</td></tr>`;
        return;
    }

    const subjectNameMap = new Map();
    (window.assignedSubjectsCache || []).forEach(item => {
        if (item.subjectCode) {
            subjectNameMap.set(item.subjectCode, item.subjectName);
        }
    });

    const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

    try {
        const promises = days.map(day =>
            apiFetch(`/api/admin/timetable?batch=${encodeURIComponent(batch)}&semester=${semester}&day=${day}`, 'GET')
                .catch(() => apiFetch(`/api/timetable?batch=${encodeURIComponent(batch)}&semester=${semester}&day=${day}`, 'GET'))
                .catch(() => [])
        );

        const results = await Promise.all(promises);

        let matrixHtml = '';
        days.forEach((day, index) => {
            const daySlots = results[index] || [];
            const slotMap = {};

            if (Array.isArray(daySlots)) {
                daySlots.forEach(s => {
                    const displayName = s.subjectName || subjectNameMap.get(s.subjectCode) || s.subjectCode;
                    slotMap[s.hour] = displayName;
                });
            }

            matrixHtml += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 font-sans font-bold text-slate-700 text-left bg-slate-50/50 border-r border-slate-200">${day}</td>
                    ${[1, 2, 3, 4, 5].map(hour => {
                        const subjectDisplay = slotMap[hour] || '-';
                        const isEmpty = subjectDisplay === '-';
                        return `
                            <td class="py-3 px-3 border-r border-slate-200 ${isEmpty ? 'text-slate-300 font-sans' : 'font-bold text-indigo-600 bg-indigo-50/30'}">
                                ${escapeHtml(subjectDisplay)}
                            </td>
                        `;
                    }).join('')}
                </tr>
            `;
        });

        tbody.innerHTML = matrixHtml;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-red-500 text-center text-xs">Failed to load weekly matrix.</td></tr>`;
    }
}

function populateBatchDropdowns(batches) {
    const dropdownConfigs = [
        { id: 'student-batch-filter', defaultLabel: 'All Batches', defaultValue: 'ALL' },
        { id: 'filter-assigned-batch', defaultLabel: 'All Batches', defaultValue: 'ALL' },
        { id: 'log-filter-batch', defaultLabel: 'All Batches', defaultValue: 'ALL' },
        { id: 'modal-batch', defaultLabel: 'Select Batch', defaultValue: '' },
        { id: 'assign-batch-select', defaultLabel: 'Select Batch', defaultValue: '' },
        { id: 'elective-pool-batch', defaultLabel: 'Select Batch', defaultValue: '' },
        { id: 'tt-batch-select', defaultLabel: 'Select Batch', defaultValue: '' },
        { id: 'overview-tt-batch-select', defaultLabel: 'Select Batch', defaultValue: '' }
    ];

    dropdownConfigs.forEach(({ id, defaultLabel, defaultValue }) => {
        const selectEl = document.getElementById(id);
        if (!selectEl) return;

        const currentVal = selectEl.value;
        let optionsHtml = defaultValue === 'ALL'
            ? `<option value="ALL">${defaultLabel}</option>`
            : `<option value="" disabled ${!currentVal ? 'selected' : ''}>${defaultLabel}</option>`;

        batches.forEach(b => {
            const batchName = b.batch || b.batchName;
            if (batchName) {
                optionsHtml += `<option value="${escapeHtml(batchName)}">${escapeHtml(batchName)}</option>`;
            }
        });

        selectEl.innerHTML = optionsHtml;
        if (currentVal && Array.from(selectEl.options).some(o => o.value === currentVal)) {
            selectEl.value = currentVal;
        }
    });
}

// --- WINDOW GLOBAL BINDINGS ---
window.fetchWeeklyMatrix = fetchWeeklyMatrix;
window.initTimetable = initTimetable;
window.fetchTimetable = fetchTimetable;
window.saveTimetable = saveTimetable;
window.exportAdminLogsCSV = exportAdminLogsCSV;
window.fetchSubjects = fetchSubjects;
window.deleteSubject = deleteSubject;
window.populateSubjectFilter = populateSubjectFilter;
window.fetchMasterElectivePool = fetchMasterElectivePool;
window.toggleStudentElectiveChoice = toggleStudentElectiveChoice;
window.openStudentDetailModal = openStudentDetailModal;
window.closeStudentDetailModal = closeStudentDetailModal;
window.fetchStudentDetailWithSem = fetchStudentDetailWithSem;
window.toggleEditMode = toggleEditMode;
window.cancelEditMode = cancelEditMode;
window.toggleAttendanceStatus = toggleAttendanceStatus;

window.toggleTeacherPasswordVisibility = function(index) {
    const el = document.getElementById(`teacher-pwd-${index}`);
    if (!el) return;

    const raw = el.getAttribute('data-raw-pwd');
    const masked = el.getAttribute('data-masked-pwd');

    if (el.textContent === masked) {
        el.textContent = raw;
        el.classList.add('text-indigo-600', 'font-bold');
        el.classList.remove('text-slate-600');
    } else {
        el.textContent = masked;
        el.classList.remove('text-indigo-600', 'font-bold');
        el.classList.add('text-slate-600');
    }
};