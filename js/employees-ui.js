// ==================== EMPLOYEE UI MANAGEMENT ====================
// js/employees-ui.js — واجهة إدارة الموظفين والإيرادات

// ==================== EMPLOYEE MODAL ====================

function openAddEmployeeModal() {
    document.getElementById('employee-modal-title').textContent = 'إضافة موظف جديد';
    document.getElementById('employee-form').reset();
    document.getElementById('employee-form').onsubmit = (e) => {
        e.preventDefault();
        addNewEmployee();
    };
    document.getElementById('employee-modal').classList.remove('hidden');
    document.getElementById('employee-modal').classList.add('flex');
}

function openEditEmployeeModal(employeeId) {
    const employee = getEmployee(employeeId);
    if (!employee) return;

    document.getElementById('employee-modal-title').textContent = 'تعديل بيانات الموظف';
    document.getElementById('emp-name').value = employee.name;
    document.getElementById('emp-phone').value = employee.phone;
    document.getElementById('emp-pin').value = employee.pin;
    document.getElementById('emp-role').value = employee.role;
    
    document.getElementById('employee-form').onsubmit = (e) => {
        e.preventDefault();
        updateEmployeeData(employeeId);
    };
    
    document.getElementById('employee-modal').classList.remove('hidden');
    document.getElementById('employee-modal').classList.add('flex');
}

function closeEmployeeModal() {
    document.getElementById('employee-modal').classList.add('hidden');
    document.getElementById('employee-modal').classList.remove('flex');
    document.getElementById('employee-form').reset();
}

function addNewEmployee() {
    const data = {
        name: document.getElementById('emp-name').value.trim(),
        phone: document.getElementById('emp-phone').value.trim(),
        pin: document.getElementById('emp-pin').value.trim(),
        role: document.getElementById('emp-role').value
    };

    // Validation
    if (!data.name || !data.phone || !data.pin) {
        showToast('الرجاء ملء جميع الحقول', 'error');
        return;
    }

    if (data.pin.length !== 6 || !/^\d+$/.test(data.pin)) {
        showToast('رمز المرور يجب أن يكون 6 أرقام', 'error');
        return;
    }

    const employee = addEmployee(data);
    showToast(`تم إضافة الموظف ${employee.name} بنجاح`, 'success');
    closeEmployeeModal();
    renderEmployeesTable();
}

function updateEmployeeData(employeeId) {
    const data = {
        name: document.getElementById('emp-name').value.trim(),
        phone: document.getElementById('emp-phone').value.trim(),
        pin: document.getElementById('emp-pin').value.trim(),
        role: document.getElementById('emp-role').value
    };

    if (updateEmployee(employeeId, data)) {
        showToast('تم تحديث بيانات الموظف بنجاح', 'success');
        closeEmployeeModal();
        renderEmployeesTable();
    }
}

function deleteEmployeeUI(employeeId) {
    const employee = getEmployee(employeeId);
    if (!employee) return;

    if (confirm(`هل تريد حقاً حذف الموظف ${employee.name}؟`)) {
        deleteEmployee(employeeId);
        showToast(`تم حذف الموظف ${employee.name}`, 'success');
        renderEmployeesTable();
    }
}

function toggleEmployeeStatusUI(employeeId) {
    const employee = getEmployee(employeeId);
    if (!employee) return;

    if (toggleEmployeeStatus(employeeId)) {
        const status = employee.status === 'active' ? 'موقوف' : 'فعال';
        showToast(`تم ${status} الموظف ${employee.name}`, 'success');
        renderEmployeesTable();
    }
}

// ==================== SETTLE ACCOUNT MODAL ====================

function openSettleModal(employeeId) {
    const employee = getEmployee(employeeId);
    const revenue = getEmployeeRevenue(employeeId);

    if (!employee || !revenue.todayRevenue) {
        showToast('لا توجد إيرادات لتصفيتها', 'warning');
        return;
    }

    document.getElementById('settle-emp-name').textContent = employee.name;
    document.getElementById('settle-amount').textContent = revenue.todayRevenue;
    document.getElementById('settle-modal').dataset.employeeId = employeeId;
    document.getElementById('settle-modal').classList.remove('hidden');
    document.getElementById('settle-modal').classList.add('flex');
}

function closeSettleModal() {
    document.getElementById('settle-modal').classList.add('hidden');
    document.getElementById('settle-modal').classList.remove('flex');
}

function confirmSettleAccount() {
    const employeeId = parseInt(document.getElementById('settle-modal').dataset.employeeId);
    const employee = getEmployee(employeeId);

    if (settleEmployeeAccount(employeeId)) {
        showToast(`تم تصفية حساب الموظف ${employee.name} بنجاح`, 'success');
        closeSettleModal();
        renderAllRevenuesTable();
    }
}

// ==================== RENDER EMPLOYEES TABLE ====================

