// js/api/winspin.js - Winspin.bet API Integration Module

const API_ENDPOINT = '/api/winspin'; // Vercel serverless function

/**
 * Fetches roulette data via Vercel serverless API for a given provider
 * @param {string} provider - Provider name (Evolution, Pragmatic, Ezugi, Playtech)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeLosses - Whether to include sector losses data (default: false)
 * @returns {Promise<Array>} API response data (Array of table objects)
 */
export async function fetchRouletteData(provider, options = {}) {
    if (!provider) {
        throw new Error('Provider is required');
    }
    
    const { includeLosses = false } = options;
    
    console.log(`[Winspin API] Fetching data for ${provider} via ${API_ENDPOINT}`, 
                { includeLosses });
    
    try {
        const response = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                provider: provider,
                spins: true,          // Always request spins
                max: 30,              // Request up to 30 spins
                losses: includeLosses // Request sector losses data when enabled
            })
        });
        
        console.log(`[Winspin API] Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`[Winspin API] Successfully fetched data for ${provider}`, data);
        return data;
    } catch (error) {
        console.error(`[Winspin API] Error fetching data for ${provider}:`, {
            message: error.message,
            name: error.name,
            stack: error.stack
        });
        
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error(`Network error: Unable to connect to API. Check your network connection.`);
        } else if (error.name === 'SyntaxError') {
            throw new Error(`Invalid JSON response from API`);
        }
        
        throw error;
    }
}

/**
 * Fetches roulette data WITH sector losses for historical context
 * @param {string} provider - Provider name
 * @returns {Promise<Array>} API response data including losses
 */
export async function fetchRouletteDataWithLosses(provider) {
    return fetchRouletteData(provider, { includeLosses: true });
}

/**
 * Extracts table list from API response
 * Returns array of table objects with {id, name} structure
 * @param {Array} apiResponse - Raw API response (Array of tables)
 * @returns {Array<{id: string|number, name: string}>} Array of table objects
 */
export function extractTableNames(apiResponse) {
    console.log('[Winspin API] Extracting table names from response:', apiResponse);
    
    if (!apiResponse || !Array.isArray(apiResponse)) {
        console.warn('[Winspin API] Invalid API response: Expected an array of tables');
        return [];
    }
    
    try {
        return apiResponse.map(table => ({
            id: table.id,
            name: table.name || `Table_${table.id}`
        }));
    } catch (error) {
        console.error('[Winspin API] Error extracting table names:', error);
        return [];
    }
}

/**
 * Gets the latest spin data for a specific table
 * @param {Array} apiResponse - Raw API response (Array of tables)
 * @param {string} tableName - Table name to get data for
 * @returns {Object|null} Spin data {winningNumber, num2, num1} or null
 */
export function getLatestSpin(apiResponse, tableName) {
    if (!apiResponse || !Array.isArray(apiResponse)) {
        return null;
    }
    
    // Find the table by name directly in the root array
    const tableData = apiResponse.find(t => t.name === tableName);
    
    // API structure: table.data.spins contains the numbers (newest to oldest)
    if (!tableData || !tableData.data || !Array.isArray(tableData.data.spins) || tableData.data.spins.length < 3) {
        return null;
    }
    
    const spins = tableData.data.spins;
    return {
        winningNumber: spins[0],
        num2: spins[1],  // Previous number
        num1: spins[2]   // Number before that
    };
}

/**
 * Gets full history for a specific table
 * @param {Array} apiResponse - Raw API response (Array of tables)
 * @param {string} tableName - Table name to get history for
 * @param {number} count - Number of spins to retrieve (default 30)
 * @returns {Array<number>} Array of numbers from newest to oldest
 */
export function getTableHistory(apiResponse, tableName, count = 30) {
    if (!apiResponse || !Array.isArray(apiResponse)) {
        return [];
    }
    
    // Find the table by name directly in the root array
    const tableData = apiResponse.find(t => t.name === tableName);
    
    if (!tableData || !tableData.data || !Array.isArray(tableData.data.spins)) {
        return [];
    }
    
    // Return requested number of spins (newest to oldest) from data.spins
    return tableData.data.spins.slice(0, count);
}

/**
 * Extracts sector losses data from API response for a specific table
 * Returns historical max and current loss streaks for betting sectors
 * @param {Array} apiResponse - Raw API response (Array of tables)
 * @param {string} tableName - Table name to get losses for
 * @returns {Object|null} Sector losses data or null if unavailable
 */
export function getSectorLosses(apiResponse, tableName) {
    if (!apiResponse || !Array.isArray(apiResponse)) {
        return null;
    }
    
    const tableData = apiResponse.find(t => t.name === tableName);
    
    if (!tableData || !tableData.data) {
        return null;
    }
    
    // Check for losses data in the response
    // API may return losses in different formats
    const lossesData = tableData.data.losses || tableData.losses;
    
    if (!lossesData) {
        console.log('[Winspin API] No losses data in response for table:', tableName);
        return null;
    }
    
    console.log('[Winspin API] Found sector losses data:', lossesData);
    
    // Normalize the losses data format
    return normalizeSectorLosses(lossesData);
}

/**
 * Normalizes sector losses data from various API formats
 * @param {Object|Array} lossesData - Raw losses data from API
 * @returns {Object} Normalized sector data
 */
function normalizeSectorLosses(lossesData) {
    const normalized = {
        sectors: {},
        hasHistoricalMax: false,
        dataQuality: 'unknown'
    };
    
    try {
        if (Array.isArray(lossesData)) {
            // Array format: [{name: "Red", losses: 5, max: 25}, ...]
            lossesData.forEach(sector => {
                if (sector.name) {
                    normalized.sectors[sector.name] = {
                        current: sector.losses || sector.current || 0,
                        max: sector.max || sector.historical_max || null
                    };
                    if (sector.max || sector.historical_max) {
                        normalized.hasHistoricalMax = true;
                    }
                }
            });
            normalized.dataQuality = normalized.hasHistoricalMax ? 'full' : 'current_only';
        } else if (typeof lossesData === 'object') {
            // Object format: {Red: {losses: 5, max: 25}, ...} or {Red: 5, ...}
            for (const [name, data] of Object.entries(lossesData)) {
                if (typeof data === 'number') {
                    // Simple format: {Red: 5, Black: 3, ...}
                    normalized.sectors[name] = {
                        current: data,
                        max: null
                    };
                } else if (typeof data === 'object') {
                    // Full format: {Red: {losses: 5, max: 25}, ...}
                    normalized.sectors[name] = {
                        current: data.losses || data.current || 0,
                        max: data.max || data.historical_max || null
                    };
                    if (data.max || data.historical_max) {
                        normalized.hasHistoricalMax = true;
                    }
                }
            }
            normalized.dataQuality = normalized.hasHistoricalMax ? 'full' : 'current_only';
        }
    } catch (error) {
        console.error('[Winspin API] Error normalizing sector losses:', error);
        normalized.dataQuality = 'error';
    }
    
    return normalized;
}

/**
 * Validates if a spin result is different from the last known result
 * Used for deduplication
 * @param {Object} currentSpin - Current spin data
 * @param {Object} lastSpin - Last known spin data
 * @returns {boolean} True if different/new, false if duplicate
 */
export function isNewSpin(currentSpin, lastSpin) {
    if (!lastSpin) return true;
    
    return currentSpin.winningNumber !== lastSpin.winningNumber ||
           currentSpin.num1 !== lastSpin.num1 ||
           currentSpin.num2 !== lastSpin.num2;
}