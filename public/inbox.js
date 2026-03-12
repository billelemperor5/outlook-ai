// Check authentication
document.addEventListener('DOMContentLoaded', async () => {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize theme toggle
    initTheme();

    // Check for URL parameters (e.g. from search results)
    const urlParams = new URLSearchParams(window.location.search);
    const folderParam = urlParams.get('folder');
    const openUid = urlParams.get('open');

    if (folderParam) {
        currentFolder = folderParam;
        document.getElementById('currentFolderName').textContent = folderNames[folderParam] || folderParam;

        // Update active folder in sidebar
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.toggle('active', item.dataset.folder === folderParam);
        });
    }

    // Load emails and handle opening specific one if requested
    await loadEmails(currentFolder, openUid);
});

// Theme toggle functionality
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';

    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '☀️';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');

            if (currentTheme === 'light') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'dark');
                if (themeIcon) themeIcon.textContent = '🌙';
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                if (themeIcon) themeIcon.textContent = '☀️';
            }
        });
    }
}

// State
let currentFolder = 'INBOX';
let currentEmail = null;
let emails = [];
let selectedEmails = new Set();
let totalFolderEmails = 0;

// Folder names mapping (IMAP folder names -> Display names)
const folderNames = {
    'INBOX': 'Boîte de réception',
    'INBOX.Sent': 'Envoyés',
    'INBOX.Drafts': 'Brouillons',
    'INBOX.Junk': 'Spam',
    'INBOX.Trash': 'Corbeille'
};

// Back to Dashboard
document.getElementById('backToDashboard').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});

// Mobile Sidebar Toggle
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    });
}

function closeMobileSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }
}

// Folder Navigation
document.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', () => {
        const folder = item.dataset.folder;
        if (folder !== currentFolder) {
            document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
            item.classList.add('active');
            currentFolder = folder;
            document.getElementById('currentFolderName').textContent = folderNames[folder] || folder;
            loadEmails(folder);
            closeMobileSidebar();
        }
    });
});

// Load emails from server
async function loadEmails(folder, openUid = null) {
    const emailList = document.getElementById('emailList');
    emailList.innerHTML = `
        <div class="loading-emails">
            <div class="spinner"></div>
            <p>Chargement des messages...</p>
        </div>
    `;

    // Hide reader
    document.getElementById('emailReaderPlaceholder').style.display = 'flex';
    document.getElementById('emailReader').classList.add('hidden');
    currentEmail = null;
    selectedEmails.clear();
    updateDeleteButton();

    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: userEmail,
                folder: folder,
                limit: 50
            })
        });

        const data = await response.json();

        if (data.success) {
            emails = data.emails || [];

            // Update inbox count
            if (folder === 'INBOX') {
                const unreadCount = emails.filter(e => !e.seen).length;
                document.getElementById('inboxCount').textContent = unreadCount > 0 ? unreadCount : '';
            }

            // Update elements count in status bar
            totalFolderEmails = data.total || emails.length;
            updateElementsCount(totalFolderEmails);

            renderEmailList(emails);

            // Handle opening a specific email (by UID)
            if (openUid) {
                const emailToOpen = emails.find(e => e.uid.toString() === openUid.toString());
                if (emailToOpen) {
                    openEmail(emailToOpen);
                } else {
                    // If not in the current list, try fetching it directly
                    fetchDirectEmail(folder, openUid);
                }
            }
        } else {
            showError(data.message || 'Erreur lors du chargement des messages');
        }
    } catch (error) {
        console.error('Error loading emails:', error);
        showError('Impossible de se connecter au serveur');
    }
}

// Fetch a single email directly if not in list
async function fetchDirectEmail(folder, uid) {
    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: userEmail, folder, uid })
        });
        const data = await response.json();
        if (data.success) {
            openEmail(data.email);
        }
    } catch (e) {
        console.error('Error fetching direct email:', e);
    }
}

