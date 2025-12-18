// js/api/winspin.js - Winspin.bet API Integration Module

const API_ENDPOINT = '/api/winspin'; // Vercel serverless function

/**
 * Fetches roulette data via Vercel serverless API for a given provider
 * @param {string} provider - Provider name (Evolution, Pragmatic, Ezugi, Playtech)
 * @returns {Promise<Array>} API response data (Array of table objects)
 */
export async function fetchRouletteData(provider) {
    if (!provider) {
        throw new Error('Provider is required');
    }
    
    console.log(`[Winspin API] Fetching data for ${provider} via ${API_ENDPOINT}`);
    
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                provider: provider
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
 * @returns {Object|null} Spin data {winningNumber, num1, num2} or null
 */
export function getLatestSpin(apiResponse, tableName) {
    if (!apiResponse || !Array.isArray(apiResponse)) {
        return null;
    }
    
    // Find the table by name directly in the root array
    const tableData = apiResponse.find(t => t.name === tableName);
    
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

