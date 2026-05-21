// ==================== USER MANAGEMENT ====================
// js/users.js — إدارة المستخدمين والموظفين والصلاحيات

const USER_ROLES = {
    GENERAL_MANAGER: 'general_manager',
    EMPLOYEE: 'employee',
    ACCOUNTANT: 'accountant'
};

const ROLE_PERMISSIONS = {
    [USER_ROLES.GENERAL_MANAGER]: {
        canViewDashboard: true,
        canScan: true,
        canViewActive: true,
        canViewHistory: true,
        canViewCloud: true,
        canViewSettings: true,
        canManageEmployees: true,
        canViewAccountant: false,
        canViewMyRevenue: false,
        canEditPrice: true,
        canEditCooldown: true,
        canResetSystem: true,
        canImportExport: true,
        canManageCloud: true,
        canViewAllRevenues: false,
        canSettleEmployee: false
    },
    [USER_ROLES.EMPLOYEE]: {
        canViewDashboard: false,
        canScan: true,
        canViewActive: true,
        canViewHistory: false,
        canViewCloud: false,
        canViewSettings: false,
        canManageEmployees: false,
        canViewAccountant: false,
        canViewMyRevenue: true,
        canEditPrice: false,
        canEditCooldown: false,
        canResetSystem: false,
        canImportExport: false,
        canManageCloud: false,
        canViewAllRevenues: false,
        canSettleEmployee: false
    },
    [USER_ROLES.ACCOUNTANT]: {
        canViewDashboard: true,
        canScan: false,
        canViewActive: false,
        canViewHistory: true,
        canViewCloud: false,
        canViewSettings: false,
        canManageEmployees: false,
        canViewAccountant: true,
        canViewMyRevenue: false,
        canEditPrice: false,
        canEditCooldown: false,
        canResetSystem: false,
        canImportExport: true,
        canManageCloud: false,
        canViewAllRevenues: true,
        canSettleEmployee: true
    }
};

const USER_STORAGE_KEYS = {
    USERS: 'cec_users',
    CURRENT_USER: 'cec_current_user',
    EMPLOYEE_REVENUES: 'cec_employee_revenues',
    REVENUE_ARCHIVE: 'cec_revenue_archive'
};

let currentUser = null;
let employees = [];
let employeeRevenues = {}; // { employeeId: { todayRevenue: 0, carCount: 0, lastOperations: [] } }
let revenueArchive = []; // Archive of settled revenues

// ==================== LOAD USER MANAGEMENT ====================

function loadUserManagement() {
    try {
        const savedUsers = localStorage.getItem(USER_STORAGE_KEYS.USERS);
        const currentUserData = sessionStorage.getItem(USER_STORAGE_KEYS.CURRENT_USER);
        const savedRevenues = localStorage.getItem(USER_STORAGE_KEYS.EMPLOYEE_REVENUES);
        const savedArchive = localStorage.getItem(USER_STORAGE_KEYS.REVENUE_ARCHIVE);

        if (savedUsers) {
            try {
                employees = JSON.parse(savedUsers);
                console.log('✅ Loaded employees from localStorage:', employees.length);
            } catch (e) {
                console.warn('⚠️ Failed to parse saved users:', e);
                employees = [];
            }
        }
        
        if (currentUserData) {
            try {
                currentUser = JSON.parse(currentUserData);
            } catch (e) {
                console.warn('⚠️ Failed to parse current user:', e);
                currentUser = null;
            }
        }
        
        if (savedRevenues) {
            try {
                employeeRevenues = JSON.parse(savedRevenues);
            } catch (e) {
                console.warn('⚠️ Failed to parse revenues:', e);
                employeeRevenues = {};
            }
        }
        
        if (savedArchive) {
            try {
                revenueArchive = JSON.parse(savedArchive);
            } catch (e) {
                console.warn('⚠️ Failed to parse archive:', e);
                revenueArchive = [];
            }
        }

        // Always ensure default users are initialized
        initDefaultUsers();

        // ✅ إعادة تعيين الإيرادات اليومية تلقائياً عند بداية يوم جديد
        checkDailyRevenueReset();
    } catch (error) {
        console.error('❌ Error loading user management:', error);
        initDefaultUsers();
    }
}

// ==================== DAILY REVENUE AUTO-RESET ====================

