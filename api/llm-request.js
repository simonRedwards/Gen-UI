const { GoogleGenerativeAI } = require("@google/generative-ai");

// Vercel Serverless Function handler for LLM requests
module.exports = async (req, res) => {
    // Set CORS headers 
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Restrict in production!
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        return;
    }

    // --- Get API Key from Environment Variable --- 
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("LLM Error: GEMINI_API_KEY environment variable not set.");
        res.status(500).json({ error: "API key not configured on server." });
        return;
    }

    // --- Get Data from Request Body --- 
    let selectedText, actionType, context;
    try {
        // Vercel automatically parses JSON body for POST if Content-Type is correct
        if (typeof req.body !== 'object' || req.body === null) {
             throw new Error("Invalid or missing request body. Expected JSON.");
        }
        selectedText = req.body.selectedText;
        actionType = req.body.actionType;
        context = req.body.context || ""; // Optional: full article text for context

        if (!selectedText || !actionType) {
            throw new Error("Missing 'selectedText' or 'actionType' in request body.");
        }
        if (actionType !== 'explain' && actionType !== 'simplify') {
            throw new Error("Invalid 'actionType'. Must be 'explain' or 'simplify'.");
        }

    } catch (error) {
        console.error("LLM Error: Bad request body:", error.message);
        res.status(400).json({ error: `Bad Request: ${error.message}` });
        return;
    }

    // --- Prepare Prompt for LLM --- 
    let prompt = ``;
    const baseInstruction = `You are an helpful assistant integrated into a webpage displaying a research article. The user has selected a piece of text from the article and asked for help.`;
    const contextInstruction = context ? `
Here is the full text of the article for context (the user selected only a part of this):
--- ARTICLE START ---
${context.substring(0, 5000)}...
--- ARTICLE END ---
` : ``; // Limit context length
    const selectedInstruction = `The user selected the following text:
--- SELECTED TEXT START ---
${selectedText}
--- SELECTED TEXT END ---
`;

    if (actionType === 'explain') {
        prompt = `${baseInstruction}${contextInstruction}
${selectedInstruction}
Please explain the selected text in the context of the article. Focus on clarifying its meaning and significance within the article's narrative. Keep the explanation concise but informative.`;
    } else { // simplify
        prompt = `${baseInstruction}${contextInstruction}
${selectedInstruction}
Please simplify the selected text. Rephrase it in simpler terms, suitable for someone who may not be familiar with the technical jargon, while retaining the core meaning within the article's context.`;
    }

    // --- Call Google Generative AI (Gemini) --- 
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use a fast model

        console.log(`Calling Gemini for action: ${actionType}`);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const llmResponseText = response.text();
        
        console.log("Gemini call successful.");
        res.status(200).json({ response: llmResponseText });

    } catch (error) {
        console.error("LLM Error: Failed to call Gemini API:", error);
        res.status(500).json({ error: "Failed to get response from LLM.", details: error.message });
    }
}; 