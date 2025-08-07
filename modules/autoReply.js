const database = require('./database');
const Logger = require('./logger');

class AutoReply {
    constructor() {
        this.cache = new Map(); // serverId -> enabled
    }

    async getConfig(serverId) {
        if (!serverId) return true; // Default for DMs
        
        if (this.cache.has(serverId)) {
            return this.cache.get(serverId);
        }
        
        try {
            const sql = 'SELECT auto_reply_enabled FROM server_config WHERE server_id = ?';
            const rows = await database.query(sql, [serverId]);
            
            const enabled = rows.length > 0 ? rows[0].auto_reply_enabled : true;
            this.cache.set(serverId, enabled);
            return enabled;
        } catch (error) {
            Logger.error('Failed to get auto-reply config', error.message);
            return true; // Default fallback
        }
    }

    async shouldReply(message, clientUserId) {
        const enabled = await this.getConfig(message.guild?.id);
        if (!enabled || message.author.id === clientUserId) return false;
        
        const content = message.content.toLowerCase();
        
        // Don't reply to leaderboard commands
        if (content.includes('-leaderboard')) return false;
        
        return content.includes('cowsay') || content.includes('cow say');
    }

    async toggle(serverId) {
        if (!serverId) return true; // Can't toggle DMs
        
        try {
            const currentEnabled = await this.getConfig(serverId);
            const newEnabled = !currentEnabled;
            
            const sql = `INSERT INTO server_config (server_id, auto_reply_enabled) 
                        VALUES (?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        auto_reply_enabled = VALUES(auto_reply_enabled), 
                        updated_at = CURRENT_TIMESTAMP`;
            
            await database.query(sql, [serverId, newEnabled]);
            this.cache.set(serverId, newEnabled);
            return newEnabled;
        } catch (error) {
            Logger.error('Failed to toggle auto-reply', error.message);
            return await this.getConfig(serverId);
        }
    }

    async isEnabled(serverId) {
        return await this.getConfig(serverId);
    }
}

module.exports = new AutoReply();