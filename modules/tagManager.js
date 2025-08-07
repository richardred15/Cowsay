const dataStore = require('./dataStore');
const Logger = require('./logger');
const SecurityUtils = require('./security');

class TagManager {
    constructor() {
        this.dailyTags = new Map(); // userId -> { date, count }
        this.tagHistory = new Map(); // userId -> [{ timestamp, reason }]
        this.maxTagsPerDay = 1;
        this.loadData();
    }

    async loadData() {
        try {
            const dailyData = await dataStore.load('daily_tags');
            const historyData = await dataStore.load('tag_history');
            
            if (dailyData) {
                this.dailyTags = new Map(Object.entries(dailyData));
            }
            if (historyData) {
                this.tagHistory = new Map(Object.entries(historyData));
            }
            
            Logger.info('Tag data loaded', { dailyEntries: this.dailyTags.size, historyEntries: this.tagHistory.size });
        } catch (error) {
            Logger.error('Failed to load tag data:', error);
            // Initialize with empty data if loading fails
            this.dailyTags = new Map();
            this.tagHistory = new Map();
        }
    }

    async saveData() {
        await dataStore.save('daily_tags', Object.fromEntries(this.dailyTags));
        await dataStore.save('tag_history', Object.fromEntries(this.tagHistory));
    }

    canTagUser(userId) {
        const today = new Date().toDateString();
        const userTags = this.dailyTags.get(userId);
        
        if (!userTags || userTags.date !== today) {
            return true;
        }
        
        return userTags.count < this.maxTagsPerDay;
    }

    recordTag(userId, reason) {
        const today = new Date().toDateString();
        
        // Update daily count
        const userTags = this.dailyTags.get(userId) || { date: today, count: 0 };
        if (userTags.date !== today) {
            userTags.date = today;
            userTags.count = 0;
        }
        userTags.count++;
        this.dailyTags.set(userId, userTags);

        // Update history
        if (!this.tagHistory.has(userId)) {
            this.tagHistory.set(userId, []);
        }
        this.tagHistory.get(userId).push({
            timestamp: Date.now(),
            reason: reason
        });

        // Save to disk
        this.saveData();
    }

    getAvailableTags(memberCache, guild) {
        if (!guild) return [];
        
        try {
            const availableTags = [];
            let count = 0;
            
            for (const [username, displayName] of memberCache.cache) {
                if (count >= 50) break; // Limit to prevent performance issues
                
                const member = guild.members.cache.find(m => 
                    m.user.username.toLowerCase() === username.toLowerCase()
                );
                
                if (member && this.canTagUser(member.user.id)) {
                    availableTags.push({
                        username: SecurityUtils.sanitizeForDisplay(username),
                        displayName: SecurityUtils.sanitizeForDisplay(displayName),
                        userId: member.user.id,
                        tag: `<@${member.user.id}>`
                    });
                }
                count++;
            }
            
            return availableTags;
        } catch (error) {
            Logger.error('Error getting available tags', error.message);
            return [];
        }
    }

    generateTagContext(availableTags) {
        if (availableTags.length === 0) {
            return "No tags available today (daily limit reached for all users).";
        }
        
        const tagList = availableTags.map(t => `${t.displayName} (${t.tag})`).join(', ');
        return `Available tags today: ${tagList}. Use sparingly for meaningful moments only.`;
    }

    processTagsInMessage(message, availableTags) {
        let processedMessage = message;
        const usedTags = [];
        
        for (const tagInfo of availableTags) {
            if (message.includes(tagInfo.tag)) {
                this.recordTag(tagInfo.userId, 'leaderboard_commentary');
                usedTags.push(tagInfo);
            }
        }
        
        return { processedMessage, usedTags };
    }

    cleanupOldData() {
        try {
            const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
            let changed = false;
            let processedCount = 0;
            
            for (const [userId, history] of this.tagHistory) {
                if (processedCount >= 1000) break; // Prevent excessive processing
                
                const filtered = history.filter(entry => entry.timestamp > threeDaysAgo);
                if (filtered.length === 0) {
                    this.tagHistory.delete(userId);
                    changed = true;
                } else if (filtered.length !== history.length) {
                    this.tagHistory.set(userId, filtered);
                    changed = true;
                }
                processedCount++;
            }
            
            if (changed) {
                this.saveData();
                Logger.info('Tag data cleanup completed', { processedCount });
            }
        } catch (error) {
            Logger.error('Tag cleanup error', error.message);
        }
    }
}

module.exports = new TagManager();