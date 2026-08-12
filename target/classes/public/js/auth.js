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
    const hiddenRoleInput = document.getElementById('role');
    const errorMessage = document.getElementById('errorMessage');

    // Switch Login View Modes
    function setRole(role) {
        currentRole = role;
        if (hiddenRoleInput) hiddenRoleInput.value = role;

        if (errorMessage) errorMessage.classList.add('hidden');

        // Clear values when switching tabs
        if (field1) field1.value = '';
        if (field2) field2.value = '';

        // Reset tab styles
        [tabStudent, tabTeacher, tabAdmin].forEach(tab => {
            if (tab) {
                tab.className = "flex-1 py-2 text-center text-slate-400 hover:text-slate-700 transition-all border-b-2 border-transparent";
            }
        });

        if (role === 'student') {
            if (tabStudent) tabStudent.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Student Login";
            labelField1.textContent = "Register Number";
            labelField2.textContent = "Date of Birth";
            field1.placeholder = "e.g. WM24BCAR013";
            field1.autocomplete = "username";
            field2.type = "date";
            field2.autocomplete = "bday";
            field2.placeholder = "";
        } else if (role === 'teacher') {
            if (tabTeacher) tabTeacher.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Teacher Login";
            labelField1.textContent = "Teacher ID";
            labelField2.textContent = "Password";
            field1.placeholder = "e.g. TCH102";
            field1.autocomplete = "username";
            field2.type = "password";
            field2.autocomplete = "current-password";
            field2.placeholder = "Enter your password";
        } else if (role === 'admin') {
            if (tabAdmin) tabAdmin.className = "flex-1 py-2 text-center text-slate-800 font-bold border-b-2 border-slate-800 transition-all";
            title.textContent = "Department Admin Login";
            labelField1.textContent = "Department Code";
            labelField2.textContent = "Password";
            field1.placeholder = "e.g. BCA";
            field1.autocomplete = "username";
            field2.type = "password";
            field2.autocomplete = "current-password";
            field2.placeholder = "Enter your password";
        }
    }

    tabStudent?.addEventListener('click', () => setRole('student'));
    tabTeacher?.addEventListener('click', () => setRole('teacher'));
    tabAdmin?.addEventListener('click', () => setRole('admin'));

    // Initialize default role placeholders/attributes
    setRole('student');

    // Handle Form Submission
    const loginForm = document.getElementById('loginForm');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const val1 = field1.value.trim();
        const val2 = field2.value;

        try {
            let endpoint = '/api/auth/student-login';
            let payload = { registerNumber: val1, dateOfBirth: val2 };

            if (currentRole === 'teacher') {
                endpoint = '/api/auth/teacher-login';
                payload = { teacherId: val1, password: val2 };
            } else if (currentRole === 'admin') {
                endpoint = '/api/auth/admin-login';
                payload = { department: val1, password: val2 };
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Safely extract text first to avoid syntax errors on non-JSON 404/500 responses
            const text = await response.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    throw new Error(`Server returned non-JSON response (${response.status})`);
                }
            }

            if (response.ok && data.token) {
                localStorage.setItem('jwtToken', data.token);

                if (currentRole === 'admin') {
                    localStorage.setItem('adminDepartment', data.department || val1);
                    window.location.href = 'admin.html';
                } else if (currentRole === 'teacher') {
                    window.location.href = 'teacher.html';
                } else {
                    window.location.href = 'student.html';
                }
            } else {
                showError(data.error || data.message || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            console.error('Login request failed:', err);
            showError('Unable to connect to server. Please ensure backend server is running.');
        }
    });

    function showError(msg) {
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
        }
    }
});