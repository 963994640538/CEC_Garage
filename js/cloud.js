// ==================== GOOGLE SHEETS INTEGRATION ====================
// js/cloud.js — المزامنة مع Google Sheets

const CLOUD_CONFIG = {
    WEB_APP_URL: localStorage.getItem('cec_web_app_url') || '',
    AUTO_SYNC: localStorage.getItem('cec_auto_sync') !== 'false',
    SYNC_INTERVAL_MINUTES: parseInt(localStorage.getItem('cec_sync_interval')) || 5,
    LAST_SYNC: localStorage.getItem('cec_last_sync') || '',
    SYNC_LOG: JSON.parse(localStorage.getItem('cec_sync_log') || '[]')
};

let syncTimer = null;

// ==================== SET WEB APP URL ====================

function setWebAppUrl(url) {
    if (!url || !url.startsWith('https://')) {
        console.error('❌ رابط غير صحيح. يجب أن يبدأ بـ https://');
        alert('رابط غير صحيح. يجب أن يبدأ بـ https://');
        return false;
    }
    
    CLOUD_CONFIG.WEB_APP_URL = url.trim();
    saveCloudConfig();
    setInitialConnectionStatus();
    
    console.log('✅ تم حفظ رابط جوجل شيت:', url);
    console.log('📋 سيتم استخدام هذا الرابط لجميع العمليات');
    
    addSyncLogEntry('info', 'تم ربط رابط جوجل شيت الجديد');
    
    // Update UI if exists
    const urlInput = document.getElementById('web-app-url');
    if (urlInput) urlInput.value = url;
    
    return true;
}

function getWebAppUrl() {
    return CLOUD_CONFIG.WEB_APP_URL;
}

function saveCloudConfig() {
    localStorage.setItem('cec_web_app_url',    CLOUD_CONFIG.WEB_APP_URL);
    localStorage.setItem('cec_auto_sync',      CLOUD_CONFIG.AUTO_SYNC);
    localStorage.setItem('cec_sync_interval',  CLOUD_CONFIG.SYNC_INTERVAL_MINUTES);
    localStorage.setItem('cec_last_sync',      CLOUD_CONFIG.LAST_SYNC);
    localStorage.setItem('cec_sync_log',       JSON.stringify(CLOUD_CONFIG.SYNC_LOG.slice(-50)));
}

// ==================== SYNC LOG ====================

function addSyncLogEntry(type, message) {
    CLOUD_CONFIG.SYNC_LOG.push({
        time: new Date().toISOString(),
        type: type,
        message: message
    });
    CLOUD_CONFIG.LAST_SYNC = new Date().toISOString();
    saveCloudConfig();
    renderSyncLog();
}

