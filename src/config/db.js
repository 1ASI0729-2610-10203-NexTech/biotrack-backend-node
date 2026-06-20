const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'biotrack',
  user: process.env.DB_USER || 'biotrack_user',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('DB pool error:', err.message, err.code)
})

module.exports = pool
