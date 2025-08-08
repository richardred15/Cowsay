const Logger = require('./logger');

class SecureLogger {
    static sanitizeInput(input) {
        if (typeof input !== 'string') {
            return String(input);
        }
        
        // Remove control characters and potential log injection patterns
        return input
            .replace(/[\r\n\t]/g, ' ')  // Replace newlines/tabs with spaces
            .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters
            .substring(0, 200); // Limit length
    }

    static info(message, data = {}) {
        const sanitizedMessage = this.sanitizeInput(message);
        const sanitizedData = {};
        
        for (const [key, value] of Object.entries(data)) {
            sanitizedData[key] = this.sanitizeInput(value);
        }
        
        Logger.info(sanitizedMessage, sanitizedData);
    }

    static error(message, data = {}) {
        const sanitizedMessage = this.sanitizeInput(message);
        const sanitizedData = {};
        
        for (const [key, value] of Object.entries(data)) {
            sanitizedData[key] = this.sanitizeInput(value);
        }
        
        Logger.error(sanitizedMessage, sanitizedData);
    }

    static debug(message, data = {}) {
        const sanitizedMessage = this.sanitizeInput(message);
        const sanitizedData = {};
        
        for (const [key, value] of Object.entries(data)) {
            sanitizedData[key] = this.sanitizeInput(value);
        }
        
        Logger.debug(sanitizedMessage, sanitizedData);
    }
}

module.exports = SecureLogger;