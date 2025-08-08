const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const currencyManager = require("../currencyManager");

class Blackjack {
    constructor() {
        this.lobbies = new Map(); // channelId -> lobby data
    }

    async start(message) {
        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack - Choose Mode")
            .setDescription("Select how you want to play:")
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_single")
                .setLabel("Single Player vs AI")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_multi_player")
                .setLabel("Multiplayer (I'm Player)")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("bj_multi_dealer")
                .setLabel("Multiplayer (I'm Dealer)")
                .setStyle(ButtonStyle.Secondary)
        );

        await message.reply({ embeds: [embed], components: [buttons] });
        return {
            gameKey: `bj_setup_${message.author.id}`,
            gameData: {
                type: "blackjack",
                phase: "setup",
                creator: message.author.id,
            },
        };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("bj_")) return false;

        const userId = interaction.user.id;

        if (interaction.customId === "bj_single") {
            // Mark this as single player in game data
            if (gameData) gameData.mode = "single";
            return await this.showBetSelection(interaction, false);
        }

        if (
            interaction.customId === "bj_multi_player" ||
            interaction.customId === "bj_multi_dealer"
        ) {
            // Mark this as multiplayer in game data
            if (gameData) gameData.mode = "multiplayer";
            return await this.showBetSelection(
                interaction,
                interaction.customId === "bj_multi_dealer"
            );
        }

        if (interaction.customId.startsWith("bj_bet_")) {
            const betAmount = parseInt(interaction.customId.split("_")[2]);
            const isDealer = interaction.customId.includes("dealer");

            // Check if this came from single player mode
            if (gameData && gameData.mode === "single") {
                return await this.startSinglePlayer(
                    interaction,
                    gameManager,
                    betAmount
                );
            }

            return await this.showWaitTimeSelection(
                interaction,
                isDealer,
                betAmount
            );
        }

        if (interaction.customId.startsWith("bj_wait_")) {
            const waitTime = parseInt(interaction.customId.split("_")[2]);
            const isDealer = interaction.customId.includes("dealer");
            const betAmount = parseInt(interaction.customId.split("_")[3]);
            return await this.createLobby(
                interaction,
                waitTime,
                isDealer,
                betAmount,
                gameManager
            );
        }

        if (interaction.customId === "bj_join") {
            return await this.joinLobby(interaction);
        }

        if (interaction.customId.startsWith("bj_join_bet_")) {
            return await this.handleJoinBet(interaction);
        }

        if (interaction.customId === "bj_cancel") {
            return await this.cancelLobby(interaction);
        }

        if (interaction.customId === "bj_start") {
            return await this.startGameEarly(interaction, gameManager);
        }

        if (interaction.customId.startsWith("bj_game_")) {
            return await this.handleGameAction(
                interaction,
                gameData,
                gameKey,
                gameManager
            );
        }

        return false;
    }

    async startSinglePlayer(interaction, gameManager, betAmount) {
        try {
            const setupKey = `bj_setup_${interaction.user.id}`;
            const gameKey = `blackjack_${interaction.user.id}`;

            // Check if player can afford the bet
            const canAfford = await currencyManager.subtractBalance(interaction.user.id, betAmount);
            if (!canAfford) {
                await interaction.reply({
                    content: "You don't have enough coins for this bet!",
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }

            // Remove setup game data
            gameManager.activeGames.delete(setupKey);

            const gameData = this.createGameData(
                [
                    {
                        id: interaction.user.id,
                        name: interaction.user.displayName,
                        hand: [],
                        score: 0,
                        bust: false,
                        stand: false,
                    },
                ],
                true
            );

            gameData.betAmount = betAmount;
            gameData.bets = { [interaction.user.id]: betAmount };

            gameManager.activeGames.set(gameKey, gameData);
            this.dealInitialCards(gameData);

            const embed = this.createGameEmbed(gameData);
            const buttons = this.createGameButtons(
                gameData,
                interaction.user.id
            );

            await interaction.update({ embeds: [embed], components: buttons });

            // Check if game ended immediately (blackjack)
            if (gameData.gameOver) {
                await this.postGameResults(interaction.channel, gameData);
                gameManager.activeGames.delete(gameKey);
            }

            return true;
        } catch (error) {
            const secureLogger = require('../secureLogger');
            secureLogger.error('Error in startSinglePlayer', { error: error.message, userId: interaction.user.id });
            await interaction.reply({
                content: "An error occurred starting the game.",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }
    }

    async showBetSelection(interaction, isDealer) {
        const balance = await currencyManager.getBalance(interaction.user.id);

        if (balance < 10) {
            await interaction.reply({
                content:
                    "You need at least 10 coins to play! Use `!cowsay daily` to get more coins.",
                ephemeral: true,
            });
            return true;
        }

        const embed = new EmbedBuilder()
            .setTitle("🪙 Blackjack - Select Your Bet")
            .setDescription(
                `Your balance: **${balance}** coins\nChoose your bet amount:`
            )
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bj_bet_10${isDealer ? "_dealer" : ""}`)
                .setLabel("🪙 10 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 10),
            new ButtonBuilder()
                .setCustomId(`bj_bet_25${isDealer ? "_dealer" : ""}`)
                .setLabel("🪙 25 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 25),
            new ButtonBuilder()
                .setCustomId(`bj_bet_50${isDealer ? "_dealer" : ""}`)
                .setLabel("🪙 50 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 50),
            new ButtonBuilder()
                .setCustomId(`bj_bet_100${isDealer ? "_dealer" : ""}`)
                .setLabel("🪙 100 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 100)
        );

        await interaction.update({ embeds: [embed], components: [buttons] });
        return true;
    }

    async showWaitTimeSelection(interaction, isDealer, betAmount) {
        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack - Select Wait Time")
            .setDescription(
                `Bet: **${betAmount}** coins 🪙\nHow long should we wait for other players to join?`
            )
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `bj_wait_30_${betAmount}${isDealer ? "_dealer" : ""}`
                )
                .setLabel("30 seconds")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(
                    `bj_wait_60_${betAmount}${isDealer ? "_dealer" : ""}`
                )
                .setLabel("1 minute")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(
                    `bj_wait_120_${betAmount}${isDealer ? "_dealer" : ""}`
                )
                .setLabel("2 minutes")
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.update({ embeds: [embed], components: [buttons] });
        return true;
    }

    async createLobby(interaction, waitTime, isDealer, betAmount, gameManager) {
        const channelId = interaction.channel.id;

        if (this.lobbies.has(channelId)) {
            await interaction.reply({
                content: "There's already a blackjack lobby in this channel!",
                ephemeral: true,
            });
            return true;
        }

        // Check if creator can afford the bet
        try {
            const canAfford = await currencyManager.subtractBalance(interaction.user.id, betAmount);
            if (!canAfford) {
                await interaction.reply({
                    content: "You don't have enough coins for this bet!",
                    ephemeral: true,
                });
                return true;
            }
        } catch (error) {
            const secureLogger = require('../secureLogger');
            secureLogger.error('Error checking balance for lobby bet', { error: error.message, userId: interaction.user.id });
            await interaction.reply({
                content: "Error processing your bet. Please try again.",
                ephemeral: true,
            });
            return true;
        }

        const lobby = {
            channelId,
            creator: interaction.user.id,
            isDealer,
            players: [
                {
                    id: interaction.user.id,
                    name: interaction.user.displayName,
                    balance: await currencyManager.getBalance(interaction.user.id),
                    bet: betAmount,
                },
            ],
            waitTime,
            startTime: Date.now(),
            maxPlayers: 6,
            bets: { [interaction.user.id]: betAmount },
        };

        this.lobbies.set(channelId, lobby);
        lobby.countdownInterval = null;

        const embed = this.createLobbyEmbed(lobby);
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_join")
                .setLabel("Join Game")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("bj_start")
                .setLabel("Start Game")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.update({ embeds: [embed], components: [buttons] });

        // Start countdown timer
        const countdownInterval = setInterval(async () => {
            const currentLobby = this.lobbies.get(channelId);
            if (!currentLobby) {
                clearInterval(countdownInterval);
                return;
            }

            const timeLeft = Math.max(
                0,
                waitTime -
                    Math.floor((Date.now() - currentLobby.startTime) / 1000)
            );

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                // Check if dealer lobby has enough players
                if (currentLobby.isDealer && currentLobby.players.length < 2) {
                    // Cancel lobby and refund all bets
                    for (const [playerId, betAmount] of Object.entries(
                        currentLobby.bets
                    )) {
                        await currencyManager.addBalance(playerId, betAmount);
                    }
                    this.lobbies.delete(channelId);

                    const cancelEmbed = new EmbedBuilder()
                        .setTitle("🃏 Blackjack Lobby Cancelled")
                        .setDescription(
                            "Not enough players joined. Your bet has been refunded."
                        )
                        .setColor(0xff0000);

                    try {
                        await interaction.editReply({
                            embeds: [cancelEmbed],
                            components: [],
                        });
                    } catch (error) {
                        console.log("Could not update cancelled lobby message");
                    }
                    return;
                }
                this.startMultiplayerGame(interaction.channel, gameManager);
                return;
            }

            const updatedEmbed = this.createLobbyEmbed(currentLobby);
            const updatedButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_join")
                    .setLabel("Join Game")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(
                        currentLobby.players.length >= currentLobby.maxPlayers
                    ),
                new ButtonBuilder()
                    .setCustomId("bj_start")
                    .setLabel("Start Game")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("bj_cancel")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger)
            );

            try {
                await interaction.editReply({
                    embeds: [updatedEmbed],
                    components: [updatedButtons],
                });
            } catch (error) {
                clearInterval(countdownInterval);
            }
        }, 1000);

        return true;
    }

    async joinLobby(interaction) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.players.some((p) => p.id === interaction.user.id)) {
            await interaction.reply({
                content: "You're already in this game!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.players.length >= lobby.maxPlayers) {
            await interaction.reply({
                content: "Game is full!",
                ephemeral: true,
            });
            return true;
        }

        // Show bet selection for joining player
        return await this.showJoinBetSelection(interaction, lobby);
    }

    async showJoinBetSelection(interaction, lobby) {
        const balance = await currencyManager.getBalance(interaction.user.id);

        if (balance < 10) {
            await interaction.reply({
                content:
                    "You need at least 10 coins to play! Use `!cowsay daily` to get more coins.",
                ephemeral: true,
            });
            return true;
        }

        const embed = new EmbedBuilder()
            .setTitle("🪙 Choose Your Bet")
            .setDescription(
                `Your balance: **${balance}** coins\nSelect your bet amount to join:`
            )
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bj_join_bet_10`)
                .setLabel("🪙 10 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 10),
            new ButtonBuilder()
                .setCustomId(`bj_join_bet_25`)
                .setLabel("🪙 25 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 25),
            new ButtonBuilder()
                .setCustomId(`bj_join_bet_50`)
                .setLabel("🪙 50 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 50),
            new ButtonBuilder()
                .setCustomId(`bj_join_bet_100`)
                .setLabel("🪙 100 coins")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(balance < 100)
        );

        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: true,
        });
        return true;
    }

    async handleJoinBet(interaction) {
        const betAmount = parseInt(interaction.customId.split("_")[3]);
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "Lobby no longer exists!",
                ephemeral: true,
            });
            return true;
        }

        try {
            const canAfford = await currencyManager.subtractBalance(interaction.user.id, betAmount);
            if (!canAfford) {
                await interaction.reply({
                    content: "You don't have enough coins for this bet!",
                    ephemeral: true,
                });
                return true;
            }
        } catch (error) {
            const secureLogger = require('../secureLogger');
            secureLogger.error('Error checking balance for join bet', { error: error.message, userId: interaction.user.id });
            await interaction.reply({
                content: "Error processing your bet. Please try again.",
                ephemeral: true,
            });
            return true;
        }

        lobby.players.push({
            id: interaction.user.id,
            name: interaction.user.displayName,
            balance: await currencyManager.getBalance(interaction.user.id),
            bet: betAmount,
        });
        lobby.bets[interaction.user.id] = betAmount;

        const embed = this.createLobbyEmbed(lobby);
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_join")
                .setLabel("Join Game")
                .setStyle(ButtonStyle.Success)
                .setDisabled(lobby.players.length >= lobby.maxPlayers)
        );

        await interaction.update({ embeds: [embed], components: [buttons] });

        // Update countdown for join interactions too
        const existingLobby = this.lobbies.get(channelId);
        if (existingLobby && !existingLobby.countdownInterval) {
            existingLobby.countdownInterval = setInterval(async () => {
                const currentLobby = this.lobbies.get(channelId);
                if (!currentLobby) {
                    clearInterval(existingLobby.countdownInterval);
                    return;
                }

                const timeLeft = Math.max(
                    0,
                    currentLobby.waitTime -
                        Math.floor((Date.now() - currentLobby.startTime) / 1000)
                );

                if (timeLeft <= 0) {
                    clearInterval(existingLobby.countdownInterval);
                    return;
                }

                const updatedEmbed = this.createLobbyEmbed(currentLobby);
                const updatedButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_join")
                        .setLabel("Join Game")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(
                            currentLobby.players.length >=
                                currentLobby.maxPlayers
                        ),
                    new ButtonBuilder()
                        .setCustomId("bj_start")
                        .setLabel("Start Game")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId("bj_cancel")
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Danger)
                );

                try {
                    await interaction.editReply({
                        embeds: [updatedEmbed],
                        components: [updatedButtons],
                    });
                } catch (error) {
                    clearInterval(existingLobby.countdownInterval);
                }
            }, 1000);
        }
        return true;
    }

    async cancelLobby(interaction) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.creator !== interaction.user.id) {
            await interaction.reply({
                content: "Only the lobby creator can cancel!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.countdownInterval) {
            clearInterval(lobby.countdownInterval);
        }

        this.lobbies.delete(channelId);

        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack Lobby Cancelled")
            .setDescription("The lobby has been cancelled by the creator.")
            .setColor(0xff0000);

        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    async startMultiplayerGame(channel, gameManager) {
        const channelId = channel.id;
        const lobby = this.lobbies.get(channelId);
        if (!lobby) return;

        // Clean up any setup games for lobby players
        for (const player of lobby.players) {
            const setupKey = `bj_setup_${player.id}`;
            gameManager.activeGames.delete(setupKey);
        }

        const gameKey = `channelBlackjack_${channelId}`;
        const players = lobby.players.map((p) => ({
            id: p.id,
            name: p.name,
            hand: [],
            score: 0,
            bust: false,
            stand: false,
        }));

        const gameData = this.createGameData(
            players,
            false,
            lobby.isDealer ? lobby.creator : null
        );
        gameData.bets = lobby.bets;
        gameManager.activeGames.set(gameKey, gameData);
        this.lobbies.delete(channelId);

        this.dealInitialCards(gameData);

        const embed = this.createGameEmbed(gameData);
        const buttons = this.createGameButtons(
            gameData,
            gameData.currentPlayer
        );

        // Update lobby embed to show game started
        const startedEmbed = new EmbedBuilder()
            .setTitle("🃏 Blackjack Game Started")
            .setDescription(
                `Game has started with ${gameData.players.length} players!`
            )
            .addFields(
                {
                    name: "Players",
                    value: gameData.players.map((p) => p.name).join("\n"),
                    inline: true,
                },
                { name: "Status", value: "🎮 Game in Progress", inline: true }
            )
            .setColor(0x00ff00);

        // Find and update the lobby message
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            const lobbyMessage = messages.find(
                (m) =>
                    m.author.bot && m.embeds[0]?.title === "🃏 Blackjack Lobby"
            );
            if (lobbyMessage) {
                await lobbyMessage.edit({
                    embeds: [startedEmbed],
                    components: [],
                });
            }
        } catch (error) {
            console.log("Could not update lobby message");
        }

        // Create a thread for the game
        const gameMessage = await channel.send({
            embeds: [embed],
            components: [],
        });
        const thread = await gameMessage.startThread({
            name: `🃏 Blackjack Game - ${gameData.players
                .map((p) => p.name)
                .join(", ")}`,
            autoArchiveDuration: 60,
        });

        // Store thread info and send initial message to thread
        gameData.threadId = thread.id;
        gameData.gameMessageId = gameMessage.id;
        gameData.channelId = channel.id;
        gameData.threadGameMessage = await thread.send({
            embeds: [embed],
            components: buttons,
        });

        // Check if game ended immediately (all blackjacks)
        if (gameData.gameOver) {
            await this.postGameResults(thread, gameData);
            gameManager.activeGames.delete(gameKey);
        }
    }

    createGameData(players, isSinglePlayer, dealerId = null) {
        return {
            type: "blackjack",
            phase: "playing",
            players,
            dealer: { hand: [], score: 0, bust: false },
            deck: this.createDeck(),
            currentPlayer: players[0].id,
            currentPlayerIndex: 0,
            isSinglePlayer,
            dealerId,
            gameOver: false,
            startTime: Date.now(),
            serverId: null
        };
    }

    createDeck() {
        if (!this.baseDeck) {
            const suits = ["♠", "♥", "♦", "♣"];
            const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
            this.baseDeck = [];

            for (const suit of suits) {
                for (const rank of ranks) {
                    this.baseDeck.push({ rank, suit, value: this.getCardValue(rank) });
                }
            }
        }

        return this.shuffleDeck([...this.baseDeck]);
    }

    shuffleDeck(deck) {
        const CryptoRandom = require('../cryptoRandom');
        return CryptoRandom.shuffle(deck);
    }

    getCardValue(rank) {
        if (rank === "A") return 11;
        if (["J", "Q", "K"].includes(rank)) return 10;
        return parseInt(rank);
    }

    dealInitialCards(gameData) {
        // Deal 2 cards to each player
        for (const player of gameData.players) {
            player.hand.push(gameData.deck.pop(), gameData.deck.pop());
            player.score = this.calculateScore(player.hand);

            // Check for blackjack (21 with 2 cards)
            if (player.score === 21) {
                player.blackjack = true;
                player.stand = true;
            }
        }

        // Deal 2 cards to dealer (1 hidden in display)
        gameData.dealer.hand.push(gameData.deck.pop(), gameData.deck.pop());
        gameData.dealer.score = this.calculateScore(gameData.dealer.hand);

        // Check if all players have blackjack or are done
        const allPlayersDone = gameData.players.every(
            (p) => p.blackjack || p.bust || p.stand
        );
        if (allPlayersDone) {
            gameData.phase = "dealer";
            this.playDealer(gameData);
        }
    }

    calculateScore(hand) {
        let score = 0;
        let aces = 0;

        for (const card of hand) {
            if (card.rank === "A") {
                aces++;
                score += 11;
            } else {
                score += card.value;
            }
        }

        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }

        return score;
    }

    createLobbyEmbed(lobby) {
        const timeLeft = Math.max(
            0,
            lobby.waitTime - Math.floor((Date.now() - lobby.startTime) / 1000)
        );
        const playerList = lobby.players
            .map((p) => `${this.sanitizeText(p.name)}: ${parseInt(p.bet)} coins 🪙`)
            .join("\n");

        return new EmbedBuilder()
            .setTitle("🃏 Blackjack Lobby")
            .setDescription(
                "Players can bet different amounts! Waiting for players to join..."
            )
            .addFields(
                {
                    name: "Players & Bets",
                    value: `${playerList}\n(${lobby.players.length}/${lobby.maxPlayers})`,
                    inline: true,
                },
                { name: "Time Left", value: `${timeLeft}s`, inline: true },
                {
                    name: "Mode",
                    value: lobby.isDealer ? "Player Dealer" : "AI Dealer",
                    inline: true,
                }
            )
            .setColor(0x00ae86);
    }

    createGameEmbed(gameData) {
        const currentPlayer = gameData.players.find(
            (p) => p.id === gameData.currentPlayer
        );

        // Show all hands only in single player or when game is over
        const showAllHands =
            gameData.isSinglePlayer ||
            gameData.gameOver ||
            gameData.phase === "dealer";

        const playerHands = gameData.players
            .map((p) => {
                if (showAllHands) {
                    // Show full hand
                    return `**${this.sanitizeText(p.name)}**: ${this.formatHand(p.hand)} (${
                        parseInt(p.score)
                    })${p.blackjack ? " 🎉" : ""}${p.bust ? " 💥" : ""}${
                        p.stand ? " ✋" : ""
                    }`;
                } else {
                    // Hide hand, show only status
                    const cardCount = p.hand.length;
                    const status = p.blackjack
                        ? " 🎉"
                        : p.bust
                        ? " 💥"
                        : p.stand
                        ? " ✋"
                        : "";
                    return `**${this.sanitizeText(p.name)}**: [${parseInt(cardCount)} cards]${status}`;
                }
            })
            .join("\n");

        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;

        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        return new EmbedBuilder()
            .setTitle("🃏 Blackjack")
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                { name: "Players", value: playerHands, inline: false },
                {
                    name: "Current Turn",
                    value: gameData.gameOver
                        ? "Game Over"
                        : this.sanitizeText(currentPlayer?.name) || "Dealer",
                    inline: true,
                }
            )
            .setColor(0x00ae86);
    }

    formatHand(hand) {
        return hand.map((card) => this.formatCard(card)).join(" ");
    }

    formatCard(card) {
        return `${card.rank}${card.suit}`;
    }

    createGameButtons(gameData, playerId) {
        if (gameData.gameOver || gameData.phase === "dealer") return [];
        if (!gameData.players || !Array.isArray(gameData.players)) return [];

        const player = gameData.players.find((p) => p.id === playerId);
        if (!player) return [];

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_game_hit")
                .setLabel("Hit")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_game_stand")
                .setLabel("Stand")
                .setStyle(ButtonStyle.Secondary)
        );

        // Add "View Hand" button for multiplayer games
        if (!gameData.isSinglePlayer) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_view")
                    .setLabel("View Hand")
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (player.hand.length === 2 && !player.bust && !player.stand) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_double")
                    .setLabel("Double Down")
                    .setStyle(ButtonStyle.Success)
            );
        }

        return [buttons];
    }

    async handleGameAction(interaction, gameData, gameKey, gameManager) {
        const action = interaction.customId.split("_")[2];
        const userId = interaction.user.id;

        // Get fresh game data from manager to avoid stale references
        const freshGameData = gameManager.activeGames.get(gameKey);
        if (!freshGameData) {
            await interaction.reply({
                content: "Game not found!",
                ephemeral: true,
            });
            return true;
        }

        if (!freshGameData.players || !Array.isArray(freshGameData.players)) {
            await interaction.reply({
                content: "Game data corrupted!",
                ephemeral: true,
            });
            return true;
        }

        const player = freshGameData.players.find((p) => p.id === userId);

        if (!player) {
            await interaction.reply({
                content: "You're not in this game!",
                ephemeral: true,
            });
            return true;
        }

        if (player.bust || player.stand) {
            await interaction.reply({
                content: "You've already finished your turn!",
                ephemeral: true,
            });
            return true;
        }

        if (userId !== freshGameData.currentPlayer) {
            await interaction.reply({
                content: "It's not your turn! Wait for your turn to play.",
                ephemeral: true,
            });
            return true;
        }

        if (action === "hit" || action === "double") {
            player.hand.push(freshGameData.deck.pop());
            player.score = this.calculateScore(player.hand);

            if (player.score > 21) {
                player.bust = true;
            }

            if (action === "double") {
                player.stand = true;
                // Double the bet
                if (freshGameData.bets && freshGameData.bets[userId]) {
                    const additionalBet = freshGameData.bets[userId];
                    const canDouble = await currencyManager.subtractBalance(userId, additionalBet);
                    if (canDouble) {
                        freshGameData.bets[userId] *= 2;
                    } else {
                        await interaction.reply({
                            content: "Not enough coins to double down!",
                            ephemeral: true,
                        });
                        return true;
                    }
                }
            }
        }

        if (action === "stand") {
            player.stand = true;
        }

        // Only advance if player is done (bust, stand, or 21)
        if (player.bust || player.stand || player.score === 21) {
            this.advanceGame(freshGameData);
        }

        // Update the game data in the manager
        gameManager.activeGames.set(gameKey, freshGameData);

        const embed = this.createGameEmbed(freshGameData);
        const buttons = this.createGameButtons(
            freshGameData,
            freshGameData.currentPlayer
        );

        // Handle multiplayer vs single player updates differently
        if (freshGameData.isSinglePlayer) {
            // Single player - update normally with buttons
            await interaction.update({ embeds: [embed], components: buttons });
        } else if (freshGameData.threadId && freshGameData.threadGameMessage) {
            // Multiplayer - update thread and main channel
            try {
                const thread = await interaction.client.channels.fetch(
                    freshGameData.threadId
                );
                const threadMessage = await thread.messages.fetch(
                    freshGameData.threadGameMessage.id
                );
                await threadMessage.edit({
                    embeds: [embed],
                    components: buttons,
                });

                // Update main channel message for spectators (no buttons)
                const mainChannel = await interaction.client.channels.fetch(
                    freshGameData.channelId
                );
                const mainMessage = await mainChannel.messages.fetch(
                    freshGameData.gameMessageId
                );
                await mainMessage.edit({ embeds: [embed], components: [] });

                // Acknowledge the interaction
                await interaction.deferUpdate();
            } catch (error) {
                console.log("Could not update thread/main message");
                await interaction.update({
                    embeds: [embed],
                    components: buttons,
                });
            }
        } else {
            // Fallback - update normally
            await interaction.update({ embeds: [embed], components: buttons });
        }

        // Send private hand info to current player if multiplayer
        if (!freshGameData.isSinglePlayer && !freshGameData.gameOver) {
            await this.sendPrivateHandInfo(interaction, freshGameData, userId);
        }

        if (freshGameData.gameOver) {
            await this.announceWinner(interaction, freshGameData);
            gameManager.activeGames.delete(gameKey);
        }

        return true;
    }

    advanceGame(gameData) {
        // Find next active player
        let nextIndex =
            (gameData.currentPlayerIndex + 1) % gameData.players.length;
        let foundActivePlayer = false;

        for (let i = 0; i < gameData.players.length; i++) {
            const player = gameData.players[nextIndex];
            if (!player.bust && !player.stand) {
                gameData.currentPlayer = player.id;
                gameData.currentPlayerIndex = nextIndex;
                foundActivePlayer = true;
                break;
            }
            nextIndex = (nextIndex + 1) % gameData.players.length;
        }

        // If no active players, move to dealer phase
        if (!foundActivePlayer) {
            gameData.phase = "dealer";
            this.playDealer(gameData);
        }
    }

    playDealer(gameData) {
        // Dealer hits on 16, stands on 17
        while (gameData.dealer.score < 17) {
            gameData.dealer.hand.push(gameData.deck.pop());
            gameData.dealer.score = this.calculateScore(gameData.dealer.hand);
        }

        if (gameData.dealer.score > 21) {
            gameData.dealer.bust = true;
        }

        gameData.gameOver = true;
    }

    async announceWinner(interaction, gameData) {
        const winners = [];
        const losers = [];
        const pushes = [];

        // Process payouts and determine results
        for (const player of gameData.players) {
            const betAmount = gameData.bets ? gameData.bets[player.id] : 0;
            let payout = 0;
            let resultText = "";

            if (player.blackjack) {
                // Blackjack pays 2.5x (bet back + 1.5x bet)
                payout = Math.floor(betAmount * 2.5);
                await currencyManager.addBalance(player.id, payout);
                const profit = payout - betAmount;
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Blackjack! 🎉) +${profit} coins (${newBalance} total)`;
                winners.push(resultText);
            } else if (!player.bust) {
                if (
                    gameData.dealer.bust ||
                    player.score > gameData.dealer.score
                ) {
                    // Win pays 2x (bet back + bet amount)
                    payout = betAmount * 2;
                    await currencyManager.addBalance(player.id, payout);
                    const profit = payout - betAmount;
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (${player.score}) +${profit} coins (${newBalance} total)`;
                    winners.push(resultText);
                } else if (player.score === gameData.dealer.score) {
                    // Push returns bet
                    payout = betAmount;
                    await currencyManager.addBalance(player.id, payout);
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (Push - ${player.score}) ±0 coins (${newBalance} total)`;
                    pushes.push(resultText);
                } else {
                    // Loss - no payout (already deducted)
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (${player.score}) -${betAmount} coins (${newBalance} total)`;
                    losers.push(resultText);
                }
            } else {
                // Bust - no payout (already deducted)
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Bust - ${player.score}) -${betAmount} coins (${newBalance} total)`;
                losers.push(resultText);
            }
        }

        // Create final game state with all hands revealed
        const finalGameEmbed = this.createGameEmbed(gameData);

        let resultText = "";
        if (winners.length > 0) {
            resultText += `🏆 **Winners:**\n${winners.join("\n")}\n\n`;
        }
        if (pushes.length > 0) {
            resultText += `🤝 **Pushes:**\n${pushes.join("\n")}\n\n`;
        }
        if (losers.length > 0) {
            resultText += `💥 **Losers:**\n${losers.join("\n")}\n\n`;
        }
        resultText += `🏠 **Dealer:** ${gameData.dealer.score}${
            gameData.dealer.bust ? " (Bust)" : ""
        }`;

        // Record game outcomes
        this.recordGameOutcome(gameData, winners, losers, pushes);
        
        // Add results to the final game embed
        finalGameEmbed.addFields({
            name: "🎊 Game Results 🪙",
            value: resultText,
            inline: false,
        });
        finalGameEmbed.setColor(0xffd700);

        // Update the game board with final results
        if (gameData.threadId && gameData.threadGameMessage) {
            // Multiplayer game - update both thread and main channel
            try {
                const thread = await interaction.client.channels.fetch(
                    gameData.threadId
                );
                const threadMessage = await thread.messages.fetch(
                    gameData.threadGameMessage.id
                );
                await threadMessage.edit({
                    embeds: [finalGameEmbed],
                    components: [],
                });

                // Update main channel message for spectators
                const mainChannel = await interaction.client.channels.fetch(
                    gameData.channelId
                );
                const mainMessage = await mainChannel.messages.fetch(
                    gameData.gameMessageId
                );
                await mainMessage.edit({
                    embeds: [finalGameEmbed],
                    components: [],
                });
            } catch (error) {
                console.log("Could not update thread/main with final results");
            }
        } else {
            // Single player game - update the main message
            try {
                await interaction.editReply({
                    embeds: [finalGameEmbed],
                    components: [],
                });
            } catch (error) {
                console.log(
                    "Could not update single player game with final results"
                );
            }
        }
    }

    async sendPrivateHandInfo(interaction, gameData, playerId) {
        const player = gameData.players.find((p) => p.id === playerId);
        if (!player) return;

        // Create game board summary
        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;
        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        const otherPlayers = gameData.players
            .filter((p) => p.id !== playerId)
            .map(
                (p) =>
                    `${p.name}: [${p.hand.length} cards]${
                        p.blackjack ? " 🎉" : ""
                    }${p.bust ? " 💥" : ""}${p.stand ? " ✋" : ""}`
            )
            .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🃏 Your Hand")
            .setDescription(
                `**Your Cards:** ${this.formatHand(player.hand)} (${
                    player.score
                })${player.blackjack ? " 🎉" : ""}${player.bust ? " 💥" : ""}${
                    player.stand ? " ✋" : ""
                }`
            )
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                {
                    name: "Other Players",
                    value: otherPlayers || "None",
                    inline: false,
                }
            )
            .setColor(0x00ae86);

        // Always show action buttons for active players
        let components = [];
        if (!player.bust && !player.stand && !gameData.gameOver) {
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_hit")
                    .setLabel("Hit")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("bj_game_stand")
                    .setLabel("Stand")
                    .setStyle(ButtonStyle.Secondary)
            );

            if (player.hand.length === 2) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_game_double")
                        .setLabel("Double Down")
                        .setStyle(ButtonStyle.Success)
                );
            }

            components = [buttons];
        }

        try {
            // Try followUp first, if it fails use reply
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                    components,
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                    components,
                    ephemeral: true,
                });
            }
        } catch (error) {
            console.log(
                `Could not send private hand info to ${player.name}: ${error.message}`
            );
        }
    }

    async handleViewHand(interaction, gameData, gameKey, gameManager) {
        const userId = interaction.user.id;
        const freshGameData = gameManager.activeGames.get(gameKey);

        if (!freshGameData || !freshGameData.players) {
            await interaction.reply({
                content: "Game not found!",
                ephemeral: true,
            });
            return true;
        }

        const player = freshGameData.players.find((p) => p.id === userId);
        if (!player) {
            await interaction.reply({
                content: "You're not in this game!",
                ephemeral: true,
            });
            return true;
        }

        await this.sendPrivateHandInfo(interaction, freshGameData, userId);
        return true;
    }

    async postGameResults(channel, gameData) {
        const winners = [];
        const losers = [];
        const pushes = [];

        // Process payouts and determine results
        for (const player of gameData.players) {
            const betAmount = gameData.bets ? gameData.bets[player.id] : 0;
            let payout = 0;
            let resultText = "";

            if (player.blackjack) {
                // Blackjack pays 2.5x (bet back + 1.5x bet)
                payout = Math.floor(betAmount * 2.5);
                await currencyManager.addBalance(player.id, payout);
                const profit = payout - betAmount;
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Blackjack! 🎉) +${profit} coins (${newBalance} total)`;
                winners.push(resultText);
            } else if (!player.bust) {
                if (
                    gameData.dealer.bust ||
                    player.score > gameData.dealer.score
                ) {
                    // Win pays 2x (bet back + bet amount)
                    payout = betAmount * 2;
                    await currencyManager.addBalance(player.id, payout);
                    const profit = payout - betAmount;
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (${player.score}) +${profit} coins (${newBalance} total)`;
                    winners.push(resultText);
                } else if (player.score === gameData.dealer.score) {
                    // Push returns bet
                    payout = betAmount;
                    await currencyManager.addBalance(player.id, payout);
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (Push - ${player.score}) ±0 coins (${newBalance} total)`;
                    pushes.push(resultText);
                } else {
                    // Loss - no payout (already deducted)
                    const newBalance = await currencyManager.getBalance(player.id);
                    resultText = `${player.name} (${player.score}) -${betAmount} coins (${newBalance} total)`;
                    losers.push(resultText);
                }
            } else {
                // Bust - no payout (already deducted)
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Bust - ${player.score}) -${betAmount} coins (${newBalance} total)`;
                losers.push(resultText);
            }
        }

        // Create final game state with all hands revealed
        const finalGameEmbed = this.createGameEmbed(gameData);

        let resultText = "";
        if (winners.length > 0) {
            resultText += `🏆 **Winners:**\n${winners.join("\n")}\n\n`;
        }
        if (pushes.length > 0) {
            resultText += `🤝 **Pushes:**\n${pushes.join("\n")}\n\n`;
        }
        if (losers.length > 0) {
            resultText += `💥 **Losers:**\n${losers.join("\n")}\n\n`;
        }
        resultText += `🏠 **Dealer:** ${gameData.dealer.score}${
            gameData.dealer.bust ? " (Bust)" : ""
        }`;

        // Add results to the final game embed
        finalGameEmbed.addFields({
            name: "🎊 Game Results 🪙",
            value: resultText,
            inline: false,
        });
        finalGameEmbed.setColor(0xffd700);

        await channel.send({ embeds: [finalGameEmbed] });
    }

    async startGameEarly(interaction, gameManager) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.creator !== interaction.user.id) {
            await interaction.reply({
                content: "Only the lobby creator can start the game!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.isDealer && lobby.players.length < 2) {
            await interaction.reply({
                content: "Need at least 2 players to start a dealer game!",
                ephemeral: true,
            });
            return true;
        }

        if (!lobby.isDealer && lobby.players.length < 1) {
            await interaction.reply({
                content: "Need at least 1 player to start!",
                ephemeral: true,
            });
            return true;
        }

        // Clear the countdown interval
        if (lobby.countdownInterval) {
            clearInterval(lobby.countdownInterval);
        }

        // Start the game immediately
        await this.startMultiplayerGame(interaction.channel, gameManager);
        return true;
    }

    sanitizeText(text) {
        if (!text) return "Unknown";
        // Prevent code injection by sanitizing all user input
        return String(text)
            .replace(/[<>@#&!\r\n\t]/g, "")
            .replace(/[^\x20-\x7E]/g, "")
            .substring(0, 50);
    }

    recordGameOutcome(gameData, winners, losers, pushes) {
        const gameStats = require('../gameStats');
        
        // Record outcome for each player
        for (const player of gameData.players) {
            let winnerId = null;
            if (winners.some(w => w.includes(player.name))) {
                winnerId = player.id;
            } else if (pushes.some(p => p.includes(player.name))) {
                winnerId = 'tie';
            } else {
                winnerId = 'dealer';
            }
            
            const outcomeData = {
                server_id: gameData.serverId || 'unknown',
                game_type: 'blackjack',
                player1_id: player.id,
                player1_name: player.name,
                player2_id: 'dealer',
                player2_name: 'Dealer',
                winner_id: winnerId,
                game_duration: gameData.startTime ? Math.floor((Date.now() - gameData.startTime) / 1000) : null,
                final_score: {
                    player_hand: player.score,
                    dealer_hand: gameData.dealer.score,
                    bet_amount: gameData.bets ? gameData.bets[player.id] : 0,
                    blackjack: player.blackjack || false
                },
                game_mode: gameData.isSinglePlayer ? 'single' : 'multiplayer'
            };
            
            gameStats.recordOutcome(outcomeData);
        }
    }
}

module.exports = new Blackjack();
