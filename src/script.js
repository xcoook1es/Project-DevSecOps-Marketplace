// ============================================================
// TrustMarket — Dashboard Script
// Data diambil dari REST API (/api/*) dan disimpan ke PostgreSQL
// ============================================================
let productsDB = [];
const API_BASE       = '/api';
const ACTIVE_ROLE_KEY = 'TrustMarket_active_role';
const ACTIVE_USER_KEY = 'TrustMarket_active_user';

// ── Ambil sesi pengguna ───────────────────────────────────────
function getSession() {
    try {
        return JSON.parse(sessionStorage.getItem(ACTIVE_USER_KEY)) || {};
    } catch { return {}; }
}
function getSavedRole() {
    return sessionStorage.getItem(ACTIVE_ROLE_KEY)
        || localStorage.getItem(ACTIVE_ROLE_KEY)
        || localStorage.getItem('syscore_active_role')
        || 'admin';
}

// ── Helper fetch ──────────────────────────────────────────────
async function apiFetch(path, options = {}) {
    try {
        const res = await fetch(API_BASE + path, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        return await res.json();
    } catch (err) {
        console.error('API error:', path, err);
        return null;
    }
}

// ============================================================
// STATISTIK (stat cards)
// ============================================================
const statsData = {
    admin: `<div class="stat-card bg-purple"><div><h3>0</h3><p>Total Pengguna (D1)</p></div><i class="fas fa-users"></i></div>
            <div class="stat-card bg-red"><div><h3>0</h3><p>Log Sistem Hari Ini (D4)</p></div><i class="fas fa-shield-alt"></i></div>`,
    seller: `<div class="stat-card bg-blue"><div><h3 id="stat-seller-products">0</h3><p>Produk Saya (D2)</p></div><i class="fas fa-box-open"></i></div>
             <div class="stat-card bg-orange"><div><h3 id="stat-seller-orders">0</h3><p>Pesanan Diproses (D3)</p></div><i class="fas fa-clock"></i></div>
             <div class="stat-card bg-green"><div><h3 id="stat-seller-revenue">Rp 0</h3><p>Pendapatan Saya (D3)</p></div><i class="fas fa-wallet"></i></div>`,
    user: `<div class="stat-card bg-blue"><div><h3 id="stat-total-pembelian">0</h3><p>Total Pembelian (D3)</p></div><i class="fas fa-shopping-bag"></i></div>
        <div class="stat-card bg-orange"><div><h3 id="stat-pesanan-proses">0</h3><p>Diproses / Menunggu (D3)</p></div><i class="fas fa-file-invoice-dollar"></i></div>
        <div class="stat-card bg-green"><div><h3 id="stat-pesanan-selesai">0</h3><p>Pesanan Selesai (D3)</p></div><i class="fas fa-check-circle"></i></div>`
};

function changeRole(role) {
    const roleNames = { 'admin': 'Administrator (Admin)', 'seller': 'Penjual (Seller)', 'user': 'Pembeli (User)' };
    document.getElementById('sidebar-role-desc').innerText = roleNames[role];
    document.getElementById('current-role-display').innerText = roleNames[role];

    const statsContainer = document.getElementById('dynamic-stats-grid');
    statsContainer.innerHTML = statsData[role];
    updateDashboardStats();
    updateSellerProductSummary();
    updateTransactionEmptyState();
    statsContainer.style.animation = 'none'; statsContainer.offsetHeight; statsContainer.style.animation = 'fadeIn 0.5s ease-out';

    const adminPanel = document.getElementById('admin-overview-panel');
    if (adminPanel) adminPanel.style.display = role === 'admin' ? 'block' : 'none';

    document.querySelectorAll('.menu-item').forEach(item => {
        const allowedRoles = item.getAttribute('data-access').split(',');
        item.style.display = allowedRoles.includes(role) ? '' : 'none';
    });

    showMenu(null, 'dashboard');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active-nav'));
    const activeMenu = document.querySelector('.menu-item[data-access*="' + role + '"]');
    if (activeMenu) activeMenu.classList.add('active-nav');
}

function showMenu(event, menuId) {
    if (event) event.preventDefault();
    document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));
    document.getElementById(menuId).classList.add('active');

    if (event && event.currentTarget) {
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active-nav'));
        event.currentTarget.classList.add('active-nav');
    }

    const titles = {
        'dashboard': 'Beranda Dashboard', 'katalog-produk': 'Katalog Belanja',
        'keranjang-belanja': 'Keranjang', 'manajemen-produk': 'Manajemen Produk',
        'transaksi': 'Data Transaksi', 'manajemen-user': 'Manajemen Pengguna',
        'laporan': 'Log & Laporan Sistem'
    };
    document.getElementById('page-title').innerText = titles[menuId];
    if (menuId === 'dashboard') updateDashboardStats();
    updateSellerProductSummary();
    updateTransactionEmptyState();
}

function openModal(modalId)  { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

function logout() {
    sessionStorage.removeItem(ACTIVE_ROLE_KEY);
    sessionStorage.removeItem(ACTIVE_USER_KEY);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
    localStorage.removeItem('syscore_active_role');
}

// ============================================================
// STATISTIK HELPERS
// ============================================================
function parseRupiah(text) {
    return Number((text || '').replace(/[^0-9]/g, '')) || 0;
}
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
}

function getTransactionStats() {
    const rows = Array.from(document.querySelectorAll('#tabel-transaksi tbody tr'));
    const selesai = rows.filter(r => r.cells[3]?.innerText.includes('Selesai')).length;
    const diproses = rows.filter(r => {
        const s = r.cells[3]?.innerText || '';
        return s.includes('Diproses');
    }).length;

    return { 
        total: rows.length,
        proses: diproses,
        selesai 
    };
}

function getSellerProductStats() {
    const rows = Array.from(document.querySelectorAll('#tabel-produk tbody tr'));
    const totalStock = rows.reduce((s, r) => s + (Number(r.dataset.stok) || 0), 0);
    const lowStock   = rows.filter(r => (Number(r.dataset.stok) || 0) < 10).length;
    return { productCount: rows.length, totalStock, lowStock, topProduct: rows[0]?.cells[1]?.innerText || 'Belum ada produk terlaris' };
}

