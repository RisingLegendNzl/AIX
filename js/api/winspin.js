// js/api/winspin.js - Winspin.bet API Integration Module

const RAPIDAPI_HOST = 'winspin-bet-online-roulette-tracker-api.p.rapidapi.com';
const API_ENDPOINT = `https://${RAPIDAPI_HOST}/api/get_roulette`;
const RAPIDAPI_KEY = 'YOUR_RAPIDAPI_KEY_HERE'; // Replace with actual RapidAPI key

/**
 * Fetches roulette data from RapidAPI for a given provider
 * Uses RapidAPI endpoint with required headers
 * @param {string} provider - Provider name (Evolution, Pragmatic, Ezugi, Playtech)
 * @returns {Promise<Object>} API response data
 */
export async function fetchRouletteData(provider) {
    if (!provider) {
        throw new Error('Provider is required');
    }
    
    console.log(`[Winspin API] Fetching data for ${provider} using POST ${API_ENDPOINT}`);
    
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY
            },
            body: JSON.stringify({
                provider: provider // Send provider in body
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
        
        // Provide more helpful error messages
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error(`Network error: Unable to connect to RapidAPI. Check your API key and network connection.`);
        } else if (error.name === 'SyntaxError') {
            throw new Error(`Invalid JSON response from RapidAPI`);
        }
        
        throw error;
    }
}

/**
 * Extracts table list from API response
 * Returns array of table objects with {id, name} structure
 * @param {Object} apiResponse - Raw API response
 * @returns {Array<{id: string|number, name: string}>} Array of table objects
 */
export function extractTableNames(apiResponse) {
    console.log('[Winspin API] Extracting table names from response:', apiResponse);
    
    if (!apiResponse) {
        console.warn('[Winspin API] No API response provided');
        return [];
    }
    
    if (!apiResponse.tables) {
        console.warn('[Winspin API] No tables found in API response');
        return [];
    }
    
    try {
        // Handle both array and object formats
        if (Array.isArray(apiResponse.tables)) {
            // Format: [{id: 1, name: "Auto_Roulette"}, ...]
            console.log('[Winspin API] Processing tables as array');
            return apiResponse.tables.map(table => ({
                id: table.id,
                name: table.name || `Table_${table.id}`
            }));
        } else if (typeof apiResponse.tables === 'object') {
            // Format: {1: {name: "Auto_Roulette", ...}, 2: {...}}
            console.log('[Winspin API] Processing tables as object');
            return Object.entries(apiResponse.tables).map(([id, tableData]) => ({
                id: id,
                name: tableData.name || `Table_${id}`
            }));
        }
        
        console.warn('[Winspin API] Unexpected tables format:', typeof apiResponse.tables);
        return [];
    } catch (error) {
        console.error('[Winspin API] Error extracting table names:', error);
        return [];
    }
}

/**
 * Gets the latest spin data for a specific table
 * @param {Object} apiResponse - Raw API response
 * @param {string} tableName - Table name to get data for
 * @returns {Object|null} Spin data {winningNumber, num1, num2} or null
 */
export function getLatestSpin(apiResponse, tableName) {
    if (!apiResponse || !apiResponse.tables) {
        return null;
    }
    
    // Find the table by name
    let tableData = null;
    
    if (Array.isArray(apiResponse.tables)) {
        tableData = apiResponse.tables.find(t => t.name === tableName);
    } else if (typeof apiResponse.tables === 'object') {
        // Search through object values
        for (const [id, data] of Object.entries(apiResponse.tables)) {
            if (data.name === tableName) {
                tableData = data;
                break;
            }
        }
    }
    
    if (!tableData || !tableData.history || tableData.history.length < 3) {
        return null;
    }
    
    // Extract last 3 numbers (newest to oldest)
    const history = tableData.history;
    return {
        winningNumber: history[0],
        num2: history[1],  // Previous number (more recent)
        num1: history[2]   // Number before that
    };
}

/**
 * Gets full history for a specific table
 * @param {Object} apiResponse - Raw API response
 * @param {string} tableName - Table name to get history for
 * @param {number} count - Number of spins to retrieve (default 30)
 * @returns {Array<number>} Array of numbers from newest to oldest
 */
export function getTableHistory(apiResponse, tableName, count = 30) {
    if (!apiResponse || !apiResponse.tables) {
        return [];
    }
    
    // Find the table by name
    let tableData = null;
    
    if (Array.isArray(apiResponse.tables)) {
        tableData = apiResponse.tables.find(t => t.name === tableName);
    } else if (typeof apiResponse.tables === 'object') {
        for (const [id, data] of Object.entries(apiResponse.tables)) {
            if (data.name === tableName) {
                tableData = data;
                break;
            }
        }
    }
    
    if (!tableData || !tableData.history) {
        return [];
    }
    
    // Return requested number of spins (newest to oldest)
    return tableData.history.slice(0, count);
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