function renderSyncLog() {
    const container = document.getElementById('sync-log');
    if (!container) return;
    if (CLOUD_CONFIG.SYNC_LOG.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-textMuted"><i class="fas fa-cloud-upload-alt text-4xl mb-2 text-muted"></i><p class="text-sm">لا توجد عمليات مزامنة بعد</p></div>';
        return;
    }
    container.innerHTML = CLOUD_CONFIG.SYNC_LOG.slice().reverse().slice(0, 30).map(entry => {
        let icon, color;
        if (entry.type === 'success') { icon = 'fa-check-circle'; color = 'text-success'; }
        else if (entry.type === 'error') { icon = 'fa-times-circle'; color = 'text-red-500'; }
        else { icon = 'fa-info-circle'; color = 'text-info'; }
        const time = new Date(entry.time).toLocaleString('ar-SY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `
            <div class="flex items-center gap-3 p-3 rounded-lg bg-white/50 border border-gray-100">
                <i class="fas ${icon} ${color} text-sm"></i>
                <span class="text-sm flex-1">${entry.message}</span>
                <span class="text-xs text-muted whitespace-nowrap">${time}</span>
            </div>`;
    }).join('');
}

function clearSyncLog() {
    CLOUD_CONFIG.SYNC_LOG = [];
    saveCloudConfig();
    renderSyncLog();
}

function updateLastSyncDisplay() {
    const el = document.getElementById('last-sync-time');
    if (!el) return;
    if (CLOUD_CONFIG.LAST_SYNC) {
        const time = new Date(CLOUD_CONFIG.LAST_SYNC).toLocaleString('ar-SY', { hour: '2-digit', minute: '2-digit' });
        el.textContent = time;
    } else {
        el.textContent = 'لم تتم بعد';
    }
}

// ==================== CONNECTION STATUS ====================

function setConnectionStatus(status) {
    const dot  = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (!dot || !text) return;
    dot.className = 'connection-dot';
    if (status === 'online') {
        dot.classList.add('online');
        text.textContent = 'متصل';
        text.className = 'text-sm font-semibold text-success';
    } else if (status === 'offline') {
        dot.classList.add('offline');
        text.textContent = 'غير متصل';
        text.className = 'text-sm font-semibold text-red-500';
    } else if (status === 'syncing') {
        dot.classList.add('syncing');
        text.textContent = 'جاري المزامنة';
        text.className = 'text-sm font-semibold text-warning';
    }
}

function setInitialConnectionStatus() {
    setConnectionStatus(CLOUD_CONFIG.WEB_APP_URL ? 'online' : 'offline');
}

// ==================== SYNC PROGRESS BAR ====================

function showSyncProgress(visible) {
    const bar = document.getElementById('sync-progress');
    if (!bar) return;
    if (visible) bar.classList.remove('hidden');
    else         bar.classList.add('hidden');
}

// ==================== SEND / LOAD ====================

async function sendToCloud(data) {
    if (!CLOUD_CONFIG.WEB_APP_URL) return { success: false, error: 'لم يتم ربط جوجل شيت' };
    showSyncProgress(true);
    setConnectionStatus('syncing');
    try {
        // Google Apps Script يتطلب text/plain لتجنب CORS preflight
        const res = await fetch(CLOUD_CONFIG.WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(data)
        });
        showSyncProgress(false);
        if (res.ok) {
            setConnectionStatus('online');
            return { success: true };
        } else {
            setConnectionStatus('offline');
            return { success: false, error: 'HTTP ' + res.status };
        }
    } catch (err) {
        showSyncProgress(false);
        setConnectionStatus('offline');
        return { success: false, error: err.message };
    }
}

async function loadFromCloud() {
    if (!CLOUD_CONFIG.WEB_APP_URL) return { success: false };
    try {
        const res = await fetch(CLOUD_CONFIG.WEB_APP_URL + '?action=loadAll&t=' + Date.now());
        if (!res.ok) return { success: false };
        const data = await res.json();
        return data;
    } catch {
        return { success: false };
    }
}

// ==================== HIGH-LEVEL SYNC HELPERS ====================

async function syncToCloud() {
    const result = await sendToCloud({
        action: 'saveAll',
        sessions: allSessions,
        cards: cards,
        settings: settings,
        stats: stats
    });
    if (result.success) {
        addSyncLogEntry('success', 'تمت المزامنة بنجاح');
    } else {
        addSyncLogEntry('error', 'فشلت المزامنة: ' + (result.error || 'خطأ غير معروف'));
    }
    updateLastSyncDisplay();
}

async function syncSessionToCloud(session) {
    if (!CLOUD_CONFIG.WEB_APP_URL) return;
    await sendToCloud({ action: 'appendSession', session });
    // Also sync cards state
    await sendToCloud({ action: 'saveCards', cards });
}

async function updateSessionInCloud(sessionId, updates) {
    if (!CLOUD_CONFIG.WEB_APP_URL) return;
    await sendToCloud({ action: 'updateSession', sessionId, updates });
    await sendToCloud({ action: 'saveCards', cards });
}

// ==================== LOAD ON STARTUP ====================

async function loadCloudDataOnStartup() {
    const result = await loadFromCloud();
    if (!result.success || !result.data) return;
    if (result.data.sessions) {
        allSessions    = result.data.sessions;
        activeSessions = allSessions.filter(s => s.status === 'active');
        saveSessions();
    }
    if (result.data.cards) { cards = result.data.cards; saveCards(); }
    if (result.data.settings) {
        settings.pricePerHour   = parseInt(result.data.settings.pricePerHour)   || settings.pricePerHour;
        settings.cooldownSeconds = parseInt(result.data.settings.cooldownSeconds) || settings.cooldownSeconds;
        stats.todayRevenue  = parseFloat(result.data.settings.todayRevenue)  || stats.todayRevenue;
        stats.todaySessions = parseInt(result.data.settings.todaySessions)   || stats.todaySessions;
        saveSettings(); saveStats();
    }
    document.getElementById('price-per-hour').value  = settings.pricePerHour;
    document.getElementById('cooldown-slider').value = settings.cooldownSeconds;
    updateCooldownDisplay(); updatePriceOldDisplay();
    renderAll(); updateLastSyncDisplay();
    addSyncLogEntry('success', 'تم تحميل البيانات من Google Sheets عند التشغيل');
}

// ==================== AUTO SYNC ====================

function setupAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    if (CLOUD_CONFIG.AUTO_SYNC && CLOUD_CONFIG.SYNC_INTERVAL_MINUTES > 0 && CLOUD_CONFIG.WEB_APP_URL) {
        syncTimer = setInterval(syncToCloud, CLOUD_CONFIG.SYNC_INTERVAL_MINUTES * 60 * 1000);
    }
}

function toggleAutoSync() {
    CLOUD_CONFIG.AUTO_SYNC = document.getElementById('auto-sync-toggle').checked;
    saveCloudConfig(); setupAutoSync();
    showToast(CLOUD_CONFIG.AUTO_SYNC ? 'تم تفعيل المزامنة التلقائية' : 'تم إيقاف المزامنة التلقائية', 'success');
}

function updateSyncInterval() {
    CLOUD_CONFIG.SYNC_INTERVAL_MINUTES = parseInt(document.getElementById('sync-interval').value);
    saveCloudConfig(); setupAutoSync();
}

async function manualSync() {
    if (!CLOUD_CONFIG.WEB_APP_URL) { openSetupModal(); return; }
    await syncToCloud();
}

// ==================== SETUP MODAL ====================

function openSetupModal() {
    const modal = document.getElementById('setup-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('web-app-url').value = CLOUD_CONFIG.WEB_APP_URL;
    document.getElementById('apps-script-code').textContent = APPS_SCRIPT_TEMPLATE;
}

function closeSetupModal() {
    const modal = document.getElementById('setup-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function copyAppsScript() {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE).then(() => {
        showToast('تم نسخ الكود بنجاح', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = APPS_SCRIPT_TEMPLATE;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('تم نسخ الكود بنجاح', 'success');
    });
}

function copyWebAppUrl() {
    const urlInput = document.getElementById('web-app-url');
    const url = (urlInput.value || CLOUD_CONFIG.WEB_APP_URL || '').trim();
    if (!url) { showToast('لا يوجد رابط للمشاركة', 'warning'); return; }
    navigator.clipboard.writeText(url).then(() => {
        showToast('تم نسخ رابط المشاركة', 'success');
    }).catch(() => { urlInput.select(); document.execCommand('copy'); showToast('تم نسخ الرابط بنجاح', 'success'); });
}

async function testConnection() {
    const url = document.getElementById('web-app-url').value.trim();
    if (!url) { showToast('الرجاء إدخال الرابط', 'warning'); return; }
    CLOUD_CONFIG.WEB_APP_URL = url;
    saveCloudConfig();
    showToast('جاري اختبار الاتصال...', 'info');
    const result = await loadFromCloud();
    if (result.success && result.data) {
        showToast('الاتصال ناجح! جاري تحميل البيانات...', 'success');
        if (result.data.sessions) { allSessions = result.data.sessions; activeSessions = allSessions.filter(s => s.status === 'active'); saveSessions(); }
        if (result.data.cards)    { cards = result.data.cards; saveCards(); }
        if (result.data.settings) {
            settings.pricePerHour   = parseInt(result.data.settings.pricePerHour)   || 100;
            settings.cooldownSeconds = parseInt(result.data.settings.cooldownSeconds) || 30;
            stats.todayRevenue  = parseFloat(result.data.settings.todayRevenue)  || 0;
            stats.todaySessions = parseInt(result.data.settings.todaySessions)   || 0;
            saveSettings(); saveStats();
        }
        document.getElementById('price-per-hour').value  = settings.pricePerHour;
        document.getElementById('cooldown-slider').value = settings.cooldownSeconds;
        updateCooldownDisplay(); updatePriceOldDisplay();
        renderAll(); setupAutoSync(); closeSetupModal();
    } else {
        showToast('تم حفظ الرابط - جرب الإرسال', 'success');
        setConnectionStatus('online');
        closeSetupModal();
    }
}

// ==================== APPS SCRIPT TEMPLATE ====================

const APPS_SCRIPT_TEMPLATE = `// ==================== CEC Garage - Google Apps Script ====================
// انسخ هذا الكود كاملاً في Google Apps Script

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'saveAll')       return response(saveAllData(ss, data));
    if (action === 'appendSession') return response(appendSession(ss, data.session));
    if (action === 'updateSession') return response(updateSession(ss, data.sessionId, data.updates));
    if (action === 'saveSettings')  return response(saveSettingsData(ss, data.settings));
    if (action === 'saveCards')     return response(saveCardsData(ss, data.cards));

    return response({ success: false, message: 'عملية غير معروفة: ' + action });
  } catch (err) {
    return response({ success: false, message: 'خطأ: ' + err.toString() });
  }
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = loadAllData(ss);
    return response({ success: true, data: data });
  } catch (err) {
    return response({ success: false, message: err.toString() });
  }
}

