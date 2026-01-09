/**
 * QR Scanner v7.25 - Storage Module
 * 
 * Chứa tất cả logic:
 * - LocalStorage operations
 * - Cookie backup (cho license)
 * - Data persistence
 * 
 * Depends on: config.js
 */

var QRStorage = (function() {
    'use strict';
    
    var KEYS = QRConfig.STORAGE;
    
    // ==================== Cookie Helpers ====================
    
    /**
     * Set cookie
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {number} days - Expiry in days
     */
    function setCookie(name, value, days) {
        var expires = '';
        if (days) {
            var d = new Date();
            d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + d.toUTCString();
        }
        document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
    }
    
    /**
     * Get cookie
     * @param {string} name - Cookie name
     * @returns {string|null} - Cookie value or null
     */
    function getCookie(name) {
        var nameEQ = name + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i].trim();
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length));
            }
        }
        return null;
    }
    
    /**
     * Delete cookie
     * @param {string} name - Cookie name
     */
    function deleteCookie(name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    
    // ==================== LocalStorage Helpers ====================
    
    /**
     * Safe get from localStorage
     * @param {string} key - Storage key
     * @returns {*} - Parsed value or null
     */
    function get(key) {
        try {
            var value = localStorage.getItem(key);
            if (value) {
                return JSON.parse(value);
            }
        } catch (e) {
            console.warn('[Storage] Get error:', key, e);
        }
        return null;
    }
    
    /**
     * Safe set to localStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} - Success
     */
    function set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('[Storage] Set error:', key, e);
            return false;
        }
    }
    
    /**
     * Remove from localStorage
     * @param {string} key - Storage key
     */
    function remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('[Storage] Remove error:', key, e);
        }
    }
    
    // ==================== License Storage ====================
    
    /**
     * Save license with cookie backup
     * @param {object} licenseData - { licenseKey, expiresAt, activatedAt }
     */
    function saveLicense(licenseData) {
        var jsonStr = JSON.stringify(licenseData);
        
        // Save to localStorage
        try {
            localStorage.setItem(KEYS.LICENSE, jsonStr);
        } catch (e) {
            console.warn('[Storage] License localStorage error:', e);
        }
        
        // Backup to cookie (400 days expiry)
        setCookie(KEYS.LICENSE_COOKIE, jsonStr, 400);
        
        console.log('✅ License saved + cookie backup');
    }
    
    /**
     * Load license with cookie fallback
     * @returns {object|null} - License data or null
     */
    function loadLicense() {
        var licenseStr = null;
        
        // Try localStorage first
        try {
            licenseStr = localStorage.getItem(KEYS.LICENSE);
            if (licenseStr) {
                console.log('📂 License from localStorage');
                return JSON.parse(licenseStr);
            }
        } catch (e) {
            console.warn('[Storage] License localStorage read error:', e);
        }
        
        // Fallback to cookie
        licenseStr = getCookie(KEYS.LICENSE_COOKIE);
        if (licenseStr) {
            console.log('🍪 License restored from cookie!');
            try {
                var license = JSON.parse(licenseStr);
                // Restore to localStorage
                localStorage.setItem(KEYS.LICENSE, licenseStr);
                return license;
            } catch (e) {
                console.warn('[Storage] License cookie parse error:', e);
            }
        }
        
        return null;
    }
    
    /**
     * Clear license from all storage
     */
    function clearLicense() {
        remove(KEYS.LICENSE);
        deleteCookie(KEYS.LICENSE_COOKIE);
        console.log('🗑️ License cleared');
    }
    
    // ==================== Orders Storage ====================
    
    /**
     * Load orders from storage
     * @returns {Array} - Orders array
     */
    function loadOrders() {
        var orders = get(KEYS.ORDERS);
        return Array.isArray(orders) ? orders : [];
    }
    
    /**
     * Save orders to storage
     * @param {Array} orders - Orders array
     */
    function saveOrders(orders) {
        // Limit to max orders
        if (orders.length > QRConfig.LIMITS.MAX_ORDERS) {
            orders = orders.slice(-QRConfig.LIMITS.MAX_ORDERS);
        }
        set(KEYS.ORDERS, orders);
    }
    
    /**
     * Clear all orders
     */
    function clearOrders() {
        set(KEYS.ORDERS, []);
    }
    
    // ==================== Daily Usage Storage ====================
    
    /**
     * Get daily usage data
     * @returns {object} - { date, used }
     */
    function getDailyUsage() {
        var data = get(KEYS.DAILY);
        var today = new Date().toISOString().split('T')[0];
        
        if (data && data.date === today) {
            return data;
        }
        
        // New day, reset
        return { date: today, used: 0 };
    }
    
    /**
     * Increment daily usage
     * @returns {number} - New usage count
     */
    function incrementDailyUsage() {
        var data = getDailyUsage();
        data.used++;
        set(KEYS.DAILY, data);
        return data.used;
    }
    
    /**
     * Reset daily usage
     */
    function resetDailyUsage() {
        var today = new Date().toISOString().split('T')[0];
        set(KEYS.DAILY, { date: today, used: 0 });
    }
    
    // ==================== Grace Period Storage ====================
    
    /**
     * Get grace period data
     * @returns {object|null}
     */
    function getGracePeriod() {
        return get(KEYS.GRACE_PERIOD);
    }
    
    /**
     * Set grace period
     * @param {string} expiredAt - When license expired
     */
    function setGracePeriod(expiredAt) {
        var graceEnd = new Date(expiredAt);
        graceEnd.setHours(graceEnd.getHours() + QRConfig.LIMITS.GRACE_PERIOD_HOURS);
        
        set(KEYS.GRACE_PERIOD, {
            expiredAt: expiredAt,
            graceEndAt: graceEnd.toISOString()
        });
    }
    
    /**
     * Clear grace period
     */
    function clearGracePeriod() {
        remove(KEYS.GRACE_PERIOD);
    }
    
    // ==================== Visitor ID ====================
    
    /**
     * Get or create visitor ID
     * @returns {string} - Visitor ID
     */
    function getVisitorId() {
        var vid = null;
        try {
            vid = localStorage.getItem(KEYS.VISITOR_ID);
        } catch (e) {}
        
        if (!vid) {
            vid = 'v_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            try {
                localStorage.setItem(KEYS.VISITOR_ID, vid);
            } catch (e) {}
        }
        
        return vid;
    }
    
    // ==================== Device Fingerprint ====================
    
    /**
     * Generate device fingerprint for license binding
     * @returns {string} - Fingerprint string
     */
    function getDeviceFingerprint() {
        var fp = [];
        fp.push('scr:' + screen.width + 'x' + screen.height);
        fp.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone);
        fp.push('lang:' + navigator.language);
        fp.push('plat:' + navigator.platform);
        return fp.join('|');
    }
    
    // ==================== Public API ====================
    return {
        // Generic
        get: get,
        set: set,
        remove: remove,
        
        // Cookie
        setCookie: setCookie,
        getCookie: getCookie,
        deleteCookie: deleteCookie,
        
        // License
        saveLicense: saveLicense,
        loadLicense: loadLicense,
        clearLicense: clearLicense,
        
        // Orders
        loadOrders: loadOrders,
        saveOrders: saveOrders,
        clearOrders: clearOrders,
        
        // Daily usage
        getDailyUsage: getDailyUsage,
        incrementDailyUsage: incrementDailyUsage,
        resetDailyUsage: resetDailyUsage,
        
        // Grace period
        getGracePeriod: getGracePeriod,
        setGracePeriod: setGracePeriod,
        clearGracePeriod: clearGracePeriod,
        
        // Device
        getVisitorId: getVisitorId,
        getDeviceFingerprint: getDeviceFingerprint
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRStorage;
}
