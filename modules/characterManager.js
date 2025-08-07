const cowsay = require("cowsay");
const Logger = require('./logger');

class CharacterManager {
    constructor() {
        this.characters = [];
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

    generateAscii(animal, message) {
        try {
            return cowsay.say({ text: message, f: animal });
        } catch (error) {
            Logger.error('Character generation error:', error);
            return cowsay.say({ text: message }); // fallback to default
        }
    }
}

module.exports = new CharacterManager();