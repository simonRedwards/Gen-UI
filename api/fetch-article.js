const fetch = require('node-fetch'); // Using node-fetch v2 for CommonJS compatibility
// Note: We removed express and cors imports as Vercel handles the server part

// Vercel Serverless Function handler
module.exports = async (req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Or restrict to your frontend domain on deployment
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request (preflight check for CORS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Get URL from query parameters (Vercel parses query string automatically)
    const urlToFetch = req.query.url;

    if (!urlToFetch) {
        console.error('Proxy Error: URL query parameter is required');
        res.status(400).json({ error: 'URL query parameter is required' });
        return;
    }

    console.log(`Vercel function attempting to fetch: ${urlToFetch}`);

    try {
        const response = await fetch(urlToFetch, {
            headers: {
                // Mimic a browser user-agent to potentially avoid simple bot blocks
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
             // Send the error status and text from the target server back to the client
            const errorText = await response.text();
            console.error(`Error fetching from target URL: ${response.status} ${response.statusText}`, errorText);
            // Use .json() for sending error object back
            res.status(response.status).json({ 
                error: `Failed to fetch from target URL: ${response.status} ${response.statusText}`,
                details: errorText
            });
            return;
        }

        const html = await response.text();
        // Set content type and send HTML
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    } catch (error) {
        console.error('Error in Vercel function:', error);
        res.status(500).json({ error: 'Proxy server function error', details: error.message });
    }
}; 