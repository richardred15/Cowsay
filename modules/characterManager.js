const cowsay = require("cowsay");
const Logger = require('./logger');
const inventoryManager = require('./inventoryManager');

class CharacterManager {
    constructor() {
        this.characters = [];
        this.premiumCharacters = ['dragon', 'tux', 'vader', 'elephant', 'ghostbusters'];
        this.loadCharacters();
    }

    loadCharacters() {
        cowsay.list((error, cow_names) => {
            if (error) {
                Logger.error('Error loading cowsay characters', error.message);
                this.characters = ['cow']; // fallback
            } else if (cow_names) {
                this.characters = cow_names;
                Logger.info('Characters loaded', { count: this.characters.length });
            }
        });
    }

    getCharacters() {
        return this.characters;
    }

    getFreeCharacters() {
        if (!this.freeCharactersCache) {
            const premiumSet = new Set(this.premiumCharacters);
            this.freeCharactersCache = this.characters.filter(char => !premiumSet.has(char));
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
            if (userId && !await this.canUseCharacter(userId, animal)) {
                return `🔒 **${animal}** is a premium character! Use \`!cowsay shop\` to purchase it.`;
            }
            
            return cowsay.say({ text: message, f: animal });
        } catch (error) {
            Logger.error('Character generation error:', error);
            return cowsay.say({ text: message }); // fallback to default
        }
    }
}

module.exports = new CharacterManager();