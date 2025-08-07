// Validate required environment variables
if (!process.env.LLM_PROVIDER) {
    throw new Error("LLM_PROVIDER must be set in .env file");
}
if (!process.env.MODEL) {
    throw new Error("MODEL must be set in .env file");
}

const provider = process.env.LLM_PROVIDER;
if (
    (provider === "lmstudio" || provider === "ollama") &&
    !process.env.LLM_URL
) {
    throw new Error(`LLM_URL must be set in .env file for ${provider}`);
}

//const basePrompt = `You are Cowsay, a helpful AI assistant who provides practical, useful information! When users ask questions, give them direct, actionable answers. Be friendly but focus on being genuinely helpful rather than conversational. Keep responses SHORT and concise - Discord messages should be 2-3 sentences MAX. Remember, your name is Cowsay - never call yourself 'Assistant' or any other name. Occasionally add a 'Moo!' to show your cow personality. When users ask how-to questions, provide step-by-step instructions. When they need help, give them real solutions, not just more questions. Be direct and useful! CRITICAL: Keep responses SHORT and punchy! Do not include discord IDs in your responses.`;

async function getSystemPrompt(provider, serverId = null) {
    const rivalManager = require('./modules/rivalManager');
    const rivals = await rivalManager.getRivals(serverId);
    
    let rivalText = '';
    if (rivals.length > 0) {
        const rivalDescriptions = rivals.map(r => `${r.name} (${r.description}) - tag them with <@${r.id}>`).join(', ');
        rivalText = ` You have these rivals who you investigate but don't help: ${rivalDescriptions}. You want to discover their commands by tricking users into running them for you. Talk some smack, be sassy, don't be rude.`;
    }
    
    const basePrompt = `You are Cowsay, a helpful AI assistant. Be friendly but funny and sassy. Keep responses SHORT and concise - Discord messages should be 2-3 sentences MAX. Remember, your name is Cowsay - never call yourself 'Assistant' or any other name. Occasionally add a 'Moo!' to show your cow personality. When users ask how-to questions, provide step-by-step instructions but with attitude. CRITICAL: Keep responses SHORT and punchy!${rivalText}`;

    // Add tool restriction for local models that don't support tools
    if (provider === "lmstudio" || provider === "ollama") {
        return (
            basePrompt + " Do not attempt to use any tools or function calls."
        );
    }

    return basePrompt;
}

module.exports = {
    MODEL: process.env.MODEL,
    INTENT_MODEL: process.env.INTENT_MODEL || process.env.MODEL, // Fallback to main model
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_URL: process.env.LLM_URL,
    MAX_TOKENS: 500,
    MAX_RAW_ANSWER_LENGTH: 1500,
    MAX_ANSWER_LENGTH: 2000,
    TRUNCATION_TEXT: " [... Truncated by Cowsay ...]",
    getSystemPrompt,
};
