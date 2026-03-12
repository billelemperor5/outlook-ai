// Check if user is logged in
function initDashboard() {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl) {
        userEmailEl.textContent = userEmail;
    }

    // Load saved settings
    loadSettings();

    // Initialize theme toggle
    initTheme();

    // Setup event listeners
    setupDashboardEventListeners();

    // Check for unread emails immediately
    console.log('[Dashboard] Initializing and checking unread emails...');
    checkUnreadEmails();

    // Request notification permission
    requestNotificationPermission();

    // Auto-refresh unread count every 10 seconds for near real-time updates
    setInterval(checkUnreadEmails, 10000);
}

// Setup all event listeners for dashboard
function setupDashboardEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('userEmail');
            window.location.href = 'index.html';
        });
    }

    // Mail Card Click
    const mailCard = document.getElementById('mailCard');
    if (mailCard) {
        mailCard.addEventListener('click', () => {
            window.location.href = 'inbox.html';
        });
    }

    // AI Search Card Click - Show modal
    const aiSearchCard = document.getElementById('aiSearchCard');
    if (aiSearchCard) {
        aiSearchCard.addEventListener('click', () => {
            openSearchOptionsModal();
        });
    }

    // Inbox Smart Card Click
    const inboxSmartCard = document.getElementById('inboxSmartCard');
    if (inboxSmartCard) {
        inboxSmartCard.addEventListener('click', () => {
            window.location.href = 'inbox-smart.html';
        });
    }

    // Translate Card Click
    const translateCard = document.getElementById('translateCard');
    if (translateCard) {
        translateCard.addEventListener('click', () => {
            window.location.href = 'translate.html';
        });
    }

    // Settings Card Click
    const settingsCard = document.getElementById('settingsCard');
    if (settingsCard) {
        settingsCard.addEventListener('click', () => {
            openSettingsModal();
        });
    }

    // Search Options Modal Controls
    const closeSearchModal = document.getElementById('closeSearchModal');
    if (closeSearchModal) {
        closeSearchModal.addEventListener('click', closeSearchOptionsModal);
    }
    const searchOptionsModal = document.getElementById('searchOptionsModal');
    if (searchOptionsModal) {
        searchOptionsModal.addEventListener('click', (e) => {
            if (e.target.id === 'searchOptionsModal') closeSearchOptionsModal();
        });
    }

    // AI Advanced Search Option
    const aiAdvancedSearch = document.getElementById('aiAdvancedSearch');
    if (aiAdvancedSearch) {
        aiAdvancedSearch.addEventListener('click', () => {
            window.location.href = 'ai-search.html';
        });
    }

    // Classic Advanced Search Option
    const classicAdvancedSearch = document.getElementById('classicAdvancedSearch');
    if (classicAdvancedSearch) {
        classicAdvancedSearch.addEventListener('click', () => {
            window.location.href = 'search-classic.html';
        });
    }

    // Close Settings Modal
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', closeSettingsModal);
    }
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') closeSettingsModal();
        });
    }

    // Save Settings
    const saveSettings = document.getElementById('saveSettings');
    if (saveSettings) {
        saveSettings.addEventListener('click', () => {
            const settings = {
                resultsPerPage: document.getElementById('resultsPerPage').value
            };

            localStorage.setItem('generalSettings', JSON.stringify(settings));

            // Show success feedback
            const saveBtn = document.getElementById('saveSettings');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Enregistré';
            saveBtn.style.background = '#059669';

            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '';
                closeSettingsModal();
            }, 1500);
        });
    }

    // Toggle AI Config Section
    const aiConfigToggle = document.getElementById('aiConfigToggle');
    if (aiConfigToggle) {
        aiConfigToggle.addEventListener('click', () => {
            const content = document.getElementById('aiConfigContent');
            const icon = document.getElementById('aiToggleIcon');
            if (content) content.classList.toggle('collapsed');
            if (icon) icon.classList.toggle('collapsed');
        });
    }
}

// Handle both cases: page already loaded or still loading
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    // DOM already loaded, run immediately
    initDashboard();
}

// Theme Toggle Functionality
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';

    // Apply saved theme
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '☀️';
    }

    // Toggle theme on button click (only if element exists)
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');

            if (currentTheme === 'light') {
                // Switch to dark mode
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'dark');
                if (themeIcon) themeIcon.textContent = '🌙';
            } else {
                // Switch to light mode
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                if (themeIcon) themeIcon.textContent = '☀️';
            }
        });
    }
}

