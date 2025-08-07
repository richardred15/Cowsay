// Centralized logging module to replace console.log usage
const SecurityUtils = require('./security');

class Logger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const sanitizedMessage = SecurityUtils.sanitizeForLog(message);
        
        let logEntry = `[${timestamp}] ${level.toUpperCase()}: ${sanitizedMessage}`;
        
        if (data) {
            const sanitizedData = SecurityUtils.sanitizeForLog(JSON.stringify(data));
            logEntry += ` | Data: ${sanitizedData}`;
        }
        
        console.log(logEntry);
    }

    static info(message, data) {
        this.log('info', message, data);
    }

    static error(message, data) {
        this.log('error', message, data);
    }

    static warn(message, data) {
        this.log('warn', message, data);
    }

    static debug(message, data) {
        // Only log debug if environment variable is set
        if (process.env.DEBUG_LOGGING === 'true') {
            this.log('debug', message, data);
        }
    }
}

module.exports = Logger;