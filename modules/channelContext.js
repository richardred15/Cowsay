class ChannelContext {
    constructor() {
        this.contexts = new Map(); // channelId -> [messages]
        this.maxMessages = 30;
        this.maxAge = 10 * 60 * 1000; // 10 minutes
    }

    addMessage(message) {
        const channelId = message.channel.id;
        
        if (!this.contexts.has(channelId)) {
            this.contexts.set(channelId, []);
        }
        
        const channelMessages = this.contexts.get(channelId);
        
        // Add new message
        channelMessages.push({
            id: message.id,
            timestamp: message.createdTimestamp,
            author: message.author.username,
            displayName: message.member?.displayName || message.author.username,
            content: message.content,
            isBot: message.author.bot,
            replyTo: message.reference?.messageId
        });
        
        // Clean up old messages
        this.cleanupChannel(channelId);
    }

    cleanupChannel(channelId) {
        const channelMessages = this.contexts.get(channelId);
        if (!channelMessages) return;
        
        const cutoff = Date.now() - this.maxAge;
        
        // Remove old messages
        const filtered = channelMessages.filter(msg => msg.timestamp > cutoff);
        
        // Keep only last N messages
        if (filtered.length > this.maxMessages) {
            filtered.splice(0, filtered.length - this.maxMessages);
        }
        
        this.contexts.set(channelId, filtered);
    }

    getRecentContext(channelId, maxMessages = 10) {
        this.cleanupChannel(channelId);
        
        const channelMessages = this.contexts.get(channelId) || [];
        
        // Get recent messages, prioritize non-bot messages
        const recent = channelMessages
            .slice(-maxMessages * 2) // Get more to filter from
            .filter(msg => !msg.isBot || msg.content.length > 0) // Filter meaningful messages
            .slice(-maxMessages); // Take last N
        
        if (recent.length === 0) return null;
        
        // Format for Groq
        const contextText = recent
            .map(msg => `${msg.displayName}: ${msg.content}`)
            .join('\n');
        
        return `Recent channel context:\n${contextText}`;
    }

    getReplyChain(channelId, messageId, maxDepth = 5) {
        this.cleanupChannel(channelId);
        
        const channelMessages = this.contexts.get(channelId) || [];
        const messageMap = new Map(channelMessages.map(msg => [msg.id, msg]));
        
        const chain = [];
        let currentId = messageId;
        let depth = 0;
        
        // Build reply chain backwards
        while (currentId && depth < maxDepth) {
            const msg = messageMap.get(currentId);
            if (!msg) break;
            
            chain.unshift(msg);
            currentId = msg.replyTo;
            depth++;
        }
        
        if (chain.length <= 1) return null;
        
        // Format chain for Groq
        const chainText = chain
            .map(msg => `${msg.displayName}: ${msg.content}`)
            .join('\n');
        
        return `Reply chain context:\n${chainText}`;
    }

    cleanupAll() {
        for (const channelId of this.contexts.keys()) {
            this.cleanupChannel(channelId);
        }
    }
}

module.exports = new ChannelContext();