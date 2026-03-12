// Classic Search Page - JavaScript (Fixed to use correct API)
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

    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    const searchForm = document.getElementById('searchForm');
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch();
    });
}

async function performSearch() {
    const sender = document.getElementById('senderInput').value.trim();
    const folder = document.getElementById('folderSelect').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const keywords = document.getElementById('keywordsInput').value.trim();

    // Show loading
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');

    try {
        // Use the dedicated classic-search API endpoint
        const response = await fetch('/api/classic-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                folder: folder,
                sender: sender || null,
                keywords: keywords || null,
                dateFrom: dateFrom || null,
                dateTo: dateTo || null
            })
        });

        const data = await response.json();

        // Hide loading
        document.getElementById('loadingState').classList.add('hidden');

        if (!data.success) {
            throw new Error(data.message || 'Erreur lors de la recherche');
        }

        // Display results
        const results = data.emails || [];
        if (results.length > 0) {
            displayResults(results);
        } else {
            document.getElementById('emptyState').classList.remove('hidden');
        }

    } catch (error) {
        console.error('Search error:', error);
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        alert('Erreur: ' + error.message);
    }
}

function displayResults(emails) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsCount = document.getElementById('resultsCount');
    const resultsList = document.getElementById('resultsList');

    // Update count
    resultsCount.textContent = `${emails.length} email(s) trouvé(s)`;

    // Render results
    resultsList.innerHTML = emails.map(email => `
        <div class="result-item ${email.seen ? '' : 'unread'}" onclick="openEmail('${email.uid || ''}', '${email.folder || 'INBOX'}')">
            <div class="result-header">
                <div class="sender-info">
                    ${!email.seen ? '<span class="unread-dot"></span>' : ''}
                    <span class="result-from">${escapeHtml(email.fromName || email.from || 'Inconnu')}</span>
                </div>
                <span class="result-date">${formatDate(email.date)}</span>
            </div>
            <div class="result-subject">${escapeHtml(email.subject || '(Sans objet)')}</div>
            <div class="result-preview">${escapeHtml(email.preview || 'Cliquez pour voir le contenu...')}</div>
        </div>
    `).join('');

    // Show results section
    resultsSection.classList.remove('hidden');
}

function openEmail(uid, folder) {
    if (uid) {
        // Save the folder so inbox.html can open the correct email
        sessionStorage.setItem('openEmailUid', uid);
        sessionStorage.setItem('openEmailFolder', folder);
        window.location.href = `inbox.html?open=${uid}&folder=${encodeURIComponent(folder)}`;
    }
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
    const now = new Date();

    if (isNaN(date.getTime())) return dateStr;

    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    const isThisYear = date.getFullYear() === now.getFullYear();

    if (isThisYear) {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