// Render email list
function renderEmailList(emailsToRender) {
    const emailList = document.getElementById('emailList');

    if (!emailsToRender || emailsToRender.length === 0) {
        emailList.innerHTML = `
            <div class="no-emails">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
                <p>Aucun message dans ce dossier</p>
            </div>
        `;
        return;
    }

    emailList.innerHTML = emailsToRender.map((email, index) => `
        <div class="email-item ${email.seen ? '' : 'unread'} ${currentEmail && currentEmail.uid === email.uid ? 'active' : ''}" 
             data-uid="${email.uid}" data-index="${index}">
            <input type="checkbox" class="email-checkbox" data-uid="${email.uid}" 
                   ${selectedEmails.has(email.uid) ? 'checked' : ''}>
            <div class="email-content">
                <div class="email-header-row">
                    <span class="email-sender">${escapeHtml(email.from || 'Inconnu')}</span>
                    <span class="email-time">${formatDate(email.date)}</span>
                </div>
                <div class="email-subject">${escapeHtml(email.subject || '(Sans objet)')}</div>
                <div class="email-preview">${escapeHtml(email.preview || '')}</div>
            </div>
        </div>
    `).join('');

    // Add click handlers
    emailList.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('email-checkbox')) return;
            const index = parseInt(item.dataset.index);
            openEmail(emails[index]);
        });
    });

    // Add checkbox handlers
    emailList.querySelectorAll('.email-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            const uid = checkbox.dataset.uid;
            if (checkbox.checked) {
                selectedEmails.add(uid);
            } else {
                selectedEmails.delete(uid);
            }
            updateDeleteButton();
        });
    });
}

// Open email
async function openEmail(email) {
    currentEmail = email;

    // Update list UI
    document.querySelectorAll('.email-item').forEach(item => {
        item.classList.toggle('active', item.dataset.uid === email.uid);
    });

    // Show reader
    document.getElementById('emailReaderPlaceholder').style.display = 'none';
    document.getElementById('emailReader').classList.remove('hidden');

    // Fill in basic info
    document.getElementById('emailSubject').textContent = email.subject || '(Sans objet)';
    document.getElementById('emailFrom').textContent = email.from || 'Inconnu';
    document.getElementById('emailTo').textContent = email.to || '-';
    document.getElementById('emailDate').textContent = formatFullDate(email.date);

    // Set avatar
    const avatar = document.getElementById('senderAvatar');
    const senderName = email.from || 'U';
    avatar.textContent = senderName.charAt(0).toUpperCase();

    // Set body (loading state)
    const bodyDiv = document.getElementById('emailBody');
    bodyDiv.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';

    // Fetch full email content
    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: userEmail,
                folder: currentFolder,
                uid: email.uid
            })
        });

        const data = await response.json();

        if (data.success) {
            // Display email body
            if (data.email.html) {
                bodyDiv.innerHTML = sanitizeHtml(data.email.html);
            } else {
                bodyDiv.innerHTML = `<pre>${escapeHtml(data.email.text || 'Contenu vide')}</pre>`;
            }

            // Handle attachments
            const attachmentsDiv = document.getElementById('emailAttachments');
            const attachmentsList = document.getElementById('attachmentsList');
            const attachmentsCount = document.getElementById('attachmentsCount');

            if (data.email.attachments && data.email.attachments.length > 0) {
                attachmentsDiv.classList.remove('hidden');
                if (attachmentsCount) {
                    attachmentsCount.textContent = `${data.email.attachments.length} pièce(s) jointe(s)`;
                }
                attachmentsList.innerHTML = data.email.attachments.map(att => `
                    <div class="attachment-item">
                        <div class="attachment-info">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                            </svg>
                            <span>${escapeHtml(att.filename)} (${formatFileSize(att.size)})</span>
                        </div>
                        <button class="download-attachment-btn" 
                                data-attachment-id="${att.attachmentId}" 
                                data-filename="${escapeHtml(att.filename)}" 
                                title="Télécharger">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" x2="12" y1="15" y2="3"></line>
                            </svg>
                        </button>
                    </div>
                `).join('');

                // Add download event listeners
                document.querySelectorAll('.download-attachment-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const attachmentId = btn.dataset.attachmentId;
                        const filename = btn.dataset.filename;
                        try {
                            const response = await fetch(`/api/download-attachment/${attachmentId}`, {
                                method: 'GET',
                                credentials: 'include'
                            });

                            if (response.ok) {
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = filename || 'attachment';
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            } else {
                                alert('Erreur lors du téléchargement de la pièce jointe');
                            }
                        } catch (error) {
                            console.error('Download error:', error);
                            alert('Erreur de connexion');
                        }
                    });
                });
            } else {
                attachmentsDiv.classList.add('hidden');
            }

            // Mark as read in the list
            email.seen = true;
            const emailItem = document.querySelector(`.email-item[data-uid="${email.uid}"]`);
            if (emailItem) emailItem.classList.remove('unread');

        } else {
            bodyDiv.innerHTML = `<p style="color: var(--error);">Erreur: ${data.message}</p>`;
        }
    } catch (error) {
        console.error('Error loading email:', error);
        bodyDiv.innerHTML = '<p style="color: var(--error);">Erreur de connexion au serveur</p>';
    }
}

