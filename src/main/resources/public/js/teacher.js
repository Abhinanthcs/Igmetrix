document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    loadStudentRoster();

    document.getElementById('bulkAttendanceForm').addEventListener('submit', submitBulkAttendance);
});

function markAll(status) {
    const radioButtons = document.querySelectorAll(`#studentRosterBody input[type="radio"][value="${status}"]`);
    radioButtons.forEach(radio => {
        radio.checked = true;
    });
}

const defaultStudents = {
    "BCA": [
        { registerNumber: "WM24BCAR013", name: "Student A" },
        { registerNumber: "WM24BCAR014", name: "Student B" },
        { registerNumber: "WM24BCAR015", name: "Student C" }
    ],
    "BSc CS": [
        { registerNumber: "CS24BCAR001", name: "CS Student 1" },
        { registerNumber: "CS24BCAR002", name: "CS Student 2" }
    ],
    "BCom": [
        { registerNumber: "CM24BCAR001", name: "Commerce Student 1" }
    ]
};

async function loadStudentRoster() {
    const tbody = document.getElementById('studentRosterBody');
    const selectedDept = document.getElementById('departmentSelect').value;
    let students = [];

    try {
        const response = await fetch(`/teacher/students?department=${encodeURIComponent(selectedDept)}`);
        if (response.ok) {
            students = await response.json();
        }
    } catch (e) {
        console.warn("Using fallback department roster");
    }

    if (!students || students.length === 0) {
        students = defaultStudents[selectedDept] || defaultStudents["BCA"];
    }

    tbody.innerHTML = '';
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            feedback.className = "p-3 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 block";
            feedback.innerText = "All student attendance records submitted successfully!";
        } else if (response.status === 409) {
            // Duplicate submission warning alert
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