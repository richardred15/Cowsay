const contextManager = require('./contextManager');

class ContextBuilder {
    async buildContext(message, includeLeaderboard = false, includeChannelContext = false, includeThreadContext = false) {
        return await contextManager.buildContext(message, {
            includeLeaderboard,
            includeChannelContext,
            includeThreadContext,
            includeReplyChain: false
        });
    }
    
    async buildReplyContext(message, referencedMessage) {
        return await contextManager.buildContext(message, {
            includeReplyChain: true,
            includeChannelContext: false,
            includeLeaderboard: false
        });
    }
    
    // Legacy methods for backward compatibility
    getUserInfo(message) {
        return contextManager.getUserInfo(message);
    }
}

module.exports = new ContextBuilder();