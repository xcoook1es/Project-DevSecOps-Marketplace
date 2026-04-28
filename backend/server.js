const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const pool     = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Helper: ambil IP dari request ────────────────────────────
function getIP(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '—')
        .split(',')[0].trim();
}

// ── Helper: catat log aktivitas ke DB ────────────────────────
async function logActivity(type, severity, activity, actor, ip = '—') {
    try {
        await pool.query(
            'INSERT INTO system_logs (type, severity, activity, actor, ip_address) VALUES ($1,$2,$3,$4,$5)',
            [type, severity, activity, actor, ip]
        );
    } catch (err) {
        console.error('⚠️  Gagal mencatat log:', err.message);
    }
}

// ── Helper: generate ID ──────────────────────────────────────
function genId(prefix, num) {
    return `${prefix}-${String(num).padStart(3, '0')}`;
}

// ── Inisialisasi tabel (berjalan setiap startup) ─────────────
async function ensureTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id         SERIAL PRIMARY KEY,
            type       VARCHAR(50)  NOT NULL,
            severity   VARCHAR(20)  NOT NULL,
            activity   TEXT         NOT NULL,
            actor      VARCHAR(255) NOT NULL DEFAULT 'Sistem',
            ip_address VARCHAR(45)  NOT NULL DEFAULT '—',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

// ── Seed admin & sample users saat startup ──────────────────
async function seedInitialData() {
    try {
        // Admin account
        const adminHash = await bcrypt.hash('Admin@123!', 10);
        await pool.query(`
            INSERT INTO users (user_id, nama, email, password_hash, role, status)
            VALUES ('USR-ADM', 'Administrator', 'cupcake@admin.com', $1, 'admin', 'Aktif')
            ON CONFLICT (email) DO NOTHING
        `, [adminHash]);

        console.log('✅ Seed data berhasil diinisialisasi');
    } catch (err) {
        console.error('❌ Gagal seed data:', err.message);
    }
}

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { role, email, password } = req.body;
    const ip = getIP(req);

    if (!role || !email || !password)
        return res.status(400).json({ error: 'Role, email, dan password wajib diisi.' });

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]
        );

        if (result.rows.length === 0) {
            await logActivity('Login', 'ERROR', `Login gagal — akun tidak ditemukan (${email})`, 'Unknown (—)', ip);
            return res.status(401).json({ error: 'Login gagal. Periksa kembali role, email, dan password Anda.' });
        }

        const user = result.rows[0];

        if (user.role !== role) {
            await logActivity('Login', 'ERROR', `Login gagal — role tidak cocok (${email})`, 'Unknown (—)', ip);
            return res.status(401).json({ error: 'Login gagal. Periksa kembali role, email, dan password Anda.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            await logActivity('Login', 'ERROR', `Login gagal — kata sandi salah (${email})`, 'Unknown (—)', ip);
            return res.status(401).json({ error: 'Login gagal. Periksa kembali role, email, dan password Anda.' });
        }

        const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        await logActivity('Login', 'SUCCESS', 'Login berhasil', `${user.nama} (${roleLabel})`, ip);

        res.json({
            success: true,
            userId: user.user_id,
            nama:   user.nama,
            email:  user.email,
            role:   user.role,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan server.' });
    }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    const { role, nama, email, password } = req.body;
    const ip = getIP(req);

    if (!role || !nama || !email || !password)
        return res.status(400).json({ error: 'Semua field wajib diisi.' });

    if (!['seller', 'user'].includes(role))
        return res.status(400).json({ error: 'Role pendaftaran tidak valid.' });

    const pwRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!pwRegex.test(password))
        return res.status(400).json({ error: 'Password harus minimal 8 karakter, mengandung huruf besar, angka, dan simbol.' });

    try {
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (exists.rows.length > 0)
            return res.status(409).json({ error: 'Email sudah terdaftar!' });

        const count  = await pool.query('SELECT COUNT(*) FROM users');
        const userId = genId('USR', parseInt(count.rows[0].count) + 1);
        const hash   = await bcrypt.hash(password, 10);

        await pool.query(
            'INSERT INTO users (user_id, nama, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)',
            [userId, nama.trim(), email.trim().toLowerCase(), hash, role]
        );

        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        await logActivity('Pengguna', 'INFO', `Pengguna baru mendaftar: ${nama.trim()} sebagai ${roleLabel}`, email.trim().toLowerCase(), ip);

        res.json({ success: true, message: 'Pendaftaran berhasil!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan server.' });
    }
});

