// ==================== APP LOGIC ====================
// js/app.js — منطق التطبيق: المسح، العرض، الواجهة

// ==================== INIT ====================

async function init() {
    // ✅ CHECK AUTHENTICATION — التحقق الحقيقي من المستخدم وليس مجرد flag
    loadUserManagement();
    const currentUserCheck = getCurrentUser();

    if (!currentUserCheck) {
        console.warn('❌ No authenticated user found, redirecting to login');
        sessionStorage.removeItem('cec_current_user');
        sessionStorage.removeItem('is-authenticated');
        localStorage.removeItem('auth-token');
        window.location.href = 'login.html';
        return;
    }

    console.log('✅ User authenticated:', currentUserCheck.name);

    loadData();
    initCards();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateLiveTimers, 1000);
    renderAll();
    setInitialConnectionStatus();
    renderSyncLog();
    updateLastSyncDisplay();
    updateSoundButton();

    if (CLOUD_CONFIG.WEB_APP_URL) {
        await loadCloudDataOnStartup();
        setupAutoSync();
    }
}

// ==================== CLOCK ====================

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('ar-SY');
    document.getElementById('date').textContent  = now.toLocaleDateString('ar-SY');
}

// ==================== TABS ====================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('tab-' + tabId).classList.add('active');

    if (tabId === 'active')       renderActiveSessions();
    if (tabId === 'history')      renderHistory();
    if (tabId === 'settings')     renderCardsGrid();
    if (tabId === 'dashboard')    renderDashboard();
    if (tabId === 'cloud')        { updateLastSyncDisplay(); renderSyncLog(); }
    if (tabId === 'scan')         { document.getElementById('scan-result').classList.add('hidden'); }
    if (tabId === 'my-revenue')   renderMyRevenue();
    if (tabId === 'all-revenues') renderAllRevenuesTable();
    if (tabId === 'employees')    renderEmployeesTable();
}

// ==================== SCAN PROCESSING ====================

async function processScan(barcode) {
    barcode = barcode.trim();
    const now   = new Date();
    const nowMs = now.getTime();
    if (lastScannedBarcode === barcode && nowMs - lastScannedTime < 1200) return;
    lastScannedBarcode = barcode;
    lastScannedTime    = nowMs;

    const card = findCardByBarcode(barcode);
    if (!card) {
        showToast('البطاقة غير موجودة! (' + barcode + ')', 'error');
        showScanResult(null, 'error', barcode);
        return;
    }

    const activeSession = allSessions.find(s => s.cardId === card.id && s.status === 'active');

    // فترة التهدئة
    if (card.cooldownEnd) {
        const cooldownEnd = new Date(card.cooldownEnd);
        if (now < cooldownEnd && !activeSession) {
            const secondsLeft = Math.ceil((cooldownEnd - now) / 1000);
            showToast(`البطاقة في فترة تهدئة! انتظر ${secondsLeft} ثانية`, 'warning');
            return;
        }
    }

    if (activeSession) {
        // ===== خروج =====
        const session = activeSession;
        session.exitTime = now.toISOString();
        session.status   = 'completed';
        session.exitEmployee = getCurrentUser().id;
        session.revenueOwner = getCurrentUser().id;

        const diffMs    = now - new Date(session.entryTime);
        const diffHours = diffMs / (1000 * 60 * 60);
        session.hours    = Math.ceil(diffHours * 2) / 2;
        if (session.hours < 0.5) session.hours = 0.5;

        session.priceNew = session.hours * settings.pricePerHour;
        session.priceOld = session.priceNew * 100;

        addSessionRevenue(session);

        stats.todayRevenue  += session.priceNew;
        stats.todaySessions += 1;

        card.status      = 'cooldown';
        card.lastUsed    = now.toISOString();
        card.cooldownEnd = new Date(now.getTime() + settings.cooldownSeconds * 1000).toISOString();

        activeSessions = activeSessions.filter(s => s.id !== session.id);

        saveAllData();
        await updateSessionInCloud(session.id, {
            exitTime:     session.exitTime,
            hours:        session.hours,
            priceNew:     session.priceNew,
            priceOld:     session.priceOld,
            status:       'completed',
            exitEmployee: session.exitEmployee
        });

        playSaveSound();
        showToast(`خروج: بطاقة #${card.number} | ${session.hours} ساعة | ${session.priceNew} ل.س`, 'success');
        showReceipt(session, card);
        showScanResult(card, 'exit', session);
        renderAll();
    } else {
        // ===== دخول =====
        const session = {
            id: Date.now().toString() + '_' + card.id,
            cardId: card.id,
            cardNumber: card.number,
            entryTime: now.toISOString(),
            exitTime: null,
            hours: 0, priceNew: 0, priceOld: 0,
            status: 'active',
            date: now.toISOString().split('T')[0],
            entryEmployee: getCurrentUser().id,
            exitEmployee: null,
            revenueOwner: null
        };

        allSessions.push(session);
        activeSessions.push(session);

        card.status   = 'active';
        card.lastUsed = now.toISOString();

        playSaveSound();
        saveAllData();
        await syncSessionToCloud(session);

        showToast(`دخول: بطاقة #${card.number}`, 'success');
        showScanResult(card, 'entry');
        renderAll();
    }
}

