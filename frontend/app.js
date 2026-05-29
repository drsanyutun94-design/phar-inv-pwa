// Pharma Inventory Manager - Frontend Application

// Offline Data Manager Class
class OfflineDataManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateAllConnectionStatusDisplays();
            // Trigger auto-sync when back online
            this.handleOnline();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateAllConnectionStatusDisplays();
        });
    }

    updateAllConnectionStatusDisplays() {
        // Update all connection status displays across the app
        // Using setTimeout to ensure DOM is updated before checking for elements
        setTimeout(() => {
            const statusElements = document.querySelectorAll('#connection-status');
            statusElements.forEach(element => {
                element.textContent = navigator.onLine ? 'Online' : 'Offline';
                element.className = navigator.onLine ? 'online-status' : 'offline-status';
            });
        }, 0);
    }

    showConnectionStatus() {
        this.updateAllConnectionStatusDisplays();
    }

    async handleOnline() {
        console.log('Device is back online, checking for updates...');
        // Process any pending purchases and transfers
        await this.processQueuedOperations();

        // Could implement auto-sync when connection is restored
        // await this.syncIfStale();
    }

    async processQueuedPurchases() {
        const self = this; // Capture the context

        try {
            // Get all pending purchases from IndexedDB
            const pendingPurchases = await window.getAllPendingPurchases();

            if (pendingPurchases.length === 0) {
                console.log('No pending purchases to sync');
                return { success: true, message: 'No pending purchases' };
            }

            console.log(`Processing ${pendingPurchases.length} pending purchases`);
            self.showLoadingMessage(`Syncing ${pendingPurchases.length} pending purchases...`);

            let successfulSyncs = 0;
            let failedSyncs = 0;

            for (const purchase of pendingPurchases) {
                try {
                    // Attempt to sync the purchase
                    self.showLoadingMessage(`Syncing purchase ${successfulSyncs + failedSyncs + 1} of ${pendingPurchases.length}...`);

                    const purchaseResponse = await fetch('/api/purchases', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(purchase.purchaseData)
                    });

                    const expiryResponse = await fetch('/api/expiries', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(purchase.expiryData)
                    });

                    if (purchaseResponse.ok && expiryResponse.ok) {
                       // Update local synced storage before updating pending status
                       if (purchase.purchaseData) {
                           await window.saveSyncedPurchase(purchase.purchaseData);
                       }

                       // Mark as synced successfully
                       await window.updatePendingPurchaseStatus(purchase.transactionId || purchase.id, 'synced');
                       successfulSyncs++;
                       console.log(`Successfully synced purchase ${purchase.transactionId || purchase.id}`);
                    } else {
                       // Keep as pending if sync failed
                       let errorMsg = 'Server returned error';
                       try {
                           const errorData = !purchaseResponse.ok ? await purchaseResponse.json() : await expiryResponse.json();
                           if (errorData.error) errorMsg = errorData.error;
                       } catch (e) {}
                       console.error(`Failed to sync purchase ${purchase.transactionId || purchase.id}: ${errorMsg}`);
                       failedSyncs++;
                    }                } catch (error) {
                    console.error(`Error syncing purchase ${purchase.transactionId || purchase.id}:`, error);
                    failedSyncs++;
                }
            }

            self.hideLoadingMessage();
            console.log(`Sync completed: ${successfulSyncs} successful, ${failedSyncs} failed`);
            return {
                success: true,
                successful: successfulSyncs,
                failed: failedSyncs,
                message: `Processed ${pendingPurchases.length} pending purchases`
            };
        } catch (error) {
            self.hideLoadingMessage();
            console.error('Error processing queued purchases:', error);
            return { success: false, error: error.message };
        }
    }

    // Function to process queued transfers
    async processQueuedTransfers() {
        const self = this; // Capture the context

        try {
            // Get all pending transfers from IndexedDB
            const pendingTransfers = await window.getAllPendingTransfers();

            if (pendingTransfers.length === 0) {
                console.log('No pending transfers to sync');
                return { success: true, message: 'No pending transfers' };
            }

            console.log(`Processing ${pendingTransfers.length} pending transfers`);
            self.showLoadingMessage(`Syncing ${pendingTransfers.length} pending transfers...`);

            let successfulSyncs = 0;
            let failedSyncs = 0;

            for (const transfer of pendingTransfers) {
                try {
                    // Attempt to sync the transfer
                    self.showLoadingMessage(`Syncing transfer ${successfulSyncs + failedSyncs + 1} of ${pendingTransfers.length}...`);

                    const transferResponse = await fetch('/api/transfers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(transfer)
                    });

                    if (transferResponse.ok) {
                        // Update local synced storage before updating pending status
                        await window.saveSyncedTransfer(transfer);

                        // Mark as synced successfully
                        await window.updatePendingTransferStatus(transfer.transactionId, 'synced');
                        successfulSyncs++;
                        console.log(`Successfully synced transfer ${transfer.transactionId}`);
                    } else {
                        // Keep as pending if sync failed
                        let errorMsg = 'Server returned error';
                        try {
                            const errorData = await transferResponse.json();
                            if (errorData.error) errorMsg = errorData.error;
                        } catch (e) {}
                        console.error(`Failed to sync transfer ${transfer.transactionId}: ${errorMsg}`);
                        failedSyncs++;
                    }
                } catch (error) {
                    console.error(`Error syncing transfer ${transfer.transactionId}:`, error);
                    failedSyncs++;
                }
            }

            self.hideLoadingMessage();
            console.log(`Transfer sync completed: ${successfulSyncs} successful, ${failedSyncs} failed`);
            return {
                success: true,
                successful: successfulSyncs,
                failed: failedSyncs,
                message: `Processed ${pendingTransfers.length} pending transfers`
            };
        } catch (error) {
            self.hideLoadingMessage();
            console.error('Error processing queued transfers:', error);
            return { success: false, error: error.message };
        }
    }

    // Combined function to process all queued operations
    async processQueuedOperations() {
        const purchaseResult = await this.processQueuedPurchases();
        const transferResult = await this.processQueuedTransfers();
        const deletionResult = await this.processQueuedDeletions();
        const updateResult = await this.processQueuedUpdates();

        return {
            purchaseSync: purchaseResult,
            transferSync: transferResult,
            deletionSync: deletionResult,
            updateSync: updateResult,
            success: purchaseResult.success || transferResult.success || deletionResult.success || updateResult.success
        };
    }

    // Function to process queued deletions
    async processQueuedDeletions() {
        return window.processQueuedDeletions();
    }

    // Function to process queued updates
    async processQueuedUpdates() {
        return window.processQueuedUpdates();
    }

    async syncIfStale() {
        const lastSync = await getLastSyncTime();
        const now = new Date();

        // Sync if data is older than 1 hour (configurable)
        if (!lastSync || (now - new Date(lastSync)) > 60 * 60 * 1000) {
            console.log('Data is stale, syncing with Google Sheets...');
            return await syncWithGoogleSheets();
        }
        return { success: true, message: 'Data is up to date' };
    }

    // Method to manually trigger sync
    async manualSync() {
        if (!this.isOnline) {
            alert('Cannot sync while offline. Please connect to the internet.');
            return { success: false, error: 'Offline' };
        }

        // First sync inventory data
        const result = await syncWithGoogleSheets();

        // Then sync low stock data
        const lowStockResult = await syncLowStockData();

        // Then sync expired date data
        const expiredDateResult = await syncExpiredDateData();

        // Then process any queued purchases, transfers, deletions, and updates
        const purchaseResult = await this.processQueuedPurchases();
        const transferResult = await this.processQueuedTransfers();
        const deletionResult = await this.processQueuedDeletions();
        const updateResult = await this.processQueuedUpdates();

        if (result.success) {
            await updateLastSyncTime();
            console.log('Manual sync completed successfully');
        }

        // Combine results
        return {
            inventorySync: result,
            lowStockSync: lowStockResult,
            expiredDateSync: expiredDateResult,
            purchaseSync: purchaseResult,
            transferSync: transferResult,
            deletionSync: deletionResult,
            updateSync: updateResult,
            success: result.success
        };
    }

    // Helper function to show loading status
    showLoadingMessage(message) {
        // Create or update a loading indicator element
        let loader = document.getElementById('loading-indicator');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loading-indicator';
            loader.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 15px 25px;
                border-radius: 5px;
                z-index: 10000;
                font-family: Arial, sans-serif;
                text-align: center;
            `;
            document.body.appendChild(loader);
        }
        loader.textContent = message;
        loader.style.display = 'block';
    }

    // Helper function to hide loading status
    hideLoadingMessage() {
        const loader = document.getElementById('loading-indicator');
        if (loader) {
            loader.style.display = 'none';
        }
    }
}

// Database constants
const DB_NAME = 'InventoryDB';
const DB_VERSION = 2;
const ITEM_STORE_NAME = 'items';
let db;

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const mainContent = document.getElementById('main-content');
    const navItems = document.querySelectorAll('.nav-item');

    // Current tab state
    let currentTab = 'dashboard';
    let lastSupplier = '';
    let lastTransferDirection = '';
    let lastFocReason = '';
    let lastPaymentMethods = [{ amount: '', method: '' }];
    let isInitializing = false;
    let dbPromise = null;

    // Helper to safely set text content
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Helper to safely set inner HTML
    const safeSetHTML = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    // Add listener for foc-reason persistence (exists in index.html)
    const focReasonInputGlobal = document.getElementById('foc-reason');
    if (focReasonInputGlobal) {
        focReasonInputGlobal.addEventListener('input', function() {
            lastFocReason = this.value;
        });
    }

    // Offline data manager
    let offlineManager;

    // Initialize the app
    initApp();

    async function initApp() {
        // Register service worker for PWA functionality
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    console.log('Service Worker registered with scope:', registration.scope);
                })
                .catch(function(error) {
                    console.log('Service Worker registration failed:', error);
                });
        }

        // Initialize offline manager
        offlineManager = new OfflineDataManager();

        // Initialize database and load data BEFORE anything else
        await initializeAndLoadData();

        // Set up navigation
        setupNavigation();

        // Load initial dashboard (only after DB is ready)
        loadDashboard();
    }

    // Initialize IndexedDB
    function initDB() {
        if (dbPromise) return dbPromise;
        
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Database failed to open');
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('Database opened successfully');

                // Handle version change (e.g., from another tab)
                db.onversionchange = () => {
                    console.warn('Database version change detected. Closing connection to allow upgrade.');
                    db.close();
                    db = null;
                };

                db.onclose = () => {
                    console.warn('Database connection was closed unexpectedly.');
                    db = null;
                };

                resolve(db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Create object store for items if it doesn't exist
                if (!db.objectStoreNames.contains(ITEM_STORE_NAME)) {
                    const objectStore = db.createObjectStore(ITEM_STORE_NAME, { keyPath: 'code' });

                    // Create indexes for efficient searching
                    objectStore.createIndex('name', 'name', { unique: false });
                    objectStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }

                // Create object store for pending purchases if it doesn't exist
                if (!db.objectStoreNames.contains('pendingPurchases')) {
                    const pendingPurchasesStore = db.createObjectStore('pendingPurchases', { keyPath: 'transactionId' });

                    // Create indexes for efficient processing
                    pendingPurchasesStore.createIndex('timestamp', 'timestamp', { unique: false });
                    pendingPurchasesStore.createIndex('status', 'status', { unique: false });
                }

                // Create object store for synced purchases (from server) if it doesn't exist
                if (!db.objectStoreNames.contains('syncedPurchases')) {
                    const syncedPurchasesStore = db.createObjectStore('syncedPurchases', { keyPath: 'transactionId' });

                    // Create indexes for efficient processing
                    syncedPurchasesStore.createIndex('purchaseDate', 'purchaseDate', { unique: false });
                    syncedPurchasesStore.createIndex('itemName', 'itemName', { unique: false });
                }

                // Create object store for synced transfers (from server) if it doesn't exist
                if (!db.objectStoreNames.contains('syncedTransfers')) {
                    const syncedTransfersStore = db.createObjectStore('syncedTransfers', { keyPath: 'transactionId' });

                    // Create indexes for efficient processing
                    syncedTransfersStore.createIndex('date', 'date', { unique: false });
                    syncedTransfersStore.createIndex('itemName', 'itemName', { unique: false });
                    syncedTransfersStore.createIndex('itemCode', 'itemCode', { unique: false });
                } else {
                    // Handle version upgrade
                    if (e.oldVersion < 2) {
                        db.deleteObjectStore('syncedTransfers');
                        const syncedTransfersStore = db.createObjectStore('syncedTransfers', { keyPath: 'transactionId' });
                        syncedTransfersStore.createIndex('date', 'date', { unique: false });
                        syncedTransfersStore.createIndex('itemName', 'itemName', { unique: false });
                        syncedTransfersStore.createIndex('itemCode', 'itemCode', { unique: false });
                    }
                }

                // Create object store for low stock data if it doesn't exist
                if (!db.objectStoreNames.contains('lowStock')) {
                    const lowStockStore = db.createObjectStore('lowStock', { keyPath: 'medicineName' });
    
                    // Create indexes for efficient processing
                    lowStockStore.createIndex('currentStock', 'currentStock', { unique: false });
                    lowStockStore.createIndex('soldLast30Days', 'soldLast30Days', { unique: false });
                    lowStockStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }

                // Create object store for expired date data if it doesn't exist
                if (!db.objectStoreNames.contains('expiredDate')) {
                    const expiredDateStore = db.createObjectStore('expiredDate', { keyPath: 'medicineName' });
    
                    // Create indexes for efficient processing
                    expiredDateStore.createIndex('expiredDate', 'expiredDate', { unique: false });
                    expiredDateStore.createIndex('currentStock', 'currentStock', { unique: false });
                    expiredDateStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }
            };
        });
        return dbPromise;
    }

    // Helper function to add/update items
    function addItem(item) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([ITEM_STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(ITEM_STORE_NAME);
            const request = objectStore.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all items
    function getAllItems() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([ITEM_STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(ITEM_STORE_NAME);
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to add a pending purchase
    function addPendingPurchase(purchaseData) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const purchaseRecord = {
                ...purchaseData,
                timestamp: purchaseData.timestamp || new Date().toISOString(),
                status: purchaseData.status || 'pending'
            };

            const request = objectStore.put(purchaseRecord);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all pending purchases
    function getAllPendingPurchases() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readonly');
            const objectStore = transaction.objectStore('pendingPurchases');
            const request = objectStore.index('status').getAll(IDBKeyRange.only('pending'));

            request.onsuccess = (event) => {
                const results = event.target.result;
                // Filter to only include purchases (not transfers, updates, or deletions)
                const pendingPurchases = results.filter(item => item.type === 'purchase' && (!item.action || item.action === 'add'));
                resolve(pendingPurchases);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to update purchase status
    function updatePendingPurchaseStatus(id, status) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            objectStore.get(id).onsuccess = function(event) {
                const purchase = event.target.result;
                purchase.status = status;

                const updateRequest = objectStore.put(purchase);
                updateRequest.onsuccess = () => resolve(updateRequest.result);
                updateRequest.onerror = () => reject(updateRequest.error);
            };
        });
    }

    // Helper function to get all pending purchases (returns Promise)
    function getAllPendingPurchasesHelper() {
        return new Promise((resolve, reject) => {
            if (!db) {
                resolve([]);
                return;
            }
            const transaction = db.transaction(['pendingPurchases'], 'readonly');
            const objectStore = transaction.objectStore('pendingPurchases');
            const request = objectStore.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to update transfer status
    function updatePendingTransferStatus(id, status) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            objectStore.get(id).onsuccess = function(event) {
                const transfer = event.target.result;
                transfer.status = status;

                const updateRequest = objectStore.put(transfer);
                updateRequest.onsuccess = () => resolve(updateRequest.result);
                updateRequest.onerror = () => reject(updateRequest.error);
            };
        });
    }

    // Helper function to delete a pending purchase
    function deletePendingPurchase(transactionId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');
            const request = objectStore.delete(transactionId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to save a synced purchase to IndexedDB
    function saveSyncedPurchase(purchase) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('syncedPurchases');
            const request = objectStore.put(purchase);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all synced purchases
    function getAllSyncedPurchases() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedPurchases'], 'readonly');
            const objectStore = transaction.objectStore('syncedPurchases');
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to delete a synced purchase
    function deleteSyncedPurchase(transactionId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('syncedPurchases');
            const request = objectStore.delete(transactionId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to save a synced transfer to IndexedDB
    function saveSyncedTransfer(transfer) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedTransfers'], 'readwrite');
            const objectStore = transaction.objectStore('syncedTransfers');
            const request = objectStore.put(transfer);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all synced transfers
    function getAllSyncedTransfers() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedTransfers'], 'readonly');
            const objectStore = transaction.objectStore('syncedTransfers');
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to delete a synced transfer
    function deleteSyncedTransfer(transactionId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedTransfers'], 'readwrite');
            const objectStore = transaction.objectStore('syncedTransfers');
            const request = objectStore.delete(transactionId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to clear all pending purchases
    function clearPendingPurchases() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to clear all synced purchases (for refresh)
    function clearSyncedPurchases() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('syncedPurchases');
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    // Helper function to add/update low stock item
        function addLowStockItem(item) {
            return new Promise((resolve, reject) => {
            const transaction = db.transaction(['lowStock'], 'readwrite');
            const objectStore = transaction.objectStore('lowStock');
            const request = objectStore.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all low stock items
    function getAllLowStockItems() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['lowStock'], 'readonly');
            const objectStore = transaction.objectStore('lowStock');
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to clear low stock store
    function clearLowStockStore() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['lowStock'], 'readwrite');
            const objectStore = transaction.objectStore('lowStock');
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to add/update expired date item
    function addExpiredDateItem(item) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['expiredDate'], 'readwrite');
            const objectStore = transaction.objectStore('expiredDate');
            const request = objectStore.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all expired date items
    function getAllExpiredDateItems() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['expiredDate'], 'readonly');
            const objectStore = transaction.objectStore('expiredDate');
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to clear expired date store
    function clearExpiredDateStore() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['expiredDate'], 'readwrite');
            const objectStore = transaction.objectStore('expiredDate');
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    // Helper function to clear all synced transfers (for refresh)
    function clearSyncedTransfers() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['syncedTransfers'], 'readwrite');
            const objectStore = transaction.objectStore('syncedTransfers');
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Helper function to get all pending transfers
    function getAllPendingTransfers() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readonly');
            const objectStore = transaction.objectStore('pendingPurchases');
            const request = objectStore.index('status').getAll(IDBKeyRange.only('pending'));

            request.onsuccess = function(event) {
                // Filter to only include transfers (not purchases)
                const allPending = event.target.result;
                const pendingTransfers = allPending.filter(item => item.type === 'transfer');
                resolve(pendingTransfers);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Synchronization functions
    async function syncWithGoogleSheets() {
        try {
            // Check if online first
            if (!navigator.onLine) {
                throw new Error('No internet connection available');
            }

            // Fetch data from Google Sheets
            const response = await fetch('/api/stock');
            if (!response.ok) {
                let errorMessage = 'Failed to fetch data from server';
                try {
                    const errorData = await response.json();
                    if (errorData.details) {
                        errorMessage += `: ${errorData.details}`;
                    } else if (errorData.error) {
                        errorMessage += `: ${errorData.error}`;
                    }
                } catch (e) {
                    // Fallback to status text if JSON parsing fails
                    errorMessage += `: ${response.statusText}`;
                }
                console.error('Sync Error:', errorMessage);
                throw new Error(errorMessage);
            }
            const data = await response.json();

            // Process the data to match our schema
            const items = data.map(row => ({
                code: row.code,
                name: row.name,
                unit: row.unit,
                mainStore: row.mainStore || 0,
                subStore: row.subStore || 0,
                lastUpdated: new Date()
            }));

            // Clear existing data and add new data in a single transaction
            if (db) {
                await clearItemStore();
                
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction([ITEM_STORE_NAME], 'readwrite');
                    const objectStore = transaction.objectStore(ITEM_STORE_NAME);
                    
                    for (const item of items) {
                        objectStore.put(item);
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`Synced ${items.length} items from Google Sheets`);
                        resolve({ success: true, count: items.length });
                    };
                    
                    transaction.onerror = () => {
                        console.error('Error in batch item sync:', transaction.error);
                        reject(transaction.error);
                    };
                });
            }
        } catch (error) {
            console.error('Sync failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Synchronization function for low stock data
    async function syncLowStockData() {
        try {
            // Check if online first
            if (!navigator.onLine) {
                throw new Error('No internet connection available');
            }

            // Fetch low stock data from Google Sheets
            const response = await fetch('/api/lowstock');
            if (!response.ok) {
                let errorMessage = 'Failed to fetch low stock data from server';
                try {
                    const errorData = await response.json();
                    if (errorData.details) {
                        errorMessage += `: ${errorData.details}`;
                    } else if (errorData.error) {
                        errorMessage += `: ${errorData.error}`;
                    }
                } catch (e) {
                    errorMessage += `: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            const data = await response.json();

            // Process the data to match our schema
            const lowStockItems = data.map(row => ({
                medicineName: row.medicineName || row['Medicine name'] || '',
                currentStock: parseInt(row.currentStock || row['Current stock']) || 0,
                soldLast30Days: parseInt(row.soldLast30Days || row['Items sold within last 30 days']) || 0,
                lastUpdated: new Date()
            }));

            // Clear existing data and add new data in a single transaction
            if (db) {
                await clearLowStockStore();
                
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(['lowStock'], 'readwrite');
                    const objectStore = transaction.objectStore('lowStock');
                    
                    for (const item of lowStockItems) {
                        objectStore.put(item);
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`Synced ${lowStockItems.length} low stock items from Google Sheets`);
                        resolve({ success: true, count: lowStockItems.length });
                    };
                    
                    transaction.onerror = () => {
                        console.error('Error in batch low stock sync:', transaction.error);
                        reject(transaction.error);
                    };
                });
            }
        } catch (error) {
            console.error('Low stock sync failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Synchronization function for expired date data
    async function syncExpiredDateData() {
        try {
            // Check if online first
            if (!navigator.onLine) {
                throw new Error('No internet connection available');
            }

            // Fetch expired date data from Google Sheets
            const response = await fetch('/api/expireddate');
            if (!response.ok) {
                let errorMessage = 'Failed to fetch expired date data from server';
                try {
                    const errorData = await response.json();
                    if (errorData.details) {
                        errorMessage += `: ${errorData.details}`;
                    } else if (errorData.error) {
                        errorMessage += `: ${errorData.error}`;
                    }
                } catch (e) {
                    errorMessage += `: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            const data = await response.json();

            // Process the data to match our schema
            const expiredDateItems = data.map(row => ({
                medicineName: row.medicineName || row['Medicine name'] || '',
                expiredDate: row.expiredDate || row['Expired date'] || '',
                currentStock: parseInt(row.currentStock || row['Current stock']) || 0,
                lastUpdated: new Date()
            }));

            // Clear existing data and add new data in a single transaction
            if (db) {
                await clearExpiredDateStore();
                
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(['expiredDate'], 'readwrite');
                    const objectStore = transaction.objectStore('expiredDate');
                    
                    for (const item of expiredDateItems) {
                        objectStore.put(item);
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`Synced ${expiredDateItems.length} expired date items from Google Sheets`);
                        resolve({ success: true, count: expiredDateItems.length });
                    };
                    
                    transaction.onerror = () => {
                        console.error('Error in batch expired date sync:', transaction.error);
                        reject(transaction.error);
                    };
                });
            }
        } catch (error) {
            console.error('Expired date sync failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function clearItemStore() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([ITEM_STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(ITEM_STORE_NAME);
            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Function to get last sync timestamp
    async function getLastSyncTime() {
        return localStorage.getItem('lastSyncTime');
    }

    // Function to update last sync timestamp
    async function updateLastSyncTime() {
        localStorage.setItem('lastSyncTime', new Date().toISOString());
    }

    // Search functions using local IndexedDB first
    async function searchItems(query) {
        if (!db) {
            console.error('Database not initialized');
            return [];
        }

        try {
            const allItems = await getAllItems();

            // Filter items based on query (case-insensitive search on code and name)
            const filteredItems = allItems.filter(item =>
                item.code && item.code.toLowerCase().includes(query.toLowerCase()) ||
                item.name && item.name.toLowerCase().includes(query.toLowerCase())
            );

            return filteredItems;
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    // Function to initialize the database and populate with data if empty
    async function initializeAndLoadData() {
        if (isInitializing) return;
        isInitializing = true;
        try {
            await initDB();

            // Check if we have data in the database
            const itemCount = (await getAllItems()).length;

            // Always sync purchases and transfers from Google Sheets when online and page refreshes
            if (navigator.onLine) {
                await syncPurchasesFromGoogleSheets();
                await syncTransfersFromGoogleSheets();
                console.log('Purchases and transfers synced from Google Sheets on page load');
            }

            if (itemCount === 0) {
                // If no data, attempt to sync from Google Sheets if online
                if (navigator.onLine) {
                    await syncWithGoogleSheets();
                    await updateLastSyncTime();
                } else {
                    console.warn('No data available and device is offline');
                }
            }
        } catch (error) {
            console.error('Failed to initialize and load data:', error);
        } finally {
            isInitializing = false;
        }
    }

    // Function to sync purchases from Google Sheets to IndexedDB
    async function syncPurchasesFromGoogleSheets() {
        try {
            console.log('Syncing purchases from Google Sheets...');

            // Fetch all purchases from Google Sheets - use cache: 'no-cache' to ensure we get fresh data
            const response = await fetch('/api/purchases', { cache: 'no-cache' });
            if (!response.ok) {
                let errorMessage = 'Error fetching purchases from Google Sheets';
                try {
                    const errorData = await response.json();
                    if (errorData.details) {
                        errorMessage += `: ${errorData.details}`;
                    } else if (errorData.error) {
                        errorMessage += `: ${errorData.error}`;
                    }
                } catch (e) {
                    errorMessage += `: ${response.statusText}`;
                }
                console.error(errorMessage);
                return null;
            }

            const serverTransactions = await response.json();
            console.log(`Fetched ${serverTransactions.length} purchases from Google Sheets`);

            // Clear existing synced purchases and save fresh data to IndexedDB
            if (db) {
                await clearSyncedPurchases();
                
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['syncedPurchases'], 'readwrite');
                    const objectStore = transaction.objectStore('syncedPurchases');
                    
                    let savedCount = 0;
                    for (const purchase of serverTransactions) {
                        if (purchase.transactionId) {
                            objectStore.put(purchase);
                            savedCount++;
                        }
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`Saved ${savedCount} purchases to IndexedDB syncedPurchases store`);
                        resolve();
                    };
                    
                    transaction.onerror = () => {
                        console.error('Error saving batch purchases:', transaction.error);
                        reject(transaction.error);
                    };
                });

                // RECONCILIATION: Check pendingPurchases and remove any that are no longer in the spreadsheet
                // This handles cases where data was deleted directly from Google Sheets
                try {
                    const allPending = await getAllPendingPurchasesHelper();
                    const serverTransactionIds = new Set(serverTransactions.map(t => t.transactionId));
                    const now = new Date();
                    
                    for (const pending of allPending) {
                        if (pending.type === 'purchase' || pending.type === 'purchase_deletion' || pending.type === 'purchase_update') {
                            const id = pending.transactionId || pending.id;
                            if (serverTransactionIds.has(id)) {
                                // It's confirmed on server, remove from pending
                                console.log(`Reconciliation: Removing confirmed pending purchase ${id}`);
                                await deletePendingPurchase(id);
                            } else if (pending.status === 'synced') {
                                // Marked as synced but not on server yet. Check if it's old enough (5 mins)
                                // to assume it was manually deleted from the spreadsheet
                                const syncTime = new Date(pending.timestamp);
                                if (now - syncTime > 5 * 60 * 1000) {
                                    console.log(`Reconciliation: Removing orphaned pending purchase ${id} (not found on server after 5 mins)`);
                                    await deletePendingPurchase(id);
                                }
                            }
                        }
                    }
                } catch (reconcileError) {
                    console.error('Error during pending purchases reconciliation:', reconcileError);
                }

                return serverTransactions;
            }
            return [];
        } catch (error) {
            console.error('Error syncing purchases from Google Sheets:', error);
            return null;
        }
    }

    // Function to sync transfers from Google Sheets to IndexedDB
    async function syncTransfersFromGoogleSheets() {
        try {
            console.log('Syncing transfers from Google Sheets...');

            // Fetch all transfers from Google Sheets - use cache: 'no-cache' to ensure we get fresh data
            const response = await fetch('/api/transfers', { cache: 'no-cache' });
            if (!response.ok) {
                console.error('Error fetching transfers from Google Sheets');
                return null;
            }

            const serverTransactions = await response.json();
            console.log(`Fetched ${serverTransactions.length} transfers from Google Sheets`);

            // Clear existing synced transfers and save fresh data to IndexedDB
            if (db) {
                await clearSyncedTransfers();
                
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['syncedTransfers'], 'readwrite');
                    const objectStore = transaction.objectStore('syncedTransfers');
                    
                    let savedCount = 0;
                    for (const transfer of serverTransactions) {
                        if (transfer.transactionId) {
                            objectStore.put(transfer);
                            savedCount++;
                        }
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`Saved ${savedCount} transfers to IndexedDB syncedTransfers store`);
                        resolve();
                    };
                    
                    transaction.onerror = () => {
                        console.error('Error saving batch transfers:', transaction.error);
                        reject(transaction.error);
                    };
                });

                // RECONCILIATION: Check pendingPurchases for transfers and remove any that are no longer in the spreadsheet
                try {
                    const allPending = await getAllPendingPurchasesHelper();
                    const serverTransactionIds = new Set(serverTransactions.map(t => t.transactionId));
                    const now = new Date();
                    
                    for (const pending of allPending) {
                        if (pending.type === 'transfer' || pending.type === 'transfer_deletion' || pending.type === 'transfer_update') {
                            const id = pending.transactionId || pending.id;
                            if (serverTransactionIds.has(id)) {
                                // It's confirmed on server, remove from pending
                                console.log(`Reconciliation: Removing confirmed pending transfer ${id}`);
                                await deletePendingPurchase(id);
                            } else if (pending.status === 'synced') {
                                // Marked as synced but not on server yet. Check if it's old enough (5 mins)
                                const syncTime = new Date(pending.timestamp);
                                if (now - syncTime > 5 * 60 * 1000) {
                                    console.log(`Reconciliation: Removing orphaned pending transfer ${id} (not found on server after 5 mins)`);
                                    await deletePendingPurchase(id);
                                }
                            }
                        }
                    }
                } catch (reconcileError) {
                    console.error('Error during pending transfers reconciliation:', reconcileError);
                }

                return serverTransactions;
            }
            return [];
        } catch (error) {
            console.error('Error syncing transfers from Google Sheets:', error);
            return null;
        }
    }

    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();

                const tabName = this.getAttribute('data-tab');

                // Update active state
                navItems.forEach(navItem => navItem.classList.remove('active'));
                this.classList.add('active');

                // Load the corresponding tab
                loadTab(tabName);
                currentTab = tabName;
            });
        });
    }

    function loadTab(tabName, skipSync = false) {
        switch(tabName) {
            case 'dashboard':
                loadDashboard(skipSync);
                break;
            case 'search':
                loadSearchTab();
                break;
            case 'add':
                loadAddTab(skipSync);
                break;
            case 'transfer':
                loadTransferTab(skipSync);
                break;
            case 'lowstock':
                loadLowStockTab();
    break;
            case 'expireddate':
                loadExpiredDateTab();
                break;
            default:
                loadDashboard(skipSync);
        }
    }

    function loadDashboard(skipSync = false) {
        mainContent.innerHTML = `
            <div class="card">
                <h2>Pharma Inventory Dashboard</h2>
                <p>Welcome to your pharmacy inventory manager. Use the navigation below to search items, add new inventory, or transfer stock between stores.</p>
                <button id="sync-all-btn" class="btn" style="margin-top: 15px; background-color: #4caf50;">
                    <i class="material-icons" style="vertical-align: middle; font-size: 18px; margin-right: 5px;">sync</i>
                    <span style="vertical-align: middle;">Sync All Data Now</span>
                </button>
            </div>

            <div class="card">
                <h3>Quick Stats</h3>
                <p>Total Items: <span id="total-items">Loading...</span></p>
                <p>Items Low Stock: <span id="low-stock">Loading...</span></p>
                <p>Expiring Soon: <span id="expiring-soon">Loading...</span></p>
            </div>

            <div class="card">
                <h3>Daily In Transactions (Recent)</h3>
                <div id="daily-in-transactions">
                    <p>Loading transactions...</p>
                </div>
            </div>
        `;

        // Set up manual sync button
        const syncBtn = document.getElementById('sync-all-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async function() {
                if (!navigator.onLine) {
                    alert('You are offline. Please connect to the internet to sync.');
                    return;
                }

                this.disabled = true;
                const originalContent = this.innerHTML;
                this.innerHTML = '<i class="material-icons" style="vertical-align: middle; font-size: 18px; margin-right: 5px; animation: spin 2s linear infinite;">sync</i> <span style="vertical-align: middle;">Syncing...</span>';
                
                try {
                    // Centralized sync for all data types
                    await syncWithGoogleSheets();
                    await syncLowStockData();
                    await syncExpiredDateData();
                    await syncPurchasesFromGoogleSheets();
                    await syncTransfersFromGoogleSheets();
                    
                    await updateLastSyncTime();
                    
                    alert('All data synced successfully from Google Sheets!');
                    
                    // Reload the dashboard to show fresh data
                    loadDashboard();
                } catch (error) {
                    console.error('Manual sync failed:', error);
                    alert('Sync failed: ' + error.message);
                    this.disabled = false;
                    this.innerHTML = originalContent;
                }
            });
        }

        // Load stats and transactions
        loadDashboardStats();
        loadDailyInTransactions(skipSync);
    }

    async function loadDashboardStats() {
        try {
            // First try to get stats from local IndexedDB
            // Check if db is initialized before accessing it
            if (db) {
                const items = await getAllItems();
                safeSetText('total-items', items.length);
            } else {
                safeSetText('total-items', '0');
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            safeSetText('total-items', 'Error');
        }

        // Load low stock count
        try {
            if (db) {
                // Try to sync low stock data if online
                if (navigator.onLine) {
                    await syncLowStockData();
                }
                
                const lowStockItems = await getAllLowStockItems();
                safeSetText('low-stock', lowStockItems.length);
            } else {
                safeSetText('low-stock', '0');
            }
        } catch (error) {
            console.error('Error loading low stock count:', error);
            safeSetText('low-stock', 'Error');
        }

        // Load expiring soon count (expired date items)
        try {
            if (db) {
                // Try to sync expired date data if online
                if (navigator.onLine) {
                    await syncExpiredDateData();
                }
                
                const expiredDateItems = await getAllExpiredDateItems();
                safeSetText('expiring-soon', expiredDateItems.length);
            } else {
                safeSetText('expiring-soon', '0');
            }
        } catch (error) {
            console.error('Error loading expiring soon count:', error);
            safeSetText('expiring-soon', 'Error');
        }
    }

    async function loadDailyInTransactions(skipSync = false) {
        try {
            let transactions = [];

            // First get local pending purchases from IndexedDB
            const allPending = await getAllPendingPurchasesHelper();
            
            // Get pending deletions to filter them out
            const pendingDeletions = new Set(
                allPending
                    .filter(item => item.action === 'delete' || item.type === 'purchase_deletion')
                    .map(item => item.transactionId || item.id)
            );

            if (db) {
                const purchaseTransactions = allPending
                    .filter(item => item.type === 'purchase' && !pendingDeletions.has(item.transactionId))
                    .map(item => ({
                        ...item.purchaseData,
                        transactionId: item.transactionId,
                        isPending: true
                    }));
                transactions = [...transactions, ...purchaseTransactions];
            }

            // Then get data from server if online and sync to IndexedDB
            if (navigator.onLine && !skipSync) {
                try {
                    const serverTransactions = await syncPurchasesFromGoogleSheets();
                    
                    if (serverTransactions !== null) {
                        // Filter out pending deletions
                        const filteredServerTransactions = serverTransactions.filter(t => !pendingDeletions.has(t.transactionId));

                        // Combine with pending
                        const seenIds = new Set(transactions.map(t => t.transactionId));
                        for (const serverTxn of filteredServerTransactions) {
                            if (!seenIds.has(serverTxn.transactionId)) {
                                transactions.push(serverTxn);
                            }
                        }
                    } else if (db) {
                        // If sync failed (returned null), fallback to IndexedDB data
                        const syncedPurchases = await getAllSyncedPurchases();
                        const seenIds = new Set(transactions.map(t => t.transactionId));
                        for (const synced of syncedPurchases) {
                            if (!seenIds.has(synced.transactionId) && !pendingDeletions.has(synced.transactionId)) {
                                transactions.push(synced);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in loadDailyInTransactions sync:', error);
                }
            } else if (db) {
                // If offline, merge local pending with synced data from IndexedDB
                const syncedPurchases = await getAllSyncedPurchases();
                
                // Combine synced server data with local pending, avoiding duplicates and respect deletions
                const seenIds = new Set(transactions.map(t => t.transactionId));
                for (const synced of syncedPurchases) {
                    const id = synced.transactionId || synced.id;
                    if (!seenIds.has(id) && !pendingDeletions.has(id)) {
                        transactions.push(synced);
                    }
                }
            }

            if (transactions.length === 0) {
                safeSetHTML('daily-in-transactions', '<p>No daily in transactions found</p>');
                return;
            }

            // Sort by date (descending)
            transactions.sort((a, b) => {
                const dateA = new Date(a.purchaseDate || a.date);
                const dateB = new Date(b.purchaseDate || b.date);
                return dateB - dateA;
            });

            // Limit to top 10 for dashboard
            const displayTransactions = transactions.slice(0, 10);

            let transactionsHtml = '<table class="transaction-table"><thead><tr><th>Date</th><th>Item Name</th><th>Quantity</th><th>Total Price</th><th>Actions</th></tr></thead><tbody>';

            displayTransactions.forEach(transaction => {
                const id = transaction.transactionId || transaction.id || '';
                const date = transaction.purchaseDate || transaction.date || 'N/A';
                const itemName = transaction.itemName || transaction.name || 'N/A';
                const quantity = transaction.packageScheme?.numberOfBoxes ?
                    transaction.packageScheme.numberOfBoxes * transaction.packageScheme.cardsPerBox * transaction.packageScheme.unitsPerCard :
                    transaction.quantity || 'N/A';
                const totalPrice = transaction.totalPrice || 'N/A';

                transactionsHtml += `
                    <tr data-id="${id}" data-type="purchase" class="${transaction.isPending ? 'pending-row' : ''}">
                        <td>${date}</td>
                        <td>${itemName}</td>
                        <td>${quantity}</td>
                        <td>${totalPrice}</td>
                        <td>
                            <button class="btn-edit" onclick="showTransactionInAddForm('${id}', 'purchase')">Edit</button>
                            <button class="btn-delete" onclick="deleteTransaction('${id}', 'purchase')">Delete</button>
                        </td>
                    </tr>
                `;
            });

            transactionsHtml += '</tbody></table>';
            safeSetHTML('daily-in-transactions', transactionsHtml);
        } catch (error) {
            console.error('Error loading daily in transactions:', error);
            safeSetHTML('daily-in-transactions', '<p>Error loading transactions</p>');
        }
    }

    // Helper to render a transfer table
    function renderTransferTable(containerId, transactions, showReason = false) {
        if (transactions.length === 0) {
            safeSetHTML(containerId, '<p>No transactions found</p>');
            return;
        }

        let transactionsHtml = `<table class="transaction-table"><thead><tr><th>Date</th><th>Item Name</th><th>Quantity</th>${showReason ? '<th>Reason</th>' : ''}<th>Actions</th></tr></thead><tbody>`;

        transactions.forEach(transaction => {
            const transactionId = transaction.transactionId || transaction.id || '';
            const date = transaction.date || 'N/A';
            const itemName = transaction.itemName || 'N/A';
            const quantity = transaction.quantity || 'N/A';
            const reason = transaction.reason || 'N/A';

            transactionsHtml += `
                <tr data-id="${transactionId}" data-type="transfer" class="${transaction.isPending ? 'pending-row' : ''}">
                    <td>${date}</td>
                    <td>${itemName}</td>
                    <td>${quantity}</td>
                    ${showReason ? `<td>${reason}</td>` : ''}
                    <td>
                        <button class="btn-edit" onclick="editTransaction('${transactionId}', 'transfer')">Edit</button>
                        <button class="btn-delete" onclick="deleteTransaction('${transactionId}', 'transfer')">Delete</button>
                    </td>
                </tr>
            `;
        });

        transactionsHtml += '</tbody></table>';
        safeSetHTML(containerId, transactionsHtml);
    }

    async function loadTransferTransactions(filterQuery = '', skipSync = false) {
        try {
            let transactions = [];

            // First get local pending purchases from IndexedDB
            const allPending = await getAllPendingPurchasesHelper();
            
            // Get pending deletions
            const pendingDeletions = new Set(
                allPending
                    .filter(item => item.action === 'delete' || String(item.type).includes('deletion'))
                    .map(item => String(item.transactionId || item.id))
            );

            console.log('Pending deletions found:', Array.from(pendingDeletions));

            if (db) {
                // Filter to get only transfer transactions
                const transferTransactions = allPending
                    .filter(item => item.type === 'transfer' && !pendingDeletions.has(String(item.transactionId)))
                    .map(item => ({
                        ...item,
                        isPending: true
                    }));
                
                console.log(`Found ${transferTransactions.length} local pending transfers after filtering`);
                transactions = [...transactions, ...transferTransactions];
            }

            // Then try to get data from server if online and sync to IndexedDB
            if (navigator.onLine && !skipSync) {
                try {
                    const serverTransactions = await syncTransfersFromGoogleSheets();
                    
                    if (serverTransactions !== null) {
                        // Filter out deletions
                        const filteredServerTransactions = serverTransactions.filter(t => !pendingDeletions.has(String(t.transactionId)));

                        // Combine with pending
                        const seenIds = new Set(transactions.map(t => String(t.transactionId)));
                        for (const serverTxn of filteredServerTransactions) {
                            if (!seenIds.has(String(serverTxn.transactionId))) {
                                transactions.push(serverTxn);
                            }
                        }
                    } else if (db) {
                        // If sync failed (returned null), fallback to IndexedDB data
                        const syncedTransfers = await getAllSyncedTransfers();
                        const seenIds = new Set(transactions.map(t => String(t.transactionId)));
                        for (const synced of syncedTransfers) {
                            const id = synced.transactionId || synced.id;
                            if (!seenIds.has(String(id)) && !pendingDeletions.has(String(id))) {
                                transactions.push(synced);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in loadTransferTransactions sync:', error);
                }
            } else if (db) {
                // If offline, merge local pending with synced data from IndexedDB
                const syncedTransfers = await getAllSyncedTransfers();
                // Combine synced server data with local pending, avoiding duplicates and respect deletions
                const seenIds = new Set(transactions.map(t => String(t.transactionId)));
                for (const synced of syncedTransfers) {
                    const id = synced.transactionId || synced.id;
                    if (!seenIds.has(String(id)) && !pendingDeletions.has(String(id))) {
                        transactions.push(synced);
                    }
                }
            }

            // Filter by item name if query is provided
            if (filterQuery) {
                const query = filterQuery.toLowerCase();
                transactions = transactions.filter(t => {
                    const itemName = (t.itemName || '').toLowerCase();
                    return itemName.includes(query);
                });
            }

            // Sort by date (descending)
            transactions.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
            });

            // Group transactions by direction
            const mainToSub = transactions.filter(t => t.direction === 'main-to-sub');
            const subToMain = transactions.filter(t => t.direction === 'sub-to-main');
            const foc = transactions.filter(t => t.direction === 'foc-clinic-discard');

            // Render the tables - only show reason for FOC
            const noResultsMsg = filterQuery ? '<p>No matching transactions found</p>' : '<p>No transactions found</p>';
            
            if (mainToSub.length > 0) {
                renderTransferTable('transfer-transactions-main-to-sub', mainToSub, false);
            } else {
                safeSetHTML('transfer-transactions-main-to-sub', noResultsMsg);
            }
            
            if (subToMain.length > 0) {
                renderTransferTable('transfer-transactions-sub-to-main', subToMain, false);
            } else {
                safeSetHTML('transfer-transactions-sub-to-main', noResultsMsg);
            }
            
            if (foc.length > 0) {
                renderTransferTable('transfer-transactions-foc', foc, true);
            } else {
                safeSetHTML('transfer-transactions-foc', noResultsMsg);
            }

        } catch (error) {
            console.error('Error loading transfer transactions:', error);
            const errorHtml = '<p>Error loading transactions</p>';
            safeSetHTML('transfer-transactions-main-to-sub', errorHtml);
            safeSetHTML('transfer-transactions-sub-to-main', errorHtml);
            safeSetHTML('transfer-transactions-foc', errorHtml);
        }
    }

    function loadSearchTab() {
        mainContent.innerHTML = `
            <div class="search-container">
                <input type="text" class="search-input" id="search-input" placeholder="Search for medicines...">
                <span class="material-icons search-icon">search</span>
            </div>

            <div id="search-results">
                <p>Start typing to search for medicines...</p>
            </div>
        `;

        // Set up search functionality
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    async function handleSearch(event) {
        const query = event.target.value.trim();

        if (query.length < 2) {
            document.getElementById('search-results').innerHTML = '<p>Enter at least 2 characters to search</p>';
            return;
        }

        try {
            // First try to search in local IndexedDB
            let items = await searchItems(query);

            // If no results found locally and we're online, try fetching from server
            if (items.length === 0 && navigator.onLine) {
                const response = await fetch(`/api/items/search/${encodeURIComponent(query)}`);
                if (response.ok) {
                    items = await response.json();

                    // Update local database with new items if we got results
                    if (items.length > 0) {
                        for (const item of items) {
                            await addItem({
                                code: item.code,
                                name: item.name,
                                unit: item.unit,
                                mainStore: item.mainStore || 0,
                                subStore: item.subStore || 0,
                                lastUpdated: new Date()
                            });
                        }
                    }
                }
            }

            if (items.length === 0) {
                safeSetHTML('search-results', '<p>No items found</p>');
                return;
            }

            let resultsHtml = '<ul class="item-list">';
            items.forEach(item => {
                resultsHtml += `
                    <li data-code="${item.code}">
                        <div class="item-name">${item.name}</div>
                        <div class="item-details">Code: ${item.code} | Sub: ${item.subStore || 0} | Main: ${item.mainStore || 0} | Unit: ${item.unit}</div>
                    </li>
                `;
            });
            resultsHtml += '</ul>';

            safeSetHTML('search-results', resultsHtml);

            // Add click handlers to items
            document.querySelectorAll('.item-list li').forEach(item => {
                item.addEventListener('click', function() {
                    const code = this.getAttribute('data-code');
                    // Here you could show more details or redirect to an item page
                    alert(`Selected item with code: ${code}`);
                });
            });
        } catch (error) {
            console.error('Search error:', error);
            safeSetHTML('search-results', '<p>Error searching items</p>');
        }
    }

    function loadAddTab(skipSync = false) {
        mainContent.innerHTML = `
            <div class="card">
                <h2>Add New Item / Purchase</h2>
                <p>Enter purchase details for a new or existing item.</p>
                <p><strong>Transaction ID:</strong> <span id="current-transaction-id">-</span></p>
            </div>
            
            <div class="card">
                <form id="add-item-form">
                    <div class="input-group">
                        <label for="select-item">Select Item</label>
                        <input type="text" id="select-item" class="search-input" placeholder="Type item name..." required>
                        <div id="item-suggestions" class="suggestions-dropdown hidden"></div>
                    </div>

                    <div class="input-group">
                        <label for="purchase-date">Purchase Date</label>
                        <input type="date" id="purchase-date" required>
                    </div>

                    <div class="input-group">
                        <label for="total-price">Total Price</label>
                        <input type="number" id="total-price" min="0" step="0.01" required>
                    </div>

                    <div class="input-group">
                        <label>Packaging Scheme</label>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            <input type="number" id="pack-units-per-card" placeholder="Units per card" min="1">
                            <input type="number" id="pack-cards-per-box" placeholder="Cards per box" min="1">
                            <input type="number" id="pack-number-of-boxes" placeholder="Number of boxes" min="1">
                        </div>
                    </div>

                    <div class="input-group">
                        <label for="supplier">Supplier</label>
                        <input type="text" id="supplier" placeholder="Enter supplier name" value="${lastSupplier}" required>
                    </div>

                    <div class="input-group">
                        <label for="expired-date">Expired Date</label>
                        <input type="date" id="expired-date" required>
                    </div>

                    <div class="input-group">
                        <label>Payment Method</label>
                        <div id="payment-methods-container">
                            ${lastPaymentMethods.map((pm, index) => `
                                <div class="payment-method-row">
                                    <input type="number" class="payment-amount-input" placeholder="Amount" min="0" step="0.01" value="${pm.amount}" required>
                                    <input type="text" class="payment-method-input" placeholder="Method (e.g., cash, card)" value="${pm.method}" required>
                                    <button type="button" class="remove-payment-btn" onclick="removePaymentMethod(this)" style="${lastPaymentMethods.length > 1 ? '' : 'display: none;'}">-</button>
                                </div>
                            `).join('')}
                        </div>
                        <button type="button" class="btn add-payment-btn" onclick="addPaymentMethod()">+ Add Payment Method</button>
                        <div id="payment-validation-message" class="payment-validation"></div>
                    </div>

                    <button type="submit" class="btn">Submit</button>
                </form>
            </div>
            
            <div class="card">
                <h3>Recent Purchases</h3>
                <div class="search-container" style="margin-bottom: 15px;">
                    <input type="text" class="search-input" id="purchase-list-search" placeholder="Search by item name...">
                    <span class="material-icons search-icon">search</span>
                </div>
                <div id="purchased-items-list">
                    <p>Loading purchases...</p>
                </div>
            </div>
        `;

        // Set up form handling
        const purchaseDateInput = document.getElementById('purchase-date');
        if (purchaseDateInput) {
            const today = new Date().toISOString().split('T')[0];
            purchaseDateInput.value = today;
        }

        const selectItemInput = document.getElementById('select-item');
        const supplierInput = document.getElementById('supplier');
        if (supplierInput) {
            supplierInput.addEventListener('input', function() {
                lastSupplier = this.value;
            });
        }
        const suggestionsDiv = document.getElementById('item-suggestions');
        selectItemInput.addEventListener('input', debounce(function(e) {
            handleItemSearch(e, suggestionsDiv);
        }, 300));

        // Set up search for purchases list
        const purchaseListSearch = document.getElementById('purchase-list-search');
        if (purchaseListSearch) {
            purchaseListSearch.addEventListener('input', debounce(function(e) {
                loadPurchasedItemsList(e.target.value.trim(), true);
            }, 300));
        }

        // Payment method functions
        window.addPaymentMethod = function() {
            const container = document.getElementById('payment-methods-container');
            const paymentRow = document.createElement('div');
            paymentRow.className = 'payment-method-row';
            paymentRow.innerHTML = `
                <input type="number" class="payment-amount-input" placeholder="Amount" min="0" step="0.01" required>
                <input type="text" class="payment-method-input" placeholder="Method (e.g., cash, card)" required>
                <button type="button" class="remove-payment-btn" onclick="removePaymentMethod(this)">-</button>
            `;
            container.appendChild(paymentRow);
            updateRemoveButtons();
            autoDistributePayment();
            updateLastPaymentMethods();
        };

        window.removePaymentMethod = function(button) {
            const container = document.getElementById('payment-methods-container');
            if (container.children.length > 1) {
                button.parentElement.remove();
                updateRemoveButtons();
                autoDistributePayment();
                updateLastPaymentMethods();
            }
        };

        // Add event listeners to payment amount inputs for validation and persistence
        document.addEventListener('input', function(e) {
            if (e.target.classList.contains('payment-amount-input') || e.target.classList.contains('payment-method-input')) {
                if (e.target.classList.contains('payment-amount-input')) {
                    validatePaymentTotal();
                }
                updateLastPaymentMethods();
            }
        });

        // Add event listener to total price input for validation and auto-distribution
        const totalPriceInput = document.getElementById('total-price');
        if (totalPriceInput) {
            totalPriceInput.addEventListener('input', autoDistributePayment);
        }

        // Add event listener to expired date input to auto-set to first day of month
        const expiredDateInput = document.getElementById('expired-date');
        if (expiredDateInput) {
            expiredDateInput.addEventListener('change', function() {
                if (this.value) {
                    const date = new Date(this.value);
                    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
                    const year = firstDayOfMonth.getFullYear();
                    const month = String(firstDayOfMonth.getMonth() + 1).padStart(2, '0');
                    const day = String(firstDayOfMonth.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;
                    this.value = formattedDate;
                }
            });
        }

        // Initialize remove buttons
        updateRemoveButtons();

        // Hide suggestions when focus moves away from the item input
        selectItemInput.addEventListener('blur', function() {
            // Delay hiding to allow for click events on suggestions
            setTimeout(() => {
                suggestionsDiv.classList.add('hidden');
            }, 150);
        });

        // Show suggestions when focusing back on the input if there's text
        selectItemInput.addEventListener('focus', function() {
            if (this.value.length >= 2) {
                handleItemSearch({target: {value: this.value}}, suggestionsDiv);
            }
        });

        // Also hide suggestions when focusing on other form fields
        document.getElementById('purchase-date').addEventListener('focus', function() {
            suggestionsDiv.classList.add('hidden');
        });

        document.getElementById('total-price').addEventListener('focus', function() {
            suggestionsDiv.classList.add('hidden');
        });

        // Load purchased items list
        loadPurchasedItemsList('', skipSync);
        
        // Set up form submission handler
        document.getElementById('add-item-form').addEventListener('submit', handleAddItemSubmit);
    }

    // Function to load purchased items list
    async function loadPurchasedItemsList(filterQuery = '', skipSync = false) {
        try {
            // If online, try to sync unless skipSync is true
            if (navigator.onLine && !skipSync) {
                await syncPurchasesFromGoogleSheets();
            }

            let transactions = [];
            
            // Try to get data from local IndexedDB (which is now synced if we were online)
            if (db) {
                const allPending = await getAllPendingPurchasesHelper();
                const allSynced = await getAllSyncedPurchases();
                
                // Get pending deletions to filter them out
                const pendingDeletions = new Set(
                    allPending
                        .filter(item => item.action === 'delete' || item.type === 'purchase_deletion')
                        .map(item => String(item.transactionId || item.id))
                );

                // Normalize and combine transactions
                // Pending purchases have nested purchaseData, synced purchases are flat
                const normalizedPending = allPending
                    .filter(item => item.type === 'purchase' && !pendingDeletions.has(String(item.transactionId)))
                    .map(item => ({
                        ...item.purchaseData,
                        transactionId: item.transactionId,
                        isPending: true
                    }));
                
                // Combine and deduplicate, prioritizing pending transactions
                const seenIds = new Set();
                
                for (const pending of normalizedPending) {
                    seenIds.add(String(pending.transactionId));
                    transactions.push(pending);
                }
                
                for (const synced of allSynced) {
                    const id = synced.transactionId || synced.id;
                    if (!seenIds.has(String(id)) && !pendingDeletions.has(String(id))) {
                        seenIds.add(String(id));
                        transactions.push(synced);
                    }
                }
            }
            
            // Filter by item name if query is provided
            if (filterQuery) {
                const query = filterQuery.toLowerCase();
                transactions = transactions.filter(t => {
                    const itemName = (t.itemName || t.name || '').toLowerCase();
                    return itemName.includes(query);
                });
            }

            if (transactions.length === 0) {
                safeSetHTML('purchased-items-list', `<p>${filterQuery ? 'No matching purchases found' : 'No purchases found'}</p>`);
                return;
            }

            // Sort by date (descending)
            transactions.sort((a, b) => {
                const dateA = new Date(a.purchaseDate || a.date);
                const dateB = new Date(b.purchaseDate || b.date);
                return dateB - dateA;
            });
            
            let transactionsHtml = '<table class="transaction-table"><thead><tr><th>Purchase Date</th><th>Medicine Name</th><th>Total Amount</th><th>Total Units</th><th>Expired Date</th><th>Actions</th></tr></thead><tbody>';
            
            transactions.forEach(transaction => {
                const purchaseDate = transaction.purchaseDate || transaction.date || 'N/A';
                const itemName = transaction.itemName || transaction.name || 'N/A';
                const totalPrice = transaction.totalPrice || 'N/A';
                const expiredDate = transaction.expiryDate || transaction.expiredDate || 'N/A';
                const totalUnits = transaction.packageScheme ? 
                    (transaction.packageScheme.numberOfBoxes || 0) * (transaction.packageScheme.cardsPerBox || 0) * (transaction.packageScheme.unitsPerCard || 0) : 
                    transaction.quantity || 'N/A';
                
                transactionsHtml += `
                    <tr data-id="${transaction.transactionId || transaction.id || ''}" data-type="purchase" class="${transaction.isPending ? 'pending-row' : ''}">
                        <td>${purchaseDate}</td>
                        <td>${itemName}</td>
                        <td>${totalPrice}</td>
                        <td>${totalUnits}</td>
                        <td>${expiredDate}</td>
                        <td>
                            <button class="btn-edit" onclick="editPurchaseTransaction('${transaction.transactionId || transaction.id || ''}')">Edit</button>
                            <button class="btn-delete" onclick="deletePurchaseTransaction('${transaction.transactionId || transaction.id || ''}')">Delete</button>
                        </td>
                    </tr>
                `;
            });
            
            transactionsHtml += '</tbody></table>';
            safeSetHTML('purchased-items-list', transactionsHtml);
        } catch (error) {
            console.error('Error loading purchased items list:', error);
            safeSetHTML('purchased-items-list', '<p>Error loading purchases</p>');
        }
    }

    // Function to edit a purchase transaction
    async function editPurchaseTransaction(transactionId) {
        try {
            console.log('Editing transaction with ID:', transactionId);
            
            // Get transaction data from local storage
            const allPending = await getAllPendingPurchasesHelper();
            const allSynced = await getAllSyncedPurchases();
            const allTransactions = [...allPending, ...allSynced];
            
            console.log('Total transactions found:', allTransactions.length);
            console.log('Transaction IDs:', allTransactions.map(t => t.transactionId || t.id));
            
            const transactionRecord = allTransactions.find(t => t.transactionId === transactionId || t.id === transactionId);
            
            console.log('Found transaction:', transactionRecord);
            
            if (transactionRecord) {
                // Normalize data structure (handle both flat and nested structures)
                const transaction = transactionRecord.purchaseData ? transactionRecord.purchaseData : transactionRecord;
                
                // Switch to Add tab first to ensure form elements exist
                const addTab = document.querySelector('[data-tab="add"]');
                if (addTab) {
                    addTab.click();
                    // Wait a bit for the tab to load
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Check if form elements exist before populating
                const selectItem = document.getElementById('select-item');
                const purchaseDate = document.getElementById('purchase-date');
                const totalPrice = document.getElementById('total-price');
                const supplier = document.getElementById('supplier');
                const packUnitsPerCard = document.getElementById('pack-units-per-card');
                const packCardsPerBox = document.getElementById('pack-cards-per-box');
                const packNumberOfBoxes = document.getElementById('pack-number-of-boxes');
                const expiredDate = document.getElementById('expired-date');
                const transactionIdElement = document.getElementById('current-transaction-id');
                
                console.log('Form elements found:', {
                    selectItem: !!selectItem,
                    purchaseDate: !!purchaseDate,
                    totalPrice: !!totalPrice,
                    supplier: !!supplier,
                    packUnitsPerCard: !!packUnitsPerCard,
                    packCardsPerBox: !!packCardsPerBox,
                    packNumberOfBoxes: !!packNumberOfBoxes,
                    expiredDate: !!expiredDate,
                    transactionIdElement: !!transactionIdElement
                });
                
                if (selectItem) selectItem.value = transaction.itemName || transaction.name || '';
                if (purchaseDate) purchaseDate.value = transaction.purchaseDate || transaction.date || '';
                if (totalPrice) totalPrice.value = transaction.totalPrice || '';
                if (supplier) supplier.value = transaction.supplier || '';
                if (expiredDate) expiredDate.value = transaction.expiryDate || transaction.expiredDate || '';
                
                // Populate package scheme fields
                if (packUnitsPerCard && transaction.packageScheme) {
                    packUnitsPerCard.value = transaction.packageScheme.unitsPerCard || '';
                }
                if (packCardsPerBox && transaction.packageScheme) {
                    packCardsPerBox.value = transaction.packageScheme.cardsPerBox || '';
                }
                if (packNumberOfBoxes && transaction.packageScheme) {
                    packNumberOfBoxes.value = transaction.packageScheme.numberOfBoxes || '';
                }

                // Populate payment method fields with separate amount and method
                const paymentMethodsContainer = document.getElementById('payment-methods-container');
                if (paymentMethodsContainer) {
                    paymentMethodsContainer.innerHTML = ''; // Clear existing fields

                    const paymentMethods = transaction.paymentMethods || [];
                    if (paymentMethods.length === 0) {
                        // Add empty fields if no payment methods
                        paymentMethodsContainer.innerHTML = `
                            <div class="payment-method-row">
                                <input type="number" class="payment-amount-input" placeholder="Amount" min="0" step="0.01" required>
                                <input type="text" class="payment-method-input" placeholder="Method (e.g., cash, card)" required>
                                <button type="button" class="remove-payment-btn" onclick="removePaymentMethod(this)" style="display: none;">-</button>
                            </div>
                        `;
                    } else {
                        // Add fields for each payment method, parsing the format "amount by method"
                        paymentMethods.forEach(method => {
                            const match = method.match(/^([\d.]+)\s+by\s+(.+)$/);
                            const amount = match ? match[1] : '';
                            const methodText = match ? match[2] : method;

                            const paymentRow = document.createElement('div');
                            paymentRow.className = 'payment-method-row';
                            paymentRow.innerHTML = `
                                <input type="number" class="payment-amount-input" placeholder="Amount" min="0" step="0.01" value="${amount}" required>
                                <input type="text" class="payment-method-input" placeholder="Method (e.g., cash, card)" value="${methodText}" required>
                                <button type="button" class="remove-payment-btn" onclick="removePaymentMethod(this)">-</button>
                            `;
                            paymentMethodsContainer.appendChild(paymentRow);
                        });
                    }
                    updateRemoveButtons();
                    validatePaymentTotal();
                }

                // Set transaction ID display
                if (transactionIdElement) {
                    transactionIdElement.textContent = transactionId;
                }
                
                // Scroll to top of form
                window.scrollTo(0, 0);
            } else {
                console.error('Transaction not found with ID:', transactionId);
                alert('Transaction not found');
            }
        } catch (error) {
            console.error('Error editing purchase transaction:', error);
            alert('Error loading transaction for edit');
        }
    }

    // Function to delete a purchase transaction
    async function deletePurchaseTransaction(transactionId) {
        try {
            const confirmed = confirm('Are you sure you want to delete this purchase transaction? This action cannot be undone.');
            
            if (confirmed) {
                // Step 1: Delete from local syncedPurchases immediately
                await deleteSyncedPurchase(transactionId);
                
                // Step 2: Record the delete transaction in pendingPurchases for sync
                const transactionRecord = {
                    transactionId: transactionId,
                    id: transactionId, // Add id for compatibility with processQueuedDeletions
                    action: 'delete',
                    type: 'purchase_deletion', // Add type for compatibility with processQueuedDeletions
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                };

                await addPendingPurchase(transactionRecord);

                // Step 3: Update UI immediately
                await loadPurchasedItemsList('', true);
                alert('Purchase transaction deleted successfully');

                // Step 4: Try to sync with server if online (non-blocking)
                if (navigator.onLine) {
                    try {
                        await syncPendingTransactions();
                    } catch (error) {
                        console.log('Server sync failed, will try later:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error deleting purchase transaction:', error);
            alert('Error deleting transaction');
        }
    }

    // Function to update transaction in IndexedDB stores
    async function updateTransactionInIndexedDB(transactionId, purchaseData) {
        try {
            // Update in pendingPurchases if it exists there
            const allPending = await getAllPendingPurchasesHelper();
            const pendingIndex = allPending.findIndex(t => t.transactionId === transactionId || t.id === transactionId);
            
            if (pendingIndex !== -1) {
                const updatedPending = [...allPending];
                updatedPending[pendingIndex] = {
                    ...updatedPending[pendingIndex],
                    ...purchaseData,
                    transactionId: transactionId
                };
                
                // Clear and re-add pending purchases
                await clearPendingPurchases();
                for (const pending of updatedPending) {
                    await addPendingPurchase(pending);
                }
            }
            
            // Update in syncedPurchases if it exists there
            const allSynced = await getAllSyncedPurchases();
            const syncedIndex = allSynced.findIndex(t => t.transactionId === transactionId || t.id === transactionId);
            
            if (syncedIndex !== -1) {
                const updatedSynced = [...allSynced];
                updatedSynced[syncedIndex] = {
                    ...updatedSynced[syncedIndex],
                    ...purchaseData,
                    transactionId: transactionId
                };
                
                // Clear and re-add synced purchases
                await clearSyncedPurchases();
                for (const synced of updatedSynced) {
                    await saveSyncedPurchase(synced);
                }
            }
            
            console.log('Transaction updated in IndexedDB:', transactionId);
        } catch (error) {
            console.error('Error updating transaction in IndexedDB:', error);
            throw error;
        }
    }

    // Function to sync pending transactions to server
    async function syncPendingTransactions() {
        try {
            const allPending = await getAllPendingPurchasesHelper();
            // Process all transactions with 'pending' status
            const pendingTransactions = allPending.filter(t => t.status === 'pending');

            if (pendingTransactions.length === 0) {
                return { success: true, message: 'No pending transactions to sync' };
            }            
            console.log(`Syncing ${pendingTransactions.length} pending transactions`);
            
            for (const transaction of pendingTransactions) {
                try {
                    let response;
                    
                    if (transaction.action === 'add') {
                        response = await fetch('/api/purchases', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(transaction.purchaseData)
                        });
                        
                        // Also sync expiry data
                        if (response.ok) {
                            await fetch('/api/expiries', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(transaction.expiryData)
                            });
                        }
                    } else if (transaction.action === 'edit') {
                        response = await fetch(`/api/purchases/${transaction.transactionId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(transaction.purchaseData)
                        });
                    } else if (transaction.action === 'delete') {
                        response = await fetch(`/api/purchases/${transaction.transactionId}`, {
                            method: 'DELETE'
                        });
                    }
                    
                    if (response.ok) {
                        // Update local synced storage before updating pending status to ensure UI consistency
                        if (transaction.type === 'purchase') {
                            if (transaction.action === 'add' || transaction.action === 'edit') {
                                await saveSyncedPurchase(transaction.purchaseData);
                            } else if (transaction.action === 'delete') {
                                await deleteSyncedPurchase(transaction.transactionId);
                            }
                        } else if (transaction.type === 'transfer') {
                            if (transaction.action === 'add' || transaction.action === 'edit' || !transaction.action) {
                                // For transfers, the data is at the top level or in transferData
                                const transferData = transaction.transferData || transaction;
                                await saveSyncedTransfer(transferData);
                            } else if (transaction.action === 'delete') {
                                await deleteSyncedTransfer(transaction.transactionId);
                            }
                        }

                        // Mark as synced instead of deleting immediately to avoid gaps
                        // Reconciliation in syncFromGoogleSheets will handle final removal
                        if (transaction.type === 'purchase') {
                            await updatePendingPurchaseStatus(transaction.transactionId, 'synced');
                        } else if (transaction.type === 'transfer') {
                            await updatePendingTransferStatus(transaction.transactionId, 'synced');
                        }
                        
                        console.log(`Synced ${transaction.action || 'processed'} ${transaction.type} transaction: ${transaction.transactionId}`);
                    } else {
                        console.error(`Failed to sync ${transaction.action} transaction: ${transaction.transactionId}`);
                    }
                } catch (error) {
                    console.error(`Error syncing transaction ${transaction.transactionId}:`, error);
                }
            }
            
            return { success: true, message: 'Sync completed' };
        } catch (error) {
            console.error('Error syncing pending transactions:', error);
            return { success: false, error: error.message };
        }
    }

    function loadTransferTab(skipSync = false) {
        mainContent.innerHTML = `
            <div class="card">
                <h2>Transfer Stock</h2>
                <p>Move items between main store and sub store.</p>
                <p><strong>Transaction ID:</strong> <span id="current-transfer-transaction-id">-</span></p>
            </div>
            
            <div class="card">
                <form id="transfer-form">
                    <div class="input-group">
                        <label for="transfer-item-search">Search Item</label>
                        <input type="text" id="transfer-item-search" class="search-input" placeholder="Search for item..." required>
                        <div id="transfer-item-suggestions" class="suggestions-dropdown hidden"></div>
                    </div>

                    <div class="input-group">
                        <label for="transfer-quantity">Quantity</label>
                        <input type="number" id="transfer-quantity" required>
                    </div>

                    <div class="input-group">
                        <label for="transfer-direction">Direction</label>
                        <select id="transfer-direction" required>
                            <option value="">Select direction</option>
                            <option value="main-to-sub" ${lastTransferDirection === 'main-to-sub' ? 'selected' : ''}>Main Store to Sub Store</option>
                            <option value="sub-to-main" ${lastTransferDirection === 'sub-to-main' ? 'selected' : ''}>Sub Store to Main Store</option>
                            <option value="foc-clinic-discard" ${lastTransferDirection === 'foc-clinic-discard' ? 'selected' : ''}>FOC/Clinic/Discard</option>
                        </select>
                    </div>

                    <button type="submit" class="btn">Transfer</button>
                </form>
            </div>

            <div class="card">
                <h3>Transfer Transactions</h3>
                <div class="search-container" style="margin-bottom: 15px;">
                    <input type="text" class="search-input" id="transfer-list-search" placeholder="Search by item name...">
                    <span class="material-icons search-icon">search</span>
                </div>
                
                <h4>Main Store to Sub Store</h4>
                <div id="transfer-transactions-main-to-sub">
                    <p>Loading transactions...</p>
                </div>

                <h4 style="margin-top: 20px;">Sub Store to Main Store</h4>
                <div id="transfer-transactions-sub-to-main">
                    <p>Loading transactions...</p>
                </div>

                <h4 style="margin-top: 20px;">FOC / Clinic / Discard</h4>
                <div id="transfer-transactions-foc">
                    <p>Loading transactions...</p>
                </div>
            </div>
        `;

        // Set up transfer form handling
        const transferItemSearch = document.getElementById('transfer-item-search');
        const transferSuggestionsDiv = document.getElementById('transfer-item-suggestions');
        const transferDirectionSelect = document.getElementById('transfer-direction');

        if (transferDirectionSelect) {
            transferDirectionSelect.addEventListener('change', function() {
                lastTransferDirection = this.value;
            });
        }

        // Set up search for transfer list
        const transferListSearch = document.getElementById('transfer-list-search');
        if (transferListSearch) {
            transferListSearch.addEventListener('input', debounce(function(e) {
                loadTransferTransactions(e.target.value.trim(), true);
            }, 300));
        }

        // Load transfer transactions
        loadTransferTransactions('', skipSync);
        
        // Add event listener for item search
        transferItemSearch.addEventListener('input', debounce(function(e) {
            handleTransferItemSearch(e, transferSuggestionsDiv);
        }, 300));

        // Hide suggestions when focus moves away from the item input
        transferItemSearch.addEventListener('blur', function() {
            // Delay hiding to allow for click events on suggestions
            setTimeout(() => {
                transferSuggestionsDiv.classList.add('hidden');
            }, 150);
        });

        // Show suggestions when focusing back on the input if there's text
        transferItemSearch.addEventListener('focus', function() {
            if (this.value.length >= 2) {
                handleTransferItemSearch({target: {value: this.value}}, transferSuggestionsDiv);
            }
        });

        document.getElementById('transfer-form').addEventListener('submit', handleTransferSubmit);
    }

    function loadLowStockTab() {
    mainContent.innerHTML = `
        <div class="card">
            <h2>Low Stock Items</h2>
            <p>Items that need to be refilled soon</p>
        </div>
        
        <div class="card">
            <div id="low-stock-table-container">
                <p>Loading low stock items...</p>
            </div>
        </div>
    `;
    
    loadLowStockData();
}

