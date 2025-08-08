const Groq = require("groq-sdk");
const { MODEL, LLM_PROVIDER, LLM_URL } = require('../config');
const Logger = require('./logger');

class LLMProvider {
    constructor() {
        this.provider = LLM_PROVIDER;
        this.model = MODEL;
        this.initializeProvider();
    }

    createProvider(model = null) {
        // Return a copy of the current provider with different model if needed
        if (model && model !== this.model) {
            const provider = Object.create(Object.getPrototypeOf(this));
            Object.assign(provider, this);
            provider.model = model;
            return provider;
        }
        return this;
    }

    initializeProvider() {
        switch (this.provider) {
            case 'groq':
                this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
                break;
            case 'lmstudio':
            case 'ollama':
                this.baseURL = LLM_URL;
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }
        Logger.info('LLM Provider initialized', { provider: this.provider, model: this.model });
    }

    supportsTools() {
        return this.provider === 'groq';
    }

    async createCompletion(messages, options = {}) {
        const payload = {
            messages,
            model: this.model,
            max_tokens: options.max_tokens || 500,
            ...options
        };

        switch (this.provider) {
            case 'groq':
                return await this.client.chat.completions.create(payload);
            
            case 'lmstudio':
            case 'ollama':
                return await this.makeOpenAIRequest(payload);
            
            default:
                throw new Error(`Unsupported provider: ${this.provider}`);
        }
    }

    async makeOpenAIRequest(payload) {
        try {
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'not-needed'}`,
                    'X-Requested-With': 'XMLHttpRequest' // Basic CSRF protection
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error('LLM API request failed', { status: response.status, error: errorText });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            Logger.error('LLM request error', error.message);
            throw error;
        }
    }
}

module.exports = new LLMProvider();