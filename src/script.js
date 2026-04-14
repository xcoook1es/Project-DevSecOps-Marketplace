const statsData = {
    admin: `<div class="stat-card bg-purple"><div><h3>1,250</h3><p>Total Pengguna (D1)</p></div><i class="fas fa-users"></i></div>
            <div class="stat-card bg-red"><div><h3>89</h3><p>Log Sistem Hari Ini (D4)</p></div><i class="fas fa-shield-alt"></i></div>`,
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

    // Show/hide admin overview panel
    const adminPanel = document.getElementById('admin-overview-panel');
    if (adminPanel) adminPanel.style.display = role === 'admin' ? 'block' : 'none';

    document.querySelectorAll('.menu-item').forEach(item => {
        const allowedRoles = item.getAttribute('data-access').split(',');
        if (allowedRoles.includes(role)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
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
        'dashboard': 'Beranda Dashboard',
        'katalog-produk': 'Katalog Belanja',
        'keranjang-belanja': 'Keranjang',
        'manajemen-produk': 'Manajemen Produk',
        'transaksi': 'Data Transaksi',
        'manajemen-user': 'Manajemen Pengguna',
        'laporan': 'Log & Laporan Sistem'
    };
    document.getElementById('page-title').innerText = titles[menuId];
    if (menuId === 'dashboard') updateDashboardStats();
    updateSellerProductSummary();
    updateTransactionEmptyState();
}

function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }
function hapusBaris(elemen) {
    if (confirm("Apakah Anda yakin ingin menghapus data ini?")) {
        elemen.closest('tr').remove();
        updateDashboardStats();
        updateSellerProductSummary();
        updateTransactionEmptyState();
    }
}

function logout() {
    localStorage.removeItem('TrustMarket_active_role');
    localStorage.removeItem('syscore_active_role');
}

function getTransactionStats() {
    const rows = Array.from(document.querySelectorAll('#tabel-transaksi tbody tr'));
    const selesai = rows.filter(row => row.cells[3]?.innerText.includes('Selesai')).length;
    const diproses = rows.filter(row => {
        const status = row.cells[3]?.innerText || '';
        return status.includes('Diproses') || status.includes('Pending') || status.includes('Menunggu');
    }).length;

    return {
        total: rows.length + pendingCheckoutItems.length,
        proses: diproses + pendingCheckoutItems.length,
        selesai
    };
}

function parseRupiah(text) {
    return Number((text || '').replace(/[^0-9]/g, '')) || 0;
}

function getSellerProductStats() {
    const rows = Array.from(document.querySelectorAll('#tabel-produk tbody tr'));
    const totalStock = rows.reduce((sum, row) => sum + (Number(row.cells[3]?.innerText) || 0), 0);
    const lowStock = rows.filter(row => (Number(row.cells[3]?.innerText) || 0) < 10).length;

    return {
        productCount: rows.length,
        totalStock,
        lowStock,
        topProduct: rows[0]?.cells[1]?.innerText || 'Belum ada produk terlaris'
    };
}

function getSellerRevenue() {
    return Array.from(document.querySelectorAll('#tabel-transaksi tbody tr'))
        .filter(row => row.cells[3]?.innerText.includes('Selesai'))
        .reduce((sum, row) => sum + parseRupiah(row.cells[2]?.innerText), 0);
}

function updateDashboardStats() {
    const totalEl = document.getElementById('stat-total-pembelian');
    const prosesEl = document.getElementById('stat-pesanan-proses');
    const selesaiEl = document.getElementById('stat-pesanan-selesai');
    const sellerProductEl = document.getElementById('stat-seller-products');
    const sellerOrderEl = document.getElementById('stat-seller-orders');
    const sellerRevenueEl = document.getElementById('stat-seller-revenue');

    const stats = getTransactionStats();
    if (totalEl && prosesEl && selesaiEl) {
        totalEl.innerText = stats.total;
        prosesEl.innerText = stats.proses;
        selesaiEl.innerText = stats.selesai;
    }

    if (sellerProductEl && sellerOrderEl && sellerRevenueEl) {
        const productStats = getSellerProductStats();
        sellerProductEl.innerText = productStats.productCount;
        sellerOrderEl.innerText = stats.proses;
        sellerRevenueEl.innerText = formatRupiah(getSellerRevenue()).replace(',00', '');
    }
}

function updateSellerProductSummary() {
    const countEl = document.getElementById('seller-product-count');
    const stockEl = document.getElementById('seller-stock-count');
    const stockSummaryEl = document.getElementById('seller-stock-summary');
    const lowStockEl = document.getElementById('seller-low-stock-summary');
    const topProductEl = document.getElementById('seller-top-product');
    const panel = document.getElementById('seller-dashboard-panel');
    const stats = getSellerProductStats();

    if (countEl) countEl.innerText = `${stats.productCount} produk aktif`;
    if (stockEl) stockEl.innerText = `${stats.totalStock} stok tersedia`;
    if (stockSummaryEl) stockSummaryEl.innerText = `${stats.totalStock} stok tersedia`;
    if (lowStockEl) lowStockEl.innerText = `${stats.lowStock} produk perlu restock`;
    if (topProductEl) topProductEl.innerText = stats.topProduct;
    if (panel) panel.style.display = document.getElementById('stat-seller-products') ? 'grid' : 'none';
}

function updateTransactionEmptyState() {
    const emptyState = document.getElementById('transaksi-empty-state');
    const tbody = document.querySelector('#tabel-transaksi tbody');
    if (!emptyState || !tbody) return;
    emptyState.style.display = tbody.children.length === 0 ? 'flex' : 'none';
}

// ===== SISTEM KERANJANG =====
let keranjang = [];
const productMeta = {
    'Sepatu Kets Retro': { icon: 'fas fa-shoe-prints', varian: 'Retro Matte Silver', stok: 12, diskon: '32%', hargaAwal: 370000 },
    'Kemeja Flanel Original': { icon: 'fas fa-tshirt', varian: 'Flanel Red Black', stok: 8, diskon: '28%', hargaAwal: 210000 },
    'Kacamata Hitam Y2K': { icon: 'fas fa-glasses', varian: 'Y2K Black Glossy', stok: 5, diskon: '25%', hargaAwal: 160000 },
    'Headphone Wireless': { icon: 'fas fa-headphones', varian: 'Wireless Midnight', stok: 3, diskon: '18%', hargaAwal: 550000 }
};

function getProductMeta(nama) {
    return productMeta[nama] || { icon: 'fas fa-box', varian: 'Produk TrustMarket', stok: 10, diskon: '10%', hargaAwal: null };
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) badge.innerText = keranjang.reduce((total, item) => total + item.qty, 0);
}