function loadExpiredDateTab() {
    mainContent.innerHTML = `
        <div class="card">
            <h2>Expired Date Items</h2>
            <p>Items that have expired or are expiring soon</p>
        </div>
        
        <div class="card">
            <div id="expired-date-table-container">
                <p>Loading expired date items...</p>
            </div>
        </div>
    `;
    
    loadExpiredDateData();
}

async function loadExpiredDateData() {
    try {
        if (!db) {
            safeSetHTML('expired-date-table-container', '<p>No data available</p>');
            return;
        }

        // Try to sync expired date data if online
        if (navigator.onLine) {
            await syncExpiredDateData();
        }

        const expiredDateItems = await getAllExpiredDateItems();

        if (expiredDateItems.length === 0) {
            safeSetHTML('expired-date-table-container', '<p>No expired date data available. Please sync with server.</p>');
            return;
        }

        // Sort by expired date (ascending order - earliest dates first)
        expiredDateItems.sort((a, b) => {
            const dateA = new Date(a.expiredDate);
            const dateB = new Date(b.expiredDate);
            return dateA - dateB;
        });

        let tableHtml = '<table class="transaction-table"><thead><tr><th>Medicine Name</th><th>Expired Date</th><th>Current Stock</th></tr></thead><tbody>';

        expiredDateItems.forEach(item => {
            // Format the date for better display
            const formattedDate = item.expiredDate ? new Date(item.expiredDate).toLocaleDateString() : 'N/A';
            
            tableHtml += `
                <tr>
                    <td>${item.medicineName || 'N/A'}</td>
                    <td>${formattedDate}</td>
                    <td>${item.currentStock} units</td>
                </tr>
            `;
        });

        tableHtml += '</tbody></table>';
        safeSetHTML('expired-date-table-container', tableHtml);

    } catch (error) {
        console.error('Error loading expired date data:', error);
        safeSetHTML('expired-date-table-container', '<p>Error loading data</p>');
    }
}