// Close reader
document.getElementById('closeReaderBtn').addEventListener('click', () => {
    document.getElementById('emailReaderPlaceholder').style.display = 'flex';
    document.getElementById('emailReader').classList.add('hidden');
    currentEmail = null;
    document.querySelectorAll('.email-item').forEach(item => item.classList.remove('active'));
});

// Refresh
document.getElementById('refreshBtn').addEventListener('click', () => {
    loadEmails(currentFolder);
});

// Delete selected emails
document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    if (selectedEmails.size === 0) return;

    if (!confirm(`Supprimer ${selectedEmails.size} message(s) ?`)) return;

    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/delete-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: userEmail,
                folder: currentFolder,
                uids: Array.from(selectedEmails)
            })
        });

        const data = await response.json();

        if (data.success) {
            selectedEmails.clear();
            loadEmails(currentFolder);
        } else {
            alert('Erreur: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting emails:', error);
        alert('Erreur de connexion');
    }
});

// Delete current email
document.getElementById('deleteEmailBtn').addEventListener('click', async () => {
    if (!currentEmail) return;

    if (!confirm('Supprimer ce message ?')) return;

    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/delete-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: userEmail,
                folder: currentFolder,
                uids: [currentEmail.uid]
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('emailReaderPlaceholder').style.display = 'flex';
            document.getElementById('emailReader').classList.add('hidden');
            currentEmail = null;
            loadEmails(currentFolder);
        } else {
            alert('Erreur: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting email:', error);
        alert('Erreur de connexion');
    }
});

// Attachments state
let selectedAttachments = [];

// Compose
document.getElementById('composeBtn').addEventListener('click', () => {
    document.getElementById('composeModal').classList.remove('hidden');
    document.getElementById('composeTo').value = '';
    document.getElementById('composeCc').value = '';
    document.getElementById('composeBcc').value = '';
    document.getElementById('composeSubject').value = '';
    document.getElementById('composeBody').value = '';
    // Hide CC/BCC fields by default
    document.getElementById('ccField').classList.add('hidden');
    document.getElementById('bccField').classList.add('hidden');
    // Clear attachments
    selectedAttachments = [];
    renderAttachmentsList();
});

// CC/BCC Toggle buttons
document.getElementById('showCcBtn').addEventListener('click', () => {
    const ccField = document.getElementById('ccField');
    ccField.classList.toggle('hidden');
    if (!ccField.classList.contains('hidden')) {
        document.getElementById('composeCc').focus();
    }
});

document.getElementById('showBccBtn').addEventListener('click', () => {
    const bccField = document.getElementById('bccField');
    bccField.classList.toggle('hidden');
    if (!bccField.classList.contains('hidden')) {
        document.getElementById('composeBcc').focus();
    }
});

document.getElementById('closeComposeModal').addEventListener('click', () => {
    document.getElementById('composeModal').classList.add('hidden');
});

document.getElementById('composeModal').addEventListener('click', (e) => {
    if (e.target.id === 'composeModal') {
        document.getElementById('composeModal').classList.add('hidden');
    }
});

