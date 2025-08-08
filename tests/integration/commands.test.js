const { setupTestDatabase } = require('../fixtures/db-setup');

describe('Command Integration Tests', () => {
  let mockMessage;
  let currencyManager;

  beforeAll(async () => {
    await setupTestDatabase();
    
    const database = require('../../modules/database');
    await database.init();
    
    currencyManager = require('../../modules/currencyManager');
  });

  beforeEach(() => {
    mockMessage = {
      author: { id: '123456789', username: 'testuser' },
      channel: { send: jest.fn() },
      reply: jest.fn(),
      content: ''
    };
  });

  describe('Balance Commands', () => {
    test('!cowsay balance should return user balance', async () => {
      const balance = await currencyManager.getBalance('123456789');
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });

    test('!cowsay daily should process daily bonus', async () => {
      const result = await currencyManager.getDailyBonus('123456789');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });

    test('!cowsay leaderboard should return top players', async () => {
      const leaderboard = await currencyManager.getLeaderboard(5);
      expect(Array.isArray(leaderboard)).toBe(true);
      expect(leaderboard.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Transaction Commands', () => {
    test('!cowsay transactions should return user history', async () => {
      const transactions = await currencyManager.getTransactionHistory('123456789', 10);
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeLessThanOrEqual(10);
    });

    test('should award coins correctly', async () => {
      const initialBalance = await currencyManager.getBalance('123456789');
      const result = await currencyManager.awardCoins('123456789', 50, 'Test reward');
      
      expect(result.awarded).toBe(50);
      expect(result.newBalance).toBe(initialBalance + 50);
    });

    test('should spend coins correctly', async () => {
      await currencyManager.awardCoins('123456789', 100, 'Setup');
      const success = await currencyManager.spendCoins('123456789', 50, 'Test purchase');
      
      expect(success).toBe(true);
    });
  });

  describe('Admin Commands', () => {
    test('admin add coins should work', async () => {
      const result = await currencyManager.adminAddCoins('123456789', 200, 'Admin test');
      expect(result.success).toBe(true);
      expect(result.newBalance).toBeGreaterThan(0);
    });

    test('admin remove coins should work', async () => {
      await currencyManager.adminAddCoins('123456789', 300, 'Setup');
      const result = await currencyManager.adminRemoveCoins('123456789', 100, 'Admin test');
      
      expect(result.success).toBe(true);
      expect(result.actualAmount).toBe(100);
    });
  });

  describe('Boost System', () => {
    test('should activate daily boost', async () => {
      const userId = '123456789';
      
      // Ensure user exists first
      await currencyManager.createUser(userId);
      
      const success = await currencyManager.activateDailyBoost(userId);
      expect(success).toBe(true);
      
      const hasBoost = await currencyManager.hasDailyBoost(userId);
      expect(hasBoost).toBe(true);
    });

    test('should add streak shield', async () => {
      const userId = '123456789';
      
      // Ensure user exists first
      await currencyManager.createUser(userId);
      
      const success = await currencyManager.addStreakShield(userId, 1);
      expect(success).toBe(true);
      
      const hasShield = await currencyManager.hasStreakShield(userId);
      expect(hasShield).toBe(true);
    });

    test('should get boost status', async () => {
      const userId = '123456789';
      
      // Ensure user exists first
      await currencyManager.createUser(userId);
      
      const status = await currencyManager.getBoostStatus(userId);
      expect(status).toHaveProperty('dailyBoost');
      expect(status).toHaveProperty('streakShields');
    });
  });
});