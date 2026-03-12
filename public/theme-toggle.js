// ============================================
// SHARED THEME TOGGLE FUNCTIONALITY
// Include this file in all HTML pages
// ============================================

// Initialize theme on page load
function initTheme() {
    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';

    // Apply saved theme
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// Toggle theme function
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');

    if (currentTheme === 'light') {
        // Switch to dark mode
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        // Switch to light mode
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// Initialize theme immediately (before DOM load to prevent flash)
initTheme();

// Also run on DOMContentLoaded for safety
document.addEventListener('DOMContentLoaded', initTheme);
