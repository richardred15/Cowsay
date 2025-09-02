const SecurityUtils = require('./security');
const Logger = require('./logger');

class CommandRouter {
    constructor() {
        this.routes = new Map();
        this.middlewares = [];
    }

    // Add middleware for all commands
    use(middleware) {
        this.middlewares.push(middleware);
    }

    // Register a command handler
    register(pattern, handler, options = {}) {
        this.routes.set(pattern, {
            handler,
            requiresAuth: options.requiresAuth || false,
            authLevel: options.authLevel || 'user',
            rateLimit: options.rateLimit || false
        });
    }

    // Route a message to appropriate handler
    async route(message) {
        try {
            // Apply middlewares
            for (const middleware of this.middlewares) {
                const result = await middleware(message);
                if (result === false) return false; // Middleware blocked request
            }

            // Find matching route
            for (const [pattern, config] of this.routes) {
                if (this.matchesPattern(message.content, pattern)) {
                    // Check authorization if required
                    if (config.requiresAuth) {
                        const authorized = await SecurityUtils.validateAuthorization(message, config.authLevel);
                        if (!authorized) {
                            message.reply('❌ You do not have permission to use this command.');
                            return true;
                        }
                    }

                    // Execute handler
                    await config.handler(message);
                    return true;
                }
            }

            return false; // No route matched
        } catch (error) {
            Logger.error('Command routing error', { error: error.message.substring(0, 100) });
            message.reply('❌ An error occurred processing your command.');
            return true;
        }
    }

    // Check if message content matches pattern
    matchesPattern(content, pattern) {
        if (typeof pattern === 'string') {
            return content.startsWith(pattern);
        } else if (pattern instanceof RegExp) {
            return pattern.test(content);
        }
        return false;
    }

    // Get all registered routes (for debugging)
    getRoutes() {
        return Array.from(this.routes.keys());
    }
}

module.exports = new CommandRouter();