function checkDailyRevenueReset() {
    const today = new Date().toISOString().split('T')[0];
    const lastResetDay = localStorage.getItem('cec_revenue_reset_day') || '';

    if (lastResetDay !== today) {
        console.log('🔄 يوم جديد — إعادة تعيين إيرادات الموظفين تلقائياً');

        // أرشفة إيرادات الأمس قبل الحذف
        employees.forEach(emp => {
            const rev = employeeRevenues[emp.id];
            if (rev && rev.todayRevenue > 0) {
                revenueArchive.push({
                    employeeId: emp.id,
                    employeeName: emp.name,
                    amount: rev.todayRevenue,
                    carCount: rev.carCount,
                    settledAt: (lastResetDay || today) + 'T23:59:59.000Z',
                    autoReset: true
                });
            }
        });

        // تصفير الإيرادات لجميع الموظفين
        employees.forEach(emp => {
            employeeRevenues[emp.id] = {
                todayRevenue: 0,
                carCount: 0,
                lastOperations: []
            };
        });

        localStorage.setItem('cec_revenue_reset_day', today);
        saveEmployeeRevenues();
        saveRevenueArchive();
        console.log('✅ تمت إعادة تعيين الإيرادات ليوم', today);
    }
}

function initDefaultUsers() {
    // Only initialize if list is empty
    if (!employees || employees.length === 0) {
        console.log('📋 Initializing default users...');
        employees = [
            {
                id: 1,
                name: 'المدير العام',
                phone: '+963999999999',
                pin: '111111',
                role: USER_ROLES.GENERAL_MANAGER,
                status: 'active',
                createdAt: new Date().toISOString()
            },
            {
                id: 2,
                name: 'أحمد الصالح',
                phone: '+963994640538',
                pin: '222222',
                role: USER_ROLES.EMPLOYEE,
                status: 'active',
                createdAt: new Date().toISOString()
            },
            {
                id: 3,
                name: 'محمد تركيه',
                phone: '+963912345680',
                pin: '333333',
                role: USER_ROLES.EMPLOYEE,
                status: 'active',
                createdAt: new Date().toISOString()
            },
            {
                id: 4,
                name: 'محاسب المالية',
                phone: '+963912345681',
                pin: '444444',
                role: USER_ROLES.ACCOUNTANT,
                status: 'active',
                createdAt: new Date().toISOString()
            }
        ];
        saveUsers();
        console.log('✅ Default users initialized');
    }

    // Initialize revenue tracking for all employees
    employees.forEach(emp => {
        if (!employeeRevenues[emp.id]) {
            employeeRevenues[emp.id] = {
                todayRevenue: 0,
                carCount: 0,
                lastOperations: []
            };
        }
    });
    saveEmployeeRevenues();
}

// ==================== AUTHENTICATION ====================

