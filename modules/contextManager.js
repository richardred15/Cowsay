const memberCache = require('./memberCache');
const tagManager = require('./tagManager');
const dataStore = require('./dataStore');
const Logger = require('./logger');

class ContextManager {
    constructor() {
        // Hierarchical context storage: serverId -> channelId -> threadId -> context
        this.serverContexts = new Map();
        this.channelContexts = new Map();
        this.threadContexts = new Map();
        this.replyChains = new Map();
        
        // Cache settings
        this.maxMessages = 30;
        this.maxAge = 10 * 60 * 1000; // 10 minutes
        this.maxReplyChainDepth = 5;
        
        // Leaderboard history per server (not per channel)
        this.leaderboardHistory = new Map(); // serverId -> history
        this.maxLeaderboardSnapshots = 3;
        
        // Load persisted data
        this.loadData();
    }

    // Add message to appropriate context
    addMessage(message) {
        try {
            const serverId = message.guild?.id;
            const channelId = message.channel.id;
            const threadId = message.channel.isThread() ? message.channel.id : null;
            
            const messageData = {
                id: message.id,
                timestamp: message.createdTimestamp,
                author: message.author.username,
                displayName: message.member?.displayName || message.author.username,
                content: message.content,
                isBot: message.author.bot,
                replyTo: message.reference?.messageId,
                serverId,
                channelId,
                threadId
            };

            // Add to appropriate context level
            if (threadId) {
                this.addToThreadContext(threadId, messageData);
            } else {
                this.addToChannelContext(channelId, messageData);
            }

            // Update reply chains
            if (message.reference?.messageId) {
                this.updateReplyChain(channelId, message.reference.messageId, messageData);
            }

            // Cleanup old data
            this.cleanup();
        } catch (error) {
            Logger.error('Error adding message to context:', error);
        }
    }

    addToChannelContext(channelId, messageData) {
        if (!this.channelContexts.has(channelId)) {
            this.channelContexts.set(channelId, []);
        }
        
        const channelMessages = this.channelContexts.get(channelId);
        channelMessages.push(messageData);
        
        // Keep only recent messages
        const cutoff = Date.now() - this.maxAge;
        const filtered = channelMessages.filter(msg => msg.timestamp > cutoff);
        
        if (filtered.length > this.maxMessages) {
            filtered.splice(0, filtered.length - this.maxMessages);
        }
        
        this.channelContexts.set(channelId, filtered);
    }

    addToThreadContext(threadId, messageData) {
        if (!this.threadContexts.has(threadId)) {
            this.threadContexts.set(threadId, []);
        }
        
        const threadMessages = this.threadContexts.get(threadId);
        threadMessages.push(messageData);
        
        // Keep only recent messages
        const cutoff = Date.now() - this.maxAge;
        const filtered = threadMessages.filter(msg => msg.timestamp > cutoff);
        
        if (filtered.length > this.maxMessages) {
            filtered.splice(0, filtered.length - this.maxMessages);
        }
        
        this.threadContexts.set(threadId, filtered);
    }

    updateReplyChain(channelId, replyToId, messageData) {
        const chainKey = `${channelId}:${replyToId}`;
        if (!this.replyChains.has(chainKey)) {
            this.replyChains.set(chainKey, []);
        }
        
        const chain = this.replyChains.get(chainKey);
        chain.push(messageData);
        
        // Keep chain reasonable size
        if (chain.length > this.maxReplyChainDepth) {
            chain.shift();
        }
    }

    // Build comprehensive context for a message
    async buildContext(message, options = {}) {
        const {
            includeLeaderboard = false,
            includeChannelContext = false,
            includeThreadContext = false,
            includeReplyChain = false,
            maxMessages = 10
        } = options;

        const context = [];
        
        // Ensure member cache is updated
        if (message.guild) {
            await memberCache.ensureCache(message.guild);
        }

        // Basic user info
        const userInfo = this.getUserInfo(message);
        context.push({
            role: "system",
            content: userInfo
        });

        // Thread context (highest priority)
        if (includeThreadContext && message.channel.isThread()) {
            const threadContext = this.getThreadContext(message.channel.id, maxMessages);
            if (threadContext) {
                context.push({
                    role: "system",
                    content: threadContext
                });
            }
        }

        // Channel context
        if (includeChannelContext && !message.channel.isThread()) {
            const channelContext = this.getChannelContext(message.channel.id, maxMessages);
            if (channelContext) {
                context.push({
                    role: "system",
                    content: channelContext
                });
            }
        }

        // Reply chain context
        if (includeReplyChain && message.reference?.messageId) {
            const replyContext = this.getReplyChainContext(message.channel.id, message.reference.messageId);
            if (replyContext) {
                context.push({
                    role: "system",
                    content: replyContext
                });
            }
        }

        // Leaderboard context (per-server)
        if (includeLeaderboard && message.guild) {
            const leaderboardContext = this.getLeaderboardContext(message.guild.id, message.guild);
            if (leaderboardContext) {
                context.push({
                    role: "system",
                    content: leaderboardContext
                });
            }
        }

        return context;
    }