function ubahQty(tombol, delta) {
    const qtyEl = tombol.closest('.qty-control').querySelector('.qty-value');
    let qty = parseInt(qtyEl.value !== undefined ? qtyEl.value : qtyEl.innerText) + delta;
    if (qty < 1) qty = 1;
    if (qtyEl.value !== undefined && qtyEl.tagName === 'INPUT') {
        qtyEl.value = qty;
    } else {
        qtyEl.innerText = qty;
    }
}

function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
}

function tambahKeranjang(nama, harga, tombol) {
    const qtyEl = tombol.closest('.product-card').querySelector('.qty-value');
    const qty = parseInt(qtyEl.value !== undefined && qtyEl.tagName === 'INPUT' ? qtyEl.value : qtyEl.innerText);
    const existing = keranjang.find(item => item.nama === nama);
    if (existing) {
        existing.qty += qty;
        existing.selected = true;
    } else {
        const meta = getProductMeta(nama);
        keranjang.push({
            nama,
            harga,
            qty,
            selected: true,
            favorit: false,
            varian: meta.varian,
            stok: meta.stok,
            diskon: meta.diskon,
            hargaAwal: meta.hargaAwal,
            icon: meta.icon
        });
    }
    renderKeranjang();

    // Feedback visual pada tombol
    tombol.innerHTML = '<i class="fas fa-check"></i> Ditambahkan!';
    tombol.style.background = '#059669';
    setTimeout(() => {
        tombol.innerHTML = '<i class="fas fa-cart-plus"></i> Tambah ke Keranjang';
        tombol.style.background = '';
    }, 1500);
}

function hapusKeranjang(index) {
    keranjang.splice(index, 1);
    renderKeranjang();
}

function ubahQtyKeranjang(index, delta) {
    keranjang[index].qty += delta;
    if (keranjang[index].qty < 1) keranjang[index].qty = 1;
    renderKeranjang();
}

function setPilihItem(index, checked) {
    keranjang[index].selected = checked;
    renderKeranjang();
}

function togglePilihSemua(checked) {
    keranjang.forEach(item => item.selected = checked);
    renderKeranjang();
}

function toggleFavorit(index) {
    keranjang[index].favorit = !keranjang[index].favorit;
    renderKeranjang();
}