async function loadLowStockData() {
    try {
        if (!db) {
            safeSetHTML('low-stock-table-container', '<p>No data available</p>');
            return;
        }

        // Try to sync low stock data if online
        if (navigator.onLine) {
            await syncLowStockData();
        }

        const lowStockItems = await getAllLowStockItems();

        if (lowStockItems.length === 0) {
            safeSetHTML('low-stock-table-container', '<p>No low stock data available. Please sync with server.</p>');
            return;
        }

        // Sort by current stock level (lowest first)
        lowStockItems.sort((a, b) => a.currentStock - b.currentStock);

        let tableHtml = '<table class="transaction-table"><thead><tr><th>Medicine</th><th>Current Stock</th><th>Stock OUT Within 30 Days</th></tr></thead><tbody>';

        lowStockItems.forEach(item => {
            tableHtml += `
                <tr>
                    <td>${item.medicineName || 'N/A'}</td>
                    <td>${item.currentStock} units</td>
                    <td>${item.soldLast30Days} units</td>
                </tr>
            `;
        });

        tableHtml += '</tbody></table>';
        safeSetHTML('low-stock-table-container', tableHtml);

    } catch (error) {
        console.error('Error loading low stock data:', error);
        safeSetHTML('low-stock-table-container', '<p>Error loading data</p>');
    }
}
    

    // Get last transaction ID from existing purchases
    async function getLastTransactionId() {
        try {
            let lastId = null;
            
            // Try to get from local database first to ensure we don't reuse IDs
            if (db) {
                const allPending = await getAllPendingPurchasesHelper();
                const allSynced = await getAllSyncedPurchases();
                const allTransactions = [...allPending, ...allSynced];
                
                if (allTransactions.length > 0) {
                    const ids = allTransactions.map(t => t.transactionId || t.id).filter(id => id && id.startsWith('TXN-'));
                    if (ids.length > 0) {
                        // Sort by numeric part and take highest
                        ids.sort((a, b) => {
                            const numA = parseInt(a.split('-')[1]) || 0;
                            const numB = parseInt(b.split('-')[1]) || 0;
                            return numB - numA;
                        });
                        lastId = ids[0];
                    }
                }
            }

            // If nothing local, try server
            if (!lastId && navigator.onLine) {
                const response = await fetch('/api/purchases');
                if (response.ok) {
                    const purchases = await response.json();
                    if (purchases.length > 0) {
                        const ids = purchases.map(p => p.transactionId).filter(id => id && id.startsWith('TXN-'));
                        if (ids.length > 0) {
                            ids.sort((a, b) => {
                                const numA = parseInt(a.split('-')[1]) || 0;
                                const numB = parseInt(b.split('-')[1]) || 0;
                                return numB - numA;
                            });
                            lastId = ids[0];
                        }
                    }
                }
            }
            
            if (!lastId) {
                return `TXN-${Date.now()}-0001`; // Use timestamp for unique first ID
            }
            
            const lastNum = parseInt(lastId.split('-')[1]) || 0;
            const nextNum = lastNum + 1;
            const timestamp = Date.now();
            return `TXN-${timestamp}-${nextNum.toString().padStart(4, '0')}`;
        } catch (error) {
            console.error('Error getting last transaction ID:', error);
            return `TXN-${Date.now()}-0001`;
        }
    }

    // Generate unique transaction ID
    function generateTransactionId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `TXN-${timestamp}-${random}`;
    }

    // Validate payment amounts match total price
    function validatePaymentTotal() {
        const totalPriceInput = document.getElementById('total-price');
        const totalPrice = parseFloat(totalPriceInput.value) || 0;
        const amountInputs = document.querySelectorAll('.payment-amount-input');
        let totalPaymentAmount = 0;

        amountInputs.forEach(input => {
            totalPaymentAmount += parseFloat(input.value) || 0;
        });

        const validationMessage = document.getElementById('payment-validation-message');
        if (totalPrice > 0 && totalPaymentAmount > 0) {
            const difference = Math.abs(totalPrice - totalPaymentAmount);
            if (difference < 0.01) {
                validationMessage.textContent = '✓ Payment amounts match total price';
                validationMessage.style.color = 'green';
                return true;
            } else {
                validationMessage.textContent = `✗ Payment amounts (${totalPaymentAmount.toFixed(2)}) don't match total price (${totalPrice.toFixed(2)})`;
                validationMessage.style.color = 'red';
                return false;
            }
        } else {
            validationMessage.textContent = '';
            return true;
        }
    }

    // Automatically distribute total price among payment amount inputs
    function autoDistributePayment() {
        const totalPriceInput = document.getElementById('total-price');
        if (!totalPriceInput) return;
        
        const totalPrice = parseFloat(totalPriceInput.value) || 0;
        const amountInputs = document.querySelectorAll('.payment-amount-input');
        
        if (amountInputs.length === 0) return;
        
        if (totalPrice <= 0) {
            amountInputs.forEach(input => input.value = '');
            validatePaymentTotal();
            return;
        }
        
        const amountPerPayment = Math.floor((totalPrice / amountInputs.length) * 100) / 100;
        let distributed = 0;
        
        amountInputs.forEach((input, index) => {
            if (index === amountInputs.length - 1) {
                // Last one gets the remainder to avoid rounding issues
                const remainder = (totalPrice - distributed).toFixed(2);
                input.value = remainder;
            } else {
                input.value = amountPerPayment.toFixed(2);
                distributed += amountPerPayment;
            }
        });
        
        validatePaymentTotal();
    }

    // Update remove buttons visibility for payment methods
    function updateRemoveButtons() {
        const container = document.getElementById('payment-methods-container');
        if (!container) return;
        const removeButtons = container.querySelectorAll('.remove-payment-btn');
        removeButtons.forEach(btn => {
            btn.style.display = container.children.length > 1 ? 'inline-block' : 'none';
        });
    }

    // Update last payment methods state for persistence
    function updateLastPaymentMethods() {
        const amountInputs = document.querySelectorAll('.payment-amount-input');
        const methodInputs = document.querySelectorAll('.payment-method-input');
        if (amountInputs.length === 0) return;
        
        lastPaymentMethods = [];
        for (let i = 0; i < amountInputs.length; i++) {
            lastPaymentMethods.push({
                amount: amountInputs[i].value,
                method: methodInputs[i].value
            });
        }
    }

    async function handleAddItemSubmit(event) {
        event.preventDefault();

        // Validate payment amounts match total price before submission (only if payment amounts are entered)
        const paymentAmountInputs = document.querySelectorAll('.payment-amount-input');
        let hasPaymentAmounts = false;
        paymentAmountInputs.forEach(input => {
            if (input.value && parseFloat(input.value) > 0) {
                hasPaymentAmounts = true;
            }
        });

        if (hasPaymentAmounts && !validatePaymentTotal()) {
            alert('Please ensure payment amounts match the total price before submitting');
            return;
        }

        // Check if we're editing an existing transaction
        const transactionIdElement = document.getElementById('current-transaction-id');
        const currentTransactionId = transactionIdElement ? transactionIdElement.textContent.trim() : '';

        let transactionId;
        let isEditing = false;

        // If we have a transaction ID that isn't the placeholder, we're editing
        if (currentTransactionId && currentTransactionId !== '-' && currentTransactionId !== 'Loading...') {
            transactionId = currentTransactionId;
            isEditing = true;
            console.log('Editing existing transaction:', transactionId);
        } else {            // Get pre-generated transaction ID based on last transaction for new purchases
            transactionId = await getLastTransactionId();
            console.log('Creating new transaction:', transactionId);
        }

        // Display transaction ID in UI only if editing
        if (transactionIdElement && isEditing) {
            transactionIdElement.textContent = transactionId;
        } else if (transactionIdElement && !isEditing) {
            transactionIdElement.textContent = '-';
        }

        // Get form values - note: transactionId is generated at the top of the function
        const itemName = document.getElementById('select-item').value;
        const purchaseDate = document.getElementById('purchase-date').value;
        const totalPrice = parseFloat(document.getElementById('total-price').value);
        const unitsPerCard = parseInt(document.getElementById('pack-units-per-card').value) || 0;
        const cardsPerBox = parseInt(document.getElementById('pack-cards-per-box').value) || 0;
        const numberOfBoxes = parseInt(document.getElementById('pack-number-of-boxes').value) || 0;
        const expiredDate = document.getElementById('expired-date').value;
        const supplier = document.getElementById('supplier').value;

        // Validate required fields
        if (!itemName || !purchaseDate || isNaN(totalPrice) || totalPrice < 0 || isNaN(numberOfBoxes) || numberOfBoxes <= 0 || !expiredDate) {
            alert('Please fill in all required fields with valid data (quantity and price must be positive)');
            return;
        }

        // Check if the item exists in the database
        const allItems = await getAllItems();
        const existingItem = allItems.find(item => item.name.toLowerCase() === itemName.toLowerCase());

        let itemCode;
        if (existingItem) {
            // Use existing item code
            itemCode = existingItem.code;
        } else {
            // Generate temporary ID for new item
            const tempItems = allItems.filter(item => item.code.startsWith('temp-'));
            const nextTempId = tempItems.length + 1;
            itemCode = `temp-${nextTempId.toString().padStart(3, '0')}`;

            // Register the new item in the database with temporary ID
            try {
                const response = await fetch('/api/items', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        code: itemCode,
                        name: itemName,
                        unit: 'pcs' // Default unit for new items
                    })
                });

                if (!response.ok) {
                    alert('Error registering new item');
                    return;
                }
            } catch (error) {
                console.error('New item registration error:', error);
                alert('Error connecting to server when registering new item');
                return;
            }
        }

        // Package scheme object
        const packageScheme = {
            unitsPerCard,
            cardsPerBox,
            numberOfBoxes
        };

        // Collect payment methods from separate amount and method fields
        const amountInputs = document.querySelectorAll('.payment-amount-input');
        const methodInputs = document.querySelectorAll('.payment-method-input');
        const paymentMethods = [];

        for (let i = 0; i < amountInputs.length; i++) {
            const amount = parseFloat(amountInputs[i].value) || 0;
            const method = methodInputs[i].value.trim();
            if (amount > 0 && method) {
                paymentMethods.push(`${amount} by ${method}`);
            }
        }

        // Prepare purchase and expiry data
        const purchaseData = {
            transactionId,
            itemCode,
            itemName,
            totalPrice,
            packageScheme,
            expiryDate: expiredDate,
            purchaseDate: purchaseDate,
            supplier: supplier,
            paymentMethods: paymentMethods
        };

        const expiryData = {
            itemCode,
            itemName,
            expiryDate: expiredDate
        };

        // Unified Offline-First Flow:
        // 1. Save to IndexedDB immediately for local UI updates
        // 2. Queue for sync
        // 3. Attempt sync if online

        try {
            // Show loading message if offline manager is available
            if (window.offlineManager) {
                window.offlineManager.showLoadingMessage(isEditing ? 'Updating locally...' : 'Saving locally...');
            }

            if (isEditing) {
                // Update existing transaction in IndexedDB stores
                await updateTransactionInIndexedDB(transactionId, purchaseData);
            } else {
                // Save to syncedPurchases in IndexedDB (this is what the UI reads for "Recent Purchases")
                await saveSyncedPurchase(purchaseData);
            }

            // Record transaction in pendingPurchases for sync
            await addPendingPurchase({
                transactionId,
                action: isEditing ? 'edit' : 'add',
                purchaseData,
                expiryData,
                timestamp: new Date().toISOString(),
                status: 'pending', // Use 'pending' to match OfflineDataManager's filters
                type: 'purchase'
            });

            // Save current payment methods to persist them after reset
            const currentAmountInputs = document.querySelectorAll('.payment-amount-input');
            const currentMethodInputs = document.querySelectorAll('.payment-method-input');
            lastPaymentMethods = [];
            for (let i = 0; i < currentAmountInputs.length; i++) {
                lastPaymentMethods.push({
                    amount: currentAmountInputs[i].value,
                    method: currentMethodInputs[i].value
                });
            }

            // Update UI immediately
            document.getElementById('add-item-form').reset();
            
            // Restore supplier from lastSupplier and set purchase date to today
            const supplierInput = document.getElementById('supplier');
            if (supplierInput) {
                supplierInput.value = lastSupplier;
            }
            
            const purchaseDateInput = document.getElementById('purchase-date');
            if (purchaseDateInput) {
                const today = new Date().toISOString().split('T')[0];
                purchaseDateInput.value = today;
            }
            
            // Restore payment methods container inputs instead of clearing them
            const paymentMethodsContainer = document.getElementById('payment-methods-container');
            if (paymentMethodsContainer) {
                paymentMethodsContainer.innerHTML = lastPaymentMethods.map((pm, index) => `
                    <div class="payment-method-row">
                        <input type="number" class="payment-amount-input" placeholder="Amount" min="0" step="0.01" value="${pm.amount}" required>
                        <input type="text" class="payment-method-input" placeholder="Method (e.g., cash, card)" value="${pm.method}" required>
                        <button type="button" class="remove-payment-btn" onclick="removePaymentMethod(this)" style="${lastPaymentMethods.length > 1 ? '' : 'display: none;'}">-</button>
                    </div>
                `).join('');
                
                // Clear validation message
                const validationMessage = document.getElementById('payment-validation-message');
                if (validationMessage) {
                    validationMessage.textContent = '';
                }
                
                // Update remove buttons and validate (to clear any error states)
                updateRemoveButtons();
                validatePaymentTotal();
            }
            
            if (transactionIdElement) {
                transactionIdElement.textContent = '-';
            }
            document.getElementById('item-suggestions').classList.add('hidden');
            await loadPurchasedItemsList('', true);

            if (window.offlineManager) {
                window.offlineManager.hideLoadingMessage();
            }

            // 3. Attempt sync with Google Sheets (background task)
            if (navigator.onLine) {
                console.log('Attempting to sync with Google Sheets...');
                syncPendingTransactions().then(result => {
                    if (result && result.success) {
                        console.log('Sync successful');
                    } else {
                        console.log('Sync failed or partially failed, will retry later');
                    }
                }).catch(err => {
                    console.error('Background sync error:', err);
                });
                
                alert('Purchase saved locally and sync started.');
            } else {
                alert('Purchase saved locally. It will sync automatically when you are back online.');
            }

        } catch (error) {
            console.error('Error in offline-first save:', error);
            if (window.offlineManager) {
                window.offlineManager.hideLoadingMessage();
            }
            alert('Error saving purchase. Please try again.');
        }
    }

    async function handleTransferSubmit(event) {
        event.preventDefault();

        // Generate transaction ID for this transfer
        const transactionId = generateTransactionId();

        // Display transaction ID in UI
        const transferTransactionIdElement = document.getElementById('current-transfer-transaction-id');
        if (transferTransactionIdElement) {
            transferTransactionIdElement.textContent = transactionId;
        }

        const itemName = document.getElementById('transfer-item-search').value;
        const quantity = parseInt(document.getElementById('transfer-quantity').value);
        const direction = document.getElementById('transfer-direction').value;

        // Validate quantity
        if (isNaN(quantity) || quantity === 0) {
            alert('Please enter a valid quantity');
            return;
        }

        const date = new Date().toISOString().split('T')[0]; // Today's date

        // Look up the item code based on the name from local storage
        const allItems = await getAllItems();
        const selectedItem = allItems.find(item => item.name === itemName);
        const itemCode = selectedItem ? selectedItem.code : itemName; // fallback to name if not found

        // Handle FOC/Clinic/Discard option
        if (direction === 'foc-clinic-discard') {
            // Show the FOC modal
            const modal = document.getElementById('foc-modal');
            const focReasonInput = document.getElementById('foc-reason');

            // Initialize with last value
            if (focReasonInput) {
                focReasonInput.value = lastFocReason;
            }

            // Show modal
            modal.style.display = 'block';

            // Close modal when clicking the close button
            document.querySelector('.close-modal').onclick = function() {
                modal.style.display = 'none';
            }

            // Close modal when clicking cancel
            document.getElementById('cancel-foc').onclick = function() {
                modal.style.display = 'none';
            }

            // Handle confirm button click
            document.getElementById('confirm-foc').onclick = async function() {
                const focReason = focReasonInput.value.trim();

                if (!focReason) {
                    alert('Please enter who is using this medicine');
                    return;
                }

                // Prepare transfer data with FOC reason
                const transferData = {
                    transactionId,
                    itemCode,
                    itemName,
                    quantity,
                    direction,
                    date,
                    reason: focReason // Add the reason for FOC/Clinic/Discard
                };

                // Process the transfer
                await processTransfer(transferData, modal);
            }

            // Close modal when clicking outside of it
            window.onclick = function(event) {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            }
        } else {
            // Prepare transfer data for regular transfers
            const transferData = {
                transactionId,
                itemCode,
                itemName,
                quantity,
                direction,
                date
            };

            // Process the transfer
            await processTransfer(transferData);
        }
    }

    // Function to process transfer with offline-first handling
    async function processTransfer(transferData, modal = null) {
        // Unified Offline-First Flow:
        // 1. Save to IndexedDB immediately
        // 2. Queue for sync
        // 3. Attempt sync if online

        try {
            // Show loading message
            if (window.offlineManager) {
                window.offlineManager.showLoadingMessage('Saving transfer locally...');
            }

            // 1. Save to syncedTransfers IndexedDB store for immediate display
            await saveSyncedTransfer({
                ...transferData,
                date: transferData.date
            });

            // 2. Queue for sync
            await addPendingTransfer(transferData);

            if (window.offlineManager) {
                window.offlineManager.hideLoadingMessage();
            }

            alert('Transfer recorded locally!');
            document.getElementById('transfer-form').reset();
            
            // Restore persistent fields
            const transferDirectionSelect = document.getElementById('transfer-direction');
            if (transferDirectionSelect) {
                transferDirectionSelect.value = lastTransferDirection;
            }

            // Close modal if provided
            if (modal) {
                modal.style.display = 'none';
            }

            // Refresh transfer transactions list if we're on that tab
            if (typeof loadTransferTransactions === 'function') {
                await loadTransferTransactions('', true);
            }

            // 3. Attempt sync if online (background task)
            if (navigator.onLine) {
                console.log('Attempting to sync transfer with Google Sheets...');
                // We use the existing processQueuedTransfers from offlineManager
                if (window.offlineManager) {
                    window.offlineManager.processQueuedTransfers().then(result => {
                        if (result && result.success) {
                            console.log('Transfer sync successful');
                        } else {
                            console.log('Transfer sync failed, will retry later');
                        }
                    }).catch(err => {
                        console.error('Background transfer sync error:', err);
                    });
                }
            } else {
                console.log('Offline: Transfer will sync automatically when online.');
            }

        } catch (error) {
            console.error('Error in offline-first transfer:', error);
            if (window.offlineManager) {
                window.offlineManager.hideLoadingMessage();
            }
            alert('Error recording transfer. Please try again.');
        }
    }

    // Helper function to add a pending transfer
    async function addPendingTransfer(transferData) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const transferRecord = {
                ...transferData,
                timestamp: new Date().toISOString(),
                status: 'pending',
                type: 'transfer' // Differentiate from purchases
            };

            const request = objectStore.put(transferRecord);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Utility function for debouncing search
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

