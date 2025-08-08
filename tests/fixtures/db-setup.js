const mysql = require('mysql2/promise');

async function setupTestDatabase() {
  // Create connection without database to drop/create it
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'test_password'
  });

  try {
    const dbName = process.env.DB_NAME || 'cowsay_test';
    
    // Drop and recreate database for clean slate
    await connection.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await connection.execute(`CREATE DATABASE \`${dbName}\``);
    
    console.log('Test database created - schema will be handled by database.js');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}



if (require.main === module) {
  setupTestDatabase();
}

module.exports = { setupTestDatabase };