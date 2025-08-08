class UnicodeNormalizer {
    constructor() {
        this.lut = new Map([
            // Coptic letters to Latin
            ['ⲛ', 'N'], ['ⲓ', 'I'], ['ⲏ', 'H'], ['ⲧ', 'T'],
            ['ⲇ', 'D'], ['ⲅ', 'G'], ['ⲁ', 'A'], ['ⲉ', 'E'],
            ['ⲟ', 'O'], ['ⲩ', 'U'], ['ⲣ', 'R'], ['ⲥ', 'S'],
            ['ⲕ', 'K'], ['ⲗ', 'L'], ['ⲙ', 'M'], ['ⲫ', 'F'],
            ['ⲭ', 'X'], ['ⲯ', 'PS'], ['ⲱ', 'W'], ['ⲃ', 'B'],
            ['ⲍ', 'Z'], ['ⲑ', 'TH'], ['ⲝ', 'KS'], ['ⲡ', 'P'],
            ['ⲧ', 'T'], ['ⲫ', 'PH'], ['ⲭ', 'KH'], ['ⲯ', 'PS'],
            
            // Regional indicator symbols (flag emojis) to letters
            ['🇦', 'A'], ['🇧', 'B'], ['🇨', 'C'], ['🇩', 'D'],
            ['🇪', 'E'], ['🇫', 'F'], ['🇬', 'G'], ['🇭', 'H'],
            ['🇮', 'I'], ['🇯', 'J'], ['🇰', 'K'], ['🇱', 'L'],
            ['🇲', 'M'], ['🇳', 'N'], ['🇴', 'O'], ['🇵', 'P'],
            ['🇶', 'Q'], ['🇷', 'R'], ['🇸', 'S'], ['🇹', 'T'],
            ['🇺', 'U'], ['🇻', 'V'], ['🇼', 'W'], ['🇽', 'X'],
            ['🇾', 'Y'], ['🇿', 'Z']
        ]);
    }

    normalize(text) {
        return Array.from(text).map(char => this.lut.get(char) || char).join('');
    }

    test() {
        const input = 'ⲛⲓ🇬ⲏⲧ-🇬ⲇⲛ🇬';
        const output = this.normalize(input);
        console.log(`Input: ${input}`);
        console.log(`Output: ${output}`);
        return output === 'NIGHT-GANG';
    }
}

module.exports = new UnicodeNormalizer();