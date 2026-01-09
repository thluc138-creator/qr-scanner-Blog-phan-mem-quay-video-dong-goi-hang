/**
 * QR Scanner v7.25 - Recorder Module
 * 
 * Chứa tất cả logic:
 * - Camera management
 * - Video recording with MediaRecorder
 * - Canvas rendering with timestamp, FPS, progress bar
 * - File saving with File System Access API
 * 
 * Depends on: config.js
 */

var QRRecorder = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    
    // Constants từ v7.23 - QUAN TRỌNG
    var MARGIN = 113; // Margin chuẩn cho timestamp
    var PROGRESS_DISPLAY_TIME = 1500; // 1.5s hiển thị progress bar
    
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
        
        // Scan
        lastScanTime: 0,
        scanInterval: 333,
        actualScanCount: 0,
        lastScanCountTime: 0,
        actualScanRate: 0,
        
        // Display
        displayQR: null,
        displayTime: 0,
        currentQR: null,
        detectedProducts: [],
        
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
        onFPSUpdate: null,
        onScanFrame: null
    };
    
    // ==================== Codec Detection ====================
    
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
    
    async function startCamera(deviceId) {
        try {
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
            
            setupCanvas();
            startRenderLoop();
            
            // Refresh camera list để lấy tên
            await getCameras();
            
            console.log('[Recorder] Camera started');
            triggerCallback('onCameraStart', {
                deviceId: deviceId,
                stream: state.stream,
                cameras: state.availableCameras
            });
            
            return true;
        } catch (e) {
            console.error('[Recorder] Camera start error:', e);
            triggerCallback('onError', { type: 'camera', error: e });
            return false;
        }
    }
    
    function stopCamera() {
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = null;
        }
        
        if (state.isRecording) {
            stopRecording();
        }
        
        if (state.stream) {
            state.stream.getTracks().forEach(function(track) {
                track.stop();
            });
            state.stream = null;
        }
        
        state.isCameraOn = false;
        state.frameCount = 0;
        state.lastFpsTime = 0;
        state.currentFPS = 0;
        
        console.log('[Recorder] Camera stopped');
        triggerCallback('onCameraStop');
    }
    
    // ==================== Canvas Setup ====================
    
    function setupCanvas() {
        var preset = CONFIG.VIDEO_PRESETS[state.quality];
        
        state.recordingCanvas = document.createElement('canvas');
        state.recordingCanvas.width = preset.width;
        state.recordingCanvas.height = preset.height;
        state.recordingCtx = state.recordingCanvas.getContext('2d');
    }
    
    // ==================== Render Loop ====================
    
    function startRenderLoop() {
        state.lastFpsTime = 0;
        state.frameCount = 0;
        state.lastScanTime = 0;
        state.actualScanCount = 0;
        state.lastScanCountTime = 0;
        
        function render(timestamp) {
            if (!state.stream || !state.stream.active) {
                state.rafId = null;
                return;
            }
            
            state.rafId = requestAnimationFrame(render);
            
            if (videoElement && videoElement.readyState >= 2) {
                // Vẽ video frame
                state.recordingCtx.drawImage(
                    videoElement, 
                    0, 0, 
                    state.recordingCanvas.width, 
                    state.recordingCanvas.height
                );
                
                // Vẽ timestamp
                drawTimestamp(state.recordingCtx);
                
                // Vẽ mã QR đang ghi (nền xanh lá)
                if (state.isRecording && state.currentQR) {
                    drawCurrentQRLabel(state.recordingCtx);
                }
                
                // Progress Bar (hiện 1.5s sau detect)
                if (state.displayQR && (Date.now() - state.displayTime < PROGRESS_DISPLAY_TIME)) {
                    drawProgressBar(state.recordingCtx, state.displayQR);
                }
                
                // FPS counter trên video
                drawFPSCounter(state.recordingCtx, timestamp);
                
                // Audio indicator
                if (state.isRecording && state.audio) {
                    drawAudioIndicator(state.recordingCtx);
                }
                
                // QR Scanning
                var now = performance.now();
                if (now - state.lastScanTime >= state.scanInterval) {
                    state.lastScanTime = now;
                    state.actualScanCount++;
                    triggerCallback('onScanFrame');
                }
                
                // Update scan rate
                if (now - state.lastScanCountTime >= 1000) {
                    state.actualScanRate = state.actualScanCount;
                    state.actualScanCount = 0;
                    state.lastScanCountTime = now;
                }
                
                // Update FPS counter
                state.frameCount++;
                if (timestamp - state.lastFpsTime >= 1000) {
                    state.currentFPS = Math.round(state.frameCount * 1000 / (timestamp - state.lastFpsTime));
                    state.frameCount = 0;
                    state.lastFpsTime = timestamp;
                    triggerCallback('onFPSUpdate', state.currentFPS);
                }
            }
        }
        
        render(0);
    }
    
    // ==================== DRAW FUNCTIONS (từ v7.23) ====================
    
    /**
     * Vẽ timestamp lên canvas - ĐÚNG NHƯ V7.23
     */
    function drawTimestamp(ctx) {
        var now = new Date();
        var text = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN');
        var position = state.timestampPos;
        var canvas = state.recordingCanvas;
        var margin = MARGIN;
        
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        
        var textWidth = ctx.measureText(text).width;
        var x = position.includes('left') ? margin : canvas.width - textWidth - margin;
        var y = position.includes('top') ? margin + 28 : canvas.height - margin;
        
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }
    
    /**
     * Vẽ mã QR đang ghi - NỀN XANH LÁ (từ v7.23)
     */
    function drawCurrentQRLabel(ctx) {
        var position = state.timestampPos;
        var canvas = state.recordingCanvas;
        var margin = MARGIN;
        var y = position.includes('top') ? margin + 65 : canvas.height - margin - 40;
        
        var text = '📦 ' + state.currentQR;
        if (text.length > 35) text = text.substring(0, 35) + '...';
        
        ctx.font = 'bold 24px Arial';
        var textWidth = ctx.measureText(text).width;
        var x = position.includes('left') ? margin : canvas.width - textWidth - margin - 20;
        
        // Vẽ nền xanh lá
        ctx.fillStyle = 'rgba(40, 167, 69, 0.9)';
        ctx.fillRect(x - 10, y - 28, textWidth + 20, 38);
        
        // Vẽ text trắng
        ctx.fillStyle = 'white';
        ctx.fillText(text, x, y);
    }
    
    /**
     * Vẽ Progress Bar - ĐÚNG NHƯ V7.23
     */
    function drawProgressBar(ctx, qrCode) {
        var position = state.timestampPos;
        var canvas = state.recordingCanvas;
        var margin = MARGIN;
        var panelWidth = 500, panelHeight = 180;
        var panelX = position.includes('left') ? margin : canvas.width - panelWidth - margin;
        var panelY = position.includes('top') ? margin + 100 : canvas.height - margin - panelHeight - 100;
        var centerX = panelX + panelWidth / 2;
        
        // Panel background
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Title
        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✅ QR CODE DETECTED', centerX, panelY + 30);
        
        // QR Code text
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 28px Arial';
        ctx.fillText(qrCode.length > 20 ? qrCode.substring(0, 20) + '...' : qrCode, centerX, panelY + 65);
        
        // Progress bar
        var barX = panelX + 20, barY = panelY + 120, barWidth = panelWidth - 40, barHeight = 35;
        ctx.fillStyle = 'rgba(50,50,50,0.9)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('100%', centerX, barY + barHeight / 2 + 7);
        
        // Số SP detected
        if (state.detectedProducts.length > 0) {
            ctx.fillStyle = '#00BFFF';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('📦 ' + state.detectedProducts.length + ' SP', centerX, panelY + panelHeight - 15);
        }
        
        ctx.textAlign = 'left';
    }
    
    /**
     * Vẽ FPS Counter lên video - ĐÚNG NHƯ V7.23
     */
    function drawFPSCounter(ctx, timestamp) {
        var margin = MARGIN;
        var position = state.timestampPos;
        var y = position.includes('bottom') ? margin + 20 : state.recordingCanvas.height - margin;
        
        // FPS color coding
        ctx.fillStyle = state.currentFPS < 30 ? '#FF0000' : state.currentFPS < 50 ? '#FFFF00' : '#00FF00';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('FPS: ' + state.currentFPS, margin, y);
        
        // Scan rate
        ctx.fillStyle = '#00BFFF';
        ctx.fillText('Scan: ' + state.actualScanRate + '/s', margin + 80, y);
    }
    
    /**
     * Vẽ Audio Indicator - ĐÚNG NHƯ V7.23
     */
    function drawAudioIndicator(ctx) {
        var margin = MARGIN;
        var position = state.timestampPos;
        var y = position.includes('bottom') ? margin + 45 : state.recordingCanvas.height - margin - 25;
        
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('🎤 REC', margin, y);
    }
    
    function pad(n) {
        return String(n).padStart(2, '0');
    }
    
    // ==================== Recording ====================
    
    function startRecording(qrCode) {
        if (!state.isCameraOn || state.isRecording) return false;
        
        try {
            var codec = getCodec();
            var preset = CONFIG.VIDEO_PRESETS[state.quality];
            var bitrateValue = CONFIG.BITRATE_OPTIONS[state.bitrate].value;
            
            state.canvasStream = state.recordingCanvas.captureStream(preset.fps);
            
            if (state.audio && state.stream) {
                var audioTracks = state.stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    state.canvasStream.addTrack(audioTracks[0]);
                }
            }
            
            state.recorder = new MediaRecorder(state.canvasStream, {
                mimeType: codec.mimeType,
                videoBitsPerSecond: bitrateValue
            });
            
            state.chunks = [];
            state.currentQR = qrCode;
            state.detectedProducts = [];
            
            state.recorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) {
                    state.chunks.push(e.data);
                }
            };
            
            state.recorder.onstop = handleRecordingStop;
            
            state.recorder.start(1000);
            state.isRecording = true;
            state.recordingStartTime = Date.now();
            
            console.log('[Recorder] Recording started for: ' + qrCode);
            triggerCallback('onRecordingStart', { qrCode: qrCode });
            
            return true;
        } catch (e) {
            console.error('[Recorder] Start recording error:', e);
            triggerCallback('onError', { type: 'recording', error: e });
            return false;
        }
    }
    
    function stopRecording(metadata) {
        if (!state.isRecording || !state.recorder) return;
        
        state.recordingDuration = Math.round((Date.now() - state.recordingStartTime) / 1000);
        state.recordingMetadata = metadata || {};
        state.recordingMetadata.qrCode = state.currentQR;
        state.recordingMetadata.productCount = state.detectedProducts.length;
        
        state.recorder.stop();
        state.isRecording = false;
        
        console.log('[Recorder] Recording stopped, duration: ' + state.recordingDuration + 's');
    }
    
    async function handleRecordingStop() {
        if (state.chunks.length === 0) return;
        
        var blob = new Blob(state.chunks, { type: state.currentCodec.mimeType });
        var sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        
        var now = new Date();
        var dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        var timeStr = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
        var qrCode = state.recordingMetadata.qrCode || 'NoQR';
        var filename = dateStr + '_' + timeStr + '_' + sanitizeFilename(qrCode) + '.' + state.currentCodec.ext;
        
        var saved = false;
        
        if (state.folderHandle) {
            try {
                var fileHandle = await state.folderHandle.getFileHandle(filename, { create: true });
                var writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                state.lastSavedFile = filename;
                saved = true;
                console.log('[Recorder] Saved to folder: ' + filename);
            } catch (e) {
                console.error('[Recorder] Folder save error:', e);
            }
        }
        
        if (!saved) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            state.lastSavedFile = filename;
            console.log('[Recorder] Downloaded: ' + filename);
        }
        
        triggerCallback('onVideoSaved', {
            filename: filename,
            size: sizeMB,
            duration: state.recordingDuration,
            qrCode: state.recordingMetadata.qrCode,
            productCount: state.recordingMetadata.productCount
        });
        
        state.chunks = [];
        state.currentQR = null;
        state.detectedProducts = [];
    }
    
    function sanitizeFilename(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    }
    
    // ==================== Folder Access ====================
    
    async function openFolder() {
        try {
            state.folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            console.log('[Recorder] Folder selected: ' + state.folderHandle.name);
            return state.folderHandle.name;
        } catch (e) {
            console.log('[Recorder] Folder selection cancelled');
            return null;
        }
    }
    
    // ==================== Display Functions ====================
    
    function showProgressBar(qrCode) {
        state.displayQR = qrCode;
        state.displayTime = Date.now();
    }
    
    function addDetectedProduct(qrCode) {
        if (state.detectedProducts.indexOf(qrCode) === -1) {
            state.detectedProducts.push(qrCode);
        }
        return state.detectedProducts.length;
    }
    
    // ==================== Settings ====================
    
    function setQuality(quality) {
        state.quality = quality;
        var preset = CONFIG.VIDEO_PRESETS[quality];
        state.scanInterval = Math.round(1000 / preset.scanFPS);
    }
    
    function setBitrate(bitrate) {
        state.bitrate = bitrate;
    }
    
    function setAudio(enabled) {
        state.audio = enabled;
    }
    
    function setPostBuffer(ms) {
        state.postBuffer = ms;
    }
    
    function setTimestampPosition(position) {
        state.timestampPos = position;
    }
    
    function setVideoElement(element) {
        videoElement = element;
    }
    
    // ==================== Callbacks ====================
    
    function on(event, callback) {
        if (callbacks.hasOwnProperty(event)) {
            callbacks[event] = callback;
        }
    }
    
    function triggerCallback(event, data) {
        if (callbacks[event] && typeof callbacks[event] === 'function') {
            callbacks[event](data);
        }
    }
    
    // ==================== Getters ====================
    
    function getState() {
        return {
            isCameraOn: state.isCameraOn,
            isRecording: state.isRecording,
            currentFPS: state.currentFPS,
            currentQR: state.currentQR,
            scanRate: state.actualScanRate,
            recordingDuration: state.isRecording ? Math.round((Date.now() - state.recordingStartTime) / 1000) : 0,
            productCount: state.detectedProducts.length,
            folderName: state.folderHandle ? state.folderHandle.name : null,
            lastSavedFile: state.lastSavedFile
        };
    }
    
    function getCanvas() {
        return state.recordingCanvas;
    }
    
    function getStream() {
        return state.stream;
    }
    
    // ==================== Public API ====================
    
    return {
        // Camera
        getCameras: getCameras,
        startCamera: startCamera,
        stopCamera: stopCamera,
        
        // Recording
        startRecording: startRecording,
        stopRecording: stopRecording,
        
        // Folder
        openFolder: openFolder,
        
        // Display
        showProgressBar: showProgressBar,
        addDetectedProduct: addDetectedProduct,
        
        // Settings
        setQuality: setQuality,
        setBitrate: setBitrate,
        setAudio: setAudio,
        setPostBuffer: setPostBuffer,
        setTimestampPosition: setTimestampPosition,
        setVideoElement: setVideoElement,
        
        // Events
        on: on,
        
        // Getters
        getState: getState,
        getCanvas: getCanvas,
        getStream: getStream
    };
})();
