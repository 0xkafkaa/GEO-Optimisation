const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
// Native fetch is available in Node.js 18+
// Actually, to be safe and robust, let's use the native `fetch` API which is experimental in v18 and stable in v21. The user environment is "mac" and likely modern.
// However, if I want to be 100% sure, I'll use a dynamic import or just standard https.
// Let's try native fetch first.

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

require('dotenv').config();

app.post('/api/generate-prompts', async (req, res) => {
    const { keywords, url } = req.body;

    if (!keywords) {
        return res.status(400).json({ error: 'Keywords are required' });
    }

    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API Key is not configured' });
    }

    try {
        const prompt = `Based on the following keywords extracted from a website (${url}): "${keywords}", generate 5 distinct search prompts that a user might type into an LLM (like ChatGPT) to find this company or services related to it. The goal is to see if the company URL pops up in the answer. Valid JSON output only: {"prompts": ["prompt 1", "prompt 2", ...]}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are a helpful SEO assistant. You generate search prompts based on keywords.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
             throw new Error(data.error.message);
        }

        const content = data.choices[0].message.content;
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
             // Fallback if not valid JSON (sometimes LLMs chatter)
             parsed = { prompts: [content] };
        }

        const prompts = parsed.prompts;
        res.json({ prompts }); // Just return prompts

    } catch (error) {
        console.error('Error generating prompts:', error);
        res.status(500).json({ error: 'Failed to generate prompts', details: error.message });
    }
});

app.post('/api/analyze-prompt', async (req, res) => {
    const { prompt, url } = req.body;

    if (!prompt || !url) {
        return res.status(400).json({ error: 'Prompt and URL are required' });
    }
    
    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API Key is not configured' });
    }

    try {
         const verificationResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });
        
        const verifyData = await verificationResponse.json();
        
        if (verifyData.error) {
             throw new Error(verifyData.error.message);
        }

        const answer = verifyData.choices[0].message.content;
        
        // Improved Matching Logic
        const urlObj = new URL(url);
        let hostname = urlObj.hostname.replace(/^www\./, '');
        
        // Remove TLD (e.g. .com, .co.in, .org) - simplistic approach: take part before the last dot
        // If it's something like .co.in, we might want the part before that.
        // Let's assume the "brand" is the first part of the hostname for now.
        const parts = hostname.split('.');
        let brand = parts[0];
        if (parts.length > 2 && (parts[parts.length-2] === 'co' || parts[parts.length-2] === 'com')) {
             // handle .co.in, .com.au etc, though taking parts[0] is usually safe for "brand"
             brand = parts[0];
        } else if (parts.length > 1) {
             // apple.com -> apple
             brand = parts.slice(0, -1).join(''); 
        } else {
             brand = parts[0];
        }

        // Normalize strings for comparison (remove spaces, punctuation, to lowercase)
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const normalizedAnswer = normalize(answer);
        const normalizedBrand = normalize(brand);
        const normalizedHostname = normalize(hostname);

        // Check if brand or full hostname is in the normalized answer
        const isFound = normalizedAnswer.includes(normalizedBrand) || normalizedAnswer.includes(normalizedHostname);
        
        let reason = '';
        if (isFound) {
            if (normalizedAnswer.includes(normalizedBrand)) {
                reason = `Found brand name match for '${brand}' in the response.`;
            } else {
                reason = `Found hostname match for '${hostname}' in the response.`;
            }
        } else {
            reason = `Could not find brand '${brand}' or hostname '${hostname}' in the response.`;
        }

        res.json({
            prompt: prompt,
            isFound: isFound,
            rank: isFound ? 'High' : 'Low',
            reason: reason,
            llmResponse: answer,
            debug: { brand, normalizedBrand, normalizedAnswerLength: normalizedAnswer.length }
        });

    } catch (error) {
        console.error('Error analyzing prompt:', error);
        res.status(500).json({ error: 'Failed to analyze prompt', details: error.message });
    }
});

app.post('/api/optimize-seo', async (req, res) => {
    const { title, description, keywords, url } = req.body;

    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API Key is not configured' });
    }

    try {
        const prompt = `
        Analyze the following website metadata:
        URL: ${url}
        Title: ${title}
        Description: ${description}
        Keywords: ${keywords}

        You are an SEO expert. Provide specific, actionable advice on how to improve this metadata to:
        1. Increase visibility in search engines (SEO).
        2. Improve Geo-optimization (local search ranking), especially if a location is inferred from the content.
        
        Output format: HTML (just the <div> content, using <h4> for headings and <ul>/<li> for lists).
        Include a section "Suggested Improvements" with revised Title and Description examples.
        `;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are a helpful and expert SEO consultant.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
             throw new Error(data.error.message);
        }

        const advice = data.choices[0].message.content;
        res.json({ advice });

    } catch (error) {
        console.error('Error optimizing SEO:', error);
        res.status(500).json({ error: 'Failed to get SEO suggestions', details: error.message });
    }
});

app.get('/api/metadata', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Validate URL
        new URL(url);

        const response = await fetch(url, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const metadata = {
            title: $('title').text() || $('meta[property="og:title"]').attr('content') || '',
            description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
            image: $('meta[property="og:image"]').attr('content') || '',
            keywords: $('meta[name="keywords"]').attr('content') || '',
            url: url
        };

        // Try to resolve relative image URLs
        if (metadata.image && !metadata.image.startsWith('http')) {
            try {
                metadata.image = new URL(metadata.image, url).href;
            } catch (e) {
                // Ignore invalid image URLs
            }
        }

        res.json(metadata);

    } catch (error) {
        console.error('Error fetching metadata:', error);
        res.status(500).json({ error: 'Failed to fetch metadata', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
