const database = require('./database');
const Logger = require('./logger');

class RivalManager {
    constructor() {
        this.cache = new Map(); // serverId -> rivals array
    }

    async getRivals(serverId) {
        if (!serverId) return [];
        
        if (this.cache.has(serverId)) {
            return this.cache.get(serverId);
        }
        
        try {
            const sql = 'SELECT rival_id, rival_name, description FROM server_rivals WHERE server_id = ?';
            const rows = await database.query(sql, [serverId]);
            
            const rivals = rows.map(row => ({
                id: row.rival_id,
                name: row.rival_name,
                description: row.description
            }));
            
            this.cache.set(serverId, rivals);
            return rivals;
        } catch (error) {
            Logger.error('Failed to get rivals', error.message);
            return [];
        }
    }

    async addRival(serverId, rivalId, rivalName, description) {
        if (!serverId || !rivalId) return false;
        
        try {
            const sql = `INSERT INTO server_rivals (server_id, rival_id, rival_name, description) 
                        VALUES (?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        rival_name = VALUES(rival_name), 
                        description = VALUES(description), 
                        updated_at = CURRENT_TIMESTAMP`;
            
            await database.query(sql, [serverId, rivalId, rivalName, description]);
            
            // Update cache
            const rivals = await this.getRivals(serverId);
            const existingIndex = rivals.findIndex(r => r.id === rivalId);
            const newRival = { id: rivalId, name: rivalName, description };
            
            if (existingIndex >= 0) {
                rivals[existingIndex] = newRival;
            } else {
                rivals.push(newRival);
            }
            
            this.cache.set(serverId, rivals);
            Logger.info(`Added rival ${rivalName} to server ${serverId}`);
            return true;
        } catch (error) {
            Logger.error('Failed to add rival', error.message);
            return false;
        }
    }

    async removeRival(serverId, rivalId) {
        if (!serverId || !rivalId) return false;
        
        try {
            const sql = 'DELETE FROM server_rivals WHERE server_id = ? AND rival_id = ?';
            const result = await database.query(sql, [serverId, rivalId]);
            
            if (result.affectedRows > 0) {
                // Update cache
                const rivals = await this.getRivals(serverId);
                const filtered = rivals.filter(r => r.id !== rivalId);
                this.cache.set(serverId, filtered);
                Logger.info(`Removed rival ${rivalId} from server ${serverId}`);
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('Failed to remove rival', error.message);
            return false;
        }
    }

    async isRival(serverId, userId) {
        const rivals = await this.getRivals(serverId);
        return rivals.some(r => r.id === userId);
    }

    async getRivalByName(serverId, name) {
        const rivals = await this.getRivals(serverId);
        return rivals.find(r => r.name.toLowerCase() === name.toLowerCase());
    }
}

module.exports = new RivalManager();