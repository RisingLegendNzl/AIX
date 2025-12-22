// js/api/apiContextManager.js - API Context Manager
// Manages API state, polling intervals, and deduplication

import { sectorContext } from './sectorContext.js';

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
        this.contextSpins = []; // Store spin history for current context
        this.sectorDataAvailable = false; // Track if sector data is available
        
        // NEW: Track data quality information
        this.lastDataQuality = null;
        this.historicalMaxReceived = false;
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
     * @param {string} provider - Provider name
     * @param {string} table - Table name
     */
    setContext(provider, table) {
        if (this.currentProvider !== provider || this.currentTable !== table) {
            this.stopLivePolling();
            this.lastSpin = null;
            this.contextSpins = [];
            this.sectorDataAvailable = false;
            this.historicalMaxReceived = false;
            this.lastDataQuality = null;
            sectorContext.reset();
        }
        this.currentProvider = provider;
        this.currentTable = table;
    }

    /**
     * Stores the last API response for reference
     * @param {Array} response - API response data
     */
    setLastApiResponse(response) {
        this.lastApiResponse = response;
    }

    /**
     * Gets the last API response
     * @returns {Array|null} Last API response or null
     */
    getLastApiResponse() {
        return this.lastApiResponse;
    }

    /**
     * Starts live polling mode
     */
    startLivePolling() {
        this.isLivePolling = true;
    }

    /**
     * Stops live polling mode
     */
    stopLivePolling() {
        this.isLivePolling = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Sets the polling interval reference
     * @param {number} intervalId - Interval ID from setInterval
     */
    setLivePollingInterval(intervalId) {
        this.pollingInterval = intervalId;
        this.isLivePolling = true;
    }

    /**
     * Adds a new spin to context history
     * @param {number} spin - The spin number
     * @returns {boolean} True if spin was added (not duplicate)
     */
    addSpin(spin) {
        // Check for duplicate
        if (this.contextSpins.length > 0 && this.contextSpins[0] === spin) {
            return false;
        }
        
        // Add to front (newest first)
        this.contextSpins.unshift(spin);
        
        // Keep max 50 spins
        if (this.contextSpins.length > 50) {
            this.contextSpins.pop();
        }
        
        // Update sector streaks from spin history
        sectorContext.calculateFromSpinHistory(this.contextSpins);
        
        return true;
    }

    /**
     * Replaces all context spins (used when loading history)
     * @param {Array<number>} spins - Array of spins (newest first)
     */
    replaceContextSpins(spins) {
        this.contextSpins = spins.slice(0, 50);
        this.lastSpin = spins[0] || null;
        
        // Update sector streaks from new spin history
        sectorContext.calculateFromSpinHistory(this.contextSpins);
    }

    /**
     * Gets current context spin history
     * @returns {Array<number>} Array of spins (newest to oldest)
     */
    getContextSpins() {
        return [...this.contextSpins]; // Return a copy to prevent external mutation
    }

    /**
     * Updates sector context from API losses data
     * @param {Object} lossesData - Sector losses data from API
     * @returns {boolean} True if update was successful
     */
    updateSectorContext(lossesData) {
        if (!lossesData || !lossesData.sectors) {
            console.log('[ApiContext] No sector losses data to update');
            return false;
        }
        
        // Store data quality info
        this.lastDataQuality = lossesData.dataQuality;
        this.historicalMaxReceived = lossesData.hasHistoricalMax;
        
        // Convert normalized format to sectorContext format
        const apiData = [];
        for (const [name, data] of Object.entries(lossesData.sectors)) {
            apiData.push({
                name,
                losses: data.current,
                max: data.max
            });
        }
        
        const success = sectorContext.updateFromApi(apiData);
        this.sectorDataAvailable = success;
        
        console.log('[ApiContext] Sector context updated:', {
            success,
            hasHistoricalMax: lossesData.hasHistoricalMax,
            dataQuality: lossesData.dataQuality,
            apiMaxValuesReceived: lossesData.apiMaxValuesReceived || []
        });
        
        return success;
    }

    /**
     * Checks if sector data with historical max is available
     * @returns {boolean} True if full sector data with API-provided max is available
     */
    hasSectorData() {
        return this.sectorDataAvailable && sectorContext.isInitialized;
    }

    /**
     * Checks if 5+ year historical max data was received from API
     * @returns {boolean} True if API provided historical max values
     */
    hasHistoricalMaxData() {
        return this.historicalMaxReceived && sectorContext.dataSource === 'api';
    }

    /**
     * Gets the current data source status for UI display
     * @returns {Object} Status object with label, description, and calibration state
     */
    getDataSourceStatus() {
        return sectorContext.getDataSourceStatus();
    }

    /**
     * Gets sector context for a group's hit zone
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone
     * @returns {Object} Sector context for the group
     */
    getGroupSectorContext(hitZoneNumbers) {
        return sectorContext.calculateGroupSectorContext(hitZoneNumbers);
    }

    /**
     * Gets sector context explanation for UI display
     * @param {Object} groupContext - Context from getGroupSectorContext
     * @returns {Object} Explanation object for UI
     */
    getSectorExplanation(groupContext) {
        return sectorContext.generateExplanation(groupContext);
    }

    /**
     * Gets sector confidence modifier for group scoring
     * @param {Object} groupContext - Context from getGroupSectorContext
     * @returns {number} Confidence multiplier (0.85 to 1.0)
     */
    getSectorConfidenceModifier(groupContext) {
        return sectorContext.getConfidenceModifier(groupContext);
    }

    /**
     * Gets full sector summary for debugging/display
     * @returns {Object} Sector summary with all details
     */
    getSectorSummary() {
        return sectorContext.getSummary();
    }

    /**
     * Clears spin data and stops polling, but preserves provider/table/autoMode settings
     * Used when clearing history
     */
    clearContext() {
        this.stopLivePolling();
        this.lastSpin = null;
        this.lastApiResponse = null;
        this.contextSpins = [];
        this.sectorDataAvailable = false;
        this.historicalMaxReceived = false;
        this.lastDataQuality = null;
        sectorContext.reset();
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
        this.autoModeEnabled = false;
        this.contextSpins = [];
        this.sectorDataAvailable = false;
        this.historicalMaxReceived = false;
        this.lastDataQuality = null;
        sectorContext.reset();
    }
}

// Export singleton instance
export const apiContext = new ApiContextManager();