// Modal functions
function openSearchOptionsModal() {
    closeSettingsModal(); // Close settings if open
    const modal = document.getElementById('searchOptionsModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSearchOptionsModal() {
    const modal = document.getElementById('searchOptionsModal');
    if (modal) modal.classList.add('hidden');
}

function openSettingsModal() {
    closeSearchOptionsModal(); // Close search modal if open
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
}

// Keep closeModal for backwards compatibility
function closeModal() {
    closeSettingsModal();
}

// Load Settings
function loadSettings() {
    const generalSettings = JSON.parse(localStorage.getItem('generalSettings') || '{}');

    if (generalSettings.resultsPerPage) {
        document.getElementById('resultsPerPage').value = generalSettings.resultsPerPage;
    }

    // Load AI settings
    loadAiSettings();
}

// ============================================
// AI CONFIGURATION
// ============================================

// Load AI Settings from server
async function loadAiSettings() {
    try {
        const response = await fetch('/api/ai-settings', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            updateAiStatus(data.configured, data.message);

            if (data.model) {
                document.getElementById('aiModel').value = data.model;
            }

            // Load saved key from localStorage (masked)
            const savedKey = localStorage.getItem('openrouterApiKey');
            if (savedKey) {
                document.getElementById('openrouterApiKey').value = savedKey;
            }
        }
    } catch (error) {
        console.error('Error loading AI settings:', error);
        updateAiStatus(false, 'Erreur de connexion');
    }
}

// Update AI Status indicator
function updateAiStatus(connected, message) {
    const statusIndicator = document.querySelector('#aiStatus .status-indicator');
    const statusText = document.querySelector('#aiStatus .status-text');

    if (statusIndicator && statusText) {
        statusIndicator.className = 'status-indicator';

        if (connected === true) {
            statusIndicator.classList.add('connected');
            statusText.textContent = message || 'Connecté';
        } else if (connected === false) {
            statusIndicator.classList.add('error');
            statusText.textContent = message || 'Non configuré';
        } else {
            statusText.textContent = 'Vérification...';
        }
    }
}

// Save AI Settings
document.getElementById('saveAiSettings')?.addEventListener('click', async () => {
    const apiKey = document.getElementById('openrouterApiKey').value.trim();
    const model = document.getElementById('aiModel').value;
    const saveBtn = document.getElementById('saveAiSettings');

    if (!apiKey) {
        alert('Veuillez entrer une clé API OpenRouter');
        return;
    }

    // Disable button and show loading
    saveBtn.disabled = true;
    const originalHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span>Vérification...</span>';

    try {
        // First verify the key works
        const checkResponse = await fetch('/api/check-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ apiKey })
        });

        const checkData = await checkResponse.json();

        if (checkData.success) {
            // Key is valid, save it
            const saveResponse = await fetch('/api/save-ai-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ apiKey, model })
            });

            if (saveResponse.ok) {
                // Save to localStorage (for persistence across sessions)
                localStorage.setItem('openrouterApiKey', apiKey);
                localStorage.setItem('aiModel', model);

                updateAiStatus(true, `Connecté - ${checkData.modelsAvailable || 'N/A'} modèles disponibles`);

                saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Enregistré!';
                saveBtn.style.background = '#10b981';

                setTimeout(() => {
                    saveBtn.innerHTML = originalHtml;
                    saveBtn.style.background = '';
                    saveBtn.disabled = false;
                }, 2000);
            }
        } else {
            updateAiStatus(false, checkData.message || 'Clé API invalide');
            saveBtn.innerHTML = originalHtml;
            saveBtn.disabled = false;
            alert('Erreur: ' + (checkData.message || 'Clé API invalide'));
        }
    } catch (error) {
        console.error('Error saving AI settings:', error);
        updateAiStatus(false, 'Erreur de connexion');
        saveBtn.innerHTML = originalHtml;
        saveBtn.disabled = false;
        alert('Erreur de connexion au serveur');
    }
});

// ============================================
// UNREAD EMAILS NOTIFICATION
// ============================================