function authenticateUser(input, pin) {
    // Ensure employees list is loaded
    if (!employees || employees.length === 0) {
        console.warn('⚠️ Employees list empty, initializing defaults...');
        initDefaultUsers();
    }
    
    const employee = employees.find(e => 
        (e.phone === input || e.name === input) && 
        e.pin === pin && 
        e.status === 'active'
    );

    if (employee) {
        currentUser = {
            id: employee.id,
            name: employee.name,
            phone: employee.phone,
            role: employee.role,
            loginTime: new Date().toISOString()
        };
        sessionStorage.setItem(USER_STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
        console.log('✅ User authenticated:', currentUser.name);
        return true;
    }
    
    console.warn('❌ Authentication failed for input:', input);
    console.log('📋 Available users:', employees.map(e => ({ name: e.name, pin: e.pin, phone: e.phone })));
    return false;
}

function getCurrentUser() {
    return currentUser;
}

function getUserRole() {
    return currentUser ? currentUser.role : null;
}

function hasPermission(permission) {
    if (!currentUser) return false;
    const perms = ROLE_PERMISSIONS[currentUser.role];
    return perms[permission] || false;
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem(USER_STORAGE_KEYS.CURRENT_USER);
}

// ==================== EMPLOYEE MANAGEMENT ====================

function addEmployee(data) {
    const newEmployee = {
        id: Math.max(...employees.map(e => e.id), 0) + 1,
        name: data.name,
        phone: data.phone,
        pin: data.pin,
        role: data.role || USER_ROLES.EMPLOYEE,
        status: 'active',
        createdAt: new Date().toISOString()
    };

    employees.push(newEmployee);
    employeeRevenues[newEmployee.id] = {
        todayRevenue: 0,
        carCount: 0,
        lastOperations: []
    };

    saveUsers();
    saveEmployeeRevenues();
    return newEmployee;
}

function updateEmployee(id, data) {
    const employee = employees.find(e => e.id === id);
    if (!employee) return false;

    if (data.name) employee.name = data.name;
    if (data.phone) employee.phone = data.phone;
    if (data.pin) employee.pin = data.pin;
    if (data.role) employee.role = data.role;
    if (data.status !== undefined) employee.status = data.status;

    saveUsers();
    return true;
}

function deleteEmployee(id) {
    employees = employees.filter(e => e.id !== id);
    delete employeeRevenues[id];
    saveUsers();
    saveEmployeeRevenues();
    return true;
}

function toggleEmployeeStatus(id) {
    const employee = employees.find(e => e.id === id);
    if (employee) {
        employee.status = employee.status === 'active' ? 'disabled' : 'active';
        saveUsers();
        return true;
    }
    return false;
}

function getEmployee(id) {
    return employees.find(e => e.id === id);
}

function getAllEmployees() {
    return employees;
}

// ==================== REVENUE TRACKING ====================

function addSessionRevenue(session) {
    if (!session.exitEmployee || !session.priceNew) return;

    const exitEmployeeId = session.exitEmployee;
    if (employeeRevenues[exitEmployeeId]) {
        employeeRevenues[exitEmployeeId].todayRevenue += session.priceNew;
        employeeRevenues[exitEmployeeId].carCount += 1;
        employeeRevenues[exitEmployeeId].lastOperations.push({
            cardId: session.cardId,
            time: session.exitTime,
            amount: session.priceNew,
            hours: session.hours
        });

        // Keep only last 20 operations
        if (employeeRevenues[exitEmployeeId].lastOperations.length > 20) {
            employeeRevenues[exitEmployeeId].lastOperations.shift();
        }

        saveEmployeeRevenues();
    }
}

function getEmployeeRevenue(employeeId) {
    return employeeRevenues[employeeId] || {
        todayRevenue: 0,
        carCount: 0,
        lastOperations: []
    };
}

function getAllEmployeeRevenues() {
    return employeeRevenues;
}

function settleEmployeeAccount(employeeId) {
    const revenue = employeeRevenues[employeeId];
    if (!revenue) return false;

    // Add to archive
    revenueArchive.push({
        employeeId: employeeId,
        employeeName: getEmployee(employeeId).name,
        amount: revenue.todayRevenue,
        carCount: revenue.carCount,
        settledAt: new Date().toISOString()
    });

    // Reset current revenue
    employeeRevenues[employeeId] = {
        todayRevenue: 0,
        carCount: 0,
        lastOperations: []
    };

    saveEmployeeRevenues();
    saveRevenueArchive();
    return true;
}

// ==================== SAVE / LOAD ====================

function saveUsers() {
    localStorage.setItem(USER_STORAGE_KEYS.USERS, JSON.stringify(employees));
}

function saveEmployeeRevenues() {
    localStorage.setItem(USER_STORAGE_KEYS.EMPLOYEE_REVENUES, JSON.stringify(employeeRevenues));
}

function saveRevenueArchive() {
    localStorage.setItem(USER_STORAGE_KEYS.REVENUE_ARCHIVE, JSON.stringify(revenueArchive));
}

// ==================== VISIBILITY CONTROL ====================

function updateUIVisibility() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    const perms = ROLE_PERMISSIONS[currentUser.role];

    // Hide tabs based on permissions
    document.getElementById('tab-dashboard')?.classList.toggle('hidden', !perms.canViewDashboard);
    document.getElementById('tab-scan')?.classList.toggle('hidden', !perms.canScan);
    document.getElementById('tab-active')?.classList.toggle('hidden', !perms.canViewActive);
    document.getElementById('tab-history')?.classList.toggle('hidden', !perms.canViewHistory);
    document.getElementById('tab-cloud')?.classList.toggle('hidden', !perms.canViewCloud);
    document.getElementById('tab-settings')?.classList.toggle('hidden', !perms.canViewSettings);

    const navContainer = document.querySelector('nav.glass');

    // Show employee revenue tab for employees
    if (perms.canViewMyRevenue) {
        if (!document.getElementById('tab-my-revenue')) {
            const tab = document.createElement('button');
            tab.id = 'tab-my-revenue';
            tab.className = 'tab-btn flex-1 min-w-[100px] py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm';
            tab.onclick = () => switchTab('my-revenue');
            tab.innerHTML = '<i class="fas fa-wallet"></i><span>إيراداتي</span>';
            navContainer?.appendChild(tab);
        }
    }

    // Show accountant revenue tab for accountants
    if (perms.canViewAllRevenues) {
        if (!document.getElementById('tab-all-revenues')) {
            const tab = document.createElement('button');
            tab.id = 'tab-all-revenues';
            tab.className = 'tab-btn flex-1 min-w-[100px] py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm';
            tab.onclick = () => switchTab('all-revenues');
            tab.innerHTML = '<i class="fas fa-chart-bar"></i><span>إيرادات الموظفين</span>';
            navContainer?.appendChild(tab);
        }
    }

    // Show employee management tab for general managers
    if (perms.canManageEmployees) {
        if (!document.getElementById('tab-employees')) {
            const tab = document.createElement('button');
            tab.id = 'tab-employees';
            tab.className = 'tab-btn flex-1 min-w-[100px] py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm';
            tab.onclick = () => switchTab('employees');
            tab.innerHTML = '<i class="fas fa-users"></i><span>إدارة الموظفين</span>';
            navContainer?.appendChild(tab);
        }
    }
}

// ==================== INIT ====================

function initUserManagement() {
    loadUserManagement();
    if (currentUser) {
        updateUIVisibility();
    }
}