async function getSellerRevenueFromAPI() {
    const data = await apiFetch('/transactions');
    if (!data) return 0;

    return data
        .filter(t => t.status === 'Selesai')
        .reduce((sum, t) => sum + Number(t.total_harga), 0);
}

async function getSellerOrderStatsFromAPI() {
    const data = await apiFetch('/transactions');
    if (!data) return { proses: 0 };

    const proses = data.filter(t => t.status === 'Diproses').length;

    return { proses };
}

function updateDashboardStats() {
    const totalEl   = document.getElementById('stat-total-pembelian');
    const prosesEl  = document.getElementById('stat-pesanan-proses');
    const selesaiEl = document.getElementById('stat-pesanan-selesai');
    const sellerProductEl = document.getElementById('stat-seller-products');
    const sellerOrderEl   = document.getElementById('stat-seller-orders');
    const sellerRevenueEl = document.getElementById('stat-seller-revenue');

    const stats = getTransactionStats();
    if (totalEl && prosesEl && selesaiEl) {
        totalEl.innerText   = stats.total;
        prosesEl.innerText  = stats.proses;
        selesaiEl.innerText = stats.selesai;
    }

    if (sellerProductEl && sellerOrderEl && sellerRevenueEl) {
    const ps = getSellerProductStats();
    sellerProductEl.innerText = ps.productCount;

    // 🔥 ambil dari API
    getSellerOrderStatsFromAPI().then(stat => {
        sellerOrderEl.innerText = stat.proses;
    });

    getSellerRevenueFromAPI().then(total => {
        sellerRevenueEl.innerText = formatRupiah(total).replace(',00','');
    });
}

    // Update admin stat card (total pengguna)
    const adminUserStatEl = document.querySelector('.stat-card.bg-purple h3');
    if (adminUserStatEl) {
        apiFetch('/users').then(users => {
            if (users) adminUserStatEl.innerText = users.length;
        });
    }

    // Update log hari ini
    const logTodayEl = document.querySelector('.stat-card.bg-red h3');
    if (logTodayEl) {
        apiFetch('/logs').then(logs => {
            if (!logs) return;
            const today = new Date().toDateString();
            const todayCount = logs.filter(l => new Date(l.created_at).toDateString() === today).length;
            logTodayEl.innerText = todayCount;
        });
    }
}

function updateSellerProductSummary() {
    const countEl      = document.getElementById('seller-product-count');
    const stockEl      = document.getElementById('seller-stock-count');
    const stockSummary = document.getElementById('seller-stock-summary');
    const lowStockEl   = document.getElementById('seller-low-stock-summary');
    const topProductEl = document.getElementById('seller-top-product');
    const panel        = document.getElementById('seller-dashboard-panel');
    const stats        = getSellerProductStats();

    if (countEl)      countEl.innerText      = `${stats.productCount} produk aktif`;
    if (stockEl)      stockEl.innerText      = `${stats.totalStock} stok tersedia`;
    if (stockSummary) stockSummary.innerText = `${stats.totalStock} stok tersedia`;
    if (lowStockEl)   lowStockEl.innerText   = `${stats.lowStock} produk perlu restock`;
    if (topProductEl) topProductEl.innerText  = stats.topProduct;
    if (panel) panel.style.display = document.getElementById('stat-seller-products') ? 'grid' : 'none';
}

function updateTransactionEmptyState() {
    const emptyState = document.getElementById('transaksi-empty-state');
    const tbody      = document.querySelector('#tabel-transaksi tbody');
    if (!emptyState || !tbody) return;
    emptyState.style.display = tbody.children.length === 0 ? 'flex' : 'none';
}

// ============================================================
// LOAD DATA DARI API (produk, transaksi, user)
// ============================================================

async function loadProducts() {
    const products = await apiFetch('/products');
    if (!products) return;

    const tbody = document.querySelector('#tabel-produk tbody');
    tbody.innerHTML = '';
    productsDB = products;

    products.forEach(p => {
        const hargaRupiah = formatRupiah(p.harga).replace(',00','');
        const tr = document.createElement('tr');
        tr.dataset.productId = p.product_id;
        tr.dataset.stok      = p.stok;
        tr.innerHTML = `
            <td>${p.product_id}</td>
            <td>${p.nama}</td>
            <td>${hargaRupiah}</td>
            <td>${p.stok}</td>
            <td>
                <a class="action-link edit"   onclick="bukaModalProduk(this)"><i class="fas fa-edit"></i> Edit</a>
                <a class="action-link delete" onclick="hapusBarisProduk(this)"><i class="fas fa-trash"></i> Hapus</a>
            </td>`;
        tbody.appendChild(tr);
    });

    updateSellerProductSummary();
    updateDashboardStats();
}

