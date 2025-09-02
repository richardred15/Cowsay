const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const BaseGame = require("./baseGame");
const gameUI = require("./gameUI");
const gameRewards = require("./gameRewards");
const currencyManager = require("../currencyManager");
const fs = require("fs");

class Hangman extends BaseGame {
    constructor() {
        super("hangman");
        this.words = fs
            .readFileSync("/var/www/richard/projects/Cowsay/words.txt", "utf-8")
            .split("\n");
        this.hangmanStages = [
            "```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```",
        ];
    }

    async start(message) {
        const embed = new EmbedBuilder()
            .setTitle("🎯 Hangman")
            .setDescription(
                "Guess the word letter by letter! Choose your bet amount to start."
            )
            .setColor(0x00ae86);

        await gameUI.requestBetAmount(
            {
                user: message.author,
                reply: async (options) => await message.reply(options),
            },
            this.handleBetPlaced.bind(this),
            { message },
            {
                title: "Hangman - Place Your Bet",
                description: "Choose your bet amount:",
                amounts: [10, 25, 50, 100],
                minBet: 10,
                updateOriginal: false,
            }
        );

        return {
            gameKey: `hangman_setup_${message.author.id}`,
            gameData: {
                type: "hangman",
                phase: "betting",
                creator: message.author.id,
            },
        };
    }

    async handleBetPlaced(interaction, betAmount, payload) {
        const { message } = payload;
        const userId = message.author.id;

        const canAfford = await currencyManager.spendCoins(
            userId,
            betAmount,
            "Hangman game bet"
        );

        if (!canAfford) {
            await interaction.reply({
                content: "❌ You don't have enough coins for this bet!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const word =
            this.words[
                Math.floor(Math.random() * this.words.length)
            ].toUpperCase();
        const gameData = this.createBaseGameData(
            message.author,
            message.guild?.id,
            {
                phase: "playing",
                word: word,
                guessedLetters: [],
                wrongGuesses: 0,
                maxWrong: 6,
                betAmount: betAmount,
                channelId: message.channel.id,
            }
        );

        const gameKey = `hangman_${userId}`;
        const gameManager = require("../gameManager");
        gameManager.activeGames.set(gameKey, gameData);

        const embed = this.createGameEmbed(gameData);
        const buttons = this.createLetterButtons(gameData);

        await interaction.update({
            embeds: [embed],
            components: buttons,
        });
        return true;
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("hangman_")) return false;

        const letter = interaction.customId.split("_")[1];
        const userId = interaction.user.id;

        if (!gameData || !gameData.guessedLetters) {
            await interaction.reply({
                content: "Game not found!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.creator !== userId) {
            await interaction.reply({
                content: "This isn't your game!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.guessedLetters.includes(letter)) {
            await interaction.reply({
                content: "You already guessed that letter!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        gameData.guessedLetters.push(letter);

        if (!gameData.word.includes(letter)) {
            gameData.wrongGuesses++;
        }

        const isWin = gameData.word
            .split("")
            .every((l) => gameData.guessedLetters.includes(l));
        const isLose = gameData.wrongGuesses >= gameData.maxWrong;

        if (isWin || isLose) {
            gameData.phase = "ended";
            await this.endGame(
                interaction,
                gameData,
                gameKey,
                gameManager,
                isWin
            );
        } else {
            const embed = this.createGameEmbed(gameData);
            const buttons = this.createLetterButtons(gameData);
            await interaction.update({ embeds: [embed], components: buttons });
        }

        return true;
    }

    async endGame(interaction, gameData, gameKey, gameManager, isWin) {
        let payout = 0;
        let resultText = "";

        if (isWin) {
            const isPerfect = gameData.wrongGuesses === 0;
            payout = isPerfect
                ? gameData.betAmount * 3
                : gameData.betAmount * 2;
            await currencyManager.addBalance(gameData.creator, payout);

            const profit = payout - gameData.betAmount;
            resultText = `🎉 You won! +${profit} coins${
                isPerfect ? " (Perfect game bonus!)" : ""
            }`;
        } else {
            resultText = `💀 You lost! The word was **${gameData.word}**. -${gameData.betAmount} coins`;
        }

        const embed = this.createGameEmbed(gameData, true)
            .addFields({
                name: "🎊 Game Result",
                value: resultText,
                inline: false,
            })
            .setColor(isWin ? 0x00ff00 : 0xff0000);

        await interaction.update({ embeds: [embed], components: [] });

        this.recordGameOutcome(
            gameData,
            isWin ? gameData.creator : "ai_player",
            {
                player1_id: gameData.creator,
                player1_name: gameData.creatorName,
                player2_id: "ai_player",
                player2_name: "Hangman",
                final_score: {
                    word: gameData.word,
                    wrong_guesses: gameData.wrongGuesses,
                    bet_amount: gameData.betAmount,
                    perfect: gameData.wrongGuesses === 0,
                },
                game_mode: "single",
            }
        );

        gameManager.deleteGame(gameKey);
    }

    createGameEmbed(gameData, showWord = false) {
        const word = this.renderWordProgress(
            gameData.word,
            gameData.guessedLetters,
            showWord
        );
        const wrongLetters = gameData.guessedLetters.filter(
            (l) => !gameData.word.includes(l)
        );

        return new EmbedBuilder()
            .setTitle("🎯 Hangman")
            .setDescription(
                `${this.hangmanStages[gameData.wrongGuesses]}\n` +
                    `**Word:** \`${word}\`\n` +
                    `**Wrong letters:** ${
                        wrongLetters.join(", ") || "None"
                    }\n` +
                    `**Remaining guesses:** ${
                        gameData.maxWrong - gameData.wrongGuesses
                    }`
            )
            .setColor(0x00ae86);
    }

    renderWordProgress(word, guessedLetters, showAll = false) {
        if (showAll) return word.split("").join(" ");
        return word
            .split("")
            .map((letter) => (guessedLetters.includes(letter) ? letter : "_"))
            .join(" ");
    }

    createLetterButtons(gameData) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const buttons = [];

        // Create 5 rows with 5 letters each (25 letters), skip Z to fit Discord limits
        for (let i = 0; i < 25; i += 5) {
            const row = new ActionRowBuilder();
            for (let j = i; j < Math.min(i + 5, 25); j++) {
                const letter = alphabet[j];
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`hangman_${letter}`)
                        .setLabel(letter)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(gameData.guessedLetters.includes(letter))
                );
            }
            buttons.push(row);
        }

        return buttons;
    }
}

module.exports = new Hangman();
