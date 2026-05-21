// ==================== STATE MANAGEMENT ====================
// js/state.js — إدارة الحالة والتخزين المحلي

const STORAGE_KEYS = {
    CARDS: 'cec_cards',
    SESSIONS: 'cec_sessions',
    SETTINGS: 'cec_settings',
    STATS: 'cec_stats'
};

let html5QrCode = null;
let activeSessions = [];
let allSessions = [];
let cards = [];
let settings = { pricePerHour: 100, cooldownSeconds: 30 };
let stats = { todayRevenue: 0, todaySessions: 0 };
let currentReceipt = null;
let currentCameraFacing = "environment";
let soundEnabled = localStorage.getItem('cec_sound_enabled') !== 'false';
let lastScannedBarcode = null;
let lastScannedTime = 0;

// ==================== LOAD / SAVE ====================

function loadData() {
    const savedCards    = localStorage.getItem(STORAGE_KEYS.CARDS);
    const savedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const savedStats    = localStorage.getItem(STORAGE_KEYS.STATS);

    if (savedCards)    cards    = JSON.parse(savedCards);
    if (savedSessions) allSessions = JSON.parse(savedSessions);
    if (savedSettings) settings = JSON.parse(savedSettings);
    if (savedStats)    stats    = JSON.parse(savedStats);

    activeSessions = allSessions.filter(s => s.status === 'active');

    document.getElementById('price-per-hour').value  = settings.pricePerHour  || 100;
    document.getElementById('cooldown-slider').value = settings.cooldownSeconds || 30;
    updateCooldownDisplay();
    updatePriceOldDisplay();

    // إعدادات المزامنة السحابية
    document.getElementById('auto-sync-toggle').checked = CLOUD_CONFIG.AUTO_SYNC;
    document.getElementById('sync-interval').value      = CLOUD_CONFIG.SYNC_INTERVAL_MINUTES || 5;
}

function saveAllData() {
    saveCards();
    saveSessions();
    saveSettings();
    saveStats();
}

function saveCards()    { localStorage.setItem(STORAGE_KEYS.CARDS,    JSON.stringify(cards)); }
function saveSessions() { localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(allSessions)); }
function saveSettings() { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }
function saveStats()    { localStorage.setItem(STORAGE_KEYS.STATS,    JSON.stringify(stats)); }

// ==================== CARDS INIT ====================

function initCards() {
    if (cards.length === 0) {
        cards = [];
        for (let i = 1; i <= 50; i++) {
            cards.push({
                id: i,
                number: String(i).padStart(2, '0'),
                barcode: 'CARD' + String(i).padStart(3, '0'),
                status: 'available',
                lastUsed: null,
                cooldownEnd: null
            });
        }
        saveCards();
    }
}

// ==================== FIND CARD ====================

function findCardByBarcode(barcode) {
    barcode = barcode.trim().toUpperCase();
    let card = cards.find(c => c.barcode === barcode);
    if (card) return card;
    card = cards.find(c => c.number === barcode || c.id.toString() === barcode);
    if (card) return card;
    card = cards.find(c => barcode.includes(c.barcode) || c.barcode.includes(barcode));
    if (card) return card;
    const num = parseInt(barcode);
    if (num >= 1 && num <= 50) return cards.find(c => c.id === num);
    return null;
}

// ==================== RESET ====================

function showResetModal() {
    const modal = document.getElementById('reset-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
function closeResetModal() {
    const modal = document.getElementById('reset-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
function confirmReset() {
    localStorage.removeItem(STORAGE_KEYS.CARDS);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    cards = []; allSessions = []; activeSessions = [];
    stats    = { todayRevenue: 0, todaySessions: 0 };
    settings = { pricePerHour: 100, cooldownSeconds: 30 };
    initCards();
    document.getElementById('price-per-hour').value  = 100;
    document.getElementById('cooldown-slider').value = 30;
    updateCooldownDisplay(); updatePriceOldDisplay();
    renderAll(); closeResetModal();
    syncToCloud();
    showToast('تم إعادة تعيين جميع البيانات', 'success');
}
