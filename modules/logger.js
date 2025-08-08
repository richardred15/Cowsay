// Centralized logging module to replace console.log usage
const SecurityUtils = require('./security');

class Logger {
    static log(level, message, data = null) {
        try {
            const timestamp = new Date().toISOString();
            const sanitizedMessage = SecurityUtils.sanitizeForLog(message);
            
            let logEntry = `[${timestamp}] ${level.toUpperCase()}: ${sanitizedMessage}`;
            
            if (data) {
                try {
                    const sanitizedData = SecurityUtils.sanitizeForLog(JSON.stringify(data));
                    logEntry += ` | Data: ${sanitizedData}`;
                } catch (jsonError) {
                    logEntry += ` | Data: [JSON stringify failed: ${jsonError.message}]`;
                }
            }
            
            // Use appropriate console method based on level
            switch (level.toLowerCase()) {
                case 'error':
                    console.error(logEntry);
                    break;
                case 'warn':
                    console.warn(logEntry);
                    break;
                case 'info':
                    console.info(logEntry);
                    break;
                default:
                    console.log(logEntry);
            }
        } catch (error) {
            // Fallback logging without sanitization if all else fails
            console.log(`[${new Date().toISOString()}] LOGGER_ERROR: ${error.message} | Original: ${message}`);
        }
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