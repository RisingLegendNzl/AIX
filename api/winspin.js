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
        // Forward the request body (provider, max, losses, spins)
        // UPDATED: Support fetching losses data for sector context
        const { 
            provider, 
            max = 30,           // Default: request 30 spins
            losses = false,     // Default: don't filter by losses (set to true to get sector data)
            spins = true        // Default: always request spins
        } = req.body;

        // Validate provider is provided
        if (!provider) {
            return res.status(400).json({ error: 'Provider is required' });
        }

        console.log('[Vercel API] Proxying request to RapidAPI for provider:', provider, 
                    'with params:', { max, losses, spins });

        // Make request to RapidAPI
        const response = await fetch(RAPIDAPI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': rapidApiKey
            },
            body: JSON.stringify({
                provider,
                max,
                losses,
                spins
            })
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