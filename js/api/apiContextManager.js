// js/api/apiContextManager.js - API Context Manager
// Manages API state, polling intervals, and deduplication

class ApiContextManager {
    constructor() {
        this.currentProvider = null;
        this.currentTable = null;
        this.isLivePolling = false;
        this.pollingInterval = null;
        this.lastSpin = null;
        this.lastApiResponse = null;
        this.pollingIntervalMs = 2500; // 2.5 seconds
        this.autoModeEnabled = false; // NEW: Track auto mode state
    }

    /**
     * Enables auto mode (API becomes input source)
     */
    enableAutoMode() {
        this.autoModeEnabled = true;
    }

    /**
     * Disables auto mode (manual input enabled)
     */
    disableAutoMode() {
        this.autoModeEnabled = false;
        this.stopLivePolling(); // Stop polling when disabling auto mode
    }

    /**
     * Sets auto mode state (convenience method for toggle)
     * @param {boolean} enabled - True to enable auto mode, false to disable
     */
    setAutoMode(enabled) {
        if (enabled) {
            this.enableAutoMode();
        } else {
            this.disableAutoMode();
        }
    }

    /**
     * Checks if auto mode is currently enabled
     * @returns {boolean} True if auto mode is enabled
     */
    isAutoModeEnabled() {
        return this.autoModeEnabled;
    }

    /**
     * Checks if currently in live polling mode (alias for isPolling)
     * @returns {boolean} True if live polling is active
     */
    isLivePollingActive() {
        return this.isLivePolling;
    }

    /**
     * Sets the current provider and table context
     * Stops any active polling when context changes
     */
    setContext(provider, table) {
        // If context is changing, stop polling
        if (this.currentProvider !== provider || this.currentTable !== table) {
            this.stopLivePolling();
            this.lastSpin = null; // Reset last spin for new context
        }
        
        this.currentProvider = provider;
        this.currentTable = table;
    }

    /**
     * Gets the current context identifier (provider:table)
     */
    getContextId() {
        if (!this.currentProvider || !this.currentTable) {
            return null;
        }
        return `${this.currentProvider}:${this.currentTable}`;
    }

    /**
     * Stores the last API response for reference
     */
    setLastApiResponse(response) {
        this.lastApiResponse = response;
    }

    /**
     * Gets the last API response
     */
    getLastApiResponse() {
        return this.lastApiResponse;
    }

    /**
     * Updates the last known spin data (for deduplication)
     */
    setLastSpin(spinData) {
        this.lastSpin = spinData;
    }

    /**
     * Gets the last known spin data
     */
    getLastSpin() {
        return this.lastSpin;
    }

    /**
     * Checks if currently in live polling mode
     */
    isPolling() {
        return this.isLivePolling;
    }

    /**
     * Starts live polling with a callback function
     * @param {Function} callback - Function to call on each poll interval
     */
    startLivePolling(callback) {
        if (this.isLivePolling) {
            return; // Already polling
        }

        this.isLivePolling = true;
        
        // Execute immediately once
        callback();
        
        // Then start interval
        this.pollingInterval = setInterval(() => {
            callback();
        }, this.pollingIntervalMs);
    }

    /**
     * Stops live polling
     */
    stopLivePolling() {
        this.isLivePolling = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Resets the entire context (used when clearing history or disconnecting)
     */
    reset() {
        this.stopLivePolling();
        this.currentProvider = null;
        this.currentTable = null;
        this.lastSpin = null;
        this.lastApiResponse = null;
        this.autoModeEnabled = false; // Reset auto mode
    }
}

// Export singleton instance
export const apiContext = new ApiContextManager();