document.addEventListener('DOMContentLoaded', () => {
    let currentRole = 'student'; // Default role

    const tabStudent = document.getElementById('tab-student');
    const tabTeacher = document.getElementById('tab-teacher');
    const tabAdmin = document.getElementById('tab-admin');

    const title = document.getElementById('login-title');
    const labelField1 = document.getElementById('label-field1');
    const labelField2 = document.getElementById('label-field2');
    const field1 = document.getElementById('field1');
    const field2 = document.getElementById('field2');
    const errorMessage = document.getElementById('errorMessage');

    // Switch Login View Modes
    function setRole(role) {
        currentRole = role;
        errorMessage.classList.add('hidden');

        // Reset tab styles
        [tabStudent, tabTeacher, tabAdmin].forEach(tab => {
            tab.className = "flex-1 py-2 text-center text-slate-400 hover:text-slate-700 transition-all border-b-2 border-transparent";
        });

        if (role === 'student') {
            tabStudent.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Student Login";
            labelField1.textContent = "Register Number";
            labelField2.textContent = "Date of Birth";
            field1.placeholder = "e.g. WM24BCAR013";
            field2.type = "date";
        } else if (role === 'teacher') {
            tabTeacher.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Teacher Login";
            labelField1.textContent = "Register / ID Number";
            labelField2.textContent = "Date of Birth";
            field1.placeholder = "e.g. TCH102";
            field2.type = "date";
        } else if (role === 'admin') {
            tabAdmin.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Department Admin Login";
            labelField1.textContent = "Department Code";
            labelField2.textContent = "Password";
            field1.placeholder = "e.g. BCA";
            field2.type = "password";
        }
    }

    tabStudent?.addEventListener('click', () => setRole('student'));
    tabTeacher?.addEventListener('click', () => setRole('teacher'));
    tabAdmin?.addEventListener('click', () => setRole('admin'));

    // Handle Form Submission
    const loginForm = document.getElementById('loginForm');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const val1 = field1.value.trim();
        const val2 = field2.value;

        try {
            let endpoint = '/login';
            let payload = { registerNumber: val1, dateOfBirth: val2 };

            if (currentRole === 'teacher') {
                endpoint = '/api/auth/teacher-login';
                payload = { teacherId: val1, dateOfBirth: val2 };
            } else if (currentRole === 'admin') {
                endpoint = '/api/auth/admin-login';
                payload = { department: val1, password: val2 };
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.token) {
                localStorage.setItem('jwtToken', data.token);

                if (currentRole === 'admin') {
                    localStorage.setItem('adminDepartment', data.department);
                    window.location.href = 'admin.html';
                } else if (currentRole === 'teacher') {
                    window.location.href = 'teacher.html';
                } else {
                    window.location.href = 'student.html';
                }
            } else {
                showError(data.error || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            showError('Unable to connect to server.');
        }
    });

    function showError(msg) {
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
        }
    }
});