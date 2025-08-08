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

  test('Game reward operations resist SQL injection', async () => {
    const currencyManager = require('../../modules/currencyManager');
    
    // Count tables before test
    const [tablesBefore] = await connection.execute('SHOW TABLES');
    const tableCountBefore = tablesBefore.length;
    
    for (const maliciousInput of maliciousInputs) {
      // Test awardCoins (used by games) with malicious user ID and reason
      const result = await currencyManager.awardCoins(maliciousInput, 100, maliciousInput);
      
      // Should return valid result object
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('awarded');
      expect(result).toHaveProperty('newBalance');
      
      // Check if user record was created
      const [userRows] = await connection.execute(
        'SELECT user_id FROM user_currency WHERE user_id = ?',
        [maliciousInput]
      );
      
      if (userRows.length > 0) {
        // If record exists, verify malicious input stored as literal string
        expect(userRows[0].user_id).toBe(maliciousInput);
      }
      
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
    
    // Use a known valid user ID to create baseline transactions with awardCoins
    const validUserId = '123456789';
    
    console.log('=== DEBUGGING TRANSACTION TEST ===');
    console.log('Calling awardCoins for user:', validUserId);
    const awardResult = await currencyManager.awardCoins(validUserId, 50, 'Test reward');
    console.log('awardCoins result:', awardResult);
    
    console.log('Checking user balance...');
    const balance = await currencyManager.getBalance(validUserId);
    console.log('User balance:', balance);
    
    console.log('Checking transaction history...');
    const baselineTransactions = await currencyManager.getTransactionHistory(validUserId, 10);
    console.log('Transaction count:', baselineTransactions.length);
    console.log('Transactions:', baselineTransactions);
    
    // Check database directly
    console.log('Checking database directly...');
    const [dbTransactions] = await connection.execute(
      'SELECT * FROM coin_transactions WHERE user_id = ?',
      [validUserId]
    );
    console.log('DB transaction count:', dbTransactions.length);
    console.log('DB transactions:', dbTransactions);
    
    // Force debug info into test failure if needed
    if (baselineTransactions.length === 0) {
      throw new Error(`Transaction test setup failed:\n` +
        `awardCoins result: ${JSON.stringify(awardResult)}\n` +
        `User balance: ${balance}\n` +
        `Transaction history length: ${baselineTransactions.length}\n` +
        `DB transaction count: ${dbTransactions.length}\n` +
        `DB transactions: ${JSON.stringify(dbTransactions)}`);
    }
    
    expect(baselineTransactions.length).toBeGreaterThan(0); // Ensure test setup worked
    
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
    
    for (const maliciousInput of maliciousInputs) {
      // Count transactions before this specific test
      const [transactionsBefore] = await connection.execute('SELECT COUNT(*) as count FROM coin_transactions');
      const transactionCountBefore = transactionsBefore[0].count;
      
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
      
      // Transaction count should only increase by 0 or 1 for this iteration
      expect(transactionCountAfter).toBeGreaterThanOrEqual(transactionCountBefore);
      expect(transactionCountAfter - transactionCountBefore).toBeLessThanOrEqual(1);
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