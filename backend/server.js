const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pool = require('./db');
const { sendNotifikasi } = require('./telegram');

// ── Prometheus Metrics (prom-client) ─────────────────────────────────────────
const client = require('prom-client');
const register = new client.Registry();

// Default metrics: event loop lag, heap, GC, dll.
// Catatan: prom-client sudah punya prefix 'nodejs_' secara internal,
// jangan tambahkan prefix lagi agar tidak menjadi 'nodejs_nodejs_...'
client.collectDefaultMetrics({ register });

// Counter: total HTTP requests
const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total jumlah HTTP request',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

// Histogram: durasi HTTP request
const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Durasi HTTP request dalam detik',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'ganti-dengan-secret-kuat';
const MFA_ISSUER = process.env.MFA_ISSUER || 'TrustMarket';
const MFA_TOKEN_EXPIRES_IN = '5m';

// ── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Middleware Prometheus: catat setiap request ───────────────────────────────
app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        // Normalkan path agar tidak terlalu banyak label (cardinality)
        const route = req.route?.path || req.path.replace(/\/[0-9a-f-]{6,}/gi, '/:id') || 'unknown';
        const labels = {
            method: req.method,
            route,
            status_code: res.statusCode,
        };
        httpRequestsTotal.inc(labels);
        end(labels);
    });
    next();
});

const loginLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 detik
    max: 5,
    message: {
        error: 'Terlalu banyak percobaan login.'
    }
});

const mfaLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 menit
    max: 5,
    message: {
        error: 'Terlalu banyak percobaan MFA. Coba lagi beberapa saat.'
    }
});

// ── Helper: ambil IP dari request
function getIP(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '—')
        .split(',')[0].trim();
}

// ── Helper: catat log aktivitas ke DB
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

// Helper MFA: TOTP RFC 6238 tanpa dependensi eksternal.
function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function roleLabel(role) {
    return String(role || '').charAt(0).toUpperCase() + String(role || '').slice(1);
}

function base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let output = '';

    for (const byte of buffer) {
        bits += byte.toString(2).padStart(8, '0');
    }

    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.slice(i, i + 5).padEnd(5, '0');
        output += alphabet[parseInt(chunk, 2)];
    }

    return output;
}

function base32Decode(secret) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanSecret = String(secret || '').replace(/[\s=]/g, '').toUpperCase();
    let bits = '';
    const bytes = [];

    for (const char of cleanSecret) {
        const value = alphabet.indexOf(char);
        if (value === -1) {
            throw new Error('Secret MFA tidak valid.');
        }
        bits += value.toString(2).padStart(5, '0');
    }

    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }

    return Buffer.from(bytes);
}

function generateMfaSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function getMfaEncryptionKey() {
    return crypto
        .createHash('sha256')
        .update(process.env.MFA_SECRET_ENCRYPTION_KEY || JWT_SECRET)
        .digest();
}

function protectMfaSecret(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return [
        'enc',
        iv.toString('base64'),
        tag.toString('base64'),
        encrypted.toString('base64')
    ].join(':');
}

function unprotectMfaSecret(secret) {
    if (!String(secret || '').startsWith('enc:')) {
        return secret;
    }

    const [, iv, tag, encrypted] = String(secret).split(':');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getMfaEncryptionKey(),
        Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

function generateTotp(secret, counter, digits = 6) {
    const key = base32Decode(secret);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter >>> 0, 4);

    const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)
    ) % (10 ** digits);

    return String(code).padStart(digits, '0');
}

function safeCompareCode(inputCode, expectedCode) {
    const inputBuffer = Buffer.from(String(inputCode));
    const expectedBuffer = Buffer.from(String(expectedCode));

    return inputBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function verifyTotp(secret, code, window = 2) {
    const cleanCode = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) return false;

    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    for (let offset = -window; offset <= window; offset++) {
        if (safeCompareCode(cleanCode, generateTotp(secret, currentCounter + offset))) {
            return true;
        }
    }

    return false;
}

