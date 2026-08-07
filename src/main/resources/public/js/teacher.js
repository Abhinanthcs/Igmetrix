document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    loadBatches();

    document.getElementById('bulkAttendanceForm').addEventListener('submit', submitBulkAttendance);
});

function getAuthHeader() {
    const token = localStorage.getItem('jwtToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function logout() {
    localStorage.removeItem('jwtToken');
    window.location.href = 'login.html';
}

function markAll(status) {
    const radioButtons = document.querySelectorAll(`#studentRosterBody input[type="radio"][value="${status}"]`);
    radioButtons.forEach(radio => {
        radio.checked = true;
    });
}

// Fetch all available batches from admin route
async function loadBatches() {
    const batchSelect = document.getElementById('batchSelect');
    try {
        const response = await fetch('/api/admin/batches', {
            headers: { ...getAuthHeader() }
        });
        if (response.ok) {
            const batches = await response.json();
            batchSelect.innerHTML = '<option value="">Select Batch</option>';
            batches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.batch;
                opt.textContent = b.batch;
                batchSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Failed to load batches", e);
    }
}

// Triggered when Batch or Semester selection changes
async function onBatchOrSemChange() {
    const batch = document.getElementById('batchSelect').value;
    const sem = document.getElementById('semesterSelect').value;

    if (batch) {
        await loadSubjectsForBatchAndSem(batch, sem);
        await loadStudentRoster(batch);
    } else {
        document.getElementById('subjectSelect').innerHTML = '<option value="">Select Subject</option>';
        document.getElementById('studentRosterBody').innerHTML = `
            <tr>
                <td colspan="3" class="px-4 py-6 text-center text-slate-400 italic">Select a batch to load students...</td>
            </tr>`;
    }
}

// Load subjects assigned to batch + semester
async function loadSubjectsForBatchAndSem(batch, sem) {
    const subjectSelect = document.getElementById('subjectSelect');
    try {
        const response = await fetch(`/api/admin/batches/${encodeURIComponent(batch)}/semester/${sem}/subjects`, {
            headers: { ...getAuthHeader() }
        });
        if (response.ok) {
            const subjects = await response.json();
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
            subjects.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.code;
                opt.dataset.name = s.name;
                opt.textContent = `${s.code} - ${s.name}`;
                subjectSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Failed to load subjects", e);
    }
}

// Update hidden fields when subject is selected
function onSubjectSelectChange() {
    const subjectSelect = document.getElementById('subjectSelect');
    const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];

    if (selectedOption && selectedOption.value) {
        document.getElementById('subjectCode').value = selectedOption.value;
        document.getElementById('subjectName').value = selectedOption.dataset.name || '';
    } else {
        document.getElementById('subjectCode').value = '';
        document.getElementById('subjectName').value = '';
    }
}

// Load student roster by selected batch
async function loadStudentRoster(batch) {
    const tbody = document.getElementById('studentRosterBody');
    let students = [];

    try {
        const response = await fetch(`/api/admin/batch-students?batch=${encodeURIComponent(batch)}`, {
            headers: { ...getAuthHeader() }
        });
        if (response.ok) {
            students = await response.json();
        }
    } catch (e) {
        console.error("Failed to fetch student roster", e);
    }

    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-4 py-6 text-center text-slate-400 italic">No students found in this batch.</td>
            </tr>`;
        return;
    }

    students.forEach((student, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors";
        row.innerHTML = `
            <td class="px-4 py-3 font-semibold text-slate-800">${student.registerNumber}</td>
            <td class="px-4 py-3">${student.name}</td>
            <td class="px-4 py-3 text-center">
                <div class="inline-flex space-x-6 items-center">
                    <label class="flex items-center space-x-1 cursor-pointer text-emerald-600 font-bold">
                        <input type="radio" name="status_${index}" value="P" checked data-regnum="${student.registerNumber}" class="text-emerald-600 focus:ring-emerald-500">
                        <span>P</span>
                    </label>
                    <label class="flex items-center space-x-1 cursor-pointer text-rose-600 font-bold">
                        <input type="radio" name="status_${index}" value="A" data-regnum="${student.registerNumber}" class="text-rose-600 focus:ring-rose-500">
                        <span>A</span>
                    </label>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Submit bulk attendance
async function submitBulkAttendance(e) {
    e.preventDefault();
    const feedback = document.getElementById('feedbackMessage');
    feedback.className = "hidden";

    const selectedStudents = [];
    const radioGroups = document.querySelectorAll('#studentRosterBody input[type="radio"]:checked');

    radioGroups.forEach(radio => {
        selectedStudents.push({
            registerNumber: radio.getAttribute('data-regnum'),
            status: radio.value
        });
    });

    const payload = {
        subjectCode: document.getElementById('subjectCode').value.trim(),
        subjectName: document.getElementById('subjectName').value.trim(),
        date: document.getElementById('date').value,
        hour: parseInt(document.getElementById('hour').value, 10),
        students: selectedStudents
    };

    try {
        const response = await fetch('/teacher/mark-bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            feedback.className = "p-3 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 block";
            feedback.innerText = "All student attendance records submitted successfully!";
        } else if (response.status === 409) {
            feedback.className = "p-3 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 block";
            feedback.innerText = `⚠️ Duplicate Warning: ${result.error}`;
        } else {
            feedback.className = "p-3 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 block";
            feedback.innerText = result.error || "Failed to submit attendance.";
        }
    } catch (err) {
        feedback.className = "p-3 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 block";
        feedback.innerText = "Error connecting to backend server.";
    }
}