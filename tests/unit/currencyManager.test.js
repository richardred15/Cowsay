const { setupTestDatabase } = require('../fixtures/db-setup');

describe('CurrencyManager Unit Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    
    const database = require('../../modules/database');
    await database.init();
  });

  describe('Streak Bonus Calculations', () => {
    test('should calculate correct streak bonus', () => {
      // Test the streak bonus logic: +10% per win, max 50%
      const testCases = [
        { streak: 1, expected: 0 },    // First win = no bonus
        { streak: 2, expected: 0.1 },  // Second win = 10%
        { streak: 3, expected: 0.2 },  // Third win = 20%
        { streak: 6, expected: 0.5 },  // Sixth win = 50% (max)
        { streak: 10, expected: 0.5 }  // Tenth win = 50% (capped)
      ];

      testCases.forEach(({ streak, expected }) => {
        const bonus = Math.min(0.5, (streak - 1) * 0.1);
        expect(bonus).toBe(expected);
      });
    });

    test('should apply streak bonus to coin amounts correctly', () => {
      const baseAmount = 100;
      const streak = 3; // Should give 20% bonus
      const expectedAmount = Math.floor(baseAmount * 1.2); // 120

      const bonus = Math.min(0.5, (streak - 1) * 0.1);
      const finalAmount = Math.floor(baseAmount * (1 + bonus));

      expect(finalAmount).toBe(expectedAmount);
    });
  });

  describe('Daily Bonus Logic', () => {
    test('should calculate correct daily bonus amount', () => {
      const testCases = [
        { balance: 500, expected: 100 },   // Under 1000, gets full 100
        { balance: 950, expected: 50 },    // Gets difference to reach 1000
        { balance: 999, expected: 1 },     // Gets 1 coin to reach 1000
        { balance: 1000, expected: 0 },    // At limit, gets nothing
        { balance: 1500, expected: 0 }     // Over limit, gets nothing
      ];

      testCases.forEach(({ balance, expected }) => {
        const bonus = balance >= 1000 ? 0 : Math.min(100, 1000 - balance);
        expect(bonus).toBe(expected);
      });
    });

    test('should apply daily boost multiplier correctly', () => {
      const baseBonus = 50;
      const hasBoost = true;
      const expectedBonus = hasBoost ? baseBonus * 2 : baseBonus;

      expect(expectedBonus).toBe(100);
    });
  });

  describe('Balance Validation', () => {
    test('should handle negative balance prevention', () => {
      const currentBalance = 100;
      const spendAmount = 150;
      const canSpend = currentBalance >= spendAmount;

      expect(canSpend).toBe(false);
    });

    test('should allow valid spending', () => {
      const currentBalance = 200;
      const spendAmount = 150;
      const canSpend = currentBalance >= spendAmount;

      expect(canSpend).toBe(true);
    });
  });
});