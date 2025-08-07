const dataStore = require('./dataStore');
const Logger = require('./logger');

class AutoReply {
    constructor() {
        this.enabled = true;
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const config = await dataStore.load('config');
            if (config && typeof config.autoReplyEnabled === 'boolean') {
                this.enabled = config.autoReplyEnabled;
            }
            Logger.info('Auto-reply config loaded', { enabled: this.enabled });
        } catch (error) {
            Logger.error('Failed to load auto-reply config', error.message);
        }
    }

    async saveConfig() {
        try {
            const existingConfig = await dataStore.load('config') || {};
            await dataStore.save('config', { ...existingConfig, autoReplyEnabled: this.enabled });
            Logger.info('Auto-reply config saved', { enabled: this.enabled });
        } catch (error) {
            Logger.error('Failed to save auto-reply config', error.message);
        }
    }

    shouldReply(message, clientUserId) {
        if (!this.enabled || message.author.id === clientUserId) return false;
        
        const content = message.content.toLowerCase();
        
        // Don't reply to leaderboard commands
        if (content.includes('-leaderboard')) return false;
        
        return content.includes('cowsay') || content.includes('cow say');
    }

    async toggle() {
        this.enabled = !this.enabled;
        await this.saveConfig();
        return this.enabled;
    }

    isEnabled() {
        return this.enabled;
    }
}

module.exports = new AutoReply();