    getUserInfo(message) {
        const roles = message.member?.roles.cache.map(role => role.name).filter(name => name !== '@everyone').slice(0, 5) || [];
        return `User Info: Username: ${message.author.username}, Nickname: ${message.member?.displayName || message.author.username}, Server: ${message.guild?.name || 'DM'}, Channel: ${message.channel.name || 'DM'}, User ID: ${message.author.id}, Account Created: ${message.author.createdAt.toDateString()}, Joined Server: ${message.member?.joinedAt?.toDateString() || 'Unknown'}, Roles: ${roles.join(', ') || 'None'}, Server Members: ${message.guild?.memberCount || 'N/A'}, Message Time: ${message.createdAt.toLocaleString()}`;
    }

    getChannelContext(channelId, maxMessages = 10) {
        const channelMessages = this.channelContexts.get(channelId) || [];
        
        const recent = channelMessages
            .slice(-maxMessages * 2)
            .filter(msg => !msg.isBot || msg.content.length > 0)
            .slice(-maxMessages);
        
        if (recent.length === 0) return null;
        
        const contextText = recent
            .map(msg => `${msg.displayName}: ${msg.content}`)
            .join('\n');
        
        return `Recent channel context:\n${contextText}`;
    }

    getThreadContext(threadId, maxMessages = 10) {
        const threadMessages = this.threadContexts.get(threadId) || [];
        
        const recent = threadMessages
            .slice(-maxMessages * 2)
            .filter(msg => !msg.isBot || msg.content.length > 0)
            .slice(-maxMessages);
        
        if (recent.length === 0) return null;
        
        const contextText = recent
            .map(msg => `${msg.displayName}: ${msg.content}`)
            .join('\n');
        
        return `Thread context:\n${contextText}`;
    }

    getReplyChainContext(channelId, messageId) {
        const chainKey = `${channelId}:${messageId}`;
        const chain = this.replyChains.get(chainKey) || [];
        
        // Also check for chains in channel context
        const channelMessages = this.channelContexts.get(channelId) || [];
        const threadMessages = this.threadContexts.get(channelId) || [];
        const allMessages = [...channelMessages, ...threadMessages];
        
        const messageMap = new Map(allMessages.map(msg => [msg.id, msg]));
        
        const fullChain = [];
        let currentId = messageId;
        let depth = 0;
        
        while (currentId && depth < this.maxReplyChainDepth) {
            const msg = messageMap.get(currentId);
            if (!msg) break;
            
            fullChain.unshift(msg);
            currentId = msg.replyTo;
            depth++;
        }
        
        if (fullChain.length <= 1) return null;
        
        const chainText = fullChain
            .map(msg => `${msg.displayName}: ${msg.content}`)
            .join('\n');
        
        return `Reply chain context:\n${chainText}`;
    }

    // Leaderboard context per server (not per channel)
    getLeaderboardContext(serverId, guild) {
        const serverHistory = this.leaderboardHistory.get(serverId);
        console.log(`[LEADERBOARD] Getting context for server ${serverId}, history length: ${serverHistory?.length || 0}`);
        if (!serverHistory || serverHistory.length === 0) {
            return "Leaderboard Context: No recent leaderboard data available.";
        }

        // Get the latest leaderboard data
        const latest = serverHistory[serverHistory.length - 1];
        const changes = this.getLeaderboardChanges(serverId);
        const availableTags = tagManager.getAvailableTags(memberCache, guild);
        
        let context = "Leaderboard Context (when users ask about XP, rank, or level, they're referring to this data): ";
        
        // Include current leaderboard standings
        if (latest && latest.entries) {
            const topEntries = latest.entries.slice(0, 10).map(entry => 
                `${entry.username}: Level ${entry.level} (${entry.xp} XP)`
            ).join(', ');
            context += `Current standings: ${topEntries}. `;
        }
        
        if (changes && changes.length > 0) {
            const changesSummary = changes.map(change => {
                if (change.isNew) {
                    return `${change.username} joined at #${change.currentRank}`;
                }
                
                let desc = `${change.username}: #${change.currentRank}`;
                if (change.rankChange > 0) desc += ` (↑${change.rankChange})`;
                if (change.rankChange < 0) desc += ` (↓${Math.abs(change.rankChange)})`;
                if (change.xpGain > 0) desc += ` +${change.xpGain} XP`;
                
                return desc;
            }).join(', ');
            
            context += `Recent changes: ${changesSummary}. `;
        }
        
        if (availableTags.length > 0) {
            const tagList = availableTags.map(t => `${t.displayName} (${t.tag})`).join(', ');
            context += `Available tags: ${tagList}. Use sparingly for meaningful moments only.`;
        } else {
            context += "No tags available (daily limits reached).";
        }
        
        context += " When users ask about their XP, rank, level, or position, use this leaderboard data.";
        
        return context;
    }

