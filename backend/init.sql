-- ============================================================
-- TrustMarket Database Init Script
-- ============================================================

-- Tabel pengguna
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(20)  UNIQUE NOT NULL,
    nama        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(50)  NOT NULL DEFAULT 'user',
    status      VARCHAR(50)  NOT NULL DEFAULT 'Aktif',
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Tabel produk
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    product_id  VARCHAR(20)  UNIQUE NOT NULL,
    nama        VARCHAR(255) NOT NULL,
    harga       BIGINT       NOT NULL,
    stok        INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Tabel transaksi
CREATE TABLE IF NOT EXISTS transactions (
    id           SERIAL PRIMARY KEY,
    trx_id       VARCHAR(20)  UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    qty          INTEGER      NOT NULL,
    total_harga  BIGINT       NOT NULL,
    status       VARCHAR(50)  NOT NULL DEFAULT 'Diproses',
    metode       VARCHAR(100),
    pengiriman   VARCHAR(50),
    alamat       TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
);

-- Tabel log aktivitas sistem
CREATE TABLE IF NOT EXISTS system_logs (
    id         SERIAL PRIMARY KEY,
    type       VARCHAR(50)  NOT NULL,
    severity   VARCHAR(20)  NOT NULL,
    activity   TEXT         NOT NULL,
    actor      VARCHAR(255) NOT NULL DEFAULT 'Sistem',
    ip_address VARCHAR(45)  NOT NULL DEFAULT '—',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Seed: Produk awal
-- ============================================================
INSERT INTO products (product_id, nama, harga, stok) VALUES
    ('PRD-001', 'Sepatu Kets Retro',      250000, 12),
    ('PRD-002', 'Kemeja Flanel Original', 150000,  8),
    ('PRD-003', 'Kacamata Hitam Y2K',     120000,  5),
    ('PRD-004', 'Headphone Wireless',     450000,  3)
ON CONFLICT (product_id) DO NOTHING;

-- ============================================================
-- Seed: Pengguna sampel (password: User@123!)
-- hash bcrypt dari 'User@123!' di-generate saat startup backend
-- Admin di-seed lewat kode startup server.js
-- ============================================================
