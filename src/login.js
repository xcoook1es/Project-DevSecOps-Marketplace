// ============================================================
// TrustMarket — Login / Register / Forgot Password
// Data disimpan ke database via REST API (/api/auth/*)
// ============================================================

const ACTIVE_ROLE_KEY        = 'TrustMarket_active_role';
const ACTIVE_USER_KEY        = 'TrustMarket_active_user';
const LEGACY_ACTIVE_ROLE_KEY = 'syscore_active_role';
const VALID_ROLES            = ['admin', 'seller', 'user'];

// ── Fungsi helper API ─────────────────────────────────────────
async function apiPost(endpoint, data) {
    const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

// ── Alert helper ──────────────────────────────────────────────
function setLoginAlert(message) {
    const alertBox = document.getElementById('login-alert');
    alertBox.textContent = message;
    alertBox.style.display = 'block';
}

// ── Efek background barang jatuh ─────────────────────────────
function buatEfekBarangJatuh() {
    const container   = document.getElementById('falling-items-container');
    const ikonMarket  = ['fa-box-open', 'fa-shopping-cart', 'fa-tag', 'fa-tshirt', 'fa-shoe-prints', 'fa-shopping-bag', 'fa-gift'];
    const jumlahBarang = 25;

    for (let i = 0; i < jumlahBarang; i++) {
        const elem      = document.createElement('i');
        const ikonAcak  = ikonMarket[Math.floor(Math.random() * ikonMarket.length)];
        elem.classList.add('fas', ikonAcak, 'falling-item');

        elem.style.left              = (Math.random() * 100) + 'vw';
        elem.style.animationDuration = (10 + Math.random() * 15) + 's';
        elem.style.animationDelay    = (Math.random() * -20) + 's';
        elem.style.fontSize          = (20 + Math.random() * 40) + 'px';

        container.appendChild(elem);
    }
}

window.addEventListener('DOMContentLoaded', buatEfekBarangJatuh);

// ── Navigasi antar form ───────────────────────────────────────
function switchView(targetViewId) {
    ['view-login', 'view-register', 'view-forgot'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    const target = document.getElementById(targetViewId);
    target.classList.remove('hidden');
    target.style.animation = 'none';
    target.offsetHeight;
    target.style.animation = null;
    document.getElementById('login-alert').style.display = 'none';
}

// ── Form Login ────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();

    const role     = document.getElementById('login-role').value;
    const email    = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!VALID_ROLES.includes(role)) {
        setLoginAlert('Role tidak valid.');
        return;
    }

    try {
        const data = await apiPost('/api/auth/login', { role, email, password });

        if (data.error) {
            setLoginAlert(data.error);
            return;
        }

        // Simpan info sesi ke sessionStorage
        sessionStorage.setItem(ACTIVE_ROLE_KEY, data.role);
        sessionStorage.setItem(ACTIVE_USER_KEY, JSON.stringify({
            userId: data.userId,
            nama:   data.nama,
            email:  data.email,
            role:   data.role,
        }));
        // Hapus key lama (localStorage) agar bersih
        localStorage.removeItem(ACTIVE_ROLE_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_ROLE_KEY);

        window.location.href = 'dashboard.html';
    } catch (err) {
        setLoginAlert('Tidak dapat terhubung ke server. Pastikan aplikasi berjalan.');
    }
});

// ── Form Register ─────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async function (e) {
    e.preventDefault();

    const role     = document.getElementById('reg-role').value;
    const nama     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    if (!['seller', 'user'].includes(role)) {
        alert('Role pendaftaran tidak valid.');
        return;
    }

    if (!validasiPassword(password)) {
        alert('Password harus mengandung minimal 1 huruf besar, 1 angka, dan 1 simbol!');
        return;
    }

    try {
        const data = await apiPost('/api/auth/register', { role, nama, email, password });

        if (data.error) {
            alert(data.error);
            return;
        }

        alert('Pendaftaran berhasil! Silakan login.');
        this.reset();
        switchView('view-login');
    } catch (err) {
        alert('Tidak dapat terhubung ke server. Pastikan aplikasi berjalan.');
    }
});

// ── Form Forgot Password ──────────────────────────────────────
document.getElementById('form-forgot').addEventListener('submit', function (e) {
    e.preventDefault();
    const email       = document.getElementById('forgot-email').value.trim().toLowerCase();
    const btn         = document.getElementById('btn-forgot');
    const originalText = btn.innerHTML;

    btn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
    btn.style.opacity = '0.8';

    setTimeout(() => {
        btn.innerHTML     = originalText;
        btn.style.opacity = '1';
        this.reset();
        switchView('view-login');
        setLoginAlert(`Tautan pemulihan sandi telah dikirim ke ${email}. Silakan periksa kotak masuk Anda.`);
    }, 1200);
});

// ── Validasi sandi ────────────────────────────────────────────
function validasiPassword(password) {
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password);
}

// ── Indikator kekuatan password ───────────────────────────────
const passwordInput  = document.getElementById('reg-password');
const errorText      = document.getElementById('password-error');
const strengthText   = document.getElementById('password-strength');
const togglePassword = document.getElementById('toggle-password');

passwordInput.addEventListener('input', function () {
    const p          = this.value;
    const hasUpper   = /[A-Z]/.test(p);
    const hasNumber  = /\d/.test(p);
    const hasSymbol  = /[\W_]/.test(p);
    const isLong     = p.length >= 8;

    if (!hasUpper || !hasNumber || !hasSymbol || !isLong) {
        errorText.style.display = 'block';
        errorText.innerText = 'Minimal 8 karakter, 1 huruf besar, 1 angka, dan 1 simbol.';
    } else {
        errorText.style.display = 'none';
    }

    let score = [isLong, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
    if (score <= 2)      { strengthText.innerText = 'Weak';   strengthText.style.color = '#ef4444'; }
    else if (score === 3){ strengthText.innerText = 'Medium'; strengthText.style.color = '#f59e0b'; }
    else                 { strengthText.innerText = 'Strong'; strengthText.style.color = '#10b981'; }
});

togglePassword.addEventListener('click', function (e) {
    e.stopPropagation(); e.preventDefault();
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
});

// ── Toggle password login ─────────────────────────────────────
const loginPasswordInput = document.getElementById('login-password');
const loginToggle        = document.getElementById('toggle-login-password');
if (loginToggle) {
    loginToggle.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPasswordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });
}
