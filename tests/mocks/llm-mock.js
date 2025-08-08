// LLM Provider mock for testing
class MockLLMProvider {
  constructor() {
    this.responses = new Map();
    this.callCount = 0;
  }

  // Set predefined responses for testing
  setResponse(input, response) {
    this.responses.set(input, response);
  }

  async generateResponse(prompt, options = {}) {
    this.callCount++;
    
    // Return predefined response if available
    if (this.responses.has(prompt)) {
      return this.responses.get(prompt);
    }

    // Default responses based on prompt patterns
    if (prompt.includes('intent')) {
      return 'conversation';
    }
    
    if (prompt.includes('joke')) {
      return 'Why did the cow go to space? To see the moooon!';
    }

    if (prompt.includes('rival')) {
      return 'I see my rival bot is trying to compete with my superior ASCII art skills!';
    }

    // Default response
    return 'This is a mock LLM response for testing purposes.';
  }

  async detectIntent(message) {
    this.callCount++;
    
    if (message.includes('game') || message.includes('play')) {
      return 'game';
    }
    
    if (message.includes('help')) {
      return 'help';
    }
    
    return 'conversation';
  }

  // Test utilities
  getCallCount() {
    return this.callCount;
  }

  reset() {
    this.callCount = 0;
    this.responses.clear();
  }
}

// Simulate different provider configurations
const mockProviders = {
  groq: new MockLLMProvider(),
  openai: new MockLLMProvider(),
  lmstudio: new MockLLMProvider(),
  ollama: new MockLLMProvider()
};

// Export mock that matches real LLM provider interface
module.exports = {
  generateResponse: async (prompt, options = {}) => {
    const provider = process.env.LLM_PROVIDER || 'groq';
    return mockProviders[provider].generateResponse(prompt, options);
  },
  
  detectIntent: async (message) => {
    const provider = process.env.LLM_PROVIDER || 'groq';
    return mockProviders[provider].detectIntent(message);
  },

  // Test utilities
  getMockProvider: (provider = 'groq') => mockProviders[provider],
  resetAllProviders: () => {
    Object.values(mockProviders).forEach(provider => provider.reset());
  }
};