function getProductFromDB(nama) {
    return productsDB.find(p => p.nama === nama);
}
function renderCatalog() {
    const container = document.getElementById('catalog-container');
    if (!container) return;

    // 🔥 CEK KOSONG DI AWAL
    if (productsDB.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <p>Belum ada produk tersedia</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    productsDB.forEach(p => {
        container.innerHTML += `
        <div class="product-card">
            <div class="product-icon" onclick="openProductDetail('${p.nama}', ${p.harga})">
            ${p.gambar 
                ? `<img src="/uploads/${p.gambar}" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">`
                : `<i class="fas fa-box"></i>`
            }
        </div>

            <div class="product-title">${p.nama}</div>
            <div class="product-price">${formatRupiah(p.harga)}</div>

            <!-- 🔥 TAMBAH INI (BIAR UX BAGUS) -->
            <div class="product-stock">Stok: ${p.stok}</div>

            <div class="qty-control">
                <button class="qty-btn" onclick="ubahQty(this, -1)">-</button>
                <input type="number" class="qty-value qty-input" value="1" min="1">
                <button class="qty-btn" onclick="ubahQty(this, 1)">+</button>
            </div>

            <button 
                class="btn-add-cart"
                ${p.stok <= 0 ? 'disabled style="background:#9ca3af"' : ''}
                onclick="tambahKeranjang('${p.nama}', ${p.harga}, this)"
            >
                ${p.stok <= 0 ? 'Stok Habis' : '<i class="fas fa-cart-plus"></i> Tambah'}
            </button>
        </div>`;
    });
}

async function loadTransactions() {
    const transactions = await apiFetch('/transactions');
    if (!transactions) return;

    const tbody = document.querySelector('#tabel-transaksi tbody');
    tbody.innerHTML = '';

    transactions.forEach(t => {
        const isSelesai = t.status === 'Selesai';
        const statusBadge = isSelesai
            ? `<span class="status-badge status-selesai"><i class="fas fa-check-circle"></i> Selesai</span>`
            : `<span class="status-badge status-diproses"><i class="fas fa-spinner fa-spin"></i> Diproses</span>`;
        const aksiCell = isSelesai ? '-' : `<button class="btn-transaksi-action" onclick="selesaikanTransaksiDB(this, '${t.trx_id}')">Selesaikan</button>`;

        const tr = document.createElement('tr');
        tr.dataset.trxId = t.trx_id;
        tr.innerHTML = `
            <td>${t.trx_id}</td>
            <td>${t.product_name.replace(/\(x\d+\)/g, '').trim()} (x${t.qty})</td>
            <td>${formatRupiah(t.total_harga).replace(',00','')}</td>
            <td>${statusBadge}</td>
            <td>${aksiCell}</td>`;
        tbody.appendChild(tr);
    });

    updateTransactionEmptyState();
    updateDashboardStats();
}

async function loadUsers() {
    const users = await apiFetch('/users');
    if (!users) return;

    const tbody = document.querySelector('#tabel-user tbody');
    tbody.innerHTML = '';

    users.forEach(u => {
        const roleLower  = (u.role || 'user').toLowerCase();
        const roleLabel  = roleLower.charAt(0).toUpperCase() + roleLower.slice(1);
        const roleClass  = roleLower === 'admin' ? 'role-admin' : roleLower === 'seller' ? 'role-seller' : 'role-user';
        const statusClass = u.status === 'Aktif' ? 'status-aktif' : 'status-nonaktif';
        const created    = (u.created_at || '').split('T')[0] || '-';

        const tr = document.createElement('tr');
        tr.dataset.userId = u.user_id;
        tr.innerHTML = `
            <td>${u.user_id}</td>
            <td>${u.nama}</td>
            <td>${u.email}</td>
            <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
            <td><span class="user-status-badge ${statusClass}"><i class="fas fa-circle"></i> ${u.status}</span></td>
            <td>${created}</td>
            <td>
                <a class="action-link edit"   onclick="bukaModalUser(this)"><i class="fas fa-edit"></i> Edit</a>
                <a class="action-link delete" onclick="hapusBarisPengguna(this)"><i class="fas fa-trash"></i> Hapus</a>
            </td>`;
        tbody.appendChild(tr);
    });

    const info = document.getElementById('user-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${users.length}</strong> pengguna`;
}

// ── Helper: waktu relatif ────────────────────────────────────
function timeAgo(dateStr) {
    const now  = new Date();
    const past = new Date(dateStr);
    const diff = Math.floor((now - past) / 1000); // detik
    if (diff < 60)         return `${diff} detik lalu`;
    if (diff < 3600)       return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400)      return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
}

// ── Muat 5 aktivitas terbaru dari log DB ──────────────────────
async function loadRecentActivity() {
    const container = document.getElementById('admin-activity-list');
    if (!container) return;

    const logs = await apiFetch('/logs');
    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="admin-activity-item">
                <span class="activity-dot dot-blue"></span>
                <div class="activity-info">
                    <span class="activity-text">Belum ada aktivitas tercatat.</span>
                    <span class="activity-time">—</span>
                </div>
            </div>`;
        return;
    }

    // Ambil 5 log terbaru (sudah DESC dari API)
    const recent = logs.slice(0, 5);

    const dotMap = {
        'SUCCESS': 'dot-green',
        'INFO':    'dot-blue',
        'WARNING': 'dot-orange',
        'ERROR':   'dot-red',
    };

    container.innerHTML = recent.map(log => {
        const dot  = dotMap[log.severity] || 'dot-blue';
        const waktu = timeAgo(log.created_at);
        // Cetak aktor dalam <strong> jika ada nama yang bermakna
        const aktor = log.actor && log.actor !== 'Sistem' && log.actor !== '—'
            ? `<strong>${log.actor}</strong>` : '';
        const text = aktor
            ? `${log.activity} — ${aktor}`
            : log.activity;
        return `
            <div class="admin-activity-item">
                <span class="activity-dot ${dot}"></span>
                <div class="activity-info">
                    <span class="activity-text">${text}</span>
                    <span class="activity-time">${waktu}</span>
                </div>
            </div>`;
    }).join('');
}


function hapusBaris(elemen) {
    if (confirm('Apakah Anda yakin ingin menghapus data ini?')) {
        elemen.closest('tr').remove();
        updateDashboardStats();
        updateSellerProductSummary();
        updateTransactionEmptyState();
    }
}
function saveKeranjang() {
    localStorage.setItem('keranjang', JSON.stringify(keranjang));
}

// ── Hapus produk ──────────────────────────────────────────────
async function hapusBarisProduk(elemen) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) return;
    try {
        const tr = elemen.closest('tr');
        const productId = (tr.dataset.productId || '').trim();
        const defaultHtml = elemen.innerHTML;
        
        elemen.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hapus...';
        elemen.style.pointerEvents = 'none';

        const result = await apiFetch('/products/' + productId, { method: 'DELETE' });
        if (result && result.success) {
            tr.remove();
            updateSellerProductSummary();
            updateDashboardStats();
        } else {
            alert('Gagal menghapus produk. Pesan: ' + (result?.error || 'Tidak diketahui'));
            elemen.innerHTML = defaultHtml;
            elemen.style.pointerEvents = 'auto';
        }
    } catch (err) {
        console.error('Del Product Error:', err);
        alert('Terjadi kesalahan pada sistem saat menghapus.');
        elemen.innerHTML = '<i class="fas fa-trash"></i> Hapus';
        elemen.style.pointerEvents = 'auto';
    }
}

// ── Hapus pengguna ────────────────────────────────────────────
async function hapusBarisPengguna(elemen) {
    if (!confirm('Apakah Anda yakin ingin menghapus pengguna ini?')) return;
    try {
        const tr     = elemen.closest('tr');
        const userId = (tr.dataset.userId || '').trim();
        const defaultHtml = elemen.innerHTML;

        elemen.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hapus...';
        elemen.style.pointerEvents = 'none';

        const result = await apiFetch('/users/' + userId, { method: 'DELETE' });
        if (result && result.success) {
            tr.remove();
            filterTabelUser();
            updateDashboardStats();
        } else {
            alert('Gagal menghapus pengguna. Pesan: ' + (result?.error || 'Tidak diketahui'));
            elemen.innerHTML = defaultHtml;
            elemen.style.pointerEvents = 'auto';
        }
    } catch (err) {
        console.error('Del User Error:', err);
        alert('Terjadi kesalahan pada sistem saat menghapus.');
        elemen.innerHTML = '<i class="fas fa-trash"></i> Hapus';
        elemen.style.pointerEvents = 'auto';
    }
}

// ============================================================
// SISTEM KERANJANG
// ============================================================
let keranjang = JSON.parse(localStorage.getItem('keranjang')) || [];

function updateCartBadge() {
    const badge = document.getElementById('cart-count');

    badge.innerText = keranjang
    .filter(i => !i.isCheckout)
    .reduce((t, i) => t + i.qty, 0);
}

function ubahQty(tombol, delta) {
    const qtyEl = tombol.closest('.qty-control').querySelector('.qty-input');
    let qty = parseInt(qtyEl.value) || 1;
    qty += delta;
    if (qty < 1) qty = 1;
    qtyEl.value = qty;
}

function tambahKeranjang(nama, harga, tombol) {
    const card = tombol.closest('.product-card');
    const qtyEl = card.querySelector('.qty-input');

    let qty = parseInt(qtyEl.value);
    if (!qty || qty < 1) qty = 1; 

    const product = getProductFromDB(nama);

    if (!product || qty > product.stok) {
        alert('Stok tidak cukup!');
        return;
    }
    const existing = keranjang.find(item => item.nama === nama);

    if (existing) {
        existing.qty += qty;
        existing.selected = true;
    } else {
        keranjang.push({
            nama,
            harga,
            qty,
            selected: true,
            favorit: false
        });
    }

    renderKeranjang();
    saveKeranjang();

    tombol.innerHTML = '<i class="fas fa-check"></i> Ditambahkan!';
    tombol.style.background = '#059669';

    setTimeout(() => {
        tombol.innerHTML = '<i class="fas fa-cart-plus"></i> Tambah';
        tombol.style.background = '';
    }, 1500);
}

function hapusKeranjang(index) { keranjang.splice(index, 1);saveKeranjang(); renderKeranjang(); }
function ubahQtyKeranjang(index, delta) { keranjang[index].qty += delta; if (keranjang[index].qty < 1) keranjang[index].qty = 1; saveKeranjang(); renderKeranjang(); }
function setPilihItem(index, checked) { keranjang[index].selected = checked; saveKeranjang(); renderKeranjang(); }
function togglePilihSemua(checked) { keranjang.forEach(item => item.selected = checked);saveKeranjang(); renderKeranjang(); }
function toggleFavorit(index) { keranjang[index].favorit = !keranjang[index].favorit;saveKeranjang(); renderKeranjang(); }

function renderKeranjang() {
    const emptyState  = document.getElementById('cart-empty-state');
    const shopSection = document.getElementById('cart-shop-section');
    const itemsList   = document.getElementById('cart-items-list');
    const itemCountEl = document.getElementById('cart-item-count');
    const totalEl     = document.getElementById('cart-summary-total');
    const buyBtn      = document.getElementById('cart-buy-btn');
    const promoText   = document.getElementById('cart-promo-text');
    const selectAll   = document.getElementById('cart-select-all');
    const shopCheck   = document.getElementById('cart-shop-check');

    updateCartBadge();
    if (!emptyState || !shopSection || !itemsList) return;

    const selectedItems  = keranjang.filter(i => i.selected);
    const selectedTotal  = selectedItems.reduce((t, i) => t + (i.harga * i.qty), 0);
    const isAllSelected  = keranjang.length > 0 && selectedItems.length === keranjang.length;

    itemCountEl.innerText = keranjang.length;
    totalEl.innerText     = selectedItems.length > 0 ? formatRupiah(selectedTotal) : '-';
    buyBtn.disabled       = selectedItems.length === 0;
    promoText.innerText   = selectedItems.length > 0 ? 'Pakai promo saat checkout' : 'Pilih barang dulu sebelum pakai promo';
    selectAll.checked = isAllSelected; shopCheck.checked = isAllSelected;
    selectAll.indeterminate = selectedItems.length > 0 && !isAllSelected;
    shopCheck.indeterminate = selectedItems.length > 0 && !isAllSelected;

    itemsList.innerHTML = '';
    if (keranjang.length === 0) { emptyState.style.display = 'flex'; shopSection.style.display = 'none'; return; }
    emptyState.style.display = 'none'; shopSection.style.display = 'block';

    keranjang.forEach((item, i) => {
        const product = getProductFromDB(item.nama);
        const hargaAwal = product?.hargaAwal || null;
        const diskon = product?.diskon || '';
        const varian = product?.varian || '';
        const icon = product?.icon || 'fas fa-box';
        const stok = product?.stok || 0;

        itemsList.innerHTML += `
            <div class="cart-item-row">
                <input class="cart-checkbox" type="checkbox" ${item.selected ? 'checked' : ''} onchange="setPilihItem(${i}, this.checked)">
                <div class="cart-product-thumb">
                    <span class="cart-discount-badge">${diskon}</span>
                    ${product?.gambar 
                        ? `<img src="/uploads/${product.gambar}" style="width:50px; height:50px; object-fit:cover;">`
                        : `<i class="${icon}"></i>`
                    }
                </div>
                <div class="cart-product-info">
                    <div class="cart-stock">Sisa ${stok}</div>
                    <div class="cart-product-name">${item.nama}</div>
                    <div class="cart-product-variant">${varian}</div>
                </div>
                <div class="cart-item-side">
                    <div class="cart-price">${formatRupiah(item.harga)}</div>
                    ${hargaAwal ? `<div class="cart-original-price">${formatRupiah(hargaAwal)}</div>` : ''}
                    <div class="cart-item-actions">
                        <button class="cart-icon-btn ${item.favorit ? 'is-fav' : ''}" onclick="toggleFavorit(${i})" title="Favorit"><i class="fas fa-heart"></i></button>
                        <button class="cart-icon-btn" onclick="hapusKeranjang(${i})" title="Hapus"><i class="fas fa-trash"></i></button>
                        <div class="cart-qty-control">
                            <button onclick="ubahQtyKeranjang(${i}, -1)" ${item.qty <= 1 ? 'disabled' : ''}>-</button>
                            <span>${item.qty}</span>
                            <button onclick="ubahQtyKeranjang(${i}, 1)">+</button>
                        </div>
                    </div>
                </div>
            </div>`;
    });
}

// ============================================================
// CHECKOUT & PEMBAYARAN
// ============================================================
const kodePROMO = {
    'HEMAT10': { diskon: 0.10, label: 'Diskon 10%' },
    'TRUST20':  { diskon: 0.20, label: 'Diskon 20%' },
    'GRATIS':   { diskon: 0, ongkirGratis: true, label: 'Gratis Ongkir' }
};
const ongkirMap = { reguler: 15000, express: 25000, same_day: 35000 };
let promoAktif = null;
let pendingCheckoutItems = [];
const PROCESSING_DELAY_MS = 10000;
const transaksiTimers = new Map();

function checkout() { if (keranjang.length === 0) return; checkoutSelected(); }

function checkoutSelected() {
    const selectedItems = keranjang.filter(i => i.selected);

    if (selectedItems.length === 0) {
        alert('Pilih barang yang ingin dibeli terlebih dahulu.');
        return;
    }

    // 🔴 CEK STOK DULU
    for (let item of selectedItems) {
        const product = getProductFromDB(item.nama);
        if (!product || item.qty > product.stok) {
            alert(`Stok ${item.nama} tidak mencukupi!`);
            return;
        }
    }

    // 🔥 TAMBAHKAN INI
    keranjang.forEach(item => {
        if (item.selected) {
            item.isCheckout = true;
        }
    });

    // 🔥 tetap simpan ke pending
    pendingCheckoutItems = JSON.parse(JSON.stringify(selectedItems));

    renderKeranjang();
    showMenu(null, 'transaksi');

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-nav'));
    document.querySelector('.menu-item[data-access*="user"][onclick*="transaksi"]')?.classList.add('active-nav');

    cekNotifPending();
    updateDashboardStats();
    bukaModalCheckout();
}

function cekNotifPending() {
    const notif = document.getElementById('notif-pending-checkout');

    const adaPending = keranjang.some(item => item.isCheckout);

    if (notif) {
        notif.style.display = adaPending ? 'block' : 'none';
    }
}

function bukaModalCheckout() {
    if (pendingCheckoutItems.length === 0) return;
    promoAktif = null;
    document.getElementById('co-promo').value = '';
    document.getElementById('co-promo-info').innerHTML = '';
    document.getElementById('baris-diskon').style.display = 'none';
    const savedRole = getSavedRole();
    const session   = getSession();
    document.getElementById('co-nama-user').innerText = session.nama || (savedRole === 'user' ? 'Pembeli TrustMarket' : 'Pengguna TrustMarket');
    const container = document.getElementById('co-daftar-pesanan');
    container.innerHTML = '';
    pendingCheckoutItems.forEach(item => {
        container.innerHTML += `<div class="co-pesanan-item">
            <div class="co-pesanan-icon"><i class="fas fa-box"></i></div>
            <div class="co-pesanan-info">
                <div class="co-pesanan-nama">${item.nama}</div>
                <div class="co-pesanan-harga">${formatRupiah(item.harga)} \u00d7 ${item.qty}</div>
            </div>
            <div class="co-pesanan-subtotal">${formatRupiah(item.harga * item.qty)}</div>
        </div>`;
    });
    hitungTotal();
    openModal('modal-checkout');
}

function hitungTotal() {
    let subtotal  = pendingCheckoutItems.reduce((s, i) => s + (i.harga * i.qty), 0);
    const pengiriman = document.querySelector('input[name="pengiriman"]:checked')?.value || 'reguler';
    let ongkir    = ongkirMap[pengiriman] || 15000;
    let diskon    = 0;
    if (promoAktif) {
        if (promoAktif.ongkirGratis) ongkir = 0;
        if (promoAktif.diskon > 0)   diskon = Math.round(subtotal * promoAktif.diskon);
    }
    const total = subtotal + ongkir - diskon;
    document.getElementById('co-subtotal').innerText   = formatRupiah(subtotal);
    document.getElementById('co-ongkir').innerText     = formatRupiah(ongkir);
    document.getElementById('co-total-bayar').innerText = formatRupiah(total);
    if (diskon > 0) {
        document.getElementById('baris-diskon').style.display = 'flex';
        document.getElementById('co-diskon').innerText = '- ' + formatRupiah(diskon);
    } else {
        document.getElementById('baris-diskon').style.display = 'none';
    }
}

function pakaiPromo() {
    const kode   = document.getElementById('co-promo').value.trim().toUpperCase();
    const infoEl = document.getElementById('co-promo-info');
    if (!kode) { infoEl.innerHTML = '<span style="color:#ef4444;">Masukkan kode promo terlebih dahulu.</span>'; return; }
    if (kodePROMO[kode]) {
        promoAktif = kodePROMO[kode];
        infoEl.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Promo <b>${kode}</b> berhasil — ${promoAktif.label}!</span>`;
    } else {
        promoAktif = null;
        infoEl.innerHTML = '<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> Kode promo tidak valid.</span>';
    }
    hitungTotal();
}