async function checkUnreadEmails() {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        console.log('[Notification] No user email in session');
        return;
    }

    try {
        console.log('[Notification] Checking unread emails for:', userEmail);
        const response = await fetch('/api/unread-count', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: userEmail })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[Notification] Unread count:', data.unreadCount);
            updateMailBadge(data.unreadCount || 0);
        } else if (response.status === 401) {
            // Session expired - try to re-authenticate by redirecting to login
            console.warn('[Notification] Session expired, using fallback method');
            // Use fallback: fetch emails and count unseen manually
            await checkUnreadEmailsFallback();
        } else {
            console.error('[Notification] API error:', response.status);
        }
    } catch (error) {
        console.error('[Notification] Error checking unread emails:', error);
        // Try fallback method
        await checkUnreadEmailsFallback();
    }
}

// Fallback method: fetch emails list and count unread
async function checkUnreadEmailsFallback() {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
        const response = await fetch('/api/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: userEmail, folder: 'INBOX', limit: 100 })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.emails) {
                const unreadCount = data.emails.filter(e => !e.seen).length;
                console.log('[Notification Fallback] Unread count:', unreadCount);
                updateMailBadge(unreadCount);
            }
        }
    } catch (error) {
        console.error('[Notification Fallback] Error:', error);
    }
}

function updateMailBadge(count) {
    const badge = document.getElementById('mailBadge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');

        // Update page title with unread count
        document.title = `(${count}) Outlook AI - Tableau de bord`;

        // Show browser notification if supported
        if (Notification.permission === 'granted' && count > 0) {
            // Only show notification if count increased (store previous count)
            const previousCount = parseInt(sessionStorage.getItem('previousUnreadCount') || '0');
            if (count > previousCount) {
                showBrowserNotification(count - previousCount);
            }
            sessionStorage.setItem('previousUnreadCount', count.toString());
        }
    } else {
        badge.classList.add('hidden');
        document.title = 'Outlook AI - Tableau de bord';
    }
}

function showBrowserNotification(newCount) {
    if (Notification.permission !== 'granted') return;

    const notification = new Notification('Outlook AI - Nouveaux messages', {
        body: `Vous avez ${newCount} nouveau(x) message(s) non lu(s)`,
        icon: '/favicon.ico',
        tag: 'unread-emails'
    });

    notification.onclick = () => {
        window.focus();
        window.location.href = 'inbox.html';
        notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('[Notification] Permission granted');
                }
            });
        } else if (Notification.permission === 'granted') {
            console.log('[Notification] Permission already granted');
        }
    }
}

// ============================================
// SYNC FUNCTIONALITY - Outlook Style
// ============================================

let syncCancelled = false;

// Sync Button Click
document.getElementById('syncBtn').addEventListener('click', () => {
    startSync();
});

// Close Sync Modal
document.getElementById('closeSyncModal').addEventListener('click', closeSyncModal);
document.getElementById('syncModal').addEventListener('click', (e) => {
    if (e.target.id === 'syncModal') closeSyncModal();
});

// Cancel Sync
document.getElementById('cancelSyncBtn').addEventListener('click', () => {
    syncCancelled = true;
    document.getElementById('syncCurrentTask').textContent = 'Annulation en cours...';
});

// Sync Tab Switching
document.querySelectorAll('.sync-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.sync-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // TODO: Switch between tasks and errors view
    });
});

function openSyncModal() {
    document.getElementById('syncModal').classList.remove('hidden');
}

function closeSyncModal() {
    document.getElementById('syncModal').classList.add('hidden');
    syncCancelled = false;
}

