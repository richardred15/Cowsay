const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function setupTestDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'test_password',
    database: process.env.DB_NAME || 'cowsay_test'
  });

  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../../schema.json');
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    
    // Create tables based on schema
    const createTables = [
      `CREATE TABLE IF NOT EXISTS user_currency (
        user_id VARCHAR(50) PRIMARY KEY,
        balance INT DEFAULT 1000,
        last_daily DATE,
        win_streak INT DEFAULT 0,
        last_win DATE,
        total_earned BIGINT DEFAULT 0,
        daily_boost_expires DATETIME,
        streak_shield_count INT DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS coin_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        amount INT NOT NULL,
        reason VARCHAR(100) NOT NULL,
        balance_before INT NOT NULL,
        balance_after INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS shop_items (
        item_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT,
        unlocked_by_default BOOLEAN DEFAULT FALSE
      )`,
      `CREATE TABLE IF NOT EXISTS user_inventory (
        user_id VARCHAR(50) NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        acquisition_method ENUM('purchase', 'gift', 'reward', 'admin') DEFAULT 'purchase',
        source_user_id VARCHAR(50),
        PRIMARY KEY (user_id, item_id)
      )`,
      `CREATE TABLE IF NOT EXISTS gift_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id VARCHAR(50) NOT NULL,
        recipient_id VARCHAR(50) NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        gift_cost INT NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_wishlists (
        user_id VARCHAR(50) NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        message TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_id)
      )`
    ];

    for (const query of createTables) {
      await connection.execute(query);
    }

    // Insert test data
    await insertTestData(connection);
    
    console.log('Test database setup complete');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

async function insertTestData(connection) {
  // Test shop items
  const shopItems = [
    ['dragon', 'Dragon', 500, 'characters', 'Fierce dragon ASCII art', false],
    ['tux', 'Tux', 300, 'characters', 'Linux penguin mascot', false],
    ['daily_boost', 'Daily Boost', 1000, 'boosts', '2x daily bonus for 7 days', false],
    ['streak_shield', 'Streak Shield', 1500, 'boosts', 'Protects win streak from one loss', false]
  ];

  for (const item of shopItems) {
    await connection.execute(
      'INSERT IGNORE INTO shop_items (item_id, name, price, category, description, unlocked_by_default) VALUES (?, ?, ?, ?, ?, ?)',
      item
    );
  }

  // Test users
  await connection.execute(
    'INSERT IGNORE INTO user_currency (user_id, balance, win_streak, total_earned) VALUES (?, ?, ?, ?)',
    ['123456789', 1500, 3, 2000]
  );
}

if (require.main === module) {
  setupTestDatabase();
}

module.exports = { setupTestDatabase };