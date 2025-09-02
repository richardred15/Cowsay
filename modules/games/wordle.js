const gameManager = require("../gameManager");
const BaseGame = require("./baseGame");
const GameUI = require("./gameUI");
const fs = require("fs");

class WordleGame extends BaseGame {
    constructor() {
        super("wordle");
        this.guesses = [];
        this.maxGuesses = 6;
        this.gameOver = false;
        this.won = false;
        this.words = JSON.parse(
            fs.readFileSync("./data/wordle_words.json", "utf-8")
        );
        console.log(this.words[0]);
    }

    selectRandomWord() {
        return this.words[Math.floor(Math.random() * this.words.length)];
    }

    isValidWord(word) {
        // Simple validation - could be expanded with a proper dictionary
        return word.length === 5 && /^[A-Z]+$/.test(word);
    }

    makeGuess(gameData, word) {
        if (gameData.gameOver) {
            return { success: false, message: "Game is already over!" };
        }

        if (gameData.guesses.length >= gameData.maxGuesses) {
            return { success: false, message: "No more guesses remaining!" };
        }

        word = word.toUpperCase();
        if (!this.isValidWord(word)) {
            return {
                success: false,
                message: "Please enter a valid 5-letter word!",
            };
        }

        const feedback = this.getFeedback(gameData, word);
        gameData.guesses.push({ word, feedback });

        if (word === gameData.targetWord) {
            gameData.won = true;
            gameData.gameOver = true;
        } else if (gameData.guesses.length >= gameData.maxGuesses) {
            gameData.gameOver = true;
        }

        return { success: true };
    }

    getFeedback(gameData, guess) {
        const feedback = [];
        const targetLetters = gameData.targetWord.split("");
        const guessLetters = guess.split("");

        // First pass: mark correct positions
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                feedback[i] = "🟩";
                targetLetters[i] = null; // Mark as used
                guessLetters[i] = null; // Mark as used
            }
        }

        // Second pass: mark wrong positions
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] !== null) {
                const targetIndex = targetLetters.indexOf(guessLetters[i]);
                if (targetIndex !== -1) {
                    feedback[i] = "🟨";
                    targetLetters[targetIndex] = null; // Mark as used
                } else {
                    feedback[i] = "⬜";
                }
            }
        }

        return feedback;
    }

    getUsedLetters(gameData) {
        const used = new Set();
        gameData.guesses.forEach((guess) => {
            guess.word.split("").forEach((letter) => used.add(letter));
        });
        return Array.from(used).sort().join(" ");
    }

    generateDisplay(gameData) {
        let display = `🎯 **WORDLE** - Guess ${gameData.guesses.length}/${gameData.maxGuesses}\n`;

        if (gameData.bet > 0) {
            display += `💰 Bet: ${gameData.bet} coins\n`;
        }

        display += "\n";

        // Show guesses
        for (let i = 0; i < gameData.maxGuesses; i++) {
            if (i < gameData.guesses.length) {
                const guess = gameData.guesses[i];
                display += `${guess.word.split("").join("   ")}\n`;
                display += `${guess.feedback.join("")}\n`;
            } else {
                display += "☐ ☐ ☐ ☐ ☐\n";
            }
        }

        // Show used letters
        if (gameData.guesses.length > 0) {
            display += `\n💡 Used: ${this.getUsedLetters(gameData)}`;
        }

        // Game over messages
        if (gameData.gameOver) {
            if (gameData.won) {
                display += `\n\n🎉 **Congratulations!** You guessed it in ${gameData.guesses.length} tries!`;
                if (gameData.bet > 0) {
                    display += `\n💰 You won ${gameData.bet * 2} coins!`;
                }
            } else {
                display += `\n\n💀 **Game Over!** The word was: **${gameData.targetWord}**`;
                if (gameData.bet > 0) {
                    display += `\n💸 You lost ${gameData.bet} coins.`;
                }
            }
        } else {
            display += `\n\nType \`!guess <word>\` to make your next guess!`;
        }

        return display;
    }

    async start(message) {
        const gameData = {
            type: "wordle",
            phase: "playing",
            creator: message.author.id,
            createdAt: Date.now(),
            targetWord: this.selectRandomWord(),
            guesses: [],
            maxGuesses: 6,
            gameOver: false,
            won: false,
            bet: 0,
        };
        const gameKey = `wordle_${message.author.id}`;

        const embed = GameUI.createGameEmbed(
            "Wordle Started!",
            this.generateDisplay(gameData),
            0x4caf50
        );

        await message.reply({ embeds: [embed] });
        return {
            gameData: gameData,
            gameKey: gameKey,
        };
    }

    async handleGuess(message, gameData, word, gameKey) {
        const result = this.makeGuess(gameData, word);

        if (!result.success) {
            await message.reply(`❌ ${result.message}`);
            return;
        }

        const embed = GameUI.createGameEmbed(
            gameData.gameOver
                ? gameData.won
                    ? "Wordle Complete!"
                    : "Wordle Failed!"
                : "Wordle",
            this.generateDisplay(gameData),
            gameData.gameOver ? (gameData.won ? 0x4caf50 : 0xf44336) : 0x2196f3
        );

        await message.reply({ embeds: [embed] });

        if (gameData.gameOver) {
            await this.recordGameOutcome(
                gameData,
                gameData.won ? message.author.id : null,
                {
                    guesses: gameData.guesses.length,
                    word: gameData.targetWord,
                }
            );
        }
    }

    reset() {
        this.guesses = [];
        this.gameOver = false;
        this.won = false;
    }
}

module.exports = new WordleGame();