// ============================================================
// USER ROUTES
// ============================================================

// GET /api/users
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, nama, email, role, status, created_at FROM users ORDER BY created_at ASC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data pengguna.' });
    }
});

// POST /api/users (tambah pengguna baru dari admin panel)
app.post('/api/users', async (req, res) => {
    const { nama, email, role, status } = req.body;
    const ip = getIP(req);

    if (!nama || !email || !role)
        return res.status(400).json({ error: 'Nama, email, dan role wajib diisi.' });

    try {
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (exists.rows.length > 0)
            return res.status(409).json({ error: 'Email sudah terdaftar!' });

        const count  = await pool.query('SELECT COUNT(*) FROM users');
        const userId = genId('USR', parseInt(count.rows[0].count) + 1);
        const hash   = await bcrypt.hash('User@123!', 10);

        await pool.query(
            'INSERT INTO users (user_id, nama, email, password_hash, role, status) VALUES ($1,$2,$3,$4,$5,$6)',
            [userId, nama.trim(), email.trim().toLowerCase(), hash, role.toLowerCase(), status || 'Aktif']
        );

        await logActivity('Pengguna', 'INFO', `Pengguna baru ditambahkan oleh Admin: ${nama.trim()} (${role})`, 'Administrator (Admin)', ip);

        const newUser = await pool.query('SELECT user_id, nama, email, role, status, created_at FROM users WHERE user_id = $1', [userId]);
        res.json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menambah pengguna.' });
    }
});

// PUT /api/users/:userId
app.put('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const { nama, email, role, status } = req.body;
    const ip = getIP(req);

    try {
        await pool.query(
            'UPDATE users SET nama=$1, email=$2, role=$3, status=$4 WHERE user_id=$5',
            [nama, email, role ? role.toLowerCase() : undefined, status, userId]
        );

        await logActivity('Pengguna', 'INFO', `Data pengguna ${userId} diperbarui`, 'Administrator (Admin)', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memperbarui pengguna.' });
    }
});

// DELETE /api/users/:userId
app.delete('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const ip = getIP(req);

    try {
        // Ambil nama sebelum dihapus
        const found = await pool.query('SELECT nama, role FROM users WHERE user_id = $1', [userId]);
        const namaUser = found.rows[0]?.nama || userId;

        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);

        await logActivity('Pengguna', 'WARNING', `Akun ${userId} (${namaUser}) dihapus oleh Admin`, 'Administrator (Admin)', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menghapus pengguna.' });
    }
});

// ============================================================
// PRODUCT ROUTES
// ============================================================

// PUT /api/products/reduce-stock
app.put('/api/products/reduce-stock', async (req, res) => {
    const { nama, qty } = req.body;

    try {
        await pool.query(
            `UPDATE products 
             SET stok = stok - $1 
             WHERE nama = $2`,
            [qty, nama]
        );

        console.log('STOK DIKURANGI:', nama, qty);

        res.json({ success: true });
    } catch (err) {
        console.error('ERROR REDUCE STOCK:', err);
        res.status(500).json({ success: false });
    }
});

// GET /api/products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data produk.' });
    }
});

