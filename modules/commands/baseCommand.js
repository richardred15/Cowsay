const SecurityUtils = require('../security');

class BaseCommand {
    constructor(name, options = {}) {
        this.name = name;
        this.description = options.description || '';
        this.requiresAuth = options.requiresAuth || false;
        this.authLevel = options.authLevel || 'user';
        this.category = options.category || 'general';
    }

    async execute(message, args) {
        throw new Error('Command execute method must be implemented');
    }

    async checkPermissions(message) {
        if (!this.requiresAuth) return true;
        return await SecurityUtils.validateAuthorization(message, this.authLevel);
    }

    validateInput(input, maxLength = 500) {
        return SecurityUtils.validateInput(input, maxLength);
    }

    sanitizeForLog(input) {
        return SecurityUtils.sanitizeForLog(input);
    }

    sanitizeForDisplay(input) {
        return SecurityUtils.sanitizeForDisplay(input);
    }
}

module.exports = BaseCommand;