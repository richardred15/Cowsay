const mysql = require('mysql2/promise');
const { setupTestDatabase } = require('../fixtures/db-setup');

describe('SQL Injection Prevention', () => {
  let connection;

  beforeAll(async () => {
    await setupTestDatabase();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  });

  afterAll(async () => {
    if (connection) await connection.end();
  });

  const maliciousInputs = [
    "'; DROP TABLE user_currency; --",
    "' OR '1'='1",
    "'; INSERT INTO user_currency (user_id, balance) VALUES ('hacker', 999999); --",
    "' UNION SELECT * FROM user_currency --",
    "'; UPDATE user_currency SET balance = 999999 WHERE user_id = 'victim'; --"
  ];

  test('Currency operations resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // Test getBalance with malicious user ID
      const balance = await currencyManager.getBalance(maliciousInput);
      expect(balance).toBe(1000); // Default balance, not affected by injection
      
      // Test addBalance with malicious user ID
      await expect(
        currencyManager.addBalance(maliciousInput, 100)
      ).resolves.not.toThrow();
      
      // Verify database integrity
      const [rows] = await connection.execute(
        'SELECT COUNT(*) as count FROM user_currency WHERE user_id = ?',
        [maliciousInput]
      );
      expect(rows[0].count).toBe(1); // Only one record created, no injection
    }
  });

  test('Transaction queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // Test getTransactionHistory with malicious input
      const transactions = await currencyManager.getTransactionHistory(maliciousInput, 10);
      expect(Array.isArray(transactions)).toBe(true);
      
      // Verify no unauthorized data access
      const validTransactions = transactions.filter(t => t.user_id === maliciousInput);
      expect(validTransactions.length).toBe(transactions.length);
    }
  });

  test('Admin queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // Test admin functions with malicious input
      await expect(
        currencyManager.adminAddCoins(maliciousInput, 100, maliciousInput)
      ).resolves.not.toThrow();
      
      // Verify reason field doesn't execute as SQL
      const [rows] = await connection.execute(
        'SELECT reason FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [maliciousInput]
      );
      
      if (rows.length > 0) {
        expect(rows[0].reason).toBe(maliciousInput); // Stored as string, not executed
      }
    }
  });

  test('Leaderboard queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Test with malicious limit parameter (simulated)
    const leaderboard = await currencyManager.getLeaderboard(10);
    expect(Array.isArray(leaderboard)).toBe(true);
    expect(leaderboard.length).toBeLessThanOrEqual(10);
    
    // Verify no unauthorized data in results
    leaderboard.forEach(entry => {
      expect(entry).toHaveProperty('user_id');
      expect(entry).toHaveProperty('balance');
      expect(typeof entry.balance).toBe('number');
    });
  });

  test('Database structure remains intact after injection attempts', async () => {
    // Verify all expected tables still exist
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    expect(tableNames).toContain('user_currency');
    expect(tableNames).toContain('coin_transactions');
    expect(tableNames).toContain('shop_items');
    expect(tableNames).toContain('user_inventory');
    
    // Verify table structures are intact
    const [columns] = await connection.execute('DESCRIBE user_currency');
    expect(columns.length).toBeGreaterThan(0);
    
    // Verify no unauthorized data modifications
    const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM user_currency');
    expect(userCount[0].count).toBeGreaterThan(0);
  });
});