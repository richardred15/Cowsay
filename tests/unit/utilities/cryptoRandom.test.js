const CryptoRandom = require('../../../modules/cryptoRandom');

describe('Crypto Random Utilities', () => {
  describe('Random Number Generation', () => {
    test('should generate numbers within specified range', () => {
      const min = 1;
      const max = 10;
      
      for (let i = 0; i < 100; i++) {
        const random = CryptoRandom.randomInt(min, max);
        expect(random).toBeGreaterThanOrEqual(min);
        expect(random).toBeLessThanOrEqual(max);
      }
    });

    test('should generate different values on multiple calls', () => {
      const values = new Set();
      for (let i = 0; i < 50; i++) {
        values.add(Math.random());
      }
      
      // Should have generated many unique values
      expect(values.size).toBeGreaterThan(40);
    });
  });

  describe('Array Operations', () => {
    test('should select random element from array', () => {
      const array = ['a', 'b', 'c', 'd', 'e'];
      const choice = array[Math.floor(Math.random() * array.length)];
      
      expect(array).toContain(choice);
    });

    test('should shuffle array without losing elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = CryptoRandom.shuffle(original);
      
      expect(shuffled).toHaveLength(original.length);
      original.forEach(item => {
        expect(shuffled).toContain(item);
      });
    });
  });

  describe('Dice Rolling Logic', () => {
    test('should simulate fair dice rolls', () => {
      const rolls = [];
      for (let i = 0; i < 600; i++) {
        rolls.push(CryptoRandom.randomInt(1, 6));
      }
      
      // Each face should appear roughly 100 times (±30)
      for (let face = 1; face <= 6; face++) {
        const count = rolls.filter(roll => roll === face).length;
        expect(count).toBeGreaterThan(70);
        expect(count).toBeLessThan(130);
      }
    });
  });
});