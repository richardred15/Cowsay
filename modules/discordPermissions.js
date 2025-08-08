const database = require('./database');
const Logger = require('./logger');

class DiscordPermissions {
    constructor() {
        this.cache = new Map(); // serverId -> role mappings
        this.PERMISSION_LEVELS = {
            ADMIN: 'admin',
            MODERATOR: 'moderator', 
            HELPER: 'helper',
            USER: 'user'
        };
    }

    async getRoleMappings(serverId) {
        if (!serverId) return new Map();
        
        if (this.cache.has(serverId)) {
            return this.cache.get(serverId);
        }
        
        try {
            const sql = 'SELECT role_id, permission_level FROM server_role_permissions WHERE server_id = ?';
            const rows = await database.query(sql, [serverId]);
            
            const mappings = new Map();
            rows.forEach(row => {
                mappings.set(row.role_id, row.permission_level);
            });
            
            this.cache.set(serverId, mappings);
            return mappings;
        } catch (error) {
            Logger.error('Failed to get role mappings', error.message);
            return new Map();
        }
    }

    async setRoleMapping(serverId, roleId, permissionLevel) {
        if (!serverId || !roleId || !permissionLevel) return false;
        
        try {
            const sql = `INSERT INTO server_role_permissions (server_id, role_id, permission_level) 
                        VALUES (?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        permission_level = VALUES(permission_level), 
                        updated_at = CURRENT_TIMESTAMP`;
            
            await database.query(sql, [serverId, roleId, permissionLevel]);
            
            // Update cache
            const mappings = await this.getRoleMappings(serverId);
            mappings.set(roleId, permissionLevel);
            this.cache.set(serverId, mappings);
            
            Logger.info(`Set role ${roleId} to ${permissionLevel} in server ${serverId}`);
            return true;
        } catch (error) {
            Logger.error('Failed to set role mapping', error.message);
            return false;
        }
    }

    async removeRoleMapping(serverId, roleId) {
        if (!serverId || !roleId) return false;
        
        try {
            const sql = 'DELETE FROM server_role_permissions WHERE server_id = ? AND role_id = ?';
            const result = await database.query(sql, [serverId, roleId]);
            
            if (result.affectedRows > 0) {
                // Update cache
                const mappings = await this.getRoleMappings(serverId);
                mappings.delete(roleId);
                this.cache.set(serverId, mappings);
                
                Logger.info(`Removed role mapping ${roleId} from server ${serverId}`);
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('Failed to remove role mapping', error.message);
            return false;
        }
    }

    async getUserPermissionLevel(message) {
        const member = message.member;
        const guild = message.guild;
        
        if (!member || !guild) return this.PERMISSION_LEVELS.USER;
        
        // Server owner gets admin automatically
        if (guild.ownerId === member.id) {
            return this.PERMISSION_LEVELS.ADMIN;
        }
        
        // Check Discord built-in permissions
        if (member.permissions.has('Administrator')) {
            return this.PERMISSION_LEVELS.ADMIN;
        }
        
        if (member.permissions.has('ManageGuild')) {
            return this.PERMISSION_LEVELS.MODERATOR;
        }
        
        if (member.permissions.has('ManageMessages')) {
            return this.PERMISSION_LEVELS.HELPER;
        }
        
        // Check custom role mappings
        const roleMappings = await this.getRoleMappings(guild.id);
        let highestLevel = this.PERMISSION_LEVELS.USER;
        
        for (const role of member.roles.cache.values()) {
            const mappedLevel = roleMappings.get(role.id);
            if (mappedLevel) {
                if (this.isHigherPermission(mappedLevel, highestLevel)) {
                    highestLevel = mappedLevel;
                }
            }
        }
        
        return highestLevel;
    }

    isHigherPermission(level1, level2) {
        const hierarchy = {
            [this.PERMISSION_LEVELS.ADMIN]: 4,
            [this.PERMISSION_LEVELS.MODERATOR]: 3,
            [this.PERMISSION_LEVELS.HELPER]: 2,
            [this.PERMISSION_LEVELS.USER]: 1
        };
        
        return hierarchy[level1] > hierarchy[level2];
    }

    async hasPermission(message, requiredLevel) {
        const userLevel = await this.getUserPermissionLevel(message);
        return this.isHigherPermission(userLevel, requiredLevel) || userLevel === requiredLevel;
    }

    getPermissionError(requiredLevel) {
        const levelDescriptions = {
            [this.PERMISSION_LEVELS.ADMIN]: 'Administrator permission or designated admin role',
            [this.PERMISSION_LEVELS.MODERATOR]: 'Manage Server permission or designated moderator role',
            [this.PERMISSION_LEVELS.HELPER]: 'Manage Messages permission or designated helper role'
        };
        
        return `❌ This command requires: ${levelDescriptions[requiredLevel] || 'special permissions'}`;
    }
}

module.exports = new DiscordPermissions();