function processManualEntry() {
    const input = document.getElementById('manual-input');
    const value = input.value.trim();
    if (!value) { showToast('الرجاء إدخال رقم البطاقة', 'warning'); return; }
    playClickSound();
    processScan(value);
    input.value = '';
}

// ==================== SCANNER ====================

function startScanner() {
    const container = document.getElementById('scanner-container');
    container.innerHTML = '<div id="reader" class="w-full h-full"></div><div class="scan-line"></div>';

    html5QrCode = new Html5Qrcode("reader");
    const config = {
        fps: 30,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0,
        supportedScanTypes: ["qr_code"],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    html5QrCode.start(
        { facingMode: currentCameraFacing },
        config,
        (decodedText) => { playClickSound(); processScan(decodedText); },
        (errorMessage) => { if (!errorMessage.includes("No QR code found")) console.log('QR Scan error:', errorMessage); }
    ).then(() => {
        document.getElementById('btn-start-scan').classList.add('hidden');
        document.getElementById('btn-stop-scan').classList.remove('hidden');
        document.getElementById('btn-switch-camera').classList.remove('hidden');
        showToast('الكاميرا تعمل - تأكد من الإضاءة الجيدة والمسافة المناسبة', 'success');
    }).catch(err => {
        showToast('خطأ في تشغيل الكاميرا: ' + err.message, 'error');
        container.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-white/70"><div class="text-center"><i class="fas fa-exclamation-circle text-4xl mb-2 text-accent"></i><p class="text-sm">لا توجد كاميرا متاحة</p></div></div>';
    });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('btn-start-scan').classList.remove('hidden');
            document.getElementById('btn-stop-scan').classList.add('hidden');
            document.getElementById('btn-switch-camera').classList.add('hidden');
            document.getElementById('scanner-container').innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-white/50"><div class="text-center"><i class="fas fa-camera text-4xl mb-2"></i><p class="text-sm">اضغط "تشغيل الكاميرا" للبدء</p></div></div><div class="scan-line"></div>';
        });
    }
}

function switchCamera() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            currentCameraFacing = currentCameraFacing === "environment" ? "user" : "environment";
            startScanner();
        });
    }
}

function testCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => { showToast('الكاميرا متاحة وتعمل', 'success'); stream.getTracks().forEach(t => t.stop()); })
            .catch(err  => showToast('خطأ في الكاميرا: ' + err.message, 'error'));
    } else {
        showToast('الكاميرا غير مدعومة في هذا المتصفح', 'error');
    }
}

function openConsole() {
    alert('افتح Developer Tools بالضغط على F12، ثم اذهب إلى تبويب Console لرؤية الرسائل');
}

// ==================== NUMPAD ====================

function appendNum(num) { document.getElementById('manual-input').value += num; }
function clearNum()     { const i = document.getElementById('manual-input'); i.value = i.value.slice(0, -1); }
function clearAllNum()  { document.getElementById('manual-input').value = ''; }

// ==================== RENDER ====================

function renderAll() {
    initUserManagement();
    renderDashboard();
    renderActiveSessions();
    renderHistory();
    renderCardsGrid();
    updateActiveBadge();
}

