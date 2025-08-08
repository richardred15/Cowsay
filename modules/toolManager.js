const characterManager = require('./characterManager');
const SecurityUtils = require('./security');
const Logger = require('./logger');

class ToolManager {
    constructor() {
        this.animalSayTool = {
            type: "function",
            function: {
                name: "animalsay",
                description: "Generate ASCII art of an animal saying a message",
                parameters: {
                    type: "object",
                    properties: {
                        animal: {
                            type: "string",
                            enum: characterManager.getCharacters(),
                            description: "The animal character to use",
                        },
                        message: {
                            type: "string",
                            description: "The message for the animal to say",
                        },
                    },
                    required: ["animal", "message"],
                },
            },
        };
    }

    getAnimalSayTool() {
        return this.animalSayTool;
    }

    async handleAnimalSay(animal, message, userId = null) {
        try {
            const animalValidation = SecurityUtils.validateInput(animal, 50);
            const messageValidation = SecurityUtils.validateInput(message, 500);
            
            if (!animalValidation.valid) {
                throw new Error(`Invalid animal: ${animalValidation.error}`);
            }
            if (!messageValidation.valid) {
                throw new Error(`Invalid message: ${messageValidation.error}`);
            }
            
            return await characterManager.generateAscii(animal, message, userId);
        } catch (error) {
            Logger.error('Animal say tool error', { animal, error: error.message });
            throw error;
        }
    }
}

module.exports = new ToolManager();