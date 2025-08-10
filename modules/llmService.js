const toolManager = require("./toolManager");
const {
    getSystemPrompt,
    LLM_PROVIDER,
    MAX_TOKENS,
    MAX_RAW_ANSWER_LENGTH,
    MAX_ANSWER_LENGTH,
    TRUNCATION_TEXT,
} = require("../config");
const Logger = require("./logger");

class LLMService {
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }

    async generateResponse(messages, options = {}) {
        const defaultOptions = {
            max_tokens: MAX_TOKENS,
            reasoning_effort: "none",
        };
        if (this.llmProvider.supportsTools()) {
            //const animalSayTool = await toolManager.getAnimalSayTool();
            const tools = await toolManager.getTools();
            console.log(tools);
            defaultOptions.tools = tools;
            defaultOptions.tool_choice = "auto";
        }

        const completion = await this.llmProvider.createCompletion(messages, {
            ...defaultOptions,
            ...options,
        });
        return await this.processCompletion(completion);
    }

    async processCompletion(completion) {
        const choice = completion.choices[0];
        let answer = choice?.message?.content || "";
        let has_tools = false;
        if (choice?.message?.tool_calls) {
            has_tools = true;
            answer = await toolManager.handleToolCalls(
                choice.message.tool_calls
            );
            console.log(choice?.message?.tool_calls);
        } else {
            Logger.debug(`Tool call: ${choice?.message}`);
            console.log(choice?.message);
        }

        return (
            answer ||
            `Sorry, I couldn't generate an answer. Had tools: ${has_tools}`
        );
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
        return await message.reply(truncatedAnswer);
    }

    buildSystemMessage(systemPrompt) {
        return { role: "system", content: systemPrompt };
    }

    buildUserMessage(displayName, content) {
        return { role: "user", content: `${displayName}: ${content}` };
    }
}

module.exports = LLMService;