// ==================== SAVE ALL ====================
function saveAllData(ss, data) {
  // Sessions
  const sessSheet = getOrCreateSheet(ss, 'Sessions',
    ['ID','CardNumber','EntryTime','ExitTime','Hours','PriceNew','PriceOld','Status','Date','EntryEmployee','ExitEmployee']);
  sessSheet.clearContents();
  sessSheet.appendRow(['ID','CardNumber','EntryTime','ExitTime','Hours','PriceNew','PriceOld','Status','Date','EntryEmployee','ExitEmployee']);
  if (data.sessions && data.sessions.length > 0) {
    const rows = data.sessions.map(s => [
      s.id, s.cardNumber, s.entryTime, s.exitTime||'',
      s.hours||0, s.priceNew||0, s.priceOld||0, s.status, s.date,
      s.entryEmployee||'', s.exitEmployee||''
    ]);
    sessSheet.getRange(2, 1, rows.length, 11).setValues(rows);
  }

  // Cards
  const cardSheet = getOrCreateSheet(ss, 'Cards',
    ['ID','Number','Barcode','Status','LastUsed','CooldownEnd']);
  cardSheet.clearContents();
  cardSheet.appendRow(['ID','Number','Barcode','Status','LastUsed','CooldownEnd']);
  if (data.cards && data.cards.length > 0) {
    const rows = data.cards.map(c => [
      c.id, c.number, c.barcode, c.status, c.lastUsed||'', c.cooldownEnd||''
    ]);
    cardSheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }

  // Settings
  const setSheet = getOrCreateSheet(ss, 'Settings', ['Key','Value']);
  setSheet.clearContents();
  setSheet.appendRow(['Key','Value']);
  setSheet.appendRow(['pricePerHour',   data.settings ? data.settings.pricePerHour   : 100]);
  setSheet.appendRow(['cooldownSeconds',data.settings ? data.settings.cooldownSeconds : 30]);
  setSheet.appendRow(['todayRevenue',   data.stats    ? data.stats.todayRevenue       : 0]);
  setSheet.appendRow(['todaySessions',  data.stats    ? data.stats.todaySessions      : 0]);
  setSheet.appendRow(['lastSync',       new Date().toISOString()]);

  return { success: true, message: 'تم حفظ جميع البيانات' };
}

