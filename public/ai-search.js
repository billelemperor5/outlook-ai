// AI Search Page - JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    // Update user email display
    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl) {
        userEmailEl.textContent = userEmail;
    }

    // Check if AI is configured
    checkAiConfiguration();

    // Event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Search button
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchQuery');

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            searchInput.value = chip.dataset.query;
            searchInput.focus();
        });
    });
}

// Check if AI is configured (using settings from dashboard)
function checkAiConfiguration() {
    const apiKey = localStorage.getItem('openrouterApiKey');
    if (!apiKey) {
        console.log('[AI Search] No API key configured. User should configure it in Settings.');
    }
}

// Get AI settings from localStorage (configured in dashboard settings)
function getAiSettings() {
    return {
        apiKey: localStorage.getItem('openrouterApiKey') || '',
        model: localStorage.getItem('aiModel') || 'openai/gpt-3.5-turbo'
    };
}

async function performSearch() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) {
        alert('Veuillez entrer une recherche');
        return;
    }

    // Show loading
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');

    try {
        // First, get emails from the server with more details
        const userEmail = sessionStorage.getItem('userEmail');
        const emailsResponse = await fetch('/api/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: userEmail, folder: 'INBOX', limit: 100 })
        });

        const emailsData = await emailsResponse.json();

        if (!emailsData.success) {
            throw new Error(emailsData.message || 'Erreur lors de la récupération des emails');
        }

        // Check for special queries (examples)
        const lowerQuery = query.toLowerCase();
        let filteredEmails = [];
        let summary = '';

        // Handle special example queries locally (no AI needed)
        if (lowerQuery.includes('non lu') || lowerQuery.includes('unread')) {
            // Filter unread emails from this week
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            filteredEmails = emailsData.emails.filter(e => {
                const emailDate = new Date(e.date);
                return !e.seen && emailDate >= oneWeekAgo;
            });
            summary = `J'ai trouvé ${filteredEmails.length} email(s) non lu(s) de cette semaine.`;
            displayDirectResults(summary, filteredEmails);
            return;
        }

        if (lowerQuery.includes('pièce') || lowerQuery.includes('attachment') || lowerQuery.includes('jointe')) {
            // Need to check for attachments - will be shown as emails with attachments flag
            filteredEmails = emailsData.emails.filter(e => e.hasAttachments);
            if (filteredEmails.length === 0) {
                // If no attachments flag, show message
                summary = `La recherche d'emails avec pièces jointes nécessite l'ouverture de chaque email. Essayez de rechercher par expéditeur ou sujet.`;
                displayDirectResults(summary, []);
            } else {
                summary = `J'ai trouvé ${filteredEmails.length} email(s) avec pièces jointes.`;
                displayDirectResults(summary, filteredEmails);
            }
            return;
        }

        if (lowerQuery.includes('urgent') || lowerQuery.includes('important')) {
            // Filter flagged/important emails
            filteredEmails = emailsData.emails.filter(e => e.flagged);
            summary = `J'ai trouvé ${filteredEmails.length} email(s) marqué(s) comme important/urgent.`;
            displayDirectResults(summary, filteredEmails);
            return;
        }

        // For simple keyword search, do it locally first
        const searchTerms = query.toLowerCase().split(/\s+/);
        filteredEmails = emailsData.emails.filter(email => {
            const searchableText = [
                email.from || '',
                email.subject || '',
                email.preview || '',
                email.fromName || ''
            ].join(' ').toLowerCase();

            return searchTerms.some(term => searchableText.includes(term));
        });

        if (filteredEmails.length > 0) {
            summary = `J'ai trouvé ${filteredEmails.length} email(s) contenant "${query}".`;
            displayDirectResults(summary, filteredEmails);
            return;
        }

        // If no local results, try AI search
        const aiSettings = getAiSettings();
        if (!aiSettings.apiKey) {
            summary = `Aucun email trouvé contenant "${query}". Configurez l'API AI pour une recherche plus intelligente.`;
            displayDirectResults(summary, []);
            return;
        }

        // Prepare context for AI
        const emailContext = emailsData.emails.map((e, idx) =>
            `[${idx}] De: ${e.from} | Sujet: ${e.subject} | Date: ${e.date}`
        ).join('\n');

        // Call AI API using settings from dashboard
        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiSettings.apiKey}`
            },
            body: JSON.stringify({
                model: aiSettings.model,
                messages: [
                    {
                        role: 'system',
                        content: `Tu es un assistant de recherche d'emails TRÈS PRÉCIS. Tu dois analyser UNIQUEMENT les emails qui correspondent EXACTEMENT à la demande de l'utilisateur.

RÈGLES STRICTES:
1. Retourne UNIQUEMENT les emails qui correspondent vraiment à la recherche
2. Si aucun email ne correspond, retourne un tableau vide
3. Cherche dans: l'expéditeur (from), le sujet (subject), et l'aperçu (preview)
4. Sois STRICT: un email doit contenir le terme recherché ou être vraiment pertinent