async function handleItemSearch(event, suggestionsDiv) {
    const query = event.target.value.trim();

     if (query.length < 2) {
         suggestionsDiv.classList.add('hidden');
         return;
     }

     try {
        // First try to search in local IndexedDB
        const allItems = await getAllItems();

        // Filter items based on the search query
        const filteredItems = allItems.filter(item =>
            item.name && item.name.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredItems.length === 0) {
            suggestionsDiv.innerHTML = '<div class="suggestion-item">No items found</div>';
            suggestionsDiv.classList.remove('hidden');
            return;
        }

        let suggestionsHtml = '';
        filteredItems.forEach(item => {
            suggestionsHtml += `<div class="suggestion-item" data-code="${item.code}" data-name="${item.name}" data-unit="${item.unit}">
                            <div class="item-name">${item.name}</div>
                            <div class="item-details">Code: ${item.code} | Sub: ${item.subStore || 0} | Main: ${item.mainStore || 0} | Unit: ${item.unit}</div>
                        </div>`;
        });

        suggestionsDiv.innerHTML = suggestionsHtml;
        suggestionsDiv.classList.remove('hidden');

        // Add click handlers to suggestions
        document.querySelectorAll('#item-suggestions .suggestion-item').forEach(suggestion => {
            suggestion.addEventListener('click', function() {
                const name = this.getAttribute('data-name');
                document.getElementById('select-item').value = name;
                suggestionsDiv.classList.add('hidden');
            });
        });
    } catch (error) {
        console.error('Search error:', error);
        suggestionsDiv.classList.add('hidden');
    }
}

