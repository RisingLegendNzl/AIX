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
        this.autoModeEnabled = false;
        this.contextSpins = []; // NEW: Store spin history for current context
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
            this.contextSpins = []; // NEW: Clear spins for new context
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
     * Sets the polling interval ID (for external interval management)
     * @param {number} intervalId - The interval ID to store
     */
    setLivePollingInterval(intervalId) {
        this.pollingInterval = intervalId;
        this.isLivePolling = true;
    }

    /**
     * Adds a single spin to the context history with deduplication
     * @param {number} spin - The spin number to add
     * @returns {boolean} True if spin was added (new), false if duplicate
     */
    addSpin(spin) {
        // Check if this spin is already the most recent one
        if (this.contextSpins.length > 0 && this.contextSpins[0] === spin) {
            return false; // Duplicate
        }
        
        // Add to beginning (newest first)
        this.contextSpins.unshift(spin);
        return true;
    }

    /**
     * Replaces the entire context spin history with a new array
     * @param {Array<number>} spins - Array of spins (newest to oldest)
     */
    replaceContextSpins(spins) {
        this.contextSpins = [...spins]; // Create a copy to avoid external mutation
    }

    /**
     * Gets the current context spin history
     * @returns {Array<number>} Array of spins (newest to oldest)
     */
    getContextSpins() {
        return [...this.contextSpins]; // Return a copy to prevent external mutation
    }

    /**
     * Clears spin data and stops polling, but preserves provider/table/autoMode settings
     * Used when clearing history
     */
    clearContext() {
        this.stopLivePolling();
        this.lastSpin = null;
        this.lastApiResponse = null;
        this.contextSpins = []; // NEW: Clear spins
        // Note: Does NOT reset provider, table, or autoMode
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
        this.contextSpins = []; // NEW: Clear spins
    }
}

// Export singleton instance
export const apiContext = new ApiContextManager();