// Send email with attachments
document.getElementById('sendEmailBtn').addEventListener('click', async () => {
    const to = document.getElementById('composeTo').value.trim();
    const cc = document.getElementById('composeCc').value.trim();
    const bcc = document.getElementById('composeBcc').value.trim();
    const subject = document.getElementById('composeSubject').value.trim();
    const body = document.getElementById('composeBody').value.trim();

    if (!to) {
        alert('Veuillez entrer une adresse destinataire');
        return;
    }

    const sendBtn = document.getElementById('sendEmailBtn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Envoi...';

    try {
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append('to', to);
        if (cc) formData.append('cc', cc);
        if (bcc) formData.append('bcc', bcc);
        formData.append('subject', subject);
        formData.append('body', body);

        // Add attachments
        selectedAttachments.forEach(file => {
            formData.append('attachments', file);
        });

        const response = await fetch('/api/send-email', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('composeModal').classList.add('hidden');
            // Clear attachments
            selectedAttachments = [];
            renderAttachmentsList();

            if (data.attachmentCount && data.attachmentCount > 0) {
                alert(`Message envoyé avec ${data.attachmentCount} pièce(s) jointe(s) !`);
            } else {
                alert('Message envoyé avec succès !');
            }
        } else {
            alert('Erreur: ' + data.message);
        }
    } catch (error) {
        console.error('Error sending email:', error);
        alert('Erreur de connexion');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z"></path>
                <path d="M22 2 11 13"></path>
            </svg>
            Envoyer
        `;
    }
});

// Save Draft
document.getElementById('saveDraftBtn').addEventListener('click', async () => {
    const to = document.getElementById('composeTo').value.trim();
    const cc = document.getElementById('composeCc').value.trim();
    const bcc = document.getElementById('composeBcc').value.trim();
    const subject = document.getElementById('composeSubject').value.trim();
    const body = document.getElementById('composeBody').value.trim();

    if (!to && !subject && !body) {
        alert('Le brouillon est vide');
        return;
    }

    const draftBtn = document.getElementById('saveDraftBtn');
    draftBtn.disabled = true;
    draftBtn.textContent = 'Enregistrement...';

    try {
        const userEmail = sessionStorage.getItem('userEmail');
        const response = await fetch('/api/save-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: userEmail,
                to: to,
                cc: cc || undefined,
                bcc: bcc || undefined,
                subject: subject,
                body: body
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('composeModal').classList.add('hidden');
            alert('Brouillon enregistré avec succès !');
        } else {
            alert('Erreur: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving draft:', error);
        alert('Erreur de connexion');
    } finally {
        draftBtn.disabled = false;
        draftBtn.textContent = 'Enregistrer comme brouillon';
    }
});

// Reply
document.getElementById('replyBtn').addEventListener('click', () => {
    if (!currentEmail) return;

    document.getElementById('composeModal').classList.remove('hidden');
    document.getElementById('composeTo').value = currentEmail.from || '';
    document.getElementById('composeSubject').value = 'Re: ' + (currentEmail.subject || '');
    document.getElementById('composeBody').value = '\n\n--- Message original ---\n' + (currentEmail.preview || '');
});

// Forward
document.getElementById('forwardBtn').addEventListener('click', () => {
    if (!currentEmail) return;

    document.getElementById('composeModal').classList.remove('hidden');
    document.getElementById('composeTo').value = '';
    document.getElementById('composeSubject').value = 'Fwd: ' + (currentEmail.subject || '');
    document.getElementById('composeBody').value = '\n\n--- Message transféré ---\nDe: ' + (currentEmail.from || '') + '\n' + (currentEmail.preview || '');
});

// Search
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase().trim();
        if (query === '') {
            renderEmailList(emails);
            updateElementsCount(totalFolderEmails);
        } else {
            const filtered = emails.filter(email =>
                (email.subject && email.subject.toLowerCase().includes(query)) ||
                (email.from && email.from.toLowerCase().includes(query)) ||
                (email.preview && email.preview.toLowerCase().includes(query))
            );
            renderEmailList(filtered);
            updateElementsCount(filtered.length);
        }
    }, 300);
});

// Utility functions
function updateDeleteButton() {
    document.getElementById('deleteSelectedBtn').disabled = selectedEmails.size === 0;
}

// Update elements count in status bar
function updateElementsCount(count) {
    const elementsCountEl = document.getElementById('elementsCount');
    if (elementsCountEl) {
        elementsCountEl.textContent = `Éléments : ${count}`;
    }
}

function showError(message) {
    document.getElementById('emailList').innerHTML = `
        <div class="error-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" x2="12" y1="8" y2="12"></line>
                <line x1="12" x2="12.01" y1="16" y2="16"></line>
            </svg>
            <p>${escapeHtml(message)}</p>
            <button class="retry-btn" onclick="loadEmails('${currentFolder}')">Réessayer</button>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeHtml(html) {
    // Basic sanitization - remove scripts and other dangerous elements
    const div = document.createElement('div');
    div.innerHTML = html;

    // Remove script tags
    div.querySelectorAll('script').forEach(el => el.remove());
    div.querySelectorAll('[onclick], [onerror], [onload]').forEach(el => {
        el.removeAttribute('onclick');
        el.removeAttribute('onerror');
        el.removeAttribute('onload');
    });

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

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

// ============================================
// ATTACHMENTS FUNCTIONALITY
// ============================================

// Add attachment button click
document.getElementById('addAttachmentBtn').addEventListener('click', () => {
    document.getElementById('attachmentInput').click();
});

// Handle file selection
document.getElementById('attachmentInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);

    // Validate files
    files.forEach(file => {
        // Check max file size (25MB)
        if (file.size > 25 * 1024 * 1024) {
            alert(`Le fichier "${file.name}" dépasse la limite de 25 Mo`);
            return;
        }

        // Check if we already have 10 attachments
        if (selectedAttachments.length >= 10) {
            alert('Maximum 10 pièces jointes autorisées');
            return;
        }

        // Check if file is already added
        const isDuplicate = selectedAttachments.some(
            existingFile => existingFile.name === file.name && existingFile.size === file.size
        );

        if (!isDuplicate) {
            selectedAttachments.push(file);
        }
    });

    // Clear input for next selection
    e.target.value = '';

    renderAttachmentsList();
});

// Render attachments list
function renderAttachmentsList() {
    const listContainer = document.getElementById('composeAttachmentsList');

    if (selectedAttachments.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    listContainer.innerHTML = selectedAttachments.map((file, index) => `
        <div class="compose-attachment-item" data-index="${index}">
            <div class="attachment-file-info">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${getFileIcon(file.type)}
                </svg>
                <span class="attachment-name">${escapeHtml(file.name)}</span>
                <span class="attachment-size">(${formatFileSize(file.size)})</span>
            </div>
            <button type="button" class="remove-attachment-btn" data-index="${index}" title="Supprimer">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                </svg>
            </button>
        </div>
    `).join('');

    // Add remove handlers
    listContainer.querySelectorAll('.remove-attachment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            selectedAttachments.splice(index, 1);
            renderAttachmentsList();
        });
    });
}

// Get file icon based on type
function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) {
        return '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
    } else if (mimeType.startsWith('video/')) {
        return '<polygon points="5 3 19 12 5 21 5 3"/>';
    } else if (mimeType.startsWith('audio/')) {
        return '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
    } else if (mimeType.includes('pdf')) {
        return '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12v6"/><path d="M8 15h4"/>';
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/>';
    } else if (mimeType.includes('sheet') || mimeType.includes('excel')) {
        return '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2v2H8z"/><path d="M14 13h2v2h-2z"/><path d="M8 17h2v2H8z"/><path d="M14 17h2v2h-2z"/>';
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
        return '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>';
    } else {
        // Default file icon
        return '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>';
    }
}

