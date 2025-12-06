const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const loadingDiv = document.getElementById('loading');
const resultDiv = document.getElementById('result');
const errorDiv = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');

const metaImage = document.getElementById('metaImage');
const metaTitle = document.getElementById('metaTitle');
const metaDescription = document.getElementById('metaDescription');
const metaLink = document.getElementById('metaLink');

urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value;

    // Reset UI
    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');

    try {
        const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch metadata');
        }

        displayMetadata(data);
    } catch (error) {
        showError(error.message);
    } finally {
        loadingDiv.classList.add('hidden');
    }
});

function displayMetadata(data) {
    metaTitle.textContent = data.title || 'No Title Found';
    metaDescription.textContent = data.description || 'No description available for this page.';
    
    if (data.image) {
        metaImage.src = data.image;
        metaImage.style.display = 'block';
        metaImage.parentElement.style.display = 'block';
    } else {
        metaImage.style.display = 'none';
        metaImage.parentElement.style.display = 'none';
    }
    
    const metaKeywords = document.getElementById('metaKeywords');
    if (data.keywords) {
        metaKeywords.textContent = 'Keywords: ' + data.keywords;
        metaKeywords.style.display = 'block';
    } else {
        metaKeywords.style.display = 'none';
    }

    metaLink.href = data.url;
    
    // Reset Prompts UI
    const generatePromptsBtn = document.getElementById('generatePromptsBtn');
    const promptsResult = document.getElementById('promptsResult');
    const promptsList = document.getElementById('promptsList');
    
    promptsResult.classList.add('hidden');
    promptsList.innerHTML = '';
    
    // SEO UI
    const seoBtn = document.getElementById('seoBtn');
    const seoResult = document.getElementById('seoResult');
    const seoContent = document.getElementById('seoContent');
    seoResult.classList.add('hidden');
    seoContent.innerHTML = '';

    // Event Listeners
    generatePromptsBtn.onclick = () => generatePrompts(data.keywords, data.url);
    seoBtn.onclick = () => getSeoAdvice(data, data.url);

    // Only show buttons if we have data/keywords
    if (data.keywords) {
        generatePromptsBtn.style.display = 'inline-block';
    } else {
        generatePromptsBtn.style.display = 'none';
    }
    seoBtn.style.display = 'inline-block';

    resultDiv.classList.remove('hidden');
}

// Just generate the list, no analysis
async function generatePrompts(keywords, url) {
    const generatePromptsBtn = document.getElementById('generatePromptsBtn');
    const promptsResult = document.getElementById('promptsResult');
    const promptsList = document.getElementById('promptsList');

    const originalText = generatePromptsBtn.textContent;
    generatePromptsBtn.textContent = 'Generating...';
    generatePromptsBtn.disabled = true;

    try {
        const response = await fetch('/api/generate-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords, url })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate prompts');
        }

        // Render placeholders
        promptsList.innerHTML = data.prompts.map((prompt, index) => `
            <li class="prompt-item" id="prompt-item-${index}">
                <div class="prompt-header">
                    <span class="prompt-text">${prompt}</span>
                    <span class="prompt-rank pending" id="rank-${index}">⏳ Checking...</span>
                </div>
                <div class="analysis-result hidden" id="analysis-${index}"></div>
            </li>
        `).join('');
        promptsResult.classList.remove('hidden');
        
        // Step 2: Analyze each prompt independently
        data.prompts.forEach((prompt, index) => {
            analyzePrompt(prompt, url, index);
        });

    } catch (error) {
        showError(error.message);
    } finally {
        generatePromptsBtn.textContent = originalText;
        generatePromptsBtn.disabled = false;
    }
}

async function analyzePrompt(prompt, url, index) {
    try {
        const response = await fetch('/api/analyze-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, url })
        });
        
        const data = await response.json();
        const rankSpan = document.getElementById(`rank-${index}`);
        const analysisDiv = document.getElementById(`analysis-${index}`);
        
        if (data.rank) {
             rankSpan.className = `prompt-rank ${data.rank.toLowerCase()}`;
             rankSpan.textContent = data.rank === 'High' ? '✅ High' : '⚠️ Low';
             
             // Show full answer with reason
             analysisDiv.textContent = `Reason: ${data.reason}\n\nResponse:\n${data.llmResponse}`;
             analysisDiv.classList.remove('hidden');
        } else {
             rankSpan.textContent = '❌ Error';
             rankSpan.className = 'prompt-rank error';
        }

    } catch (error) {
        console.error(error);
        const rankSpan = document.getElementById(`rank-${index}`);
        if(rankSpan) {
            rankSpan.textContent = '❌ Error';
            rankSpan.className = 'prompt-rank error'; 
        }
    }
}

async function getSeoAdvice(metadata, url) {
    const seoBtn = document.getElementById('seoBtn');
    const seoResult = document.getElementById('seoResult');
    const seoContent = document.getElementById('seoContent');
    
    const originalText = seoBtn.textContent;
    seoBtn.textContent = 'Analyzing SEO...';
    seoBtn.disabled = true;

    try {
        const response = await fetch('/api/optimize-seo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: metadata.title,
                description: metadata.description,
                keywords: metadata.keywords,
                url: url 
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to get SEO advice');
        
        seoContent.innerHTML = data.advice;
        seoResult.classList.remove('hidden');

    } catch (error) {
        showError(error.message);
    } finally {
        seoBtn.textContent = originalText;
        seoBtn.disabled = false;
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}