async function konfirmasiBayar() {
    const alamat = document.getElementById('co-alamat').value.trim();
    if (!alamat) { alert('Mohon isi alamat pengiriman terlebih dahulu.'); return; }

    const metode     = document.querySelector('input[name="pembayaran"]:checked')?.value || 'gopay';
    const pengiriman = document.querySelector('input[name="pengiriman"]:checked')?.value || 'reguler';
    const metodeLabel     = { gopay: 'GoPay', bri: 'BRI Virtual Account', bca: 'BCA Virtual Account', mandiri: 'Mandiri Virtual Account', cod: 'Bayar di Tempat (COD)' };
    const pengirimanLabel = { reguler: 'Reguler', express: 'Express', same_day: 'Same Day' };

    let subtotal = pendingCheckoutItems.reduce((s, i) => s + (i.harga * i.qty), 0);
    let ongkir   = ongkirMap[pengiriman] || 15000;
    let diskon   = 0;
    if (promoAktif) {
        if (promoAktif.ongkirGratis) ongkir = 0;
        if (promoAktif.diskon > 0)   diskon = Math.round(subtotal * promoAktif.diskon);
    }
    const total = subtotal + ongkir - diskon;

    // Simpan setiap item transaksi ke database
    for (const item of pendingCheckoutItems) {
        const trxId = 'TRX-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const itemTotal = item.harga * item.qty;

        // Simpan ke DB
        await apiFetch('/transactions', {
            method: 'POST',
            body: JSON.stringify({
                trx_id:       trxId,
                product_name: item.nama,
                qty:          item.qty,
                total_harga:  itemTotal,
                metode,
                pengiriman,
                alamat
            })
        });
        await apiFetch('/products/reduce-stock', {
            method: 'PUT',
            body: JSON.stringify({
            nama: item.nama,
            qty: item.qty
            })
        });

        // Tambahkan ke tabel DOM
        const barisBaru = `<tr data-trx-id="${trxId}">
            <td>${trxId}</td>
            <td>${item.nama} (x${item.qty})</td>
            <td>${formatRupiah(itemTotal).replace(',00','')}</td>
            <td><span class="status-badge status-diproses"><i class="fas fa-spinner fa-spin"></i> Diproses (10 dtk)</span></td>
            <td><button class="btn-transaksi-action" onclick="selesaikanTransaksiDB(this, '${trxId}')">Selesaikan</button></td>
        </tr>`;
        const tbody = document.querySelector('#tabel-transaksi tbody');
        tbody.insertAdjacentHTML('beforeend', barisBaru);
        mulaiProsesTransaksi(tbody.lastElementChild, trxId);
    }

    let detailHTML = pendingCheckoutItems.map(item =>
        `<div class="sukses-item"><span>${item.nama} \u00d7${item.qty}</span><span>${formatRupiah(item.harga * item.qty)}</span></div>`
    ).join('');
    detailHTML += `<div class="sukses-item sukses-item-total"><span>Total Dibayar</span><span>${formatRupiah(total)}</span></div>`;
    document.getElementById('sukses-detail-list').innerHTML = detailHTML;
    document.getElementById('sukses-metode-text').innerHTML =
        `Pembayaran via <strong>${metodeLabel[metode]}</strong> · Pengiriman <strong>${pengirimanLabel[pengiriman]}</strong>`;

    closeModal('modal-checkout');
    await loadProducts();
    keranjang = keranjang.filter(item => !item.isCheckout);
    saveKeranjang();
    pendingCheckoutItems = [];

    renderKeranjang();
    cekNotifPending();
    updateDashboardStats();
    updateTransactionEmptyState();
}

