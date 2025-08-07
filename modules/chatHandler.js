const contextBuilder = require('./contextBuilder');
const LLMService = require('./llmService');
const Logger = require('./logger');
const SecurityUtils = require('./security');

class ChatHandler {
    constructor(llmProvider) {
        this.llmService = new LLMService(llmProvider);
    }

    async handleReply(message, referencedMessage, systemPrompt) {
        try {
            const validation = SecurityUtils.validateInput(message.content, 1000);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const context = await contextBuilder.buildContext(message, false, true, message.channel.isThread());
            const replyContext = await contextBuilder.buildReplyContext(message, referencedMessage);
            
            const messages = [
                this.llmService.buildSystemMessage(systemPrompt),
                ...context,
                ...replyContext,
                { role: "assistant", content: referencedMessage.content },
                this.llmService.buildUserMessage(message.author.displayName, message.content),
            ];

            return await this.llmService.generateResponse(messages);
        } catch (error) {
            Logger.error('Chat reply handler error', { error: error.message, user: message.author.username });
            throw error;
        }
    }
}

module.exports = ChatHandler;