// ============================================
// ZOOM CONTROL FUNCTIONALITY
// ============================================

// Zoom state
let currentZoom = parseInt(localStorage.getItem('emailZoom')) || 100;

// Initialize zoom controls
function initZoomControls() {
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    const readerBody = document.getElementById('emailBody');

    if (!zoomSlider || !zoomInBtn || !zoomOutBtn) return;

    // Set initial value
    zoomSlider.value = currentZoom;
    updateZoomDisplay();
    applyZoom();

    // Slider change event
    zoomSlider.addEventListener('input', (e) => {
        currentZoom = parseInt(e.target.value);
        updateZoomDisplay();
        applyZoom();
        saveZoomPreference();
    });

    // Zoom In button
    zoomInBtn.addEventListener('click', () => {
        if (currentZoom < 200) {
            currentZoom = Math.min(200, currentZoom + 10);
            zoomSlider.value = currentZoom;
            updateZoomDisplay();
            applyZoom();
            saveZoomPreference();
        }
    });

    // Zoom Out button
    zoomOutBtn.addEventListener('click', () => {
        if (currentZoom > 50) {
            currentZoom = Math.max(50, currentZoom - 10);
            zoomSlider.value = currentZoom;
            updateZoomDisplay();
            applyZoom();
            saveZoomPreference();
        }
    });

    // Keyboard shortcuts for zoom (Ctrl + / Ctrl -)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomInBtn.click();
            } else if (e.key === '-') {
                e.preventDefault();
                zoomOutBtn.click();
            } else if (e.key === '0') {
                e.preventDefault();
                resetZoom();
            }
        }
    });
}

