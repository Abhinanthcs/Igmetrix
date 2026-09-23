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
    const submitBtn = document.getElementById('submit-btn');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');

    // Tab Style Definitions
    const activeTabClasses = ['text-slate-900', 'border-b-2', 'border-slate-900', 'font-bold'];
    const inactiveTabClasses = ['text-slate-400', 'hover:text-slate-700', 'font-semibold', 'border-b-2', 'border-transparent'];

    // Switch Login View Modes
    function setRole(role) {
        currentRole = role;
        if (hiddenRoleInput) hiddenRoleInput.value = role;

        if (errorMessage) errorMessage.classList.add('hidden');

        // Clear input values when switching tabs
        if (field1) field1.value = '';
        if (field2) field2.value = '';

        // Reset and update tab styles
        const tabs = [
            { el: tabStudent, roleName: 'student' },
            { el: tabTeacher, roleName: 'teacher' },
            { el: tabAdmin, roleName: 'admin' }
        ];

        tabs.forEach(({ el, roleName }) => {
            if (el) {
                if (roleName === role) {
                    el.classList.remove(...inactiveTabClasses);
                    el.classList.add(...activeTabClasses);
                } else {
                    el.classList.remove(...activeTabClasses);
                    el.classList.add(...inactiveTabClasses);
                }
            }
        });

        if (role === 'student') {
            title.textContent = "Student Login";
            labelField1.textContent = "Register Number";
            labelField2.textContent = "Date of Birth";
            field1.placeholder = "e.g. WM24BCAR013";
            field1.autocomplete = "username";
            field2.type = "date";
            field2.autocomplete = "bday";
            field2.placeholder = "";
            togglePasswordBtn?.classList.add('hidden');
        } else if (role === 'teacher') {
            title.textContent = "Teacher Login";
            labelField1.textContent = "Teacher ID";
            labelField2.textContent = "Password";
            field1.placeholder = "e.g. TCH102";
            field1.autocomplete = "username";
            field2.type = "password";
            field2.autocomplete = "current-password";
            field2.placeholder = "Enter your password";
            togglePasswordBtn?.classList.remove('hidden');
        } else if (role === 'admin') {
            title.textContent = "Department Admin Login";
            labelField1.textContent = "Department Code";
            labelField2.textContent = "Password";
            field1.placeholder = "e.g. BCA";
            field1.autocomplete = "username";
            field2.type = "password";
            field2.autocomplete = "current-password";
            field2.placeholder = "Enter your password";
            togglePasswordBtn?.classList.remove('hidden');
        }
    }

    tabStudent?.addEventListener('click', () => setRole('student'));
    tabTeacher?.addEventListener('click', () => setRole('teacher'));
    tabAdmin?.addEventListener('click', () => setRole('admin'));

    // Initialize default role
    setRole('student');

    // UI Loading Spinner Helper
    function setSubmittingState(isSubmitting) {
        if (!submitBtn) return;

        if (isSubmitting) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <span class="inline-flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Logging in...
                </span>
            `;
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Login</span>`;
        }
    }

    // Handle Form Submission
    const loginForm = document.getElementById('loginForm');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const val1 = field1.value.trim();
        const val2 = field2.value;

        setSubmittingState(true);

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

            // Extract response text cleanly
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
        } finally {
            setSubmittingState(false);
        }
    });

    function showError(msg) {
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
        }
    }
});