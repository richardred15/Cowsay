const memberCache = require('./memberCache');
const contextManager = require('./contextManager');
const tagManager = require('./tagManager');
const LLMService = require('./llmService');
const { getSystemPrompt, LLM_PROVIDER } = require('../config');
const Logger = require('./logger');
const SecurityUtils = require('./security');

// Track pending leaderboard requests
const pendingLeaderboards = new Map();

async function handleLeaderboardCommand(message) {
    if (message.content.includes('-leaderboard')) {
        Logger.info('Leaderboard command detected', { 
            channel: message.channel.id, 
            user: message.author.username 
        });
        pendingLeaderboards.set(message.channel.id, {
            timestamp: Date.now(),
            requester: message.author.username
        });
    }
}

function clearPendingLeaderboard(channelId) {
    pendingLeaderboards.delete(channelId);
    Logger.info('Cleared pending leaderboard', { channelId });
}

function clearAllPendingLeaderboards() {
    const count = pendingLeaderboards.size;
    pendingLeaderboards.clear();
    Logger.info('Cleared all pending leaderboards', { count });
    return count;
}

async function handleLeaderboardResponse(message, llmProvider, animalSayTool, handleAnimalSay) {
    const llmService = new LLMService(llmProvider);
    
    if (!message.author.bot || !pendingLeaderboards.has(message.channel.id)) {
        return false;
    }
    
    Logger.info('Processing leaderboard response', {
        channel: message.channel.id,
        botName: message.author.username,
        embedTitle: message.embeds[0]?.title
    });

    const leaderboardData = pendingLeaderboards.get(message.channel.id);
    
    // Check if this message came within reasonable time and contains leaderboard content
    if (Date.now() - leaderboardData.timestamp < 30000 && 
        (message.content.includes('Leaderboard') || message.content.includes('Level') || message.content.includes('XP') || 
         message.embeds.length > 0)) {
        
        pendingLeaderboards.delete(message.channel.id);
        
        try {
            // Ensure member cache is up to date
            await memberCache.ensureCache(message.guild);
            
            // Extract and clean leaderboard data
            const rawText = message.embeds[0]?.description || message.content;
            let leaderboardText = rawText
                .replace(/https?:\/\/[^\s\)\]]+/g, '') // Remove URLs
                .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1') // Convert [text](url) to just text
                .replace(/\*\*/g, ''); // Remove bold markdown
            
            // Replace usernames with display names and sanitize
            leaderboardText = SecurityUtils.sanitizeForDisplay(memberCache.replaceUsernamesWithDisplayNames(leaderboardText, message.guild));
            
            // Add to history and get changes (per-server, not per-channel)
            contextManager.addLeaderboardSnapshot(message.guild.id, leaderboardText);
            const changes = contextManager.getLeaderboardChanges(message.guild.id);
            const contextSummary = changes ? `Changes: ${changes.map(change => {
                if (change.isNew) {
                    return `${change.username} joined at #${change.currentRank} (${change.currentXP} XP)`;
                }
                
                let desc = `${change.username}: #${change.currentRank}`;
                if (change.rankChange > 0) desc += ` (↑${change.rankChange})`;
                if (change.rankChange < 0) desc += ` (↓${Math.abs(change.rankChange)})`;
                if (change.xpGain > 0) desc += ` +${change.xpGain} XP`;
                
                return desc;
            }).join(', ')}` : 'First leaderboard check - no changes to compare.';
            
            // Get available tags
            const availableTags = tagManager.getAvailableTags(memberCache, message.guild);
            const tagContext = tagManager.generateTagContext(availableTags);
            
            Logger.debug('Leaderboard processing', {
                extractedData: leaderboardText.substring(0, 100),
                hasChanges: !!contextSummary,
                tagContextLength: tagContext.length
            });
            
            const systemPrompt = await getSystemPrompt(LLM_PROVIDER, message.guild?.id) + " Focus on providing SHORT commentary on these leaderboard results using actual player names and scores. Celebrate winners and make friendly jokes about score gaps.";
            
            const userContent = `Someone ran a leaderboard command and here are the results:\n\n${leaderboardText}\n\n${contextSummary}\n\n${tagContext}\n\nPlease provide some fun commentary about these results!`;
            
            const messages = [
                llmService.buildSystemMessage(systemPrompt),
                { role: "user", content: userContent },
            ];

            const options = { max_tokens: 1500 };
            let commentary = await llmService.generateResponse(messages, options);
            // Remove quotes that LLM might add around the response
            commentary = commentary.replace(/^["']|["']$/g, '');
            Logger.debug('Generated commentary preview', { preview: commentary.substring(0, 100) });

            if (commentary && commentary.trim() !== "") {
                // Process any tags used in the commentary
                const { processedMessage, usedTags } = tagManager.processTagsInMessage(commentary, availableTags);
                
                const maxLength = 1800;
                if (processedMessage.length > maxLength) {
                    commentary = processedMessage.slice(0, maxLength) + " [... Moo! ...]";
                } else {
                    commentary = processedMessage;
                }
                
                if (usedTags.length > 0) {
                    Logger.info('Tags used in commentary', { tags: usedTags.map(t => t.displayName) });
                }
                
                // Wait a moment before responding
                setTimeout(async () => {
                    try {
                        Logger.debug('Sending commentary', { preview: commentary.substring(0, 100) });
                        const sentMessage = await message.channel.send(commentary);
                        Logger.info('Leaderboard commentary sent successfully');
                    } catch (error) {
                        Logger.error('Failed to send leaderboard commentary', error.message);
                    }
                }, 2000);
            }
        } catch (error) {
            Logger.error('Leaderboard commentary error', error.message);
        }
        return true;
    } else {
        // Clean up expired entries
        pendingLeaderboards.delete(message.channel.id);
        return false;
    }
}

module.exports = {
    handleLeaderboardCommand,
    handleLeaderboardResponse,
    clearPendingLeaderboard,
    clearAllPendingLeaderboards
};