// ==================== LOAD ALL ====================
function loadAllData(ss) {
  const result = { sessions: [], cards: [], settings: {} };

  const sessSheet = ss.getSheetByName('Sessions');
  if (sessSheet && sessSheet.getLastRow() > 1) {
    const d = sessSheet.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (!d[i][0]) continue;
      result.sessions.push({
        id: String(d[i][0]), cardNumber: String(d[i][1]),
        entryTime: String(d[i][2]), exitTime: String(d[i][3]),
        hours: Number(d[i][4]), priceNew: Number(d[i][5]),
        priceOld: Number(d[i][6]), status: String(d[i][7]),
        date: String(d[i][8]), entryEmployee: d[i][9]||'', exitEmployee: d[i][10]||''
      });
    }
  }

  const cardSheet = ss.getSheetByName('Cards');
  if (cardSheet && cardSheet.getLastRow() > 1) {
    const d = cardSheet.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (!d[i][0]) continue;
      result.cards.push({
        id: Number(d[i][0]), number: String(d[i][1]),
        barcode: String(d[i][2]), status: String(d[i][3]),
        lastUsed: String(d[i][4]), cooldownEnd: String(d[i][5])
      });
    }
  }

  const setSheet = ss.getSheetByName('Settings');
  if (setSheet && setSheet.getLastRow() > 1) {
    const d = setSheet.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (d[i][0]) result.settings[d[i][0]] = d[i][1];
    }
  }

  return result;
}

