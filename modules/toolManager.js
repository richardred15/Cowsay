const characterManager = require("./characterManager");
const SecurityUtils = require("./security");
const Logger = require("./logger");
const request = require("sync-request");

class ToolManager {
    constructor() {
        this.animals = [];
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
                            enum: this.animals,
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

        this.wikiSearchTool = {
            type: "function",
            function: {
                name: "wikipedia_search",
                description: "Search Wikipedia for information",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query",
                        },
                    },
                    required: ["query"],
                },
            },
        };

        this.wikiSummaryTool = {
            type: "function",
            function: {
                name: "wikipedia_summary",
                description: "Get a summary from Wikipedia",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query",
                        },
                    },
                    required: ["query"],
                },
            },
        };
    }

    async getTools() {
        const animalSayTool = await this.getAnimalSayTool();
        return [animalSayTool]; //, this.wikiSearchTool, this.wikiSummaryTool];
    }

    async getAnimalSayTool() {
        return new Promise((resolve) => {
            if (this.animals.length === 0) {
                characterManager.getCharacters().then((characters) => {
                    this.animals = characters;
                    this.animalSayTool.function.parameters.properties.animal.enum =
                        this.animals;
                    resolve(this.animalSayTool);
                });
            } else {
                resolve(this.animalSayTool);
            }
        });
    }

    async handleToolCalls(toolCalls, userId = null) {
        let response = "";
        for (const toolCall of toolCalls) {
            switch (toolCall.function.name) {
                case "animalsay":
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const asciiArt = await this.handleAnimalSay(
                            args.animal,
                            args.message
                        );
                        response += asciiArt;
                    } catch (error) {
                        console.error("Tool call error:", error);
                        response += "\n[ASCII art generation failed]";
                    }
                    break;
                case "wikipedia_search":
                    break;
                case "wikipedia_summary":
                    console.log(toolCall);
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const summary = JSON.parse(
                            request(
                                "GET",
                                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
                                    args.query
                                )}`
                            ).getBody("utf8")
                        );
                        if (summary.extract == null) {
                            response += `\n**No summary found for ${args.query}**`;
                            continue;
                        } else {
                            response += `\n**Summary for ${args.query}:**\n${summary.extract}`;
                        }
                    } catch (error) {
                        console.error("Wikipedia summary error:", error);
                        response += "\n[Wikipedia summary generation failed]";
                    }
                    break;
                default:
                    Logger.debug(`Tool call: ${toolCall}`);
                    console.log(toolCall);
                    break;
            }
        }
        return response;
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

            return await characterManager.generateAscii(
                animal,
                message,
                userId
            );
        } catch (error) {
            Logger.error("Animal say tool error", {
                animal,
                error: error.message,
            });
            throw error;
        }
    }
}

module.exports = new ToolManager();