function mulaiProsesTransaksi(row, trxId) {
    let sisaDetik = Math.ceil(PROCESSING_DELAY_MS / 1000);
    const timer = setInterval(() => {
        sisaDetik -= 1;
        if (sisaDetik <= 0) {
            clearInterval(timer);
            transaksiTimers.delete(trxId);
            tandaiTransaksiSelesaiDB(row, trxId);
            return;
        }
        row.cells[3].innerHTML = `<span class="status-badge status-diproses"><i class="fas fa-spinner fa-spin"></i> Diproses (${sisaDetik} dtk)</span>`;
    }, 1000);
    transaksiTimers.set(trxId, timer);
}

async function selesaikanTransaksiDB(tombol, trxId) {
    const row   = tombol.closest('tr');
    const timer = transaksiTimers.get(trxId);
    if (timer) { clearInterval(timer); transaksiTimers.delete(trxId); }
    await tandaiTransaksiSelesaiDB(row, trxId);
}

async function tandaiTransaksiSelesaiDB(row, trxId) {
    await apiFetch('/transactions/' + trxId + '/complete', { method: 'PUT' });
    row.cells[3].innerHTML = '<span class="status-badge status-selesai"><i class="fas fa-check-circle"></i> Selesai</span>';
    row.cells[4].innerText = '-';
    updateDashboardStats();
    updateTransactionEmptyState();
}

