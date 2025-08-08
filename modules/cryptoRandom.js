const crypto = require('crypto');

class CryptoRandom {
    // Generate cryptographically secure random integer between min and max (inclusive)
    static randomInt(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;
        
        let randomValue;
        do {
            const randomBytes = crypto.randomBytes(bytesNeeded);
            randomValue = randomBytes.readUIntBE(0, bytesNeeded);
        } while (randomValue > maxValid);
        
        return min + (randomValue % range);
    }
    
    // Secure array shuffle using Fisher-Yates algorithm
    static shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = this.randomInt(0, i);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

module.exports = CryptoRandom;