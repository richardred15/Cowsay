const contextBuilder = require('./contextBuilder');
const LLMService = require('./llmService');
const Logger = require('./logger');
const SecurityUtils = require('./security');

class AskHandler {
    constructor(llmProvider, commandHandler) {
        this.llmService = new LLMService(llmProvider);
        this.commandHandler = commandHandler;
    }

    async handleAsk(message, question) {
        try {
            const validation = SecurityUtils.validateInput(question, 1000);
            if (!validation.valid) {
                message.reply(`Error: ${validation.error}`);
                return;
            }

            const context = await contextBuilder.buildContext(message, false, true, message.channel.isThread());
            const messages = [
                this.llmService.buildSystemMessage(this.commandHandler.getSystemPrompt()),
                ...context,
                this.llmService.buildUserMessage(message.author.displayName, question),
            ];

            const answer = await this.llmService.generateResponse(messages);
            await this.llmService.sendResponse(message, answer);
        } catch (error) {
            Logger.error('Ask handler error', { error: error.message, user: message.author.username });
            message.reply("Sorry, I couldn't process your question right now. 🤖");
        }
    }
}

module.exports = AskHandler;