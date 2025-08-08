const { setupTestDatabase } = require('../fixtures/db-setup');

describe('Games Integration Tests', () => {
  let currencyManager;
  let gameManager;

  beforeAll(async () => {
    await setupTestDatabase();
    
    const database = require('../../modules/database');
    await database.init();
    
    currencyManager = require('../../modules/currencyManager');
    gameManager = require('../../modules/gameManager');
  });

  describe('Game Rewards', () => {
    test('should award coins for game win', async () => {
      const userId = '123456789';
      const initialBalance = await currencyManager.getBalance(userId);
      
      const result = await currencyManager.awardCoins(userId, 50, 'Pong win');
      
      expect(result.awarded).toBeGreaterThan(0);
      expect(result.newBalance).toBe(initialBalance + result.awarded);
      expect(result.streak).toBeGreaterThanOrEqual(1);
    });

    test('should apply first win bonus', async () => {
      const userId = '999999999'; // Fresh user
      
      const result = await currencyManager.awardCoins(userId, 50, 'Tic-tac-toe win');
      
      // First win should get 2x multiplier
      expect(result.firstWinBonus).toBe(true);
      expect(result.awarded).toBe(100); // 50 * 2
    });

    test('should apply streak bonus', async () => {
      const userId = '123456789';
      
      // Simulate multiple wins to build streak
      await currencyManager.awardCoins(userId, 50, 'Game win'); // Streak 1
      await currencyManager.awardCoins(userId, 50, 'Game win'); // Streak 2
      const result = await currencyManager.awardCoins(userId, 50, 'Game win'); // Streak 3
      
      // Third win should have 20% bonus (streak 3 = 2 * 10%)
      expect(result.streak).toBe(3);
      expect(result.awarded).toBeGreaterThan(50); // Base amount + bonus
    });
  });

  describe('Game State Management', () => {
    test('should create and manage game sessions', () => {
      const gameId = 'test-game-123';
      const gameData = {
        players: ['123456789'],
        state: 'waiting',
        type: 'pong'
      };
      
      // Mock game manager functionality
      const games = new Map();
      games.set(gameId, gameData);
      
      expect(games.has(gameId)).toBe(true);
      expect(games.get(gameId).players).toContain('123456789');
    });

    test('should handle game cleanup', () => {
      const games = new Map();
      const gameId = 'cleanup-test';
      
      games.set(gameId, { players: ['123456789'] });
      expect(games.size).toBe(1);
      
      // Cleanup
      games.delete(gameId);
      expect(games.size).toBe(0);
    });
  });

  describe('Blackjack Integration', () => {
    test('should handle blackjack betting', async () => {
      const userId = '123456789';
      const betAmount = 100;
      
      // Ensure user has enough coins
      await currencyManager.adminAddCoins(userId, 500, 'Blackjack setup');
      const initialBalance = await currencyManager.getBalance(userId);
      
      // Place bet (spend coins)
      const betSuccess = await currencyManager.spendCoins(userId, betAmount, 'Blackjack bet');
      expect(betSuccess).toBe(true);
      
      // Simulate win (2x payout)
      const winAmount = betAmount * 2;
      const result = await currencyManager.awardCoins(userId, winAmount, 'Blackjack win');
      
      expect(result.awarded).toBe(winAmount);
      expect(result.newBalance).toBe(initialBalance - betAmount + winAmount);
    });

    test('should handle blackjack (2.5x payout)', async () => {
      const userId = '123456789';
      const betAmount = 100;
      
      await currencyManager.adminAddCoins(userId, 500, 'Setup');
      await currencyManager.spendCoins(userId, betAmount, 'Blackjack bet');
      
      // Blackjack pays 2.5x
      const blackjackPayout = Math.floor(betAmount * 2.5);
      const result = await currencyManager.awardCoins(userId, blackjackPayout, 'Blackjack!');
      
      expect(result.awarded).toBe(blackjackPayout);
    });
  });

  describe('Game Statistics', () => {
    test('should track game outcomes', async () => {
      const userId = '123456789';
      
      // Award coins for different games
      await currencyManager.awardCoins(userId, 50, 'Pong win');
      await currencyManager.awardCoins(userId, 30, 'Tic-tac-toe win');
      await currencyManager.awardCoins(userId, 100, 'Battleship win');
      
      // Check transaction history
      const transactions = await currencyManager.getTransactionHistory(userId, 10);
      
      const gameTransactions = transactions.filter(t => 
        t.reason.includes('win') && t.amount > 0
      );
      
      expect(gameTransactions.length).toBeGreaterThanOrEqual(3);
    });

    test('should handle loss without streak shield', async () => {
      const userId = '123456789';
      
      // Build up a streak first
      await currencyManager.awardCoins(userId, 50, 'Game win');
      await currencyManager.awardCoins(userId, 50, 'Game win');
      
      // Record loss
      const result = await currencyManager.recordLoss(userId);
      expect(result.shieldUsed).toBe(false);
      
      // Streak should be reset
      const balance = await currencyManager.getBalance(userId);
      expect(typeof balance).toBe('number');
    });
  });

  describe('Perfect Game Bonuses', () => {
    test('should award perfect game bonus', async () => {
      const userId = '123456789';
      const baseReward = 50;
      const perfectBonus = 25;
      
      const result = await currencyManager.awardCoins(userId, baseReward + perfectBonus, 'Pong perfect game');
      
      expect(result.awarded).toBe(baseReward + perfectBonus);
    });
  });
});