async function startSync() {
    const syncBtn = document.getElementById('syncBtn');
    const userEmail = sessionStorage.getItem('userEmail');

    if (!userEmail) {
        alert('Session expirée. Veuillez vous reconnecter.');
        return;
    }

    // Open modal and start animation
    openSyncModal();
    syncBtn.classList.add('syncing');
    syncCancelled = false;

    // Reset progress
    updateSyncProgress(0, 0);
    document.getElementById('syncTasksList').innerHTML = '';
    document.getElementById('syncCurrentTask').textContent = 'Initialisation...';

    // Define sync tasks
    const tasks = [
        { name: `${userEmail} - Envoi`, action: 'check-outgoing' },
        { name: 'Synchronisation des dossiers', action: 'sync-folders' },
        { name: 'Vérification de la boîte de réception', action: 'check-inbox' },
        { name: 'Vérification des brouillons', action: 'check-drafts' },
        { name: 'Vérification du spam', action: 'check-spam' },
        { name: 'Vérification OpenRouter AI', action: 'check-ai' }
    ];

    document.getElementById('syncTasksTotal').textContent = tasks.length;

    // Add tasks to list
    tasks.forEach((task, index) => {
        addSyncTask(task.name, 'pending', index);
    });

    // Execute tasks
    let completedTasks = 0;

    for (let i = 0; i < tasks.length; i++) {
        if (syncCancelled) {
            updateTaskStatus(i, 'error', 'Annulé');
            break;
        }

        const task = tasks[i];
        document.getElementById('syncCurrentTask').textContent = task.name;
        updateTaskProgress(i, 0);

        try {
            // Simulate task progress
            for (let progress = 0; progress <= 100; progress += 20) {
                if (syncCancelled) break;
                updateTaskProgress(i, progress);
                await delay(100);
            }

            if (!syncCancelled) {
                // Perform actual sync check
                await performSyncTask(task.action);
                updateTaskStatus(i, 'success', 'Terminée');
                completedTasks++;
                updateSyncProgress(completedTasks, tasks.length);
            }
        } catch (error) {
            console.error('Sync task error:', error);
            updateTaskStatus(i, 'error', 'Erreur');
        }
    }

    // Finish sync
    syncBtn.classList.remove('syncing');

    if (syncCancelled) {
        document.getElementById('syncCurrentTask').textContent = 'Synchronisation annulée';
    } else {
        document.getElementById('syncCurrentTask').textContent = 'Synchronisation terminée';
    }
}

function updateSyncProgress(done, total) {
    document.getElementById('syncTasksDone').textContent = done;
    document.getElementById('syncTasksTotal').textContent = total;

    const percentage = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('syncProgressFill').style.width = percentage + '%';
}

function addSyncTask(name, status, index) {
    const tasksList = document.getElementById('syncTasksList');

    const taskHtml = `
        <div class="sync-task-item" id="syncTask${index}">
            <div class="sync-task-icon ${status}">
                ${getStatusIcon(status)}
            </div>
            <div class="sync-task-name">${name}</div>
            <div class="sync-task-progress">
                <div class="sync-task-progress-fill" id="syncTaskProgress${index}" style="width: 0%"></div>
            </div>
            <div class="sync-task-status" id="syncTaskStatus${index}">En attente</div>
        </div>
    `;

    tasksList.insertAdjacentHTML('beforeend', taskHtml);
}

function updateTaskProgress(index, progress) {
    const progressFill = document.getElementById(`syncTaskProgress${index}`);
    if (progressFill) {
        progressFill.style.width = progress + '%';
    }
}

function updateTaskStatus(index, status, text) {
    const taskItem = document.getElementById(`syncTask${index}`);
    const statusEl = document.getElementById(`syncTaskStatus${index}`);
    const iconEl = taskItem?.querySelector('.sync-task-icon');

    if (statusEl) {
        statusEl.textContent = text;
    }

    if (iconEl) {
        iconEl.className = `sync-task-icon ${status}`;
        iconEl.innerHTML = getStatusIcon(status);
    }

    // Update progress to 100% if success
    if (status === 'success') {
        updateTaskProgress(index, 100);
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'success':
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        case 'error':
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        case 'pending':
        default:
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
    }
}

async function performSyncTask(action) {
    const userEmail = sessionStorage.getItem('userEmail');

    try {
        switch (action) {
            case 'check-outgoing':
                // Check sent folder
                await fetch('/api/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: userEmail, folder: 'INBOX.Sent', limit: 5 })
                });
                break;

            case 'sync-folders':
                // Get folder list (login does this, so we just verify connection)
                await fetch('/api/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: userEmail, folder: 'INBOX', limit: 1 })
                });
                break;

            case 'check-inbox':
                await fetch('/api/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: userEmail, folder: 'INBOX', limit: 10 })
                });
                break;

            case 'check-drafts':
                await fetch('/api/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: userEmail, folder: 'INBOX.Drafts', limit: 5 })
                });
                break;

            case 'check-spam':
                await fetch('/api/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: userEmail, folder: 'INBOX.Junk', limit: 5 })
                });
                break;

            case 'check-ai':
                // Check OpenRouter AI API connection
                const aiResponse = await fetch('/api/check-ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                });
                if (!aiResponse.ok) {
                    const errorData = await aiResponse.json();
                    if (!errorData.success) {
                        console.warn('AI API check warning:', errorData.message);
                        // Don't throw error, just warn - AI is optional
                    }
                }
                break;
        }
    } catch (error) {
        console.error('Sync API error:', error);
        throw error;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
