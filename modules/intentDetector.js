const Logger = require('./logger');
const dataStore = require('./dataStore');
const llmProvider = require('./llmProvider');
const llmService = require('./llmService');
const { INTENT_MODEL } = require('../config');

class IntentDetector {
    constructor() {
        // Create separate LLM service for intent detection with different model
        this.intentLLMProvider = llmProvider.createProvider(INTENT_MODEL);
        this.llmService = llmService;
        this.mode = 'EMBEDDING'; // LLM, EMBEDDING, REGEX
        this.model = null;
        this.dismissedUsers = new Map(); // userId -> timestamp
        this.dismissCooldown = 30000; // 30 seconds
        this.loadConfig();
        this.initializeModel(); // Always load model for potential use
    }

    async initializeModel() {
        try {
            Logger.info('Loading sentence transformer model...');
            const { pipeline } = await import('@xenova/transformers');
            this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            Logger.info('Sentence transformer model loaded and ready');
        } catch (error) {
            Logger.error('Failed to load transformer model', error.message);
            this.model = null;
        }
    }

    async loadConfig() {
        try {
            const config = await dataStore.load('config');
            if (config && config.intentMode) {
                this.mode = config.intentMode;
            }
            Logger.info('Intent detection config loaded', { mode: this.mode });
        } catch (error) {
            Logger.error('Failed to load intent config', error.message);
        }
    }

    async saveConfig() {
        try {
            const existingConfig = await dataStore.load('config') || {};
            await dataStore.save('config', { ...existingConfig, intentMode: this.mode });
            Logger.info('Intent detection config saved', { mode: this.mode });
        } catch (error) {
            Logger.error('Failed to save intent config', error.message);
        }
    }

    async toggle() {
        const modes = ['EMBEDDING', 'REGEX', 'LLM'];
        const currentIndex = modes.indexOf(this.mode);
        this.mode = modes[(currentIndex + 1) % modes.length];
        
        // If switching to EMBEDDING mode but model failed to load, skip to next mode
        if (this.mode === 'EMBEDDING' && !this.model) {
            Logger.warn('Transformer model not available, skipping EMBEDDING mode');
            return await this.toggle();
        }
        
        await this.saveConfig();
        Logger.info(`Intent detection switched to ${this.mode} mode`);
        return this.mode;
    }

    detectIntentRegex(message, recentContext) {
        if (!Array.isArray(recentContext) || recentContext.length === 0) {
            return false;
        }

        const content = message.content.toLowerCase();
        const lastMessage = recentContext[recentContext.length - 1];
        
        // Check if last message was from Cowsay
        if (lastMessage && lastMessage.author === 'Cowsay') {
            // Common patterns that indicate continuation
            const patterns = [
                /^(thanks?|thank you)/i,
                /^(what about|how about|can you)/i,
                /^(yes|no|maybe|ok|okay)\b/i,
                /\?$/,  // Questions
                /^(and|also|but|however)/i,
                /^(tell me|show me)/i
            ];
            
            return patterns.some(pattern => pattern.test(content));
        }
        
        return false;
    }

    async detectIntent(message, recentContext) {
        try {
            // Check if user recently dismissed the bot
            const userId = message.author.id;
            const dismissTime = this.dismissedUsers.get(userId);
            if (dismissTime && Date.now() - dismissTime < this.dismissCooldown) {
                return false;
            }
            
            switch (this.mode) {
                case 'LLM':
                    return await this.detectIntentLLM(message, recentContext);
                case 'EMBEDDING':
                    return await this.detectIntentEmbedding(message, recentContext);
                case 'REGEX':
                default:
                    return this.detectIntentRegex(message, recentContext);
            }
        } catch (error) {
            Logger.error('Intent detection error', error.message);
            return false;
        }
    }

    async detectIntentEmbedding(message, recentContext) {
        if (!this.model || !Array.isArray(recentContext) || recentContext.length === 0) {
            return this.detectIntentRegex(message, recentContext);
        }

        const lastMessage = recentContext[recentContext.length - 1];
        Logger.debug('Embedding detection check', {
            hasLastMessage: !!lastMessage,
            lastMessageAuthor: lastMessage?.author,
            currentMessage: message.content.substring(0, 50)
        });
        
        if (!lastMessage || lastMessage.author !== 'Cowsay') {
            return false;
        }

        try {
            // Create conversation flow examples to test logical continuation
            const conversationFlow = `${lastMessage.content} [USER RESPONDS] ${message.content}`;
            const nonFlow = `${lastMessage.content} [USER RESPONDS] I like pizza and cats.`;
            
            const embeddings = await this.model([conversationFlow, nonFlow]);
            
            // Calculate coherence scores - logical flows have more focused embeddings
            const flowCoherence = this.calculateCoherence(embeddings.data.slice(0, 384));
            const nonFlowCoherence = this.calculateCoherence(embeddings.data.slice(384, 768));
            
            const isLogicalFlow = flowCoherence > nonFlowCoherence;
            Logger.debug('Embedding flow detection', { flowCoherence, nonFlowCoherence, isLogicalFlow });
            return isLogicalFlow;
        } catch (error) {
            Logger.error('Embedding detection error', error.message);
            return this.detectIntentRegex(message, recentContext);
        }
    }

    calculateCoherence(embedding) {
        // Measure how focused/coherent the embedding is
        const mean = embedding.reduce((sum, val) => sum + val, 0) / embedding.length;
        const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
        return 1 / (1 + variance); // Higher coherence = lower variance
    }



    async detectIntentLLM(message, recentContext) {
        Logger.debug('Intent detection input', {
            hasContext: !!recentContext,
            isArray: Array.isArray(recentContext),
            contextLength: recentContext?.length
        });

        if (!Array.isArray(recentContext)) {
            Logger.debug('No valid context for intent detection');
            return false;
        }

        const contextText = recentContext.slice(-3).map(msg => 
            `${msg.author}: ${msg.content.substring(0, 100)}`
        ).join('\n');

        Logger.debug('Intent detection prompt', { contextText });

        const prompt = `Context:
${contextText}

New message: "${message.content}"

Is this message directed at Cowsay? If the message says things like "stop talking to me", "go away", "leave me alone", or similar dismissive phrases, respond with NOT_DIRECTED. Reply with ONLY the word DIRECTED or NOT_DIRECTED. No explanation.`;

        const completion = await this.intentLLMProvider.createCompletion([
            { role: "system", content: "You are a classification system. Reply with ONLY 'DIRECTED' or 'NOT_DIRECTED'. Never add explanations or extra text. If users say dismissive things like 'stop talking', 'go away', 'leave me alone', respond with NOT_DIRECTED." },
            { role: "user", content: prompt }
        ], { max_tokens: 5 });
        
        const response = completion.choices[0]?.message?.content || '';

        const cleanResponse = response.trim().replace(/["']/g, '').toUpperCase();
        const isDirected = cleanResponse === 'DIRECTED';
        
        // If not directed and looks dismissive, add cooldown
        if (!isDirected && this.isDismissive(message.content)) {
            this.dismissedUsers.set(message.author.id, Date.now());
            Logger.debug('User dismissed bot, adding cooldown', { userId: message.author.id });
        }
        
        Logger.debug('Intent detection response', { response, cleanResponse, isDirected });
        return isDirected;
    }
    
    isDismissive(content) {
        const dismissive = /\b(stop|go away|leave me|shut up|quiet|enough)\b/i;
        return dismissive.test(content);
    }
}

module.exports = IntentDetector;