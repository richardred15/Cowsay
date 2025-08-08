const database = require('./database');
const Logger = require('./logger');

class InventoryManager {
    async getUserInventory(userId, category = null) {
        try {
            let query = `
                SELECT ui.*, si.name, si.price, si.category, si.description 
                FROM user_inventory ui 
                JOIN shop_items si ON ui.item_id = si.item_id 
                WHERE ui.user_id = ?
            `;
            const params = [userId];

            if (category) {
                query += ' AND si.category = ?';
                params.push(category);
            }

            query += ' ORDER BY ui.acquired_date DESC';
            return await database.query(query, params);
        } catch (error) {
            Logger.error('Failed to get user inventory', error.message);
            return [];
        }
    }

    async hasItem(userId, itemId) {
        try {
            const result = await database.query(
                'SELECT 1 FROM user_inventory WHERE user_id = ? AND item_id = ?',
                [userId, itemId]
            );
            return result.length > 0;
        } catch (error) {
            Logger.error('Failed to check item ownership', error.message);
            return false;
        }
    }

    async addToInventory(userId, itemId, method = 'purchase', giftedBy = null) {
        try {
            await database.query(
                'INSERT INTO user_inventory (user_id, item_id, acquired_method, gifted_by) VALUES (?, ?, ?, ?)',
                [userId, itemId, method, giftedBy]
            );
            Logger.info(`Added item ${itemId} to ${userId}'s inventory via ${method}`);
            return true;
        } catch (error) {
            Logger.error('Failed to add item to inventory', error.message);
            return false;
        }
    }

    async getInventoryStats(userId) {
        try {
            const stats = await database.query(`
                SELECT 
                    si.category,
                    COUNT(*) as count,
                    SUM(si.price) as total_value
                FROM user_inventory ui 
                JOIN shop_items si ON ui.item_id = si.item_id 
                WHERE ui.user_id = ? 
                GROUP BY si.category
            `, [userId]);
            
            return stats;
        } catch (error) {
            Logger.error('Failed to get inventory stats', error.message);
            return [];
        }
    }

    async getItemsByMethod(userId, method) {
        try {
            const items = await database.query(`
                SELECT ui.*, si.name, si.category 
                FROM user_inventory ui 
                JOIN shop_items si ON ui.item_id = si.item_id 
                WHERE ui.user_id = ? AND ui.acquired_method = ?
                ORDER BY ui.acquired_date DESC
            `, [userId, method]);
            
            return items;
        } catch (error) {
            Logger.error('Failed to get items by method', error.message);
            return [];
        }
    }
}

module.exports = new InventoryManager();