function buildOtpAuthUrl(user, secret) {
    const label = encodeURIComponent(`${MFA_ISSUER}:${user.email}`);
    const issuer = encodeURIComponent(MFA_ISSUER);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function createSessionToken(user) {
    return jwt.sign(
        {
            userId: user.user_id,
            role: user.role,
            purpose: 'session'
        },
        JWT_SECRET,
        { expiresIn: '1d' }
    );
}

function createMfaToken(user, setupRequired = false) {
    return jwt.sign(
        {
            userId: user.user_id,
            role: user.role,
            purpose: 'mfa',
            setupRequired
        },
        JWT_SECRET,
        { expiresIn: MFA_TOKEN_EXPIRES_IN }
    );
}

function verifyMfaToken(mfaToken) {
    const decoded = jwt.verify(mfaToken, JWT_SECRET);
    if (decoded.purpose !== 'mfa') {
        throw new Error('Token MFA tidak valid.');
    }
    return decoded;
}

function buildAuthResponse(user, token) {
    return {
        success: true,
        token,
        userId: user.user_id,
        nama: user.nama,
        email: user.email,
        role: user.role,
    };
}

function isTokenError(err) {
    return ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(err.name)
        || err.message === 'Token MFA tidak valid.';
}

// ── Helper: generate ID 
// ── Middleware JWT 
function genId(prefix, num) {
    return `${prefix}-${String(num).padStart(3, '0')}`;
}
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            error: 'Token tidak ditemukan.'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.purpose !== 'session') {
            return res.status(401).json({
                error: 'Token tidak valid.'
            });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            error: 'Token tidak valid.'
        });
    }
}

// ── Inisialisasi tabel (berjalan setiap startup) 
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

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
        ADD COLUMN IF NOT EXISTS mfa_temp_secret TEXT,
        ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMP
    `);

    await pool.query(`
        ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS product_name VARCHAR(255)
    `).catch(() => { });

    await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS gambar TEXT
    `).catch(() => { });
}

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
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { role, email, password } = req.body;
    const ip = getIP(req);

    if (!role || !email || !password)
        return res.status(400).json({ error: 'Role, email, dan password wajib diisi.' });

    try {
        const loginEmail = normalizeEmail(email);
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1', [loginEmail]
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

        const actor = `${user.nama} (${roleLabel(user.role)})`;

        if (user.mfa_enabled && user.mfa_secret) {
            await logActivity('Login', 'INFO', 'Password benar, menunggu verifikasi MFA', actor, ip);
            return res.json({
                success: true,
                mfaRequired: true,
                mfaToken: createMfaToken(user),
                userId: user.user_id,
                nama: user.nama,
                email: user.email,
                role: user.role,
            });
        }

        let mfaSecret = null;
        if (user.mfa_temp_secret) {
            try {
                mfaSecret = unprotectMfaSecret(user.mfa_temp_secret);
                await logActivity('Keamanan', 'INFO', 'Setup MFA dilanjutkan dengan key yang sama', actor, ip);
            } catch (err) {
                console.warn('Gagal membaca temp secret MFA, membuat key setup baru:', err.message);
            }
        }

        if (!mfaSecret) {
            mfaSecret = generateMfaSecret();
            await pool.query(
                'UPDATE users SET mfa_temp_secret = $1 WHERE user_id = $2',
                [protectMfaSecret(mfaSecret), user.user_id]
            );

            await logActivity('Keamanan', 'INFO', 'Setup MFA dimulai setelah password benar', actor, ip);
        }

        return res.json({
            success: true,
            mfaRequired: true,
            mfaSetupRequired: true,
            mfaToken: createMfaToken(user, true),
            mfaSecret,
            otpauthUrl: buildOtpAuthUrl(user, mfaSecret),
            userId: user.user_id,
            nama: user.nama,
            email: user.email,
            role: user.role,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan server.' });
    }
});