function renderDashboard() {
    const activeCount    = activeSessions.length;
    const availableCount = 50 - activeCount;

    document.getElementById('stat-cars').textContent         = activeCount;
    document.getElementById('bar-cars').style.width          = (activeCount / 50 * 100) + '%';
    document.getElementById('stat-revenue-new').textContent  = stats.todayRevenue.toLocaleString() + ' ل.س';
    document.getElementById('stat-revenue-old').textContent  = (stats.todayRevenue * 100).toLocaleString() + ' قديم';
    document.getElementById('stat-sessions').textContent     = stats.todaySessions;
    document.getElementById('stat-available').textContent    = availableCount;
    document.getElementById('bar-available').style.width     = (availableCount / 50 * 100) + '%';

    const today         = new Date().toISOString().split('T')[0];
    const todaySessions = allSessions.filter(s => s.date === today && s.status === 'completed');
    const tbody         = document.getElementById('today-summary-body');

    if (todaySessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-textMuted">لا توجد جلسات اليوم</td></tr>';
    } else {
        tbody.innerHTML = todaySessions.slice(-10).reverse().map(s => `
            <tr class="border-b border-gray-100 session-row">
                <td class="py-3 px-4 font-bold text-primary">#${s.cardNumber}</td>
                <td class="py-3 px-4 text-sm text-textMuted">${formatDate(s.entryTime)}</td>
                <td class="py-3 px-4 text-sm">${formatTime(s.entryTime)}</td>
                <td class="py-3 px-4 text-sm">${formatTime(s.exitTime)}</td>
                <td class="py-3 px-4 text-sm font-semibold">${s.hours} ساعة</td>
                <td class="py-3 px-4 text-sm font-bold text-gold">${s.priceNew.toLocaleString()} ل.س</td>
                <td class="py-3 px-4 text-sm font-bold text-secondary">${s.priceOld.toLocaleString()} ل.س</td>
            </tr>`).join('');
    }
}

