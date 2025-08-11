const cowsay = require("cowsay");
const Logger = require("./logger");
const inventoryManager = require("./inventoryManager");

class CharacterManager {
    constructor() {
        this.characters = [];
        this.loaded = false;
        this.premiumCharacters = [
            "dragon",
            "tux",
            "vader",
            "elephant",
            "ghostbusters",
        ];
        this.loadCharacters();
    }

    loadCharacters() {
        cowsay.list((error, cow_names) => {
            if (error) {
                Logger.error("Error loading cowsay characters", error.message);
                this.characters = ["cow"]; // fallback
            } else if (cow_names) {
                this.characters = cow_names;
                this.loaded = true;
                Logger.info("Characters loaded", {
                    count: this.characters.length,
                });
            }
        });
    }

    getCharacters() {
        return new Promise((resolve, reject) => {
            if (this.loaded) {
                resolve(this.characters);
            } else {
                const interval = setInterval(() => {
                    if (this.loaded) {
                        clearInterval(interval);
                        resolve(this.characters);
                    }
                }, 100);
            }
        });
    }

    getFreeCharacters() {
        if (!this.freeCharactersCache) {
            const premiumSet = new Set(this.premiumCharacters);
            this.freeCharactersCache = this.characters.filter(
                (char) => !premiumSet.has(char)
            );
        }
        return this.freeCharactersCache;
    }

    getPremiumCharacters() {
        return this.premiumCharacters;
    }

    async canUseCharacter(userId, character) {
        if (!this.premiumCharacters.includes(character)) {
            return true; // Free character
        }
        return await inventoryManager.hasItem(userId, character);
    }

    async generateAscii(animal, message, userId = null) {
        try {
            // Check if user can use this character
            if (userId && !(await this.canUseCharacter(userId, animal))) {
                return `🔒 **${animal}** is a premium character! Use \`!cowsay shop\` to purchase it.`;
            }
            let ascii = cowsay.say({ text: message, f: animal });
            console.log(ascii);
            const escaped = ascii.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
            if (escaped.length > 1700) {
                const maxContent = 1700 - 8;
                const truncated =
                    escaped.slice(0, maxContent - 20) +
                    "\n[... ASCII too long ...]";
                return `\`\`\`\n${truncated}\n\`\`\``;
            }
            return `\`\`\`\n${escaped}\n\`\`\``;
        } catch (error) {
            Logger.error("Character generation error:", error);
            return cowsay.say({ text: message }); // fallback to default
        }
    }
}

module.exports = new CharacterManager();
