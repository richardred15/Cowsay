// Rate limiting to prevent abuse
const Logger = require('./logger');

class RateLimiter {
    constructor() {
        this.userRequests = new Map();
        this.globalRequests = [];
        this.userLimit = 10; // requests per minute per user
        this.globalLimit = 100; // requests per minute globally
        this.windowMs = 60000; // 1 minute
        
        // Start periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, this.windowMs);
    }

    checkUserLimit(userId) {
        const now = Date.now();
        const userRequests = this.userRequests.get(userId) || [];
        
        // Clean old requests
        const validRequests = userRequests.filter(time => now - time < this.windowMs);
        
        if (validRequests.length >= this.userLimit) {
            Logger.warn('User rate limit exceeded', { userId, requests: validRequests.length });
            return false;
        }
        
        validRequests.push(now);
        this.userRequests.set(userId, validRequests);
        return true;
    }

    checkGlobalLimit() {
        const now = Date.now();
        
        // Clean old requests
        this.globalRequests = this.globalRequests.filter(time => now - time < this.windowMs);
        
        if (this.globalRequests.length >= this.globalLimit) {
            Logger.warn('Global rate limit exceeded', { requests: this.globalRequests.length });
            return false;
        }
        
        this.globalRequests.push(now);
        return true;
    }

    checkLimits(userId) {
        return this.checkUserLimit(userId) && this.checkGlobalLimit();
    }

    cleanup() {
        const now = Date.now();
        
        // Clean up user requests
        for (const [userId, requests] of this.userRequests) {
            const validRequests = requests.filter(time => now - time < this.windowMs);
            if (validRequests.length === 0) {
                this.userRequests.delete(userId);
            } else {
                this.userRequests.set(userId, validRequests);
            }
        }
        
        // Clean up global requests
        this.globalRequests = this.globalRequests.filter(time => now - time < this.windowMs);
    }
}

module.exports = new RateLimiter();