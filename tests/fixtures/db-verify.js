const mysql = require('mysql2/promise');

async function verifyDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'test_password',
    database: process.env.DB_NAME || 'cowsay_test'
  });

  try {
    // Test basic connectivity
    await connection.execute('SELECT 1');
    
    // Verify key tables exist
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    const requiredTables = ['user_currency', 'coin_transactions', 'shop_items', 'user_inventory'];
    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        throw new Error(`Required table ${table} not found`);
      }
    }
    
    // Test a simple query
    await connection.execute('SELECT COUNT(*) FROM user_currency');
    
    console.log('Database verification successful');
  } catch (error) {
    console.error('Database verification failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  verifyDatabase();
}

module.exports = { verifyDatabase };