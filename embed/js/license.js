/**
 * QR Scanner v7.25 - License Module
 * 
 * Chứa tất cả logic:
 * - Check premium status
 * - Activate license (local + API)
 * - Handle expiry & grace period
 * - Daily limit checking
 * 
 * Depends on: config.js, storage.js
 */

var QRLicense = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    var STORAGE = QRStorage;
    
    // License state
    var state = {
        isPremium: false,
        licenseKey: null,
        expiresAt: null,
        daysRemaining: 0,
        todayUsed: 0,
        todayDate: null
    };
    
    // Callbacks
    var callbacks = {
        onStatusChange: null,
        onRenewalWarning: null,
        onLimitReached: null,
        onGraceExpired: null
    };
    
    // ==================== Premium Status ====================
    
    /**
     * Check and update premium status
     * @returns {boolean} - Is premium active
     */
    function checkPremiumStatus() {
        try {
            var license = STORAGE.loadLicense();
            
            if (license && license.expiresAt) {
                var now = new Date();
                var expires = new Date(license.expiresAt);
                
                if (now < expires) {
                    // Premium active
                    state.isPremium = true;
                    state.licenseKey = license.licenseKey;
                    state.expiresAt = license.expiresAt;
                    state.daysRemaining = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
                    
                    // Clear grace period if exists
                    STORAGE.clearGracePeriod();
                    
                    // Warn if expiring soon
                    if (state.daysRemaining <= CONFIG.LIMITS.RENEWAL_WARNING_DAYS) {
                        triggerCallback('onRenewalWarning', state.daysRemaining);
                    }
                    
                    console.log('✅ Premium active: ' + state.daysRemaining + ' days');
                    return true;
                } else {
                    // Premium expired
                    handlePremiumExpired(license.expiresAt);
                }
            }
        } catch (e) {
            console.error('[License] Check error:', e);
        }
        
        state.isPremium = false;
        state.licenseKey = null;
        state.daysRemaining = 0;
        return false;
    }
    
    /**
     * Handle premium expiration
     * @param {string} expiredAt - When license expired
     */
    function handlePremiumExpired(expiredAt) {
        var graceData = STORAGE.getGracePeriod();
        var now = new Date();
        
        if (!graceData) {
            // Start grace period
            STORAGE.setGracePeriod(expiredAt);
            STORAGE.clearLicense();
            
            console.log('⚠️ Premium expired! Grace period started (24h)');
            triggerCallback('onRenewalWarning', 0);
        } else {
            var graceEnd = new Date(graceData.graceEndAt);
            
            if (now >= graceEnd) {
                // Grace period ended - clear all data
                STORAGE.clearOrders();
                STORAGE.clearGracePeriod();
                STORAGE.clearLicense();
                
                console.log('❌ Grace period ended - data cleared');
                triggerCallback('onGraceExpired');
            } else {
                // Still in grace period
                var hoursLeft = Math.ceil((graceEnd - now) / (1000 * 60 * 60));
                console.log('⏳ Grace period: ' + hoursLeft + 'h left');
                triggerCallback('onRenewalWarning', -1);
            }
        }
        
        state.isPremium = false;
    }
    
    // ==================== License Activation ====================
    
    /**
     * Activate license locally (from parent message)
     * @param {object} licenseData - { licenseKey, expiresAt, daysRemaining }
     */
    function activateLocal(licenseData) {
        if (!licenseData || !licenseData.licenseKey) {
            console.error('[License] Invalid license data');
            return false;
        }
        
        // Save to storage
        STORAGE.saveLicense({
            licenseKey: licenseData.licenseKey,
            expiresAt: licenseData.expiresAt,
            activatedAt: new Date().toISOString()
        });
        
        // Clear grace period
        STORAGE.clearGracePeriod();
        
        // Update state
        var now = new Date();
        var expires = new Date(licenseData.expiresAt);
        
        state.isPremium = true;
        state.licenseKey = licenseData.licenseKey;
        state.expiresAt = licenseData.expiresAt;
        state.daysRemaining = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
        
        console.log('✅ License activated locally: ' + state.daysRemaining + ' days');
        triggerCallback('onStatusChange', state);
        
        return true;
    }
    
    /**
     * Activate license via API
     * @param {string} licenseKey - License key to activate
     * @returns {Promise<object>} - Activation result
     */
    function activateAPI(licenseKey) {
        return new Promise(function(resolve, reject) {
            if (!licenseKey || licenseKey.length < 30) {
                reject(new Error(CONFIG.TEXTS.ERR_INVALID_LICENSE));
                return;
            }
            
            // Check local first
            var savedLicense = STORAGE.loadLicense();
            if (savedLicense && savedLicense.licenseKey) {
                if (savedLicense.licenseKey.toUpperCase() === licenseKey.toUpperCase()) {
                    var now = new Date();
                    var expires = new Date(savedLicense.expiresAt);
                    
                    if (now < expires) {
                        // Already activated locally
                        state.isPremium = true;
                        state.licenseKey = savedLicense.licenseKey;
                        state.expiresAt = savedLicense.expiresAt;
                        state.daysRemaining = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
                        
                        resolve({
                            success: true,
                            isLocal: true,
                            data: {
                                licenseKey: savedLicense.licenseKey,
                                expiresAt: savedLicense.expiresAt,
                                daysRemaining: state.daysRemaining
                            }
                        });
                        return;
                    }
                }
            }
            
            // Call API
            fetch(CONFIG.apiUrl('/api/activate-license'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenseKey: licenseKey.trim().toUpperCase(),
                    visitorId: STORAGE.getVisitorId(),
                    fingerprint: STORAGE.getDeviceFingerprint(),
                    screen: screen.width + 'x' + screen.height,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    // Activation successful
                    STORAGE.saveLicense({
                        licenseKey: data.data.licenseKey,
                        expiresAt: data.data.expiresAt,
                        activatedAt: new Date().toISOString()
                    });
                    
                    STORAGE.clearGracePeriod();
                    
                    state.isPremium = true;
                    state.licenseKey = data.data.licenseKey;
                    state.expiresAt = data.data.expiresAt;
                    state.daysRemaining = data.data.daysRemaining;
                    
                    resolve({ success: true, data: data.data });
                } else {
                    // Check if device mismatch
                    if (data.errorCode === 'DEVICE_MISMATCH') {
                        reject(new Error(CONFIG.TEXTS.ERR_DEVICE_MISMATCH));
                    } else {
                        reject(new Error(data.error || CONFIG.TEXTS.ERR_INVALID_LICENSE));
                    }
                }
            })
            .catch(function(error) {
                reject(new Error(CONFIG.TEXTS.ERR_CONNECTION + ': ' + error.message));
            });
        });
    }
    
    // ==================== Daily Limit ====================
    
    /**
     * Check daily usage limit
     */
    function checkDailyLimit() {
        var daily = STORAGE.getDailyUsage();
        var today = new Date().toISOString().split('T')[0];
        
        if (daily.date === today) {
            state.todayUsed = daily.used;
            state.todayDate = today;
        } else {
            // New day
            state.todayUsed = 0;
            state.todayDate = today;
            
            // Clear orders for free users on new day
            if (!state.isPremium) {
                STORAGE.clearOrders();
            }
            
            STORAGE.resetDailyUsage();
        }
    }
    
    /**
     * Check if can scan more (for free users)
     * @returns {boolean}
     */
    function canScanMore() {
        if (state.isPremium) return true;
        return state.todayUsed < CONFIG.LIMITS.FREE_DAILY_LIMIT;
    }
    
    /**
     * Increment usage count
     */
    function incrementUsage() {
        state.todayUsed = STORAGE.incrementDailyUsage();
        
        if (!state.isPremium && state.todayUsed >= CONFIG.LIMITS.FREE_DAILY_LIMIT) {
            triggerCallback('onLimitReached');
        }
    }
    
    /**
     * Get remaining scans
     * @returns {number|string}
     */
    function getRemainingScans() {
        if (state.isPremium) return CONFIG.TEXTS.STATS_UNLIMITED;
        return Math.max(0, CONFIG.LIMITS.FREE_DAILY_LIMIT - state.todayUsed);
    }
    
    // ==================== Callback Management ====================
    
    /**
     * Set callback
     * @param {string} name - Callback name
     * @param {Function} fn - Callback function
     */
    function on(name, fn) {
        if (callbacks.hasOwnProperty(name)) {
            callbacks[name] = fn;
        }
    }
    
    /**
     * Trigger callback
     * @param {string} name - Callback name
     * @param {*} data - Data to pass
     */
    function triggerCallback(name, data) {
        if (callbacks[name] && typeof callbacks[name] === 'function') {
            callbacks[name](data);
        }
    }
    
    // ==================== Sync with Parent ====================
    
    /**
     * Request license sync from parent window
     */
    function requestSyncFromParent() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ action: 'requestLicense' }, '*');
            console.log('📤 Requested license from parent');
        }
    }
    
    /**
     * Handle message from parent
     * @param {MessageEvent} event
     */
    function handleParentMessage(event) {
        if (!event.data || !event.data.action) return;
        
        if (event.data.action === 'premiumActivated' || event.data.action === 'syncLicense') {
            var licenseData = event.data.license;
            if (licenseData) {
                console.log('📥 Received license from parent');
                activateLocal(licenseData);
            }
        }
    }
    
    // ==================== Initialize ====================
    
    /**
     * Initialize license module
     */
    function init() {
        // Listen for messages from parent
        window.addEventListener('message', handleParentMessage);
        
        // Check premium status
        checkPremiumStatus();
        
        // Check daily limit
        checkDailyLimit();
        
        // Request sync from parent (if in iframe)
        setTimeout(requestSyncFromParent, 500);
        
        console.log('[License] Initialized - Premium: ' + state.isPremium);
    }
    
    // ==================== Public API ====================
    return {
        // State
        getState: function() { return Object.assign({}, state); },
        isPremium: function() { return state.isPremium; },
        getDaysRemaining: function() { return state.daysRemaining; },
        getTodayUsed: function() { return state.todayUsed; },
        
        // Actions
        check: checkPremiumStatus,
        checkDaily: checkDailyLimit,
        activateLocal: activateLocal,
        activateAPI: activateAPI,
        canScanMore: canScanMore,
        incrementUsage: incrementUsage,
        getRemainingScans: getRemainingScans,
        requestSync: requestSyncFromParent,
        
        // Callbacks
        on: on,
        
        // Init
        init: init
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRLicense;
}
