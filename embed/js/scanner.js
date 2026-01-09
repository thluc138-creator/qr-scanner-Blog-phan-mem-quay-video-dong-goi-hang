/**
 * QR Scanner v7.25 - Scanner Module
 * 
 * Chứa tất cả logic:
 * - QR/Barcode detection
 * - Scan locking (prevent duplicates)
 * - Audio beep feedback
 * - Product counting
 * 
 * Depends on: config.js
 */

var QRScanner = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    
    // Scanner state
    var state = {
        isScanning: false,
        lastQR: null,
        lastScanTime: 0,
        scanBlocked: false,
        scanBlockedUntil: 0,
        detectedProducts: [],
        scanInterval: 333,
        actualScanCount: 0,
        lastScanCountTime: 0,
        actualScanRate: 0
    };
    
    // Canvas for scanning
    var scanCanvas = null;
    var scanCtx = null;
    
    // Audio context for beep
    var audioCtx = null;
    var beepVolume = 80;
    
    // Callbacks
    var callbacks = {
        onQRDetected: null,
        onScanBlocked: null,
        onScanUnblocked: null
    };
    
    // ==================== Audio ====================
    
    /**
     * Initialize audio context
     */
    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('[Scanner] Audio init failed:', e);
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }
    
    /**
     * Play beep sound
     */
    function beep() {
        try {
            initAudio();
            if (!audioCtx) return;
            
            var vol = beepVolume / 100;
            if (vol <= 0) return;
            
            // First beep
            var o = audioCtx.createOscillator();
            var g = audioCtx.createGain();
            o.connect(g);
            g.connect(audioCtx.destination);
            o.frequency.value = 1200;
            o.type = 'square';
            g.gain.setValueAtTime(vol * 0.8, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            o.start();
            o.stop(audioCtx.currentTime + 0.15);
            
            // Second beep (higher pitch)
            setTimeout(function() {
                try {
                    var o2 = audioCtx.createOscillator();
                    var g2 = audioCtx.createGain();
                    o2.connect(g2);
                    g2.connect(audioCtx.destination);
                    o2.frequency.value = 1500;
                    o2.type = 'square';
                    g2.gain.setValueAtTime(vol * 0.7, audioCtx.currentTime);
                    g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                    o2.start();
                    o2.stop(audioCtx.currentTime + 0.1);
                } catch (e) {}
            }, 80);
        } catch (e) {
            console.warn('[Scanner] Beep error:', e);
        }
    }
    
    /**
     * Set beep volume
     * @param {number} volume - 0-100
     */
    function setBeepVolume(volume) {
        beepVolume = Math.max(0, Math.min(100, volume));
    }
    
    // ==================== Canvas Setup ====================
    
    /**
     * Setup scan canvas
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    function setupCanvas(width, height) {
        if (!scanCanvas) {
            scanCanvas = document.createElement('canvas');
            scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
        }
        scanCanvas.width = width;
        scanCanvas.height = height;
    }
    
    // ==================== QR Detection ====================
    
    /**
     * Scan video frame for QR codes
     * @param {HTMLVideoElement} video - Video element to scan
     * @returns {string|null} - Detected QR code or null
     */
    function scanFrame(video) {
        if (!video || !scanCanvas || !scanCtx) return null;
        if (video.readyState < 2) return null;
        
        // Check if blocked
        if (state.scanBlocked) {
            var now = Date.now();
            if (now < state.scanBlockedUntil) {
                return null;
            }
            // Unblock
            state.scanBlocked = false;
            triggerCallback('onScanUnblocked');
        }
        
        // Rate limiting
        var now = Date.now();
        if (now - state.lastScanTime < state.scanInterval) {
            return null;
        }
        state.lastScanTime = now;
        
        // Update scan rate stats
        state.actualScanCount++;
        if (now - state.lastScanCountTime >= 1000) {
            state.actualScanRate = state.actualScanCount;
            state.actualScanCount = 0;
            state.lastScanCountTime = now;
        }
        
        try {
            // Draw video frame to canvas
            scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
            
            // Get image data
            var imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
            
            // Try jsQR library
            if (typeof jsQR !== 'undefined') {
                var code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });
                
                if (code && code.data) {
                    return code.data;
                }
            }
            
            // Try BarcodeDetector API (if available)
            if ('BarcodeDetector' in window) {
                // Note: BarcodeDetector is async, handled separately
                return null;
            }
        } catch (e) {
            console.warn('[Scanner] Scan error:', e);
        }
        
        return null;
    }
    
    /**
     * Process detected QR code
     * @param {string} qrData - QR code data
     * @returns {object|null} - Processed result or null if blocked
     */
    function processQR(qrData) {
        if (!qrData) return null;
        
        // Check if same as last QR
        if (qrData === state.lastQR && state.scanBlocked) {
            return null;
        }
        
        // Check if new QR or same QR after block expired
        var isNewQR = qrData !== state.lastQR;
        
        // Block scanning
        state.scanBlocked = true;
        state.scanBlockedUntil = Date.now() + CONFIG.LIMITS.SCAN_LOCK_MS;
        state.lastQR = qrData;
        
        // Count products
        if (isNewQR) {
            state.detectedProducts.push(qrData);
        }
        
        // Play beep
        beep();
        
        // Trigger callback
        var result = {
            data: qrData,
            isNew: isNewQR,
            timestamp: new Date().toISOString(),
            productCount: state.detectedProducts.length
        };
        
        triggerCallback('onQRDetected', result);
        triggerCallback('onScanBlocked', CONFIG.LIMITS.SCAN_LOCK_MS);
        
        return result;
    }
    
    /**
     * Manual unblock (for recording stop)
     */
    function unblock() {
        state.scanBlocked = false;
        state.scanBlockedUntil = 0;
        triggerCallback('onScanUnblocked');
    }
    
    /**
     * Reset for new recording session
     */
    function resetSession() {
        state.lastQR = null;
        state.scanBlocked = false;
        state.scanBlockedUntil = 0;
        state.detectedProducts = [];
    }
    
    /**
     * Get remaining block time
     * @returns {number} - Milliseconds remaining
     */
    function getBlockTimeRemaining() {
        if (!state.scanBlocked) return 0;
        return Math.max(0, state.scanBlockedUntil - Date.now());
    }
    
    // ==================== BarcodeDetector API ====================
    
    var barcodeDetector = null;
    
    /**
     * Initialize BarcodeDetector if available
     */
    function initBarcodeDetector() {
        if ('BarcodeDetector' in window) {
            try {
                barcodeDetector = new BarcodeDetector({
                    formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39']
                });
                console.log('[Scanner] BarcodeDetector initialized');
            } catch (e) {
                console.warn('[Scanner] BarcodeDetector not available:', e);
            }
        }
    }
    
    /**
     * Scan using BarcodeDetector API (async)
     * @param {ImageBitmap|HTMLVideoElement} source
     * @returns {Promise<string|null>}
     */
    async function scanWithBarcodeDetector(source) {
        if (!barcodeDetector) return null;
        
        try {
            var barcodes = await barcodeDetector.detect(source);
            if (barcodes.length > 0) {
                return barcodes[0].rawValue;
            }
        } catch (e) {
            // Ignore errors
        }
        return null;
    }
    
    // ==================== Callback Management ====================
    
    function on(name, fn) {
        if (callbacks.hasOwnProperty(name)) {
            callbacks[name] = fn;
        }
    }
    
    function triggerCallback(name, data) {
        if (callbacks[name] && typeof callbacks[name] === 'function') {
            callbacks[name](data);
        }
    }
    
    // ==================== Initialize ====================
    
    function init() {
        initAudio();
        initBarcodeDetector();
        console.log('[Scanner] Initialized');
    }
    
    // ==================== Public API ====================
    return {
        // State
        getState: function() { return Object.assign({}, state); },
        isBlocked: function() { return state.scanBlocked; },
        getLastQR: function() { return state.lastQR; },
        getProductCount: function() { return state.detectedProducts.length; },
        getProducts: function() { return state.detectedProducts.slice(); },
        getScanRate: function() { return state.actualScanRate; },
        getBlockTimeRemaining: getBlockTimeRemaining,
        
        // Actions
        setupCanvas: setupCanvas,
        scanFrame: scanFrame,
        processQR: processQR,
        unblock: unblock,
        resetSession: resetSession,
        beep: beep,
        setBeepVolume: setBeepVolume,
        
        // Scan interval
        setScanInterval: function(ms) { state.scanInterval = ms; },
        
        // Callbacks
        on: on,
        
        // Init
        init: init
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRScanner;
}
