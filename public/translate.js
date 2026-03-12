// ============================================
// TRANSLATOR - Smart AI Translation
// ============================================

// Check authentication
document.addEventListener('DOMContentLoaded', () => {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('userEmail').textContent = userEmail;
    loadApiSettings();
    loadHistory();
    initEventListeners();
});

// Global state
let translationHistory = [];
let activeStyle = null;

// Initialize event listeners
function initEventListeners() {
    // Source text input
    const sourceText = document.getElementById('sourceText');
    sourceText.addEventListener('input', updateCharCount);

    // Translate button
    document.getElementById('translateBtn').addEventListener('click', translateText);

    // Swap languages
    document.getElementById('swapLangs').addEventListener('click', swapLanguages);

    // Clear source
    document.getElementById('clearSource').addEventListener('click', () => {
        sourceText.value = '';
        updateCharCount();
        document.getElementById('targetText').innerHTML = '<span class="placeholder">La traduction apparaîtra ici...</span>';
        document.getElementById('detectedLang').textContent = '';
    });

    // Paste
    document.getElementById('pasteSource').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            sourceText.value = text;
            updateCharCount();
        } catch (err) {
            console.error('Failed to paste:', err);
        }
    });

    // Copy result
    document.getElementById('copyResult').addEventListener('click', () => {
        const resultEl = document.getElementById('targetText');
        const text = resultEl.textContent;
        if (text && !text.includes('apparaîtra ici')) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copié!');
            });
        }
    });

    // Speak result
    document.getElementById('speakResult').addEventListener('click', () => {
        const resultEl = document.getElementById('targetText');
        const text = resultEl.textContent;
        if (text && !text.includes('apparaîtra ici') && 'speechSynthesis' in window) {
            const targetLang = document.getElementById('targetLang').value;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = getLangCode(targetLang);
            speechSynthesis.speak(utterance);
        }
    });

    // Quick style buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (activeStyle === action) {
                btn.classList.remove('active');
                activeStyle = null;
            } else {
                document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeStyle = action;
            }
        });
    });

    // Clear history
    document.getElementById('clearHistory').addEventListener('click', clearHistory);

    // Keyboard shortcut (Ctrl+Enter to translate)
    sourceText.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            translateText();
        }
    });
}

// Update character count
function updateCharCount() {
    const text = document.getElementById('sourceText').value;
    document.getElementById('charCount').textContent = `${text.length} caractères`;
}

// Swap languages
function swapLanguages() {
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');

    // Skip if source is auto-detect
    if (sourceLang.value === 'auto') return;

    const temp = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = temp;

    // Swap texts if translation exists
    const sourceText = document.getElementById('sourceText');
    const targetText = document.getElementById('targetText');

    if (targetText.textContent && !targetText.textContent.includes('apparaîtra ici')) {
        const tempText = sourceText.value;
        sourceText.value = targetText.textContent;
        targetText.textContent = tempText;
        updateCharCount();
    }
}

// Translate text
async function translateText() {
    const sourceText = document.getElementById('sourceText').value.trim();
    if (!sourceText) {
        showToast('Veuillez entrer du texte à traduire', 'error');
        return;
    }

    const apiKey = localStorage.getItem('translateApiKey');
    if (!apiKey) {
        document.getElementById('apiModal').classList.remove('hidden');
        return;
    }

    const sourceLang = document.getElementById('sourceLang').value;
    const targetLang = document.getElementById('targetLang').value;
    const model = localStorage.getItem('translateModel') || 'openai/gpt-3.5-turbo';

    const translateBtn = document.getElementById('translateBtn');
    translateBtn.classList.add('loading');
    translateBtn.disabled = true;

    const startTime = Date.now();

    try {
        const result = await callTranslationAPI(sourceText, sourceLang, targetLang, model, apiKey);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);

        // Display result
        const targetTextEl = document.getElementById('targetText');
        targetTextEl.innerHTML = '';
        targetTextEl.textContent = result.translation;
        targetTextEl.dir = targetLang === 'ar' ? 'rtl' : 'ltr';

        // Show detected language
        if (result.detectedLang && sourceLang === 'auto') {
            document.getElementById('detectedLang').textContent = `Détecté: ${getLangName(result.detectedLang)}`;
        }

        // Show translation time
        document.getElementById('translationTime').textContent = `Traduit en ${duration}s`;

        // Add to history
        addToHistory(sourceText, result.translation, sourceLang, targetLang);

    } catch (error) {
        console.error('Translation error:', error);
        document.getElementById('targetText').innerHTML = `<span style="color: #f87171;">Erreur: ${error.message}</span>`;
    } finally {
        translateBtn.classList.remove('loading');
        translateBtn.disabled = false;
    }
}

