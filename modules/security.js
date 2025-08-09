// Security utilities for input sanitization, validation, and authorization
class SecurityUtils {
    // Sanitize user input for logging to prevent log injection
    static sanitizeForLog(input) {
        if (typeof input !== 'string') {
            input = String(input);
        }
        return input
            .replace(/[\r\n]/g, ' ')  // Remove newlines
            .replace(/[^\x20-\x7E]/g, '?')  // Replace non-printable chars
            .substring(0, 200);  // Limit length
    }

    // Sanitize user input for display to prevent XSS
    static sanitizeForDisplay(input) {
        if (typeof input !== 'string') {
            input = String(input);
        }
        return input
            .replace(/[<>&"']/g, (char) => {
                const entities = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
                return entities[char];
            });
    }

    // Sanitize player names for games
    static sanitizePlayerName(name) {
        if (!name) return 'Unknown';
        return this.sanitizeForDisplay(String(name))
            .replace(/[<>@#&!\r\n\t]/g, '')
            .replace(/[^\x20-\x7E]/g, '')
            .substring(0, 32);
    }

    // Validate user input length and content
    static validateInput(input, maxLength = 2000) {
        if (!input || typeof input !== 'string') {
            return { valid: false, error: 'Invalid input' };
        }
        if (input.length > maxLength) {
            return { valid: false, error: `Input too long (max ${maxLength} characters)` };
        }
        return { valid: true };
    }

    // Rate limiting helper with cleanup
    static createRateLimiter(maxRequests = 5, windowMs = 60000) {
        const requests = new Map();
        
        // Cleanup old entries every 5 minutes
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [userId, userRequests] of requests.entries()) {
                const validRequests = userRequests.filter(time => now - time < windowMs);
                if (validRequests.length === 0) {
                    requests.delete(userId);
                } else {
                    requests.set(userId, validRequests);
                }
            }
        }, 300000);
        
        return (userId) => {
            const now = Date.now();
            const userRequests = requests.get(userId) || [];
            
            // Clean old requests
            const validRequests = userRequests.filter(time => now - time < windowMs);
            
            if (validRequests.length >= maxRequests) {
                return false;
            }
            
            validRequests.push(now);
            requests.set(userId, validRequests);
            return true;
        };
    }

    // Validate user authorization for sensitive operations
    static async validateAuthorization(message, requiredLevel = 'user') {
        try {
            const discordPermissions = require('./discordPermissions');
            const userLevel = await discordPermissions.getUserPermissionLevel(message);
            
            const levels = { user: 0, helper: 1, moderator: 2, admin: 3, owner: 4 };
            const userLevelNum = levels[userLevel] || 0;
            const requiredLevelNum = levels[requiredLevel] || 0;
            
            return userLevelNum >= requiredLevelNum;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Authorization validation error', { 
                error: error.message.substring(0, 100),
                userId: message?.author?.id,
                guildId: message?.guild?.id
            });
            return false;
        }
    }
}

module.exports = SecurityUtils;