// js/api/apiContextManager.js - API Context Manager
// Manages API state, polling intervals, deduplication, and context data

import { sectorContext } from './sectorContext.js';
import { numberContext } from './numberContext.js';

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
        this.contextSpins = []; // Store spin history for current context (newest first)
        this.sectorDataAvailable = false; // Track if sector data is available
        this.numberDataAvailable = false; // Track if number-level data is available
        
        // Track data quality information
        this.lastDataQuality = null;
        this.historicalMaxReceived = false;
        this.numberHistoricalMaxReceived = false;
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
     * Sets provider and table for context
     * @param {string} provider - Provider name
     * @param {string} table - Table name
     */
    setContext(provider, table) {
        // If changing provider/table, reset context
        if (this.currentProvider !== provider || this.currentTable !== table) {
            this.contextSpins = [];
            this.sectorDataAvailable = false;
            this.numberDataAvailable = false;
            sectorContext.reset();
            numberContext.reset();
        }
        this.currentProvider = provider;
        this.currentTable = table;
    }

    /**
     * Gets a unique context identifier
     * @returns {string|null} Context ID or null if no context set
     */
    getContextId() {
        if (!this.currentProvider || !this.currentTable) {
            return null;
        }
        return `${this.currentProvider}:${this.currentTable}`;
    }

    /**
     * Stores the last API response for reference
     * @param {Object} response - API response data
     */
    setLastApiResponse(response) {
        this.lastApiResponse = response;
    }

    /**
     * Gets the last stored API response
     * @returns {Object|null} Last API response or null
     */
    getLastApiResponse() {
        return this.lastApiResponse;
    }

    /**
     * Starts live polling
     * @param {Function} callback - Function to call on each poll interval
     */
    startLivePolling(callback) {
        if (this.isLivePolling) {
            return; // Already polling
        }
        
        this.isLivePolling = true;
        this.pollingInterval = setInterval(callback, this.pollingIntervalMs);
        console.log('[ApiContext] Live polling started');
    }

    /**
     * Stops live polling
     */
    stopLivePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isLivePolling = false;
        console.log('[ApiContext] Live polling stopped');
    }

    /**
     * Adds a new spin to context (deduplicates)
     * @param {number} spin - Spin number to add
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
        
        // Update number streaks from spin history
        numberContext.calculateFromSpinHistory(this.contextSpins);
        
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
        
        // Update number streaks from new spin history
        numberContext.calculateFromSpinHistory(this.contextSpins);
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
     * Updates number-level context from API losses data
     * @param {Object} numberLossesData - Number losses data from API
     * @returns {boolean} True if update was successful
     */
    updateNumberContext(numberLossesData) {
        if (!numberLossesData || !numberLossesData.numbers) {
            console.log('[ApiContext] No number losses data to update');
            return false;
        }
        
        // Store data quality info
        this.numberHistoricalMaxReceived = numberLossesData.hasHistoricalMax;
        
        // Convert normalized format to numberContext format
        const apiData = {};
        for (const [num, data] of Object.entries(numberLossesData.numbers)) {
            apiData[num] = {
                losses: data.current,
                max: data.max
            };
        }
        
        const success = numberContext.updateFromApi(apiData);
        this.numberDataAvailable = success;
        
        console.log('[ApiContext] Number context updated:', {
            success,
            hasHistoricalMax: numberLossesData.hasHistoricalMax,
            dataQuality: numberLossesData.dataQuality,
            numbersReceived: Object.keys(numberLossesData.numbers).length
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
     * Checks if number-level data with historical max is available
     * @returns {boolean} True if full number data with API-provided max is available
     */
    hasNumberData() {
        return this.numberDataAvailable && numberContext.isInitialized;
    }

    /**
     * Checks if any context data is available (sector or number)
     * This is key for allowing analysis without full data
     * @returns {boolean} True if any context data is available
     */
    hasAnyContextData() {
        return this.hasSectorData() || this.hasNumberData() || 
               sectorContext.isInitialized || numberContext.isInitialized;
    }

    /**
     * Checks if 5+ year historical max data was received from API (sector)
     * @returns {boolean} True if API provided historical max values for sectors
     */
    hasHistoricalMaxData() {
        return this.historicalMaxReceived && sectorContext.dataSource === 'api';
    }

    /**
     * Checks if 5+ year historical max data was received from API (number-level)
     * @returns {boolean} True if API provided historical max values for numbers
     */
    hasNumberHistoricalMaxData() {
        return this.numberHistoricalMaxReceived && numberContext.dataSource === 'api';
    }

    /**
     * Gets the current data source status for UI display
     * @returns {Object} Status object with label, description, and calibration state
     */
    getDataSourceStatus() {
        // Prefer number-level data status if available
        if (this.hasNumberData()) {
            return numberContext.getDataSourceStatus();
        }
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
     * Gets number-level context for a group's hit zone
     * This is the key method for number-level streak aggregation to groups
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone
     * @returns {Object} Number context for the group
     */
    getGroupNumberContext(hitZoneNumbers) {
        return numberContext.calculateGroupContext(hitZoneNumbers);
    }

    /**
     * Gets combined context for a calculation group
     * Aggregates both sector and number-level data
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone
     * @returns {Object} Combined context for the group
     */
    getGroupContext(hitZoneNumbers) {
        const sectorCtx = this.getGroupSectorContext(hitZoneNumbers);
        const numberCtx = this.getGroupNumberContext(hitZoneNumbers);
        
        return {
            sector: sectorCtx,
            number: numberCtx,
            // Use number-level data if available, otherwise fall back to sector
            hasContext: numberCtx.hasContext || sectorCtx.hasContext,
            primarySource: numberCtx.hasContext && numberCtx.hasApiData ? 'number' : 
                          (sectorCtx.hasContext && sectorCtx.hasApiData ? 'sector' : 'calculated'),
            // Aggregate severity (prefer number-level as it's more granular)
            aggregateSeverity: numberCtx.hasContext ? numberCtx.aggregateSeverity : 
                              (sectorCtx.hasContext ? sectorCtx.aggregateSeverity : 0),
            contextDescription: numberCtx.hasContext ? numberCtx.contextDescription : 
                               (sectorCtx.hasContext ? sectorCtx.contextDescription : 'No context available')
        };
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
     * Gets number context explanation for UI display
     * @param {Object} groupContext - Context from getGroupNumberContext
     * @returns {Object} Explanation object for UI
     */
    getNumberExplanation(groupContext) {
        return numberContext.generateExplanation(groupContext);
    }

    /**
     * Gets the confidence modifier from sector context
     * @param {Object} groupContext - Sector context object
     * @returns {number} Confidence modifier (0.85 to 1.0)
     */
    getSectorConfidenceModifier(groupContext) {
        return sectorContext.getConfidenceModifier(groupContext);
    }

    /**
     * Gets the confidence modifier from number context
     * @param {Object} groupContext - Number context object
     * @returns {number} Confidence modifier (0.85 to 1.0)
     */
    getNumberConfidenceModifier(groupContext) {
        return numberContext.getConfidenceModifier(groupContext);
    }

    /**
     * Gets the best available confidence modifier
     * Prefers number-level if available
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone
     * @returns {number} Confidence modifier (0.85 to 1.0)
     */
    getConfidenceModifier(hitZoneNumbers) {
        if (this.hasNumberData()) {
            const ctx = this.getGroupNumberContext(hitZoneNumbers);
            return this.getNumberConfidenceModifier(ctx);
        }
        if (this.hasSectorData()) {
            const ctx = this.getGroupSectorContext(hitZoneNumbers);
            return this.getSectorConfidenceModifier(ctx);
        }
        return 1.0; // No modification if no data
    }

    /**
     * Gets sector summary for all sectors
     * @returns {Object} Summary of all sector data
     */
    getSectorSummary() {
        const summary = {
            dataSource: sectorContext.dataSource,
            isInitialized: sectorContext.isInitialized,
            sectors: {}
        };
        
        // Get severity for each sector
        const sectorIds = ['red', 'black', 'dozen1', 'dozen2', 'dozen3', 
                          'column1', 'column2', 'column3', 'low', 'high', 'even', 'odd'];
        
        for (const sectorId of sectorIds) {
            const severity = sectorContext.getSectorSeverity(sectorId);
            summary.sectors[sectorId] = severity;
        }
        
        return summary;
    }

    /**
     * Gets number summary for all numbers
     * @returns {Object} Summary of all number data
     */
    getNumberSummary() {
        return numberContext.getSummary();
    }

    /**
     * Clears context spins and losses data but preserves provider/table settings
     * Use this when clearing history but wanting to maintain the current context source
     */
    clearContext() {
        this.contextSpins = [];
        this.lastSpin = null;
        this.lastApiResponse = null;
        this.sectorDataAvailable = false;
        this.numberDataAvailable = false;
        this.lastDataQuality = null;
        this.historicalMaxReceived = false;
        this.numberHistoricalMaxReceived = false;
        sectorContext.reset();
        numberContext.reset();
        // Note: currentProvider and currentTable are preserved
        // Note: autoModeEnabled and polling state are preserved
    }

    /**
     * Resets all context data including provider/table settings
     */
    reset() {
        this.clearContext();
        this.currentProvider = null;
        this.currentTable = null;
        this.stopLivePolling();
        this.autoModeEnabled = false;
    }

    /**
     * Gets current polling state
     * @returns {boolean} True if currently polling
     */
    isPolling() {
        return this.isLivePolling;
    }
}

// Export singleton instance
export const apiContext = new ApiContextManager();

// Export class for testing
export { ApiContextManager };