// Call OpenRouter API for translation
async function callTranslationAPI(text, sourceLang, targetLang, model, apiKey) {
    const sourceLanguage = sourceLang === 'auto' ? 'the source language (auto-detect)' : getLangName(sourceLang);
    const targetLanguage = getLangName(targetLang);

    let styleInstruction = '';
    if (activeStyle) {
        switch (activeStyle) {
            case 'formal':
                styleInstruction = 'Use a formal, respectful tone.';
                break;
            case 'casual':
                styleInstruction = 'Use a casual, friendly tone.';
                break;
            case 'professional':
                styleInstruction = 'Use a professional, business-appropriate tone.';
                break;
            case 'simplify':
                styleInstruction = 'Simplify the language and make it easy to understand.';
                break;
        }
    }

    const prompt = `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. ${styleInstruction}

Important guidelines:
- Provide ONLY the translation, no explanations
- Maintain the original meaning and context
- Keep formatting (paragraphs, line breaks) if present
- For Arabic text, use Modern Standard Arabic unless colloquial is clearly intended
${sourceLang === 'auto' ? '- First detect the source language and mention it briefly' : ''}

Text to translate:
"""
${text}
"""`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Outlook AI Translator'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert translator. Respond with only the translation, nothing else.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const translation = data.choices?.[0]?.message?.content?.trim();

    if (!translation) {
        throw new Error('Aucune traduction reçue');
    }

    // Try to detect language from response
    let detectedLang = null;
    if (sourceLang === 'auto') {
        // Simple detection from common patterns
        if (/[\u0600-\u06FF]/.test(text.substring(0, 50))) {
            detectedLang = 'ar';
        } else if (/[àâäéèêëïîôùûüÿçœæ]/i.test(text.substring(0, 50))) {
            detectedLang = 'fr';
        } else {
            detectedLang = 'en';
        }
    }

    return { translation, detectedLang };
}

// Get language name
function getLangName(code) {
    const names = {
        'ar': 'Arabe',
        'fr': 'Français',
        'en': 'Anglais',
        'auto': 'Auto'
    };
    return names[code] || code;
}

// Get language code for speech
function getLangCode(code) {
    const codes = {
        'ar': 'ar-SA',
        'fr': 'fr-FR',
        'en': 'en-US'
    };
    return codes[code] || 'en-US';
}

// History management
function addToHistory(source, target, sourceLang, targetLang) {
    const item = {
        source: source.substring(0, 100),
        target: target.substring(0, 100),
        sourceLang,
        targetLang,
        timestamp: Date.now()
    };

    translationHistory.unshift(item);
    if (translationHistory.length > 10) {
        translationHistory.pop();
    }

    localStorage.setItem('translationHistory', JSON.stringify(translationHistory));
    renderHistory();
}

function loadHistory() {
    const saved = localStorage.getItem('translationHistory');
    if (saved) {
        translationHistory = JSON.parse(saved);
        renderHistory();
    }
}

function renderHistory() {
    const container = document.getElementById('historyList');

    if (translationHistory.length === 0) {
        container.innerHTML = '<div class="history-empty"><p>Aucun historique de traduction</p></div>';
        return;
    }

    container.innerHTML = translationHistory.map(item => `
        <div class="history-item" data-source="${escapeHtml(item.source)}" data-target="${escapeHtml(item.target)}" 
             data-source-lang="${item.sourceLang}" data-target-lang="${item.targetLang}">
            <span class="history-langs">${getLangName(item.sourceLang)} → ${getLangName(item.targetLang)}</span>
            <div class="history-text">
                <span class="history-source">${escapeHtml(item.source)}</span>
                <span class="history-arrow">→</span>
                <span class="history-target">${escapeHtml(item.target)}</span>
            </div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('sourceText').value = item.dataset.source;
            document.getElementById('sourceLang').value = item.dataset.sourceLang;
            document.getElementById('targetLang').value = item.dataset.targetLang;
            updateCharCount();
        });
    });
}

function clearHistory() {
    translationHistory = [];
    localStorage.removeItem('translationHistory');
    renderHistory();
}

// API Settings
function loadApiSettings() {
    const apiKey = localStorage.getItem('translateApiKey');
    const model = localStorage.getItem('translateModel');

    if (apiKey) {
        document.getElementById('apiKeyInput').value = apiKey;
    }
    if (model) {
        document.getElementById('aiModelSelect').value = model;
    }

    // Check if AI settings exist from ai-search page
    const aiSettings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
    if (!apiKey && aiSettings.apiKey) {
        localStorage.setItem('translateApiKey', aiSettings.apiKey);
        document.getElementById('apiKeyInput').value = aiSettings.apiKey;
    }
}

document.getElementById('saveApiSettings').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const model = document.getElementById('aiModelSelect').value;

    if (apiKey) {
        localStorage.setItem('translateApiKey', apiKey);
        localStorage.setItem('translateModel', model);
        document.getElementById('apiModal').classList.add('hidden');
        showToast('Paramètres enregistrés!');
    } else {
        showToast('Veuillez entrer une clé API', 'error');
    }
});

document.getElementById('closeApiModal').addEventListener('click', () => {
    document.getElementById('apiModal').classList.add('hidden');
});

// Toast notification
function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${type === 'error' ? '#dc2626' : '#059669'};
        color: white;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        animation: fadeInUp 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    @keyframes fadeOut {
        to {
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
