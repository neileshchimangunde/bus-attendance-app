// Configuration - Replace with your Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyUyQ5WqQ9iRxYtZp5xtjUu0VgD5taAskrJprvfHAlXEkpC3bl4zi9DTV1_w8T_566Q/exec';

// Global state
let currentUser = null;
let currentSession = null;
let students = [];
let attendanceData = {};
let currentSessionType = 'Morning';
let allBusesData = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Hide login screen initially to prevent flash
    document.getElementById('loginScreen').classList.add('hidden');
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
    
    // Student selector in modal
    const studentSelector = document.getElementById('studentSelector');
    if (studentSelector) {
        studentSelector.addEventListener('change', async (e) => {
            selectedStudentId = e.target.value;
            if (selectedStudentId) {
                currentCalendarYear = new Date().getFullYear();
                currentCalendarMonth = new Date().getMonth() + 1;
                await renderCalendar();
            } else {
                document.getElementById('calendarContainer').classList.add('hidden');
            }
        });
    }
    
    // Month navigation
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalendarMonth--;
            if (currentCalendarMonth < 1) {
                currentCalendarMonth = 12;
                currentCalendarYear--;
            }
            renderCalendar();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalendarMonth++;
            if (currentCalendarMonth > 12) {
                currentCalendarMonth = 1;
                currentCalendarYear++;
            }
            renderCalendar();
        });
    }
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
        // Only show login if it's a real error, not just a network delay
        setTimeout(() => {
            if (!currentUser) {
                handleLogout();
            }
        }, 1000);
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
    
    // Show loading state
    const container = document.getElementById('studentsList');
    container.innerHTML = '<p class="text-center text-gray-500 py-8">Loading...</p>';
    
    // Load data in parallel for better performance
    await Promise.all([
        loadStudents(),
        loadExistingAttendance()
    ]);
    
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
            
            // If evening session: auto-mark students as present if they were present in morning
            // (they came to school, so they'll go back home)
            students.forEach(student => {
                const morningKey = `${student.student_id}_Morning`;
                const eveningKey = `${student.student_id}_Evening`;
                
                // If student was present in morning but evening not yet marked, auto-mark as present
                if (attendanceData[morningKey] === true && attendanceData[eveningKey] === undefined) {
                    attendanceData[eveningKey] = true;
                }
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
        
        // For evening: auto-mark students present if they were present in morning
        students.forEach(student => {
            const morningKey = `${student.student_id}_Morning`;
            const eveningKey = `${student.student_id}_Evening`;
            if (attendanceData[morningKey] === true && attendanceData[eveningKey] === undefined) {
                attendanceData[eveningKey] = true;
            }
        });
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
        let isPresent = attendanceData[key];
        
        // For evening session: if student was present in morning, default to present
        if (currentSessionType === 'Evening' && isPresent === undefined) {
            const morningKey = `${student.student_id}_Morning`;
            if (attendanceData[morningKey] === true) {
                isPresent = true;
                attendanceData[key] = true; // Auto-set it
            } else {
                isPresent = false;
            }
        } else {
            isPresent = isPresent || false;
        }

        const card = document.createElement('div');
        card.className = 'student-card bg-white rounded-lg shadow p-4 flex items-center justify-between';
        
        // Show morning status indicator for evening session
        const morningStatus = currentSessionType === 'Evening' ? 
            (attendanceData[`${student.student_id}_Morning`] === true ? 
                '<span class="text-xs text-green-600 font-semibold">✓ Morning</span>' : 
                '<span class="text-xs text-gray-400">Morning: -</span>') : '';
        
        card.innerHTML = `
            <div class="flex-1">
                <div class="font-semibold text-gray-800">${student.student_name}</div>
                <div class="text-sm text-gray-500">ID: ${student.student_id} | ${student.school || ''}</div>
                ${morningStatus}
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
        // Read actual checkbox states from DOM to ensure accuracy
        const attendanceRecords = students.map(student => {
            const checkbox = document.querySelector(`input[data-student-id="${student.student_id}"]`);
            const isPresent = checkbox ? checkbox.checked : false;
            
            // Update attendanceData to match checkbox state
            const key = `${student.student_id}_${currentSessionType}`;
            attendanceData[key] = isPresent;
            
            return {
                student_id: student.student_id,
                status: isPresent ? 'Present' : 'Absent'
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
            // Show success message without blocking
            const successMsg = document.createElement('div');
            successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
            successMsg.textContent = 'Attendance submitted successfully!';
            document.body.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);
            
            // Reload attendance to get latest data
            await loadExistingAttendance();
            
            // If morning was submitted, auto-mark evening for present students
            if (currentSessionType === 'Morning') {
                students.forEach(student => {
                    const morningKey = `${student.student_id}_Morning`;
                    const eveningKey = `${student.student_id}_Evening`;
                    if (attendanceData[morningKey] === true) {
                        attendanceData[eveningKey] = true;
                    }
                });
            }
            
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
        
        const lastDate = bus.last_submission_date ? 
            new Date(bus.last_submission_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
            'No submissions yet';
        
        card.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <h3 class="text-xl font-bold text-gray-800">Bus ${bus.bus_no}</h3>
                <span class="text-sm text-gray-500">${bus.total_students} students</span>
            </div>
            <div class="text-xs text-gray-500 mb-3">Last submission: ${lastDate}</div>
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

let currentModalBus = null;
let currentModalStudents = [];
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth() + 1;
let selectedStudentId = null;

async function openBusDetail(bus) {
    currentModalBus = bus;
    const modal = document.getElementById('busDetailModal');
    document.getElementById('modalBusTitle').textContent = `Bus ${bus.bus_no} - Attendance Details`;
    
    document.getElementById('modalMorningCount').textContent = `${bus.morning_present}/${bus.morning_total}`;
    document.getElementById('modalEveningCount').textContent = `${bus.evening_present}/${bus.evening_total}`;

    // Hide calendar initially
    document.getElementById('calendarContainer').classList.add('hidden');
    document.getElementById('studentSelector').value = '';
    selectedStudentId = null;

    try {
        // Load students for this bus
        const response = await apiCall('getStudents', { bus_no: bus.bus_no });
        
        if (response.success && response.students) {
            currentModalStudents = response.students;
            
            // Populate student selector
            const selector = document.getElementById('studentSelector');
            selector.innerHTML = '<option value="">-- Select a student --</option>';
            response.students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.student_id;
                option.textContent = `${student.student_name} (${student.student_id})`;
                selector.appendChild(option);
            });
        } else {
            document.getElementById('studentSelector').innerHTML = '<option value="">No students found</option>';
        }
    } catch (error) {
        console.error('Error loading bus detail:', error);
    }

    modal.classList.remove('hidden');
}

async function renderCalendar() {
    if (!selectedStudentId || !currentModalBus) return;
    
    const container = document.getElementById('calendarContainer');
    container.classList.remove('hidden');
    
    try {
        const response = await apiCall('getStudentAttendanceHistory', {
            student_id: selectedStudentId,
            bus_no: currentModalBus.bus_no,
            year: currentCalendarYear,
            month: currentCalendarMonth
        });
        
        const attendanceData = response.success ? response.attendance : {};
        
        // Update month/year display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('calendarMonthYear').textContent = 
            `${monthNames[currentCalendarMonth - 1]} ${currentCalendarYear}`;
        
        // Render calendar
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';
        
        // Day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'text-center font-semibold text-gray-600 p-2';
            header.textContent = day;
            grid.appendChild(header);
        });
        
        // Get first day of month and number of days
        const firstDay = new Date(currentCalendarYear, currentCalendarMonth - 1, 1);
        const lastDay = new Date(currentCalendarYear, currentCalendarMonth, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        // Empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            const empty = document.createElement('div');
            grid.appendChild(empty);
        }
        
        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentCalendarYear}-${String(currentCalendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = attendanceData[dateStr] || {};
            const morningStatus = dayData['Morning'];
            const eveningStatus = dayData['Evening'];
            
            const dayCell = document.createElement('div');
            dayCell.className = 'aspect-square p-1';
            
            let bgColor = 'bg-gray-100'; // Default (no data)
            if (morningStatus === 'Present' && eveningStatus === 'Present') {
                bgColor = 'bg-green-600'; // Dark green - both sessions
            } else if (morningStatus === 'Present' || eveningStatus === 'Present') {
                bgColor = 'bg-green-200'; // Faint green - one session
            } else if (morningStatus === 'Absent' && eveningStatus === 'Absent') {
                bgColor = 'bg-red-600'; // Dark red - absent both
            } else if (morningStatus === 'Absent' || eveningStatus === 'Absent') {
                bgColor = 'bg-red-400'; // Light red - absent one session
            }
            
            dayCell.className = `aspect-square p-1 ${bgColor} rounded text-center text-sm flex items-center justify-center`;
            dayCell.textContent = day;
            grid.appendChild(dayCell);
        }
    } catch (error) {
        console.error('Error rendering calendar:', error);
        document.getElementById('calendarGrid').innerHTML = 
            '<div class="col-span-7 text-center text-red-500 py-4">Error loading calendar data.</div>';
    }
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
        
        // Use text/plain Content-Type to avoid CORS preflight request
        // This is a known workaround for Google Apps Script CORS issues
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
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
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('CORS')) {
            throw new Error('Network error: Please check your internet connection and ensure the API URL is correct.');
        }
        throw error;
    }
}