    // Add leaderboard snapshot per server
    addLeaderboardSnapshot(serverId, leaderboardText) {
        const entries = this.parseLeaderboard(leaderboardText);
        if (entries.length === 0) return null;

        const snapshot = {
            timestamp: Date.now(),
            entries: entries
        };

        if (!this.leaderboardHistory.has(serverId)) {
            this.leaderboardHistory.set(serverId, []);
        }

        const serverHistory = this.leaderboardHistory.get(serverId);
        serverHistory.push(snapshot);

        if (serverHistory.length > this.maxLeaderboardSnapshots) {
            serverHistory.shift();
        }

        // Save to disk
        this.saveData();

        return snapshot;
    }

    parseLeaderboard(text) {
        const entries = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+)\.\s*([^:]+)::\s*Level\s*(\d+)\s*\((\d+)\s*XP\)/);
            if (match) {
                entries.push({
                    rank: parseInt(match[1]),
                    username: match[2].trim(),
                    level: parseInt(match[3]),
                    xp: parseInt(match[4])
                });
            }
        }
        
        return entries;
    }

    getLeaderboardChanges(serverId) {
        const serverHistory = this.leaderboardHistory.get(serverId);
        if (!serverHistory || serverHistory.length < 2) {
            return null;
        }

        const previous = serverHistory[serverHistory.length - 2];
        const current = serverHistory[serverHistory.length - 1];

        const changes = [];
        const prevMap = new Map(previous.entries.map(e => [e.username, e]));

        for (const currentEntry of current.entries) {
            const prevEntry = prevMap.get(currentEntry.username);
            
            if (prevEntry) {
                const xpGain = currentEntry.xp - prevEntry.xp;
                const rankChange = prevEntry.rank - currentEntry.rank;
                
                if (xpGain > 0 || rankChange !== 0) {
                    changes.push({
                        username: currentEntry.username,
                        currentRank: currentEntry.rank,
                        previousRank: prevEntry.rank,
                        xpGain: xpGain,
                        rankChange: rankChange,
                        currentXP: currentEntry.xp,
                        currentLevel: currentEntry.level
                    });
                }
            } else {
                changes.push({
                    username: currentEntry.username,
                    currentRank: currentEntry.rank,
                    previousRank: null,
                    xpGain: currentEntry.xp,
                    rankChange: 0,
                    currentXP: currentEntry.xp,
                    currentLevel: currentEntry.level,
                    isNew: true
                });
            }
        }

        return changes.length > 0 ? changes : null;
    }

    // Get recent messages for intent detection
    getRecentMessages(channelId, count = 6) {
        const channelMessages = this.channelContexts.get(channelId) || [];
        return channelMessages.slice(-count);
    }

    // Cleanup old data
    cleanup() {
        const cutoff = Date.now() - this.maxAge;
        
        // Cleanup channel contexts
        for (const [channelId, messages] of this.channelContexts) {
            const filtered = messages.filter(msg => msg.timestamp > cutoff);
            if (filtered.length === 0) {
                this.channelContexts.delete(channelId);
            } else {
                this.channelContexts.set(channelId, filtered);
            }
        }
        
        // Cleanup thread contexts
        for (const [threadId, messages] of this.threadContexts) {
            const filtered = messages.filter(msg => msg.timestamp > cutoff);
            if (filtered.length === 0) {
                this.threadContexts.delete(threadId);
            } else {
                this.threadContexts.set(threadId, filtered);
            }
        }
        
        // Cleanup reply chains
        for (const [chainKey, chain] of this.replyChains) {
            const filtered = chain.filter(msg => msg.timestamp > cutoff);
            if (filtered.length === 0) {
                this.replyChains.delete(chainKey);
            } else {
                this.replyChains.set(chainKey, filtered);
            }
        }
    }

    // Full cleanup (called periodically)
    cleanupAll() {
        this.cleanup();
        Logger.info('Context cleanup completed', {
            channels: this.channelContexts.size,
            threads: this.threadContexts.size,
            replyChains: this.replyChains.size,
            leaderboards: this.leaderboardHistory.size
        });
    }

    async loadData() {
        try {
            const leaderboardData = await dataStore.load('unified_leaderboard_history');
            if (leaderboardData) {
                this.leaderboardHistory = new Map(Object.entries(leaderboardData));
                Logger.info('Unified leaderboard history loaded', { servers: this.leaderboardHistory.size });
            }
        } catch (error) {
            Logger.error('Failed to load unified context data', error.message);
        }
    }

    async saveData() {
        try {
            const leaderboardData = Object.fromEntries(this.leaderboardHistory);
            await dataStore.save('unified_leaderboard_history', leaderboardData);
        } catch (error) {
            Logger.error('Failed to save unified context data:', error);
        }
    }
}

module.exports = new ContextManager();