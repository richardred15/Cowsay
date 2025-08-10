const Logger = require("./logger");
const database = require("./database");
const llmProvider = require("./llmProvider");
const llmService = require("./llmService");
const { INTENT_MODEL } = require("../config");

class IntentDetector {
    constructor() {
        // Create separate LLM service for intent detection with different model
        this.intentLLMProvider = llmProvider.createProvider(INTENT_MODEL);
        this.llmService = llmService;
        this.cache = new Map(); // serverId -> mode
        this.model = null;
        this.dismissedUsers = new Map(); // userId -> timestamp
        this.dismissCooldown = 30000; // 30 seconds
        this.initializeModel(); // Always load model for potential use
    }

    async initializeModel() {
        try {
            Logger.info("Loading sentence transformer model...");
            const { pipeline } = await import("@xenova/transformers");
            this.model = await pipeline(
                "feature-extraction",
                "Xenova/all-MiniLM-L6-v2"
            );
            Logger.info("Sentence transformer model loaded and ready");
        } catch (error) {
            Logger.error("Failed to load transformer model", error.message);
            this.model = null;
        }
    }

    async getMode(serverId) {
        if (!serverId) return "LLM"; // Default for DMs

        if (this.cache.has(serverId)) {
            return this.cache.get(serverId);
        }

        try {
            const sql =
                "SELECT intent_detection_mode FROM server_config WHERE server_id = ?";
            const rows = await database.query(sql, [serverId]);

            const mode =
                rows.length > 0 ? rows[0].intent_detection_mode : "LLM";
            this.cache.set(serverId, mode);
            return mode;
        } catch (error) {
            Logger.error(
                "Failed to get intent detection config",
                error.message
            );
            return "LLM"; // Default fallback
        }
    }

    async toggle(serverId) {
        if (!serverId) return "LLM"; // Can't toggle DMs

        try {
            const modes = ["EMBEDDING", "REGEX", "LLM"];
            const currentMode = await this.getMode(serverId);
            const currentIndex = modes.indexOf(currentMode);
            let newMode = modes[(currentIndex + 1) % modes.length];

            // If switching to EMBEDDING mode but model failed to load, skip to next mode
            if (newMode === "EMBEDDING" && !this.model) {
                Logger.warn(
                    "Transformer model not available, skipping EMBEDDING mode"
                );
                newMode = modes[(currentIndex + 2) % modes.length];
            }

            const sql = `INSERT INTO server_config (server_id, intent_detection_mode) 
                        VALUES (?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        intent_detection_mode = VALUES(intent_detection_mode), 
                        updated_at = CURRENT_TIMESTAMP`;

            await database.query(sql, [serverId, newMode]);
            this.cache.set(serverId, newMode);
            Logger.info(
                `Intent detection switched to ${newMode} mode for server ${serverId}`
            );
            return newMode;
        } catch (error) {
            Logger.error("Failed to toggle intent detection", error.message);
            return await this.getMode(serverId);
        }
    }

    detectIntentRegex(message, recentContext) {
        if (!Array.isArray(recentContext) || recentContext.length === 0) {
            return false;
        }

        const content = message.content.toLowerCase();
        const lastMessage = recentContext[recentContext.length - 1];

        // Check if last message was from Cowsay
        if (lastMessage && lastMessage.author === "Cowsay") {
            // Common patterns that indicate continuation
            const patterns = [
                /^(thanks?|thank you)/i,
                /^(what about|how about|can you)/i,
                /^(yes|no|maybe|ok|okay)\b/i,
                /\?$/, // Questions
                /^(and|also|but|however)/i,
                /^(tell me|show me)/i,
            ];

            return patterns.some((pattern) => pattern.test(content));
        }

        return false;
    }

    async detectIntent(message, recentContext) {
        try {
            // Check if user recently dismissed the bot
            const userId = message.author.id;
            const dismissTime = this.dismissedUsers.get(userId);
            if (
                dismissTime &&
                Date.now() - dismissTime < this.dismissCooldown
            ) {
                return false;
            }

            const mode = await this.getMode(message.guild?.id);
            switch (mode) {
                case "LLM":
                    return await this.detectIntentLLM(message, recentContext);
                case "EMBEDDING":
                    return await this.detectIntentEmbedding(
                        message,
                        recentContext
                    );
                case "REGEX":
                default:
                    return this.detectIntentRegex(message, recentContext);
            }
        } catch (error) {
            Logger.error("Intent detection error", error.message);
            return false;
        }
    }

