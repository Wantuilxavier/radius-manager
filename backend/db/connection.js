const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'radius',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'radius',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Banco de dados conectado com sucesso');
    conn.release();
  } catch (err) {
    console.error('❌ Erro ao conectar no banco:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