// POST /api/auth/mfa/setup/verify
app.post('/api/auth/mfa/setup/verify', mfaLimiter, async (req, res) => {
    const { mfaToken, code } = req.body;
    const ip = getIP(req);

    if (!mfaToken || !code) {
        return res.status(400).json({ error: 'Token MFA dan kode wajib diisi.' });
    }

    try {
        const decoded = verifyMfaToken(mfaToken);
        if (!decoded.setupRequired) {
            return res.status(400).json({ error: 'Token ini bukan untuk setup MFA.' });
        }

        const result = await pool.query(
            'SELECT user_id, nama, email, role, mfa_temp_secret FROM users WHERE user_id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        }

        const user = result.rows[0];
        const actor = `${user.nama} (${roleLabel(user.role)})`;

        if (!user.mfa_temp_secret) {
            return res.status(400).json({ error: 'Setup MFA belum dimulai. Silakan login ulang.' });
        }

        const pendingSecret = unprotectMfaSecret(user.mfa_temp_secret);
        if (!verifyTotp(pendingSecret, code)) {
            await logActivity('Keamanan', 'ERROR', 'Verifikasi setup MFA gagal', actor, ip);
            return res.status(401).json({ error: 'Kode MFA tidak valid.' });
        }

        await pool.query(
            `UPDATE users
             SET mfa_enabled = TRUE,
                 mfa_secret = $1,
                 mfa_temp_secret = NULL,
                 mfa_enabled_at = NOW()
             WHERE user_id = $2`,
            [protectMfaSecret(pendingSecret), user.user_id]
        );

        await logActivity('Keamanan', 'SUCCESS', 'MFA berhasil diaktifkan', actor, ip);
        await logActivity('Login', 'SUCCESS', 'Login berhasil dengan MFA', actor, ip);

        return res.json(buildAuthResponse(user, createSessionToken(user)));
    } catch (err) {
        if (isTokenError(err)) {
            return res.status(401).json({ error: 'Sesi MFA tidak valid atau sudah kedaluwarsa. Silakan login ulang.' });
        }

        console.error(err);
        return res.status(500).json({ error: 'Terjadi kesalahan server.' });
    }
});

// POST /api/auth/mfa/verify
app.post('/api/auth/mfa/verify', mfaLimiter, async (req, res) => {
    const { mfaToken, code } = req.body;
    const ip = getIP(req);

    if (!mfaToken || !code) {
        return res.status(400).json({ error: 'Token MFA dan kode wajib diisi.' });
    }

    try {
        const decoded = verifyMfaToken(mfaToken);
        const result = await pool.query(
            'SELECT user_id, nama, email, role, mfa_enabled, mfa_secret FROM users WHERE user_id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        }

        const user = result.rows[0];
        const actor = `${user.nama} (${roleLabel(user.role)})`;

        if (!user.mfa_enabled || !user.mfa_secret) {
            return res.status(400).json({ error: 'MFA belum aktif. Silakan lakukan setup MFA.' });
        }

        if (!verifyTotp(unprotectMfaSecret(user.mfa_secret), code)) {
            await logActivity('Keamanan', 'ERROR', 'Verifikasi MFA gagal saat login', actor, ip);
            return res.status(401).json({ error: 'Kode MFA tidak valid.' });
        }

        await logActivity('Login', 'SUCCESS', 'Login berhasil dengan MFA', actor, ip);
        return res.json(buildAuthResponse(user, createSessionToken(user)));
    } catch (err) {
        if (isTokenError(err)) {
            return res.status(401).json({ error: 'Sesi MFA tidak valid atau sudah kedaluwarsa. Silakan login ulang.' });
        }

        console.error(err);
        return res.status(500).json({ error: 'Terjadi kesalahan server.' });
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
        const normalizedEmail = normalizeEmail(email);
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (exists.rows.length > 0)
            return res.status(409).json({ error: 'Email sudah terdaftar!' });

        const count = await pool.query('SELECT COUNT(*) FROM users');
        const userId = genId('USR', parseInt(count.rows[0].count) + 1);
        const hash = await bcrypt.hash(password, 10);

        await pool.query(
            'INSERT INTO users (user_id, nama, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)',
            [userId, nama.trim(), normalizedEmail, hash, role]
        );

        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        await logActivity('Pengguna', 'INFO', `Pengguna baru mendaftar: ${nama.trim()} sebagai ${roleLabel}`, normalizedEmail, ip);

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
app.get('/api/users', authMiddleware, async (req, res) => {
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

// POST /api/users
app.post('/api/users', authMiddleware, async (req, res) => {
    const { nama, email, role, status } = req.body;
    const ip = getIP(req);

    if (!nama || !email || !role)
        return res.status(400).json({ error: 'Nama, email, dan role wajib diisi.' });

    try {
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (exists.rows.length > 0)
            return res.status(409).json({ error: 'Email sudah terdaftar!' });

        const count = await pool.query('SELECT COUNT(*) FROM users');
        const userId = genId('USR', parseInt(count.rows[0].count) + 1);
        const hash = await bcrypt.hash('User@123!', 10);

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
app.put('/api/users/:userId', authMiddleware, async (req, res) => {
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
app.delete('/api/users/:userId', authMiddleware, async (req, res) => {
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
app.post('/api/products', authMiddleware, async (req, res) => {
    const { nama, harga, stok, gambar } = req.body;
    const ip = getIP(req);
    const hargaNumber = parseInt(harga, 10);
    const stokNumber = parseInt(stok, 10) || 0;

    if (!nama || Number.isNaN(hargaNumber))
        return res.status(400).json({ error: 'Nama dan harga wajib diisi.' });

    try {
        const count = await pool.query('SELECT COUNT(*) FROM products');
        const productId = genId('PRD', parseInt(count.rows[0].count) + 1);

        await pool.query(
            'INSERT INTO products (product_id, nama, harga, stok, gambar) VALUES ($1,$2,$3,$4,$5)',
            [productId, nama.trim(), hargaNumber, stokNumber, gambar || null]
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
app.put('/api/products/:productId', authMiddleware, async (req, res) => {
    const { productId } = req.params;
    const { nama, harga, stok, gambar } = req.body;
    const ip = getIP(req);
    const hargaNumber = parseInt(harga, 10);
    const stokNumber = parseInt(stok, 10);

    if (!nama || Number.isNaN(hargaNumber) || Number.isNaN(stokNumber)) {
        return res.status(400).json({ error: 'Nama, harga, dan stok wajib diisi dengan benar.' });
    }

    try {
        if (typeof gambar === 'string') {
            await pool.query(
                'UPDATE products SET nama=$1, harga=$2, stok=$3, gambar=$4 WHERE product_id=$5',
                [nama, hargaNumber, stokNumber, gambar || null, productId]
            );
        } else {
            await pool.query(
                'UPDATE products SET nama=$1, harga=$2, stok=$3 WHERE product_id=$4',
                [nama, hargaNumber, stokNumber, productId]
            );
        }

        await logActivity('Produk', 'INFO', `Produk ${productId} diperbarui: ${nama}`, 'Seller', ip);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memperbarui produk.' });
    }
});

// DELETE /api/products/:productId
app.delete('/api/products/:productId', authMiddleware, async (req, res) => {
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
app.post('/api/transactions', authMiddleware, async (req, res) => {
    const { trx_id, product_id, qty, metode, pengiriman, alamat } = req.body;
    const ip = getIP(req);

    if (!trx_id || !product_id || !qty) {
        return res.status(400).json({
            error: 'Data transaksi tidak lengkap.'
        });
    }

    try {

        // Ambil produk dari database
        const prod = await pool.query(
            'SELECT nama, harga, stok FROM products WHERE product_id = $1',
            [product_id]
        );

        // Produk tidak ditemukan
        if (prod.rows.length === 0) {
            return res.status(404).json({
                error: 'Produk tidak ditemukan.'
            });
        }

        const product = prod.rows[0];

        // Cek stok
        if (product.stok < qty) {
            return res.status(400).json({
                error: 'Stok tidak mencukupi.'
            });
        }

        // HITUNG DI SERVER
        const total_harga = product.harga * qty;

        // Simpan transaksi
        await pool.query(
            `INSERT INTO transactions
            (trx_id, product_name, qty, total_harga, status, metode, pengiriman, alamat)
            VALUES ($1,$2,$3,$4,'Diproses',$5,$6,$7)`,

            [
                trx_id,
                product.nama,
                parseInt(qty),
                parseInt(total_harga),
                metode,
                pengiriman,
                alamat
            ]
        );

        // Kurangi stok
        await pool.query(
            'UPDATE products SET stok = stok - $1 WHERE product_id = $2',
            [qty, product_id]
        );

        await logActivity(
            'Transaksi',
            'SUCCESS',
            `Checkout berhasil — ${trx_id} (${product.nama})`,
            'Pembeli (User)',
            ip
        );

        const newTrx = await pool.query(
            'SELECT * FROM transactions WHERE trx_id = $1',
            [trx_id]
        );

        // ================= TELEGRAM =================
        try {
            const chatId = '7153610515';
            const pesan = `
        🛒 Transaksi Berhasil

        ID: ${trx_id}
        Produk: ${product.nama}
        Qty: ${qty}
        Total: Rp${total_harga}
        Status: Diproses
        `;

            await sendNotifikasi(chatId, pesan);

        } catch (err) {
            console.error('Gagal kirim telegram:', err.message);
        }
        // ============================================
        res.json(newTrx.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memproses transaksi.' });
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
app.get('/api/logs', authMiddleware, async (req, res) => {
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

// ── Prometheus Metrics endpoint ──────────────────────────────
// Diakses oleh Prometheus scraper (tidak perlu auth)
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err.message);
    }
});

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`TrustMarket API berjalan di port ${PORT}`);
    await ensureTables();
    await seedInitialData();
});