function renderEmployeesTable() {
    const tbody = document.getElementById('employees-body');
    const employees = getAllEmployees();

    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-textMuted">لا توجد بيانات موظفين</td></tr>';
        return;
    }

    const roleNames = {
        general_manager: 'مدير عام',
        employee: 'موظف',
        accountant: 'محاسب'
    };

    tbody.innerHTML = employees.map(emp => `
        <tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors">
            <td class="py-3 px-4 text-sm text-textMain font-semibold">${emp.name}</td>
            <td class="py-3 px-4 text-sm text-textMuted">${emp.phone}</td>
            <td class="py-3 px-4 text-sm"><span class="px-2 py-1 rounded-lg text-xs font-bold ${emp.role === 'general_manager' ? 'bg-primary/20 text-primary' : emp.role === 'accountant' ? 'bg-blue-100 text-blue-700' : 'bg-secondary/20 text-secondary'}">${roleNames[emp.role]}</span></td>
            <td class="py-3 px-4 text-sm">
                <span class="px-2 py-1 rounded-lg text-xs font-bold ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${emp.status === 'active' ? 'فعال' : 'موقوف'}
                </span>
            </td>
            <td class="py-3 px-4 text-sm">
                <div class="flex gap-2">
                    <button onclick="openEditEmployeeModal(${emp.id})" class="px-2 py-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="toggleEmployeeStatusUI(${emp.id})" class="px-2 py-1 rounded-lg ${emp.status === 'active' ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'} transition-colors" title="${emp.status === 'active' ? 'تعطيل' : 'تفعيل'}">
                        <i class="fas fa-${emp.status === 'active' ? 'lock' : 'unlock'}"></i>
                    </button>
                    <button onclick="deleteEmployeeUI(${emp.id})" class="px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 transition-colors" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ==================== RENDER MY REVENUE (EMPLOYEE) ====================

function renderMyRevenue() {
    const user = getCurrentUser();
    if (!user) return;

    const revenue = getEmployeeRevenue(user.id);

    document.getElementById('emp-car-count').textContent = revenue.carCount;
    document.getElementById('emp-revenue').textContent = revenue.todayRevenue;

    const tbody = document.getElementById('emp-operations-body');
    if (revenue.lastOperations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-textMuted">لا توجد عمليات بعد</td></tr>';
        return;
    }

    tbody.innerHTML = revenue.lastOperations.map((op, idx) => `
        <tr class="border-b border-gray-200 hover:bg-gray-50">
            <td class="py-3 px-4 text-sm text-textMain font-semibold">البطاقة ${op.cardId}</td>
            <td class="py-3 px-4 text-sm text-textMuted">${new Date(op.time).toLocaleTimeString('ar-SY')}</td>
            <td class="py-3 px-4 text-sm text-textMuted">${op.hours} ساعة</td>
            <td class="py-3 px-4 text-sm font-bold text-gold">${op.amount} ل.س</td>
        </tr>
    `).join('');
}

// ==================== RENDER ALL REVENUES (ACCOUNTANT) ====================

function renderAllRevenuesTable() {
    const tbody = document.getElementById('revenues-body');
    const revenues = getAllEmployeeRevenues();
    const employees = getAllEmployees();

    const employeeRevenues = employees.map(emp => ({
        ...emp,
        revenue: revenues[emp.id] || { todayRevenue: 0, carCount: 0, lastOperations: [] }
    })).sort((a, b) => b.revenue.todayRevenue - a.revenue.todayRevenue);

    if (employeeRevenues.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-textMuted">لا توجد بيانات</td></tr>';
        return;
    }

    const roleNames = {
        general_manager: 'مدير عام',
        employee: 'موظف',
        accountant: 'محاسب'
    };

    tbody.innerHTML = employeeRevenues.map(emp => `
        <tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors">
            <td class="py-3 px-4 text-sm text-textMain font-semibold">${emp.name}</td>
            <td class="py-3 px-4 text-sm"><span class="text-xs font-bold">${roleNames[emp.role]}</span></td>
            <td class="py-3 px-4 text-sm text-center font-bold text-primary">${emp.revenue.carCount}</td>
            <td class="py-3 px-4 text-sm text-right font-bold text-gold text-lg">${emp.revenue.todayRevenue} ل.س</td>
            <td class="py-3 px-4 text-sm">
                <button onclick="openSettleModal(${emp.id})" class="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-all" ${emp.revenue.todayRevenue === 0 ? 'disabled opacity-50' : ''}>
                    <i class="fas fa-check-circle ml-1"></i> تصفية
                </button>
            </td>
        </tr>
    `).join('');
}

// ==================== EXPORT TO EXCEL ====================

function exportEmployeeRevenues() {
    const revenues = getAllEmployeeRevenues();
    const employees = getAllEmployees();

    let csv = 'اسم الموظف,عدد السيارات,الإيراد الحالي\n';
    
    employees.forEach(emp => {
        const revenue = revenues[emp.id] || { todayRevenue: 0, carCount: 0 };
        csv += `${emp.name},${revenue.carCount},${revenue.todayRevenue}\n`;
    });

    downloadCSV(csv, 'employee-revenues.csv');
}

function downloadCSV(csv, filename) {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// ==================== RENDER ALL TABS FOR CURRENT USER ====================

function renderAllUserTabs() {
    const user = getCurrentUser();
    if (!user) return;

    // Render based on role
    if (user.role === 'employee') {
        renderMyRevenue();
    } else if (user.role === 'accountant') {
        renderAllRevenuesTable();
    } else if (user.role === 'general_manager') {
        renderEmployeesTable();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderAllUserTabs, 500);
});
