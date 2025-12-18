// js/api/apiContextManager.js
// Manages API contexts (provider + table combinations) and their spin history

/**
 * API Context Manager
 * Tracks spins per context (provider:table) and handles deduplication
 */

let currentContext = {
    provider: null,
    tableName: null,
    contextId: null,
    spins: [] // Stores spins for this context (oldest → newest)
};

let livePollingInterval = null;
let isAutoMode = false;
let lastApiResponse = null;

/**
 * Generates a context ID from provider and table name
 * @param {string} provider - Provider name
 * @param {string} tableName - Table name
 * @returns {string} Context ID in format "provider:tableName"
 */
export function generateContextId(provider, tableName) {
    return `${provider}:${tableName}`;
}

/**
 * Gets the current context
 * @returns {Object} Current context object
 */
export function getCurrentContext() {
    return { ...currentContext };
}

/**
 * Sets the current context
 * @param {string} provider - Provider name
 * @param {string} tableName - Table name
 */
export function setContext(provider, tableName) {
    const newContextId = generateContextId(provider, tableName);
    
    // If context changed, reset spins
    if (currentContext.contextId !== newContextId) {
        console.log(`API Context changed from "${currentContext.contextId}" to "${newContextId}". Resetting spins.`);
        currentContext = {
            provider,
            tableName,
            contextId: newContextId,
            spins: []
        };
    }
}

/**
 * Clears the current context
 */
export function clearContext() {
    console.log('API Context cleared.');
    currentContext = {
        provider: null,
        tableName: null,
        contextId: null,
        spins: []
    };
}

/**
 * Gets spins for the current context
 * @returns {Array<number>} Array of spins
 */
export function getContextSpins() {
    return [...currentContext.spins];
}

/**
 * Adds a spin to the current context (with deduplication)
 * @param {number} spin - Spin number to add
 * @returns {boolean} True if spin was added, false if duplicate
 */
export function addSpin(spin) {
    const lastSpin = currentContext.spins[currentContext.spins.length - 1];
    
    if (spin !== lastSpin) {
        currentContext.spins.push(spin);
        console.log(`Added spin ${spin} to context "${currentContext.contextId}". Total spins: ${currentContext.spins.length}`);
        return true;
    }
    
    console.log(`Duplicate spin ${spin} ignored for context "${currentContext.contextId}".`);
    return false;
}

/**
 * Replaces all spins in the current context
 * @param {Array<number>} spins - New array of spins
 */
export function replaceContextSpins(spins) {
    currentContext.spins = [...spins];
    console.log(`Replaced spins for context "${currentContext.contextId}". Total spins: ${currentContext.spins.length}`);
}

/**
 * Gets the latest spin in the current context
 * @returns {number|null} Latest spin or null if no spins
 */
export function getLatestContextSpin() {
    if (currentContext.spins.length === 0) {
        return null;
    }
    return currentContext.spins[currentContext.spins.length - 1];
}

/**
 * Checks if auto mode is enabled
 * @returns {boolean} True if auto mode is on
 */
export function isAutoModeEnabled() {
    return isAutoMode;
}

/**
 * Sets auto mode state
 * @param {boolean} enabled - Whether auto mode is enabled
 */
export function setAutoMode(enabled) {
    isAutoMode = enabled;
    console.log(`Auto mode ${enabled ? 'enabled' : 'disabled'}.`);
}

/**
 * Gets the live polling interval ID
 * @returns {number|null} Interval ID or null
 */
export function getLivePollingInterval() {
    return livePollingInterval;
}

/**
 * Sets the live polling interval ID
 * @param {number|null} intervalId - Interval ID
 */
export function setLivePollingInterval(intervalId) {
    livePollingInterval = intervalId;
}

/**
 * Stops live polling
 */
export function stopLivePolling() {
    if (livePollingInterval) {
        clearInterval(livePollingInterval);
        livePollingInterval = null;
        console.log('Live polling stopped.');
    }
}

/**
 * Checks if live polling is active
 * @returns {boolean} True if live polling is active
 */
export function isLivePollingActive() {
    return livePollingInterval !== null;
}

/**
 * Stores the last API response
 * @param {Object} response - API response object
 */
export function setLastApiResponse(response) {
    lastApiResponse = response;
}

/**
 * Gets the last API response
 * @returns {Object|null} Last API response or null
 */
export function getLastApiResponse() {
    return lastApiResponse;
}