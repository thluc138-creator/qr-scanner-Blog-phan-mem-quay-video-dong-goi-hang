/**
 * QR Scanner v7.25 - UI Module
 * 
 * Chứa tất cả logic:
 * - DOM manipulation
 * - UI updates
 * - Modal management
 * - Toast notifications
 * - History list rendering
 * 
 * Depends on: config.js
 */

var QRUI = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    
    // Element cache
    var elements = {};
    
    // Toast timeout
    var toastTimeout = null;
    
    // ==================== Element Helpers ====================
    
    /**
     * Get element by ID (cached)
     */
    function $(id) {
        if (!elements[id]) {
            elements[id] = document.getElementById(id);
        }
        return elements[id];
    }
    
    /**
     * Clear element cache
     */
    function clearCache() {
        elements = {};
    }
    
    // ==================== Toast ====================
    
    /**
     * Show toast notification
     * @param {string} message
     * @param {string} type - 'success', 'error', 'warning', 'info'
     * @param {number} duration - ms (default 2500)
     */
    function toast(message, type, duration) {
        var t = $('toast');
        if (!t) return;
        
        // Clear previous timeout
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        
        t.textContent = message;
        t.className = 'toast show ' + (type || '');
        
        toastTimeout = setTimeout(function() {
            t.classList.remove('show');
        }, duration || 2500);
    }
    
    // ==================== Modal Management ====================
    
    /**
     * Show modal
     * @param {string} modalId
     */
    function showModal(modalId) {
        var modal = $(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    }
    
    /**
     * Hide modal
     * @param {string} modalId
     */
    function hideModal(modalId) {
        var modal = $(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    // Specific modals
    function showLimitModal() { showModal('limitModal'); }
    function hideLimitModal() { hideModal('limitModal'); }
    function showDateModal() { showModal('dateModal'); }
    function hideDateModal() { hideModal('dateModal'); }
    function showRenewalModal() { showModal('renewalModal'); }
    function hideRenewalModal() { hideModal('renewalModal'); }
    
    // ==================== Premium/Free Status ====================
    
    /**
     * Update premium/free status display
     * @param {object} state - { isPremium, daysRemaining, todayUsed }
     */
    function updatePremiumStatus(state) {
        var limitBanner = $('limitBanner');
        var premiumInfo = $('premiumInfo');
        var userBadge = $('userBadge');
        var statsLimit = $('statsLimit');
        var remainingToday = $('remainingToday');
        var usedToday = $('usedToday');
        var daysRemaining = $('daysRemaining');
        
        if (state.isPremium) {
            // Premium mode
            if (limitBanner) limitBanner.classList.add('hidden');
            if (premiumInfo) premiumInfo.classList.remove('hidden');
            if (userBadge) {
                userBadge.textContent = CONFIG.TEXTS.BADGE_PREMIUM;
                userBadge.className = 'premium-badge';
            }
            if (statsLimit) statsLimit.classList.add('hidden');
            if (daysRemaining) daysRemaining.textContent = state.daysRemaining;
        } else {
            // Free mode
            if (limitBanner) limitBanner.classList.remove('hidden');
            if (premiumInfo) premiumInfo.classList.add('hidden');
            if (userBadge) {
                userBadge.textContent = CONFIG.TEXTS.BADGE_FREE;
                userBadge.className = 'free-badge';
            }
            if (statsLimit) statsLimit.classList.remove('hidden');
            if (usedToday) usedToday.textContent = state.todayUsed;
            if (remainingToday) {
                var remaining = CONFIG.LIMITS.FREE_DAILY_LIMIT - state.todayUsed;
                remainingToday.textContent = Math.max(0, remaining);
            }
        }
    }
    
    /**
     * Update renewal warning modal
     * @param {number} days - Days remaining (0 = expired, -1 = grace period)
     */
    function updateRenewalWarning(days) {
        var modal = $('renewalModal');
        var daysEl = $('renewDays');
        var textEl = $('renewText');
        
        if (!modal || !daysEl) return;
        
        if (days > 0) {
            daysEl.textContent = days;
            if (textEl) textEl.textContent = CONFIG.TEXTS.STATS_DAYS_LEFT;
            daysEl.style.color = days <= 3 ? '#e74c3c' : '#f39c12';
        } else if (days === 0) {
            daysEl.textContent = '0';
            if (textEl) textEl.textContent = CONFIG.TEXTS.RENEWAL_EXPIRED;
            daysEl.style.color = '#e74c3c';
        } else {
            daysEl.textContent = '24h';
            if (textEl) textEl.textContent = CONFIG.TEXTS.RENEWAL_GRACE;
            daysEl.style.color = '#f39c12';
        }
        
        showRenewalModal();
    }
    
    // ==================== Stats Display ====================
    
    /**
     * Update stats display
     * @param {object} stats - { total, today }
     */
    function updateStats(stats) {
        var todayCount = $('todayCount');
        var totalCount = $('totalCount');
        
        if (todayCount) todayCount.textContent = stats.today || 0;
        if (totalCount) totalCount.textContent = stats.total || 0;
    }
    
    // ==================== Recording Status ====================
    
    /**
     * Update recording indicator
     * @param {boolean} isRecording
     * @param {number} duration - seconds
     */
    function updateRecordingStatus(isRecording, duration) {
        var recIndicator = $('recIndicator');
        var timerDisplay = $('timerDisplay');
        
        if (recIndicator) {
            if (isRecording) {
                recIndicator.classList.remove('hidden');
            } else {
                recIndicator.classList.add('hidden');
            }
        }
        
        if (timerDisplay && duration !== undefined) {
            timerDisplay.textContent = formatDuration(duration);
        }
    }
    
    /**
     * Update FPS display
     * @param {number} fps
     * @param {number} scanRate
     */
    function updateFPS(fps, scanRate) {
        var fpsValue = $('fpsValue');
        var scanRateValue = $('scanRateValue');
        
        if (fpsValue) {
            fpsValue.textContent = fps;
            fpsValue.className = 'fps-value';
            if (fps < 20) fpsValue.classList.add('low');
            else if (fps < 30) fpsValue.classList.add('medium');
        }
        
        if (scanRateValue) {
            scanRateValue.textContent = scanRate || 0;
        }
    }
    
    // ==================== Scan Lock Overlay ====================
    
    /**
     * Show/update scan lock overlay
     * @param {number} secondsRemaining
     */
    function updateScanLock(secondsRemaining) {
        var overlay = $('scanLockOverlay');
        var timeEl = $('scanLockTime');
        
        if (!overlay) return;
        
        if (secondsRemaining > 0) {
            overlay.classList.remove('hidden');
            if (timeEl) timeEl.textContent = Math.ceil(secondsRemaining);
        } else {
            overlay.classList.add('hidden');
        }
    }
    
    // ==================== QR Detection Display ====================
    
    /**
     * Show QR detected overlay
     * @param {object} data - { qrCode, productCount }
     */
    function showQRDetected(data) {
        var overlay = $('videoOverlay');
        var qrCodeEl = $('detectedQR');
        var productCountEl = $('productCount');
        
        if (overlay) {
            overlay.classList.add('show');
            if (qrCodeEl) qrCodeEl.textContent = data.qrCode;
            if (productCountEl) productCountEl.textContent = data.productCount;
            
            // Auto hide after a few seconds
            setTimeout(function() {
                overlay.classList.remove('show');
            }, CONFIG.LIMITS.PROGRESS_DISPLAY_MS);
        }
    }
    
    // ==================== Folder Info ====================
    
    /**
     * Update folder info display
     * @param {string} folderName
     */
    function updateFolderInfo(folderName) {
        var folderInfo = $('folderInfo');
        var folderPath = $('folderPath');
        
        if (folderInfo && folderPath) {
            if (folderName) {
                folderInfo.classList.remove('hidden');
                folderPath.textContent = folderName;
            } else {
                folderInfo.classList.add('hidden');
            }
        }
    }
    
    // ==================== History List ====================
    
    /**
     * Render history list
     * @param {Array} orders
     */
    function renderHistory(orders) {
        var historyList = $('historyList');
        if (!historyList) return;
        
        if (!orders || orders.length === 0) {
            historyList.innerHTML = '<div class="empty-msg">Chưa có đơn hàng nào</div>';
            return;
        }
        
        var html = orders.map(function(order, index) {
            return '<div class="history-item" data-id="' + order.id + '">' +
                '<span class="h-num">' + (index + 1) + '</span>' +
                '<span class="h-qr" title="' + escapeHtml(order.qrCode) + '">' + escapeHtml(order.qrCode) + '</span>' +
                '<span class="h-date">' + order.date + '</span>' +
                '<span class="h-time">' + order.time + '</span>' +
                '<span class="h-duration">' + formatDuration(order.duration) + '</span>' +
                '<span class="h-size">' + order.sizeMB + ' MB</span>' +
                '<span class="h-products">' + order.productCount + '</span>' +
            '</div>';
        }).join('');
        
        historyList.innerHTML = html;
    }
    
    // ==================== Tabs ====================
    
    /**
     * Set active tab
     * @param {string} tabId
     */
    function setActiveTab(tabId) {
        // Update tab buttons
        var tabs = document.querySelectorAll('.tab');
        tabs.forEach(function(tab) {
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update tab content
        var contents = document.querySelectorAll('.tab-content');
        contents.forEach(function(content) {
            if (content.id === tabId) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });
    }
    
    // ==================== Camera Select ====================
    
    /**
     * Populate camera select dropdown
     * @param {Array} cameras
     * @param {string} selectedId
     */
    function populateCameras(cameras, selectedId) {
        var select = $('cameraSelect');
        if (!select) return;
        
        select.innerHTML = cameras.map(function(cam, index) {
            var label = cam.label || ('Camera ' + (index + 1));
            var selected = cam.deviceId === selectedId ? ' selected' : '';
            return '<option value="' + cam.deviceId + '"' + selected + '>' + label + '</option>';
        }).join('');
    }
    
    // ==================== Button States ====================
    
    /**
     * Update camera button state
     * @param {boolean} isOn
     */
    function updateCameraButton(isOn) {
        var btn = $('btnCamera');
        if (!btn) return;
        
        if (isOn) {
            btn.textContent = CONFIG.TEXTS.BTN_STOP_CAMERA;
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-danger');
        } else {
            btn.textContent = CONFIG.TEXTS.BTN_START_CAMERA;
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-primary');
        }
    }
    
    /**
     * Enable/disable buttons
     * @param {object} states - { btnCamera: true, btnFolder: false, ... }
     */
    function setButtonStates(states) {
        Object.keys(states).forEach(function(btnId) {
            var btn = $(btnId);
            if (btn) {
                btn.disabled = !states[btnId];
            }
        });
    }
    
    // ==================== Helpers ====================
    
    /**
     * Format duration in seconds to HH:MM:SS
     */
    function formatDuration(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        return pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    
    function pad(n) {
        return String(n).padStart(2, '0');
    }
    
    /**
     * Escape HTML entities
     */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // ==================== Initialize ====================
    
    function init() {
        clearCache();
        console.log('[UI] Initialized');
    }
    
    // ==================== Public API ====================
    return {
        // Element access
        $: $,
        clearCache: clearCache,
        
        // Toast
        toast: toast,
        
        // Modals
        showModal: showModal,
        hideModal: hideModal,
        showLimitModal: showLimitModal,
        hideLimitModal: hideLimitModal,
        showDateModal: showDateModal,
        hideDateModal: hideDateModal,
        showRenewalModal: showRenewalModal,
        hideRenewalModal: hideRenewalModal,
        
        // Status updates
        updatePremiumStatus: updatePremiumStatus,
        updateRenewalWarning: updateRenewalWarning,
        updateStats: updateStats,
        updateRecordingStatus: updateRecordingStatus,
        updateFPS: updateFPS,
        updateScanLock: updateScanLock,
        showQRDetected: showQRDetected,
        updateFolderInfo: updateFolderInfo,
        
        // History
        renderHistory: renderHistory,
        
        // Controls
        setActiveTab: setActiveTab,
        populateCameras: populateCameras,
        updateCameraButton: updateCameraButton,
        setButtonStates: setButtonStates,
        
        // Helpers
        formatDuration: formatDuration,
        escapeHtml: escapeHtml,
        
        // Init
        init: init
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRUI;
}
