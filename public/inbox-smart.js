// ============================================
// INBOX SMART - JavaScript Logic (Updated for new design)
// ============================================

// Check authentication
document.addEventListener('DOMContentLoaded', () => {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    // Display user email
    document.getElementById('userEmail').textContent = userEmail;

    // Setup event listeners
    setupEventListeners();

    // Load smart inbox data
    loadSmartInbox();
});

// Global state
let smartData = null;
let currentEmail = null;

// Setup event listeners
function setupEventListeners() {
    // Close modal
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', closeEmailModal);
    }

    // Open in inbox
    const openInInbox = document.getElementById('openInInbox');
    if (openInInbox) {
        openInInbox.addEventListener('click', () => {
            if (currentEmail) {
                sessionStorage.setItem('openEmailUid', currentEmail.uid);
            }
            window.location.href = 'inbox.html';
        });
    }

    // Modal backdrop click
    const modal = document.getElementById('emailModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'emailModal') {
                closeEmailModal();
            }
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('spinning');
            loadSmartInbox().finally(() => {
                setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
            });
        });
    }
}

// Load smart inbox
async function loadSmartInbox() {
    showLoading();

    try {
        const response = await fetch('/api/inbox-smart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            smartData = data;
            updateStats(data.stats);
            renderSections(data);
        } else {
            showError(data.message);
        }
    } catch (error) {
        console.error('Error loading smart inbox:', error);
        showError('Erreur de connexion au serveur');
    }
}

// Show loading state
function showLoading() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('emailSections').classList.add('hidden');
}

// Hide loading state
function hideLoading() {
    document.getElementById('loadingState').classList.add('hidden');
}

// Show error
function showError(message) {
    hideLoading();
    const emptyState = document.getElementById('emptyState');
    emptyState.innerHTML = `
        <div class="empty-icon">❌</div>
        <h3>Erreur</h3>
        <p>${escapeHtml(message)}</p>
        <button onclick="loadSmartInbox()" style="margin-top: 16px; padding: 12px 24px; background: linear-gradient(135deg, #10b981, #059669); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer;">
            Réessayer
        </button>
    `;
    emptyState.classList.remove('hidden');
}

// Update stats cards
function updateStats(stats) {
    document.getElementById('totalCount').textContent = stats.total;
    document.getElementById('todayCount').textContent = stats.today;
    document.getElementById('yesterdayCount').textContent = stats.yesterday;
    document.getElementById('olderCount').textContent = (stats.beforeYesterday || 0) + (stats.older || 0);
}

// Render email sections
function renderSections(data) {
    hideLoading();

    // Check if all empty
    if (data.stats.total === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        return;
    }

    document.getElementById('emailSections').classList.remove('hidden');

    // Render each section
    renderEmailSection('todayEmails', 'todaySectionCount', 'todaySection', data.today);
    renderEmailSection('yesterdayEmails', 'yesterdaySectionCount', 'yesterdaySection', data.yesterday);

    // Combine beforeYesterday and older into "older" section
    const olderEmails = [...(data.beforeYesterday || []), ...(data.older || [])];
    renderEmailSection('olderEmails', 'olderSectionCount', 'olderSection', olderEmails);
}

// Render a single email section
function renderEmailSection(gridId, countId, sectionId, emails) {
    const grid = document.getElementById(gridId);
    const countEl = document.getElementById(countId);
    const section = document.getElementById(sectionId);

    if (!emails || emails.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    countEl.textContent = `${emails.length} email${emails.length > 1 ? 's' : ''}`;

    grid.innerHTML = emails.map(email => `
        <div class="email-card unread" data-uid="${email.uid}">
            <div class="email-header">
                <span class="email-sender">${escapeHtml(extractName(email.from))}</span>
                <span class="email-time">${formatTime(email.date)}</span>
            </div>
            <div class="email-subject">${escapeHtml(email.subject || '(Sans objet)')}</div>
            <div class="email-preview">${escapeHtml(email.preview || '')}</div>
        </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.email-card').forEach(card => {
        card.addEventListener('click', () => {
            const uid = card.dataset.uid;
            openEmail(uid, emails.find(e => e.uid == uid));
        });
    });
}

// Open email modal
async function openEmail(uid, emailData) {
    currentEmail = { uid };

    const modal = document.getElementById('emailModal');
    const modalBody = document.getElementById('modalBody');
    const modalSubject = document.getElementById('modalSubject');
    const modalFrom = document.getElementById('modalFrom');
    const modalDate = document.getElementById('modalDate');

    // Show modal with loading
    modal.classList.remove('hidden');
    modalSubject.textContent = emailData?.subject || 'Chargement...';
    modalFrom.textContent = emailData?.from || 'Chargement...';
    modalDate.textContent = formatFullDate(emailData?.date);
    modalBody.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 60px;">
            <div style="width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        </div>
    `;

    try {
        const response = await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ folder: 'INBOX', uid: parseInt(uid) })
        });

        const data = await response.json();

        if (data.success) {
            modalSubject.textContent = data.subject || '(Sans objet)';
            modalFrom.textContent = data.from || 'Inconnu';
            modalDate.textContent = formatFullDate(data.date);

            if (data.html) {
                modalBody.innerHTML = sanitizeHtml(data.html);
            } else {
                modalBody.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(data.text || '')}</pre>`;
            }
        } else {
            modalBody.innerHTML = `<p style="color: #ef4444;">Erreur: ${escapeHtml(data.message)}</p>`;
        }
    } catch (error) {
        console.error('Error loading email:', error);
        modalBody.innerHTML = '<p style="color: #ef4444;">Erreur de chargement</p>';
    }
}

// Close email modal
function closeEmailModal() {
    document.getElementById('emailModal').classList.add('hidden');
    currentEmail = null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractName(from) {
    if (!from) return 'Inconnu';
    const match = from.match(/^"?([^"<]+)"?\s*<?/);
    if (match) {
        return match[1].trim();
    }
    return from.split('@')[0];
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFullDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;

    // Remove scripts and dangerous elements
    div.querySelectorAll('script, iframe, object, embed, form').forEach(el => el.remove());

    // Remove event handlers
    div.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    return div.innerHTML;
}

// Add CSS for spin animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .spinning {
        animation: spin 0.8s linear infinite;
    }
`;
document.head.appendChild(style);
