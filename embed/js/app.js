/**
 * QR Scanner v7.25 - Main Application
 * 
 * Connects all modules and controls main flow:
 * - Initialize modules
 * - Event binding
 * - Main scan/record loop
 * - User interactions
 * 
 * Depends on: config.js, storage.js, license.js, scanner.js, recorder.js, orders.js, ui.js
 */

var QRApp = (function() {
    'use strict';
    
    // Module references
    var CONFIG = QRConfig;
    var STORAGE = QRStorage;
    var LICENSE = QRLicense;
    var SCANNER = QRScanner;
    var RECORDER = QRRecorder;
    var ORDERS = QROrders;
    var UI = QRUI;
    
    // App state
    var state = {
        initialized: false,
        currentQR: null,
        timerInterval: null,
        recordingDuration: 0,
        scanLoopId: null
    };
    
    // ==================== Initialization ====================
    
    /**
     * Initialize application
     */
    function init() {
        if (state.initialized) return;
        
        console.log('═══════════════════════════════════════');
        console.log('🚀 QR Scanner v7.25 Starting...');
        console.log('═══════════════════════════════════════');
        
        // Initialize modules
        UI.init();
        LICENSE.init();
        SCANNER.init();
        RECORDER.init();
        ORDERS.init();
        
        // Setup callbacks
        setupCallbacks();
        
        // Bind events
        bindEvents();
        
        // Update UI
        updateUI();
        
        state.initialized = true;
        
        console.log('✅ QR Scanner v7.25 Ready!');
        UI.toast('✅ v7.25 Ready', 'success');
        
        // AUTO REQUEST PERMISSION sau 2 giây
        setTimeout(function() {
            autoRequestPermission();
        }, 2000);
    }
    
    /**
     * Auto request camera permission and load camera list
     */
    async function autoRequestPermission() {
        try {
            console.log('📷 Auto requesting camera permission...');
            
            // Request permission
            var stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Stop stream immediately (just to get permission)
            stream.getTracks().forEach(function(t) { t.stop(); });
            
            // Now get camera list with labels
            var cameras = await RECORDER.getCameras();
            
            // Update camera select dropdown
            var select = UI.$('cameraSelect');
            if (select && cameras.length > 0) {
                select.innerHTML = '';
                cameras.forEach(function(cam, i) {
                    var option = document.createElement('option');
                    option.value = cam.deviceId;
                    option.textContent = cam.label || 'Camera ' + (i + 1);
                    select.appendChild(option);
                });
                console.log('✅ Found ' + cameras.length + ' camera(s)');
            }
            
        } catch (e) {
            console.log('⚠️ Camera permission request failed:', e.message);
            // Retry after 3 seconds
            setTimeout(autoRequestPermission, 3000);
        }
    }
    
    // ==================== Callbacks Setup ====================
    
    function setupCallbacks() {
        // License callbacks
        LICENSE.on('onStatusChange', function(licenseState) {
            UI.updatePremiumStatus(licenseState);
            updateUI();
        });
        
        LICENSE.on('onRenewalWarning', function(days) {
            UI.updateRenewalWarning(days);
        });
        
        LICENSE.on('onLimitReached', function() {
            UI.showLimitModal();
        });
        
        LICENSE.on('onGraceExpired', function() {
            UI.toast('⚠️ Premium hết hạn - Dữ liệu đã bị xóa!', 'error');
            ORDERS.clear();
            updateUI();
        });
        
        // Scanner callbacks
        SCANNER.on('onQRDetected', function(result) {
            handleQRDetected(result);
        });
        
        SCANNER.on('onScanBlocked', function(duration) {
            startScanLockTimer(duration);
        });
        
        SCANNER.on('onScanUnblocked', function() {
            UI.updateScanLock(0);
        });
        
        // Recorder callbacks
        RECORDER.on('onCameraStart', function(data) {
            var video = UI.$('webcamVideo');
            if (video && data.stream) {
                video.srcObject = data.stream;
                RECORDER.setVideoElement(video);
            }
            
            // Update camera select with names
            if (data.cameras && data.cameras.length > 0) {
                var select = UI.$('cameraSelect');
                if (select) {
                    select.innerHTML = '';
                    data.cameras.forEach(function(cam, i) {
                        var option = document.createElement('option');
                        option.value = cam.deviceId;
                        option.textContent = cam.label || 'Camera ' + (i + 1);
                        if (cam.deviceId === data.deviceId) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                }
            }
            
            UI.updateCameraButton(true);
            UI.showFPSDisplay(true);
        });
        
        RECORDER.on('onCameraStop', function() {
            var video = UI.$('webcamVideo');
            if (video) {
                video.srcObject = null;
            }
            UI.updateCameraButton(false);
            stopScanLoop();
        });
        
        RECORDER.on('onRecordingStart', function() {
            startTimer();
            UI.updateRecordingStatus(true, 0);
        });
        
        RECORDER.on('onVideoSaved', function(data) {
            // Add to orders
            ORDERS.add({
                qrCode: data.qrCode,
                duration: data.duration,
                sizeMB: data.sizeMB,
                productCount: data.productCount,
                filename: data.filename
            });
            
            // Increment usage for free users
            if (!LICENSE.isPremium()) {
                LICENSE.incrementUsage();
            }
            
            updateUI();
            UI.toast('✅ ' + CONFIG.TEXTS.MSG_VIDEO_SAVED, 'success');
        });
        
        RECORDER.on('onFPSUpdate', function(fps) {
            UI.updateFPS(fps, SCANNER.getScanRate());
        });
        
        RECORDER.on('onError', function(error) {
            UI.toast('❌ ' + error.type + ': ' + error.error.message, 'error');
        });
        
        // Orders callbacks
        ORDERS.on('onOrdersLoaded', function(orders) {
            UI.renderHistory(orders);
        });
        
        ORDERS.on('onOrderAdded', function(order) {
            UI.renderHistory(ORDERS.getAll());
        });
    }
    
    // ==================== Event Binding ====================
    
    function bindEvents() {
        // Camera button
        bindClick('btnCamera', function() {
            if (RECORDER.isCameraOn()) {
                stopAll();
            } else {
                startCamera();
            }
        });
        
        // Folder button
        bindClick('btnFolder', async function() {
            var success = await RECORDER.selectFolder();
            if (success) {
                UI.updateFolderInfo(RECORDER.getFolderName());
                UI.toast('✅ ' + CONFIG.TEXTS.MSG_FOLDER_SELECTED, 'success');
            }
        });
        
        // Settings changes
        bindChange('qualitySelect', function(e) {
            RECORDER.setQuality(e.target.value);
            setupScanCanvas();
        });
        
        bindChange('bitrateSelect', function(e) {
            RECORDER.setBitrate(e.target.value);
        });
        
        bindChange('audioToggle', function(e) {
            RECORDER.setAudio(e.target.checked);
        });
        
        bindChange('timestampSelect', function(e) {
            RECORDER.setTimestampPosition(e.target.value);
        });
        
        bindChange('postBufferSelect', function(e) {
            RECORDER.setPostBuffer(parseInt(e.target.value));
        });
        
        bindChange('beepVolume', function(e) {
            SCANNER.setBeepVolume(parseInt(e.target.value));
            updateVolumeDisplay(e.target.value);
        });
        
        bindChange('cameraSelect', function(e) {
            if (RECORDER.isCameraOn()) {
                RECORDER.startCamera(e.target.value);
            }
        });
        
        // Search
        bindInput('searchInput', function(e) {
            var results = ORDERS.search(e.target.value);
            UI.renderHistory(results);
        });
        
        // Export button
        bindClick('btnExport', function() {
            ORDERS.exportToExcel();
        });
        
        // Clear history button
        bindClick('btnClearHistory', function() {
            if (confirm('Xóa toàn bộ lịch sử?')) {
                ORDERS.clear();
                UI.renderHistory([]);
                UI.toast('✅ Đã xóa lịch sử', 'success');
            }
        });
        
        // Tabs
        document.querySelectorAll('.tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                UI.setActiveTab(this.dataset.tab);
            });
        });
        
        // Limit modal close
        bindClick('btnCloseLimitModal', function() {
            UI.hideLimitModal();
        });
        
        // Upgrade button in limit modal
        bindClick('btnUpgradeFromLimit', function() {
            UI.hideLimitModal();
            requestUpgradePopup();
        });
        
        // Renewal modal
        bindClick('btnRenewNow', function() {
            UI.hideRenewalModal();
            requestUpgradePopup();
        });
        
        bindClick('btnRenewLater', function() {
            UI.hideRenewalModal();
        });
        
        // Date filter
        bindClick('btnDateFilter', function() {
            UI.showDateModal();
        });
        
        bindClick('btnApplyDateFilter', function() {
            var startDate = UI.$('startDate').value;
            var endDate = UI.$('endDate').value;
            if (startDate && endDate) {
                var results = ORDERS.filterByDate(startDate, endDate);
                UI.renderHistory(results);
            }
            UI.hideDateModal();
        });
        
        bindClick('btnCancelDateFilter', function() {
            UI.hideDateModal();
            UI.renderHistory(ORDERS.getAll());
        });
    }
    
    // ==================== Camera & Recording ====================
    
    async function startCamera() {
        // Check limit for free users
        if (!LICENSE.isPremium() && !LICENSE.canScanMore()) {
            UI.showLimitModal();
            return;
        }
        
        // Get cameras first time
        var cameras = await RECORDER.getCameras();
        if (cameras.length > 0) {
            UI.populateCameras(cameras);
        }
        
        var selectedCamera = UI.$('cameraSelect')?.value;
        var success = await RECORDER.startCamera(selectedCamera);
        
        if (success) {
            RECORDER.setVideoElement(UI.$('webcamVideo'));
            setupScanCanvas();
        }
    }
    
    function stopAll() {
        // Stop recording if active
        if (RECORDER.isRecording()) {
            stopRecording();
        }
        
        // Stop camera
        RECORDER.stopCamera();
        
        // Stop timer
        stopTimer();
        
        // Reset scanner
        SCANNER.resetSession();
        
        UI.updateRecordingStatus(false, 0);
    }
    
    function setupScanCanvas() {
        var preset = CONFIG.VIDEO_PRESETS[RECORDER.getState().quality];
        var width = Math.round(preset.width * preset.scanScale);
        var height = Math.round(preset.height * preset.scanScale);
        SCANNER.setupCanvas(width, height);
        SCANNER.setScanInterval(Math.round(1000 / preset.scanFPS));
    }
    
    // ==================== Scan Loop ====================
    
    function startScanLoop() {
        if (state.scanLoopId) return;
        
        function loop() {
            if (!RECORDER.isCameraOn()) {
                state.scanLoopId = null;
                return;
            }
            
            state.scanLoopId = requestAnimationFrame(loop);
            
            var video = UI.$('webcamVideo');
            if (!video) return;
            
            // Scan for QR
            var qrData = SCANNER.scanFrame(video);
            if (qrData) {
                SCANNER.processQR(qrData);
            }
        }
        
        loop();
    }
    
    function stopScanLoop() {
        if (state.scanLoopId) {
            cancelAnimationFrame(state.scanLoopId);
            state.scanLoopId = null;
        }
    }
    
    // ==================== QR Detection Handler ====================
    
    function handleQRDetected(result) {
        console.log('[App] QR Detected:', result.data);
        
        state.currentQR = result.data;
        
        // Show detection UI
        UI.showQRDetected({
            qrCode: result.data,
            productCount: result.productCount
        });
        
        // Start recording if not already
        if (!RECORDER.isRecording()) {
            RECORDER.startRecording();
        }
        
        // Schedule stop after post-buffer
        var postBuffer = RECORDER.getState().postBuffer;
        setTimeout(function() {
            if (RECORDER.isRecording() && !SCANNER.isBlocked()) {
                stopRecording();
            }
        }, postBuffer);
    }
    
    function stopRecording() {
        RECORDER.stopRecording({
            qrCode: state.currentQR,
            productCount: SCANNER.getProductCount()
        });
        
        stopTimer();
        SCANNER.resetSession();
        state.currentQR = null;
        
        UI.updateRecordingStatus(false, 0);
    }
    
    // ==================== Timer ====================
    
    function startTimer() {
        state.recordingDuration = 0;
        
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
        }
        
        state.timerInterval = setInterval(function() {
            state.recordingDuration++;
            UI.updateRecordingStatus(true, state.recordingDuration);
        }, 1000);
    }
    
    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }
    
    // ==================== Scan Lock Timer ====================
    
    function startScanLockTimer(duration) {
        var endTime = Date.now() + duration;
        
        function update() {
            var remaining = Math.max(0, endTime - Date.now());
            UI.updateScanLock(remaining / 1000);
            
            if (remaining > 0) {
                requestAnimationFrame(update);
            }
        }
        
        update();
    }
    
    // ==================== UI Update ====================
    
    function updateUI() {
        // Update premium status
        UI.updatePremiumStatus(LICENSE.getState());
        
        // Update stats
        UI.updateStats(ORDERS.getStats());
        
        // Update history
        UI.renderHistory(ORDERS.getAll());
    }
    
    function updateVolumeDisplay(value) {
        var display = UI.$('volumeValue');
        if (display) {
            display.textContent = value + '%';
        }
    }
    
    // ==================== Parent Communication ====================
    
    /**
     * Request upgrade popup from parent window
     */
    function requestUpgradePopup() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ action: 'openPremiumPopup' }, '*');
        }
    }
    
    // ==================== Helpers ====================
    
    function bindClick(id, handler) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', handler);
        }
    }
    
    function bindChange(id, handler) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', handler);
        }
    }
    
    function bindInput(id, handler) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', handler);
        }
    }
    
    // ==================== Public API ====================
    return {
        init: init,
        
        // Actions
        startCamera: startCamera,
        stopAll: stopAll,
        
        // State
        getState: function() { return Object.assign({}, state); },
        
        // For debugging
        modules: {
            CONFIG: CONFIG,
            STORAGE: STORAGE,
            LICENSE: LICENSE,
            SCANNER: SCANNER,
            RECORDER: RECORDER,
            ORDERS: ORDERS,
            UI: UI
        }
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', QRApp.init);
} else {
    QRApp.init();
}

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRApp;
}