// POST /api/products
app.post('/api/products', async (req, res) => {
    const { nama, harga, stok } = req.body;
    const ip = getIP(req);

    if (!nama || !harga)
        return res.status(400).json({ error: 'Nama dan harga wajib diisi.' });

    try {
        const count     = await pool.query('SELECT COUNT(*) FROM products');
        const productId = genId('PRD', parseInt(count.rows[0].count) + 1);

        await pool.query(
            'INSERT INTO products (product_id, nama, harga, stok) VALUES ($1,$2,$3,$4)',
            [productId, nama.trim(), parseInt(harga), parseInt(stok) || 0]
        );

        await logActivity('Produk', 'INFO', `Produk baru ditambahkan: ${nama.trim()} (${productId})`, 'Seller', ip);

        const newProduct = await pool.query('SELECT * FROM products WHERE product_id = $1', [productId]);
        res.json(newProduct.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menambah produk.' });
    }
});

// PUT /api/products/:productId
app.put('/api/products/:productId', async (req, res) => {
    const { productId } = req.params;
    const { nama, harga, stok } = req.body;
    const ip = getIP(req);

    try {
        await pool.query(
            'UPDATE products SET nama=$1, harga=$2, stok=$3 WHERE product_id=$4',
            [nama, parseInt(harga), parseInt(stok), productId]
        );

        await logActivity('Produk', 'INFO', `Produk ${productId} diperbarui: ${nama}`, 'Seller', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memperbarui produk.' });
    }
});

// DELETE /api/products/:productId
app.delete('/api/products/:productId', async (req, res) => {
    const { productId } = req.params;
    const ip = getIP(req);

    try {
        const found = await pool.query('SELECT nama FROM products WHERE product_id = $1', [productId]);
        const namaProduk = found.rows[0]?.nama || productId;

        await pool.query('DELETE FROM products WHERE product_id = $1', [productId]);

        await logActivity('Produk', 'WARNING', `Produk ${productId} (${namaProduk}) dihapus`, 'Seller', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menghapus produk.' });
    }
});

// ============================================================
// TRANSACTION ROUTES
// ============================================================

// GET /api/transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM transactions ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data transaksi.' });
    }
});

// POST /api/transactions
app.post('/api/transactions', async (req, res) => {
    const { trx_id, product_name, qty, total_harga, metode, pengiriman, alamat } = req.body;
    const ip = getIP(req);

    if (!trx_id || !product_name || !qty || !total_harga)
        return res.status(400).json({ error: 'Data transaksi tidak lengkap.' });

    try {
        await pool.query(
            `INSERT INTO transactions (trx_id, product_name, qty, total_harga, status, metode, pengiriman, alamat)
             VALUES ($1,$2,$3,$4,'Diproses',$5,$6,$7)`,
            [trx_id, product_name, parseInt(qty), parseInt(total_harga), metode, pengiriman, alamat]
        );

        await logActivity('Transaksi', 'SUCCESS', `Checkout berhasil — ${trx_id} (${product_name})`, 'Pembeli (User)', ip);

        const newTrx = await pool.query('SELECT * FROM transactions WHERE trx_id = $1', [trx_id]);
        res.json(newTrx.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal membuat transaksi.' });
    }
});

// PUT /api/transactions/:trxId/complete
app.put('/api/transactions/:trxId/complete', async (req, res) => {
    const { trxId } = req.params;
    const ip = getIP(req);

    try {
        await pool.query(
            "UPDATE transactions SET status='Selesai' WHERE trx_id = $1",
            [trxId]
        );

        await logActivity('Transaksi', 'SUCCESS', `Transaksi diselesaikan — ${trxId}`, 'Pembeli (User)', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memperbarui status transaksi.' });
    }
});

// ============================================================
// LOG ROUTES
// ============================================================

// GET /api/logs
app.get('/api/logs', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 200'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil log.' });
    }
});

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`🚀 TrustMarket API berjalan di port ${PORT}`);
    await ensureTables();
    await seedInitialData();
});
