const Logger = require('./logger');
const SecurityUtils = require('./security');

class MemberCache {
    constructor() {
        this.cache = new Map(); // username -> displayName
        this.lastUpdate = 0;
        this.updateInterval = 60 * 60 * 1000; // 1 hour
    }

    async updateCache(guild, requestingUser = null) {
        try {
            // Only allow authorized users to trigger cache updates
            if (requestingUser) {
                const authorized = await SecurityUtils.validateAuthorization(
                    { member: requestingUser, guild }, 
                    'moderator'
                );
                if (!authorized) {
                    Logger.error('Unauthorized member cache update attempt');
                    return false;
                }
            }
            
            Logger.info('Updating member cache');
            const members = await guild.members.fetch();
            this.cache.clear();
            
            let count = 0;
            const maxMembers = Math.min(10000, members.size); // Limit iterations
            for (const [, member] of members) {
                if (count >= maxMembers) break;
                this.cache.set(member.user.username.toLowerCase(), member.displayName || member.user.username);
                count++;
            }
            
            this.lastUpdate = Date.now();
            Logger.info(`Member cache updated: ${this.cache.size} members`);
            return true;
        } catch (error) {
            Logger.error('Failed to update member cache', error.message.substring(0, 100));
            return false;
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