// Configuration - Replace with your Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzLzdmzL3XT9Ux1auWXsFYEN8KAy5SpBgHcFPcBwzZupqxcQea_fYqjSmOp5WKftNho/exec';

// Global state
let currentUser = null;
let currentSession = null;
let students = [];
let attendanceData = {};
let currentSessionType = 'Morning';
let allBusesData = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupEventListeners();
    updateDate();
});

function setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('adminLogoutBtn')?.addEventListener('click', handleLogout);
    
    // Bus Lady - Session selection
    document.getElementById('morningBtn')?.addEventListener('click', () => selectSession('Morning'));
    document.getElementById('eveningBtn')?.addEventListener('click', () => selectSession('Evening'));
    
    // Submit attendance
    document.getElementById('submitAttendanceBtn')?.addEventListener('click', submitAttendance);
    
    // Modal
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('busDetailModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'busDetailModal') closeModal();
    });
}

function updateDate() {
    const date = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const currentDateEl = document.getElementById('currentDate');
    const adminDateEl = document.getElementById('adminDate');
    if (currentDateEl) currentDateEl.textContent = date;
    if (adminDateEl) adminDateEl.textContent = date;
}

async function checkSession() {
    const token = localStorage.getItem('sessionToken');
    if (!token) {
        showScreen('loginScreen');
        return;
    }

    try {
        const response = await apiCall('validateSession', { token });
        if (response.success && response.session) {
            currentUser = {
                email: response.session.email,
                role: response.session.role,
                bus_no: response.session.bus_no
            };
            currentSession = response.session;
            
            if (currentUser.role === 'admin') {
                loadAdminDashboard();
            } else if (currentUser.role === 'bus_lady') {
                loadBusLadyScreen();
            } else {
                handleLogout();
            }
        } else {
            handleLogout();
        }
    } catch (error) {
        console.error('Session validation error:', error);
        handleLogout();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';

    // Show loading state
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
        console.log('Attempting login for:', email);
        const response = await apiCall('login', { email, password });
        console.log('Login response:', response);
        
        if (response && response.success && response.token) {
            localStorage.setItem('sessionToken', response.token);
            currentUser = {
                email: response.user.email,
                role: response.user.role,
                bus_no: response.user.bus_no
            };
            currentSession = response.session;

            if (currentUser.role === 'admin') {
                loadAdminDashboard();
            } else if (currentUser.role === 'bus_lady') {
                loadBusLadyScreen();
            }
        } else {
            errorDiv.textContent = (response && response.message) || 'Invalid email or password';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Login error details:', error);
        errorDiv.textContent = `Login failed: ${error.message || 'Please check your connection and try again.'}`;
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function handleLogout() {
    localStorage.removeItem('sessionToken');
    currentUser = null;
    currentSession = null;
    students = [];
    attendanceData = {};
    showScreen('loginScreen');
    document.getElementById('loginForm').reset();
}

function showScreen(screenId) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('busLadyScreen').classList.add('hidden');
    document.getElementById('adminScreen').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

async function loadBusLadyScreen() {
    showScreen('busLadyScreen');
    document.getElementById('currentBusNo').textContent = currentUser.bus_no;
    
    await loadStudents();
    await loadExistingAttendance();
    renderStudents();
    selectSession('Morning');
}

async function loadStudents() {
    try {
        const response = await apiCall('getStudents', { bus_no: currentUser.bus_no });
        if (response.success) {
            students = response.students || [];
        } else {
            students = [];
        }
    } catch (error) {
        console.error('Error loading students:', error);
        students = [];
    }
}

async function loadExistingAttendance() {
    const today = new Date().toISOString().split('T')[0];
    try {
        const response = await apiCall('getAttendance', { 
            bus_no: currentUser.bus_no, 
            date: today 
        });
        if (response.success) {
            attendanceData = {};
            (response.attendance || []).forEach(record => {
                const key = `${record.student_id}_${record.session}`;
                attendanceData[key] = record.status === 'Present';
            });
        }
    } catch (error) {
        console.error('Error loading existing attendance:', error);
        attendanceData = {};
    }
}

function selectSession(session) {
    currentSessionType = session;
    
    const morningBtn = document.getElementById('morningBtn');
    const eveningBtn = document.getElementById('eveningBtn');
    const sessionLabel = document.getElementById('sessionLabel');
    
    if (session === 'Morning') {
        morningBtn.classList.remove('bg-gray-200', 'text-gray-700');
        morningBtn.classList.add('bg-green-600', 'text-white');
        eveningBtn.classList.remove('bg-green-600', 'text-white');
        eveningBtn.classList.add('bg-gray-200', 'text-gray-700');
    } else {
        eveningBtn.classList.remove('bg-gray-200', 'text-gray-700');
        eveningBtn.classList.add('bg-green-600', 'text-white');
        morningBtn.classList.remove('bg-green-600', 'text-white');
        morningBtn.classList.add('bg-gray-200', 'text-gray-700');
    }
    
    sessionLabel.textContent = session;
    renderStudents();
}

function renderStudents() {
    const container = document.getElementById('studentsList');
    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No students found for this bus.</p>';
        updateCounts();
        return;
    }

    students.forEach(student => {
        const key = `${student.student_id}_${currentSessionType}`;
        const isPresent = attendanceData[key] || false;

        const card = document.createElement('div');
        card.className = 'student-card bg-white rounded-lg shadow p-4 flex items-center justify-between';
        card.innerHTML = `
            <div class="flex-1">
                <div class="font-semibold text-gray-800">${student.student_name}</div>
                <div class="text-sm text-gray-500">ID: ${student.student_id} | ${student.school || ''}</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${isPresent ? 'checked' : ''} 
                       data-student-id="${student.student_id}">
                <span class="slider"></span>
            </label>
        `;

        const checkbox = card.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            attendanceData[key] = e.target.checked;
            updateCounts();
        });

        container.appendChild(card);
    });

    updateCounts();
}

