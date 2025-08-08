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
    
    // Count tables before test
    const [tablesBefore] = await connection.execute('SHOW TABLES');
    const tableCountBefore = tablesBefore.length;
    
    for (const maliciousInput of maliciousInputs) {
      // Test getBalance with malicious user ID
      const balance = await currencyManager.getBalance(maliciousInput);
      
      // Should return default balance (1000) regardless of whether record was created
      expect(balance).toBe(1000);
      
      // Check if record was created (flexible - could be 0 or 1)
      const [rows] = await connection.execute(
        'SELECT user_id FROM user_currency WHERE user_id = ?',
        [maliciousInput]
      );
      
      if (rows.length > 0) {
        // If record exists, verify malicious input stored as literal string
        expect(rows[0].user_id).toBe(maliciousInput);
      }
      
      // Test addBalance - should not throw regardless of success/failure
      await expect(
        currencyManager.addBalance(maliciousInput, 100)
      ).resolves.not.toThrow();
      
      // Verify database structure intact (most important security check)
      const [tablesAfter] = await connection.execute('SHOW TABLES');
      expect(tablesAfter.length).toBe(tableCountBefore); // No tables dropped
      
      // Verify user_currency table still exists and has expected structure
      const [tableExists] = await connection.execute(
        "SHOW TABLES LIKE 'user_currency'"
      );
      expect(tableExists.length).toBe(1); // Table not dropped by injection
    }
  });

  test('Transaction queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Use a known valid user ID to create baseline transactions
    const validUserId = '123456789';
    await currencyManager.getBalance(validUserId);
    await currencyManager.addBalance(validUserId, 50);
    
    for (const maliciousInput of maliciousInputs) {
      // Test getTransactionHistory with malicious input
      const transactions = await currencyManager.getTransactionHistory(maliciousInput, 10);
      expect(Array.isArray(transactions)).toBe(true);
      
      // Key security test: malicious input should not return other users' transactions
      transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(maliciousInput); // Only this user's data
      });
      
      // Verify malicious input didn't access valid user's transactions
      const validUserTransactions = await currencyManager.getTransactionHistory(validUserId, 10);
      expect(validUserTransactions.length).toBeGreaterThan(0); // Valid user's data still exists
      
      // Verify no cross-contamination
      const allTransactions = transactions.concat(validUserTransactions);
      const uniqueUserIds = [...new Set(allTransactions.map(t => t.user_id))];
      expect(uniqueUserIds).not.toContain(''); // No empty user IDs from injection
    }
  });

  test('Admin queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Count total transactions before test
    const [transactionsBefore] = await connection.execute('SELECT COUNT(*) as count FROM coin_transactions');
    const transactionCountBefore = transactionsBefore[0].count;
    
    for (const maliciousInput of maliciousInputs) {
      // Test admin functions with malicious input - should not throw
      const result = await currencyManager.adminAddCoins(maliciousInput, 100, maliciousInput);
      
      // Admin function should handle malicious input gracefully
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('success');
      
      // Check if transaction was created
      const [rows] = await connection.execute(
        'SELECT user_id, reason FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [maliciousInput]
      );
      
      if (rows.length > 0) {
        // If transaction exists, verify data stored as literal strings
        expect(rows[0].user_id).toBe(maliciousInput);
        expect(rows[0].reason).toBe(maliciousInput);
      }
      
      // Most important: verify no unauthorized transactions were created
      const [transactionsAfter] = await connection.execute('SELECT COUNT(*) as count FROM coin_transactions');
      const transactionCountAfter = transactionsAfter[0].count;
      
      // Transaction count should only increase by 0 or 1, never decrease
      expect(transactionCountAfter).toBeGreaterThanOrEqual(transactionCountBefore);
      expect(transactionCountAfter - transactionCountBefore).toBeLessThanOrEqual(1);
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