// ==================== APPEND SESSION ====================
function appendSession(ss, session) {
  const sheet = getOrCreateSheet(ss, 'Sessions',
    ['ID','CardNumber','EntryTime','ExitTime','Hours','PriceNew','PriceOld','Status','Date','EntryEmployee','ExitEmployee']);
  sheet.appendRow([
    session.id, session.cardNumber, session.entryTime, '',
    0, 0, 0, session.status, session.date,
    session.entryEmployee||'', ''
  ]);
  return { success: true, message: 'تمت إضافة الجلسة' };
}

// ==================== UPDATE SESSION ====================
function updateSession(ss, sessionId, updates) {
  const sheet = ss.getSheetByName('Sessions');
  if (!sheet) return { success: false, message: 'Sheet Sessions غير موجود' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      if (updates.exitTime) sheet.getRange(i+1, 4).setValue(updates.exitTime);
      if (updates.hours !== undefined) sheet.getRange(i+1, 5).setValue(updates.hours);
      if (updates.priceNew !== undefined) sheet.getRange(i+1, 6).setValue(updates.priceNew);
      if (updates.priceOld !== undefined) sheet.getRange(i+1, 7).setValue(updates.priceOld);
      if (updates.status)   sheet.getRange(i+1, 8).setValue(updates.status);
      if (updates.exitEmployee) sheet.getRange(i+1, 11).setValue(updates.exitEmployee);
      return { success: true, message: 'تم تحديث الجلسة' };
    }
  }
  return { success: false, message: 'الجلسة غير موجودة: ' + sessionId };
}

// ==================== SAVE SETTINGS ====================
function saveSettingsData(ss, settings) {
  const sheet = getOrCreateSheet(ss, 'Settings', ['Key','Value']);
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) map[data[i][0]] = i + 1;

  const pairs = {
    pricePerHour: settings.pricePerHour,
    cooldownSeconds: settings.cooldownSeconds
  };
  for (const [key, val] of Object.entries(pairs)) {
    if (map[key]) sheet.getRange(map[key], 2).setValue(val);
    else sheet.appendRow([key, val]);
  }
  return { success: true, message: 'تم حفظ الإعدادات' };
}

// ==================== SAVE CARDS ====================
function saveCardsData(ss, cards) {
  const sheet = getOrCreateSheet(ss, 'Cards',
    ['ID','Number','Barcode','Status','LastUsed','CooldownEnd']);
  sheet.clearContents();
  sheet.appendRow(['ID','Number','Barcode','Status','LastUsed','CooldownEnd']);
  if (cards && cards.length > 0) {
    const rows = cards.map(c => [
      c.id, c.number, c.barcode, c.status, c.lastUsed||'', c.cooldownEnd||''
    ]);
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  return { success: true, message: 'تم حفظ البطاقات' };
}

// ==================== HELPER: Get or Create Sheet ====================
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

// ==================== RESPONSE ====================
function response(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}`
