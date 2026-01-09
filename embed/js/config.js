/**
 * QR Scanner v7.25 - Configuration Module
 * 
 * Chứa tất cả:
 * - API URLs
 * - Storage keys
 * - Limits & Settings
 * - Video presets
 * - Texts/Labels (dễ dịch sang ngôn ngữ khác)
 */

var QRConfig = (function() {
    'use strict';
    
    // ==================== API URLs ====================
    var API = {
        BASE_URL: 'https://qr-scanner-v725.onrender.com',
        BLOG_URL: 'https://phanmemquayvideodonggoihang.blogspot.com',
        EMBED_URL: 'https://thluc138-creator.github.io/qr-scanner-Blog-phan-mem-quay-video-dong-goi-hang/embed'
    };
    
    // ==================== Storage Keys ====================
    var STORAGE = {
        ORDERS: 'qrScannerBlogV7',
        LICENSE: 'qrScannerLicense',
        DAILY: 'qrScannerDaily',
        GRACE_PERIOD: 'qrScannerGracePeriod',
        VISITOR_ID: 'visitorId',
        LICENSE_COOKIE: 'qrLicenseBackupEmbed'
    };
    
    // ==================== Limits ====================
    var LIMITS = {
        MAX_ORDERS: 100000,
        FREE_DAILY_LIMIT: 100,
        AUTO_DELETE_DAYS: 60,
        SCAN_LOCK_MS: 10000,
        PROGRESS_DISPLAY_MS: 1500,
        GRACE_PERIOD_HOURS: 24,
        RENEWAL_WARNING_DAYS: 5
    };
    
    // ==================== Video Presets ====================
    var VIDEO_PRESETS = {
        '1080p30': {
            width: 1920,
            height: 1080,
            fps: 30,
            scanFPS: 3,
            scanScale: 0.5,
            label: '1080p 30fps'
        },
        '1080p60': {
            width: 1920,
            height: 1080,
            fps: 60,
            scanFPS: 3,
            scanScale: 0.5,
            label: '1080p 60fps'
        }
    };
    
    // ==================== Bitrate Options ====================
    var BITRATE_OPTIONS = {
        '8': { value: 8000000, label: '8 Mbps' },
        '10': { value: 10000000, label: '10 Mbps' },
        '12': { value: 12000000, label: '12 Mbps' }
    };
    
    // ==================== Timestamp Positions ====================
    var TIMESTAMP_POSITIONS = {
        'top-left': { label: 'Trên - Trái' },
        'top-right': { label: 'Trên - Phải' },
        'bottom-left': { label: 'Dưới - Trái' },
        'bottom-right': { label: 'Dưới - Phải' }
    };
    
    // ==================== Texts/Labels (Vietnamese) ====================
    var TEXTS = {
        // App
        APP_TITLE: 'QR Scanner v7.25 Premium',
        APP_SUBTITLE: 'Quay Video Đóng Gói Hàng',
        
        // Badges
        BADGE_FREE: 'FREE',
        BADGE_PREMIUM: 'PREMIUM',
        
        // Buttons
        BTN_START_CAMERA: '📷 Bật Camera',
        BTN_STOP_CAMERA: '⏹ Tắt Camera',
        BTN_SELECT_FOLDER: '📁 Chọn Thư Mục',
        BTN_UPGRADE: '👑 Nâng cấp Premium',
        BTN_ACTIVATE: '🔑 Nhập License',
        BTN_PAY: '💳 Thanh Toán Ngay',
        BTN_COPY: '📋 Copy',
        BTN_DOWNLOAD: '💾 Tải về',
        BTN_CLOSE: 'Đóng',
        BTN_RENEW: '🔄 Gia hạn ngay',
        BTN_LATER: 'Để sau',
        
        // Labels
        LBL_QUALITY: 'Chất lượng',
        LBL_BITRATE: 'Bitrate',
        LBL_AUDIO: 'Ghi âm',
        LBL_TIMESTAMP: 'Timestamp',
        LBL_POST_BUFFER: 'Ghi thêm sau QR',
        LBL_BEEP_VOLUME: 'Âm lượng beep',
        LBL_HISTORY: 'Lịch sử quét',
        LBL_SEARCH: 'Tìm kiếm...',
        
        // Stats
        STATS_TODAY: 'Hôm nay',
        STATS_TOTAL: 'Tổng',
        STATS_REMAINING: 'Còn lại',
        STATS_DAYS_LEFT: 'ngày còn lại',
        STATS_UNLIMITED: 'Không giới hạn',
        
        // Messages
        MSG_CAMERA_STARTED: 'Camera đã bật',
        MSG_CAMERA_STOPPED: 'Camera đã tắt',
        MSG_FOLDER_SELECTED: 'Đã chọn thư mục',
        MSG_QR_DETECTED: 'Đã quét QR',
        MSG_VIDEO_SAVED: 'Đã lưu video',
        MSG_LICENSE_ACTIVATED: 'License đã kích hoạt',
        MSG_LICENSE_EXPIRED: 'License đã hết hạn',
        MSG_LIMIT_REACHED: 'Đã hết lượt quét hôm nay',
        MSG_PAYMENT_SUCCESS: 'Thanh toán thành công',
        MSG_PAYMENT_CANCEL: 'Thanh toán đã bị hủy',
        
        // Errors
        ERR_NO_CAMERA: 'Không tìm thấy camera',
        ERR_CAMERA_DENIED: 'Không có quyền truy cập camera',
        ERR_NO_FOLDER: 'Chưa chọn thư mục lưu',
        ERR_INVALID_LICENSE: 'License không hợp lệ',
        ERR_DEVICE_MISMATCH: 'License đã được kích hoạt trên thiết bị khác',
        ERR_CONNECTION: 'Lỗi kết nối',
        
        // Premium popup
        PREMIUM_TITLE: 'Nâng cấp Premium',
        PREMIUM_PRICE: '365.000đ',
        PREMIUM_PERIOD: '/năm',
        PREMIUM_FEATURES: [
            'Không giới hạn số lần quét',
            'Lưu lịch sử vĩnh viễn',
            'Không quảng cáo',
            'Hỗ trợ ưu tiên 24/7'
        ],
        
        // License popup
        LICENSE_TITLE: 'Kích hoạt License',
        LICENSE_PLACEHOLDER: 'Nhập License Key...',
        LICENSE_SUCCESS_TITLE: '🎉 Kích hoạt thành công!',
        
        // Renewal warning
        RENEWAL_TITLE: '⚠️ Sắp hết hạn Premium',
        RENEWAL_EXPIRED: 'ĐÃ HẾT HẠN',
        RENEWAL_GRACE: 'GRACE PERIOD',
        RENEWAL_WARNING: 'Gia hạn ngay để tiếp tục sử dụng Premium!',
        
        // Contact
        CONTACT_ZALO: 'Zalo: 0906 518 413',
        CONTACT_SUPPORT: 'Hỗ trợ 24/7'
    };
    
    // ==================== Default Settings ====================
    var DEFAULTS = {
        quality: '1080p60',
        bitrate: '12',
        audio: true,
        postBuffer: 3000,
        timestampPos: 'top-right',
        beepVolume: 80
    };
    
    // ==================== Public API ====================
    return {
        API: API,
        STORAGE: STORAGE,
        LIMITS: LIMITS,
        VIDEO_PRESETS: VIDEO_PRESETS,
        BITRATE_OPTIONS: BITRATE_OPTIONS,
        TIMESTAMP_POSITIONS: TIMESTAMP_POSITIONS,
        TEXTS: TEXTS,
        DEFAULTS: DEFAULTS,
        
        // Helper: Get text by key
        text: function(key) {
            return TEXTS[key] || key;
        },
        
        // Helper: Get API URL
        apiUrl: function(path) {
            return API.BASE_URL + path;
        }
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRConfig;
}
