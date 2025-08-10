const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const BaseGame = require('./baseGame');
const gameUI = require('./gameUI');
const gameRewards = require('./gameRewards');
const gameStats = require('../gameStats');
const currencyManager = require("../currencyManager");

class Roulette extends BaseGame {
    constructor() {
        super('roulette');
        
        // Register interaction handlers
        this.registerHandler('bet', this.handleBet.bind(this));
        this.registerHandler('number', this.handleNumberBet.bind(this));
        
        // European roulette wheel order (clockwise from 0)
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
            10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3,
            26,
        ];
        this.redNumbers = [
            1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
        ];
        this.blackNumbers = [
            2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
        ];

        this.betTypes = {
            red: { payout: 1, name: "Red" },
            black: { payout: 1, name: "Black" },
            even: { payout: 1, name: "Even" },
            odd: { payout: 1, name: "Odd" },
            low: { payout: 1, name: "1-18" },
            high: { payout: 1, name: "19-36" },
            straight: { payout: 35, name: "Single Number" },
        };

        this.dealerMessages = {
            betting: [
                "🎩 *The dealer adjusts his bow tie and spins the wheel*",
                "🎰 'Place your bets, ladies and gentlemen!'",
                "🎯 'The wheel is ready, who's feeling lucky tonight?'",
                "🎲 *The dealer taps the table with his finger*",
                "🎰 'Step right up, fortunes await!'",
            ],
            spinning: [
                "🎲 *The dealer gives the wheel a confident spin*",
                "🎰 'Round and round she goes...'",
                "🎯 *The ball dances around the wheel*",
                "🎩 'Let's see where fate takes us!'",
                "🎰 *The dealer watches intently as the wheel spins*",
            ],
            results: [
                "🎊 'We have our winners!' *tips hat*",
                "🎩 *The dealer announces with a flourish*",
                "🎰 'Another exciting round at the table!'",
                "🎯 'Congratulations to our lucky players!'",
                "🎲 *The dealer smiles and collects the chips*",
            ],
        };
    }

    getRandomDealerMessage(phase) {
        const messages = this.dealerMessages[phase];
        const CryptoRandom = require("../cryptoRandom");
        return messages[CryptoRandom.randomInt(0, messages.length - 1)];
    }

    async start(message) {
        const dealerMessage = this.getRandomDealerMessage("betting");

        const embed = new EmbedBuilder()
            .setTitle("🎰 Roulette - Place Your Bets!")
            .setDescription(
                `${dealerMessage}\n\nChoose your bets and amounts. Betting closes in 60 seconds!`
            )
            .addFields(
                { name: "🔴 Red/⚫ Black", value: "1:1 payout", inline: true },
                { name: "🔢 Even/Odd", value: "1:1 payout", inline: true },
                {
                    name: "📍 Single Number",
                    value: "35:1 payout",
                    inline: true,
                },
                { name: "⬇️ Low (1-18)", value: "1:1 payout", inline: true },
                { name: "⬆️ High (19-36)", value: "1:1 payout", inline: true },
                { name: "⏰ Time Left", value: "60 seconds", inline: true }
            )
            .setColor(0x00ae86);

        const buttons = this.createBettingButtons();

        const reply = await message.reply({
            embeds: [embed],
            components: buttons,
        });

        const gameData = this.createBaseGameData(message.author, message.guild?.id, {
            phase: "betting",
            channelId: message.channel.id,
            players: new Map(), // userId -> { bets: [], totalBet: number }
            bettingDuration: 60000, // 60 seconds
            messageId: reply.id,
        });

        const gameKey = `roulette_${message.channel.id}_${Date.now()}`;

        // Start countdown timer
        this.startCountdownTimer(message.channel, gameKey, gameData);

        return { gameKey, gameData };
    }

    createBettingButtons() {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("roulette_bet_red")
                .setLabel("🔴 Red")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("roulette_bet_black")
                .setLabel("⚫ Black")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("roulette_bet_even")
                .setLabel("🔢 Even")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("roulette_bet_odd")
                .setLabel("🔢 Odd")
                .setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("roulette_bet_low")
                .setLabel("⬇️ Low (1-18)")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("roulette_bet_high")
                .setLabel("⬆️ High (19-36)")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("roulette_bet_number")
                .setLabel("📍 Pick Number")
                .setStyle(ButtonStyle.Secondary)
        );

        return [row1, row2];
    }

    // Legacy interaction handler - now uses BaseGame unified system
    async handleGameInteraction(interaction, gameData, gameKey, gameManager) {
        const userId = interaction.user.id;

        // Check if betting phase is still active
        const timeElapsed = Date.now() - gameData.startTime;
        if (timeElapsed >= gameData.bettingDuration) {
            // Start spinning if not already started
            if (gameData.phase === "betting") {
                gameData.phase = "spinning";
                gameManager.activeGames.set(gameKey, gameData);
                await this.spinWheel(interaction, gameData, gameManager, gameKey);
            }
            return true;
        }

        // Handle bet actions (red, black, even, odd, low, high, number)
        if (interaction.customId.startsWith("roulette_bet_")) {
            const betType = interaction.customId.split("_")[2];
            if (betType === "number") {
                return await this.showNumberSelection(interaction);
            }
            return await this.handleBet(interaction, gameData, gameKey, gameManager, betType);
        }
        
        // Handle number selection
        if (interaction.customId.startsWith("roulette_number_")) {
            const number = parseInt(interaction.customId.split("_")[2]);
            return await this.handleNumberBet(interaction, gameData, gameKey, gameManager, number);
        }

        return false;
    }

    async handleBetPlaced(betInteraction, betAmount, payload) {
        const { betType, number, gameData, gameKey, gameManager } = payload;
        return await this.placeBet(
            betInteraction,
            gameData,
            gameKey,
            gameManager,
            betType,
            betAmount,
            number
        );
    }

    async handleBet(interaction, gameData, gameKey, gameManager, betType = null) {
        // Extract bet type if not provided
        if (!betType) {
            betType = interaction.customId.split("_")[2];
        }

        // Handle number selection
        if (betType === "number") {
            return await this.showNumberSelection(interaction);
        }

        // Validate bet type
        if (!this.betTypes[betType]) {
            console.log(`Invalid bet type: '${betType}' from customId: '${interaction.customId}'`);
            await interaction.reply({ content: "❌ Invalid bet type!", flags: MessageFlags.Ephemeral });
            return true;
        }

        return await gameUI.requestBetAmount(
            interaction,
            this.handleBetPlaced.bind(this),
            { betType, gameData, gameKey, gameManager, interaction },
            {
                title: `Betting on ${this.betTypes[betType].name}`,
                description: `Payout: **${this.betTypes[betType].payout}:1**\nChoose your bet amount:`,
                minBet: 1
            }
        );
    }

    async showNumberSelection(interaction) {
        const embed = new EmbedBuilder()
            .setTitle("📍 Pick Your Number")
            .setDescription("Choose a number (0-36) for a 35:1 payout!")
            .setColor(0x00ae86);

        // Create number buttons (0-36)
        const buttons = [];
        for (let row = 0; row < 4; row++) {
            const buttonRow = new ActionRowBuilder();
            for (let col = 0; col < 5; col++) {
                const number = row * 5 + col;
                if (number <= 36) {
                    const color = this.getNumberColor(number);
                    buttonRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`roulette_number_${number}`)
                            .setLabel(`${color}${number}`)
                            .setStyle(
                                number === 0
                                    ? ButtonStyle.Success
                                    : this.redNumbers.includes(number)
                                    ? ButtonStyle.Danger
                                    : ButtonStyle.Secondary
                            )
                    );
                }
            }
            if (buttonRow.components.length > 0) {
                buttons.push(buttonRow);
            }
        }

        await interaction.reply({
            embeds: [embed],
            components: buttons,
            flags: MessageFlags.Ephemeral,
        });
        
        // Store this interaction for cleanup
        if (!this.numberSelectionInteractions) {
            this.numberSelectionInteractions = new Map();
        }
        this.numberSelectionInteractions.set(interaction.user.id, interaction);
        
        return true;
    }



    async handleNumberBet(interaction, gameData, gameKey, gameManager, number = null) {
        // Extract number if not provided
        if (number === null) {
            number = parseInt(interaction.customId.split("_")[2]);
        }
        
        // Delete the number selection message
        if (this.numberSelectionInteractions) {
            const numberInteraction = this.numberSelectionInteractions.get(interaction.user.id);
            if (numberInteraction) {
                try {
                    await numberInteraction.deleteReply();
                } catch (error) {
                    // Message already deleted or expired
                }
                this.numberSelectionInteractions.delete(interaction.user.id);
            }
        }
        
        return await gameUI.requestBetAmount(
            interaction,
            this.handleBetPlaced.bind(this),
            { betType: 'straight', number, gameData, gameKey, gameManager, interaction },
            {
                title: `Betting on Number ${number}`,
                description: 'Payout: **35:1**\nChoose your bet amount:',
                minBet: 1
            }
        );
    }

    async placeBet(
        interaction,
        gameData,
        gameKey,
        gameManager,
        betType,
        betAmount,
        number = null
    ) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        // Check if user can afford the bet
        const canAfford = await currencyManager.spendCoins(
            userId,
            betAmount,
            `Roulette bet: ${betType}${number ? ` ${number}` : ""}`
        );

        if (!canAfford) {
            await interaction.update({
                content: "❌ You don't have enough coins for this bet!",
                embeds: [],
                components: [],
            });
            return true;
        }

        // Add bet to player's bets
        if (!gameData.players.has(userId)) {
            gameData.players.set(userId, {
                name: interaction.user.displayName,
                bets: [],
                totalBet: 0,
            });
        }

        const player = gameData.players.get(userId);
        // Validate bet amount
        if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
            await interaction.reply({
                content: "❌ Invalid bet amount!",
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const bet = {
            type: betType,
            amount: betAmount,
            number: number,
            payout: this.betTypes[betType].payout,
        };

        player.bets.push(bet);
        player.totalBet += betAmount;

        await interaction.reply({
            content: `✅ Bet placed: **${betAmount} coins** on **${
                betType === "straight"
                    ? `Number ${number}`
                    : this.betTypes[betType].name
            }**\nYou can place more bets or wait for the spin!`,
            flags: MessageFlags.Ephemeral
        });

        // Auto-delete ephemeral message after 12 seconds to reduce clutter
        gameUI.autoDeleteEphemeral(interaction, 12000);

        // Update game data in manager
        gameManager.activeGames.set(gameKey, gameData);
        return true;
    }

    async spinWheel(interaction, gameData, gameManager, gameKey) {
        // Check if any bets were placed
        if (!gameData.players || gameData.players.size === 0) {
            const embed = new EmbedBuilder()
                .setTitle("🎰 Roulette - No Bets Placed")
                .setDescription(
                    "No bets were placed this round. Better luck next time!"
                )
                .setColor(0x808080);

            try {
                await interaction.editReply({
                    embeds: [embed],
                    components: [],
                });
            } catch (error) {
                await interaction.followUp({ embeds: [embed] });
            }

            // Clean up
            gameManager.activeGames.delete(gameKey);
            return;
        }

        // Generate winning number (0-36 for European roulette)
        const CryptoRandom = require("../cryptoRandom");
        const winningNumber = CryptoRandom.randomInt(0, 36); // 0-36 inclusive

        // Start animation
        await this.spinAnimation(interaction, winningNumber, gameData);

        // Calculate payouts
        const results = await this.calculatePayouts(gameData, winningNumber);

        // Show final results
        await this.showResults(interaction, gameData, winningNumber, results);

        // Record game outcome
        this.recordGameOutcome(gameData, winningNumber, results);

        // Clean up
        gameManager.activeGames.delete(gameKey);
    }

    async spinAnimation(interaction, winningNumber, gameData) {
        const winningIndex = this.wheelOrder.indexOf(winningNumber);
        const totalFrames = 25; // Fixed frame count for ~15-20 seconds
        const CryptoRandom = require("../cryptoRandom");

        for (let frame = 0; frame < totalFrames; frame++) {
            let ballPosition;

            if (frame < totalFrames - 5) {
                // Random position for most of the spin
                ballPosition = CryptoRandom.randomInt(
                    0,
                    this.wheelOrder.length
                );
            } else {
                // Last 5 frames: gradually move toward winning number
                const progress = (frame - (totalFrames - 5)) / 5;
                const randomOffset = CryptoRandom.randomInt(-2, 3); // Add some randomness
                ballPosition = Math.floor(
                    winningIndex + randomOffset * (1 - progress)
                );
            }

            const display = this.generateWheelFrame(
                ballPosition,
                frame === totalFrames - 1 ? winningNumber : null
            );

            const isLastFrame = frame === totalFrames - 1;

            let description = display;
            if (frame === 0) {
                // Add dealer message at start of spin
                const dealerMessage = this.getRandomDealerMessage("spinning");
                description = `${dealerMessage}\n\n${display}`;
            }

            // Add betting summary to all frames
            const bettingSummary = this.generateBettingSummary(
                gameData.players
            );
            if (bettingSummary) {
                description += `\n\n**💰 Placed Bets:**\n${bettingSummary}`;
            }

            const spinEmbed = new EmbedBuilder()
                .setTitle(
                    isLastFrame
                        ? "🎊 Roulette Results 🎊"
                        : "🎰 Roulette Wheel Spinning..."
                )
                .setDescription(description)
                .setColor(isLastFrame ? 0xffd700 : 0x00ae86);

            try {
                await interaction.editReply({
                    embeds: [spinEmbed],
                    components: [],
                });
            } catch (error) {
                try {
                    await interaction.followUp({ embeds: [spinEmbed] });
                } catch (followUpError) {
                    break;
                }
            }

            // Store the embed for final results
            if (isLastFrame) {
                this.finalEmbed = spinEmbed;
            }

            // Progressive slowdown: 200ms to 1000ms
            const progress = frame / totalFrames;
            const delay = 200 + progress * 800;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    generateWheelFrame(ballPosition, highlightWinner = null) {
        const wheelSize = this.wheelOrder.length;
        const currentIndex = ballPosition % wheelSize;

        let display = "```\n";
        display += " 🎰 ROULETTE WHEEL 🎰\n";
        display += "┌─────────────────────┐\n";

        // Show 5 numbers around current position
        for (let i = -2; i <= 2; i++) {
            const index = (currentIndex + i + wheelSize) % wheelSize;
            const number = this.wheelOrder[index];
            const color = this.getNumberColor(number);
            const isBall = i === 0;
            const isWinner = number === highlightWinner;

            if (isBall && isWinner) {
                display += `       ${color}${number
                    .toString()
                    .padStart(7)} ← ★ \n`;
            } else if (isBall) {
                display += `       ${color}${number
                    .toString()
                    .padStart(7)} ←   \n`;
            } else if (isWinner) {
                display += `       ${color}${number
                    .toString()
                    .padStart(7)} ★  \n`;
            } else {
                display += `       ${color}${number
                    .toString()
                    .padStart(7)}     \n`;
            }
        }

        display += "└─────────────────────┘\n```";
        return display;
    }

    getNumberColor(number) {
        if (number === 0) return "🟢";
        if (this.redNumbers.includes(number)) return "🔴";
        return "⚫";
    }

    async calculatePayouts(gameData, winningNumber) {
        const results = {
            winners: [],
            losers: [],
            totalPayout: 0,
        };

        for (const [userId, player] of gameData.players) {

            let playerWinnings = 0;
            let winningBets = [];
            let losingBets = [];

            for (const bet of player.bets) {
                let isWin = false;

                switch (bet.type) {
                    case "red":
                        isWin = this.redNumbers.includes(winningNumber);
                        break;
                    case "black":
                        isWin = this.blackNumbers.includes(winningNumber);
                        break;
                    case "even":
                        isWin = winningNumber > 0 && winningNumber % 2 === 0;
                        break;
                    case "odd":
                        isWin = winningNumber > 0 && winningNumber % 2 === 1;
                        break;
                    case "low":
                        isWin = winningNumber >= 1 && winningNumber <= 18;
                        break;
                    case "high":
                        isWin = winningNumber >= 19 && winningNumber <= 36;
                        break;
                    case "straight":
                        isWin = winningNumber === bet.number;
                        break;
                }

                if (isWin) {
                    const payout = bet.amount * (bet.payout + 1); // Include original bet
                    playerWinnings += payout;
                    winningBets.push({ ...bet, payout });
                } else {
                    losingBets.push(bet);
                }
            }

            // Calculate net result: total winnings minus total bet
            const netResult = playerWinnings - player.totalBet;

            // Always award winnings if player won any bets
            if (playerWinnings > 0) {
                await gameRewards.awardRoulettePayout(
                    userId,
                    playerWinnings,
                    "Roulette winnings"
                );
            }

            // Handle win/loss categorization and streak logic
            if (netResult > 0) {
                // Player made a net profit
                results.winners.push({
                    userId,
                    name: player.name,
                    winnings: playerWinnings,
                    totalBet: player.totalBet,
                    profit: netResult,
                    winningBets,
                });
            } else {
                // Player had net loss - record for streak/shield handling
                await currencyManager.recordLoss(userId, "Roulette loss");
                results.losers.push({
                    userId,
                    name: player.name,
                    totalBet: player.totalBet,
                    profit: netResult, // Add profit field for display
                    losingBets,
                });
            }

            results.totalPayout += playerWinnings;
        }

        return results;
    }

    async showResults(interaction, gameData, winningNumber, results) {
        const color = this.getNumberColor(winningNumber);
        const colorName =
            winningNumber === 0
                ? "Green"
                : this.redNumbers.includes(winningNumber)
                ? "Red"
                : "Black";

        // Use the existing embed from animation and add results
        const embed =
            this.finalEmbed ||
            new EmbedBuilder()
                .setTitle("🎊 Roulette Results 🎊")
                .setDescription(
                    this.generateWheelFrame(
                        this.wheelOrder.indexOf(winningNumber),
                        winningNumber
                    )
                )
                .setColor(0xffd700);

        // Add dealer message and winning number info
        const dealerMessage = this.getRandomDealerMessage("results");
        embed.setDescription(
            embed.data.description +
                `\n\n${dealerMessage}\n**Winning Number: ${color}${winningNumber} (${colorName})**`
        );

        // Show detailed results for each player
        const playerResults = [];
        for (const [userId, player] of gameData.players) {
            const playerResult =
                results.winners.find((w) => w.userId === userId) ||
                results.losers.find((l) => l.userId === userId);

            if (playerResult) {
                const isWinner = results.winners.some(
                    (w) => w.userId === userId
                );
                const betDetails = [];

                // Show individual bet results
                for (const bet of player.bets) {
                    let betResult = "❌";
                    let betPayout = 0;

                    // Check if this specific bet won
                    switch (bet.type) {
                        case "red":
                            if (this.redNumbers.includes(winningNumber)) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "black":
                            if (this.blackNumbers.includes(winningNumber)) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "even":
                            if (winningNumber > 0 && winningNumber % 2 === 0) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "odd":
                            if (winningNumber > 0 && winningNumber % 2 === 1) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "low":
                            if (winningNumber >= 1 && winningNumber <= 18) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "high":
                            if (winningNumber >= 19 && winningNumber <= 36) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                        case "straight":
                            if (winningNumber === bet.number) {
                                betResult = "✅";
                                betPayout = bet.amount * (bet.payout + 1);
                            }
                            break;
                    }

                    const betName =
                        bet.type === "straight"
                            ? `Number ${bet.number}`
                            : this.betTypes[bet.type].name;
                    const payoutText =
                        betPayout > 0
                            ? ` (+${betPayout - bet.amount})`
                            : ` (-${bet.amount})`;
                    betDetails.push(
                        `${betResult} ${betName}: ${bet.amount} coins${payoutText}`
                    );
                }

                const totalProfit = isWinner
                    ? playerResult.profit
                    : playerResult.profit; // Use actual profit from results
                const profitText =
                    totalProfit >= 0 ? `+${totalProfit}` : `${totalProfit}`;

                // Add celebration based on profit amount
                let celebration = "";
                if (totalProfit > 1000) {
                    celebration = " 🎊🎊🎊 MASSIVE WIN! 🎊🎊🎊";
                } else if (totalProfit > 500) {
                    celebration = " 🎉 BIG WINNER! 🎉";
                } else if (totalProfit > 200) {
                    celebration = " 🎆 NICE WIN! 🎆";
                } else if (totalProfit > 0) {
                    celebration = " 🎉 Winner! 🎉";
                }

                playerResults.push(
                    `**${
                        player.name
                    }** (${profitText} coins)${celebration}:\n${betDetails.join(
                        "\n"
                    )}`
                );
            }
        }

        if (playerResults.length > 0) {
            embed.addFields({
                name: "📊 Detailed Results",
                value: playerResults.join("\n\n"),
                inline: false,
            });
        }

        try {
            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (error) {
            await interaction.followUp({ embeds: [embed] });
        }
    }

    startCountdownTimer(channel, gameKey, gameData) {
        const gameManager = require("../gameManager");

        const countdownInterval = setInterval(async () => {
            const currentGame = gameManager.activeGames.get(gameKey);
            if (!currentGame || currentGame.phase !== "betting") {
                clearInterval(countdownInterval);
                return;
            }

            const timeElapsed = Date.now() - currentGame.startTime;
            const timeLeft = Math.max(
                0,
                Math.ceil((currentGame.bettingDuration - timeElapsed) / 1000)
            );

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                currentGame.phase = "spinning";
                gameManager.activeGames.set(gameKey, currentGame);

                // Create fake interaction for spinning
                const fakeInteraction = {
                    editReply: async (options) => {
                        try {
                            const message = await channel.messages.fetch(
                                currentGame.messageId
                            );
                            await message.edit(options);
                        } catch (error) {
                            console.log("Could not update roulette message");
                        }
                    },
                    followUp: async (options) => {
                        await channel.send(options);
                    },
                };

                await this.spinWheel(
                    fakeInteraction,
                    currentGame,
                    gameManager,
                    gameKey
                );
                return;
            }

            // Only update at specific intervals to reduce API calls
            const shouldUpdate =
                timeLeft <= 10 || // Every second for final 10 seconds
                timeLeft % 5 === 0 || // Every 5 seconds otherwise
                timeLeft === 30 ||
                timeLeft === 45; // Extra updates at 30s and 45s

            if (!shouldUpdate) return;

            // Generate live betting display
            const bettingSummary = this.generateBettingSummary(
                currentGame.players
            );

            // Add dealer message for countdown updates
            const dealerMessage =
                timeLeft <= 10
                    ? "🎯 'No more bets!' *waves hand dramatically*"
                    : this.getRandomDealerMessage("betting");

            // Update embed with countdown
            const embed = new EmbedBuilder()
                .setTitle("🎰 Roulette - Place Your Bets!")
                .setDescription(
                    `${dealerMessage}\n\nChoose your bets and amounts. Betting closes soon!`
                )
                .addFields(
                    {
                        name: "🔴 Red/⚫ Black",
                        value: "1:1 payout",
                        inline: true,
                    },
                    { name: "🔢 Even/Odd", value: "1:1 payout", inline: true },
                    {
                        name: "📍 Single Number",
                        value: "35:1 payout",
                        inline: true,
                    },
                    {
                        name: "⬇️ Low (1-18)",
                        value: "1:1 payout",
                        inline: true,
                    },
                    {
                        name: "⬆️ High (19-36)",
                        value: "1:1 payout",
                        inline: true,
                    },
                    {
                        name: "⏰ Time Left",
                        value: `${timeLeft} seconds`,
                        inline: true,
                    }
                )
                .setColor(timeLeft <= 10 ? 0xff0000 : 0x00ae86);

            // Add betting summary if there are bets
            if (bettingSummary) {
                embed.addFields({
                    name: "💰 Current Bets",
                    value: bettingSummary,
                    inline: false,
                });
            }

            const buttons = this.createBettingButtons();

            try {
                const message = await channel.messages.fetch(
                    currentGame.messageId
                );
                await message.edit({ embeds: [embed], components: buttons });
            } catch (error) {
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    generateBettingSummary(players) {
        if (!players || players.size === 0) return null;

        const betSummary = {
            red: { players: 0, total: 0 },
            black: { players: 0, total: 0 },
            even: { players: 0, total: 0 },
            odd: { players: 0, total: 0 },
            low: { players: 0, total: 0 },
            high: { players: 0, total: 0 },
            straight: { bets: [] },
        };

        // Aggregate all bets
        for (const [userId, player] of players) {
            for (const bet of player.bets) {
                if (bet.type === "straight") {
                    betSummary.straight.bets.push({
                        number: bet.number,
                        amount: bet.amount,
                    });
                } else if (betSummary[bet.type]) {
                    betSummary[bet.type].players++;
                    betSummary[bet.type].total += bet.amount;
                }
            }
        }

        const lines = [];

        // Outside bets
        if (betSummary.red.players > 0) {
            lines.push(
                `🔴 Red: ${betSummary.red.players} players (${betSummary.red.total} coins)`
            );
        }
        if (betSummary.black.players > 0) {
            lines.push(
                `⚫ Black: ${betSummary.black.players} players (${betSummary.black.total} coins)`
            );
        }
        if (betSummary.even.players > 0) {
            lines.push(
                `🔢 Even: ${betSummary.even.players} players (${betSummary.even.total} coins)`
            );
        }
        if (betSummary.odd.players > 0) {
            lines.push(
                `🔢 Odd: ${betSummary.odd.players} players (${betSummary.odd.total} coins)`
            );
        }
        if (betSummary.low.players > 0) {
            lines.push(
                `⬇️ Low: ${betSummary.low.players} players (${betSummary.low.total} coins)`
            );
        }
        if (betSummary.high.players > 0) {
            lines.push(
                `⬆️ High: ${betSummary.high.players} players (${betSummary.high.total} coins)`
            );
        }

        // Number bets (group by number)
        if (betSummary.straight.bets.length > 0) {
            const numberBets = {};
            for (const bet of betSummary.straight.bets) {
                if (!numberBets[bet.number]) {
                    numberBets[bet.number] = 0;
                }
                numberBets[bet.number] += bet.amount;
            }

            const numberLines = Object.entries(numberBets)
                .map(([num, total]) => `📍 ${num}: ${total} coins`)
                .slice(0, 3); // Limit to 3 numbers to avoid spam

            lines.push(...numberLines);

            if (Object.keys(numberBets).length > 3) {
                lines.push(
                    `... and ${Object.keys(numberBets).length - 3} more numbers`
                );
            }
        }

        return lines.length > 0 ? lines.join("\n") : null;
    }

    recordGameOutcome(gameData, winningNumber, results) {
        // Record outcome for each player
        for (const [userId, player] of gameData.players) {
            const isWinner = results.winners.some((w) => w.userId === userId);
            const playerResult = isWinner
                ? results.winners.find((w) => w.userId === userId)
                : results.losers.find((l) => l.userId === userId);

            const players = [{ id: userId, name: this.sanitizePlayerName(player.name) }];
            const winnerId = isWinner ? userId : "ai_player";
            
            gameStats.recordGameOutcome(
                this.gameType,
                gameData,
                winnerId,
                players,
                {
                    aiName: "House",
                    finalScore: {
                        winning_number: winningNumber,
                        total_bet: player.totalBet,
                        total_payout: isWinner ? playerResult.winnings : 0,
                        profit: isWinner ? playerResult.profit : -player.totalBet,
                        bets: player.bets,
                    },
                    gameMode: "multiplayer"
                }
            );
        }
    }
}

module.exports = new Roulette();