function selesaiBayar() {
    closeModal('modal-sukses-bayar');
    showMenu(null, 'transaksi');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-nav'));
    document.querySelector('.menu-item[data-access*="user"][onclick*="transaksi"]')?.classList.add('active-nav');
}

// ============================================================
// MANAJEMEN PRODUK (CRUD via API)
// ============================================================
let barisProdukYangDiedit = null;

function bukaModalProduk(tombolEdit = null) {
    const form = document.getElementById('form-produk');
    if (tombolEdit) {
        barisProdukYangDiedit = tombolEdit.closest('tr');
        document.getElementById('judul-modal-produk').innerText = 'Edit Produk';
        document.getElementById('btn-text-produk').innerText     = 'Update Data Produk';
        document.getElementById('input-nama-produk').value  = barisProdukYangDiedit.cells[1].innerText;
        document.getElementById('input-harga-produk').value = barisProdukYangDiedit.cells[2].innerText.replace(/[^0-9]/g, '');
        document.getElementById('input-stok-produk').value  = barisProdukYangDiedit.dataset.stok || barisProdukYangDiedit.cells[3].innerText;
    } else {
        barisProdukYangDiedit = null;
        document.getElementById('judul-modal-produk').innerText = 'Tambah Produk Baru';
        document.getElementById('btn-text-produk').innerText     = 'Simpan Data Produk';
        form.reset();
    }
    openModal('modal-produk');
}

