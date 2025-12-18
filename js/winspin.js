// js/api/winspin.js
// API adapter for Winspin.bet Online Roulette Tracker

const API_CONFIG = {
    endpoint: 'https://winspin-bet-online-roulette-tracker-api.p.rapidapi.com/api/get_roulette',
    host: 'winspin-bet-online-roulette-tracker-api.p.rapidapi.com',
    key: 'b4741b20fcmshdf6e7fc5a527cd8p13cd9ejsn4fa05f6aa974'
};

/**
 * Fetches roulette data from Winspin.bet API
 * @param {string} provider - Provider name (e.g., "Evolution", "Pragmatic")
 * @returns {Promise<Object>} API response data
 */
export async function fetchRouletteData(provider) {
    try {
        const response = await fetch(API_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': API_CONFIG.host,
                'x-rapidapi-key': API_CONFIG.key
            },
            body: JSON.stringify({
                provider: provider,
                max: true,
                losses: true,
                spins: true
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching roulette data:', error);
        throw error;
    }
}

/**
 * Extracts table names from API response
 * @param {Object} apiResponse - Full API response
 * @returns {Array<string>} Array of table names
 */
export function extractTableNames(apiResponse) {
    if (!apiResponse || typeof apiResponse !== 'object') {
        return [];
    }
    
    return Object.keys(apiResponse).filter(key => {
        return apiResponse[key] && 
               apiResponse[key].data && 
               Array.isArray(apiResponse[key].data.spins);
    });
}

/**
 * Gets spins for a specific table (reversed to oldest → newest)
 * @param {Object} apiResponse - Full API response
 * @param {string} tableName - Name of the table
 * @returns {Array<number>} Array of spins (oldest first)
 */
export function getTableSpins(apiResponse, tableName) {
    if (!apiResponse || !apiResponse[tableName] || !apiResponse[tableName].data) {
        return [];
    }
    
    const spins = apiResponse[tableName].data.spins;
    if (!Array.isArray(spins)) {
        return [];
    }
    
    // API returns most recent → oldest, so reverse to get oldest → newest
    return spins.slice().reverse();
}

/**
 * Gets the latest spin for a specific table
 * @param {Object} apiResponse - Full API response
 * @param {string} tableName - Name of the table
 * @returns {number|null} Latest spin number or null
 */
export function getLatestSpin(apiResponse, tableName) {
    if (!apiResponse || !apiResponse[tableName] || !apiResponse[tableName].data) {
        return null;
    }
    
    const spins = apiResponse[tableName].data.spins;
    if (!Array.isArray(spins) || spins.length === 0) {
        return null;
    }
    
    // API returns most recent first, so index 0 is latest
    return spins[0];
}