/**
 * QR Scanner v7.25 - Recorder Module
 * 
 * Chứa tất cả logic:
 * - Camera management
 * - Video recording with MediaRecorder
 * - Canvas rendering with timestamp
 * - File saving with File System Access API
 * 
 * Depends on: config.js
 */

var QRRecorder = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    
    // Recorder state
    var state = {
        // Camera
        stream: null,
        isCameraOn: false,
        cameraId: null,
        availableCameras: [],
        
        // Recording
        recorder: null,
        chunks: [],
        canvasStream: null,
        isRecording: false,
        recordingStartTime: null,
        recordingDuration: 0,
        
        // Settings
        quality: CONFIG.DEFAULTS.quality,
        bitrate: CONFIG.DEFAULTS.bitrate,
        audio: CONFIG.DEFAULTS.audio,
        postBuffer: CONFIG.DEFAULTS.postBuffer,
        timestampPos: CONFIG.DEFAULTS.timestampPos,
        
        // Canvas
        recordingCanvas: null,
        recordingCtx: null,
        rafId: null,
        frameCount: 0,
        lastFpsTime: 0,
        currentFPS: 0,
        
        // Folder
        folderHandle: null,
        lastSavedFile: null,
        
        // Codec
        currentCodec: null
    };
    
    // Video element reference
    var videoElement = null;
    
    // Callbacks
    var callbacks = {
        onCameraStart: null,
        onCameraStop: null,
        onRecordingStart: null,
        onRecordingStop: null,
        onVideoSaved: null,
        onError: null,
        onFPSUpdate: null
    };
    
    // ==================== Codec Detection ====================
    
    /**
     * Get best supported codec
     * @returns {object} - { mimeType, ext, name }
     */
    function getCodec() {
        var codecs = [
            { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm', name: 'VP8+Opus' },
            { mimeType: 'video/webm;codecs=vp8', ext: 'webm', name: 'VP8' },
            { mimeType: 'video/webm', ext: 'webm', name: 'WebM' }
        ];
        
        for (var i = 0; i < codecs.length; i++) {
            if (MediaRecorder.isTypeSupported(codecs[i].mimeType)) {
                state.currentCodec = codecs[i];
                return codecs[i];
            }
        }
        
        state.currentCodec = { mimeType: 'video/webm', ext: 'webm', name: 'WebM' };
        return state.currentCodec;
    }
    
    // ==================== Camera Management ====================
    
    /**
     * Get list of available cameras
     * @returns {Promise<Array>}
     */
    async function getCameras() {
        try {
            var devices = await navigator.mediaDevices.enumerateDevices();
            state.availableCameras = devices.filter(function(d) {
                return d.kind === 'videoinput';
            });
            return state.availableCameras;
        } catch (e) {
            console.error('[Recorder] getCameras error:', e);
            return [];
        }
    }
    
    /**
     * Start camera
     * @param {string} deviceId - Camera device ID (optional)
     * @returns {Promise<boolean>}
     */
    async function startCamera(deviceId) {
        try {
            // Stop existing stream
            if (state.stream) {
                stopCamera();
            }
            
            var preset = CONFIG.VIDEO_PRESETS[state.quality];
            
            var constraints = {
                video: {
                    width: { ideal: preset.width },
                    height: { ideal: preset.height },
                    frameRate: { ideal: preset.fps }
                },
                audio: state.audio
            };
            
            if (deviceId) {
                constraints.video.deviceId = { exact: deviceId };
            }
            
            state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            state.isCameraOn = true;
            state.cameraId = deviceId;
            
            // Setup canvas
            setupCanvas();
            
            // Start render loop
            startRenderLoop();
            
            console.log('[Recorder] Camera started');
            triggerCallback('onCameraStart', state.stream);
            
            return true;
        } catch (e) {
            console.error('[Recorder] Camera error:', e);
            triggerCallback('onError', { type: 'camera', error: e });
            return false;
        }
    }
    
    /**
     * Stop camera
     */
    function stopCamera() {
        // Stop render loop
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = null;
        }
        
        // Stop stream tracks
        if (state.stream) {
            state.stream.getTracks().forEach(function(track) {
                track.stop();
            });
            state.stream = null;
        }
        
        // Stop canvas stream
        if (state.canvasStream) {
            state.canvasStream.getTracks().forEach(function(track) {
                track.stop();
            });
            state.canvasStream = null;
        }
        
        state.isCameraOn = false;
        console.log('[Recorder] Camera stopped');
        triggerCallback('onCameraStop');
    }
    
    /**
     * Set video element for preview
     * @param {HTMLVideoElement} video
     */
    function setVideoElement(video) {
        videoElement = video;
        if (state.stream && videoElement) {
            videoElement.srcObject = state.stream;
        }
    }
    
    // ==================== Canvas Setup ====================
    
    /**
     * Setup recording canvas
     */
    function setupCanvas() {
        var preset = CONFIG.VIDEO_PRESETS[state.quality];
        
        if (!state.recordingCanvas) {
            state.recordingCanvas = document.createElement('canvas');
            state.recordingCtx = state.recordingCanvas.getContext('2d', { alpha: false });
        }
        
        state.recordingCanvas.width = preset.width;
        state.recordingCanvas.height = preset.height;
    }
    
    // ==================== Render Loop ====================
    
    /**
     * Start the render loop for canvas recording
     */
    function startRenderLoop() {
        state.frameCount = 0;
        state.lastFpsTime = performance.now();
        
        function render() {
            if (!state.isCameraOn) return;
            
            state.rafId = requestAnimationFrame(render);
            
            if (!videoElement || videoElement.readyState < 2) return;
            
            // Draw video to canvas
            state.recordingCtx.drawImage(
                videoElement, 
                0, 0, 
                state.recordingCanvas.width, 
                state.recordingCanvas.height
            );
            
            // Draw timestamp if recording
            if (state.isRecording) {
                drawTimestamp();
            }
            
            // Update FPS counter
            state.frameCount++;
            var now = performance.now();
            if (now - state.lastFpsTime >= 1000) {
                state.currentFPS = Math.round(state.frameCount * 1000 / (now - state.lastFpsTime));
                state.frameCount = 0;
                state.lastFpsTime = now;
                triggerCallback('onFPSUpdate', state.currentFPS);
            }
        }
        
        render();
    }
    
    /**
     * Draw timestamp on canvas
     */
    function drawTimestamp() {
        var ctx = state.recordingCtx;
        var canvas = state.recordingCanvas;
        
        var now = new Date();
        var text = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + 
                   ' ' + pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
        
        ctx.font = 'bold 28px Arial';
        ctx.textBaseline = 'top';
        
        var metrics = ctx.measureText(text);
        var padding = 10;
        var boxWidth = metrics.width + padding * 2;
        var boxHeight = 36;
        
        var x, y;
        switch (state.timestampPos) {
            case 'top-left':
                x = 15; y = 15;
                break;
            case 'top-right':
                x = canvas.width - boxWidth - 15; y = 15;
                break;
            case 'bottom-left':
                x = 15; y = canvas.height - boxHeight - 15;
                break;
            case 'bottom-right':
            default:
                x = canvas.width - boxWidth - 15; y = canvas.height - boxHeight - 15;
        }
        
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, boxWidth, boxHeight);
        
        // Text
        ctx.fillStyle = '#FFFF00';
        ctx.fillText(text, x + padding, y + 5);
    }
    
    function pad(n) {
        return String(n).padStart(2, '0');
    }
    
    // ==================== Recording ====================
    
    /**
     * Start recording
     * @returns {boolean}
     */
    function startRecording() {
        if (!state.isCameraOn || state.isRecording) return false;
        
        try {
            var codec = getCodec();
            var preset = CONFIG.VIDEO_PRESETS[state.quality];
            var bitrateValue = CONFIG.BITRATE_OPTIONS[state.bitrate].value;
            
            // Create canvas stream
            state.canvasStream = state.recordingCanvas.captureStream(preset.fps);
            
            // Add audio track if enabled
            if (state.audio && state.stream) {
                var audioTracks = state.stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    state.canvasStream.addTrack(audioTracks[0]);
                }
            }
            
            // Create recorder
            state.recorder = new MediaRecorder(state.canvasStream, {
                mimeType: codec.mimeType,
                videoBitsPerSecond: bitrateValue
            });
            
            state.chunks = [];
            
            state.recorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) {
                    state.chunks.push(e.data);
                }
            };
            
            state.recorder.onstop = handleRecordingStop;
            
            state.recorder.start(1000); // Collect data every second
            state.isRecording = true;
            state.recordingStartTime = Date.now();
            
            console.log('[Recorder] Recording started');
            triggerCallback('onRecordingStart');
            
            return true;
        } catch (e) {
            console.error('[Recorder] Start recording error:', e);
            triggerCallback('onError', { type: 'recording', error: e });
            return false;
        }
    }
    
    /**
     * Stop recording
     * @param {object} metadata - { qrCode, productCount }
     */
    function stopRecording(metadata) {
        if (!state.isRecording || !state.recorder) return;
        
        state.recordingDuration = Math.round((Date.now() - state.recordingStartTime) / 1000);
        state.recordingMetadata = metadata || {};
        
        state.recorder.stop();
        state.isRecording = false;
        
        console.log('[Recorder] Recording stopped, duration: ' + state.recordingDuration + 's');
    }
    
    /**
     * Handle recording stop - save video
     */
    async function handleRecordingStop() {
        if (state.chunks.length === 0) return;
        
        var blob = new Blob(state.chunks, { type: state.currentCodec.mimeType });
        var sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        
        // Generate filename
        var now = new Date();
        var dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        var timeStr = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
        var qrCode = state.recordingMetadata.qrCode || 'NoQR';
        var filename = dateStr + '_' + timeStr + '_' + sanitizeFilename(qrCode) + '.' + state.currentCodec.ext;
        
        // Save to folder or download
        var saved = false;
        if (state.folderHandle) {
            saved = await saveToFolder(blob, filename);
        }
        
        if (!saved) {
            downloadBlob(blob, filename);
        }
        
        // Clear chunks
        state.chunks = [];
        state.recordingMetadata = {};
        
        // Trigger callback
        triggerCallback('onRecordingStop', {
            filename: filename,
            size: sizeMB,
            duration: state.recordingDuration,
            qrCode: qrCode
        });
        
        triggerCallback('onVideoSaved', {
            filename: filename,
            sizeMB: sizeMB,
            duration: state.recordingDuration,
            qrCode: qrCode,
            productCount: state.recordingMetadata.productCount || 0
        });
    }
    
    /**
     * Sanitize string for filename
     */
    function sanitizeFilename(str) {
        return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    }
    
    // ==================== File System ====================
    
    /**
     * Select folder for saving
     * @returns {Promise<boolean>}
     */
    async function selectFolder() {
        if (!('showDirectoryPicker' in window)) {
            console.warn('[Recorder] File System API not supported');
            return false;
        }
        
        try {
            state.folderHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            console.log('[Recorder] Folder selected:', state.folderHandle.name);
            return true;
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('[Recorder] Folder select error:', e);
            }
            return false;
        }
    }
    
    /**
     * Save blob to selected folder
     * @param {Blob} blob
     * @param {string} filename
     * @returns {Promise<boolean>}
     */
    async function saveToFolder(blob, filename) {
        if (!state.folderHandle) return false;
        
        try {
            var fileHandle = await state.folderHandle.getFileHandle(filename, { create: true });
            var writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            state.lastSavedFile = filename;
            console.log('[Recorder] Saved to folder:', filename);
            return true;
        } catch (e) {
            console.error('[Recorder] Save to folder error:', e);
            return false;
        }
    }
    
    /**
     * Download blob as file
     * @param {Blob} blob
     * @param {string} filename
     */
    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        state.lastSavedFile = filename;
    }
    
    // ==================== Settings ====================
    
    function setQuality(quality) {
        if (CONFIG.VIDEO_PRESETS[quality]) {
            state.quality = quality;
        }
    }
    
    function setBitrate(bitrate) {
        if (CONFIG.BITRATE_OPTIONS[bitrate]) {
            state.bitrate = bitrate;
        }
    }
    
    function setAudio(enabled) {
        state.audio = !!enabled;
    }
    
    function setPostBuffer(ms) {
        state.postBuffer = Math.max(0, ms);
    }
    
    function setTimestampPosition(pos) {
        if (CONFIG.TIMESTAMP_POSITIONS[pos]) {
            state.timestampPos = pos;
        }
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
        getCodec();
        console.log('[Recorder] Initialized, codec:', state.currentCodec.name);
    }
    
    // ==================== Public API ====================
    return {
        // State
        getState: function() { return Object.assign({}, state); },
        isCameraOn: function() { return state.isCameraOn; },
        isRecording: function() { return state.isRecording; },
        getFPS: function() { return state.currentFPS; },
        getFolderName: function() { return state.folderHandle ? state.folderHandle.name : null; },
        getRecordingCanvas: function() { return state.recordingCanvas; },
        
        // Camera
        getCameras: getCameras,
        startCamera: startCamera,
        stopCamera: stopCamera,
        setVideoElement: setVideoElement,
        
        // Recording
        startRecording: startRecording,
        stopRecording: stopRecording,
        
        // Folder
        selectFolder: selectFolder,
        
        // Settings
        setQuality: setQuality,
        setBitrate: setBitrate,
        setAudio: setAudio,
        setPostBuffer: setPostBuffer,
        setTimestampPosition: setTimestampPosition,
        
        // Callbacks
        on: on,
        
        // Init
        init: init
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRRecorder;
}