function updateCounts() {
    const present = students.filter(student => {
        const key = `${student.student_id}_${currentSessionType}`;
        return attendanceData[key] === true;
    }).length;

    document.getElementById('presentCount').textContent = present;
    document.getElementById('totalCount').textContent = students.length;
}

async function submitAttendance() {
    const today = new Date().toISOString().split('T')[0];
    const submitBtn = document.getElementById('submitAttendanceBtn');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const attendanceRecords = students.map(student => {
            const key = `${student.student_id}_${currentSessionType}`;
            return {
                student_id: student.student_id,
                status: attendanceData[key] ? 'Present' : 'Absent'
            };
        });

        const token = localStorage.getItem('sessionToken');
        const response = await apiCall('submitAttendance', {
            bus_no: currentUser.bus_no,
            date: today,
            session: currentSessionType,
            attendance: attendanceRecords,
            token: token
        });

        if (response.success) {
            alert('Attendance submitted successfully!');
            await loadExistingAttendance();
            renderStudents();
        } else {
            alert(response.message || 'Failed to submit attendance. Please try again.');
        }
    } catch (error) {
        console.error('Error submitting attendance:', error);
        alert('Error submitting attendance. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

async function loadAdminDashboard() {
    showScreen('adminScreen');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall('getAllBusesAttendance', { date: today });
        
        if (response.success) {
            allBusesData = response.buses || [];
            renderBuses();
        } else {
            allBusesData = [];
            renderBuses();
        }
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        allBusesData = [];
        renderBuses();
    }
}

function renderBuses() {
    const container = document.getElementById('busesList');
    container.innerHTML = '';

    if (allBusesData.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No bus data available.</p>';
        return;
    }

    allBusesData.forEach(bus => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition';
        card.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <h3 class="text-xl font-bold text-gray-800">Bus ${bus.bus_no}</h3>
                <span class="text-sm text-gray-500">${bus.total_students} students</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-green-50 p-3 rounded">
                    <div class="text-xs text-gray-600 mb-1">Morning</div>
                    <div class="text-lg font-bold text-green-600">${bus.morning_present}/${bus.morning_total}</div>
                </div>
                <div class="bg-blue-50 p-3 rounded">
                    <div class="text-xs text-gray-600 mb-1">Evening</div>
                    <div class="text-lg font-bold text-blue-600">${bus.evening_present}/${bus.evening_total}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openBusDetail(bus));
        container.appendChild(card);
    });
}

async function openBusDetail(bus) {
    const modal = document.getElementById('busDetailModal');
    document.getElementById('modalBusTitle').textContent = `Bus ${bus.bus_no} - Attendance Details`;
    
    document.getElementById('modalMorningCount').textContent = `${bus.morning_present}/${bus.morning_total}`;
    document.getElementById('modalEveningCount').textContent = `${bus.evening_present}/${bus.evening_total}`;

    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall('getBusAttendanceDetail', {
            bus_no: bus.bus_no,
            date: today
        });

        const studentsList = document.getElementById('modalStudentsList');
        studentsList.innerHTML = '';

        if (response.success && response.students) {
            response.students.forEach(student => {
                const morningStatus = student.morning_status || 'Not Marked';
                const eveningStatus = student.evening_status || 'Not Marked';
                
                const statusColor = (status) => {
                    if (status === 'Present') return 'text-green-600';
                    if (status === 'Absent') return 'text-red-600';
                    return 'text-gray-500';
                };

                const card = document.createElement('div');
                card.className = 'bg-gray-50 rounded-lg p-3';
                card.innerHTML = `
                    <div class="font-semibold text-gray-800">${student.student_name}</div>
                    <div class="text-xs text-gray-500 mb-2">ID: ${student.student_id}</div>
                    <div class="flex gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Morning: </span>
                            <span class="${statusColor(morningStatus)} font-semibold">${morningStatus}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Evening: </span>
                            <span class="${statusColor(eveningStatus)} font-semibold">${eveningStatus}</span>
                        </div>
                    </div>
                `;
                studentsList.appendChild(card);
            });
        } else {
            studentsList.innerHTML = '<p class="text-center text-gray-500 py-4">No attendance data available.</p>';
        }
    } catch (error) {
        console.error('Error loading bus detail:', error);
        document.getElementById('modalStudentsList').innerHTML = 
            '<p class="text-center text-red-500 py-4">Error loading details.</p>';
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('busDetailModal').classList.add('hidden');
}

async function apiCall(path, data = {}) {
    if (!API_URL || API_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
        throw new Error('Please set API_URL in script.js to your Apps Script Web App URL');
    }

    try {
        console.log('API Call:', path, data);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path, ...data })
        });

        console.log('Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error text:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const responseText = await response.text();
        console.log('Response text:', responseText);
        
        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError, 'Response was:', responseText);
            throw new Error('Invalid JSON response from server');
        }

        return jsonData;
    } catch (error) {
        console.error('API call error:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Network error: Please check your internet connection and ensure the API URL is correct.');
        }
        throw error;
    }
}

