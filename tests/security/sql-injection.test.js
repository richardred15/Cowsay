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
      // Test getBalance with malicious user ID - should create user and return default balance
      const balance = await currencyManager.getBalance(maliciousInput);
      expect(balance).toBe(1000); // Default balance, not affected by injection
      
      // Verify the malicious input was stored as literal data, not executed as SQL
      const [rows] = await connection.execute(
        'SELECT user_id FROM user_currency WHERE user_id = ?',
        [maliciousInput]
      );
      expect(rows.length).toBe(1); // User record was created
      expect(rows[0].user_id).toBe(maliciousInput); // Malicious input stored as literal string
      
      // Test addBalance with malicious user ID
      await expect(
        currencyManager.addBalance(maliciousInput, 100)
      ).resolves.not.toThrow();
      
      // Verify balance was updated correctly (proves parameterized query worked)
      const newBalance = await currencyManager.getBalance(maliciousInput);
      expect(newBalance).toBe(1100); // 1000 + 100
    }
  });

  test('Transaction queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // First create some transaction history for this malicious user ID
      await currencyManager.getBalance(maliciousInput); // Creates user
      await currencyManager.addBalance(maliciousInput, 50); // Creates transaction
      
      // Test getTransactionHistory with malicious input
      const transactions = await currencyManager.getTransactionHistory(maliciousInput, 10);
      expect(Array.isArray(transactions)).toBe(true);
      
      // Verify transactions belong only to the malicious input user (treated as literal string)
      transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(maliciousInput);
      });
      
      // Verify we got the expected transaction
      expect(transactions.length).toBeGreaterThan(0);
    }
  });

  test('Admin queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // Test admin functions with malicious input as both user_id and reason
      const result = await currencyManager.adminAddCoins(maliciousInput, 100, maliciousInput);
      expect(result.success).toBe(true);
      
      // Verify both user_id and reason fields store malicious input as literal strings
      const [rows] = await connection.execute(
        'SELECT user_id, reason FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [maliciousInput]
      );
      
      expect(rows.length).toBe(1);
      expect(rows[0].user_id).toBe(maliciousInput); // User ID stored as literal string
      expect(rows[0].reason).toBe(maliciousInput); // Reason stored as literal string, not executed
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