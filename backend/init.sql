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
    gambar      TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS gambar TEXT,
  ADD COLUMN IF NOT EXISTS deskripsi TEXT,
  ADD COLUMN IF NOT EXISTS seller_id VARCHAR(20) REFERENCES users(user_id);


-- Tabel transaksi
CREATE TABLE IF NOT EXISTS transactions (
    id           SERIAL PRIMARY KEY,
    trx_id       VARCHAR(20)  UNIQUE NOT NULL,
    qty          INTEGER      NOT NULL,
    total_harga  BIGINT       NOT NULL,
    status       VARCHAR(50)  NOT NULL DEFAULT 'Diproses',
    metode       VARCHAR(100),
    pengiriman   VARCHAR(50),
    alamat       TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
);

ALTER TABLE transactions
  ADD COLUMN user_id VARCHAR(20) REFERENCES users(user_id);

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

CREATE TABLE detail_transaksi (
  id          SERIAL PRIMARY KEY,
  id_transaksi VARCHAR(20) REFERENCES transactions(trx_id),
  id_produk   VARCHAR(20) REFERENCES products(product_id),
  jumlah      INTEGER NOT NULL,
  subtotal    BIGINT NOT NULL
);

CREATE TABLE telegram_bot (
  id_telegram      SERIAL PRIMARY KEY,
  user_id          VARCHAR(20) REFERENCES users(user_id),
  username_telegram VARCHAR(255),
  status_aktif     BOOLEAN DEFAULT true,
  chat_id          VARCHAR(100)
);

CREATE TABLE notifikasi (
  id_notifikasi   SERIAL PRIMARY KEY,
  id_telegram     INTEGER REFERENCES telegram_bot(id_telegram),
  trx_id          VARCHAR(20) REFERENCES transactions(trx_id),
  jenis_notifikasi VARCHAR(100),
  pesan           TEXT,
  status_kirim    VARCHAR(50) DEFAULT 'pending',
  waktu_kirim     TIMESTAMP
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