function renderKeranjang() {
    const emptyState = document.getElementById('cart-empty-state');
    const shopSection = document.getElementById('cart-shop-section');
    const itemsList = document.getElementById('cart-items-list');
    const itemCountEl = document.getElementById('cart-item-count');
    const totalEl = document.getElementById('cart-summary-total');
    const buyBtn = document.getElementById('cart-buy-btn');
    const promoText = document.getElementById('cart-promo-text');
    const selectAll = document.getElementById('cart-select-all');
    const shopCheck = document.getElementById('cart-shop-check');

    updateCartBadge();
    if (!emptyState || !shopSection || !itemsList) return;

    const selectedItems = keranjang.filter(item => item.selected);
    const selectedTotal = selectedItems.reduce((total, item) => total + (item.harga * item.qty), 0);
    const isAllSelected = keranjang.length > 0 && selectedItems.length === keranjang.length;

    itemCountEl.innerText = keranjang.length;
    totalEl.innerText = selectedItems.length > 0 ? formatRupiah(selectedTotal) : '-';
    buyBtn.disabled = selectedItems.length === 0;
    promoText.innerText = selectedItems.length > 0 ? 'Pakai promo saat checkout' : 'Pilih barang dulu sebelum pakai promo';
    selectAll.checked = isAllSelected;
    shopCheck.checked = isAllSelected;
    selectAll.indeterminate = selectedItems.length > 0 && !isAllSelected;
    shopCheck.indeterminate = selectedItems.length > 0 && !isAllSelected;

    itemsList.innerHTML = '';
    if (keranjang.length === 0) {
        emptyState.style.display = 'flex';
        shopSection.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    shopSection.style.display = 'block';

    keranjang.forEach((item, i) => {
        const meta = getProductMeta(item.nama);
        const hargaAwal = item.hargaAwal || meta.hargaAwal;
        const diskon = item.diskon || meta.diskon;
        const varian = item.varian || meta.varian;
        const stok = item.stok || meta.stok;
        const icon = item.icon || meta.icon;

        itemsList.innerHTML += `
            <div class="cart-item-row">
                <input class="cart-checkbox" type="checkbox" ${item.selected ? 'checked' : ''} onchange="setPilihItem(${i}, this.checked)">
                <div class="cart-product-thumb">
                    <span class="cart-discount-badge">${diskon}</span>
                    <i class="${icon}"></i>
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

// ===== SISTEM CHECKOUT & PEMBAYARAN =====
const kodePROMO = {
    'HEMAT10': { diskon: 0.10, label: 'Diskon 10%' },
    'TRUST20': { diskon: 0.20, label: 'Diskon 20%' },
    'GRATIS': { diskon: 0, ongkirGratis: true, label: 'Gratis Ongkir' }
};
const ongkirMap = { reguler: 15000, express: 25000, same_day: 35000 };
let promoAktif = null;
let pendingCheckoutItems = [];
const PROCESSING_DELAY_MS = 10000;
const transaksiTimers = new Map();

function checkout() {
    if (keranjang.length === 0) return;
    checkoutSelected();
}

function checkoutSelected() {
    const selectedItems = keranjang.filter(item => item.selected);
    if (selectedItems.length === 0) {
        alert('Pilih barang yang ingin dibeli terlebih dahulu.');
        return;
    }

    pendingCheckoutItems = JSON.parse(JSON.stringify(selectedItems));
    keranjang = keranjang.filter(item => !item.selected);
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
    if (notif) notif.style.display = pendingCheckoutItems.length > 0 ? 'block' : 'none';
}

function bukaModalCheckout() {
    if (pendingCheckoutItems.length === 0) return;
    promoAktif = null;
    document.getElementById('co-promo').value = '';
    document.getElementById('co-promo-info').innerHTML = '';
    document.getElementById('baris-diskon').style.display = 'none';
    const savedRole = localStorage.getItem('TrustMarket_active_role') || 'user';
    document.getElementById('co-nama-user').innerText = savedRole === 'user' ? 'Pembeli TrustMarket' : 'Pengguna TrustMarket';
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
    let subtotal = pendingCheckoutItems.reduce((sum, item) => sum + (item.harga * item.qty), 0);
    const pengiriman = document.querySelector('input[name="pengiriman"]:checked')?.value || 'reguler';
    let ongkir = ongkirMap[pengiriman] || 15000;
    let diskon = 0;
    if (promoAktif) {
        if (promoAktif.ongkirGratis) ongkir = 0;
        if (promoAktif.diskon > 0) diskon = Math.round(subtotal * promoAktif.diskon);
    }
    const total = subtotal + ongkir - diskon;
    document.getElementById('co-subtotal').innerText = formatRupiah(subtotal);
    document.getElementById('co-ongkir').innerText = formatRupiah(ongkir);
    document.getElementById('co-total-bayar').innerText = formatRupiah(total);
    if (diskon > 0) {
        document.getElementById('baris-diskon').style.display = 'flex';
        document.getElementById('co-diskon').innerText = '- ' + formatRupiah(diskon);
    } else {
        document.getElementById('baris-diskon').style.display = 'none';
    }
}

function pakaiPromo() {
    const kode = document.getElementById('co-promo').value.trim().toUpperCase();
    const infoEl = document.getElementById('co-promo-info');
    if (!kode) { infoEl.innerHTML = '<span style="color:#ef4444;">Masukkan kode promo terlebih dahulu.</span>'; return; }
    if (kodePROMO[kode]) {
        promoAktif = kodePROMO[kode];
        infoEl.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Promo <b>${kode}</b> berhasil — ${promoAktif.label}!</span>`;
        hitungTotal();
    } else {
        promoAktif = null;
        infoEl.innerHTML = '<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> Kode promo tidak valid.</span>';
        hitungTotal();
    }
}

function konfirmasiBayar() {
    const alamat = document.getElementById('co-alamat').value.trim();
    if (!alamat) { alert('Mohon isi alamat pengiriman terlebih dahulu.'); return; }
    const metode = document.querySelector('input[name="pembayaran"]:checked')?.value || 'gopay';
    const pengiriman = document.querySelector('input[name="pengiriman"]:checked')?.value || 'reguler';
    const metodeLabel = { gopay: 'GoPay', bri: 'BRI Virtual Account', bca: 'BCA Virtual Account', mandiri: 'Mandiri Virtual Account', cod: 'Bayar di Tempat (COD)' };
    const pengirimanLabel = { reguler: 'Reguler', express: 'Express', same_day: 'Same Day' };
    let subtotal = pendingCheckoutItems.reduce((sum, item) => sum + (item.harga * item.qty), 0);
    let ongkir = ongkirMap[pengiriman] || 15000;
    let diskon = 0;
    if (promoAktif) {
        if (promoAktif.ongkirGratis) ongkir = 0;
        if (promoAktif.diskon > 0) diskon = Math.round(subtotal * promoAktif.diskon);
    }
    const total = subtotal + ongkir - diskon;
    pendingCheckoutItems.forEach(item => {
        const trxId = 'TRX-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const barisBaru = `<tr>
            <td>${trxId}</td>
            <td>${item.nama} (x${item.qty})</td>
            <td>${formatRupiah(item.harga * item.qty)}</td>
            <td><span class="status-badge status-diproses"><i class="fas fa-spinner fa-spin"></i> Diproses (10 dtk)</span></td>
            <td>—</td>
        </tr>`;
        const tbody = document.querySelector('#tabel-transaksi tbody');
        tbody.insertAdjacentHTML('beforeend', barisBaru);
        mulaiProsesTransaksi(tbody.lastElementChild);
    });
    closeModal('modal-checkout');
    let detailHTML = pendingCheckoutItems.map(item =>
        `<div class="sukses-item"><span>${item.nama} \u00d7${item.qty}</span><span>${formatRupiah(item.harga * item.qty)}</span></div>`
    ).join('');
    detailHTML += `<div class="sukses-item sukses-item-total"><span>Total Dibayar</span><span>${formatRupiah(total)}</span></div>`;
    document.getElementById('sukses-detail-list').innerHTML = detailHTML;
    document.getElementById('sukses-metode-text').innerHTML =
        `Pembayaran via <strong>${metodeLabel[metode]}</strong> · Pengiriman <strong>${pengirimanLabel[pengiriman]}</strong>`;
    openModal('modal-sukses-bayar');
    pendingCheckoutItems = [];
    cekNotifPending();
    updateDashboardStats();
    updateTransactionEmptyState();
}

function mulaiProsesTransaksi(row) {
    let sisaDetik = Math.ceil(PROCESSING_DELAY_MS / 1000);
    row.cells[4].innerHTML = '<button class="btn-transaksi-action" onclick="selesaikanTransaksi(this)">Selesaikan</button>';

    const timer = setInterval(() => {
        sisaDetik -= 1;
        if (sisaDetik <= 0) {
            clearInterval(timer);
            transaksiTimers.delete(row);
            tandaiTransaksiSelesai(row);
            return;
        }

        row.cells[3].innerHTML = `<span class="status-badge status-diproses"><i class="fas fa-spinner fa-spin"></i> Diproses (${sisaDetik} dtk)</span>`;
    }, 1000);

    transaksiTimers.set(row, timer);
}

function selesaikanTransaksi(tombol) {
    const row = tombol.closest('tr');
    const timer = transaksiTimers.get(row);
    if (timer) {
        clearInterval(timer);
        transaksiTimers.delete(row);
    }
    tandaiTransaksiSelesai(row);
}

function tandaiTransaksiSelesai(row) {
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

let barisProdukYangDiedit = null;
function bukaModalProduk(tombolEdit = null) {
    const form = document.getElementById('form-produk');
    if (tombolEdit) {
        barisProdukYangDiedit = tombolEdit.closest('tr');
        document.getElementById('judul-modal-produk').innerText = "Edit Produk";
        document.getElementById('btn-text-produk').innerText = "Update Data Produk";
        document.getElementById('input-nama-produk').value = barisProdukYangDiedit.cells[1].innerText;
        document.getElementById('input-harga-produk').value = barisProdukYangDiedit.cells[2].innerText.replace(/[^0-9]/g, '');
        document.getElementById('input-stok-produk').value = barisProdukYangDiedit.cells[3].innerText;
    } else {
        barisProdukYangDiedit = null;
        document.getElementById('judul-modal-produk').innerText = "Tambah Produk Baru";
        document.getElementById('btn-text-produk').innerText = "Simpan Data Produk";
        form.reset();
    }
    openModal('modal-produk');
}

document.getElementById('form-produk').addEventListener('submit', function (e) {
    e.preventDefault();
    const nama = document.getElementById('input-nama-produk').value;
    const harga = document.getElementById('input-harga-produk').value;
    const stok = document.getElementById('input-stok-produk').value;
    const hargaRupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(harga);

    if (barisProdukYangDiedit) {
        barisProdukYangDiedit.cells[1].innerText = nama;
        barisProdukYangDiedit.cells[2].innerText = hargaRupiah;
        barisProdukYangDiedit.cells[3].innerText = stok;
    } else {
        const randomId = 'PRD-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const barisBaru = `<tr><td>${randomId}</td><td>${nama}</td><td>${hargaRupiah}</td><td>${stok}</td>
            <td><a class="action-link edit" onclick="bukaModalProduk(this)"><i class="fas fa-edit"></i> Edit</a> <a class="action-link delete" onclick="hapusBaris(this)"><i class="fas fa-trash"></i> Hapus</a></td></tr>`;
        document.querySelector('#tabel-produk tbody').insertAdjacentHTML('beforeend', barisBaru);
    }
    closeModal('modal-produk');
    updateSellerProductSummary();
    updateDashboardStats();
});

let barisUserYangDiedit = null;
function bukaModalUser(tombolEdit = null) {
    const form = document.getElementById('form-user');
    if (tombolEdit) {
        barisUserYangDiedit = tombolEdit.closest('tr');
        document.getElementById('judul-modal-user').innerText = "Edit Pengguna";
        document.getElementById('btn-text-user').innerText = "Update Pengguna";
        document.getElementById('input-nama-user').value = barisUserYangDiedit.cells[1].innerText;
        document.getElementById('input-role-user').value = barisUserYangDiedit.cells[2].innerText.trim();
    } else {
        barisUserYangDiedit = null;
        document.getElementById('judul-modal-user').innerText = "Tambah Pengguna Baru";
        document.getElementById('btn-text-user').innerText = "Simpan Pengguna";
        form.reset();
    }
    openModal('modal-user');
}

document.getElementById('form-user').addEventListener('submit', function (e) {
    e.preventDefault();
    const nama = document.getElementById('input-nama-user').value;
    const email = document.getElementById('input-email-user')?.value || '';
    const role = document.getElementById('input-role-user').value;
    const status = document.getElementById('input-status-user')?.value || 'Aktif';
    let roleClass = role === 'Admin' ? 'role-admin' : role === 'Seller' ? 'role-seller' : 'role-user';
    const roleBadge = `<span class="role-badge ${roleClass}">${role}</span>`;
    const statusClass = status === 'Aktif' ? 'status-aktif' : 'status-nonaktif';
    const statusBadge = `<span class="user-status-badge ${statusClass}"><i class="fas fa-circle"></i> ${status}</span>`;
    const today = new Date().toISOString().split('T')[0];

    if (barisUserYangDiedit) {
        barisUserYangDiedit.cells[1].innerText = nama;
        if (barisUserYangDiedit.cells[2]) barisUserYangDiedit.cells[2].innerText = email;
        barisUserYangDiedit.cells[3].innerHTML = roleBadge;
        barisUserYangDiedit.cells[4].innerHTML = statusBadge;
    } else {
        const randomId = 'USR-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const barisBaru = `<tr><td>${randomId}</td><td>${nama}</td><td>${email}</td><td>${roleBadge}</td><td>${statusBadge}</td><td>${today}</td>
            <td><a class="action-link edit" onclick="bukaModalUser(this)"><i class="fas fa-edit"></i> Edit</a> <a class="action-link delete" onclick="hapusBaris(this)"><i class="fas fa-trash"></i> Hapus</a></td></tr>`;
        document.querySelector('#tabel-user tbody').insertAdjacentHTML('beforeend', barisBaru);
    }
    closeModal('modal-user');
    filterTabelUser();
});

// ===== FILTER & SEARCH PENGGUNA =====
function filterTabelUser() {
    const q = (document.getElementById('user-search-input')?.value || '').toLowerCase();
    const roleFilter = document.getElementById('user-filter-role')?.value || '';
    const statusFilter = document.getElementById('user-filter-status')?.value || '';
    const rows = document.querySelectorAll('#tabel-user tbody tr');
    let visible = 0;
    rows.forEach(row => {
        const nama = (row.cells[1]?.innerText || '').toLowerCase();
        const email = (row.cells[2]?.innerText || '').toLowerCase();
        const role  = row.cells[3]?.innerText.trim() || '';
        const status= row.cells[4]?.innerText.trim() || '';
        const matchQ      = !q || nama.includes(q) || email.includes(q);
        const matchRole   = !roleFilter || role.includes(roleFilter);
        const matchStatus = !statusFilter || status.includes(statusFilter);
        if (matchQ && matchRole && matchStatus) {
            row.style.display = '';
            visible++;
        } else {
            row.style.display = 'none';
        }
    });
    const info = document.getElementById('user-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${visible}</strong> pengguna`;
}

// ===== FILTER & SEARCH LOG =====
function filterTabelLog() {
    const q = (document.getElementById('log-search-input')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('log-filter-type')?.value || '';
    const sevFilter  = document.getElementById('log-filter-severity')?.value || '';
    const rows = document.querySelectorAll('#log-tbody tr');
    let visible = 0;
    rows.forEach(row => {
        const type = row.getAttribute('data-type') || '';
        const sev  = row.getAttribute('data-severity') || '';
        const text = row.innerText.toLowerCase();
        const matchQ    = !q || text.includes(q);
        const matchType = !typeFilter || type === typeFilter;
        const matchSev  = !sevFilter  || sev === sevFilter;
        if (matchQ && matchType && matchSev) {
            row.style.display = '';
            visible++;
        } else {
            row.style.display = 'none';
        }
    });
    const info = document.getElementById('log-count-info');
    if (info) info.innerHTML = `Menampilkan <strong>${visible}</strong> entri log`;
}

// ===== EXPORT LOG CSV =====
function exportLogCSV() {
    const rows = document.querySelectorAll('#tabel-log tbody tr');
    let csv = 'Waktu,Tipe,Level,Aktivitas,Aktor,IP\n';
    rows.forEach(row => {
        if (row.style.display === 'none') return;
        const cols = Array.from(row.cells).map(c => '"' + c.innerText.replace(/"/g,'""') + '"');
        csv += cols.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'log_aktivitas.csv'; a.click();
    URL.revokeObjectURL(url);
}

// ===== REFRESH LOG =====
function refreshLog() {
    const btn = document.querySelector('button[onclick="refreshLog()"]');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; btn.disabled = true; }
    setTimeout(() => {
        if (btn) { btn.innerHTML = '<i class="fas fa-rotate-right"></i> Refresh'; btn.disabled = false; }
        filterTabelLog();
    }, 800);
}

// INIT: Mengunci Role dari halaman login
window.onload = () => {
    const savedRole = localStorage.getItem('TrustMarket_active_role') || localStorage.getItem('syscore_active_role') || 'admin';
    changeRole(savedRole);
};
