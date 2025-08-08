const { setupTestDatabase } = require('../fixtures/db-setup');

describe('Shop Integration Tests', () => {
  let currencyManager;
  let database;

  beforeAll(async () => {
    await setupTestDatabase();
    
    database = require('../../modules/database');
    await database.init();
    
    currencyManager = require('../../modules/currencyManager');
  });

  beforeEach(async () => {
    // Give test user enough coins for purchases
    await currencyManager.adminAddCoins('123456789', 2000, 'Test setup');
  });

  describe('Shop Items', () => {
    test('should retrieve shop items', async () => {
      const items = await database.query('SELECT * FROM shop_items');
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      
      // Verify item structure
      items.forEach(item => {
        expect(item).toHaveProperty('item_id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('price');
        expect(item).toHaveProperty('category');
      });
    });

    test('should have valid item prices', async () => {
      const items = await database.query('SELECT * FROM shop_items');
      
      items.forEach(item => {
        expect(item.price).toBeGreaterThan(0);
        expect(typeof item.price).toBe('number');
      });
    });
  });

  describe('Purchase Flow', () => {
    test('should complete successful purchase', async () => {
      const userId = '123456789';
      const itemId = 'dragon';
      const itemPrice = 500;
      
      // Check initial balance
      const initialBalance = await currencyManager.getBalance(userId);
      expect(initialBalance).toBeGreaterThanOrEqual(itemPrice);
      
      // Make purchase
      const success = await currencyManager.spendCoins(userId, itemPrice, `Purchase: ${itemId}`);
      expect(success).toBe(true);
      
      // Verify balance updated
      const newBalance = await currencyManager.getBalance(userId);
      expect(newBalance).toBe(initialBalance - itemPrice);
      
      // Add to inventory
      await database.query(
        'INSERT INTO user_inventory (user_id, item_id, acquisition_method) VALUES (?, ?, ?)',
        [userId, itemId, 'purchase']
      );
      
      // Verify inventory
      const inventory = await database.query(
        'SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [userId, itemId]
      );
      expect(inventory.length).toBe(1);
    });

    test('should prevent purchase with insufficient funds', async () => {
      const userId = '999999999'; // New user with default balance
      const itemPrice = 2000; // More than default balance
      
      const balance = await currencyManager.getBalance(userId);
      expect(balance).toBeLessThan(itemPrice);
      
      const success = await currencyManager.spendCoins(userId, itemPrice, 'Expensive item');
      expect(success).toBe(false);
    });
  });

  describe('Inventory Management', () => {
    test('should track item ownership', async () => {
      const userId = '123456789';
      const itemId = 'tux';
      
      // Add item to inventory
      await database.query(
        'INSERT IGNORE INTO user_inventory (user_id, item_id, acquisition_method) VALUES (?, ?, ?)',
        [userId, itemId, 'purchase']
      );
      
      // Check ownership
      const owned = await database.query(
        'SELECT COUNT(*) as count FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [userId, itemId]
      );
      expect(owned[0].count).toBe(1);
    });

    test('should prevent duplicate purchases', async () => {
      const userId = '123456789';
      const itemId = 'dragon';
      
      // First purchase
      await database.query(
        'INSERT IGNORE INTO user_inventory (user_id, item_id, acquisition_method) VALUES (?, ?, ?)',
        [userId, itemId, 'purchase']
      );
      
      // Attempt duplicate
      await database.query(
        'INSERT IGNORE INTO user_inventory (user_id, item_id, acquisition_method) VALUES (?, ?, ?)',
        [userId, itemId, 'purchase']
      );
      
      // Should still only have one
      const count = await database.query(
        'SELECT COUNT(*) as count FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [userId, itemId]
      );
      expect(count[0].count).toBe(1);
    });
  });

  describe('Gift System', () => {
    test('should process gift transaction', async () => {
      const senderId = '123456789';
      const recipientId = '987654321';
      const itemId = 'tux';
      const giftCost = 330; // 300 + 10% fee
      
      // Sender purchases and gifts
      const success = await currencyManager.spendCoins(senderId, giftCost, `Gift: ${itemId}`);
      expect(success).toBe(true);
      
      // Log gift transaction
      await database.query(
        'INSERT INTO gift_transactions (sender_id, recipient_id, item_id, cost, message) VALUES (?, ?, ?, ?, ?)',
        [senderId, recipientId, itemId, giftCost, 'Test gift']
      );
      
      // Add to recipient inventory
      await database.query(
        'INSERT INTO user_inventory (user_id, item_id, acquisition_method, source_user_id) VALUES (?, ?, ?, ?)',
        [recipientId, itemId, 'gift', senderId]
      );
      
      // Verify gift logged
      const gifts = await database.query(
        'SELECT * FROM gift_transactions WHERE sender_id = ? AND recipient_id = ?',
        [senderId, recipientId]
      );
      expect(gifts.length).toBeGreaterThan(0);
    });
  });
});