document.getElementById('form-produk').addEventListener('submit', async function (e) {
    e.preventDefault();
    const nama  = document.getElementById('input-nama-produk').value;
    const harga = document.getElementById('input-harga-produk').value;
    const stok  = document.getElementById('input-stok-produk').value;
    const hargaRupiah = formatRupiah(parseInt(harga)).replace(',00','');

    if (barisProdukYangDiedit) {
        // UPDATE
        const productId = barisProdukYangDiedit.dataset.productId;
        const result = await apiFetch('/products/' + productId, {
            method: 'PUT',
            body: JSON.stringify({ nama, harga: parseInt(harga), stok: parseInt(stok) })
        });
        if (result && result.success) {
            barisProdukYangDiedit.cells[1].innerText  = nama;
            barisProdukYangDiedit.cells[2].innerText  = hargaRupiah;
            barisProdukYangDiedit.cells[3].innerText  = stok;
            barisProdukYangDiedit.dataset.stok         = stok;
        }
    } else {
        // INSERT
        const formData = new FormData();
        formData.append('nama', nama);
        formData.append('harga', harga);
        formData.append('stok', stok);

        const fileInput = document.getElementById('input-gambar-produk');
        if (fileInput.files[0]) {
            formData.append('gambar', fileInput.files[0]);
        }

        const res = await fetch('/products', {
            method: 'POST',
            body: formData
        });

        const newProduct = await res.json();

        if (newProduct && newProduct.product_id) {
            const tr = document.createElement('tr');
            tr.dataset.productId = newProduct.product_id;
            tr.dataset.stok      = newProduct.stok;
            tr.innerHTML = `
                <td>${newProduct.product_id}</td><td>${newProduct.nama}</td>
                <td>${formatRupiah(newProduct.harga).replace(',00','')}</td><td>${newProduct.stok}</td>
                <td>
                    <a class="action-link edit"   onclick="bukaModalProduk(this)"><i class="fas fa-edit"></i> Edit</a>
                    <a class="action-link delete" onclick="hapusBarisProduk(this)"><i class="fas fa-trash"></i> Hapus</a>
                </td>`;
            document.querySelector('#tabel-produk tbody').appendChild(tr);
        }
    }

    closeModal('modal-produk');
    updateSellerProductSummary();
    updateDashboardStats();
});

// ============================================================
// MANAJEMEN PENGGUNA (CRUD via API)
// ============================================================
let barisUserYangDiedit = null;

function bukaModalUser(tombolEdit = null) {
    const form = document.getElementById('form-user');
    if (tombolEdit) {
        barisUserYangDiedit = tombolEdit.closest('tr');
        document.getElementById('judul-modal-user').innerText = 'Edit Pengguna';
        document.getElementById('btn-text-user').innerText     = 'Update Pengguna';
        document.getElementById('input-nama-user').value   = barisUserYangDiedit.cells[1].innerText;
        document.getElementById('input-email-user').value  = barisUserYangDiedit.cells[2].innerText;
        document.getElementById('input-role-user').value   = barisUserYangDiedit.cells[3].innerText.trim();
        document.getElementById('input-status-user').value = barisUserYangDiedit.cells[4].innerText.trim();
    } else {
        barisUserYangDiedit = null;
        document.getElementById('judul-modal-user').innerText = 'Tambah Pengguna Baru';
        document.getElementById('btn-text-user').innerText     = 'Simpan Pengguna';
        form.reset();
    }
    openModal('modal-user');
}

document.getElementById('form-user').addEventListener('submit', async function (e) {
    e.preventDefault();
    const nama   = document.getElementById('input-nama-user').value;
    const email  = document.getElementById('input-email-user')?.value || '';
    const role   = document.getElementById('input-role-user').value;
    const status = document.getElementById('input-status-user')?.value || 'Aktif';

    const roleClass  = role === 'Admin' ? 'role-admin' : role === 'Seller' ? 'role-seller' : 'role-user';
    const roleBadge  = `<span class="role-badge ${roleClass}">${role}</span>`;
    const statusClass = status === 'Aktif' ? 'status-aktif' : 'status-nonaktif';
    const statusBadge = `<span class="user-status-badge ${statusClass}"><i class="fas fa-circle"></i> ${status}</span>`;

    if (barisUserYangDiedit) {
        // UPDATE
        const userId = barisUserYangDiedit.dataset.userId;
        const result = await apiFetch('/users/' + userId, {
            method: 'PUT',
            body: JSON.stringify({ nama, email, role, status })
        });
        if (result && result.success) {
            barisUserYangDiedit.cells[1].innerText = nama;
            if (barisUserYangDiedit.cells[2]) barisUserYangDiedit.cells[2].innerText = email;
            barisUserYangDiedit.cells[3].innerHTML = roleBadge;
            barisUserYangDiedit.cells[4].innerHTML = statusBadge;
        }
    } else {
        // INSERT
        const newUser = await apiFetch('/users', {
            method: 'POST',
            body: JSON.stringify({ nama, email, role, status })
        });
        if (newUser && newUser.user_id) {
            const roleLower  = (newUser.role || 'user').toLowerCase();
            const roleLabel  = roleLower.charAt(0).toUpperCase() + roleLower.slice(1);
            const rc         = roleLower === 'admin' ? 'role-admin' : roleLower === 'seller' ? 'role-seller' : 'role-user';
            const sc         = newUser.status === 'Aktif' ? 'status-aktif' : 'status-nonaktif';
            const created    = (newUser.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0];
            const tr = document.createElement('tr');
            tr.dataset.userId = newUser.user_id;
            tr.innerHTML = `
                <td>${newUser.user_id}</td><td>${newUser.nama}</td><td>${newUser.email}</td>
                <td><span class="role-badge ${rc}">${roleLabel}</span></td>
                <td><span class="user-status-badge ${sc}"><i class="fas fa-circle"></i> ${newUser.status}</span></td>
                <td>${created}</td>
                <td>
                    <a class="action-link edit"   onclick="bukaModalUser(this)"><i class="fas fa-edit"></i> Edit</a>
                    <a class="action-link delete" onclick="hapusBarisPengguna(this)"><i class="fas fa-trash"></i> Hapus</a>
                </td>`;
            document.querySelector('#tabel-user tbody').appendChild(tr);
        }
    }

    closeModal('modal-user');
    filterTabelUser();
});

