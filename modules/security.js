// Security utilities for input sanitization and validation
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

    // Rate limiting helper
    static createRateLimiter(maxRequests = 5, windowMs = 60000) {
        const requests = new Map();
        
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
}

module.exports = SecurityUtils;