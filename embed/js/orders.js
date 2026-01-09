/**
 * QR Scanner v7.25 - Orders Module
 * 
 * Chứa tất cả logic:
 * - Order history management
 * - Add/Delete/Search orders
 * - Export to Excel
 * - Auto cleanup old orders
 * 
 * Depends on: config.js, storage.js
 */

var QROrders = (function() {
    'use strict';
    
    var CONFIG = QRConfig;
    var STORAGE = QRStorage;
    
    // Orders state
    var orders = [];
    
    // Callbacks
    var callbacks = {
        onOrderAdded: null,
        onOrderDeleted: null,
        onOrdersCleared: null,
        onOrdersLoaded: null
    };
    
    // ==================== Load/Save ====================
    
    /**
     * Load orders from storage
     */
    function loadOrders() {
        orders = STORAGE.loadOrders();
        console.log('[Orders] Loaded ' + orders.length + ' orders');
        triggerCallback('onOrdersLoaded', orders);
        return orders;
    }
    
    /**
     * Save orders to storage
     */
    function saveOrders() {
        STORAGE.saveOrders(orders);
    }
    
    // ==================== Order Management ====================
    
    /**
     * Add new order
     * @param {object} orderData - { qrCode, duration, sizeMB, productCount, filename }
     * @returns {object} - Created order
     */
    function addOrder(orderData) {
        var now = new Date();
        
        var order = {
            id: Date.now(),
            qrCode: orderData.qrCode || 'Unknown',
            date: formatDateVN(now),
            time: formatTime(now),
            duration: orderData.duration || 0,
            sizeMB: orderData.sizeMB || '0',
            productCount: orderData.productCount || 0,
            filename: orderData.filename || '',
            createdAt: now.toISOString()
        };
        
        // Add to beginning of array
        orders.unshift(order);
        
        // Limit total orders
        if (orders.length > CONFIG.LIMITS.MAX_ORDERS) {
            orders = orders.slice(0, CONFIG.LIMITS.MAX_ORDERS);
        }
        
        saveOrders();
        
        console.log('[Orders] Added order:', order.qrCode);
        triggerCallback('onOrderAdded', order);
        
        return order;
    }
    
    /**
     * Delete order by ID
     * @param {number} orderId
     * @returns {boolean}
     */
    function deleteOrder(orderId) {
        var index = orders.findIndex(function(o) { return o.id === orderId; });
        
        if (index !== -1) {
            var deleted = orders.splice(index, 1)[0];
            saveOrders();
            
            console.log('[Orders] Deleted order:', deleted.qrCode);
            triggerCallback('onOrderDeleted', deleted);
            return true;
        }
        
        return false;
    }
    
    /**
     * Clear all orders
     */
    function clearAll() {
        orders = [];
        STORAGE.clearOrders();
        
        console.log('[Orders] All orders cleared');
        triggerCallback('onOrdersCleared');
    }
    
    // ==================== Search & Filter ====================
    
    /**
     * Search orders by QR code
     * @param {string} query - Search term
     * @returns {Array}
     */
    function search(query) {
        if (!query || query.trim() === '') {
            return orders;
        }
        
        var term = query.toLowerCase().trim();
        return orders.filter(function(order) {
            return order.qrCode.toLowerCase().includes(term) ||
                   order.date.includes(term) ||
                   order.time.includes(term);
        });
    }
    
    /**
     * Filter orders by date range
     * @param {string} startDate - Start date (DD/MM/YYYY)
     * @param {string} endDate - End date (DD/MM/YYYY)
     * @returns {Array}
     */
    function filterByDate(startDate, endDate) {
        var start = parseVNDate(startDate);
        var end = parseVNDate(endDate);
        
        if (!start || !end) return orders;
        
        // Set end to end of day
        end.setHours(23, 59, 59, 999);
        
        return orders.filter(function(order) {
            var orderDate = parseVNDate(order.date);
            return orderDate && orderDate >= start && orderDate <= end;
        });
    }
    
    /**
     * Get orders for today
     * @returns {Array}
     */
    function getTodayOrders() {
        var today = formatDateVN(new Date());
        return orders.filter(function(order) {
            return order.date === today;
        });
    }
    
    // ==================== Statistics ====================
    
    /**
     * Get order statistics
     * @returns {object}
     */
    function getStats() {
        var today = formatDateVN(new Date());
        var todayOrders = orders.filter(function(o) { return o.date === today; });
        
        var totalDuration = orders.reduce(function(sum, o) { return sum + (o.duration || 0); }, 0);
        var totalProducts = orders.reduce(function(sum, o) { return sum + (o.productCount || 0); }, 0);
        
        return {
            total: orders.length,
            today: todayOrders.length,
            totalDuration: totalDuration,
            totalProducts: totalProducts
        };
    }
    
    // ==================== Export ====================
    
    /**
     * Export orders to Excel (CSV format)
     * @param {Array} ordersToExport - Orders to export (default: all)
     * @param {string} filename - Filename (optional)
     */
    function exportToExcel(ordersToExport, filename) {
        var data = ordersToExport || orders;
        
        if (data.length === 0) {
            console.warn('[Orders] No orders to export');
            return;
        }
        
        // CSV header
        var csv = 'STT,Mã QR,Ngày,Giờ,Thời lượng (s),Dung lượng (MB),Số sản phẩm\n';
        
        // CSV rows
        data.forEach(function(order, index) {
            csv += [
                index + 1,
                '"' + order.qrCode.replace(/"/g, '""') + '"',
                order.date,
                order.time,
                order.duration,
                order.sizeMB,
                order.productCount
            ].join(',') + '\n';
        });
        
        // Download
        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || 'QRScanner_Orders_' + formatDateFile(new Date()) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('[Orders] Exported ' + data.length + ' orders');
    }
    
    // ==================== Auto Cleanup ====================
    
    /**
     * Delete orders older than X days
     * @param {number} days - Days to keep (default: AUTO_DELETE_DAYS)
     * @returns {number} - Number of deleted orders
     */
    function cleanupOldOrders(days) {
        days = days || CONFIG.LIMITS.AUTO_DELETE_DAYS;
        
        var cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        var originalCount = orders.length;
        
        orders = orders.filter(function(order) {
            var orderDate = parseVNDate(order.date);
            return orderDate && orderDate >= cutoffDate;
        });
        
        var deletedCount = originalCount - orders.length;
        
        if (deletedCount > 0) {
            saveOrders();
            console.log('[Orders] Cleaned up ' + deletedCount + ' old orders');
        }
        
        return deletedCount;
    }
    
    // ==================== Helpers ====================
    
    /**
     * Format date to DD/MM/YYYY
     */
    function formatDateVN(date) {
        return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
    }
    
    /**
     * Format time to HH:MM:SS
     */
    function formatTime(date) {
        return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
    }
    
    /**
     * Format date for filename
     */
    function formatDateFile(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }
    
    /**
     * Parse DD/MM/YYYY to Date
     */
    function parseVNDate(dateStr) {
        if (!dateStr) return null;
        var parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    
    /**
     * Pad number with leading zero
     */
    function pad(n) {
        return String(n).padStart(2, '0');
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
        loadOrders();
        
        // Auto cleanup on init
        cleanupOldOrders();
        
        console.log('[Orders] Initialized');
    }
    
    // ==================== Public API ====================
    return {
        // State
        getAll: function() { return orders.slice(); },
        getCount: function() { return orders.length; },
        getStats: getStats,
        
        // CRUD
        load: loadOrders,
        add: addOrder,
        delete: deleteOrder,
        clear: clearAll,
        
        // Search & Filter
        search: search,
        filterByDate: filterByDate,
        getTodayOrders: getTodayOrders,
        
        // Export
        exportToExcel: exportToExcel,
        
        // Cleanup
        cleanup: cleanupOldOrders,
        
        // Callbacks
        on: on,
        
        // Init
        init: init
    };
})();

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QROrders;
}
