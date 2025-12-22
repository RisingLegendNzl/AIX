// api/winspin.js - Vercel Serverless Function
// Proxies requests to RapidAPI to keep API key secure

const RAPIDAPI_HOST = 'winspin-bet-online-roulette-tracker-api.p.rapidapi.com';
const RAPIDAPI_ENDPOINT = `https://${RAPIDAPI_HOST}/api/get_roulette`;

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get RapidAPI key from environment variable
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    
    if (!rapidApiKey) {
        console.error('RAPIDAPI_KEY environment variable is not set');
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        // Extract parameters from request body
        // IMPORTANT: The Winspin API parameters are:
        // - provider: string (required) - Casino provider name
        // - spins: boolean - Whether to return spin history
        // - losses: boolean - Whether to return current non-appearance streaks
        // - max: boolean - Whether to return 5+ year historical maximum non-appearances
        // - limit: number - Number of spins to return (optional)
        const { 
            provider, 
            spins = true,           // Default: request spins
            losses = false,         // Default: don't request losses data
            max = false,            // Default: don't request historical max (5+ year data)
            limit = 30              // Default: request 30 spins
        } = req.body;

        // Validate provider is provided
        if (!provider) {
            return res.status(400).json({ error: 'Provider is required' });
        }

        // Build the request payload for RapidAPI
        // Only include parameters that are truthy or relevant
        const apiPayload = {
            provider
        };
        
        // Add boolean flags
        if (spins === true) {
            apiPayload.spins = true;
        }
        if (losses === true) {
            apiPayload.losses = true;
        }
        if (max === true) {
            apiPayload.max = true;  // THIS IS THE KEY: boolean true for 5+ year data
        }
        
        // Add limit if specified
        if (limit && typeof limit === 'number' && limit > 0) {
            apiPayload.limit = limit;
        }

        console.log('[Vercel API] Proxying request to RapidAPI for provider:', provider);
        console.log('[Vercel API] Request params:', { 
            spins, 
            losses, 
            max,  // Log whether historical max is requested
            limit 
        });
        console.log('[Vercel API] API payload:', apiPayload);

        // Make request to RapidAPI
        const response = await fetch(RAPIDAPI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': rapidApiKey
            },
            body: JSON.stringify(apiPayload)
        });

        console.log('[Vercel API] RapidAPI response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Vercel API] RapidAPI error:', errorText);
            return res.status(response.status).json({ 
                error: 'RapidAPI request failed',
                details: errorText 
            });
        }

        // Forward the response from RapidAPI
        const data = await response.json();
        
        // Log diagnostic info about what data we received
        if (Array.isArray(data) && data.length > 0) {
            const sampleTable = data[0];
            const hasLossesData = !!(sampleTable.data?.losses || sampleTable.losses);
            const hasSpinsData = !!(sampleTable.data?.spins);
            
            // Check if max data is present in losses
            let hasMaxData = false;
            const lossesData = sampleTable.data?.losses || sampleTable.losses;
            if (lossesData) {
                if (Array.isArray(lossesData)) {
                    hasMaxData = lossesData.some(s => s.max !== undefined && s.max !== null);
                } else if (typeof lossesData === 'object') {
                    hasMaxData = Object.values(lossesData).some(
                        s => typeof s === 'object' && s.max !== undefined && s.max !== null
                    );
                }
            }
            
            console.log('[Vercel API] Response data check:', {
                tableCount: data.length,
                hasSpinsData,
                hasLossesData,
                hasMaxData,  // Whether 5+ year historical max is present
                requestedMax: max  // Whether we requested it
            });
        }
        
        console.log('[Vercel API] Successfully fetched data from RapidAPI');
        
        return res.status(200).json(data);

    } catch (error) {
        console.error('[Vercel API] Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}