Voici la liste des ${emailsData.emails.length} emails disponibles:
${emailContext}

IMPORTANT: Réponds UNIQUEMENT avec un JSON valide au format suivant (sans texte avant ou après):
{
  "summary": "Description de ce que tu as trouvé (ou 'Aucun résultat trouvé' si vide)",
  "results": [liste des indices des emails correspondants, tableau vide si aucun match],
  "matchCount": nombre de résultats trouvés
}

Exemple si tu cherches "facture" et que seul l'email à l'index 2 contient ce mot:
{"summary": "J'ai trouvé 1 email concernant une facture", "results": [2], "matchCount": 1}

Exemple si aucun email ne correspond:
{"summary": "Aucun email ne correspond à votre recherche", "results": [], "matchCount": 0}`
                    },
                    {
                        role: 'user',
                        content: `Trouve les emails qui correspondent à: "${query}"`
                    }
                ],
                temperature: 0.1  // Low temperature for more precise results
            })
        });

        const aiData = await aiResponse.json();

        // Hide loading
        document.getElementById('loadingState').classList.add('hidden');

        // Check if API returned an error
        if (aiData.error) {
            throw new Error(aiData.error.message || 'Erreur API OpenRouter');
        }

        // Check if response has valid structure
        if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message) {
            throw new Error('Réponse invalide de l\'API. Vérifiez votre clé API.');
        }

        // Parse AI response and show results
        try {
            const content = aiData.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                displayResults(parsed.summary || content, parsed.results || [], emailsData.emails);
            } else {
                displayResults(content, [], emailsData.emails);
            }
        } catch (parseError) {
            displayResults(aiData.choices[0].message.content, [], emailsData.emails);
        }

    } catch (error) {
        console.error('Search error:', error);
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        alert('Erreur: ' + error.message);
    }
}

// Display results directly (without AI processing)
function displayDirectResults(summary, emails) {
    document.getElementById('loadingState').classList.add('hidden');

    const resultsSection = document.getElementById('resultsSection');
    const summaryText = document.getElementById('summaryText');
    const resultsCount = document.getElementById('resultsCount');
    const resultsList = document.getElementById('resultsList');

    // Show summary
    summaryText.textContent = summary;

    // Update count
    resultsCount.textContent = `${emails.length} email(s) trouvé(s)`;

    // Render results or show "no results" message
    if (emails.length > 0) {
        resultsList.innerHTML = emails.map(email => `
            <div class="result-item">
                <div class="result-header">
                    <span class="result-from">${escapeHtml(email.from || 'Inconnu')}</span>
                    <span class="result-date">${formatDate(email.date)}</span>
                </div>
                <div class="result-subject">${escapeHtml(email.subject || '(Sans objet)')}</div>
                <div class="result-preview">${escapeHtml(email.preview || '')}</div>
            </div>
        `).join('');
    } else {
        resultsList.innerHTML = `
            <div class="no-results">
                <p>Aucun email ne correspond à votre recherche.</p>
                <p style="font-size: 0.9em; opacity: 0.7;">Essayez avec d'autres termes.</p>
            </div>
        `;
    }

    // Show results section
    resultsSection.classList.remove('hidden');
}

function displayResults(summary, indices, emails) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryText = document.getElementById('summaryText');
    const resultsCount = document.getElementById('resultsCount');
    const resultsList = document.getElementById('resultsList');

    // Show summary
    summaryText.textContent = summary;

    // Filter emails based on indices - ONLY show matching emails, not all
    let filteredEmails = [];
    if (indices && indices.length > 0) {
        filteredEmails = indices.map(i => emails[i]).filter(Boolean);
    }

    // Update count
    resultsCount.textContent = `${filteredEmails.length} email(s) trouvé(s)`;

    // Render results or show "no results" message
    if (filteredEmails.length > 0) {
        resultsList.innerHTML = filteredEmails.map(email => `
            <div class="result-item">
                <div class="result-header">
                    <span class="result-from">${escapeHtml(email.from || 'Inconnu')}</span>
                    <span class="result-date">${formatDate(email.date)}</span>
                </div>
                <div class="result-subject">${escapeHtml(email.subject || '(Sans objet)')}</div>
                <div class="result-preview">${escapeHtml(email.preview || '')}</div>
            </div>
        `).join('');
    } else {
        resultsList.innerHTML = `
            <div class="no-results">
                <p>Aucun email ne correspond à votre recherche.</p>
                <p style="font-size: 0.9em; opacity: 0.7;">Essayez avec d'autres termes ou vérifiez l'orthographe.</p>
            </div>
        `;
    }

    // Show results section
    resultsSection.classList.remove('hidden');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