// ============================================================
// FILTER & SEARCH
// ============================================================
function filterTabelUser() {
    const q          = (document.getElementById('user-search-input')?.value || '').toLowerCase();
    const roleFilter = document.getElementById('user-filter-role')?.value || '';
    const statFilter = document.getElementById('user-filter-status')?.value || '';
    const rows       = document.querySelectorAll('#tabel-user tbody tr');
    let visible = 0;

    rows.forEach(row => {
        if (row.style.display === 'none' && !row.cells.length) return;
        const nama   = (row.cells[1]?.innerText || '').toLowerCase();
        const email  = (row.cells[2]?.innerText || '').toLowerCase();
        const role   = row.cells[3]?.innerText.trim() || '';
        const status = row.cells[4]?.innerText.trim() || '';
        const matchQ = !q || nama.includes(q) || email.includes(q);
        const matchR = !roleFilter || role.includes(roleFilter);
        const matchS = !statFilter || status.includes(statFilter);
        if (matchQ && matchR && matchS) { row.style.display = ''; visible++; }
        else row.style.display = 'none';
    });

    const info = document.getElementById('user-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${visible}</strong> pengguna`;
}

function filterTabelLog() {
    const q         = (document.getElementById('log-search-input')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('log-filter-type')?.value || '';
    const sevFilter  = document.getElementById('log-filter-severity')?.value || '';
    const rows       = document.querySelectorAll('#log-tbody tr');
    let visible = 0;

    rows.forEach(row => {
        const type = row.getAttribute('data-type') || '';
        const sev  = row.getAttribute('data-severity') || '';
        const text = row.innerText.toLowerCase();
        if ((!q || text.includes(q)) && (!typeFilter || type === typeFilter) && (!sevFilter || sev === sevFilter)) {
            row.style.display = ''; visible++;
        } else row.style.display = 'none';
    });

    const info = document.getElementById('log-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${visible}</strong> entri log`;
}

// ── Export Log CSV ────────────────────────────────────────────
function exportLogCSV() {
    let csv = 'Waktu,Tipe,Level,Aktivitas,Aktor,IP\n';
    rows.forEach(row => {
        if (row.style.display === 'none') return;
        const cols = Array.from(row.cells).map(c => '"' + c.innerText.replace(/"/g, '""') + '"');
        csv += cols.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'log_aktivitas.csv'; a.click();
    URL.revokeObjectURL(url);
}

async function loadLogs() {
    const logs = await apiFetch('/logs');
    if (!logs) return;

    const tbody = document.querySelector('#log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Update summary chips
    const total   = logs.length;
    const success = logs.filter(l => l.severity === 'SUCCESS').length;
    const warning = logs.filter(l => l.severity === 'WARNING').length;
    const error   = logs.filter(l => l.severity === 'ERROR').length;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };
    el('log-total-count',   total);
    el('log-success-count', success);
    el('log-warning-count', warning);
    el('log-error-count',   error);

    const typeClassMap = {
        'Login':     'type-login',
        'Transaksi': 'type-transaksi',
        'Produk':    'type-produk',
        'Pengguna':  'type-pengguna',
        'Keamanan':  'type-keamanan',
    };
    const levelClassMap = {
        'SUCCESS': 'level-success',
        'WARNING': 'level-warning',
        'ERROR':   'level-error',
        'INFO':    'level-info',
    };

    logs.forEach(log => {
        const typeClass  = typeClassMap[log.type]  || 'type-login';
        const levelClass = levelClassMap[log.severity] || 'level-info';

        // Format waktu: 2026-04-14 18:30
        const d = new Date(log.created_at);
        const pad = n => String(n).padStart(2, '0');
        const waktu = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

        const tr = document.createElement('tr');
        tr.setAttribute('data-type',     log.type);
        tr.setAttribute('data-severity', log.severity);
        tr.innerHTML = `
            <td class="log-time">${waktu}</td>
            <td><span class="log-type-badge ${typeClass}">${log.type}</span></td>
            <td><span class="log-level-badge ${levelClass}">${log.severity}</span></td>
            <td>${log.activity}</td>
            <td>${log.actor}</td>
            <td class="log-ip">${log.ip_address}</td>`;
        tbody.appendChild(tr);
    });

    const info = document.getElementById('log-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${total}</strong> entri log`;

    filterTabelLog();

    // Sinkronkan juga panel Aktivitas Terbaru
    await loadRecentActivity();
}

function refreshLog() {
    const btn = document.querySelector('button[onclick="refreshLog()"]');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; btn.disabled = true; }
    loadLogs().then(() => {
        if (btn) { btn.innerHTML = '<i class="fas fa-rotate-right"></i> Refresh'; btn.disabled = false; }
    });
}

// ===============================
// MODAL DETAIL PRODUK
// ===============================
function openProductDetail(nama, harga) {
    const product = getProductFromDB(nama);

    document.getElementById('modal-title').innerText = nama;
    document.getElementById('modal-desc').innerText = product?.deskripsi || 'Produk berkualitas';
    document.getElementById('modal-stock').innerText = product?.stok || 0;
    const iconEl = document.getElementById('modal-icon');
    if (product?.gambar) {
        iconEl.innerHTML = `<img src="/uploads/${product.gambar}" style="width:100px; height:100px; object-fit:cover;">`;
    } else {
        iconEl.innerHTML = `<i class="${product?.icon || 'fas fa-box'}"></i>`;
    }

    document.getElementById('modal-qty').value = 1;

    const btn = document.getElementById('modal-add-btn');

    // 🟢 CEK STOK (INI YANG KAMU TANYA TARUH DIMANA)
    if (!product || product.stok <= 0) {
        btn.disabled = true;
        btn.innerText = 'Stok Habis';
        btn.style.background = '#9ca3af';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cart-plus"></i> Tambah ke Keranjang';
        btn.style.background = '';
    }

    // 🔵 EVENT TAMBAH KE KERANJANG
    btn.onclick = function() {
        const qty = parseInt(document.getElementById('modal-qty').value) || 1;

        if (qty > product.stok) {
            alert('Stok tidak cukup!');
            return;
        }

        const existing = keranjang.find(item => item.nama === nama);

        if (existing) {
            existing.qty += qty;
            existing.selected = true;
        } else {
            keranjang.push({
            nama,
            harga,
            qty,
            selected: true,
            favorit: false
        });
        }

        saveKeranjang();
        renderKeranjang();
        updateCartBadge();
        closeModal('product-modal');
    };

    openModal('product-modal');
}

function ubahQtyModal(delta) {
    const input = document.getElementById('modal-qty');
    let value = parseInt(input.value) || 1;

    value += delta;

    if (value < 1) value = 1;

    input.value = value;
}

// ============================================================
// INIT
// ============================================================
window.onload = async () => {
    const savedRole = getSavedRole();
    changeRole(savedRole);

    // Load semua data dari database secara paralel
    await Promise.all([
        loadProducts(),
        loadTransactions(),
        loadUsers(),
        loadLogs(),
    ]);

    renderCatalog();

    keranjang = JSON.parse(localStorage.getItem('keranjang')) || [];
    renderKeranjang();

    updateDashboardStats();
    filterTabelUser();
};
