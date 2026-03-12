// Theme Toggle Functionality
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    
    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    // Apply saved theme
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.textContent = '☀️';
    }
    
    // Toggle theme on button click
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Switch to dark mode
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            themeIcon.textContent = '🌙';
        } else {
            // Switch to light mode
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            themeIcon.textContent = '☀️';
        }
    });
}

// Initialize theme when DOM is loaded
document.addEventListener('DOMContentLoaded', initTheme);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const resultDiv = document.getElementById('result');

    // Reset UI
    resultDiv.classList.add('hidden');
    resultDiv.classList.remove('success', 'error');
    submitBtn.disabled = true;
    btnText.textContent = 'Connexion...';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        resultDiv.classList.remove('hidden');
        if (data.success) {
            resultDiv.classList.add('success');
            resultDiv.innerHTML = `<strong>Succès !</strong><br>Redirection vers le tableau de bord...`;

            // Store email in session
            sessionStorage.setItem('userEmail', email);

            // Redirect to dashboard after a short delay
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            resultDiv.classList.add('error');
            resultDiv.innerHTML = `<strong>Erreur :</strong> ${data.message}`;
        }

    } catch (error) {
        resultDiv.classList.remove('hidden');
        resultDiv.classList.add('error');
        resultDiv.innerHTML = `<strong>Erreur réseau :</strong> Impossible de joindre le serveur.`;
    } finally {
        submitBtn.disabled = false;
        btnText.textContent = 'Se connecter';
    }
});