async function handleTransferItemSearch(event, suggestionsDiv) {
    const query = event.target.value.trim();

     if (query.length < 2) {
         suggestionsDiv.classList.add('hidden');
         return;
     }

     try {
        // First try to search in local IndexedDB
        const allItems = await getAllItems();

        // Filter items based on the search query
        const filteredItems = allItems.filter(item =>
            item.name && item.name.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredItems.length === 0) {
            suggestionsDiv.innerHTML = '<div class="suggestion-item">No items found</div>';
            suggestionsDiv.classList.remove('hidden');
            return;
        }

        let suggestionsHtml = '';
        filteredItems.forEach(item => {
            suggestionsHtml += `<div class="suggestion-item" data-code="${item.code}" data-name="${item.name}" data-unit="${item.unit}">
                            <div class="item-name">${item.name}</div>
                            <div class="item-details">Code: ${item.code} | Sub: ${item.subStore || 0} | Main: ${item.mainStore || 0} | Unit: ${item.unit}</div>
                        </div>`;
        });

        suggestionsDiv.innerHTML = suggestionsHtml;
        suggestionsDiv.classList.remove('hidden');

        // Add click handlers to suggestions
        document.querySelectorAll('#transfer-item-suggestions .suggestion-item').forEach(suggestion => {
            suggestion.addEventListener('click', function() {
                const name = this.getAttribute('data-name');
                document.getElementById('transfer-item-search').value = name;
                suggestionsDiv.classList.add('hidden');
            });
        });
    } catch (error) {
        console.error('Search error:', error);
        suggestionsDiv.classList.add('hidden');
    }
}


    // Function to add sync button to UI
    function setupSyncButton() {
        // Add sync button to relevant pages (add purchase, search, etc.)
        const syncButtons = document.querySelectorAll('.sync-button');

        syncButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const syncResult = await offlineManager.manualSync();

                if (syncResult.success) {
                    // Update UI to reflect successful sync
                    button.textContent = 'Synced!';
                    setTimeout(() => {
                        button.textContent = 'Sync';
                    }, 2000);

                    // Refresh any displayed data
                    refreshDisplayData();

                    // Show detailed sync results if available
                    if (syncResult.purchaseSync) {
                        const totalProcessed = (syncResult.purchaseSync.successful || 0) + (syncResult.purchaseSync.failed || 0);
                        if (totalProcessed > 0) {
                            alert(`Sync completed: ${syncResult.purchaseSync.successful} purchases synced successfully, ${syncResult.purchaseSync.failed} failed.`);
                        }
                    }

                    if (syncResult.transferSync) {
                        const totalProcessed = (syncResult.transferSync.successful || 0) + (syncResult.transferSync.failed || 0);
                        if (totalProcessed > 0) {
                            alert(`Transfer sync completed: ${syncResult.transferSync.successful} transfers synced successfully, ${syncResult.transferSync.failed} failed.`);
                        }
                    }

                    if (syncResult.deletionSync) {
                        const totalProcessed = (syncResult.deletionSync.successful || 0) + (syncResult.deletionSync.failed || 0);
                        if (totalProcessed > 0) {
                            alert(`Deletion sync completed: ${syncResult.deletionSync.successful} deletions synced successfully, ${syncResult.deletionSync.failed} failed.`);
                        }
                    }

                    if (syncResult.updateSync) {
                        const totalProcessed = (syncResult.updateSync.successful || 0) + (syncResult.updateSync.failed || 0);
                        if (totalProcessed > 0) {
                            alert(`Update sync completed: ${syncResult.updateSync.successful} updates synced successfully, ${syncResult.updateSync.failed} failed.`);
                        }
                    }
                } else {
                    alert(`Sync failed: ${syncResult.error}`);
                }
            });
        });
    }

    // Function to refresh displayed data after sync
    function refreshDisplayData() {
        // This would typically refresh any cached search results or displayed items
        console.log('Refreshing displayed data after sync');
    }

    // Function to edit a transaction (offline-first)
    async function editTransaction(id, type) {
        try {
            let transactionData = null;

            // First, try to get from local IndexedDB (immediate, no network delay)
            if (db) {
                const allRecords = await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['pendingPurchases'], 'readonly');
                    const objectStore = transaction.objectStore('pendingPurchases');
                    const request = objectStore.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                // Find matching record by transactionId, itemCode or id
                transactionData = allRecords.find(record =>
                    (record.transactionId && String(record.transactionId) === String(id)) ||
                    (record.itemCode && record.itemCode === id) ||
                    (record.id !== undefined && String(record.id) === String(id))
                );
            }

            // If not found locally and online, try server as fallback
            if (!transactionData && navigator.onLine) {
                try {
                    if (type === 'daily-in') {
                        const response = await fetch('/api/purchases');
                        if (response.ok) {
                            const purchases = await response.json();
                            transactionData = purchases.find(p => p.transactionId === id || p.itemCode === id);
                        }
                    } else if (type === 'transfer') {
                        const response = await fetch('/api/transfers');
                        if (response.ok) {
                            const transfers = await response.json();
                            transactionData = transfers.find(t => t.transactionId === id || t.itemCode === id);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching from server for edit:', error);
                }
            }

            if (!transactionData) {
                alert('Transaction not found');
                return;
            }

            // Immediately show edit modal with local data (no loading message needed)
            showEditModal(transactionData, type);
        } catch (error) {
            console.error('Error loading transaction for edit:', error);
            alert('Error loading transaction for edit');
        }
    }

    // Function to show transaction data in add form
    async function showTransactionInAddForm(itemCode, type) {
        try {
            // Get transaction data based on type
            let transactionData = null;

            if (type === 'purchase' || type === 'daily-in') {                // Get all daily transactions to find the specific one
                const response = await fetch('/api/purchases');
                if (!response.ok) {
                    console.error('Error fetching transactions for edit:', response.statusText);
                    return;
                }
                const transactions = await response.json();
                const transaction = transactions.find(t => t.itemCode === itemCode);
                
                if (transaction) {
                    transactionData = {
                        id: transaction.transactionId,
                        itemCode: transaction.itemCode,
                        itemName: transaction.itemName,
                        purchaseDate: transaction.purchaseDate,
                        totalPrice: transaction.totalPrice,
                        quantity: transaction.packageScheme?.numberOfBoxes * transaction.packageScheme?.cardsPerBox * transaction.packageScheme?.unitsPerCard || transaction.quantity || '',
                        supplier: transaction.supplier || ''
                    };
                }
            }
            
            if (transactionData) {
                // Clear any existing form data
                document.getElementById('add-item-form').reset();
                
                // Populate the add form with transaction data
                document.getElementById('select-item').value = transactionData.itemName || '';
                document.getElementById('purchase-date').value = transactionData.purchaseDate || '';
                document.getElementById('total-price').value = transactionData.totalPrice || '';
                document.getElementById('supplier').value = transactionData.supplier || '';
                
                // Set transaction ID display
                const transactionIdElement = document.getElementById('current-transaction-id');
                if (transactionIdElement) {
                    transactionIdElement.textContent = transactionData.id;
                }
                
                // Switch to Add tab
                const addTab = document.querySelector('[data-tab="add"]');
                if (addTab) {
                    addTab.click();
                }
            }
        } catch (error) {
            console.error('Error showing transaction in add form:', error);
            alert('Error loading transaction data');
        }
    }

    // Function to show edit modal
    function showEditModal(transactionData, type) {
        // Create modal HTML
        let modalHtml = `
            <div id="edit-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit ${type === 'daily-in' ? 'Daily In' : 'Transfer'} Transaction</h3>
                        <span class="close-modal">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="edit-transaction-form">
                            <input type="hidden" id="edit-transaction-id" value="${transactionData.transactionId || transactionData.id || ''}">
                            <input type="hidden" id="edit-transaction-type" value="${type}">

                            <div class="input-group">
                                <label for="edit-item-name">Item Name</label>
                                <input type="text" id="edit-item-name" value="${transactionData.itemName || ''}" required>
                            </div>

                            <div class="input-group">
                                <label for="edit-date">Date</label>
                                <input type="date" id="edit-date" value="${transactionData.date || transactionData.purchaseDate || ''}" required>
                            </div>
        `;

        if (type === 'daily-in') {
            modalHtml += `
                            <div class="input-group">
                                <label for="edit-quantity">Quantity</label>
                                <input type="number" id="edit-quantity" value="${transactionData.packageScheme?.numberOfBoxes ?
                                    transactionData.packageScheme.numberOfBoxes * transactionData.packageScheme.cardsPerBox * transactionData.packageScheme.unitsPerCard :
                                    transactionData.quantity || ''}" min="1" required>
                            </div>

                            <div class="input-group">
                                <label for="edit-total-price">Total Price</label>
                                <input type="number" id="edit-total-price" value="${transactionData.totalPrice || ''}" min="0" step="0.01" required>
                            </div>
            `;
        } else { // transfer
            modalHtml += `
                            <div class="input-group">
                                <label for="edit-quantity">Quantity</label>
                                <input type="number" id="edit-quantity" value="${transactionData.quantity || ''}" required>
                            </div>

                            <div class="input-group">
                                <label for="edit-direction">Direction</label>
                                <select id="edit-direction" required>
                                    <option value="main-to-sub" ${transactionData.direction === 'main-to-sub' ? 'selected' : ''}>Main Store to Sub Store</option>
                                    <option value="sub-to-main" ${transactionData.direction === 'sub-to-main' ? 'selected' : ''}>Sub Store to Main Store</option>
                                    <option value="foc-clinic-discard" ${transactionData.direction === 'foc-clinic-discard' ? 'selected' : ''}>FOC/Clinic/Discard</option>
                                </select>
                            </div>

                            <div class="input-group" id="edit-reason-group" style="${transactionData.direction === 'foc-clinic-discard' ? 'display:block;' : 'display:none;'}">
                                <label for="edit-reason">Reason (for FOC/Clinic/Discard)</label>
                                <input type="text" id="edit-reason" value="${transactionData.reason || ''}" placeholder="Enter reason...">
                            </div>
            `;
        }

        modalHtml += `
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button id="cancel-edit" class="modal-btn modal-btn-secondary">Cancel</button>
                        <button id="save-edit" class="modal-btn modal-btn-primary">Save</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to the page
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = document.getElementById('edit-modal');
        modal.style.display = 'block';

        // Add event listeners for direction change (for transfer transactions)
        if (type === 'transfer') {
            document.getElementById('edit-direction').addEventListener('change', function() {
                const reasonGroup = document.getElementById('edit-reason-group');
                if (this.value === 'foc-clinic-discard') {
                    reasonGroup.style.display = 'block';
                } else {
                    reasonGroup.style.display = 'none';
                }
            });
        }

        // Close modal when clicking the close button
        document.querySelector('#edit-modal .close-modal').onclick = function() {
            document.body.removeChild(modal);
        }

        // Close modal when clicking cancel
        document.getElementById('cancel-edit').onclick = function() {
            document.body.removeChild(modal);
        }

        // Handle save button click
        document.getElementById('save-edit').onclick = async function() {
            // Get form values
            const updatedData = {
                transactionId: document.getElementById('edit-transaction-id').value,
                itemName: document.getElementById('edit-item-name').value,
                date: document.getElementById('edit-date').value,
                quantity: parseInt(document.getElementById('edit-quantity').value)
            };
            
            // Set id as well for backward compatibility and API endpoints
            updatedData.id = updatedData.transactionId;

            if (type === 'daily-in') {
                updatedData.totalPrice = parseFloat(document.getElementById('edit-total-price').value);
                // For daily in, we might need to reconstruct the packageScheme
                // For simplicity, we'll just update the fields we have
            } else { // transfer
                updatedData.direction = document.getElementById('edit-direction').value;
                if (updatedData.direction === 'foc-clinic-discard') {
                    updatedData.reason = document.getElementById('edit-reason').value;
                }
            }

            // Validate required fields
            if (!updatedData.itemName || !updatedData.date || isNaN(updatedData.quantity) || updatedData.quantity === 0) {
                alert('Please fill in all required fields with valid data');
                return;
            }

            if (type === 'transfer' && updatedData.direction === 'foc-clinic-discard' && !updatedData.reason) {
                alert('Please enter a reason for FOC/Clinic/Discard');
                return;
            }

            // Save the updated transaction
            await saveUpdatedTransaction(updatedData, type, modal);
        }

        // Close modal when clicking outside of it
        window.onclick = function(event) {
            if (event.target === modal) {
                document.body.removeChild(modal);
            }
        }
    }

    // Function to save updated transaction (offline-first)
    async function saveUpdatedTransaction(updatedData, type, modal) {
        try {
            // Immediately save to local IndexedDB
            await queueTransactionUpdate(updatedData, type);

            // Also update any pending records in IndexedDB that match this transaction
            if (db) {
                await updateLocalTransactionRecord(updatedData, type);
            }

            alert('Transaction updated locally!');
            // Remove the modal
            document.body.removeChild(modal);
            // Reload the dashboard to reflect changes
            loadDashboard(true);

            // If online, try to sync in the background
            if (navigator.onLine) {
                try {
                    let endpoint = '';
                    if (type === 'daily-in') {
                        endpoint = `/api/purchases/${updatedData.id}`;
                    } else if (type === 'transfer') {
                        endpoint = `/api/transfers/${updatedData.id}`;
                    }

                    const response = await fetch(endpoint, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatedData)
                    });

                    if (response.ok) {
                        console.log('Successfully synced update to server');
                    } else {
                        console.log('Server returned error, update is queued for later sync');
                    }
                } catch (error) {
                    console.error('Error syncing update to server, queued for later:', error);
                }
            }
        } catch (error) {
            console.error('Error saving transaction update:', error);
            alert('Error saving transaction update');
        }
    }

    // Helper function to update local IndexedDB record to reflect changes immediately
    async function updateLocalTransactionRecord(updatedData, type) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const getAllRequest = objectStore.getAll();
            getAllRequest.onsuccess = function() {
                const records = getAllRequest.result;

                // Find the matching record - skip deletion records to avoid overwriting them
                const matchingRecord = records.find(r => {
                    const isDeletion = r.type && String(r.type).includes('deletion');
                    if (isDeletion) return false;

                    return (r.transactionId && String(r.transactionId) === String(updatedData.id)) ||
                           (r.itemCode && r.itemCode === updatedData.id) ||
                           (r.id !== undefined && String(r.id) === String(updatedData.id));
                });

                if (matchingRecord) {
                    // Update the record with new data
                    const recordId = matchingRecord.id; // Use the auto-generated id

                    // Update fields based on type
                    if (type === 'daily-in') {
                        matchingRecord.itemName = updatedData.itemName;
                        matchingRecord.purchaseDate = updatedData.date;
                        matchingRecord.date = updatedData.date;
                        matchingRecord.totalPrice = updatedData.totalPrice;
                        // Keep packageScheme if it exists
                        if (!matchingRecord.packageScheme) {
                            matchingRecord.packageScheme = {};
                        }
                    } else if (type === 'transfer') {
                        matchingRecord.itemName = updatedData.itemName;
                        matchingRecord.date = updatedData.date;
                        matchingRecord.quantity = updatedData.quantity;
                        matchingRecord.direction = updatedData.direction;
                        if (updatedData.reason) {
                            matchingRecord.reason = updatedData.reason;
                        }
                    }

                    const updateRequest = objectStore.put(matchingRecord);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(); // No matching record found, nothing to update
                }
            };
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Helper function to remove a local IndexedDB record to reflect changes immediately
    async function removeLocalTransactionRecord(id, type) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const getAllRequest = objectStore.getAll();
            getAllRequest.onsuccess = function() {
                const records = getAllRequest.result;

                // Find the matching record - skip deletion records to avoid removing the deletion request itself
                const matchingRecord = records.find(r => {
                    const isDeletion = r.type && String(r.type).includes('deletion');
                    if (isDeletion) return false;

                    return (r.transactionId && String(r.transactionId) === String(id)) ||
                           (r.itemCode && r.itemCode === id) ||
                           (r.id !== undefined && String(r.id) === String(id));
                });

                if (matchingRecord) {
                    const deleteRequest = objectStore.delete(matchingRecord.transactionId || matchingRecord.id);
                    deleteRequest.onsuccess = () => resolve();
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                } else {
                    // Also check synced stores
                    if (type === 'purchase' || type === 'daily-in') {
                        deleteSyncedPurchase(id).then(resolve).catch(reject);
                    } else if (type === 'transfer') {
                        deleteSyncedTransfer(id).then(resolve).catch(reject);
                    } else {
                        resolve();
                    }
                }
            };
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Function to process queued updates
    async function processQueuedUpdates() {
        try {
            const transaction = db.transaction(['pendingPurchases'], 'readonly');
            const objectStore = transaction.objectStore('pendingPurchases');
            const allRecords = await objectStore.getAll();

            // Filter to get only update records
            const updateRecords = allRecords.filter(record => record.type && record.type.endsWith('_update'));

            if (updateRecords.length === 0) {
                console.log('No pending updates to process');
                return { success: true, message: 'No pending updates' };
            }

            console.log(`Processing ${updateRecords.length} pending updates`);

            let successfulUpdates = 0;
            let failedUpdates = 0;

            for (const update of updateRecords) {
                try {
                    // Determine the endpoint based on the type
                    let endpoint = '';
                    if (update.type === 'daily-in_update') {
                        endpoint = `/api/purchases/${update.id}`;
                    } else if (update.type === 'transfer_update') {
                        endpoint = `/api/transfers/${update.id}`;
                    }

                    if (endpoint) {
                        const response = await fetch(endpoint, {
                            method: 'PUT', // or PATCH depending on your API
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(update)
                        });

                        if (response.ok) {
                            // Remove the update record from the queue
                            await removeQueuedUpdate(update.id);
                            successfulUpdates++;
                            console.log(`Successfully processed update for ${update.id}`);
                        } else {
                            console.error(`Failed to process update for ${update.id}: Server returned error`);
                            failedUpdates++;
                        }
                    } else {
                        console.error(`Unknown update type: ${update.type}`);
                        failedUpdates++;
                    }
                } catch (error) {
                    console.error(`Error processing update for ${update.id}:`, error);
                    failedUpdates++;
                }
            }

            console.log(`Update sync completed: ${successfulUpdates} successful, ${failedUpdates} failed`);
            return {
                success: true,
                successful: successfulUpdates,
                failed: failedUpdates,
                message: `Processed ${updateRecords.length} pending updates`
            };
        } catch (error) {
            console.error('Error processing queued updates:', error);
            return { success: false, error: error.message };
        }
    }

    // Helper function to remove a queued update
    async function removeQueuedUpdate(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            // Find the record with the matching id and type ending with '_update'
            const getAllRequest = objectStore.getAll();

            getAllRequest.onsuccess = function() {
                const records = getAllRequest.result;
                const recordToUpdate = records.find(r => r.id === id && r.type && r.type.endsWith('_update'));

                if (recordToUpdate) {
                    const deleteRequest = objectStore.delete(recordToUpdate.id);
                    deleteRequest.onsuccess = () => resolve();
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                } else {
                    resolve(); // Nothing to delete
                }
            };

            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Helper function to queue transaction update
    async function queueTransactionUpdate(updatedData, type) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const transactionId = updatedData.transactionId || updatedData.id;
            
            // First check if the record already exists in pending store
            const getRequest = objectStore.get(transactionId);
            
            getRequest.onsuccess = function() {
                const existingRecord = getRequest.result;
                let recordToSave;
                
                if (existingRecord) {
                    // Update existing record, preserving its original type if it's a new transaction
                    // (type 'transfer' or 'daily-in'). This ensures it's still treated as a new
                    // record by the sync process rather than an update to an existing server record.
                    recordToSave = {
                        ...existingRecord,
                        ...updatedData,
                        type: (existingRecord.type === 'transfer' || existingRecord.type === 'daily-in') 
                            ? existingRecord.type 
                            : `${type}_update`,
                        timestamp: new Date().toISOString(),
                        status: 'pending'
                    };
                } else {
                    recordToSave = {
                        ...updatedData,
                        type: `${type}_update`, // Mark as update operation
                        timestamp: new Date().toISOString(),
                        status: 'pending'
                    };
                }

                const request = objectStore.put(recordToSave);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Function to delete a transaction (offline-first)
    async function deleteTransaction(id, type) {
        console.log(`Starting deletion for ${id} (type: ${type})`);
        if (!confirm('Are you sure you want to delete this transaction?')) {
            return;
        }

        try {
            // Immediately queue the deletion in local IndexedDB
            await queueTransactionDeletion(id, type);
            console.log('Queued deletion request in pendingPurchases');

            // Also remove from local pending records if it exists there
            if (db) {
                await removeLocalTransactionRecord(id, type);
                console.log('Attempted cleanup of local original records');
            }

            // Reload the UI to reflect changes
            if (currentTab === 'add') {
                await loadPurchasedItemsList('', true);
            } else if (currentTab === 'transfer') {
                await loadTransferTransactions('', true);
            } else if (currentTab === 'dashboard') {
                await loadDailyInTransactions(true);
            } else {
                loadTab(currentTab, true);
            }
            console.log('UI reload triggered');

            alert('Transaction deleted locally!');

            // If online, try to sync deletion to server in the background
            if (navigator.onLine) {
                try {
                    let endpoint = '';
                    if (type === 'purchase' || type === 'daily-in') {
                        endpoint = `/api/purchases/${id}`;
                    } else if (type === 'transfer') {
                        endpoint = `/api/transfers/${id}`;
                    }

                    const response = await fetch(endpoint, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        console.log('Successfully synced deletion to server');
                    } else {
                        console.log('Server returned error, deletion is queued for later sync');
                    }
                } catch (error) {
                    console.error('Error syncing deletion to server, queued for later:', error);
                }
            }
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Error deleting transaction');
        }
    }

    // Helper function to queue transaction deletion
    async function queueTransactionDeletion(id, type) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            const deletionRecord = {
                transactionId: id,
                id: id,
                type: `${type}_deletion`, // Mark as deletion operation
                timestamp: new Date().toISOString(),
                status: 'pending'
            };

            const request = objectStore.put(deletionRecord);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Function to process queued deletions
    async function processQueuedDeletions() {
        try {
            const transaction = db.transaction(['pendingPurchases'], 'readonly');
            const objectStore = transaction.objectStore('pendingPurchases');
            const allRecords = await objectStore.getAll();
            
            // Filter to get only deletion records
            const deletionRecords = allRecords.filter(record => 
                record.type && record.type.includes('deletion')
            );
            
            if (deletionRecords.length === 0) {
                return { success: true, message: 'No pending deletions to process' };
            }
            
            console.log(`Processing ${deletionRecords.length} pending deletions`);
            
            for (const record of deletionRecords) {
                try {
                    let endpoint = `/api/purchases/${record.id}`;
                    if (record.type === 'transfer_deletion') {
                        endpoint = `/api/transfers/${record.id}`;
                    }

                    const response = await fetch(endpoint, {
                        method: 'DELETE'
                    });
                    
                    if (response.ok) {
                        // Remove deletion record from pending transactions
                        await deletePendingPurchase(record.id);
                        console.log(`Successfully deleted ${record.id} from server`);
                    } else {
                        console.error(`Failed to delete ${record.id} from server`);
                    }
                } catch (error) {
                    console.error(`Error processing deletion for ${record.id}:`, error);
                }
            }
            
            return { success: true, message: 'Deletion processing completed' };
        } catch (error) {
            console.error('Error processing queued deletions:', error);
            return { success: false, error: error.message };
        }
    }

    // Helper function to remove a queued deletion
    async function removeQueuedDeletion(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['pendingPurchases'], 'readwrite');
            const objectStore = transaction.objectStore('pendingPurchases');

            // Find the record with the matching id and type ending with '_deletion'
            const getAllRequest = objectStore.getAll();
            getAllRequest.onsuccess = function() {
                const records = getAllRequest.result;
                const recordToDelete = records.find(r => r.id === id && r.type && r.type.endsWith('_deletion'));

                if (recordToDelete) {
                    const deleteRequest = objectStore.delete(recordToDelete.id);
                    deleteRequest.onsuccess = () => resolve();
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                } else {
                    resolve(); // Nothing to delete
                }
            };
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Expose offlineManager and utility functions globally
window.offlineManager = offlineManager;
window.getAllPendingPurchases = getAllPendingPurchases;
window.updatePendingPurchaseStatus = updatePendingPurchaseStatus;
window.addPendingPurchase = addPendingPurchase;
window.addItem = addItem;
window.getAllItems = getAllItems;
window.getLastSyncTime = getLastSyncTime;
window.updateLastSyncTime = updateLastSyncTime;
window.searchItems = searchItems;
window.syncWithGoogleSheets = syncWithGoogleSheets;
window.clearItemStore = clearItemStore;
window.deletePendingPurchase = deletePendingPurchase;
window.getAllPendingTransfers = getAllPendingTransfers;
window.updatePendingTransferStatus = updatePendingTransferStatus;
window.addPendingTransfer = addPendingTransfer;
window.addLowStockItem = addLowStockItem;
window.getAllLowStockItems = getAllLowStockItems;
window.clearLowStockStore = clearLowStockStore;
window.syncLowStockData = syncLowStockData;
window.addExpiredDateItem = addExpiredDateItem;
window.getAllExpiredDateItems = getAllExpiredDateItems;
window.clearExpiredDateStore = clearExpiredDateStore;
window.syncExpiredDateData = syncExpiredDateData;
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;
window.editPurchaseTransaction = editPurchaseTransaction;
window.deletePurchaseTransaction = deletePurchaseTransaction;
window.syncPendingTransactions = syncPendingTransactions;
window.queueTransactionDeletion = queueTransactionDeletion;
window.processQueuedDeletions = processQueuedDeletions;
window.processQueuedUpdates = processQueuedUpdates;
window.removeQueuedUpdate = removeQueuedUpdate;
window.queueTransactionUpdate = queueTransactionUpdate;
});