// Update zoom level display
function updateZoomDisplay() {
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    if (zoomLevelDisplay) {
        zoomLevelDisplay.textContent = `${currentZoom} %`;
    }
}

// Apply zoom to email body
function applyZoom() {
    const readerBody = document.getElementById('emailBody');
    const readerMeta = document.querySelector('.reader-meta');

    if (readerBody) {
        readerBody.style.transform = `scale(${currentZoom / 100})`;
        readerBody.style.transformOrigin = 'top left';
        readerBody.style.width = `${10000 / currentZoom}%`;
    }
}

// Reset zoom to 100%
function resetZoom() {
    currentZoom = 100;
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
        zoomSlider.value = currentZoom;
    }
    updateZoomDisplay();
    applyZoom();
    saveZoomPreference();
}

// Save zoom preference to localStorage
function saveZoomPreference() {
    localStorage.setItem('emailZoom', currentZoom.toString());
}

// Double-click on zoom level to reset
document.addEventListener('DOMContentLoaded', () => {
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    if (zoomLevelDisplay) {
        zoomLevelDisplay.addEventListener('dblclick', () => {
            resetZoom();
        });
        zoomLevelDisplay.style.cursor = 'pointer';
        zoomLevelDisplay.title = 'Double-cliquer pour réinitialiser';
    }

    // Initialize zoom controls
    initZoomControls();

    // Initialize view toggle
    initViewToggle();
});

// ============================================
// VIEW TOGGLE FUNCTIONALITY - Split/Full View
// ============================================

function initViewToggle() {
    const viewSplitBtn = document.getElementById('viewSplitBtn');
    const viewFullBtn = document.getElementById('viewFullBtn');
    const backToSplitBtn = document.getElementById('backToSplitBtn');
    const inboxContainer = document.querySelector('.inbox-container');

    // Load saved view preference
    const savedView = localStorage.getItem('emailViewMode') || 'split';
    if (savedView === 'full') {
        setFullViewMode();
    }

    // Split View Button
    if (viewSplitBtn) {
        viewSplitBtn.addEventListener('click', () => {
            setSplitViewMode();
        });
    }

    // Full View Button
    if (viewFullBtn) {
        viewFullBtn.addEventListener('click', () => {
            setFullViewMode();
        });
    }

    // Back to Split Button (in full view mode)
    if (backToSplitBtn) {
        backToSplitBtn.addEventListener('click', () => {
            setSplitViewMode();
        });
    }

    function setSplitViewMode() {
        if (inboxContainer) {
            inboxContainer.classList.remove('full-view-mode');
        }
        if (viewSplitBtn) viewSplitBtn.classList.add('active');
        if (viewFullBtn) viewFullBtn.classList.remove('active');
        localStorage.setItem('emailViewMode', 'split');
    }

    function setFullViewMode() {
        if (inboxContainer) {
            inboxContainer.classList.add('full-view-mode');
        }
        if (viewSplitBtn) viewSplitBtn.classList.remove('active');
        if (viewFullBtn) viewFullBtn.classList.add('active');
        localStorage.setItem('emailViewMode', 'full');
    }
}
