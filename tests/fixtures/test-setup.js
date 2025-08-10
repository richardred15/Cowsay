const path = require("path");

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.DB_PORT || "3306";
process.env.DB_USER = process.env.DB_USER || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test_password";
process.env.DB_NAME = process.env.DB_NAME || "cowsay_test";
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || "test_token";
process.env.GROQ_API_KEY = "mock_key";
process.env.LLM_PROVIDER = "groq";
process.env.MODEL = "test-model";

// Mock external services
jest.mock("discord.js", () => require("../mocks/discord-mock"));
jest.mock("../../modules/llmProvider", () => require("../mocks/llm-mock"));

// Initialize database like production does
beforeAll(async () => {
    const database = require("../../modules/database");
    await database.init();
});

// Global test utilities
global.testUtils = {
    /* createMockUser: () => ({
        id: "123456789",
        username: "testuser",
        displayName: "Test User",
    }),
    createMockMessage: (content = "test message") => ({
        content,
        author: global.testUtils.createMockUser(),
        channel: { send: jest.fn() },
        reply: jest.fn(),
    }),
    createMockInteraction: (options = {}) => {
        const interaction = new MockInteraction();

        if (options.customId) {
            interaction.customId = options.customId;
        }

        if (options.user) {
            interaction.user = { ...interaction.user, ...options.user };
        }

        return interaction;
    }, */
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Cleanup after each test
afterEach(async () => {
    jest.clearAllMocks();
});