function renderActiveSessions() {
    const tbody = document.getElementById('active-sessions-body');
    document.getElementById('active-count').textContent = activeSessions.length;

    if (activeSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-textMuted">لا توجد سيارات بالكراج حالياً</td></tr>';
    } else {
        tbody.innerHTML = activeSessions.map(s => {
            const entry     = new Date(s.entryTime);
            const now       = new Date();
            const diffMins  = Math.floor((now - entry) / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const mins      = diffMins % 60;
            const timeStr   = diffHours > 0 ? `${diffHours}س ${mins}د` : `${mins}د`;
            const roundedHrs = Math.ceil((now - entry) / (1000 * 60 * 60) * 2) / 2;
            const estPrice  = Math.max(roundedHrs, 0.5) * settings.pricePerHour;
            return `
                <tr class="border-b border-gray-100 session-row">
                    <td class="py-3 px-4 font-bold text-primary">#${s.cardNumber}</td>
                    <td class="py-3 px-4 text-sm text-textMuted">${formatDate(s.entryTime)}</td>
                    <td class="py-3 px-4 text-sm">${formatTime(s.entryTime)}</td>
                    <td class="py-3 px-4 text-sm font-semibold timer-live text-accent">${timeStr}</td>
                    <td class="py-3 px-4 text-sm font-bold text-gold">~${estPrice.toLocaleString()} ل.س</td>
                    <td class="py-3 px-4">
                        <button onclick="forceExit('${s.id}')" class="btn-accent px-3 py-1.5 rounded-lg text-xs font-semibold">
                            <i class="fas fa-sign-out-alt ml-1"></i> خروج
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    const cooldownCards = cards.filter(c => c.status === 'cooldown');
    const cooldownGrid  = document.getElementById('cooldown-grid');
    if (cooldownCards.length === 0) {
        cooldownGrid.innerHTML = '<p class="col-span-full text-center py-4 text-textMuted text-sm">لا توجد بطاقات في فترة التهدئة</p>';
    } else {
        cooldownGrid.innerHTML = cooldownCards.map(c => {
            const secondsLeft = Math.max(0, Math.ceil((new Date(c.cooldownEnd) - new Date()) / 1000));
            return `<div class="card-badge active glass-card rounded-lg p-2 text-center" style="border: 1px solid rgba(230, 57, 70, 0.3);">
                <span class="text-xs font-bold text-accent block">#${c.number}</span>
                <span class="text-[10px] text-muted">${secondsLeft}ث</span>
            </div>`;
        }).join('');
    }
}

function updateLiveTimers() {
    renderActiveSessions();
    const now   = new Date();
    let changed = false;
    cards.forEach(c => {
        if (c.cooldownEnd && now >= new Date(c.cooldownEnd)) {
            c.cooldownEnd = null;
            if (c.status === 'cooldown') c.status = 'available';
            changed = true;
        }
    });
    if (changed) { saveCards(); renderCardsGrid(); }
}

function renderHistory(filter = 'all') {
    let sessions = [...allSessions].reverse();
    const today  = new Date().toISOString().split('T')[0];

    if (filter === 'today') sessions = sessions.filter(s => s.date === today);
    else if (filter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        sessions = sessions.filter(s => new Date(s.entryTime) >= weekAgo);
    }

    const tbody = document.getElementById('history-body');
    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-textMuted">لا توجد جلسات</td></tr>';
    } else {
        tbody.innerHTML = sessions.map((s, i) => `
            <tr class="border-b border-gray-100 session-row ${s.status === 'active' ? 'bg-green-50/50' : ''}">
                <td class="py-3 px-4 text-sm text-muted">${sessions.length - i}</td>
                <td class="py-3 px-4 font-bold text-primary">#${s.cardNumber}</td>
                <td class="py-3 px-4 text-sm text-textMuted">${formatDate(s.entryTime)}</td>
                <td class="py-3 px-4 text-sm">${formatTime(s.entryTime)}</td>
                <td class="py-3 px-4 text-sm">${s.exitTime ? formatTime(s.exitTime) : '<span class="text-green-600 font-semibold">نشطة</span>'}</td>
                <td class="py-3 px-4 text-sm text-textMuted">${getEmployeeName(s.entryEmployee)}</td>
                <td class="py-3 px-4 text-sm font-semibold">${s.hours > 0 ? s.hours + ' ساعة' : '-'}</td>
                <td class="py-3 px-4 text-sm font-bold text-gold">${s.priceNew > 0 ? s.priceNew.toLocaleString() : '-'}</td>
                <td class="py-3 px-4 text-sm font-bold text-secondary">${s.priceOld > 0 ? s.priceOld.toLocaleString() : '-'}</td>
            </tr>`).join('');
    }
}

function filterHistory(type) {
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-primary', 'text-white');
        b.classList.add('bg-white/80', 'text-textMain');
    });
    document.getElementById('filter-' + type).classList.remove('bg-white/80', 'text-textMain');
    document.getElementById('filter-' + type).classList.add('bg-primary', 'text-white');
    renderHistory(type);
}

function renderCardsGrid() {
    const grid = document.getElementById('cards-grid');
    grid.innerHTML = cards.map(c => {
        let bgClass, icon;
        if (c.status === 'available')      { bgClass = 'bg-green-50 border-green-200 text-green-700'; icon = '<i class="fas fa-check text-xs"></i>'; }
        else if (c.status === 'active')    { bgClass = 'bg-red-50 border-red-200 text-red-700'; icon = '<i class="fas fa-car text-xs"></i>'; }
        else                               { bgClass = 'bg-yellow-50 border-yellow-200 text-yellow-700'; icon = '<i class="fas fa-clock text-xs"></i>'; }
        return `<div class="glass-card rounded-xl p-2 text-center ${bgClass} border cursor-pointer hover:scale-105 transition-transform" onclick="showCardInfo(${c.id})">
            <span class="text-xs font-bold block">#${c.number}</span>
            <span class="text-[10px] block mt-1">${icon}</span>
        </div>`;
    }).join('');
}

function updateActiveBadge() {
    const badge = document.getElementById('active-badge');
    if (activeSessions.length > 0) {
        badge.textContent = activeSessions.length;
        badge.classList.remove('hidden');
    } else { badge.classList.add('hidden'); }
}

// ==================== SCAN RESULT / RECEIPT ====================

function showScanResult(card, type, extra = null) {
    const resultDiv  = document.getElementById('scan-result');
    const contentDiv = document.getElementById('scan-result-content');
    resultDiv.classList.remove('hidden');

    if (type === 'error') {
        const barcodeText = extra ? `<p class="text-sm text-muted mt-2">النص المقروء: ${extra}</p>` : '';
        contentDiv.innerHTML = '<div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3"><i class="fas fa-times text-red-600 text-2xl"></i></div><h3 class="text-lg font-bold text-red-600">البطاقة غير موجودة</h3>' + barcodeText;
    } else if (type === 'entry') {
        contentDiv.innerHTML = `<div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3 animate-bounce-soft"><i class="fas fa-sign-in-alt text-green-600 text-2xl"></i></div><h3 class="text-lg font-bold text-green-600">تم تسجيل الدخول</h3><p class="text-lg font-bold text-primary mt-2">${formatTime(new Date())}</p>`;
    } else if (type === 'exit') {
        const session = extra;
        contentDiv.innerHTML = `<div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3"><i class="fas fa-sign-out-alt text-blue-600 text-2xl"></i></div><h3 class="text-lg font-bold text-blue-600">تم تسجيل الخروج</h3><div class="mt-3 space-y-1"><p class="text-sm">المدة: <span class="font-bold text-primary">${session.hours} ساعة</span></p><p class="text-sm">السعر الجديد: <span class="font-bold text-gold">${session.priceNew.toLocaleString()} ل.س</span></p></div>`;
    }
}

function showReceipt(session, card) {
    currentReceipt = session;
    document.getElementById('receipt-card').textContent      = '#' + card.number;
    document.getElementById('receipt-entry').textContent     = formatDate(session.entryTime) + ' ' + formatTime(session.entryTime);
    document.getElementById('receipt-exit').textContent      = formatDate(session.exitTime)  + ' ' + formatTime(session.exitTime);
    document.getElementById('receipt-hours').textContent     = session.hours + ' ساعة';
    document.getElementById('receipt-price-new').textContent = session.priceNew.toLocaleString() + ' ل.س';
    document.getElementById('receipt-price-old').textContent = session.priceOld.toLocaleString() + ' ل.س';
    const modal = document.getElementById('receipt-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeReceipt() {
    document.getElementById('receipt-modal').classList.add('hidden');
    document.getElementById('receipt-modal').classList.remove('flex');
}

function printReceipt() { window.print(); }

async function forceExit(sessionId) {
    const session = activeSessions.find(s => s.id === sessionId);
    if (!session) return;
    const card = cards.find(c => c.id === session.cardId);
    if (!card) return;

    if (!confirm(`هل تريد تسجيل خروج البطاقة #${card.number} قسراً؟`)) return;

    const now = new Date();
    session.exitTime     = now.toISOString();
    session.status       = 'completed';
    session.exitEmployee = getCurrentUser().id;
    session.revenueOwner = getCurrentUser().id;

    const diffMs     = now - new Date(session.entryTime);
    session.hours    = Math.ceil(diffMs / (1000 * 60 * 60) * 2) / 2;
    if (session.hours < 0.5) session.hours = 0.5;
    session.priceNew = session.hours * settings.pricePerHour;
    session.priceOld = session.priceNew * 100;

    addSessionRevenue(session);

    stats.todayRevenue  += session.priceNew;
    stats.todaySessions += 1;

    card.status      = 'cooldown';
    card.lastUsed    = now.toISOString();
    card.cooldownEnd = new Date(now.getTime() + settings.cooldownSeconds * 1000).toISOString();
    activeSessions   = activeSessions.filter(s => s.id !== sessionId);

    playSaveSound();
    saveAllData();
    await updateSessionInCloud(session.id, {
        exitTime:     session.exitTime,
        hours:        session.hours,
        priceNew:     session.priceNew,
        priceOld:     session.priceOld,
        status:       'completed',
        exitEmployee: session.exitEmployee
    });
    showReceipt(session, card);
    renderAll();
    showToast('تم تسجيل الخروج يدوياً', 'success');
}

// ==================== SETTINGS ====================

function updateSettings() {
    const price    = parseInt(document.getElementById('price-per-hour').value) || 100;
    const cooldown = parseInt(document.getElementById('cooldown-slider').value) || 30;
    settings.pricePerHour    = price;
    settings.cooldownSeconds = cooldown;
    saveSettings();
    updatePriceOldDisplay();
    showToast('تم حفظ الإعدادات', 'success');
    syncToCloud();
}

function updateCooldownDisplay() {
    const val = document.getElementById('cooldown-slider').value;
    document.getElementById('cooldown-display').textContent = val;
}

function updatePriceOldDisplay() {
    const price = parseInt(document.getElementById('price-per-hour').value) || 0;
    document.getElementById('price-old-display').textContent = (price * 100).toLocaleString();
}

function showCardInfo(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    let msg = `بطاقة #${card.number}\nالحالة: `;
    if (card.status === 'available')   msg += 'متاحة';
    else if (card.status === 'active') msg += 'نشطة (بالكراج)';
    else                               msg += 'فترة تهدئة';
    if (card.lastUsed) msg += `\nآخر استخدام: ${formatDate(card.lastUsed)} ${formatTime(card.lastUsed)}`;
    showToast(msg, 'success');
}

// ==================== EXPORT / IMPORT ====================

function exportToJSON() {
    const data = { cards, sessions: allSessions, settings, stats, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `cec_garage_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('تم تصدير البيانات بنجاح', 'success');
}

function importFromJSON(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.cards)    cards       = data.cards;
            if (data.sessions) allSessions = data.sessions;
            if (data.settings) settings    = data.settings;
            if (data.stats)    stats       = data.stats;
            activeSessions = allSessions.filter(s => s.status === 'active');
            saveAllData();
            document.getElementById('price-per-hour').value  = settings.pricePerHour;
            document.getElementById('cooldown-slider').value = settings.cooldownSeconds;
            updateCooldownDisplay(); updatePriceOldDisplay();
            renderAll(); syncToCloud();
            showToast('تم استيراد البيانات بنجاح', 'success');
        } catch { showToast('خطأ في قراءة الملف', 'error'); }
    };
    reader.readAsText(file); input.value = '';
}

function exportToExcel() {
    const data = allSessions.map((s, i) => ({
        'رقم':                i + 1,
        'رقم البطاقة':        s.cardNumber,
        'الحالة':             s.status === 'active' ? 'نشطة' : 'مكتملة',
        'تاريخ الدخول':       formatDate(s.entryTime),
        'وقت الدخول':         formatTime(s.entryTime),
        'موظف الدخول':        getEmployeeName(s.entryEmployee),
        'وقت الخروج':         s.exitTime ? formatTime(s.exitTime) : '-',
        'موظف الخروج':        getEmployeeName(s.exitEmployee),
        'عدد الساعات':        s.hours || '-',
        'السعر (ل.س جديد)':   s.priceNew || '-',
        'السعر (ل.س قديم)':   s.priceOld || '-'
    }));
    if (data.length === 0) { showToast('لا توجد بيانات للتصدير', 'warning'); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جلسات الكراج');
    XLSX.writeFile(wb, `cec_garage_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير Excel بنجاح', 'success');
}

// ==================== UTILITIES ====================

/**
 * يرجع التاريخ فقط بدون الوقت
 * مثال: ٢٢/٠٥/٢٠٢٦
 */
function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('ar-SY', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
}

/**
 * يرجع الوقت فقط بدون التاريخ
 * مثال: ١٤:٣٥:٢٢
 */
function formatTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('ar-SY', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

/**
 * يرجع التاريخ والوقت معاً — يُستخدم في الإيصال فقط
 */
function formatDateTime(iso) {
    if (!iso) return '-';
    return `${formatDate(iso)} ${formatTime(iso)}`;
}

function playAudio(id) {
    if (!soundEnabled) return;
    try { const a = document.getElementById(id); if (!a) return; a.currentTime = 0; a.play().catch(() => {}); }
    catch (err) { console.warn('Audio play failed', err); }
}

function playClickSound() { playAudio('sound-click'); }
function playSaveSound()  { playAudio('sound-save');  }

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('cec_sound_enabled', soundEnabled);
    updateSoundButton();
    showToast(soundEnabled ? 'تم تفعيل الصوت' : 'تم إيقاف الصوت', 'success');
}

function updateSoundButton() {
    const icon = document.getElementById('sound-icon');
    const btn  = document.getElementById('btn-sound-toggle');
    if (!icon || !btn) return;
    if (soundEnabled) {
        icon.className = 'fas fa-volume-up text-gold text-sm';
        btn.title = 'إيقاف الصوت';
    } else {
        icon.className = 'fas fa-volume-mute text-red-500 text-sm';
        btn.title = 'تشغيل الصوت';
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon  = document.getElementById('toast-icon');
    document.getElementById('toast-message').textContent = message;
    icon.className = type === 'success' ? 'fas fa-check-circle text-gold'
                   : type === 'error'   ? 'fas fa-times-circle text-red-400'
                   : 'fas fa-exclamation-triangle text-yellow-400';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==================== KEYBOARD SHORTCUT ====================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'manual-input') processManualEntry();
});

document.addEventListener('DOMContentLoaded', init);
