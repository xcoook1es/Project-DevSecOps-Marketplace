const USERS_STORAGE_KEY = 'TrustMarket_users';
const ACTIVE_ROLE_KEY = 'TrustMarket_active_role';
const LEGACY_ACTIVE_ROLE_KEY = 'syscore_active_role';
const VALID_ROLES = ['admin', 'seller', 'user'];
const ADMIN_ACCOUNT = {
    email: 'cupcake@admin.com',
    passwordHash: 'ffd33f577660793809c7070ed3509cdcaf1db683996f19fb10b96ca33268a5cb',
    role: 'admin'
};

async function hashPassword(password) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error('Browser tidak mendukung Web Crypto API.');
    }

    const encoded = new TextEncoder().encode(password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function getStoredUsers() {
    try {
        const users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY));
        return Array.isArray(users) ? users : [];
    } catch (error) {
        return [];
    }
}

function saveStoredUsers(users) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function setLoginAlert(message) {
    const alertBox = document.getElementById('login-alert');
    alertBox.textContent = message;
    alertBox.style.display = 'block';
}

// --- 0. Fungsi Menciptakan Objek Jatuh di Background ---
function buatEfekBarangJatuh() {
    const container = document.getElementById('falling-items-container');
    const ikonMarket = ['fa-box-open', 'fa-shopping-cart', 'fa-tag', 'fa-tshirt', 'fa-shoe-prints', 'fa-shopping-bag', 'fa-gift'];
    const jumlahBarang = 25;

    for (let i = 0; i < jumlahBarang; i++) {
        let elem = document.createElement('i');
        let ikonAcak = ikonMarket[Math.floor(Math.random() * ikonMarket.length)];
        elem.classList.add('fas', ikonAcak, 'falling-item');

        let posisiX = Math.random() * 100;
        let durasiAnimasi = 10 + Math.random() * 15;
        let delayAnimasi = Math.random() * -20;
        let ukuranHuruf = 20 + Math.random() * 40;

        elem.style.left = posisiX + 'vw';
        elem.style.animationDuration = durasiAnimasi + 's';
        elem.style.animationDelay = delayAnimasi + 's';
        elem.style.fontSize = ukuranHuruf + 'px';

        container.appendChild(elem);
    }
}

window.addEventListener('DOMContentLoaded', buatEfekBarangJatuh);

// --- 1. Fungsi Navigasi Antar Form ---
function switchView(targetViewId) {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-register').classList.add('hidden');
    document.getElementById('view-forgot').classList.add('hidden');

    const targetView = document.getElementById(targetViewId);
    targetView.classList.remove('hidden');

    targetView.style.animation = 'none';
    targetView.offsetHeight;
    targetView.style.animation = null;

    document.getElementById('login-alert').style.display = 'none';
}

// --- 2. Logika Form Login ---
document.getElementById('form-login').addEventListener('submit', async function(e) {
    e.preventDefault();

    const role = document.getElementById('login-role').value;
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!VALID_ROLES.includes(role)) {
        setLoginAlert('Role tidak valid.');
        return;
    }

    let passwordHash = '';
    try {
        passwordHash = await hashPassword(password);
    } catch (error) {
        setLoginAlert('Login tidak bisa diproses di browser ini. Jalankan lewat server lokal atau browser modern.');
        return;
    }

    let users = getStoredUsers();
    const isAdminLogin =
        role === ADMIN_ACCOUNT.role &&
        username === ADMIN_ACCOUNT.email &&
        passwordHash === ADMIN_ACCOUNT.passwordHash;

    let matchedUser = null;
    if (!isAdminLogin) {
        matchedUser = users.find(user => {
            const sameIdentity = user.email === username && user.role === role;
            const samePassword = user.passwordHash === passwordHash || user.password === password;
            return sameIdentity && samePassword;
        });
    }

    if (!isAdminLogin && !matchedUser) {
        setLoginAlert('Login gagal. Periksa kembali role, email, dan password Anda.');
        return;
    }

    if (matchedUser && matchedUser.password) {
        matchedUser.passwordHash = passwordHash;
        delete matchedUser.password;
        saveStoredUsers(users);
    }

    localStorage.setItem(ACTIVE_ROLE_KEY, role);
    localStorage.removeItem(LEGACY_ACTIVE_ROLE_KEY);
    window.location.href = 'dashboard.html';
});

// --- 3. Logika Form Register ---
document.getElementById('form-register').addEventListener('submit', async function(e) {
    e.preventDefault();

    const role = document.getElementById('reg-role').value;
    const nama = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    if (!['seller', 'user'].includes(role)) {
        alert('Role pendaftaran tidak valid.');
        return;
    }

    if (!validasiPassword(password)) {
        alert('Password harus mengandung minimal 1 huruf besar, 1 angka, dan 1 simbol!');
        return;
    }

    let users = getStoredUsers();

    const emailSudahAda = users.some(user => user.email === email);
    if (emailSudahAda) {
        alert('Email sudah terdaftar! Gunakan email lain.');
        return;
    }

    let passwordHash = '';
    try {
        passwordHash = await hashPassword(password);
    } catch (error) {
        alert('Pendaftaran tidak bisa diproses di browser ini. Jalankan lewat server lokal atau browser modern.');
        return;
    }

    users.push({ role, nama, email, passwordHash });
    saveStoredUsers(users);

    alert('Pendaftaran berhasil!');
    this.reset();
    switchView('view-login');
});

// --- 4. Logika Form Forgot Password ---
document.getElementById('form-forgot').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();

    const btn = document.getElementById('btn-forgot');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
    btn.style.opacity = '0.8';

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.opacity = '1';
        this.reset();
        switchView('view-login');
        setLoginAlert(`Tautan pemulihan sandi telah dikirim ke ${email}. Silakan periksa kotak masuk Anda.`);
    }, 1200);
});

function validasiPassword(password) {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return regex.test(password);
}

const passwordInput = document.getElementById('reg-password');
const errorText = document.getElementById('password-error');
const strengthText = document.getElementById('password-strength');
const togglePassword = document.getElementById('toggle-password');

passwordInput.addEventListener('input', function() {
    const password = this.value;

    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[\W_]/.test(password);
    const isLongEnough = password.length >= 8;

    if (!hasUpper || !hasNumber || !hasSymbol || !isLongEnough) {
        errorText.style.display = 'block';
        errorText.innerText = 'Minimal 8 karakter, 1 huruf besar, 1 angka, dan 1 simbol.';
    } else {
        errorText.style.display = 'none';
    }

    let strengthScore = 0;
    if (password.length >= 8) strengthScore++;
    if (hasUpper) strengthScore++;
    if (hasNumber) strengthScore++;
    if (hasSymbol) strengthScore++;

    if (strengthScore <= 2) {
        strengthText.innerText = 'Weak';
        strengthText.style.color = '#ef4444';
    } else if (strengthScore === 3) {
        strengthText.innerText = 'Medium';
        strengthText.style.color = '#f59e0b';
    } else if (strengthScore === 4) {
        strengthText.innerText = 'Strong';
        strengthText.style.color = '#10b981';
    } else {
        strengthText.innerText = '';
    }
});

togglePassword.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
});

const loginPasswordInput = document.getElementById('login-password');
const loginToggle = document.getElementById('toggle-login-password');
if (loginToggle) {
    loginToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPasswordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });
}
