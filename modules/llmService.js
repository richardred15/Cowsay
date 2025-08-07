const toolManager = require('./toolManager');
const { getSystemPrompt, LLM_PROVIDER, MAX_TOKENS, MAX_RAW_ANSWER_LENGTH, MAX_ANSWER_LENGTH, TRUNCATION_TEXT } = require('../config');

class LLMService {
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }

    async generateResponse(messages, options = {}) {
        const defaultOptions = { max_tokens: MAX_TOKENS };
        if (this.llmProvider.supportsTools()) {
            defaultOptions.tools = [toolManager.getAnimalSayTool()];
            defaultOptions.tool_choice = "auto";
        }
        
        const completion = await this.llmProvider.createCompletion(messages, { ...defaultOptions, ...options });
        return this.processCompletion(completion);
    }

    processCompletion(completion) {
        const choice = completion.choices[0];
        let answer = choice?.message?.content || "";

        if (choice?.message?.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                if (toolCall.function.name === "animalsay") {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const asciiArt = toolManager.handleAnimalSay(args.animal, args.message);
                        answer += `\n\`\`\`\n${asciiArt}\n\`\`\`\n`;
                    } catch (error) {
                        console.error("Tool call error:", error);
                        answer += "\n[ASCII art generation failed]";
                    }
                }
            }
        }

        return answer || "Sorry, I couldn't generate an answer.";
    }

    truncateResponse(answer) {
        if (answer.length > MAX_RAW_ANSWER_LENGTH) {
            answer = answer.slice(0, MAX_RAW_ANSWER_LENGTH) + TRUNCATION_TEXT;
        }

        const maxAnswerLength = MAX_ANSWER_LENGTH - TRUNCATION_TEXT.length;
        if (answer.length > maxAnswerLength) {
            return answer.slice(0, maxAnswerLength) + TRUNCATION_TEXT;
        }
        
        return answer;
    }

    async sendResponse(message, answer) {
        const truncatedAnswer = this.truncateResponse(answer);
        message.reply(truncatedAnswer);
    }

    buildSystemMessage(systemPrompt) {
        return { role: "system", content: systemPrompt };
    }

    buildUserMessage(displayName, content) {
        return { role: "user", content: `${displayName}: ${content}` };
    }
}

module.exports = LLMService;