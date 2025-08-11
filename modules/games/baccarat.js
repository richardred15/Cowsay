const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const BaseGame = require("./baseGame");
const gameUI = require("./gameUI");
const currencyManager = require("../currencyManager");
const cardRenderer = require("../cardRenderer");

class Baccarat extends BaseGame {
    constructor() {
        super("baccarat");
    }

    async start(message) {
        const gameKey = `baccarat_${message.channel.id}`;
        const gameData = this.createBaseGameData(message.author, message.guild?.id, {
            phase: "betting",
            channelId: message.channel.id,
            bets: new Map(),
            betStartTime: Date.now(),
            bettingDuration: 60000
        });

        const gameManager = require("../gameManager");
        gameManager.activeGames.set(gameKey, gameData);

        const embed = this.createBettingEmbed(gameData);
        const buttons = this.createBettingButtons();

        const reply = await message.reply({ embeds: [embed], components: buttons });
        gameData.messageId = reply.id;

        this.startBettingCountdown(gameKey, gameManager);

        return { gameKey, gameData };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("baccarat_")) return false;

        const action = interaction.customId.split("_")[1];
        const userId = interaction.user.id;

        if (gameData.phase !== "betting") {
            await interaction.reply({
                content: "Betting is closed!",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (action === "player" || action === "banker" || action === "tie") {
            return await gameUI.requestBetAmount(
                interaction,
                this.handleBetPlaced.bind(this),
                { gameData, gameKey, gameManager, betType: action },
                {
                    title: `Baccarat - Bet on ${action.charAt(0).toUpperCase() + action.slice(1)}`,
                    description: "Choose your bet amount:",
                    amounts: [10, 25, 50, 100],
                    minBet: 10,
                    updateOriginal: false
                }
            );
        }

        return false;
    }

    async handleBetPlaced(interaction, betAmount, payload) {
        const { gameData, gameKey, gameManager, betType } = payload;
        const userId = interaction.user.id;

        const canAfford = await currencyManager.spendCoins(
            userId,
            betAmount,
            `Baccarat ${betType} bet`
        );

        if (!canAfford) {
            await interaction.reply({
                content: "❌ You don't have enough coins for this bet!",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!gameData.bets.has(userId)) {
            gameData.bets.set(userId, {});
        }
        gameData.bets.get(userId)[betType] = betAmount;

        await interaction.reply({
            content: `✅ Placed ${betAmount} coins on ${betType.toUpperCase()}!`,
            flags: MessageFlags.Ephemeral
        });

        gameUI.autoDeleteEphemeral(interaction, 5000);
        return true;
    }

    async startBettingCountdown(gameKey, gameManager) {
        const interval = setInterval(async () => {
            const gameData = gameManager.activeGames.get(gameKey);
            if (!gameData) {
                clearInterval(interval);
                return;
            }

            const timeLeft = Math.max(0, gameData.bettingDuration - (Date.now() - gameData.betStartTime));

            if (timeLeft <= 0) {
                clearInterval(interval);
                await this.startDealing(gameKey, gameManager);
                return;
            }

            // Update every second in final 10 seconds, every 5 seconds otherwise
            const shouldUpdate = timeLeft <= 10000 || (Math.floor(timeLeft / 1000) % 5 === 0);
            if (shouldUpdate) {
                await this.updateBettingDisplay(gameData);
            }
        }, 1000);
    }

    async updateBettingDisplay(gameData) {
        try {
            const gameManager = require("../gameManager");
            const client = gameManager.client || require("../index").client;
            if (!client) return;

            const channel = await client.channels.fetch(gameData.channelId);
            if (!channel) return;

            const message = await channel.messages.fetch(gameData.messageId);
            const embed = this.createBettingEmbed(gameData);
            const buttons = this.createBettingButtons();

            await message.edit({ embeds: [embed], components: buttons });
        } catch (error) {
            // Message might be deleted or channel unavailable
        }
    }

    async startDealing(gameKey, gameManager) {
        const gameData = gameManager.activeGames.get(gameKey);
        if (!gameData) return;

        gameData.phase = "dealing";
        gameData.deck = this.createDeck();
        gameData.playerHand = [];
        gameData.bankerHand = [];

        // Deal initial cards
        gameData.playerHand.push(gameData.deck.pop(), gameData.deck.pop());
        gameData.bankerHand.push(gameData.deck.pop(), gameData.deck.pop());

        const playerTotal = this.calculateTotal(gameData.playerHand);
        const bankerTotal = this.calculateTotal(gameData.bankerHand);

        // Check for naturals
        const playerNatural = playerTotal >= 8;
        const bankerNatural = bankerTotal >= 8;

        if (!playerNatural && !bankerNatural) {
            // Apply third card rules
            this.applyThirdCardRules(gameData);
        }

        gameData.phase = "finished";
        await this.announceResults(gameData, gameManager);
        gameManager.deleteGame(gameKey);
    }

    applyThirdCardRules(gameData) {
        const playerTotal = this.calculateTotal(gameData.playerHand);
        const bankerTotal = this.calculateTotal(gameData.bankerHand);
        let playerThirdCard = null;

        // Player third card rule
        if (playerTotal <= 5) {
            playerThirdCard = gameData.deck.pop();
            gameData.playerHand.push(playerThirdCard);
        }

        // Banker third card rules
        if (playerThirdCard === null) {
            // Player didn't draw
            if (bankerTotal <= 5) {
                gameData.bankerHand.push(gameData.deck.pop());
            }
        } else {
            // Player drew a third card
            const thirdCardValue = this.getCardValue(playerThirdCard);
            if (
                (bankerTotal <= 2) ||
                (bankerTotal === 3 && thirdCardValue !== 8) ||
                (bankerTotal === 4 && [2,3,4,5,6,7].includes(thirdCardValue)) ||
                (bankerTotal === 5 && [4,5,6,7].includes(thirdCardValue)) ||
                (bankerTotal === 6 && [6,7].includes(thirdCardValue))
            ) {
                gameData.bankerHand.push(gameData.deck.pop());
            }
        }
    }

    async announceResults(gameData, gameManager) {
        const playerTotal = this.calculateTotal(gameData.playerHand);
        const bankerTotal = this.calculateTotal(gameData.bankerHand);
        
        let winner;
        if (playerTotal > bankerTotal) winner = "player";
        else if (bankerTotal > playerTotal) winner = "banker";
        else winner = "tie";

        const embed = this.createResultEmbed(gameData, winner, playerTotal, bankerTotal);
        
        // Process payouts and show betting details
        const payouts = [];
        const losers = [];
        const allBets = [];
        
        if (gameData.bets.size === 0) {
            embed.addFields({
                name: "💰 Results",
                value: "No bets were placed!",
                inline: false
            });
        } else {
            for (const [userId, userBets] of gameData.bets) {
                let totalPayout = 0;
                let totalProfit = 0;
                const userBetDetails = [];
                
                for (const [betType, betAmount] of Object.entries(userBets)) {
                    let payout = 0;
                    let result = "❌";
                    
                    if (betType === winner) {
                        if (betType === "player") payout = betAmount * 2;
                        else if (betType === "banker") payout = Math.floor(betAmount * 1.95);
                        else if (betType === "tie") payout = betAmount * 9;
                        
                        await currencyManager.addBalance(userId, payout);
                        totalPayout += payout;
                        totalProfit += (payout - betAmount);
                        result = "✅";
                    } else {
                        totalProfit -= betAmount;
                    }
                    
                    userBetDetails.push(`${result} ${betType.toUpperCase()}: ${betAmount} coins`);
                }
                
                allBets.push(`<@${userId}>: ${userBetDetails.join(", ")}`);
                
                if (totalProfit > 0) {
                    payouts.push(`<@${userId}>: +${totalProfit} coins`);
                } else if (totalProfit < 0) {
                    losers.push(`<@${userId}>: ${totalProfit} coins`);
                }
            }

            embed.addFields({
                name: "🎲 All Bets",
                value: allBets.join("\n"),
                inline: false
            });

            if (payouts.length > 0) {
                embed.addFields({
                    name: "🎊 Winners",
                    value: payouts.join("\n"),
                    inline: false
                });
            }
            
            if (losers.length > 0) {
                embed.addFields({
                    name: "💸 Losers",
                    value: losers.join("\n"),
                    inline: false
                });
            }
        }

        try {
            const gameManager = require("../gameManager");
            const client = gameManager.client || require("../index").client;
            if (client) {
                const channel = await client.channels.fetch(gameData.channelId);
                if (channel) {
                    const message = await channel.messages.fetch(gameData.messageId);
                    await message.edit({ embeds: [embed], components: [] });
                }
            }
        } catch (error) {
            // Message might be deleted
        }

        // Record statistics
        this.recordGameOutcome(gameData, winner, {
            player1_id: gameData.creator,
            player1_name: gameData.creatorName,
            player2_id: "ai_player",
            player2_name: "Baccarat",
            final_score: {
                player_total: playerTotal,
                banker_total: bankerTotal,
                winner: winner,
                total_bets: gameData.bets.size
            },
            game_mode: "multiplayer"
        });
    }

    createBettingEmbed(gameData) {
        const timeLeft = Math.max(0, gameData.bettingDuration - (Date.now() - gameData.betStartTime));
        const seconds = Math.ceil(timeLeft / 1000);
        
        let bettingSummary = "No bets placed yet";
        if (gameData.bets.size > 0) {
            const playerBets = Array.from(gameData.bets.values()).reduce((sum, bets) => sum + (bets.player || 0), 0);
            const bankerBets = Array.from(gameData.bets.values()).reduce((sum, bets) => sum + (bets.banker || 0), 0);
            const tieBets = Array.from(gameData.bets.values()).reduce((sum, bets) => sum + (bets.tie || 0), 0);
            
            bettingSummary = `Player: ${playerBets} coins • Banker: ${bankerBets} coins • Tie: ${tieBets} coins`;
        }

        return new EmbedBuilder()
            .setTitle("🎰 Baccarat - Betting Phase")
            .setDescription(
                "**Payouts:**\n" +
                "• Player: 2:1\n" +
                "• Banker: 1.95:1\n" +
                "• Tie: 8:1\n\n" +
                `**Current Bets:** ${bettingSummary}\n` +
                `**Time Remaining:** ${seconds} seconds`
            )
            .setColor(0x00ae86);
    }

    createResultEmbed(gameData, winner, playerTotal, bankerTotal) {
        const playerCards = gameData.playerHand.map(card => `${card.rank}${card.suit}`).join(" ");
        const bankerCards = gameData.bankerHand.map(card => `${card.rank}${card.suit}`).join(" ");
        
        const winnerText = winner === "tie" ? "TIE" : winner.toUpperCase();
        const color = winner === "player" ? 0x0099ff : winner === "banker" ? 0xff9900 : 0x9900ff;

        return new EmbedBuilder()
            .setTitle(`🎰 Baccarat Results - ${winnerText} WINS!`)
            .addFields(
                {
                    name: "👤 Player Hand",
                    value: `${playerCards} = **${playerTotal}**`,
                    inline: true
                },
                {
                    name: "🏦 Banker Hand", 
                    value: `${bankerCards} = **${bankerTotal}**`,
                    inline: true
                }
            )
            .setColor(color);
    }

    createBettingButtons() {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("baccarat_player")
                    .setLabel("👤 Player (2:1)")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("baccarat_banker")
                    .setLabel("🏦 Banker (1.95:1)")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("baccarat_tie")
                    .setLabel("🤝 Tie (8:1)")
                    .setStyle(ButtonStyle.Success)
            )
        ];
    }

    createDeck() {
        const suits = ["♠", "♥", "♦", "♣"];
        const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
        const deck = [];

        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ rank, suit });
            }
        }

        return this.shuffleDeck(deck);
    }

    shuffleDeck(deck) {
        const CryptoRandom = require("../cryptoRandom");
        return CryptoRandom.shuffle(deck);
    }

    getCardValue(card) {
        if (card.rank === "A") return 1;
        if (["J", "Q", "K"].includes(card.rank)) return 0;
        return parseInt(card.rank);
    }

    calculateTotal(hand) {
        const total = hand.reduce((sum, card) => sum + this.getCardValue(card), 0);
        return total % 10;
    }
}

module.exports = new Baccarat();