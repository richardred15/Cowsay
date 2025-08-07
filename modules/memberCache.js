const Logger = require('./logger');
const SecurityUtils = require('./security');

class MemberCache {
    constructor() {
        this.cache = new Map(); // username -> displayName
        this.lastUpdate = 0;
        this.updateInterval = 60 * 60 * 1000; // 1 hour
    }

    async updateCache(guild) {
        try {
            Logger.info('Updating member cache');
            const members = await guild.members.fetch();
            this.cache.clear();
            
            let count = 0;
            members.forEach(member => {
                if (count < 10000) { // Prevent potential DoS from large member lists
                    this.cache.set(member.user.username.toLowerCase(), member.displayName || member.user.username);
                    count++;
                }
            });
            
            this.lastUpdate = Date.now();
            Logger.info(`Member cache updated: ${this.cache.size} members`);
        } catch (error) {
            Logger.error('Failed to update member cache', error.message);
        }
    }

    async ensureCache(guild) {
        if (Date.now() - this.lastUpdate > this.updateInterval || this.cache.size === 0) {
            await this.updateCache(guild);
        }
    }

    getDisplayName(username) {
        return this.cache.get(username.toLowerCase()) || username;
    }

    replaceUsernamesWithDisplayNames(text, guild) {
        if (!guild || !text) return text;
        
        try {
            const usernameRegex = /([a-zA-Z0-9._]+)(?=\s*::\s*Level)/g;
            return text.replace(usernameRegex, (match, username) => {
                const sanitizedUsername = SecurityUtils.sanitizeForDisplay(username);
                return this.getDisplayName(sanitizedUsername);
            });
        } catch (error) {
            Logger.error('Username replacement error', error.message);
            return text;
        }
    }
}

module.exports = new MemberCache();