    async detectIntentEmbedding(message, recentContext) {
        if (
            !this.model ||
            !Array.isArray(recentContext) ||
            recentContext.length === 0
        ) {
            return this.detectIntentRegex(message, recentContext);
        }

        const lastMessage = recentContext[recentContext.length - 1];
        Logger.debug("Embedding detection check", {
            hasLastMessage: !!lastMessage,
            lastMessageAuthor: lastMessage?.author,
            currentMessage: message.content.substring(0, 50),
        });

        if (!lastMessage || lastMessage.author !== "Cowsay") {
            return false;
        }

        try {
            // Create conversation flow examples to test logical continuation
            const conversationFlow = `${lastMessage.content} [USER RESPONDS] ${message.content}`;
            const nonFlow = `${lastMessage.content} [USER RESPONDS] I like pizza and cats.`;

            const embeddings = await this.model([conversationFlow, nonFlow]);

            // Calculate coherence scores - logical flows have more focused embeddings
            const flowCoherence = this.calculateCoherence(
                embeddings.data.slice(0, 384)
            );
            const nonFlowCoherence = this.calculateCoherence(
                embeddings.data.slice(384, 768)
            );

            const isLogicalFlow = flowCoherence > nonFlowCoherence;
            Logger.debug("Embedding flow detection", {
                flowCoherence,
                nonFlowCoherence,
                isLogicalFlow,
            });
            return isLogicalFlow;
        } catch (error) {
            Logger.error("Embedding detection error", error.message);
            return this.detectIntentRegex(message, recentContext);
        }
    }

    calculateCoherence(embedding) {
        // Measure how focused/coherent the embedding is
        const mean =
            embedding.reduce((sum, val) => sum + val, 0) / embedding.length;
        const variance =
            embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            embedding.length;
        return 1 / (1 + variance); // Higher coherence = lower variance
    }

    async detectIntentLLM(message, recentContext) {
        Logger.debug("Intent detection input", {
            hasContext: !!recentContext,
            isArray: Array.isArray(recentContext),
            contextLength: recentContext?.length,
        });

        if (!Array.isArray(recentContext)) {
            Logger.debug("No valid context for intent detection");
            return false;
        }

        const contextText = recentContext
            .slice(-5, -1)
            .map(
                (msg) => `${msg.author}: ${msg.content.substring(0, 100)}[...]`
            )
            .join("\n");

        Logger.debug("Intent detection prompt", { contextText });

        const prompt = `You are an intent detection system. Determine if the following message is directed at Cowsay or not. Use the recent context to understand the conversation flow. If there is no context, assume it is NOT_DIRECTED. If the message is a direct response to Cowsay or shows interest in continuing the conversation, respond with DIRECTED. If it contains dismissive phrases, respond with NOT_DIRECTED. For context, cowsay is a cow themed AI assistant with many commands and features. It is not a real cow, but a fun AI that helps users with various tasks. The server has many people in it, and not every question is directed at cowsay.
        
        Context:
        ${contextText}

        New message: "${message.content}"

        Reply with ONLY the word DIRECTED or NOT_DIRECTED. No explanation.`;

        const completion = await this.intentLLMProvider.createCompletion(
            [{ role: "system", content: prompt }],
            { max_tokens: 5 }
        );

        const response = completion.choices[0]?.message?.content || "";

        const cleanResponse = response
            .trim()
            .replace(/["']/g, "")
            .toUpperCase();
        const isDirected = cleanResponse === "DIRECTED";

        // If not directed and looks dismissive, add cooldown
        if (!isDirected && this.isDismissive(message.content)) {
            this.dismissedUsers.set(message.author.id, Date.now());
            Logger.debug("User dismissed bot, adding cooldown", {
                userId: message.author.id,
            });
        }

        Logger.debug("Intent detection response", {
            response,
            cleanResponse,
            isDirected,
        });
        return isDirected;
    }

    isDismissive(content) {
        const dismissive = /\b(stop|go away|leave me|shut up|quiet|enough)\b/i;
        return dismissive.test(content);
    }
}

module.exports = IntentDetector;
