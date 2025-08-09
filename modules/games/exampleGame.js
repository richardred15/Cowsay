const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const BaseGame = require("./baseGame");
const gameUI = require("./gameUI");
const gameRewards = require("./gameRewards");
const currencyManager = require("../currencyManager");

class ExampleGame extends BaseGame {
    constructor() {
        super("example");
    }

    async start(message) {
        const embed = new EmbedBuilder()
            .setTitle("🎮 Example Game")
            .setDescription("A simple coin flip game! Choose heads or tails and place your bet.")
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("example_heads")
                .setLabel("🪙 Heads")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("example_tails")
                .setLabel("🪙 Tails")
                .setStyle(ButtonStyle.Secondary)
        );

        await message.reply({ embeds: [embed], components: [buttons] });
        
        const gameData = this.createBaseGameData(message.author, message.guild?.id, {
            phase: "betting",
            channelId: message.channel.id
        });

        return { gameKey: `example_${message.author.id}`, gameData };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("example_")) return false;

        if (interaction.customId === "example_heads" || interaction.customId === "example_tails") {
            const choice = interaction.customId.split("_")[1];
            return await gameUI.requestBetAmount(
                interaction,
                this.handleBetPlaced.bind(this),
                { choice, gameData, gameKey, gameManager },
                {
                    title: `Betting on ${choice.charAt(0).toUpperCase() + choice.slice(1)}`,
                    description: "Choose your bet amount:",
                    minBet: 10
                }
            );
        }

        return false;
    }

    async handleBetPlaced(interaction, betAmount, payload) {
        const { choice, gameData, gameKey, gameManager } = payload;
        const userId = interaction.user.id;

        // Check if user can afford the bet
        const canAfford = await currencyManager.spendCoins(
            userId,
            betAmount,
            `Example game bet: ${choice}`
        );

        if (!canAfford) {
            await interaction.reply({
                content: "❌ You don't have enough coins for this bet!",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        // Flip the coin
        const CryptoRandom = require("../cryptoRandom");
        const result = CryptoRandom.randomInt(0, 1) === 0 ? "heads" : "tails";
        const won = choice === result;

        // Calculate payout
        let payout = 0;
        if (won) {
            payout = betAmount * 2; // 2x payout for winning
            await currencyManager.addBalance(userId, payout);
        }

        // Create result embed
        const embed = new EmbedBuilder()
            .setTitle("🎮 Example Game Results")
            .setDescription(`The coin landed on: **${result.toUpperCase()}** ${result === "heads" ? "🪙" : "🔄"}`)
            .addFields(
                { name: "Your Choice", value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
                { name: "Result", value: won ? "✅ You Won!" : "❌ You Lost", inline: true },
                { name: "Payout", value: won ? `+${payout - betAmount} coins` : `-${betAmount} coins`, inline: true }
            )
            .setColor(won ? 0x00ff00 : 0xff0000);

        await interaction.reply({
            content: `🎊 ${won ? "Congratulations!" : "Better luck next time!"} ${won ? `You won ${payout - betAmount} coins!` : `You lost ${betAmount} coins.`}`,
            flags: MessageFlags.Ephemeral
        });

        // Auto-delete after 12 seconds
        gameUI.autoDeleteEphemeral(interaction, 12000);

        // Record game outcome
        const players = [{ id: userId, name: this.sanitizePlayerName(interaction.user.displayName) }];
        const winnerId = won ? userId : "ai_player";
        
        this.recordGameOutcome(gameData, winnerId, players, {
            aiName: "Coin",
            finalScore: {
                player_choice: choice,
                coin_result: result,
                bet_amount: betAmount,
                payout: payout,
                profit: won ? (payout - betAmount) : -betAmount
            },
            gameMode: "single"
        });

        // Clean up
        gameManager.activeGames.delete(gameKey);
        return true;
    }
}

module.exports = new ExampleGame();