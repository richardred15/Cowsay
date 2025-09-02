const contextBuilder = require('./contextBuilder');
const LLMService = require('./llmService');
const Logger = require('./logger');
const SecurityUtils = require('./security');

class MentionHandler {
    constructor(llmProvider, commandHandler) {
        this.llmService = new LLMService(llmProvider);
        this.commandHandler = commandHandler;
    }

    async handleMention(message, client) {
        Logger.info('Mention detected', { user: message.author.username });
        const content = message.content
            .replace(`<@${client.user.id}>`, "")
            .trim();

        try {
            const validation = SecurityUtils.validateInput(content, 1000);
            if (!validation.valid) {
                message.reply(`Error: ${validation.error}`);
                return;
            }

            const context = await contextBuilder.buildContext(message, true, true, message.channel.isThread());
            let replyContext = [];
            
            if (message.reference && message.reference.messageId) {
                try {
                    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                    const referencedDisplayName = referencedMessage.member?.displayName || referencedMessage.author.username;
                    replyContext.push({
                        role: "system",
                        content: `User is replying to this message: "${referencedDisplayName}: ${referencedMessage.content}"`
                    });
                } catch (error) {
                    Logger.error('Failed to fetch referenced message', error.message);
                }
            }
            
            const messages = [
                this.llmService.buildSystemMessage(await this.commandHandler.getSystemPrompt(message.guild?.id)),
                ...context,
                ...replyContext,
                this.llmService.buildUserMessage(message.author.displayName, content || 'mentioned you'),
            ];

            const answer = await this.llmService.generateResponse(messages);
            await this.llmService.sendResponse(message, answer);
        } catch (error) {
            Logger.error('Mention handler error', { error: error.message, user: message.author.username });
            message.reply("Sorry, I couldn't process your message right now. 🤖");
        }
    }
}

module.exports = MentionHandler;