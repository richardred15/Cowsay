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

  test('Admin commands resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Count tables before test
    const [tablesBefore] = await connection.execute('SHOW TABLES');
    const tableCountBefore = tablesBefore.length;
    
    const validUserId = '987654321';
    
    for (const maliciousInput of maliciousInputs) {
      // Test admin commands with malicious reason strings (user-controlled input)
      const result = await currencyManager.adminAddCoins(validUserId, 100, maliciousInput);
      
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('success');
      
      // Verify malicious reason stored as literal string
      const [rows] = await connection.execute(
        'SELECT reason FROM coin_transactions WHERE user_id = ? AND reason = ? ORDER BY created_at DESC LIMIT 1',
        [validUserId, maliciousInput]
      );
      
      if (rows.length > 0) {
        expect(rows[0].reason).toBe(maliciousInput);
      }
      
      // Verify database structure intact
      const [tablesAfter] = await connection.execute('SHOW TABLES');
      expect(tablesAfter.length).toBe(tableCountBefore);
      
      const [tableExists] = await connection.execute(
        "SHOW TABLES LIKE 'user_currency'"
      );
      expect(tableExists.length).toBe(1);
    }
  });

  test('Transaction queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Create baseline transaction using admin command (user-facing entry point)
    const validUserId = '123456789';
    await currencyManager.adminAddCoins(validUserId, 50, 'Test setup');
    
    const baselineTransactions = await currencyManager.getTransactionHistory(validUserId, 10);
    expect(baselineTransactions.length).toBeGreaterThan(0);
    
    for (const maliciousInput of maliciousInputs) {
      // Test getTransactionHistory with malicious user ID
      const transactions = await currencyManager.getTransactionHistory(maliciousInput, 10);
      expect(Array.isArray(transactions)).toBe(true);
      
      // Key security test: malicious input should not return other users' transactions
      transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(maliciousInput);
      });
      
      // Verify valid user's data still exists and wasn't affected
      const validUserTransactions = await currencyManager.getTransactionHistory(validUserId, 10);
      expect(validUserTransactions.length).toBeGreaterThan(0);
    }
  });

  test('Admin transaction queries resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Create baseline data
    const validUserId = '555666777';
    await currencyManager.adminAddCoins(validUserId, 200, 'Setup transaction');
    
    // Test getAllTransactions (admin function)
    const allTransactions = await currencyManager.getAllTransactions(50);
    expect(Array.isArray(allTransactions)).toBe(true);
    expect(allTransactions.length).toBeGreaterThan(0);
    
    // Verify transaction data integrity
    allTransactions.forEach(transaction => {
      expect(transaction).toHaveProperty('user_id');
      expect(transaction).toHaveProperty('amount');
      expect(transaction).toHaveProperty('reason');
      expect(typeof transaction.amount).toBe('number');
    });
    
    // Test admin balance queries with malicious user IDs
    for (const maliciousInput of maliciousInputs) {
      const balance = await currencyManager.getBalance(maliciousInput);
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    }
  });

  test('Shop operations resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    for (const maliciousInput of maliciousInputs) {
      // Test spendCoins (used by shop) with malicious user ID and reason
      await currencyManager.awardCoins(maliciousInput, 200, 'Setup coins'); // Give coins first
      
      const success = await currencyManager.spendCoins(maliciousInput, 100, maliciousInput);
      expect(typeof success).toBe('boolean');
      
      // Verify transaction was logged with malicious input as literal data
      const [rows] = await connection.execute(
        'SELECT user_id, reason FROM coin_transactions WHERE user_id = ? AND amount < 0 ORDER BY created_at DESC LIMIT 1',
        [maliciousInput]
      );
      
      if (rows.length > 0) {
        expect(rows[0].user_id).toBe(maliciousInput);
        expect(rows[0].reason).toBe(maliciousInput);
      }
    }
    
    // Test getLeaderboard (read-only but still important)
    const leaderboard = await currencyManager.getLeaderboard(10);
    expect(Array.isArray(leaderboard)).toBe(true);
    expect(leaderboard.length).toBeLessThanOrEqual(10);
    
    // Verify no unauthorized data in results
    leaderboard.forEach(entry => {
      expect(entry).toHaveProperty('userId');
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