// js/api/winspin.js - Winspin.bet API Integration Module

const API_ENDPOINT = '/api/winspin'; // Vercel serverless function

/**
 * Fetches roulette data via Vercel serverless API for a given provider
 * @param {string} provider - Provider name (Evolution, Pragmatic, Ezugi, Playtech)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeLosses - Whether to include losses data (default: false)
 * @param {boolean} options.includeHistoricalMax - Whether to include 5+ year historical max data (default: false)
 * @param {number} options.spinCount - Number of spins to request (default: 30)
 * @returns {Promise<Array>} API response data (Array of table objects)
 */
export async function fetchRouletteData(provider, options = {}) {
    if (!provider) {
        throw new Error('Provider is required');
    }
    
    const { 
        includeLosses = false, 
        includeHistoricalMax = false,
        spinCount = 30 
    } = options;
    
    console.log(`[Winspin API] Fetching data for ${provider} via ${API_ENDPOINT}`, 
                { includeLosses, includeHistoricalMax, spinCount });
    
    try {
        // Build request payload
        // IMPORTANT: The Winspin API uses these parameters:
        // - spins: boolean (true to get spin history)
        // - losses: boolean (true to get current non-appearance streaks)
        // - max: boolean (true to get 5+ year historical maximum non-appearances)
        // - limit: number (optional, number of spins to return)
        const requestPayload = {
            provider: provider,
            spins: true,                          // Always request spins
            losses: includeLosses,                // Request current loss streaks when enabled
            max: includeHistoricalMax,            // Request 5+ year historical max when enabled
            limit: spinCount                      // Number of spins to retrieve
        };
        
        console.log('[Winspin API] Request payload:', requestPayload);
        
        const response = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(requestPayload)
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
 * Fetches roulette data WITH losses AND historical max data
 * This is the preferred method for full context with 5+ year data
 * @param {string} provider - Provider name
 * @returns {Promise<Array>} API response data including losses and historical max
 */
export async function fetchRouletteDataWithLosses(provider) {
    return fetchRouletteData(provider, { 
        includeLosses: true, 
        includeHistoricalMax: true  // Request 5+ year historical max data
    });
}

/**
 * Fetches roulette data with only current losses (no historical max)
 * Use this for lightweight requests when historical context is not needed
 * @param {string} provider - Provider name
 * @returns {Promise<Array>} API response data including current losses only
 */
export async function fetchRouletteDataCurrentOnly(provider) {
    return fetchRouletteData(provider, { 
        includeLosses: true, 
        includeHistoricalMax: false 
    });
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
        console.warn('[Winspin API] Invalid API response format for extractTableNames');
        return [];
    }
    
    return apiResponse.map(table => ({
        id: table.id || table.name,
        name: table.name
    })).filter(t => t.name);
}

/**
 * Extracts spin history from API response for a specific table
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
 * 
 * FIX: Now properly handles the API response format where historical max
 * is returned as a separate top-level object (data.max) rather than
 * as a property of each sector entry.
 * 
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
    
    // Check for sector losses data in the response
    const lossesData = tableData.data.losses || tableData.losses;
    
    // FIX: Check for separate historical max object
    // The API returns max as: data.max = { red: 20, black: 23, ... }
    const historicalMaxData = tableData.data.max || tableData.max || null;
    
    if (!lossesData) {
        console.log('[Winspin API] No sector losses data in response for table:', tableName);
        return null;
    }
    
    // Log what we found
    console.log('[Winspin API] Found losses data:', lossesData);
    if (historicalMaxData) {
        console.log('[Winspin API] Found historical max data:', historicalMaxData);
    }
    
    // Determine if this is sector data or number data based on keys
    const sectorNames = ['Red', 'Black', '1st 12', '2nd 12', '3rd 12', 'Low', 'High', 'Even', 'Odd', 
                         'red', 'black', '1st', '2nd', '3rd', 'low', 'high', 'even', 'odd',
                         'small', 'big'];
    
    // If object format, check for sector keys
    if (typeof lossesData === 'object' && !Array.isArray(lossesData)) {
        const hasSecorKeys = Object.keys(lossesData).some(key => 
            sectorNames.some(sn => key.toLowerCase().includes(sn.toLowerCase()))
        );
        if (hasSecorKeys) {
            return normalizeSectorLosses(lossesData, historicalMaxData);
        }
    }
    
    // If array format, check first element structure
    if (Array.isArray(lossesData) && lossesData.length > 0) {
        const first = lossesData[0];
        if (first.name && typeof first.name === 'string') {
            const isSecorData = sectorNames.some(sn => 
                first.name.toLowerCase().includes(sn.toLowerCase())
            );
            if (isSecorData) {
                return normalizeSectorLosses(lossesData, historicalMaxData);
            }
        }
    }
    
    console.log('[Winspin API] Losses data does not appear to be sector data for table:', tableName);
    return null;
}

/**
 * Extracts individual number losses data from API response for a specific table
 * Returns historical max and current loss streaks for each number (0-36)
 * This is the key method for number-level streak data
 * 
 * FIX: Now properly handles the API response format where historical max
 * is returned as a separate top-level object (data.max) with keys like n0, n1, ...n36
 * 
 * @param {Array} apiResponse - Raw API response (Array of tables)
 * @param {string} tableName - Table name to get losses for
 * @returns {Object|null} Number losses data or null if unavailable
 */
export function getNumberLosses(apiResponse, tableName) {
    if (!apiResponse || !Array.isArray(apiResponse)) {
        return null;
    }
    
    const tableData = apiResponse.find(t => t.name === tableName);
    
    if (!tableData || !tableData.data) {
        return null;
    }
    
    // Check for number losses data
    // The API may return number-level data in different locations
    const lossesData = tableData.data.losses || tableData.losses;
    
    // FIX: Check for separate historical max object
    // The API returns max as: data.max = { n0: 439, n1: 460, ... }
    const historicalMaxData = tableData.data.max || tableData.max || null;
    
    if (!lossesData && !historicalMaxData) {
        console.log('[Winspin API] No number losses data in response for table:', tableName);
        return null;
    }
    
    // Try to extract number-level data
    // First check if losses contains number data (keys like "0", "1", ... or "n0", "n1", ...)
    let numberLossesData = null;
    
    if (lossesData && typeof lossesData === 'object' && !Array.isArray(lossesData)) {
        // Check if keys are numeric (0-36)
        const numericKeys = Object.keys(lossesData).filter(k => {
            const num = parseInt(k, 10);
            return !isNaN(num) && num >= 0 && num <= 36;
        });
        
        if (numericKeys.length > 0) {
            numberLossesData = {};
            numericKeys.forEach(k => {
                numberLossesData[k] = lossesData[k];
            });
        }
    }
    
    if (Array.isArray(lossesData)) {
        // Check if array contains number entries
        const numberEntries = lossesData.filter(entry => {
            if (entry.number !== undefined) {
                const num = parseInt(entry.number, 10);
                return !isNaN(num) && num >= 0 && num <= 36;
            }
            return false;
        });
        
        if (numberEntries.length > 0) {
            numberLossesData = numberEntries;
        }
    }
    
    // If we have historical max data with number keys (n0, n1, etc.), we can build number context
    if (historicalMaxData) {
        const numberMaxKeys = Object.keys(historicalMaxData).filter(k => 
            k.startsWith('n') && !isNaN(parseInt(k.substring(1), 10))
        );
        
        if (numberMaxKeys.length > 0) {
            console.log('[Winspin API] Found number-level historical max data:', numberMaxKeys.length, 'numbers');
            return normalizeNumberLosses(numberLossesData, historicalMaxData);
        }
    }
    
    if (numberLossesData) {
        console.log('[Winspin API] Found number losses data');
        return normalizeNumberLosses(numberLossesData, historicalMaxData);
    }
    
    console.log('[Winspin API] No number-level losses data found for table:', tableName);
    return null;
}

/**
 * Normalizes sector losses data from various API formats
 * Handles both array and object formats, tracks whether historical max is present
 * 
 * FIX: Now accepts optional historicalMaxData parameter for when max is a separate object
 * 
 * @param {Object|Array} lossesData - Raw losses data from API
 * @param {Object|null} historicalMaxData - Optional separate historical max object
 * @returns {Object} Normalized sector data with hasHistoricalMax flag
 */
function normalizeSectorLosses(lossesData, historicalMaxData = null) {
    const normalized = {
        sectors: {},
        hasHistoricalMax: false,
        dataQuality: 'unknown',
        apiMaxValuesReceived: [] // Track which sectors have API-provided max values
    };
    
    // Mapping from API sector names to internal names
    const sectorNameMapping = {
        'red': 'red',
        'black': 'black',
        '1st 12': 'dozen1',
        '2nd 12': 'dozen2',
        '3rd 12': 'dozen3',
        '1st': 'dozen1',
        '2nd': 'dozen2',
        '3rd': 'dozen3',
        'low': 'low',
        'high': 'high',
        'small': 'low',
        'big': 'high',
        '1-18': 'low',
        '19-36': 'high',
        'even': 'even',
        'odd': 'odd'
    };
    
    try {
        if (Array.isArray(lossesData)) {
            // Array format: [{name: "Red", losses: 5, max: 25}, ...]
            lossesData.forEach(sector => {
                if (sector.name) {
                    const normalizedName = sectorNameMapping[sector.name.toLowerCase()] || sector.name.toLowerCase();
                    const maxValue = sector.max || sector.historical_max || null;
                    normalized.sectors[normalizedName] = {
                        current: sector.losses || sector.current || 0,
                        max: maxValue,
                        isApiMax: maxValue !== null && maxValue > 0
                    };
                    if (maxValue !== null && maxValue > 0) {
                        normalized.hasHistoricalMax = true;
                        normalized.apiMaxValuesReceived.push(normalizedName);
                    }
                }
            });
        } else if (typeof lossesData === 'object') {
            // Object format: {Red: {losses: 5, max: 25}, ...} or {Red: 5, ...}
            for (const [name, data] of Object.entries(lossesData)) {
                const normalizedName = sectorNameMapping[name.toLowerCase()] || name.toLowerCase();
                if (typeof data === 'number') {
                    // Simple format: {Red: 5, Black: 3, ...} - current losses only
                    normalized.sectors[normalizedName] = {
                        current: data,
                        max: null,
                        isApiMax: false
                    };
                } else if (typeof data === 'object') {
                    // Full format: {Red: {losses: 5, max: 25}, ...}
                    const maxValue = data.max || data.historical_max || null;
                    normalized.sectors[normalizedName] = {
                        current: data.losses || data.current || 0,
                        max: maxValue,
                        isApiMax: maxValue !== null && maxValue > 0
                    };
                    if (maxValue !== null && maxValue > 0) {
                        normalized.hasHistoricalMax = true;
                        normalized.apiMaxValuesReceived.push(normalizedName);
                    }
                }
            }
        }
        
        // FIX: Merge in historical max data from separate object if provided
        // The API returns: data.max = { red: 20, black: 23, even: 20, odd: 20, small: 26, big: 24, ... }
        if (historicalMaxData && typeof historicalMaxData === 'object') {
            for (const [name, maxValue] of Object.entries(historicalMaxData)) {
                // Skip number-level keys (n0, n1, etc.)
                if (name.startsWith('n') && !isNaN(parseInt(name.substring(1), 10))) {
                    continue;
                }
                
                const normalizedName = sectorNameMapping[name.toLowerCase()] || name.toLowerCase();
                
                if (maxValue !== null && maxValue > 0) {
                    // Create or update sector entry with historical max
                    if (!normalized.sectors[normalizedName]) {
                        normalized.sectors[normalizedName] = {
                            current: 0,
                            max: maxValue,
                            isApiMax: true
                        };
                    } else {
                        normalized.sectors[normalizedName].max = maxValue;
                        normalized.sectors[normalizedName].isApiMax = true;
                    }
                    
                    if (!normalized.apiMaxValuesReceived.includes(normalizedName)) {
                        normalized.apiMaxValuesReceived.push(normalizedName);
                    }
                    normalized.hasHistoricalMax = true;
                }
            }
        }
        
        normalized.dataQuality = normalized.hasHistoricalMax ? 'full' : 'current_only';
        
        // Log diagnostic info about what we received
        if (normalized.hasHistoricalMax) {
            console.log('[Winspin API] Historical max data received for sectors:', 
                        normalized.apiMaxValuesReceived);
        } else {
            console.log('[Winspin API] No historical max data in response - using defaults');
        }
        
    } catch (error) {
        console.error('[Winspin API] Error normalizing sector losses:', error);
        normalized.dataQuality = 'error';
    }
    
    return normalized;
}

/**
 * Normalizes number-level losses data from various API formats
 * Handles both array and object formats, tracks whether historical max is present
 * 
 * FIX: Now accepts optional historicalMaxData parameter for when max is a separate object
 * The API returns number max as: data.max = { n0: 439, n1: 460, ..., n36: 450 }
 * 
 * @param {Object|Array|null} lossesData - Raw number losses data from API (may be null)
 * @param {Object|null} historicalMaxData - Optional separate historical max object
 * @returns {Object} Normalized number data with hasHistoricalMax flag
 */
function normalizeNumberLosses(lossesData, historicalMaxData = null) {
    const normalized = {
        numbers: {},
        hasHistoricalMax: false,
        dataQuality: 'unknown',
        apiMaxValuesReceived: [] // Track which numbers have API-provided max values
    };
    
    try {
        // Process losses data if available
        if (lossesData) {
            if (Array.isArray(lossesData)) {
                // Array format: [{number: 0, losses: 5, max: 250}, {number: 1, losses: 3, max: 280}, ...]
                lossesData.forEach(entry => {
                    const num = entry.number !== undefined ? parseInt(entry.number, 10) : null;
                    if (num !== null && num >= 0 && num <= 36) {
                        const maxValue = entry.max || entry.historical_max || null;
                        normalized.numbers[num] = {
                            current: entry.losses || entry.current || 0,
                            max: maxValue,
                            isApiMax: maxValue !== null && maxValue > 0
                        };
                        if (maxValue !== null && maxValue > 0) {
                            normalized.hasHistoricalMax = true;
                            normalized.apiMaxValuesReceived.push(num);
                        }
                    }
                });
            } else if (typeof lossesData === 'object') {
                // Object format: {0: {losses: 5, max: 250}, 1: {losses: 3, max: 280}, ...}
                // Or simple format: {0: 5, 1: 3, ...} (losses only)
                for (const [key, data] of Object.entries(lossesData)) {
                    const num = parseInt(key, 10);
                    if (!isNaN(num) && num >= 0 && num <= 36) {
                        if (typeof data === 'number') {
                            // Simple format: just losses
                            normalized.numbers[num] = {
                                current: data,
                                max: null,
                                isApiMax: false
                            };
                        } else if (typeof data === 'object') {
                            // Full format with losses and max
                            const maxValue = data.max || data.historical_max || null;
                            normalized.numbers[num] = {
                                current: data.losses || data.current || 0,
                                max: maxValue,
                                isApiMax: maxValue !== null && maxValue > 0
                            };
                            if (maxValue !== null && maxValue > 0) {
                                normalized.hasHistoricalMax = true;
                                normalized.apiMaxValuesReceived.push(num);
                            }
                        }
                    }
                }
            }
        }
        
        // FIX: Merge in historical max data from separate object if provided
        // The API returns: data.max = { n0: 439, n1: 460, ..., n36: 450 }
        if (historicalMaxData && typeof historicalMaxData === 'object') {
            for (const [key, maxValue] of Object.entries(historicalMaxData)) {
                // Check if this is a number key (n0, n1, ..., n36)
                if (key.startsWith('n')) {
                    const numStr = key.substring(1);
                    const num = parseInt(numStr, 10);
                    
                    if (!isNaN(num) && num >= 0 && num <= 36 && maxValue !== null && maxValue > 0) {
                        // Create or update number entry with historical max
                        if (!normalized.numbers[num]) {
                            normalized.numbers[num] = {
                                current: 0,
                                max: maxValue,
                                isApiMax: true
                            };
                        } else {
                            normalized.numbers[num].max = maxValue;
                            normalized.numbers[num].isApiMax = true;
                        }
                        
                        if (!normalized.apiMaxValuesReceived.includes(num)) {
                            normalized.apiMaxValuesReceived.push(num);
                        }
                        normalized.hasHistoricalMax = true;
                    }
                }
            }
        }
        
        normalized.dataQuality = normalized.hasHistoricalMax ? 'full' : 'current_only';
        
        // Log diagnostic info
        if (normalized.hasHistoricalMax) {
            console.log('[Winspin API] Historical max data received for numbers:', 
                        normalized.apiMaxValuesReceived.length, 'numbers');
        } else {
            console.log('[Winspin API] No number historical max data - using defaults');
        }
        
    } catch (error) {
        console.error('[Winspin API] Error normalizing number losses:', error);
        normalized.dataQuality = 'error';
    }
    
    return normalized;
}