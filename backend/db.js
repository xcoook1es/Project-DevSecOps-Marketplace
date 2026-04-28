const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'trustmarket',
    user:     process.env.DB_USER     || 'trustmarket',
    password: process.env.DB_PASSWORD || 'trustmarket_secret',
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client', err);
});

module.exports = pool;
